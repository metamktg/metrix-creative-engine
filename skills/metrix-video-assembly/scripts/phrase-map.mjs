#!/usr/bin/env node
/*
 * Map an accepted voice take to its phrases, and check it says the approved script.
 *
 *   node phrase-map.mjs <voice.wav> [--script script.txt] [--alias "heard=meant"]...
 *        [--noise -40dB] [--min-gap 0.15] [--model ggml-base.en.bin] [--words words.jsonl]
 *        [--out phrases.json] [--srt captions.srt]
 *
 * Phrase edges come from ffmpeg silencedetect (default -40dB, gaps of 0.15 s or more), which
 * is sample-accurate and is what edits cut on. Words come from Whisper through ffmpeg's
 * whisper filter (whisper.cpp; model from --model or METRIX_WHISPER_MODEL), or from a saved
 * --words file. Whisper word times are loose (ends run into the next word by about 0.2 s), so
 * they only place each word in a phrase; they never set a cut.
 *
 * With --script (one phrase per line, or free text), every script word must be heard in order.
 * Any missing or extra word is printed with its phrase and time, and the exit code is 1. This
 * is the check that caught "Spend" heard as "Send" after a de-esser was added to a voice chain.
 * --alias maps a known ASR spelling to the script word, e.g. "license fast=licensepass".
 * ASR agreement is not a listening pass: a human still has to hear the take.
 *
 * --srt writes one cue per phrase. When the script has one line per detected phrase, the cue
 * text is the script line (exact copy); otherwise it is what ASR heard, and that is reported.
 */
import fs from "node:fs";

import path from "node:path";
import { spawnSync } from "node:child_process";
import { assignWords, parseWhisperWords, phrasesToSrt, scriptDiff, speechIslands } from "./phrase-align.mjs";

const argv = process.argv.slice(2);
const valued = ["--script", "--alias", "--noise", "--min-gap", "--model", "--words", "--out", "--srt"];
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !valued.includes(argv[i - 1])));
const die = (m) => { console.error(`phrase-map: ${m}`); process.exit(1); };
if (!input) die("usage: phrase-map.mjs <voice.wav> [--script script.txt] [--alias heard=meant] [--words words.jsonl] [--out phrases.json] [--srt out.srt]");
if (!fs.existsSync(input)) die(`no such file: ${input}`);

const ff = (args, opts = {}) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 64 << 20, ...opts });

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input], { encoding: "utf8" });
const duration = Number(probe.stdout.trim());
if (!Number.isFinite(duration) || duration <= 0) die(`cannot read the duration of ${input} (is ffprobe installed?)`);

const noise = flag("--noise", "-40dB");
const minGap = Number(flag("--min-gap", "0.15"));
const sd = ff(["-i", input, "-af", `silencedetect=noise=${noise}:d=${minGap}`, "-f", "null", "-"]);
if (sd.status !== 0) die(`silencedetect failed: ${sd.stderr.slice(-400)}`);
const islands = speechIslands(sd.stderr, duration);
if (!islands.length) die(`no speech found above ${noise}`);

let wordsText;
const wordsFile = flag("--words");
if (wordsFile) {
  wordsText = fs.readFileSync(wordsFile, "utf8");
} else {
  const model = flag("--model", process.env.METRIX_WHISPER_MODEL);
  if (!model || !fs.existsSync(model)) die("no Whisper model: pass --model <ggml-*.bin>, set METRIX_WHISPER_MODEL, or pass --words");
  // The filter's option parser splits on ':', so a Windows drive path cannot go in it.
  // Run from the model's folder and give the model and destination as bare names.
  const dir = path.dirname(path.resolve(model));
  const dest = `phrase-map-${process.pid}.jsonl`;
  const w = ff(["-i", path.resolve(input), "-af", `whisper=model=${path.basename(model)}:language=en:queue=20:max_len=1:format=json:destination=${dest}`, "-f", "null", "-"], { cwd: dir });
  const out = path.join(dir, dest);
  if (w.status !== 0 || !fs.existsSync(out)) die(`whisper failed (needs an ffmpeg build with the whisper filter): ${w.stderr.slice(-400)}`);
  wordsText = fs.readFileSync(out, "utf8");
  fs.rmSync(out, { force: true });
}
const words = parseWhisperWords(wordsText);
const phrases = assignWords(islands, words);

const result = { input: path.resolve(input), duration, silencedetect: { noise, min_gap: minGap }, phrases, script_check: null };
let mismatch = false;
const scriptFile = flag("--script");
let scriptLines = null;
if (scriptFile) {
  const scriptText = fs.readFileSync(scriptFile, "utf8");
  scriptLines = scriptText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const heard = phrases.map((p) => p.text).join(" ");
  const diffs = scriptDiff(scriptText, heard, flags("--alias"));
  result.script_check = { verdict: diffs.length ? "MISMATCH" : "MATCH", diffs, note: "ASR agreement only; a human listening pass is still required" };
  mismatch = diffs.length > 0;
}

for (const p of phrases) console.log(`${p.id}  ${p.start.toFixed(3)}-${p.end.toFixed(3)}  ${p.text || "(no words)"}`);
if (result.script_check) {
  if (!mismatch) console.log("script check: MATCH (every script word heard in order)");
  for (const d of result.script_check.diffs) console.error(`phrase-map: script ${d.type} word "${d.word}" (${d.type === "missing" ? "script" : "heard"} word ${d.index + 1})`);
}

if (flag("--out")) fs.writeFileSync(flag("--out"), JSON.stringify(result, null, 2) + "\n");
if (flag("--srt")) {
  const exact = scriptLines && scriptLines.length === phrases.length;
  if (scriptLines && !exact) console.error(`phrase-map: script has ${scriptLines.length} lines but ${phrases.length} phrases were detected; SRT uses the ASR text, so check it before use`);
  fs.writeFileSync(flag("--srt"), phrasesToSrt(phrases, exact ? scriptLines : null));
}
if (mismatch) { console.error("phrase-map: script check MISMATCH"); process.exit(1); }

