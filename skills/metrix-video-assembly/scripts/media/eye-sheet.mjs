#!/usr/bin/env node
/*
 * Eye sheet: a contact sheet of every DECODED source frame in a range, each stamped with its
 * sheet index and source timestamp, plus a JSON record of the frames shown.
 *
 *   eyeSheet(clip, {from, to, cols=8, out, fontfile, tileWidth=180, scores})
 *     -> {png, json, frames:[{i, t_src}]}                       range mode: from <= t_src < to
 *   eyeSheet(clip, {ranges:[{from,to}], edges:N, out, fontfile, scores})
 *     -> frames are the first and last N frames of each range (2N per range, one row each)
 *
 * No fps filter is ever applied: the sheet shows the frames the source actually has, at the
 * source's own rate. frames[] is read back from ffmpeg showinfo in the same pass that draws
 * the sheet, and must equal the frames planned from ffprobe, or the call throws.
 *
 * This is the human review record. It does not detect eye state.
 *
 * Scores hook (for the later automated pass, MediaPipe Face Landmarker blendshapes such as
 * eyeBlinkLeft/eyeBlinkRight in VIDEO mode): pass `scores` as an array of objects with a
 * `t_src` field, or a path to a JSON file holding that array (or {frames:[...]}). Each sheet
 * frame gets `score` = the fields of the score whose t_src is within half a frame, or null.
 * Nothing here judges the scores; the gate that reads them lands with that wave.
 *
 * ffmpeg's filter parser splits on ':', so a Windows drive path cannot go in drawtext's
 * fontfile. The filter runs with cwd at the font's folder and the font given as a bare name;
 * input and output stay absolute because they are not filter arguments.
 *
 * CLI: node eye-sheet.mjs <clip> --out sheet.png --font F.ttf (--from a --to b | --range a-b... --edges N)
 *      [--cols 8] [--tile-width 180] [--scores scores.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MediaError, framePts, probe, runFfmpeg } from "./probe.mjs";

const EPS = 1e-4;

/** Pure: range mode selection, trim semantics (from <= t < to). */
export function planRange(pts, from, to) {
  return pts.map((t, n) => ({ n, t })).filter(({ t }) => t >= from - 1e-9 && t < to - 1e-9);
}

/** Pure: edges mode selection: the first and last N decoded frames of each range. */
export function planEdges(pts, ranges, edges) {
  if (!Number.isInteger(edges) || edges <= 0) throw new MediaError("BADARG", `edges must be a positive integer, got ${edges}`);
  const out = [];
  ranges.forEach((r, ri) => {
    const inRange = planRange(pts, r.from, r.to);
    // Head and tail must not overlap: each row of the sheet is exactly 2N distinct frames.
    if (inRange.length < 2 * edges) throw new MediaError("BADARG", `range ${r.from}-${r.to} has ${inRange.length} frames, fewer than 2 x edges=${edges}; use range mode for it`);
    const head = inRange.slice(0, edges).map((f) => ({ ...f, range: ri, edge: "head" }));
    const tail = inRange.slice(-edges).map((f) => ({ ...f, range: ri, edge: "tail" }));
    out.push(...head, ...tail);
  });
  return out;
}

/** Pure: showinfo log -> pts_time of each frame that reached the sheet, in order. */
export function parseShowinfo(stderr) {
  const out = [];
  for (const m of String(stderr).matchAll(/Parsed_showinfo[^\]]*\]\s+n:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.]+(?:e[-+]?\d+)?)/g)) out.push(Number(m[1]));
  return out;
}

/** Load the optional scores input: an array, a {frames:[...]} object, or a path to either as JSON. */
export function loadScores(scores) {
  if (scores == null) return null;
  const v = typeof scores === "string" ? JSON.parse(fs.readFileSync(scores, "utf8")) : scores;
  const arr = Array.isArray(v) ? v : Array.isArray(v?.frames) ? v.frames : null;
  if (!arr || arr.some((s) => !Number.isFinite(s?.t_src))) throw new MediaError("BADARG", "scores must be an array of objects with a numeric t_src (or {frames:[...]})");
  return arr;
}

/** Pure: attach each frame's nearest score within half a frame; frames without one get score null. */
export function attachScores(frames, scores, { fps }) {
  if (!scores) return frames;
  const half = 0.5 / fps + 1e-9;
  return frames.map((f) => {
    let best = null;
    for (const s of scores) {
      const d = Math.abs(s.t_src - f.t_src);
      if (d <= half && (!best || d < best.d)) best = { d, s };
    }
    if (!best) return { ...f, score: null };
    const { t_src: _t, ...fields } = best.s;
    return { ...f, score: fields };
  });
}

