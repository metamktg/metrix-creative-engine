#!/usr/bin/env node
/*
 * Check a finished ad file. ffmpeg only; every spawn goes through media/probe.mjs.
 *
 *   node qa-video.mjs <ad.mp4> [--storyboard storyboard.json] [--timeline timeline.json]
 *                     [--exempt exemptions.json] [--poster ad.jpg] [--ratio 4:5] [--duration 12]
 *                     [--lufs -14] [--silent | --effects-only] [--min-shot 0.75]
 *
 * --storyboard supplies the ratio, duration, loudness target and silent or effects-only mode the
 * renderer used. Any explicit flag overrides it, and the output records where each value came from.
 *
 * Checks, each PASS, FAIL or EXEMPT (WARN for the cut cross-check only):
 *   format        width x height matches --ratio; duration within 0.1s of --duration
 *   audio         an audio stream exists (some upload paths reject files without one)
 *   audio.length  the audio runs within 0.06 s of the video stream (a mix that stops early fails)
 *   loudness      within 1 LU of --lufs; --silent: below -60 LUFS; --effects-only (no music bed):
 *                 at or under -16 LUFS with peaks at or under -1 dBFS
 *   poster        --poster matches frame 0 (SSIM >= 0.98): the thumbnail is the first frame
 *   colour        tagged limited-range BT.709, what phones and Meta assume
 *   black_frames  ffmpeg blackdetect on a 90x160 grey sample: FAIL any frame where over 30 % of
 *                 pixels sit under luma 10 of 255 (a clip that failed to decode). Same rule as the
 *                 LP-AI-01 check-dropped-video.py it replaces.
 *   freeze        media/scdet.mjs freezeCheck (freezedetect n=0.001 d=0.1, plus decoded frame count
 *                 and pts gaps). Deliberate holds come only from --timeline: shots with no source
 *                 clip (a composition: app demo, end card) may hold still. The threshold is never
 *                 lowered to make a hold pass. Without --timeline every freeze FAILs.
 *   short_shot    no shot under 0.75 s (owner rule). With --timeline the shots are the timeline's,
 *                 snapped to the frame each cut lands on; scdet is the cross-check. Without it the
 *                 shots come from scdet (threshold 10), which can miss a same-take punch-in.
 *   cuts.crosscheck  WARN when a timeline cut has no scdet cut within one frame, or scdet finds a
 *                 cut the timeline does not have. Never a FAIL: scdet under-detects punch-ins.
 *   transitions   no double exposure: no frame is a mid blend of two different shots. A full-frame
 *                 scan of the whole ad, never masked to cut edges (masking hid real defects).
 *   transitions.at_cuts  with --timeline, the stricter check at cuts only: at full frame rate,
 *                 the picture change must land within one frame of the timeline cut and no frame
 *                 in the two either side may be a blend (weights 0.1 to 0.9, against 0.2 to 0.8
 *                 for the full scan).
 *
 * The transition check samples at 15 fps. For each frame f it takes the shots
 * 0.4s either side (A, B) and fits f ~ a*A + b*B + c. Two different pictures
 * blended with both weights between 0.2 and 0.8 is a double exposure. A fade of
 * one picture (B predicted from A by gain and offset alone) and a dip through a
 * flat colour do not fit, so they are not counted.
 *
 * Exemptions (--exempt, schema mce.qaexempt/1):
 *   { "schema": "mce.qaexempt/1", "video_sha256": "<sha256 of the exact file under QA>",
 *     "exemptions": [{ "check": "transitions", "lo": 6.5, "hi": 6.7, "reason": "...",
 *                      "reviewer": "...", "still": "stills/6.60.png", "still_sha256": "..." }] }
 * An exemption must cite evidence: a still (path relative to the exemptions file) whose sha256
 * matches, a reviewer and a reason. It binds to the file's bytes. It covers an event only when the
 * event lies wholly inside [lo, hi] for the named check, and only interval checks can be exempted
 * (black_frames, freeze, short_shot, transitions, transitions.at_cuts). An exempted check reports
 * EXEMPT, never PASS, and keeps its raw measurement; the summary verdict is EXEMPT and lists every
 * exemption used. Exit 0 PASS or EXEMPT, 1 FAIL, 2 bad input.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveQaOptions } from "./qa-options.mjs";
import { MediaError, probe, runFfmpeg, runFfprobe } from "./media/probe.mjs";
import { cuts as scdetCuts, freezeCheck, shortShotGate } from "./media/scdet.mjs";
import { validateTimeline } from "./timeline/schema.mjs";

export const EXEMPT_SCHEMA = "mce.qaexempt/1";
export const EXEMPTABLE = ["black_frames", "freeze", "short_shot", "transitions", "transitions.at_cuts"];
export const BLACK = Object.freeze({ w: 90, h: 160, picTh: 0.3, pixTh: 10 / 255 });
const EPS = 1e-6;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export class InputError extends Error {}

// ---------------------------------------------------------------- pure helpers

/** blackdetect log text -> [{start,end,duration,open_at_eof?}]; a run reaching the last frame ends at duration. */
export function parseBlack(stderr, { duration, fps } = {}) {
  const out = [];
  for (const m of String(stderr).matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/g)) {
    const start = Number(m[1]);
    let end = Number(m[2]);
    const ev = { start: r6(start), end: r6(end) };
    // blackdetect closes a run still open at EOF on the last frame's pts, one frame short.
    if (Number.isFinite(duration) && Number.isFinite(fps) && end >= duration - 1.5 / fps) { end = duration; ev.end = r6(end); ev.open_at_eof = true; }
    ev.duration = r6(end - start);
    out.push(ev);
  }
  return out;
}

