#!/usr/bin/env node
/*
 * Caption cue builder: groups the locked script's words into on-screen caption cues on the
 * ad clock, times them against measured word times, and lints the result.
 *
 *   node captions/cues.mjs (--phrases phrases.json | --whisper-cli words.json | --words words.json)
 *        --script script.txt --energy high|conversational|calm [--fps 30] [--cuts 3.438,5.234]
 *        [--offset 0] [--alias "heard=meant"]... [--final-silence 17.2] [--out cues.json] [--srt cues.srt]
 *
 * Inputs. Word times come from phrase-map.mjs (--phrases; its words are clamped to the
 * silencedetect island they sit in, because ffmpeg-whisper word ends run into the next word),
 * whisper-cli -ojf -ml 1 --dtw (--whisper-cli), or a plain [{text,start,end}] list (--words).
 * --offset moves voice-file times onto the ad clock (audio.voiceover.at). Cue TEXT always comes
 * from the script, word by word by position; the recogniser only supplies times. A script and
 * a heard word count that disagree (after --alias) is an error, never a guess.
 *
 * Rules. The grouping rules are adapted from HyperFrames (heygen-com/hyperframes,
 * skills/hyperframes/references/captions.md, Apache License 2.0, commit fc0b53361bf3):
 * 2 to 3 words a group for high energy, 3 to 5 conversational, 4 to 6 calm; break at a
 * sentence end, a pause of 150 ms or more, or the word limit; one group visible at a time;
 * each group fades out over its last 0.12 s and is hidden at its end; match transcript words
 * to caption words by position, not text; drop non-word tokens and fail a transcript with more
 * than 20 % of them; drop words that start inside a final silence. The implementation here is
 * written for this engine, not copied. Timing follows the Netflix Timed Text Style Guide:
 * 42 characters a line, 2 lines at most, 20 characters a second at most, a 2-frame minimum gap
 * between cues, gaps under 12 frames closed to 2 frames, in and out times snapped to a shot
 * change within 0.5 s, and a 20-frame minimum cue (0.67 s at 30 fps, an owner assumption).
 *
 * Everything above the CLI block is pure: no file, clock or process access.
 */
import { pathToFileURL } from "node:url";

import { normalize, scriptDiff } from "../phrase-align.mjs";

export const ENERGY = Object.freeze({
  high: Object.freeze({ min: 2, max: 3 }),
  conversational: Object.freeze({ min: 3, max: 5 }),
  calm: Object.freeze({ min: 4, max: 6 }),
});

export const DEFAULTS = Object.freeze({
  fps: 30,
  pauseBreak: 0.15, // s, HyperFrames
  maxLineChars: 42, // Netflix
  maxLines: 2, // Netflix
  maxCps: 20, // characters a second, Netflix
  minGapFrames: 2, // Netflix
  chainGapFrames: 12, // Netflix: a gap under 12 frames closes to the minimum gap
  minCueFrames: 20, // owner assumption: 0.67 s at 30 fps
  snapWindow: 0.5, // s, Netflix shot-change snap
  fadeOut: 0.12, // s, HyperFrames exit
  lintProbe: 0.01, // s, HyperFrames self-lint: nothing still visible at end + 0.01
  junkLimit: 0.2, // HyperFrames: more than 20 % non-word tokens means the transcript failed
  earlyStart: 0.1, // s, HyperFrames: a caption at 0 s looks pre-existing
});

const EPS = 1e-6;

export class CueError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CueError";
    this.details = details;
  }
}

