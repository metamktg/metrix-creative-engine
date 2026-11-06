#!/usr/bin/env node
/*
 * Cut detection, the short-shot gate and the freeze / dropped-frame check.
 *
 *   cuts(file, {threshold=10})        -> {cuts:number[], shots:{from,to,len}[], duration, fps}
 *   shortShotGate(shots, {minShot})   -> {verdict, min_shot, short[]}   (pure)
 *   freezeCheck(file, {noise, minFreeze, allow, tolerance})
 *                                     -> {verdict, freezes[], frames}
 *
 * Every spawning wrapper has a pure parser beside it (parseScdet, parseFreeze, frameCheck) so
 * the rules are tested without media. Times are on the file's own clock, in seconds.
 *
 * Cuts come from ffmpeg scdet (score 0 to 100, default threshold 10), which logs
 * "lavfi.scd.time: T" for each frame that starts a new shot; tolerance is one source frame.
 * Owner rule: no shot under 0.75 s (MCE_MIN_SHOT or --min-shot to change it). Every interval
 * counts, including the first and the last shot.
 *
 * Freezes come from freezedetect (noise 0.001, minimum 0.1 s). A freeze is a FAIL unless it
 * lies inside an allowed range (a deliberate hold, an end card). Dropped frames are checked
 * two ways: decoded frame count against round(duration x fps), and pts gaps over 1.5 frames.
 *
 * CLI: node scdet.mjs <video> [--threshold 10] [--min-shot 0.75] [--allow a-b]... [--json]
 *      exit 0 PASS, 1 FAIL, 2 unreadable or no ffmpeg.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaError, framePts, probe, runFfmpeg } from "./probe.mjs";

export const DEFAULT_THRESHOLD = 10;
export const DEFAULT_MIN_SHOT = 0.75;
export const DEFAULT_FREEZE_NOISE = 0.001;
export const DEFAULT_FREEZE_MIN = 0.1;
const EPS = 1e-6;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

/** Pure: scdet log text -> sorted, de-duplicated cut times in seconds. */
export function parseScdet(stderr) {
  const times = [];
  for (const m of String(stderr).matchAll(/lavfi\.scd\.time:\s*(-?[\d.]+(?:e[-+]?\d+)?)/gi)) {
    const t = Number(m[1]);
    if (Number.isFinite(t)) times.push(t);
  }
  times.sort((a, b) => a - b);
  return times.filter((t, i) => i === 0 || t - times[i - 1] > EPS);
}

/** Pure: cut times plus the file duration -> shots from 0 to the end. Cuts at 0 or past the end are dropped. */
export function shotsFromCuts(cuts, duration) {
  const inside = cuts.filter((t) => t > EPS && t < duration - EPS);
  const edges = [0, ...inside, duration];
  const shots = [];
  for (let i = 0; i + 1 < edges.length; i++) shots.push({ from: r6(edges[i]), to: r6(edges[i + 1]), len: r6(edges[i + 1] - edges[i]) });
  return shots;
}

export function resolveMinShot(v) {
  const raw = v ?? process.env.MCE_MIN_SHOT ?? DEFAULT_MIN_SHOT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new MediaError("BADARG", `minimum shot length must be a positive number of seconds, got ${raw}`);
  return n;
}

/** Pure: FAIL any shot shorter than minShot (default 0.75 s, or MCE_MIN_SHOT). */
export function shortShotGate(shots, { minShot } = {}) {
  const min = resolveMinShot(minShot);
  const short = shots
    .map((s, i) => ({ ...s, index: i, edge: i === 0 ? "first" : i === shots.length - 1 ? "last" : null }))
    .filter((s) => s.len < min - EPS);
  return { verdict: short.length ? "FAIL" : "PASS", min_shot: min, shots: shots.length, short };
}

/** Spawn ffmpeg scdet over the first video stream. */
export function cuts(file, { threshold = DEFAULT_THRESHOLD, bin } = {}) {
  const facts = probe(file);
  if (!facts.video) throw new MediaError("UNREADABLE", `${file} has no video stream`);
  const r = runFfmpeg(["-i", file, "-map", "0:v:0", "-vf", `scdet=threshold=${threshold}`, "-f", "null", "-"], bin ? { bin } : {});
  if (r.status !== 0) throw new MediaError("UNREADABLE", `scdet failed on ${file}: ${(r.stderr || "").trim().slice(-300)}`);
  const duration = facts.video.duration ?? facts.format.duration;
  const c = parseScdet(r.stderr);
  return { cuts: c, shots: shotsFromCuts(c, duration), duration, fps: facts.video.fps, threshold };
}

/** Pure: freezedetect log text -> [{start,end,duration}]; a freeze still open at EOF ends at duration. */
export function parseFreeze(stderr, duration) {
  const out = [];
  let open = null;
  for (const m of String(stderr).matchAll(/lavfi\.freezedetect\.freeze_(start|end):\s*(-?[\d.]+(?:e[-+]?\d+)?)/g)) {
    const t = Number(m[2]);
    if (m[1] === "start") open = t;
    else if (open != null) { out.push({ start: r6(open), end: r6(t), duration: r6(t - open) }); open = null; }
  }
  if (open != null && Number.isFinite(duration)) out.push({ start: r6(open), end: r6(duration), duration: r6(duration - open), open_at_eof: true });
  return out;
}

