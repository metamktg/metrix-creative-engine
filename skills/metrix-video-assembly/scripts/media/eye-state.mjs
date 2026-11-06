#!/usr/bin/env node
/*
 * Automated eye-state gate: MediaPipe Face Landmarker blendshapes (eyeBlinkLeft, eyeBlinkRight)
 * per decoded source frame, judged against the kept ranges of a clip.
 *
 *   scoreClip(clip, {out, python?, model?, width?})  -> mce.eyestate/1 record (spawns eye_state.py)
 *   eyeState(clip, {scores?, out?, ...})              -> the record: reads `scores` (path or object) when
 *                                                       given, else scores the clip when the 3.12 venv is
 *                                                       found, else throws NOSCORES
 *   closures(frames, {close, open})                    -> [{from, to, n0, n1, frames, peak}]   pure
 *   eyeGate(record, {ranges, cuts?, close?, open?, edgeFrames?, noFace?}) -> {verdict, findings, ...} pure
 *   rangesFromShots(shots, file)                       -> kept source ranges of one clip from timeline shots[]
 *
 * A closure is a run of frames where BOTH blink scores reach `open`, holding at least one frame
 * where both reach `close` (hysteresis: the core proves the lids shut, the run carries the
 * half-lidded onset and recovery frames a viewer also sees). Verdicts, per kept range [from, to)
 * of source time (the same from <= t < to selection as eye-sheet.mjs planRange):
 *   FAIL edge_closure   a closure frame is among the first or last edgeFrames frames of the range
 *   FAIL cut_closure    a closure frame is within edgeFrames frames of a cut (source time) inside it
 *   WARN mid_closure    a closure inside the range away from its edges and cuts
 *   FAIL unscored       a frame of the range has no score (wrong record, or a range past the clip end)
 *   FAIL/WARN no_face   frames with no face: FAIL at an edge (eye state unknown where it matters;
 *                       noFace:'warn' for shots where the face legitimately leaves), WARN mid-range
 * The verdict is the worst finding; PASS when there is none.
 *
 * Thresholds were calibrated on the takes of a past AI UGC run (v19 S3H 0.44 to 0.64, v17 S1 1.44 to 1.74,
 * v16 S3 4.69 to 4.92 source seconds); the calibration and its precision are in the W1-G report
 * and in src/__tests__/fixtures/eye-state/calibration.json.
 *
 * The scorer is Python because MediaPipe is: it runs from the interpreter in MCE_PY312, or the
 * venv312 entry of INSTALLED.json (MCE_INSTALLED, default X:/Metrix/tools/INSTALLED.json). CI has
 * neither; the tests read a committed scores fixture.
 *
 * CLI: node eye-state.mjs <clip> (--scores s.json | --out s.json) --range a-b [--range c-d]...
 *      [--cut t]... [--close 0.4] [--open 0.3] [--edge-frames N] [--no-face warn] [--json]
 *      Exit 0 PASS or WARN, 1 FAIL, 2 error.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaError } from "./probe.mjs";

export const SCHEMA = "mce.eyestate/1";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPT = path.join(HERE, "eye_state.py");

/*
 * Calibrated on the takes of a past AI UGC run (scores from eye_state.py, MediaPipe 1.1.1, face_landmarker
 * float16/1, full 1080x1920 frames). Level = the weaker eye's eyeBlink score. Frames two or more
 * frames away from any closure stay at or under 0.19; the lowest closure peak, a closure confirmed
 * on an eye-crop sheet (v16 S3 0.40 to 0.60), is 0.51; the recorded closures peak at 0.67 to 0.81.
 * close 0.4 sits between the two populations. open 0.3 carries the half-lidded frames the owner
 * recorded as part of a window (v19 S3H 0.68, "half-lidded to 0.68", level 0.40) and stays above
 * the 0.29 a half-lid between two closures reaches. Edge 0.12 s is 3 frames at 25 fps, 4 at 30:
 * the owner-passed v19 master cuts to the S1 punch-in 5 frames after the last closed frame of the
 * 1.44 s blink (closure ends 1.64, cut at source 1.829), and v19 starts the smirk take 4 frames
 * after its closure (ends 0.68, first kept frame 0.84); 0.2 s (5 frames) would FAIL that passed
 * punch-in, 3 frames keeps one frame of margin and still catches a closure in a shot's first 3 frames.
 */