const r6 = (t) => Math.round(t * 1e6) / 1e6;
const floorFrame = (t, fps) => Math.floor(t * fps + EPS) / fps;
const ceilFrame = (t, fps) => Math.ceil(t * fps - EPS) / fps;
const SENTENCE_END = /[.!?]["'’”)\]]*$/;
const isJunk = (text) => /^[[(].*[\])]$/.test(text) || /[♪♫�]/.test(text) || normalize(text) === "";

/** Words from phrase-map.mjs --out JSON, clamped to their speech islands, shifted by offset. */
export function wordsFromPhraseMap(map, offset = 0) {
  if (!map || !Array.isArray(map.phrases)) throw new CueError("phrase map has no phrases[]");
  const out = [];
  for (const p of map.phrases) {
    const ws = p.words || [];
    ws.forEach((w, i) => {
      // Island edges are sample-accurate; ffmpeg-whisper edges are loose and run into the next word.
      let start = i === 0 ? p.start : Math.min(Math.max(w.start, p.start), p.end);
      let end = i === ws.length - 1 ? p.end : Math.min(Math.max(w.end, p.start), p.end);
      if (end < start) end = start;
      out.push({ text: String(w.text), start: r6(start + offset), end: r6(end + offset) });
    });
  }
  return out;
}

/**
 * Words from whisper-cli JSON (-oj or -ojf, run with -ml 1 so each segment is one word).
 * offsets are milliseconds. Built from whisper.cpp examples/cli/cli.cpp output_json; not yet
 * run against a real whisper-cli file on this machine.
 */
export function wordsFromWhisperCli(json, offset = 0) {
  if (!json || !Array.isArray(json.transcription)) throw new CueError("whisper-cli JSON has no transcription[]");
  return json.transcription
    .map((s) => ({ text: String(s.text ?? "").trim(), start: r6(Number(s.offsets?.from) / 1000 + offset), end: r6(Number(s.offsets?.to) / 1000 + offset) }))
    .filter((w) => w.text);
}

/** Lay a cue's text into lines of at most maxLine characters; the balanced two-line split wins. */
export function layoutLines(text, maxLine = DEFAULTS.maxLineChars) {
  if (text.length <= maxLine) return [text];
  let best = null;
  for (let i = text.indexOf(" "); i !== -1; i = text.indexOf(" ", i + 1)) {
    const a = text.slice(0, i), b = text.slice(i + 1);
    if (a.length > maxLine || b.length > maxLine) continue;
    // Most balanced; on a tie the shorter line goes on top.
    const score = Math.abs(a.length - b.length) * 2 + (a.length > b.length ? 1 : 0);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  if (best) return best.lines;
  // No two-line fit: greedy wrap, so the lint sees the true line count or length.
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > maxLine) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const fits = (text, o) => {
  const lines = layoutLines(text, o.maxLineChars);
  return lines.length <= o.maxLines && lines.every((l) => l.length <= o.maxLineChars);
};

/**
 * Map script words to measured words by position. Returns [{text, asr, start, end}] per script
 * token. Throws CueError when the counts disagree after aliases.
 */
export function mapScriptWords(script, words, { aliases = [], finalSilenceStart, junkLimit = DEFAULTS.junkLimit } = {}) {
  const tokens = String(script ?? "").split(/\s+/).filter(Boolean);
  // A token with no letters or digits (a dash, an ellipsis) joins the word before it.
  const scriptWords = [];
  for (const t of tokens) {
    if (normalize(t) === "" && scriptWords.length) scriptWords[scriptWords.length - 1].text += ` ${t}`;
    else if (normalize(t) !== "") scriptWords.push({ text: t, parts: normalize(t).split(" ") });
  }
  if (!scriptWords.length) throw new CueError("the script has no words");

  for (const w of words) {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) throw new CueError(`word "${w.text}" needs numeric start and end`);
    if (w.start < 0 || w.end < w.start) throw new CueError(`word "${w.text}" has a bad time (${w.start} to ${w.end})`);
  }
  let heard = [...words].sort((a, b) => a.start - b.start);
  const dropped = [];
  if (Number.isFinite(finalSilenceStart)) {
    heard = heard.filter((w) => (w.start >= finalSilenceStart - EPS ? (dropped.push({ ...w, reason: "starts in the final silence" }), false) : true));
  }
  const junk = heard.filter((w) => isJunk(w.text));
  if (heard.length && junk.length / heard.length > junkLimit + EPS) {
    throw new CueError(`transcript failed: ${junk.length} of ${heard.length} tokens are not words (over ${junkLimit * 100} %)`, { junk });
  }
  for (const j of junk) dropped.push({ ...j, reason: "not a word" });
  heard = heard.filter((w) => !isJunk(w.text));

  // Flatten heard words into normalized sub-words, each keeping its word's span.
  let subs = heard.flatMap((w) => normalize(w.text).split(" ").map((s) => ({ s, start: w.start, end: w.end, asr: w.text })));
  for (const a of aliases) {
    const [from, to] = String(a).split("=").map((x) => normalize(x ?? ""));
    if (!from || !to) continue;
    const pat = from.split(" "), rep = to.split(" ");
    const next = [];
    for (let i = 0; i < subs.length;) {
      if (pat.every((p, k) => subs[i + k]?.s === p)) {
        const span = subs.slice(i, i + pat.length);
        const asr = [...new Set(span.map((x) => x.asr))].join(" ");
        for (const s of rep) next.push({ s, start: span[0].start, end: span[span.length - 1].end, asr });
        i += pat.length;
      } else next.push(subs[i++]);
    }
    subs = next;
  }

  const want = scriptWords.reduce((n, w) => n + w.parts.length, 0);
  if (want !== subs.length) {
    throw new CueError(`the script has ${want} words but ${subs.length} were heard; fix the take or add an --alias`, {
      diffs: scriptDiff(scriptWords.map((w) => w.text).join(" "), subs.map((x) => x.s).join(" ")),
    });
  }
  let k = 0;
  const mapped = scriptWords.map((w) => {
    const span = subs.slice(k, k + w.parts.length);
    k += w.parts.length;
    const asr = [...new Set(span.map((x) => x.asr))].join(" ");
    return { text: w.text, asr, matches: span.every((x, i) => x.s === w.parts[i]), start: span[0].start, end: Math.max(...span.map((x) => x.end)) };
  });
  return { words: mapped, dropped };
}

function snapCut(t, cuts, window, filter) {
  let best = null;
  for (const c of cuts) {
    const d = Math.abs(c.raw - t);
    if (d <= window + EPS && filter(c) && (!best || d < best.d)) best = { ...c, d };
  }
  return best;
}

/**
 * Best way to cut one run (no sentence end or pause inside) into k groups of at most
 * limits.max words that each fit the line limits. Each group is judged on the window it can
 * really have: from its first word to 2 frames before the next group's first word (the run's
 * last group may run on to 2 frames before `until`, the next run's first word). Ranked by the
 * worst reading-floor shortfall (characters a second over the limit, or time under the minimum
 * cue, as a fraction of the limit), then groups under the energy's minimum word count, then
 * imbalance. Returns null when no split into k groups fits the line limits.
 */
function bestSplit(words, k, limits, o, until) {
  const n = words.length;
  const minCue = o.minCueFrames / o.fps;
  const gap = o.minGapFrames / o.fps;
  const groupCost = (a, b) => {
    const g = words.slice(a, b);
    const text = g.map((x) => x.text).join(" ");
    if (b - a > 1 && !fits(text, o)) return null;
    const lastEnd = Math.max(...g.map((x) => x.end));
    const close = b < n ? words[b].start - gap : Math.max(lastEnd, until - gap);
    const dur = Math.max(close - g[0].start, 1e-3);
    const short = Math.max(text.length / dur / o.maxCps - 1, (minCue - dur) / minCue, 0);
    return { short, orphan: b - a < limits.min ? 1 : 0, size: b - a };
  };
  let best = null;
  const walk = (at, left, acc) => {
    if (left === 0) {
      if (at !== n) return;
      const short = Math.max(...acc.map((x) => x.cost.short));
      const orphans = acc.reduce((t, x) => t + x.cost.orphan, 0);
      const mean = n / k;
      const imbalance = acc.reduce((t, x) => t + (x.cost.size - mean) ** 2, 0);
      const key = [Math.round(short * 1000), orphans, Math.round(imbalance * 1000)];
      if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) {
        best = { key, parts: acc.map((x) => words.slice(x.a, x.b)) };
      }
      return;
    }
    const rest = n - at;
    for (let size = 1; size <= Math.min(limits.max, rest - (left - 1)); size++) {
      if (rest - size > (left - 1) * limits.max) continue;
      const cost = groupCost(at, at + size);
      if (cost) walk(at + size, left - 1, [...acc, { a: at, b: at + size, cost }]);
    }
  };
  walk(0, k, []);
  return best;
}

