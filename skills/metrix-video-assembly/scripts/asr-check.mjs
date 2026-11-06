#!/usr/bin/env node
/*
 * Does each stage of the audio chain still say the locked script? Run it after every stage that
 * touches the voice (raw take, each processing pass, the mix, every rendered master): a de-esser
 * once turned "Spend" into "Send" and nothing caught it until a listener did.
 *
 *   node asr-check.mjs --script locked.txt [--aliases client-aliases.json]
 *        [--engine auto|whisper-cli|ffmpeg] [--model ggml-*.bin] [--words <stage>=<file>]...
 *        [--out report.json] <stage>=<file> | <file> ...
 *
 * Each input is a wav or an mp4 (its first audio stream is extracted to 16 kHz mono). Stages are
 * checked in the order given and named by "<stage>=" or the file name.
 *
 * Per stage:
 *   1. Final silence: silencedetect -35 dB, 0.6 s. A silence that runs to the end of the file
 *      starts the final silence; recognisers hallucinate words there, so any word that STARTS
 *      inside it is dropped (and listed).
 *   2. Words: whisper-cli (whisper.cpp) with DTW word timing and token probabilities when it is
 *      installed (X:/Metrix/tools/INSTALLED.json, or MCE_WHISPER_CLI), run as
 *      -ojf -ml 1 -sow --dtw <model> -nfa --vad -vm <silero> -sns -nf -l en. -nfa is required:
 *      flash attention silently disables DTW. Otherwise the ffmpeg whisper filter (asr.mjs).
 *      --words <stage>=<file> supplies a saved whisper-cli JSON or ffmpeg JSON-lines file instead.
 *   3. Junk: more than 20 % of the remaining tokens that are not words ([BLANK_AUDIO], (music),
 *      a music note, punctuation alone) means the transcript failed; that stage FAILs whatever
 *      the diff says. Fewer are dropped and listed.
 *   4. Diff: phrase-align scriptDiff (LCS, normalised, apostrophes dropped) against the locked
 *      script, after aliases.
 * The two hallucination rules follow HyperFrames (heygen-com/hyperframes, Apache License 2.0,
 * commit fc0b53361bf3, skills/hyperframes/references/captions.md); written here, not copied.
 *
 * Aliases ("the recogniser hears X for the brand word Y") come ONLY from a per-client file, never
 * the command line: one CLI alias "send=spend" would pass the exact defect this tool exists for.
 * File schema mce.asraliases/1: {schema, client, aliases:[{heard, meant, why}]}. The report carries
 * the file's sha256 and every alias that actually changed the heard text.
 *
 * Output: JSON report (stdout, and --out). Exit 0 every stage MATCH, 1 any stage MISMATCH or
 * TRANSCRIPT_FAILED, 2 bad input or no recogniser.
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAliases, normalize, parseWhisperWords, scriptDiff } from "./phrase-align.mjs";
import { filters, words as ffmpegWhisperWords } from "./media/asr.mjs";
import { MediaError, probe, runFfmpeg } from "./media/probe.mjs";

export const REPORT_SCHEMA = "mce.asrcheck/1";
export const ALIAS_SCHEMA = "mce.asraliases/1";
export const FINAL_SILENCE = Object.freeze({ noise: "-35dB", minGap: 0.6 });
export const JUNK_LIMIT = 0.2;
export const LOW_P = 0.5;
export const DEFAULT_INSTALLED = "X:/Metrix/tools/INSTALLED.json";
const EPS = 1e-6;
const r3 = (x) => Math.round(x * 1000) / 1000;
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export class CheckError extends Error {}

// ---------------------------------------------------------------- pure

/** A token that is not a word: a bracketed tag, a music note, a replacement char, or no letters or digits. */
export const isJunk = (text) => /^\s*[[(].*[\])]\s*$/.test(text) || /[♪♫�]/.test(text) || normalize(String(text)) === "";

/**
 * whisper-cli -ojf output (run with -ml 1 -sow, so a segment is one word) -> words.
 * start is the first real token's DTW time when present (t_dtw is in 10 ms units), else the
 * segment start; end is the segment end. p is the lowest token probability in the word.
 */
