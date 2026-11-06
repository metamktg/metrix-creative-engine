/*
 * ASR and silence spawning for phrase mapping. Only the ffmpeg calls live here; the pure
 * parsers stay in ../phrase-align.mjs, untouched.
 *
 *   islands(wav, {noise="-40dB", minGap=0.15, duration}) -> [{start,end}]   (silencedetect)
 *   words(wav, {model})   -> [{text,start,end}]   (ffmpeg whisper filter, whisper.cpp)
 *   readWords(file)       -> [{text,start,end}]   (a saved whisper JSON-lines file)
 *   parseFilters(text)    -> {whisper_filter, silencedetect, scdet, freezedetect}   (pure)
 *   filters()             -> parseFilters(ffmpeg -filters)
 *
 * Whisper word times are loose (ends run about 0.2 s into the next word); they place words in
 * phrases and never set a cut. Silence island edges are the cut points.
 */
import fs from "node:fs";
import path from "node:path";
import { parseWhisperWords, speechIslands } from "../phrase-align.mjs";
import { MediaError, runFfmpeg } from "./probe.mjs";

/** Pure: `ffmpeg -filters` text -> which filters this build has. */
export function parseFilters(text) {
  const has = (name) => new RegExp(`^\\s*[A-Z.|]{2,3}\\s+${name}\\s`, "m").test(String(text));
  return { whisper_filter: has("whisper"), silencedetect: has("silencedetect"), scdet: has("scdet"), freezedetect: has("freezedetect") };
}

export function filters() {
  const r = runFfmpeg(["-filters"]);
  return parseFilters(r.stdout);
}

/** Spawn silencedetect and return speech islands on the file's clock. */
export function islands(wav, { noise = "-40dB", minGap = 0.15, duration } = {}) {
  const r = runFfmpeg(["-i", wav, "-af", `silencedetect=noise=${noise}:d=${minGap}`, "-f", "null", "-"]);
  if (r.status !== 0) throw new MediaError("SILENCEDETECT", `silencedetect failed: ${(r.stderr || "").slice(-400)}`);
  return speechIslands(r.stderr, duration);
}

/** Parse a saved whisper JSON-lines words file. */
export function readWords(file) {
  return parseWhisperWords(fs.readFileSync(file, "utf8"));
}

/**
 * Spawn the ffmpeg whisper filter. The filter's option parser splits on ':', so a Windows
 * drive path cannot go in it: run from the model's folder and pass the model and the
 * destination as bare names.
 */
export function words(wav, { model } = {}) {
  if (!model || !fs.existsSync(model)) throw new MediaError("NOMODEL", "no Whisper model: pass --model <ggml-*.bin>, set METRIX_WHISPER_MODEL, or pass --words");
  const dir = path.dirname(path.resolve(model));
  const dest = `phrase-map-${process.pid}.jsonl`;
  const out = path.join(dir, dest);
  const w = runFfmpeg(["-i", path.resolve(wav), "-af", `whisper=model=${path.basename(model)}:language=en:queue=20:max_len=1:format=json:destination=${dest}`, "-f", "null", "-"], { cwd: dir });
  if (w.status !== 0 || !fs.existsSync(out)) throw new MediaError("WHISPER", `whisper failed (needs an ffmpeg build with the whisper filter): ${(w.stderr || "").slice(-400)}`);
  const text = fs.readFileSync(out, "utf8");
  fs.rmSync(out, { force: true });
  return parseWhisperWords(text);
}