/**
 * Build caption cues. words: [{text,start,end}] on the ad clock. script: the locked script text.
 * energy: high|conversational|calm. cuts: shot-change times (s). Returns
 * { schema, fps, energy, limits, cues, lint, dropped, asr_differs }.
 */
export function buildCues({ words, script, energy, cuts = [], fps = DEFAULTS.fps, aliases = [], finalSilenceStart, options = {} }) {
  const o = { ...DEFAULTS, ...options, fps };
  const limits = ENERGY[energy];
  if (!limits) throw new CueError(`energy must be one of ${Object.keys(ENERGY).join(", ")} (got "${energy}")`);
  if (!(Number.isFinite(fps) && fps > 0)) throw new CueError(`fps must be a positive number (got ${fps})`);
  if (!Array.isArray(words)) throw new CueError("words must be an array of {text,start,end}");
  const { words: mapped, dropped } = mapScriptWords(script, words, { aliases, finalSilenceStart, junkLimit: o.junkLimit });
  const frame = 1 / fps;
  const minGap = o.minGapFrames * frame;
  const minCue = o.minCueFrames * frame;
  const cutList = cuts.map(Number).filter(Number.isFinite).sort((a, b) => a - b).map((raw) => ({ raw, at: ceilFrame(raw, fps) }));

  // 1. Group script words. Hard breaks first (sentence end, pause), then each run is split into
  //    the fewest balanced groups that keep to the word limit and the two-line character limit,
  //    so a long sentence never leaves a one-word orphan when the limit allows better.
  const runs = [];
  let run = [];
  mapped.forEach((w, i) => {
    run.push(w);
    const next = mapped[i + 1];
    if (!next) { runs.push({ words: run, break: "end" }); run = []; }
    else if (SENTENCE_END.test(w.text)) { runs.push({ words: run, break: "sentence" }); run = []; }
    else if (next.start - w.end >= o.pauseBreak - 1e-9) { runs.push({ words: run, break: "pause" }); run = []; }
  });
  const groups = [];
  runs.forEach((r, ri) => {
    const n = r.words.length;
    const byLimit = Math.ceil(n / limits.max);
    let chosen = null;
    const until = runs[ri + 1] ? runs[ri + 1].words[0].start : Infinity;
    for (let k = byLimit; k <= Math.min(n, byLimit + 3) && !chosen; k++) chosen = bestSplit(r.words, k, limits, o, until);
    // No split within reach fits the character limit: one word a group, and the lint reports it.
    const parts = chosen ? chosen.parts : r.words.map((w) => [w]);
    const k = parts.length;
    parts.forEach((g, j) => groups.push({ words: g, break: j === k - 1 ? r.break : k > byLimit ? "chars" : "limit" }));
  });

  // 2. Raw frame-aligned times: open at or before the first word, close at or after the last.
  const cues = groups.map((g, i) => {
    const text = g.words.map((w) => w.text).join(" ");
    const first = g.words[0], last = g.words[g.words.length - 1];
    return {
      id: `c${i + 1}`, text, lines: layoutLines(text, o.maxLineChars),
      start: floorFrame(first.start, fps), end: ceilFrame(last.end, fps),
      floor_end: ceilFrame(last.end, fps), word_start: first.start,
      words: g.words.map((w) => ({ text: w.text, asr: w.asr, start: w.start, end: w.end })),
      break: g.break, adjust: [],
    };
  });

  // 3. In-time snap: only to a cut at or before the first word, and clear of the previous cue.
  cues.forEach((c, i) => {
    const prevEnd = i ? cues[i - 1].floor_end : -Infinity;
    const s = snapCut(c.start, cutList, o.snapWindow, (cut) => cut.at <= c.start + EPS && cut.at >= prevEnd + minGap - EPS && cut.at >= 0);
    if (s && Math.abs(s.at - c.start) > EPS) { c.adjust.push(`in snapped to shot change ${s.raw}`); c.start = s.at; }
  });

  // 4. Out-time: reading floor (minimum cue, characters a second), shot-change snap, gap rules.
  cues.forEach((c, i) => {
    const next = cues[i + 1];
    const cap = next ? next.start - minGap : Infinity;
    // The next cue must be up when its first word starts, so this one gives way: it ends 2 frames
    // before the next opens even when its last word's measured end runs later (loose ASR ends).
    if (c.end > cap + EPS) { c.adjust.push(`out trimmed to ${r6(cap)} for the gap before ${next.id}`); c.end = Math.max(cap, c.start); }
    const minEnd = Math.min(c.floor_end, cap);
    const chars = c.lines.join(" ").length;
    const need = ceilFrame(Math.max(c.end, c.start + minCue, c.start + chars / o.maxCps), fps);
    if (need > c.end + EPS) {
      const to = Math.max(c.end, Math.min(need, cap));
      if (to > c.end + EPS) c.adjust.push(`out extended for the reading floor to ${r6(to)}`);
      c.end = to;
    }
    const okDur = (end) => end - c.start >= minCue - EPS && chars / (end - c.start) <= o.maxCps + EPS;
    const s = snapCut(c.end, cutList, o.snapWindow, (cut) => cut.at > c.start + EPS && cut.at <= cap + EPS && cut.at >= minEnd - EPS && okDur(cut.at));
    if (s && Math.abs(s.at - c.end) > EPS) { c.adjust.push(`out snapped to shot change ${s.raw}`); c.end = s.at; }
    if (next) {
      const gap = next.start - c.end;
      const crossesCut = cutList.some((cut) => cut.at >= c.end - EPS && cut.at < next.start - EPS);
      if (gap > minGap + EPS && gap < o.chainGapFrames * frame - EPS && !crossesCut) {
        c.adjust.push(`gap of ${Math.round(gap * fps)} frames closed to ${o.minGapFrames}`);
        c.end = next.start - minGap;
      }
    }
  });

  const out = cues.map((c) => {
    const start = r6(c.start), end = r6(c.end);
    const fadeStart = r6(Math.max(start, end - o.fadeOut));
    return {
      id: c.id, start, end, text: c.text, lines: c.lines, break: c.break,
      words: c.words.map((w) => ({ ...w, start: r6(w.start), end: r6(w.end) })),
      exit: { fade_start: fadeStart, fade_duration: r6(end - fadeStart), hidden_at: end },
      adjust: c.adjust,
    };
  });
  const asrDiffers = mapped.filter((w) => !w.matches).map((w) => ({ script: w.text, heard: w.asr, start: r6(w.start) }));
  return {
    schema: "mce.captioncues/1", clock: "ad", fps, energy, limits: { words: limits, ...pickLimits(o) },
    cues: out, lint: lintCues(out, { fps, cuts, options: o }), dropped, asr_differs: asrDiffers,
  };
}