/** First frame index of a cut at time t on an fps grid: the frame that starts at or after t. */
// A thousandth of a frame of slack, so a time already snapped and rounded to 1e-6 s stays on its frame.
export const cutFrame = (t, fps) => Math.ceil(t * fps - 1e-3);
export const snapToFrame = (t, fps) => r6(cutFrame(t, fps) / fps);

/**
 * Timeline facts the QA uses, on the master's frame grid:
 *   cuts   every shot boundary inside the ad (snapped to the frame it lands on)
 *   shots  [{id, from, to, len, source}] tiling 0..duration
 *   holds  [{from, to, shot}] for shots with no source clip (compositions may hold still);
 *          widened by half a frame so a freeze edge on the boundary frame still counts as inside
 */
export function timelineFacts(tl, { fps, duration }) {
  const errs = validateTimeline(tl);
  if (errs.length) throw new InputError(`--timeline is not a valid mce.timeline/1: ${errs.slice(0, 5).join("; ")}`);
  const end = Number.isFinite(duration) ? duration : tl.duration;
  const shots = tl.shots.map((s, i) => {
    const from = i === 0 ? 0 : snapToFrame(s.out_in, fps);
    const to = i === tl.shots.length - 1 ? end : snapToFrame(s.out_out, fps);
    return { id: s.id, label: s.label, source: s.source, from: r6(from), to: r6(to), len: r6(to - from) };
  });
  const cuts = shots.slice(1).map((s) => s.from);
  const half = 0.5 / fps;
  const holds = shots.filter((s) => s.source === null).map((s) => ({ from: r6(Math.max(0, s.from - half)), to: r6(s.to + half), shot: s.id }));
  return { cuts, shots, holds };
}

/** Compare timeline cuts with scdet cuts at a tolerance of one frame. */
export function crossCheck(timelineCuts, detected, fps) {
  const tol = 1 / fps + EPS;
  const missing = timelineCuts.filter((t) => !detected.some((d) => Math.abs(d - t) <= tol));
  const unexpected = detected.filter((d) => !timelineCuts.some((t) => Math.abs(d - t) <= tol));
  return { missing, unexpected };
}

/**
 * Validate an exemptions file and its evidence. readFile(path) -> Buffer (injectable for tests).
 * Throws InputError naming the first problem; returns the exemptions.
 */
