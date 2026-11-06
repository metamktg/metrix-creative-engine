#!/usr/bin/env node
/*
 * Stage a source clip for assembly: re-encode with a keyframe every second, then prove it.
 *
 *   stageClip(src, dst, {fps}) -> {dst, fps, gop, args, keyframes: checkKeyframes(...), frames}
 *
 * Generated clips arrive with sparse GOPs (one keyframe every few seconds). A browser seek to a
 * time far from a keyframe has to decode forward from it, and a seek that does not finish in
 * time shows the previous frame: a freeze or a dropped frame in the render. That cause is
 * INFERRED from the LP-AI-01 renders, not yet proven; this helper removes the condition so the
 * render watchdog work can test it. Encode: -c:v libx264 -crf 18 -g <fps> -keyint_min <fps>.
 * x264 may still add a scene-cut keyframe between grid points; that only shortens an interval,
 * so the check below bounds the longest interval rather than demanding an exact grid.
 * Audio is copied untouched.
 *
 * Verification reads keyframe pts with ffprobe -skip_frame nokey and FAILs when the first
 * keyframe is not the first frame or any keyframe interval (including the tail to the end) is
 * over gop frames. The decoded frame count must also equal the source's.
 *
 * CLI: node stage.mjs <src> <dst> [--fps 30]   (exit 0 staged and verified, 1 verify FAIL, 2 error)
 *      node stage.mjs --check <file> [--fps 30] (verify only)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaError, framePts, parseFramePts, probe, runFfmpeg, runFfprobe } from "./probe.mjs";

export const DEFAULT_CRF = 18;

/** Pure: the ffmpeg argument list for staging. fps must be a positive integer (it is the GOP). */
export function stageArgs(src, dst, { fps, crf = DEFAULT_CRF } = {}) {
  if (!Number.isInteger(fps) || fps <= 0) throw new MediaError("BADARG", `stage needs an integer fps for the GOP, got ${fps}`);
  return [
    "-y", "-i", src,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-crf", String(crf), "-g", String(fps), "-keyint_min", String(fps),
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-movflags", "+faststart",
    dst,
  ];
}

/** Pure: keyframe times -> spacing verdict. Interval in frames = round(dt x fps). */
export function checkKeyframes(times, { fps, gop = Math.round(fps), duration, firstFrame = 0 }) {
  const step = 1 / fps;
  const problems = [];
  if (!times.length) problems.push("no keyframes");
  else if (Math.abs(times[0] - firstFrame) > step / 2) problems.push(`first keyframe at ${times[0]} s, not the first frame (${firstFrame} s)`);
  const intervals = [];
  for (let i = 1; i < times.length; i++) intervals.push(Math.round((times[i] - times[i - 1]) * fps));
  // The tail: frames from the last keyframe to the end of the stream.
  const tail = times.length && Number.isFinite(duration) ? Math.round((duration - times[times.length - 1]) * fps) : 0;
  const max = Math.max(0, ...intervals, tail);
  if (max > gop) problems.push(`keyframe interval of ${max} frames exceeds the ${gop}-frame GOP`);
  return { verdict: problems.length ? "FAIL" : "PASS", fps, gop, keyframes: times.length, times, max_interval_frames: max, problems };
}

/** Spawn ffprobe to list keyframe pts only (fast: non-key frames are skipped). */
export function keyframeTimes(file) {
  const r = runFfprobe(["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", file]);
  if (r.status !== 0) throw new MediaError("UNREADABLE", `ffprobe could not list keyframes of ${file}: ${(r.stderr || "").trim().slice(-300)}`);
  return parseFramePts(r.stdout);
}

/** Verify an existing file's keyframe spacing. */
export function verifyStaged(file, { fps } = {}) {
  const facts = probe(file);
  if (!facts.video) throw new MediaError("UNREADABLE", `${file} has no video stream`);
  const rate = fps ?? Math.round(facts.video.fps);
  return checkKeyframes(keyframeTimes(file), { fps: rate, gop: rate, duration: facts.video.duration, firstFrame: facts.video.start_time ?? 0 });
}

/** Re-encode src to dst with a one-second GOP, then verify keyframes and frame count. */
export function stageClip(src, dst, { fps, crf = DEFAULT_CRF } = {}) {
  if (path.resolve(src) === path.resolve(dst)) throw new MediaError("BADARG", "stage output must not overwrite the source");
  const facts = probe(src);
  if (!facts.video) throw new MediaError("UNREADABLE", `${src} has no video stream`);
  const rate = fps ?? Math.round(facts.video.fps);
  const args = stageArgs(src, dst, { fps: rate, crf });
  fs.mkdirSync(path.dirname(path.resolve(dst)), { recursive: true });
  const r = runFfmpeg(["-loglevel", "error", ...args]);
  if (r.status !== 0) throw new MediaError("FFMPEG", `staging ${src} failed: ${(r.stderr || "").trim().slice(-300)}`);
  const keyframes = verifyStaged(dst, { fps: rate });
  const srcFrames = framePts(src).length;
  const dstFrames = framePts(dst).length;
  const frames = { source: srcFrames, staged: dstFrames, verdict: srcFrames === dstFrames ? "PASS" : "FAIL" };
  const verdict = keyframes.verdict === "PASS" && frames.verdict === "PASS" ? "PASS" : "FAIL";
  return { verdict, src: path.resolve(src), dst: path.resolve(dst), fps: rate, gop: rate, crf, args, keyframes, frames };
}

function cli(argv) {
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const fps = flag("--fps") ? Number(flag("--fps")) : undefined;
  const pos = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--fps" && argv[i - 1] !== "--check");
  try {
    if (argv.includes("--check")) {
      const res = verifyStaged(flag("--check"), { fps });
      console.log(JSON.stringify(res, null, 2));
      return res.verdict === "PASS" ? 0 : 1;
    }
    if (pos.length !== 2) { console.error("usage: stage.mjs <src> <dst> [--fps N] | stage.mjs --check <file> [--fps N]"); return 2; }
    const res = stageClip(pos[0], pos[1], { fps });
    console.log(JSON.stringify(res, null, 2));
    return res.verdict === "PASS" ? 0 : 1;
  } catch (e) {
    console.error(`stage: ${e.code || ""} ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