function pickLimits(o) {
  return { pause_break: o.pauseBreak, max_line_chars: o.maxLineChars, max_lines: o.maxLines, max_cps: o.maxCps, min_gap_frames: o.minGapFrames, chain_gap_frames: o.chainGapFrames, min_cue_frames: o.minCueFrames, snap_window: o.snapWindow, fade_out: o.fadeOut };
}

/** Cues visible at time t: open from start, hidden from exit.hidden_at (or end). */
export function visibleAt(cues, t) {
  return cues.filter((c) => c.start <= t + EPS && t < (c.exit?.hidden_at ?? c.end) - EPS);
}

/**
 * Lint any cue list (built here or by hand). Returns { pass, counts, findings[] } where each
 * finding is { rule, severity: fail|warn|info, cue, message }.
 */
export function lintCues(cues, { fps = DEFAULTS.fps, cuts = [], options = {} } = {}) {
  const o = { ...DEFAULTS, ...options, fps };
  const frame = 1 / fps;
  const findings = [];
  const add = (rule, severity, cue, message) => findings.push({ rule, severity, cue, message });
  const f3 = (x) => Number(x).toFixed(3);
  const cutAt = cuts.map(Number).filter(Number.isFinite).map((c) => ceilFrame(c, fps));
  cues.forEach((c, i) => {
    const lines = c.lines ?? layoutLines(c.text, o.maxLineChars);
    const dur = c.end - c.start;
    const chars = lines.join(" ").length;
    if (!(dur > 0)) add("no_length", "fail", c.id, `runs ${f3(c.start)} to ${f3(c.end)}`);
    if (lines.length > o.maxLines) add("too_many_lines", "fail", c.id, `${lines.length} lines, limit ${o.maxLines}`);
    lines.forEach((l, k) => { if (l.length > o.maxLineChars) add("line_too_long", "fail", c.id, `line ${k + 1} has ${l.length} characters, limit ${o.maxLineChars}`); });
    if (dur > 0 && dur < o.minCueFrames * frame - EPS) add("under_min_duration", "fail", c.id, `${f3(dur)} s is under ${o.minCueFrames} frames (${f3(o.minCueFrames * frame)} s)`);
    if (dur > 0 && chars / dur > o.maxCps + EPS) add("cps_over", "fail", c.id, `${(chars / dur).toFixed(2)} characters a second, limit ${o.maxCps}`);
    const prev = cues[i - 1];
    if (prev) {
      const gap = c.start - prev.end;
      if (gap < -EPS) add("overlap", "fail", c.id, `starts ${f3(c.start)} before ${prev.id} ends ${f3(prev.end)}`);
      else if (gap < o.minGapFrames * frame - EPS) add("gap_under_min", "fail", c.id, `gap after ${prev.id} is ${Math.round(gap * fps)} frames, minimum ${o.minGapFrames}`);
    }
    const hidden = c.exit?.hidden_at ?? c.end;
    if (hidden > c.end + EPS) add("visible_after_end", "fail", c.id, `hidden at ${f3(hidden)}, after its end ${f3(c.end)}`);
    else if (visibleAt([c], c.end + o.lintProbe).length) add("visible_after_end", "fail", c.id, `still visible at end + ${o.lintProbe} s`);
    if (visibleAt(cues, c.start + EPS * 2).length > 1) add("two_visible", "fail", c.id, "more than one cue on screen");
    if (c.exit && c.exit.fade_start < c.start - EPS) add("fade_before_start", "fail", c.id, "exit fade starts before the cue opens");
    if (c.exit && dur > 0 && dur < o.fadeOut - EPS) add("fade_longer_than_cue", "warn", c.id, `cue is shorter than its ${o.fadeOut} s fade`);
    if (c.words?.length) {
      if (c.start > c.words[0].start + EPS) add("late_start", "fail", c.id, `opens ${f3(c.start)} after its first word at ${f3(c.words[0].start)}`);
      // A cue may close before its last word's end only to keep the minimum gap before the next cue.
      const lastEnd = Math.max(...c.words.map((w) => w.end));
      const next = cues[i + 1];
      const allowed = next ? Math.min(lastEnd, next.start - o.minGapFrames * frame) : lastEnd;
      if (c.end < allowed - EPS) add("early_end", "fail", c.id, `closes ${f3(c.end)} before its last word ends at ${f3(lastEnd)}`);
    }
    if (i === 0 && c.start < o.earlyStart - EPS) add("starts_at_zero", "warn", c.id, `opens at ${f3(c.start)} s; under ${o.earlyStart} s reads as pre-existing`);
    for (const at of cutAt) {
      if (at > c.start + 2 * frame + EPS && at < c.end - 2 * frame - EPS) add("crosses_cut", "warn", c.id, `stays on screen across the shot change at ${f3(at)}`);
    }
  });
  const counts = { fail: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return { pass: counts.fail === 0, counts, findings };
}

const pad = (n, w) => String(n).padStart(w, "0");
/** SRT time stamp, the same rounding make-srt.mjs uses (nearest millisecond). */
export function srtStamp(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`;
}

/** SRT text for cues, formatted as make-srt.mjs formats a storyboard (lines joined by newline). */
export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\n${(c.lines ?? [c.text]).join("\n")}\n`).join("\n");
}