export function loadExemptions(doc, { baseDir, videoSha256, readFile = (p) => fs.readFileSync(p) }) {
  if (!doc || doc.schema !== EXEMPT_SCHEMA) throw new InputError(`exemptions: schema must be "${EXEMPT_SCHEMA}"`);
  if (!/^[0-9a-f]{64}$/.test(String(doc.video_sha256 || ""))) throw new InputError("exemptions: video_sha256 (the sha256 of the file under QA) is required");
  if (doc.video_sha256 !== videoSha256) throw new InputError(`exemptions: video_sha256 ${doc.video_sha256.slice(0, 12)}... does not match the file under QA (${videoSha256.slice(0, 12)}...); exemptions bind to exact bytes`);
  if (!Array.isArray(doc.exemptions) || !doc.exemptions.length) throw new InputError("exemptions: exemptions[] is empty");
  return doc.exemptions.map((e, i) => {
    const at = `exemptions[${i}]`;
    if (!EXEMPTABLE.includes(e.check)) throw new InputError(`${at}.check: "${e.check}" cannot be exempted; only ${EXEMPTABLE.join(", ")}`);
    if (!(Number.isFinite(e.lo) && Number.isFinite(e.hi) && e.lo >= 0 && e.hi > e.lo)) throw new InputError(`${at}: lo and hi must be numbers with 0 <= lo < hi`);
    for (const k of ["reason", "reviewer"]) if (typeof e[k] !== "string" || !e[k].trim()) throw new InputError(`${at}.${k}: required (an exemption must say why and who looked)`);
    if (typeof e.still !== "string" || !e.still) throw new InputError(`${at}.still: required (the still that shows the frame is clean)`);
    if (!/^[0-9a-f]{64}$/.test(String(e.still_sha256 || ""))) throw new InputError(`${at}.still_sha256: required`);
    const still = path.resolve(baseDir, e.still);
    let bytes;
    try { bytes = readFile(still); } catch { throw new InputError(`${at}.still: cannot read ${still}`); }
    const got = sha256(bytes);
    if (got !== e.still_sha256) throw new InputError(`${at}.still_sha256: ${still} hashes to ${got}, not ${e.still_sha256}`);
    return { check: e.check, lo: e.lo, hi: e.hi, reason: e.reason, reviewer: e.reviewer, still: e.still, still_sha256: e.still_sha256 };
  });
}

/**
 * Apply exemptions to one interval check. events: [{start,end,...}]. Returns the verdict:
 * PASS when there are no events, EXEMPT when every event lies inside an exemption for this check,
 * else FAIL. The raw events are kept either way.
 */
export function judge(check, events, exemptions = []) {
  if (!events.length) return { verdict: "PASS", events, exempted: [], open: [] };
  const mine = exemptions.filter((e) => e.check === check);
  const exempted = [];
  const open = [];
  for (const ev of events) {
    const by = mine.find((e) => ev.start >= e.lo - EPS && ev.end <= e.hi + EPS);
    if (by) exempted.push({ ...ev, by: { lo: by.lo, hi: by.hi, reason: by.reason, reviewer: by.reviewer, still: by.still, still_sha256: by.still_sha256 } });
    else open.push(ev);
  }
  return { verdict: open.length ? "FAIL" : "EXEMPT", events, exempted, open };
}

/** Summary verdict: any FAIL fails; else any EXEMPT is EXEMPT (never PASS); else PASS. */
export function summarize(results) {
  if (results.some((r) => r.verdict === "FAIL")) return "FAIL";
  if (results.some((r) => r.verdict === "EXEMPT")) return "EXEMPT";
  return "PASS";
}