/**
 * Pure: decoded frame pts against the nominal rate.
 * expected = round(duration x fps); FAIL when |decoded - expected| > tolerance frames, or when
 * any pts step is over 1.5 frames (a hole the container duration hides).
 */
export function frameCheck({ pts, duration, fps, tolerance = 1 }) {
  if (!Number.isFinite(fps) || fps <= 0) throw new MediaError("BADARG", "frameCheck needs a positive fps");
  const step = 1 / fps;
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i] - pts[i - 1];
    if (dt > 1.5 * step) gaps.push({ after: r6(pts[i - 1]), at: r6(pts[i]), dt: r6(dt), frames_missing: Math.round(dt * fps) - 1 });
  }
  const expected = Math.round(duration * fps);
  const decoded = pts.length;
  const verdict = Math.abs(decoded - expected) > tolerance || gaps.length ? "FAIL" : "PASS";
  return { verdict, decoded, expected, duration, fps, tolerance, gaps };
}

/** Pure: is [start,end] inside one of the allowed ranges (a deliberate hold)? */
export const isAllowed = (f, allow = []) => allow.some((a) => f.start >= a.from - EPS && f.end <= a.to + EPS);

/** Spawn freezedetect plus a decoded frame listing; FAIL on an unallowed freeze or a frame problem. */
export function freezeCheck(file, { noise = DEFAULT_FREEZE_NOISE, minFreeze = DEFAULT_FREEZE_MIN, allow = [], tolerance = 1, bin } = {}) {
  const facts = probe(file);
  if (!facts.video) throw new MediaError("UNREADABLE", `${file} has no video stream`);
  const r = runFfmpeg(["-i", file, "-map", "0:v:0", "-vf", `freezedetect=n=${noise}:d=${minFreeze}`, "-f", "null", "-"], bin ? { bin } : {});
  if (r.status !== 0) throw new MediaError("UNREADABLE", `freezedetect failed on ${file}: ${(r.stderr || "").trim().slice(-300)}`);
  const duration = facts.video.duration ?? facts.format.duration;
  const freezes = parseFreeze(r.stderr, duration).map((f) => ({ ...f, allowed: isAllowed(f, allow) }));
  const frames = frameCheck({ pts: framePts(file), duration, fps: facts.video.fps, tolerance });
  const verdict = freezes.some((f) => !f.allowed) || frames.verdict === "FAIL" ? "FAIL" : "PASS";
  return { verdict, noise, min_freeze: minFreeze, allow, freezes, frames };
}

/** "1.2-3.4" -> {from,to} */
export function parseRange(s) {
  const m = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(String(s));
  if (!m || Number(m[2]) <= Number(m[1])) throw new MediaError("BADARG", `range must look like 1.2-3.4, got ${s}`);
  return { from: Number(m[1]), to: Number(m[2]) };
}

function cli(argv) {
  const valued = ["--threshold", "--min-shot", "--allow"];
  const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const files = argv.filter((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1]));
  if (!files.length) {
    console.error("usage: scdet.mjs <video>... [--threshold 10] [--min-shot 0.75] [--allow a-b]... [--json]");
    return 2;
  }
  let worst = 0;
  const reports = [];
  for (const file of files) {
    try {
      const c = cuts(file, { threshold: Number(flag("--threshold", DEFAULT_THRESHOLD)) });
      const gate = shortShotGate(c.shots, { minShot: flag("--min-shot") });
      const fz = freezeCheck(file, { allow: flags("--allow").map(parseRange) });
      const verdict = gate.verdict === "PASS" && fz.verdict === "PASS" ? "PASS" : "FAIL";
      reports.push({ file: path.resolve(file), verdict, cuts: c, short_shot: gate, freeze: fz });
      if (verdict === "FAIL") worst = Math.max(worst, 1);
      if (!argv.includes("--json")) {
        console.log(`${path.basename(file)}: ${verdict}`);
        console.log(`  shots ${c.shots.length} at threshold ${c.threshold}: ${c.shots.map((s) => s.len.toFixed(3)).join(", ")}`);
        console.log(`  short-shot (< ${gate.min_shot} s): ${gate.verdict}${gate.short.map((s) => ` [${s.from.toFixed(3)}-${s.to.toFixed(3)} ${s.len.toFixed(3)} s]`).join("")}`);
        console.log(`  freezes: ${fz.freezes.length ? fz.freezes.map((f) => `${f.start.toFixed(3)}-${f.end.toFixed(3)}${f.allowed ? " (allowed)" : ""}`).join(", ") : "none"}`);
        console.log(`  frames: decoded ${fz.frames.decoded}, expected ${fz.frames.expected} (${fz.frames.duration} s x ${fz.frames.fps}), gaps ${fz.frames.gaps.length}: ${fz.frames.verdict}`);
      }
    } catch (e) {
      console.error(`scdet: ${file}: ${e.code || ""} ${e.message}`);
      worst = 2;
    }
  }
  if (argv.includes("--json")) console.log(JSON.stringify(reports, null, 2));
  return worst;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