// ---------------------------------------------------------------------------------------------
// CLI (the only part with I/O).
async function main(argv) {
  const fs = (await import("node:fs")).default;
  const path = (await import("node:path")).default;
  const valued = ["--phrases", "--whisper-cli", "--words", "--script", "--energy", "--fps", "--cuts", "--offset", "--alias", "--final-silence", "--out", "--srt"];
  const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const flags = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const die = (m) => { console.error(`cues: ${m}`); process.exit(1); };
  for (const a of argv) if (a.startsWith("--") && !valued.includes(a)) die(`unknown option ${a}`);
  const offset = Number(flag("--offset", "0"));
  const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  let words;
  if (flag("--phrases")) words = wordsFromPhraseMap(readJson(flag("--phrases")), offset);
  else if (flag("--whisper-cli")) words = wordsFromWhisperCli(readJson(flag("--whisper-cli")), offset);
  else if (flag("--words")) words = readJson(flag("--words")).map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
  else die("pass --phrases, --whisper-cli or --words");
  if (!flag("--script")) die("pass --script (the locked script; cue text comes only from it)");
  const script = fs.readFileSync(flag("--script"), "utf8");
  const cuts = (flag("--cuts", "") || "").split(",").filter(Boolean).map(Number);
  const fin = flag("--final-silence");
  let result;
  try {
    result = buildCues({ words, script, energy: flag("--energy", "conversational"), cuts, fps: Number(flag("--fps", "30")), aliases: flags("--alias"), finalSilenceStart: fin === undefined ? undefined : Number(fin) });
  } catch (e) {
    if (e instanceof CueError) die(`${e.message}${e.details?.diffs ? "\n" + e.details.diffs.map((d) => `  ${d.type} "${d.word}"`).join("\n") : ""}`);
    throw e;
  }
  for (const c of result.cues) console.log(`${c.id}  ${c.start.toFixed(3)}-${c.end.toFixed(3)}  ${c.lines.join(" / ")}  [${c.break}]`);
  for (const f of result.lint.findings) console.error(`cues: ${f.severity.toUpperCase()} ${f.rule} ${f.cue}: ${f.message}`);
  console.log(`lint: ${result.lint.pass ? "PASS" : "FAIL"} (${result.lint.counts.fail} fail, ${result.lint.counts.warn} warn)`);
  const write = (p, s) => { fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true }); fs.writeFileSync(p, s); };
  if (flag("--out")) write(flag("--out"), JSON.stringify(result, null, 2) + "\n");
  if (flag("--srt")) write(flag("--srt"), toSrt(result.cues));
  if (!result.lint.pass) process.exit(1);
}

const self = typeof process !== "undefined" && process.argv?.[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (self && import.meta.url.endsWith(self.split("/").slice(-2).join("/")) && self.endsWith("captions/cues.mjs")) {
  main(process.argv.slice(2));
}