export const DEFAULTS = Object.freeze({ close: 0.4, open: 0.3, edgeSeconds: 0.12, noFace: "fail" });

const worst = (a, b) => (a === "FAIL" || b === "FAIL" ? "FAIL" : a === "WARN" || b === "WARN" ? "WARN" : "PASS");
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** Validate an mce.eyestate/1 record (object or JSON path) and return it with frames sorted by t. */
export function loadEyeState(src) {
  const v = typeof src === "string" ? JSON.parse(fs.readFileSync(src, "utf8")) : src;
  if (!v || v.schema !== SCHEMA) throw new MediaError("BADARG", `scores must be a ${SCHEMA} record`);
  if (!Number.isFinite(v.fps) || v.fps <= 0) throw new MediaError("BADARG", "eye state record needs a positive fps");
  if (!Array.isArray(v.frames) || !v.frames.length) throw new MediaError("BADARG", "eye state record has no frames");
  for (const f of v.frames) {
    if (!Number.isFinite(f?.t) || typeof f.face_found !== "boolean") throw new MediaError("BADARG", "each frame needs a numeric t and a boolean face_found");
    if (f.face_found && !(Number.isFinite(f.eyeBlinkLeft) && Number.isFinite(f.eyeBlinkRight))) throw new MediaError("BADARG", `frame at ${f.t} has a face but no blink scores`);
  }
  return { ...v, frames: [...v.frames].sort((a, b) => a.t - b.t) };
}

/** Pure: both-eye level of a frame (the weaker eye), or null without a face. */
export const level = (f) => (f.face_found ? Math.min(f.eyeBlinkLeft, f.eyeBlinkRight) : null);

/** Pure: closure runs with hysteresis. frames are mce.eyestate/1 frames in time order. */
export function closures(frames, { close = DEFAULTS.close, open = DEFAULTS.open } = {}) {
  if (!(open > 0 && close >= open && close <= 1)) throw new MediaError("BADARG", `need 0 < open <= close <= 1, got open ${open} close ${close}`);
  const out = [];
  let i = 0;
  while (i < frames.length) {
    if ((level(frames[i]) ?? -1) < open) { i++; continue; }
    let j = i;
    while (j + 1 < frames.length && (level(frames[j + 1]) ?? -1) >= open) j++;
    const run = frames.slice(i, j + 1);
    const peak = run.reduce((b, f) => (level(f) > level(b) ? f : b));
    if (level(peak) >= close) {
      out.push({
        from: run[0].t, to: run[run.length - 1].t, n0: i, n1: j, frames: run.length,
        peak: { t: peak.t, left: peak.eyeBlinkLeft, right: peak.eyeBlinkRight, level: level(peak) },
      });
    }
    i = j + 1;
  }
  return out;
}

const fmt = (x) => x.toFixed(2);