export function parseWhisperCli(json) {
  const j = typeof json === "string" ? JSON.parse(json) : json;
  if (!j || !Array.isArray(j.transcription)) throw new CheckError("whisper-cli JSON has no transcription[]");
  const out = [];
  for (const s of j.transcription) {
    const text = String(s.text ?? "").trim();
    if (!text) continue;
    const toks = (s.tokens || []).filter((t) => !/^\[_.*\]$/.test(String(t.text).trim()));
    const segStart = Number(s.offsets?.from) / 1000, segEnd = Number(s.offsets?.to) / 1000;
    const dtw = toks.map((t) => Number(t.t_dtw)).find((x) => Number.isFinite(x) && x >= 0);
    const start = dtw !== undefined ? Math.min(dtw / 100, segEnd) : segStart;
    const ps = toks.map((t) => Number(t.p)).filter(Number.isFinite);
    out.push({ text, start: r3(start), end: r3(Math.max(start, segEnd)), seg_start: r3(segStart), p: ps.length ? Math.round(Math.min(...ps) * 1000) / 1000 : null, dtw: dtw !== undefined });
  }
  return out;
}

/** Words from a saved file: whisper-cli JSON (an object with transcription[]) or ffmpeg whisper JSON lines. */
export function parseWordsFile(text) {
  const t = String(text).trim();
  if (t.startsWith("{") && /"transcription"\s*:/.test(t)) {
    let j;
    try { j = JSON.parse(t); } catch { j = null; }
    if (j && Array.isArray(j.transcription)) return { format: "whisper-cli", words: parseWhisperCli(j) };
  }
  return { format: "ffmpeg-whisper", words: parseWhisperWords(t).map((w) => ({ ...w, p: null })) };
}