// ---- double-exposure maths (unchanged from the full scan; the at-cuts check widens the weights)
const rms = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s / a.length); };
const mean = (a) => { let m = 0; for (let k = 0; k < a.length; k++) m += a[k]; return m / a.length; };
const std = (a) => { const m = mean(a); let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - m) ** 2; return Math.sqrt(s / a.length); };
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let k = 0; k < a.length; k++) { const x = a[k] - ma, y = b[k] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 1;
};
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
function fit(f, A, B) {
  const L = f.length;
  let saa = 0, sbb = 0, sab = 0, sa = 0, sb = 0, sfa = 0, sfb = 0, sf = 0;
  for (let k = 0; k < L; k++) { const a = A[k], b = B[k], y = f[k]; saa += a * a; sbb += b * b; sab += a * b; sa += a; sb += b; sfa += y * a; sfb += y * b; sf += y; }
  const M = [[saa, sab, sa], [sab, sbb, sb], [sa, sb, L]], r = [sfa, sfb, sf], D = det3(M);
  if (Math.abs(D) < 1e-6) return null;
  const [a, b] = [0, 1].map((j) => det3(M.map((row, i) => row.map((x, k) => (k === j ? r[i] : x)))) / D);
  const c = det3(M.map((row, i) => row.map((x, k) => (k === 2 ? r[i] : x)))) / D;
  let res = 0;
  for (let k = 0; k < L; k++) res += (f[k] - (a * A[k] + b * B[k] + c)) ** 2;
  return { a, b, res: Math.sqrt(res / L) };
}
export function blended(f, A, B, band = false, { wmin = 0.2, wmax = 0.8 } = {}) {
  // One picture held or pushed in: A and B barely differ, relative to contrast.
  if (rms(A, B) < Math.max(6, 0.45 * Math.min(std(A), std(B)))) return false;
  // Inside a band a pan or push-in also looks like a blend of the frames either
  // side of it. A camera move keeps the band's picture correlated with itself;
  // a dissolve between two different screens does not. So a band must show two
  // clearly different pictures before it can count.
  // A band where either shot is empty (flat ground) cannot hold two pictures.
  if (band && Math.min(std(A), std(B)) < 8) return false;
  if (band && (corr(A, B) > 0.45 || rms(A, B) < Math.max(12, 0.7 * Math.min(std(A), std(B))))) return false;
  // One picture fading: B is predicted from A by gain and offset alone.
  const r = corr(A, B), sb = std(B);
  if (sb * Math.sqrt(Math.max(0, 1 - r * r)) < 0.2 * sb + 2) return false;
  const p = fit(f, A, B);
  if (!p || p.a < wmin || p.b < wmin || p.a > wmax || p.b > wmax || p.a + p.b < 0.7 || p.a + p.b > 1.3) return false;
  if (!(p.res < 0.35 * Math.min(rms(f, A), rms(f, B)) && p.res < 0.25 * std(f) + 4)) return false;
  // A frame mid-dip is one picture at reduced strength: it fits A alone, or B
  // alone, with gain and offset almost perfectly. A double exposure needs both.
  const single = (X) => std(f) * Math.sqrt(Math.max(0, 1 - corr(f, X) ** 2));
  return p.res < 0.6 * Math.min(single(A), single(B));
}

/** Regions: the whole frame, then bands a third of the height, overlapping by half. */
export function regionsFor(H) {
  const regions = [[0, H]];
  const bh = Math.max(4, Math.round(H / 3)), step = Math.max(2, Math.round(bh / 2));
  for (let r0 = 0; r0 + bh <= H; r0 += step) regions.push([r0, r0 + bh]);
  return regions;
}

/**
 * Pure: the stricter check at one cut. frames(i) returns grey frame i (W x H) at full rate; k is
 * the first frame of the incoming shot. Returns null when clean, else an event naming the problem.
 */
export function cutEvent(frames, k, n, fps, W, H) {
  if (k - 3 < 0 || k + 2 >= n) return null;
  const regions = regionsFor(H);
  const cut = (a, [r0, r1]) => a.subarray(r0 * W, r1 * W);
  const steps = [];
  for (let i = k - 2; i <= k + 2; i++) steps.push({ i, d: rms(frames(i - 1), frames(i)) });
  const best = steps.reduce((a, b) => (b.d > a.d ? b : a));
  const others = steps.filter((s) => s.i !== best.i).map((s) => s.d).sort((a, b) => a - b);
  const median = (others[1] + others[2]) / 2;
  const t = r6(k / fps);
  if (Math.abs(best.i - k) > 1 || !(best.d > 2 * median + 1)) {
    return { start: t, end: t, cut: t, problem: `no hard cut within one frame of ${t.toFixed(3)} s (largest change at frame ${best.i}, ${best.d.toFixed(1)} against a median of ${median.toFixed(1)})` };
  }
  const A = frames(k - 3), B = frames(k + 2);
  for (let i = k - 2; i <= k + 1; i++) {
    if (regions.some((g, j) => blended(cut(frames(i), g), cut(A, g), cut(B, g), j > 0, { wmin: 0.1, wmax: 0.9 }))) {
      return { start: r6(i / fps), end: r6(i / fps), cut: t, problem: `frame ${i} is a blend of the shots either side of the cut at ${t.toFixed(3)} s` };
    }
  }
  return null;
}

// ---------------------------------------------------------------- spawning