const selectExpr = (planned) => {
  // Contiguous runs of planned frames become one between() on t, padded by a small epsilon.
  const runs = [];
  for (const f of planned) {
    const last = runs[runs.length - 1];
    if (last && f.n === last.n1 + 1) { last.n1 = f.n; last.t1 = f.t; } else runs.push({ n0: f.n, n1: f.n, t0: f.t, t1: f.t });
  }
  return runs.map((r) => `between(t\\,${(r.t0 - EPS).toFixed(6)}\\,${(r.t1 + EPS).toFixed(6)})`).join("+");
};

/** Spawn ffmpeg to draw the sheet; returns the frames shown and writes <out>.json beside the PNG. */
export function eyeSheet(clip, opts = {}) {
  const { from, to, ranges, edges, cols: colsOpt = 8, out, fontfile, tileWidth = 180, scores } = opts;
  if (!out) throw new MediaError("BADARG", "eyeSheet needs out (a .png path)");
  if (!fontfile || !fs.existsSync(fontfile)) throw new MediaError("BADARG", `eyeSheet needs an existing fontfile, got ${fontfile}`);
  const facts = probe(clip);
  if (!facts.video) throw new MediaError("UNREADABLE", `${clip} has no video stream`);
  const fps = facts.video.fps;
  const pts = framePts(clip);

  const edgesMode = Array.isArray(ranges);
  let planned;
  if (edgesMode) planned = planEdges(pts, ranges, edges);
  else {
    if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) throw new MediaError("BADARG", "range mode needs numeric from < to");
    planned = planRange(pts, from, to);
  }
  if (!planned.length) throw new MediaError("BADARG", "no decoded frames in the requested range");

  const cols = edgesMode ? 2 * edges : colsOpt;
  const rows = edgesMode ? ranges.length : Math.ceil(planned.length / cols);
  const fontSize = Math.max(10, Math.round(tileWidth / 11));
  const vf = [
    `select='${selectExpr(planned)}'`,
    "showinfo",
    `scale=${tileWidth}:-2`,
    `drawtext=fontfile=${path.basename(fontfile)}:text='%{n}  %{pts\\:flt}':x=4:y=4:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=3`,
    `tile=${cols}x${rows}:padding=2:color=gray`,
  ].join(",");
  const png = path.resolve(out);
  fs.mkdirSync(path.dirname(png), { recursive: true });
  const r = runFfmpeg(["-y", "-copyts", "-i", path.resolve(clip), "-map", "0:v:0", "-vf", vf, "-fps_mode", "passthrough", "-frames:v", "1", "-update", "1", png], { cwd: path.dirname(path.resolve(fontfile)) });
  if (r.status !== 0 || !fs.existsSync(png)) throw new MediaError("FFMPEG", `eye sheet failed: ${(r.stderr || "").trim().slice(-400)}`);

  const shown = parseShowinfo(r.stderr);
  const same = shown.length === planned.length && shown.every((t, k) => Math.abs(t - planned[k].t) < 1e-3);
  if (!same) throw new MediaError("SHEET_MISMATCH", `sheet shows ${shown.length} frames but ${planned.length} were planned from the decoded source`);

  let frames = planned.map((f, i) => ({ i, t_src: Math.round(shown[i] * 1e6) / 1e6, ...(edgesMode ? { range: f.range, edge: f.edge } : {}) }));
  const scoreList = loadScores(scores);
  frames = attachScores(frames, scoreList, { fps });

  const record = {
    schema: "mce.eyesheet/1",
    clip: path.resolve(clip),
    png,
    mode: edgesMode ? "edges" : "range",
    ...(edgesMode ? { ranges, edges } : { from, to }),
    fps,
    cols,
    rows,
    frames,
    scores: scoreList ? { source: typeof scores === "string" ? path.resolve(scores) : "inline", matched: frames.filter((f) => f.score).length } : null,
    note: "Human review record: every decoded source frame in range, stamped with sheet index and source time. It does not detect eye state.",
  };
  const json = png.replace(/\.png$/i, "") + ".json";
  fs.writeFileSync(json, JSON.stringify(record, null, 2) + "\n");
  return { png, json, frames, fps, cols, rows };
}

function cli(argv) {
  const valued = ["--out", "--font", "--from", "--to", "--range", "--edges", "--cols", "--tile-width", "--scores"];
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const clip = argv.find((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1]));
  try {
    const rangeArgs = flags("--range").map((s) => {
      const [a, b] = s.split("-").map(Number);
      return { from: a, to: b };
    });
    const res = eyeSheet(clip, {
      out: flag("--out"),
      fontfile: flag("--font"),
      cols: flag("--cols") ? Number(flag("--cols")) : undefined,
      tileWidth: flag("--tile-width") ? Number(flag("--tile-width")) : undefined,
      scores: flag("--scores"),
      ...(rangeArgs.length ? { ranges: rangeArgs, edges: Number(flag("--edges")) } : { from: Number(flag("--from")), to: Number(flag("--to")) }),
    });
    console.log(`${res.png}\n${res.json}\n${res.frames.length} frames at ${res.fps} fps`);
    return 0;
  } catch (e) {
    console.error(`eye-sheet: ${e.code || ""} ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