/** Pure: judge closures against kept source ranges (and optional cuts inside them). */
export function eyeGate(record, opts = {}) {
  const { ranges, cuts = [], close = DEFAULTS.close, open = DEFAULTS.open, noFace = DEFAULTS.noFace } = opts;
  const rec = loadEyeState(record);
  if (!Array.isArray(ranges) || !ranges.length) throw new MediaError("BADARG", "eyeGate needs ranges [{from, to}]");
  if (noFace !== "fail" && noFace !== "warn") throw new MediaError("BADARG", `noFace must be 'fail' or 'warn', got ${noFace}`);
  const fps = rec.fps;
  const edgeFrames = opts.edgeFrames ?? Math.max(1, Math.round(DEFAULTS.edgeSeconds * fps));
  if (!Number.isInteger(edgeFrames) || edgeFrames < 1) throw new MediaError("BADARG", `edgeFrames must be a positive integer, got ${edgeFrames}`);
  const frames = rec.frames;
  const all = closures(frames, { close, open });
  const closedAt = new Map();
  all.forEach((c, k) => { for (let n = c.n0; n <= c.n1; n++) closedAt.set(n, k); });
  const half = 0.5 / fps;
  const lastT = frames[frames.length - 1].t;

  const findings = [];
  const out = ranges.map((r, ri) => {
    const id = r.id ?? `range${ri}`;
    if (!(Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from)) throw new MediaError("BADARG", `range ${id} needs numeric from < to`);
    const own = [];
    const add = (f) => { own.push(f); findings.push(f); };
    // Kept frames: from <= t < to, the eye-sheet planRange selection.
    const idx = [];
    frames.forEach((f, n) => { if (f.t >= r.from - 1e-9 && f.t < r.to - 1e-9) idx.push(n); });
    // A range must be covered by the record: its last frame must reach to - 1 frame.
    const nominal = Math.round((r.to - r.from) * fps);
    if (r.to > lastT + 1.5 / fps || idx.length < nominal - 1) {
      add({ severity: "FAIL", rule: "unscored", range: id, message: `range ${id} ${fmt(r.from)} to ${fmt(r.to)}: ${idx.length} scored frames of about ${nominal} (record ends at ${fmt(lastT)})` });
    }
    if (!idx.length) return { id, from: r.from, to: r.to, frames: 0, verdict: "FAIL", findings: own };
    const pos = new Map(idx.map((n, k) => [n, k]));
    const head = new Set(idx.slice(0, edgeFrames));
    const tail = new Set(idx.slice(-edgeFrames));
    const rangeCuts = cuts.filter((c) => c > r.from + 1e-9 && c < r.to - 1e-9);
    const nearCut = (n) => rangeCuts.find((c) => {
      // frames on either side of the cut: the last edgeFrames before it and the first edgeFrames from it
      const t = frames[n].t;
      return (t < c && t >= c - edgeFrames / fps - half) || (t >= c - 1e-9 && t < c + edgeFrames / fps - half);
    });

    // Closures touching the range.
    const seen = new Set();
    for (const n of idx) {
      const k = closedAt.get(n);
      if (k == null || seen.has(k)) continue;
      seen.add(k);
      const c = all[k];
      const inside = idx.filter((m) => closedAt.get(m) === k);
      const atHead = inside.some((m) => head.has(m));
      const atTail = inside.some((m) => tail.has(m));
      const cut = inside.map(nearCut).find((x) => x != null);
      const closure = { from: c.from, to: c.to, frames: c.frames, kept_frames: inside.length, peak: c.peak };
      const where = `closure ${fmt(c.from)} to ${fmt(c.to)} (peak ${c.peak.level.toFixed(2)} at ${fmt(c.peak.t)})`;
      if (atHead || atTail) {
        const edge = atHead && atTail ? "head+tail" : atHead ? "head" : "tail";
        const k0 = Math.min(...inside.map((m) => pos.get(m)));
        add({ severity: "FAIL", rule: "edge_closure", range: id, edge, closure, message: `range ${id}: ${where} within the ${edge} ${edgeFrames} frames (first closed kept frame is #${k0 + 1} of ${idx.length})` });
      } else if (cut != null) {
        add({ severity: "FAIL", rule: "cut_closure", range: id, cut, closure, message: `range ${id}: ${where} within ${edgeFrames} frames of the cut at ${fmt(cut)}` });
      } else {
        add({ severity: "WARN", rule: "mid_closure", range: id, closure, message: `range ${id}: ${where} mid-range; check it on the eye sheet` });
      }
    }

    // Frames without a face, as runs.
    const blind = idx.filter((n) => !frames[n].face_found);
    for (let a = 0; a < blind.length;) {
      let b = a;
      while (b + 1 < blind.length && blind[b + 1] === blind[b] + 1) b++;
      const run = blind.slice(a, b + 1);
      const atEdge = run.some((n) => head.has(n) || tail.has(n) || nearCut(n) != null);
      add({ severity: atEdge ? (noFace === "fail" ? "FAIL" : "WARN") : "WARN", rule: "no_face", range: id, from: frames[run[0]].t, to: frames[run[run.length - 1]].t,
        message: `range ${id}: no face in ${run.length} frame(s) ${fmt(frames[run[0]].t)} to ${fmt(frames[run[run.length - 1]].t)}${atEdge ? " at an edge or cut, eye state unknown there" : ""}` });
      a = b + 1;
    }
    return { id, from: r.from, to: r.to, frames: idx.length, verdict: own.reduce((v, f) => worst(v, f.severity), "PASS"), findings: own };
  });

  return {
    schema: "mce.eyegate/1",
    verdict: findings.reduce((v, f) => worst(v, f.severity), "PASS"),
    thresholds: { close, open, edge_frames: edgeFrames, no_face: noFace },
    fps,
    clip: rec.clip ?? null,
    clip_sha256: rec.clip_sha256 ?? null,
    closures: all.map(({ n0: _a, n1: _b, ...c }) => c),
    ranges: out,
    findings,
  };
}