/** Grey frames as one Buffer of W x H frames, resampled to fps, or every decoded frame when fps is omitted. */
function greyFrames(file, { w, h, fps }) {
  const vf = fps ? `fps=${fps},scale=${w}:${h},format=gray` : `scale=${w}:${h},format=gray`;
  const r = runFfmpeg(["-v", "error", "-i", file, "-map", "0:v:0", "-vf", vf, ...(fps ? [] : ["-fps_mode", "passthrough"]), "-f", "rawvideo", "-"], { encoding: "buffer", maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new MediaError("UNREADABLE", `cannot decode ${file}: ${String(r.stderr).slice(-300)}`);
  return r.stdout;
}

// ---------------------------------------------------------------- CLI

function main(argv) {
  const valued = ["--storyboard", "--timeline", "--exempt", "--poster", "--ratio", "--duration", "--lufs", "--min-shot"];
  const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const v = argv.find((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1]));
  if (!v) { console.error("usage: qa-video.mjs <ad.mp4> [--storyboard sb.json] [--timeline timeline.json] [--exempt exemptions.json] [--poster p.jpg] ..."); return 2; }
  const results = [];
  const add = (check, ok, detail, extra = {}) => results.push({ check, verdict: ok ? "PASS" : "FAIL", detail, ...extra });

  let facts;
  try { facts = probe(v); } catch (e) { console.error(`qa-video: ${e.code || ""} ${e.message}`); return 2; }
  const vs = facts.video;
  if (!vs) { console.error(`qa-video: ${v} has no video stream`); return 2; }
  const dur = facts.format.duration ?? vs.duration;

  let storyboard = null;
  const sbPath = flag("--storyboard");
  if (sbPath) {
    try { storyboard = JSON.parse(fs.readFileSync(sbPath, "utf8")); }
    catch (e) { console.error(`qa-video: cannot read --storyboard ${sbPath}: ${e.message}`); return 2; }
  }
  let opts;
  try { opts = resolveQaOptions(argv, storyboard); }
  catch (e) { console.error(`qa-video: ${e.message}`); return 2; }

  const videoSha = sha256(fs.readFileSync(v));
  let timeline = null, exemptions = [], exemptFile = null;
  try {
    const tlPath = flag("--timeline");
    if (tlPath) {
      let text;
      try { text = fs.readFileSync(tlPath); } catch (e) { throw new InputError(`cannot read --timeline ${tlPath}: ${e.message}`); }
      let tl;
      try { tl = JSON.parse(text.toString("utf8")); } catch (e) { throw new InputError(`--timeline ${tlPath} is not JSON: ${e.message}`); }
      timeline = { path: tlPath, sha256: sha256(text), ...timelineFacts(tl, { fps: vs.fps, duration: vs.duration ?? dur }) };
    }
    const exPath = flag("--exempt");
    if (exPath) {
      let text;
      try { text = fs.readFileSync(exPath); } catch (e) { throw new InputError(`cannot read --exempt ${exPath}: ${e.message}`); }
      let doc;
      try { doc = JSON.parse(text.toString("utf8")); } catch (e) { throw new InputError(`--exempt ${exPath} is not JSON: ${e.message}`); }
      exemptions = loadExemptions(doc, { baseDir: path.dirname(path.resolve(exPath)), videoSha256: videoSha });
      exemptFile = { path: exPath, sha256: sha256(text) };
    }
  } catch (e) {
    if (e instanceof InputError) { console.error(`qa-video: ${e.message}`); return 2; }
    throw e;
  }
  const interval = (check, events, detailFor) => {
    const j = judge(check, events, exemptions);
    results.push({ check, verdict: j.verdict, detail: detailFor(j), measured: events, ...(j.exempted.length ? { exempted: j.exempted } : {}) });
  };
  const span = (e) => `${e.start.toFixed(2)}-${e.end.toFixed(2)}s`;

  const ratio = opts.ratio;
  if (ratio) {
    const [a, b] = ratio.split(":").map(Number);
    add("format.ratio", Math.abs(vs.w / vs.h - a / b) < 0.003, `${vs.w}x${vs.h}, wanted ${ratio}`);
  }
  const want = opts.duration;
  if (want) add("format.duration", Math.abs(dur - +want) <= 0.1, `${dur.toFixed(3)}s, wanted ${want}s`);
  add("audio", Boolean(facts.audio), "audio stream present");
  // The audio must run as long as the picture. A mix that stops early (the pre-2026-11-06 sidechain
  // graph cut it at the voice's last sample) passes the container check above, so measure streams.
  const as = facts.audio;
  if (as && Number.isFinite(vs.duration) && Number.isFinite(as.duration)) {
    const gap = vs.duration - as.duration;
    add("audio.length", Math.abs(gap) <= 0.06, `audio ${as.duration.toFixed(3)}s, video ${vs.duration.toFixed(3)}s`);
  }

  const er = runFfmpeg(["-v", "info", "-i", v, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
  const I = parseFloat(([...er.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1) || [])[1]);
  const P = parseFloat(([...er.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1) || [])[1]);
  if (opts.mode === "silent") add("loudness", !(I > -60), `${I} LUFS, silent mix expected`);
  else if (opts.mode === "effects-only") add("loudness", I <= -16 && !(P > -1), `${I} LUFS, peak ${P} dBFS; effects-only mix must sit at or under -16 LUFS with peaks at or under -1 dBFS`);
  else { const t = opts.lufs; add("loudness", Math.abs(I - t) <= 1, `${I} LUFS, target ${t} +/- 1 (${opts.sources.lufs})`); }

  const poster = flag("--poster");
  if (poster) {
    // Through rgb24 first, so a full-range JPEG and a limited-range video are
    // compared on the same scale (straight to gray skips the range conversion).
    const s = runFfmpeg(["-i", v, "-i", poster, "-lavfi", `[0:v]select=eq(n\\,0),format=rgb24,format=gray[a];[1:v]scale=${vs.w}:${vs.h},format=rgb24,format=gray[b];[a][b]ssim`, "-frames:v", "1", "-f", "null", "-"]).stderr.match(/All:([\d.]+)/);
    const ss = s ? +s[1] : 0;
    add("poster", ss >= 0.98, `poster vs frame 0 SSIM ${ss.toFixed(4)}`);
  }
  // probe() does not carry colour tags; read them through the same ffprobe spawner.
  const col = JSON.parse(runFfprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_range,color_space", "-of", "json", v]).stdout || "{}").streams?.[0] || {};
  add("colour", col.color_range === "tv" && col.color_space === "bt709", `${vs.pix_fmt}, range ${col.color_range}, matrix ${col.color_space}`);

  // ---- black frames
  const bd = runFfmpeg(["-i", v, "-map", "0:v:0", "-vf", `scale=${BLACK.w}:${BLACK.h},format=gray,blackdetect=d=0:pic_th=${BLACK.picTh}:pix_th=${BLACK.pixTh.toFixed(6)}`, "-f", "null", "-"]);
  if (bd.status !== 0) { console.error(`qa-video: blackdetect failed: ${String(bd.stderr).slice(-300)}`); return 2; }
  interval("black_frames", parseBlack(bd.stderr, { duration: vs.duration ?? dur, fps: vs.fps }), (j) =>
    j.events.length ? `${j.events.length} run(s) with over ${BLACK.picTh * 100} % of pixels under luma 10 at ${j.events.map(span).join(", ")}${j.verdict === "EXEMPT" ? " (all exempted)" : ""}` : "no mostly-black frames");

  // ---- freeze and dropped frames
  const fz = freezeCheck(v, { allow: timeline ? timeline.holds : [] });
  const fzEvents = fz.freezes.filter((f) => !f.allowed).map((f) => ({ start: f.start, end: f.end, duration: f.duration, ...(f.open_at_eof ? { open_at_eof: true } : {}) }));
  const held = fz.freezes.filter((f) => f.allowed);
  {
    const j = judge("freeze", fzEvents, exemptions);
    const verdict = fz.frames.verdict === "FAIL" ? "FAIL" : j.verdict;
    const parts = [fzEvents.length ? `freeze at ${fzEvents.map(span).join(", ")}${j.verdict === "EXEMPT" ? " (exempted)" : ""}` : "no freeze outside holds"];
    if (held.length) parts.push(`${held.length} freeze(s) inside timeline holds (${timeline.holds.map((h) => h.shot).join(", ")})`);
    if (!timeline) parts.push("no --timeline, so no hold ranges");
    parts.push(`frames decoded ${fz.frames.decoded}, expected ${fz.frames.expected}, pts gaps ${fz.frames.gaps.length}`);
    results.push({ check: "freeze", verdict, detail: parts.join("; "), measured: { freezes: fz.freezes, frames: fz.frames, noise: fz.noise, min_freeze: fz.min_freeze }, ...(j.exempted.length ? { exempted: j.exempted } : {}) });
  }

  // ---- shots
  const sc = scdetCuts(v);
  const shots = timeline ? timeline.shots : sc.shots;
  let gate;
  try { gate = shortShotGate(shots, { minShot: flag("--min-shot") }); } catch (e) { console.error(`qa-video: ${e.message}`); return 2; }
  interval("short_shot", gate.short.map((s) => ({ start: s.from, end: s.to, len: s.len, ...(s.id ? { shot: s.id } : {}) })), (j) =>
    `${shots.length} shots from ${timeline ? "the timeline" : `scdet threshold ${sc.threshold}`}${j.events.length ? `; under ${gate.min_shot} s: ${j.events.map((e) => `${span(e)} (${e.len.toFixed(3)} s)`).join(", ")}` : `, none under ${gate.min_shot} s`}`);
  if (timeline) {
    const x = crossCheck(timeline.cuts, sc.cuts, vs.fps);
    const ok = !x.missing.length && !x.unexpected.length;
    const detail = ok ? `scdet agrees with all ${timeline.cuts.length} timeline cuts` : [
      x.missing.length ? `timeline cuts scdet did not see: ${x.missing.map((t) => t.toFixed(3)).join(", ")}` : "",
      x.unexpected.length ? `scdet cuts not in the timeline: ${x.unexpected.map((t) => t.toFixed(3)).join(", ")}` : "",
    ].filter(Boolean).join("; ");
    results.push({ check: "cuts.crosscheck", verdict: ok ? "PASS" : "WARN", detail, measured: { timeline: timeline.cuts, scdet: sc.cuts, threshold: sc.threshold } });
  }

  // ---- transitions (full frame, unmasked)
  const FPS = 15, W = 48, H = Math.round((W * vs.h) / vs.w / 2) * 2, N = W * H;
  const raw = greyFrames(v, { w: W, h: H, fps: FPS });
  const n = Math.floor(raw.length / N);
  const fr = (i) => raw.subarray(i * N, (i + 1) * N);
  const regions = regionsFor(H);
  const cut = (a, [r0, r1]) => a.subarray(r0 * W, r1 * W);
  const OFF = Math.round(0.4 * FPS), hits = [];
  for (let i = OFF; i < n - OFF; i++) {
    const f = fr(i), A = fr(i - OFF), B = fr(i + OFF);
    if (regions.some((g, j) => blended(cut(f, g), cut(A, g), cut(B, g), j > 0))) hits.push(i / FPS);
  }
  const events = [];
  for (const t of hits) { const e = events.at(-1); if (e && t - e[1] <= 2 / FPS + 1e-6) e[1] = t; else events.push([t, t]); }
  interval("transitions", events.map(([a, b]) => ({ start: r6(a), end: r6(b) })), (j) =>
    j.events.length ? `double exposure at ${j.events.map(span).join(", ")}${j.verdict === "EXEMPT" ? " (all exempted)" : "; dip through the background instead"}` : "no double exposures");

  // ---- stricter check at the timeline's cuts only
  if (timeline) {
    const full = greyFrames(v, { w: W, h: H });
    const nf = Math.floor(full.length / N);
    const ff = (i) => full.subarray(i * N, (i + 1) * N);
    const ev = timeline.cuts.map((t) => cutEvent(ff, cutFrame(t, vs.fps), nf, vs.fps, W, H)).filter(Boolean);
    interval("transitions.at_cuts", ev, (j) => (j.events.length ? j.events.map((e) => e.problem).join("; ") : `${timeline.cuts.length} hard cuts, each within one frame of the timeline, no blended frame`));
  }

  const verdict = summarize(results);
  const used = results.flatMap((r) => (r.exempted || []).map((e) => ({ check: r.check, start: e.start, end: e.end, ...e.by })));
  const report = {
    file: v, sha256: videoSha, verdict,
    options: { ratio: opts.ratio, duration: opts.duration, mode: opts.mode, lufs: opts.lufs, sources: opts.sources, notes: opts.notes },
    ...(timeline ? { timeline: { path: timeline.path, sha256: timeline.sha256, cuts: timeline.cuts, holds: timeline.holds } } : {}),
    ...(exemptFile ? { exemptions: { ...exemptFile, used, unused: exemptions.filter((e) => !used.some((u) => u.check === e.check && u.lo === e.lo && u.hi === e.hi)) } } : {}),
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  return verdict === "FAIL" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