/** silencedetect stderr -> start of the silence that runs to the end of the file, or null. */
export function finalSilenceStart(stderr, duration) {
  const starts = [...String(stderr).matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...String(stderr).matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  if (!starts.length) return null;
  const i = starts.length - 1;
  const end = i < ends.length ? ends[i] : Infinity;
  return end >= duration - 0.01 ? r3(starts[i]) : null;
}

/**
 * Drop words that start in the final silence, then judge junk. Returns
 * {kept, dropped:[{...word, reason}], junk:{count,total,ratio}, failed}.
 */
export function hygiene(words, { finalSilence = null, junkLimit = JUNK_LIMIT } = {}) {
  const dropped = [];
  let heard = [...words].sort((a, b) => a.start - b.start);
  if (Number.isFinite(finalSilence)) {
    heard = heard.filter((w) => (w.start >= finalSilence - EPS ? (dropped.push({ ...w, reason: "starts in the final silence" }), false) : true));
  }
  const junk = heard.filter((w) => isJunk(w.text));
  const ratio = heard.length ? junk.length / heard.length : 0;
  for (const w of junk) dropped.push({ ...w, reason: "not a word" });
  return { kept: heard.filter((w) => !isJunk(w.text)), dropped, junk: { count: junk.length, total: heard.length, ratio: r3(ratio) }, failed: ratio > junkLimit + EPS };
}

/** Validate a per-client alias file. Returns {client, pairs:["heard=meant"], entries}. */
export function loadAliases(doc) {
  if (!doc || doc.schema !== ALIAS_SCHEMA) throw new CheckError(`aliases: schema must be "${ALIAS_SCHEMA}"`);
  if (typeof doc.client !== "string" || !doc.client.trim()) throw new CheckError("aliases: client is required (aliases are per client)");
  if (!Array.isArray(doc.aliases)) throw new CheckError("aliases: aliases[] is required");
  const entries = doc.aliases.map((a, i) => {
    const heard = normalize(String(a?.heard ?? "")), meant = normalize(String(a?.meant ?? ""));
    if (!heard || !meant) throw new CheckError(`aliases[${i}]: heard and meant are required`);
    if (heard === meant) throw new CheckError(`aliases[${i}]: heard and meant are the same after normalising`);
    if (typeof a.why !== "string" || !a.why.trim()) throw new CheckError(`aliases[${i}].why: say why the recogniser hears this (an alias hides a word difference)`);
    return { heard, meant, why: a.why };
  });
  return { client: doc.client, entries, pairs: entries.map((e) => `${e.heard}=${e.meant}`) };
}

/** Which aliases changed this heard text. */
export function appliedAliases(heardText, entries) {
  const padded = ` ${normalize(heardText)} `;
  return entries.filter((e) => padded.includes(` ${e.heard} `)).map((e) => `${e.heard}=${e.meant}`);
}

/** Judge one stage's words against the script. */
export function checkStage({ script, words, aliases = { entries: [], pairs: [] }, finalSilence = null, junkLimit = JUNK_LIMIT }) {
  const h = hygiene(words, { finalSilence, junkLimit });
  const heardText = h.kept.map((w) => w.text).join(" ");
  const diffs = scriptDiff(script, heardText, aliases.pairs);
  const verdict = h.failed ? "TRANSCRIPT_FAILED" : diffs.length ? "MISMATCH" : "MATCH";
  return {
    verdict,
    heard: heardText,
    heard_after_aliases: applyAliases(normalize(heardText), aliases.pairs),
    aliases_applied: appliedAliases(heardText, aliases.entries),
    diffs,
    dropped: h.dropped,
    junk: h.junk,
    final_silence_start: finalSilence,
    low_confidence: h.kept.filter((w) => Number.isFinite(w.p) && w.p < LOW_P).map((w) => ({ text: w.text, start: w.start, p: w.p })),
  };
}

const diffKey = (d) => `${d.type}:${d.word}`;
/** The first stage that is not MATCH, and for each stage the diffs it added over the stage before it. */
export function chainSummary(stages) {
  let prev = new Set();
  const changes = stages.map((s) => {
    const now = new Set(s.diffs.map(diffKey));
    const added = [...now].filter((k) => !prev.has(k));
    const removed = [...prev].filter((k) => !now.has(k));
    prev = now;
    return { stage: s.stage, added, removed };
  });
  const first = stages.find((s) => s.verdict !== "MATCH");
  return { first_failing_stage: first ? first.stage : null, changes };
}

// ---------------------------------------------------------------- tools

export function readInstalled(file = process.env.MCE_TOOLS_INSTALLED || DEFAULT_INSTALLED) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
const installedTool = (inst, re) => (inst?.tools || []).find((t) => re.test(t.name) && t.file_path && fs.existsSync(t.file_path));
const sameFile = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Resolve the recogniser. Returns {name, bin?, model, vad?, dtw?, model_sha256, model_sha256_source}. */
export function resolveEngine({ engine = "auto", model, installed = readInstalled() } = {}) {
  const modelFacts = (m) => {
    const rec = (installed?.tools || []).find((t) => t.file_path && sameFile(t.file_path, m));
    if (rec?.sha256) return { model: m, model_sha256: rec.sha256, model_sha256_source: "INSTALLED.json" };
    return { model: m, model_sha256: sha256(fs.readFileSync(m)), model_sha256_source: "computed" };
  };
  if (engine === "auto" || engine === "whisper-cli") {
    const binRec = process.env.MCE_WHISPER_CLI ? { file_path: process.env.MCE_WHISPER_CLI, version: "MCE_WHISPER_CLI" } : installedTool(installed, /^whisper\.cpp/i);
    const m = model || process.env.MCE_WHISPER_CLI_MODEL || installedTool(installed, /^ggml-small\.en\.bin/i)?.file_path || installedTool(installed, /^ggml-base\.en\.bin/i)?.file_path;
    const vad = process.env.MCE_WHISPER_VAD || installedTool(installed, /^ggml-silero/i)?.file_path;
    if (binRec && fs.existsSync(binRec.file_path) && m && fs.existsSync(m)) {
      const preset = /ggml-(.+?)\.bin$/i.exec(path.basename(m))?.[1] || null;
      return { name: "whisper-cli", bin: binRec.file_path, version: binRec.version || null, vad: vad && fs.existsSync(vad) ? vad : null, dtw: preset, ...modelFacts(m) };
    }
    if (engine === "whisper-cli") throw new CheckError("whisper-cli is not installed (INSTALLED.json or MCE_WHISPER_CLI) or has no model");
  }
  const m = model || process.env.METRIX_WHISPER_MODEL || installedTool(installed, /^ggml-base\.en\.bin/i)?.file_path || installedTool(installed, /^ggml-small\.en\.bin/i)?.file_path;
  if (!m || !fs.existsSync(m)) throw new CheckError("no Whisper model for the ffmpeg whisper filter: pass --model or set METRIX_WHISPER_MODEL");
  if (!filters().whisper_filter) throw new CheckError("this ffmpeg has no whisper filter and whisper-cli is not installed");
  return { name: "ffmpeg-whisper", ...modelFacts(m) };
}

function runWhisperCli(eng, wav, tmp) {
  const base = path.join(tmp, `wc-${process.pid}-${path.basename(wav, ".wav")}`);
  const args = ["-m", eng.model, "-f", wav, "-ojf", "-ml", "1", "-sow", "-nfa", "-sns", "-nf", "-l", "en", "-of", base];
  if (eng.dtw) args.push("--dtw", eng.dtw);
  if (eng.vad) args.push("--vad", "-vm", eng.vad);
  const r = spawnSync(eng.bin, args, { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error || r.status !== 0 || !fs.existsSync(`${base}.json`)) throw new CheckError(`whisper-cli failed: ${r.error?.message || String(r.stderr).slice(-400)}`);
  const words = parseWhisperCli(fs.readFileSync(`${base}.json`, "utf8"));
  return { words, args };
}

function extract(file, tmp, i) {
  const wav = path.join(tmp, `stage-${i}.wav`);
  const r = runFfmpeg(["-v", "error", "-y", "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  if (r.status !== 0) throw new MediaError("UNREADABLE", `cannot extract audio from ${file}: ${String(r.stderr).slice(-300)}`);
  return wav;
}

function measureFinalSilence(wav) {
  const duration = probe(wav).audio?.duration;
  const r = runFfmpeg(["-i", wav, "-af", `silencedetect=noise=${FINAL_SILENCE.noise}:d=${FINAL_SILENCE.minGap}`, "-f", "null", "-"]);
  if (r.status !== 0) throw new MediaError("SILENCEDETECT", `silencedetect failed: ${String(r.stderr).slice(-300)}`);
  return { duration, final_silence_start: finalSilenceStart(r.stderr, duration) };
}

// ---------------------------------------------------------------- CLI

function main(argv) {
  const valued = ["--script", "--aliases", "--engine", "--model", "--words", "--out"];
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const fail = (m) => { console.error(`asr-check: ${m}`); return 2; };
  if (argv.includes("--alias")) return fail("--alias is not accepted: aliases come only from a per-client file (--aliases client-aliases.json), so they are recorded and hash-bound");
  for (const a of argv) if (a.startsWith("--") && !valued.includes(a)) return fail(`unknown option ${a}`);
  const inputs = argv.filter((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1]));
  if (!flag("--script")) return fail("pass --script <locked script text file>");
  if (!inputs.length) return fail("pass at least one audio or video file (optionally <stage>=<file>)");

  try {
    const scriptBytes = fs.readFileSync(flag("--script"));
    const script = scriptBytes.toString("utf8");
    let aliases = { entries: [], pairs: [], client: null }, aliasFile = null;
    if (flag("--aliases")) {
      const bytes = fs.readFileSync(flag("--aliases"));
      let doc;
      try { doc = JSON.parse(bytes.toString("utf8")); } catch (e) { throw new CheckError(`--aliases is not JSON: ${e.message}`); }
      aliases = loadAliases(doc);
      aliasFile = { path: flag("--aliases"), sha256: sha256(bytes), client: aliases.client, aliases: aliases.entries };
    }
    const stagesIn = inputs.map((a, i) => {
      const m = /^([A-Za-z0-9_.-]+)=(.+)$/.exec(a);
      return { stage: m ? m[1] : path.basename(a), file: m ? m[2] : a, i };
    });
    const wordFiles = Object.fromEntries(flags("--words").map((w) => {
      const m = /^([A-Za-z0-9_.-]+)=(.+)$/.exec(w);
      if (!m) throw new CheckError(`--words must be <stage>=<file>, got ${w}`);
      return [m[1], m[2]];
    }));
    for (const k of Object.keys(wordFiles)) if (!stagesIn.some((s) => s.stage === k)) throw new CheckError(`--words names stage "${k}", which is not an input`);
    const needEngine = stagesIn.some((s) => !wordFiles[s.stage]);
    const engine = needEngine ? resolveEngine({ engine: flag("--engine") || "auto", model: flag("--model") }) : null;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "asr-check-"));
    const stages = [];
    try {
      for (const s of stagesIn) {
        const bytes = fs.readFileSync(s.file);
        const wav = extract(s.file, tmp, s.i);
        const fin = measureFinalSilence(wav);
        let words, source;
        if (wordFiles[s.stage]) {
          const parsed = parseWordsFile(fs.readFileSync(wordFiles[s.stage], "utf8"));
          words = parsed.words;
          source = { kind: "file", format: parsed.format, path: wordFiles[s.stage], sha256: sha256(fs.readFileSync(wordFiles[s.stage])) };
        } else if (engine.name === "whisper-cli") {
          const r = runWhisperCli(engine, wav, tmp);
          words = r.words;
          source = { kind: "whisper-cli", args: r.args.map((a) => (a === wav ? "<stage.wav>" : a.startsWith(tmp) ? "<tmp>" : a)) };
        } else {
          words = ffmpegWhisperWords(wav, { model: engine.model }).map((w) => ({ ...w, p: null }));
          source = { kind: "ffmpeg-whisper" };
        }
        const res = checkStage({ script, words, aliases, finalSilence: fin.final_silence_start });
        stages.push({ stage: s.stage, file: s.file, sha256: sha256(bytes), audio_duration: fin.duration, words_source: source, ...res });
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const chain = chainSummary(stages);
    const verdict = stages.every((s) => s.verdict === "MATCH") ? "MATCH" : "FAIL";
    const report = {
      schema: REPORT_SCHEMA, verdict,
      script: { path: flag("--script"), sha256: sha256(scriptBytes) },
      aliases: aliasFile,
      engine: engine ? { name: engine.name, bin: engine.bin || null, version: engine.version || null, model: engine.model, model_sha256: engine.model_sha256, model_sha256_source: engine.model_sha256_source, dtw: engine.dtw || null, vad: engine.vad || null } : null,
      rules: { final_silence: FINAL_SILENCE, junk_limit: JUNK_LIMIT, low_p: LOW_P },
      ...chain,
      stages,
      note: "ASR agreement only; a human listening pass is still required",
    };
    const text = JSON.stringify(report, null, 2) + "\n";
    if (flag("--out")) { fs.mkdirSync(path.dirname(path.resolve(flag("--out"))), { recursive: true }); fs.writeFileSync(flag("--out"), text); }
    process.stdout.write(text);
    for (const s of stages) {
      console.error(`asr-check: ${s.stage}: ${s.verdict}${s.diffs.map((d) => ` [script ${d.type} word "${d.word}"]`).join("")}${s.junk.count ? ` junk ${s.junk.count}/${s.junk.total}` : ""}${s.dropped.filter((d) => d.reason !== "not a word").length ? ` dropped ${s.dropped.filter((d) => d.reason !== "not a word").map((d) => `"${d.text}"`).join(" ")} in the final silence` : ""}`);
    }
    return verdict === "MATCH" ? 0 : 1;
  } catch (e) {
    if (e instanceof CheckError || e instanceof MediaError || e.code === "ENOENT") return fail(e.message);
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