/** Pure: the kept source ranges of one clip from timeline shots[] (mce.timeline/1), with ids. */
export function rangesFromShots(shots, file) {
  const want = path.resolve(file);
  return (shots || [])
    .filter((s) => s.file && path.resolve(s.file) === want)
    .map((s) => ({ id: s.id, from: s.src_in, to: s.src_out }));
}

/** Find the 3.12 interpreter: MCE_PY312, else INSTALLED.json's venv312 entry. null when absent. */
export function resolvePython(env = process.env) {
  const exists = (p) => p && fs.existsSync(p) ? p : null;
  if (env.MCE_PY312) return exists(env.MCE_PY312);
  const installed = env.MCE_INSTALLED || "X:/Metrix/tools/INSTALLED.json";
  try {
    const j = JSON.parse(fs.readFileSync(installed, "utf8"));
    const venv = (j.tools || []).find((t) => t.name === "venv312")?.file_path;
    if (!venv) return null;
    return exists(path.join(venv, "Scripts", "python.exe")) || exists(path.join(venv, "bin", "python"));
  } catch {
    return null;
  }
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Spawn eye_state.py on a clip; returns the record (also written to out). */
export function scoreClip(clip, { out, python = resolvePython(), model, width } = {}) {
  if (!python) throw new MediaError("NOSCORES", "no Python 3.12 with MediaPipe found (set MCE_PY312 or MCE_INSTALLED); pass a scores file instead");
  if (!out) throw new MediaError("BADARG", "scoreClip needs out (a .json path)");
  const args = ["-I", SCRIPT, path.resolve(clip), "--out", path.resolve(out)];
  if (model) args.push("--model", model);
  if (width) args.push("--width", String(width));
  const r = spawnSync(python, args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error) throw new MediaError("NOSCORES", `could not start ${python}: ${r.error.message}`);
  if (r.status !== 0) throw new MediaError("EYESTATE", `eye_state.py failed: ${(r.stderr || "").trim().split("\n").filter((l) => /eye_state:/.test(l)).join(" ") || (r.stderr || "").trim().slice(-300)}`);
  return loadEyeState(path.resolve(out));
}

/** The record for a clip: from `scores` when given (checked against the clip's sha256), else scored. */
export function eyeState(clip, { scores, out, ...rest } = {}) {
  if (scores != null) {
    const rec = loadEyeState(scores);
    if (clip && rec.clip_sha256 && fs.existsSync(clip)) {
      const sha = sha256File(clip);
      if (sha !== rec.clip_sha256) throw new MediaError("STALE", `scores were made from a different file (sha256 ${rec.clip_sha256.slice(0, 12)}, clip ${sha.slice(0, 12)})`);
    }
    return rec;
  }
  return scoreClip(clip, { out, ...rest });
}

function cli(argv) {
  const valued = ["--scores", "--out", "--range", "--cut", "--close", "--open", "--edge-frames", "--no-face", "--model", "--width"];
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const clip = argv.find((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1]));
  try {
    const ranges = flags("--range").map((s, i) => {
      const m = /^(-?[\d.]+)-(-?[\d.]+)$/.exec(s || "");
      if (!m) throw new MediaError("BADARG", `--range wants a-b, got ${s}`);
      return { id: `r${i + 1}`, from: Number(m[1]), to: Number(m[2]) };
    });
    const num = (k) => (flag(k) != null ? Number(flag(k)) : undefined);
    const rec = eyeState(clip, { scores: flag("--scores"), out: flag("--out"), model: flag("--model"), width: num("--width") });
    const res = eyeGate(rec, { ranges, cuts: flags("--cut").map(Number), close: num("--close"), open: num("--open"), edgeFrames: num("--edge-frames"), noFace: flag("--no-face") });
    if (argv.includes("--json")) console.log(JSON.stringify(res, null, 2));
    else {
      console.log(`${res.verdict} eye state (close ${res.thresholds.close}, open ${res.thresholds.open}, edge ${res.thresholds.edge_frames} frames at ${r6(res.fps)} fps)`);
      for (const f of res.findings) console.log(`  ${f.severity} ${f.rule}: ${f.message}`);
    }
    return res.verdict === "FAIL" ? 1 : 0;
  } catch (e) {
    console.error(`eye-state: ${e.code || ""} ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
