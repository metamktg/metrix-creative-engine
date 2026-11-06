/*
 * Frozen wave-0 contracts for the timeline module (references/timeline.md is the prose).
 *
 *   mce.phrasemap/1  voice clock: where each phrase and word sits in the accepted voice master
 *   mce.cutplan/1    authored: segments, named points, clips, shots, constraints, captions, audio
 *   mce.timeline/1   ad clock: the single timing truth every emitted artifact is derived from
 *   derived_from     the stamp an emitted storyboard carries back to its timeline.json
 *
 * Hand-written, no node_modules: the skill folder must run on its own once installed.
 * Every validator returns a list of error strings; an empty list is a pass. Shape rules come
 * from the field specs below (the same specs list the field paths the doc tables must cover);
 * the semantic rules that follow each spec are the invariants a well-formed file must hold
 * whatever the craft checks later say.
 */
import crypto from "node:crypto";

export const PHRASEMAP = "mce.phrasemap/1";
export const CUTPLAN = "mce.cutplan/1";
export const TIMELINE = "mce.timeline/1";
export const DERIVED_FROM = "derived_from";

const EPS = 1e-6;
/** Times are written rounded to 3 decimals, so derived equalities hold to this. */
export const ROUND_TOL = 1.5e-3;

// ---------- spec DSL
const num = (o = {}) => ({ t: "number", ...o });
const int = (o = {}) => ({ t: "integer", ...o });
const str = (o = {}) => ({ t: "string", ...o });
const bool = () => ({ t: "boolean" });
const lit = (value) => ({ t: "literal", value });
const oneOf = (...values) => ({ t: "enum", values });
const arr = (item, o = {}) => ({ t: "array", item, ...o });
const obj = (fields, o = {}) => ({ t: "object", fields, ...o });
const dict = (value) => ({ t: "dict", value });
const union = (key, variants) => ({ t: "union", key, variants });
const opt = (s) => ({ ...s, optional: true });
const nul = (s) => ({ ...s, nullable: true });

// Ids that references name (phrases, points, clips, shots and the rest) carry no + or -, so a
// trailing "+0.12" in a reference is never part of the id. Segment ids may join phrases with +.
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const SEG_ID = /^[A-Za-z0-9][A-Za-z0-9_+]*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const id = () => str({ pattern: ID });
const segId = () => str({ pattern: SEG_ID });
const hex = () => str({ pattern: HEX64 });
const time = () => num({ min: 0 });
const ref = () => ({ t: "ref" });
const ENTER = ["none", "fade", "rise", "slam", "pop", "type", "wipe"];
const SNAP = ["none", "up", "down", "nearest", "full_beat_pref", "beat_up"];
const KINDS = ["min_gap", "max_src", "hold_after", "read_after", "decay_after"];
const CAPTION_KINDS = ["voiceover", "hook", "cta", "label", "framing"];
const ROLES = ["hook", "show", "proof", "offer", "cta"];
const window = () => obj({ lo: time(), hi: time(), why: str({ min: 1 }) });
const RATIOS = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };
const ratio = () => obj({ ratio: oneOf(...Object.keys(RATIOS)), width: int({ min: 1 }), height: int({ min: 1 }) });
const fileRef = () => obj({ path: str({ min: 1 }), sha256: hex() });

const captionRules = () => obj({
  energy: opt(oneOf("high", "conversational", "calm")),
  lead_in: opt(num()), linger: opt(time()), min_cue: opt(time()), per_word: opt(time()),
  max_chars_line: opt(int({ min: 1 })), max_lines: opt(int({ min: 1, max: 2 })), max_cps: opt(num({ gt: 0 })),
  min_gap_frames: opt(int({ min: 0 })), exit_fade: opt(time()), snap_to_shot: opt(time()), pause_break: opt(time()),
});

export const SPECS = {
  [PHRASEMAP]: obj({
    schema: lit(PHRASEMAP),
    clock: lit("voice"),
    voice: obj({ path: str({ min: 1 }), sha256: nul(hex()), duration: num({ gt: 0 }), sample_rate: nul(int({ min: 1 })), channels: nul(int({ min: 1 })) }),
    edges: obj({ method: oneOf("silencedetect", "manual"), noise: nul(str()), min_gap: nul(time()) }),
    words_source: obj({
      method: oneOf("ffmpeg-whisper", "whisper-cli-dtw", "whisperx", "words-file", "none"),
      model: nul(str()),
      qualified_against: nul(str({ min: 1 })),
    }),
    phrases: arr(obj({
      id: id(), start: time(), end: time(), text: str(),
      words: arr(obj({ text: str({ min: 1 }), start: time(), end: time(), p: opt(nul(num({ min: 0, max: 1 }))) })),
    }), { min: 1 }),
    splits: arr(obj({ id: id(), phrase: id(), at: time(), window: arr(time(), { min: 2, max: 2 }), method: oneOf("energy-dip", "manual") })),
    script_check: nul(obj({
      verdict: oneOf("MATCH", "MISMATCH"),
      diffs: arr(obj({ type: oneOf("missing", "extra"), word: str(), index: int({ min: 0 }) })),
      note: str(),
    })),
  }),

  [CUTPLAN]: obj({
    schema: lit(CUTPLAN),
    name: str({ min: 1 }),
    phrasemap: nul(fileRef()),
    fps: num({ gt: 0 }),
    grid: obj({ bpm: num({ gt: 0 }), div: int({ min: 1 }), origin: time() }),
    edit: obj({ pre: time(), post: time(), lead: time(), tail: time(), prefer_full_beat_cost: time(), time_dp: int({ min: 0, max: 6 }), duration_dp: int({ min: 0, max: 6 }) }),
    rules: obj({ min_shot: time() }),
    segments: arr(obj({
      id: segId(),
      phrases: arr(id(), { min: 1 }),
      place: union("mode", {
        start: obj({ mode: lit("start"), at: time() }),
        gap: obj({ mode: lit("gap") }),
        sync: obj({ mode: lit("sync"), voice_at: time(), point: id() }),
        after: obj({ mode: lit("after"), point: id() }),
      }),
      snap: oneOf(...SNAP),
    }), { min: 1 }),
    points: arr(obj({ id: id(), kind: oneOf("cut", "event"), from: nul(ref()), snap: oneOf(...SNAP) })),
    clips: arr(obj({
      id: id(), file: str({ min: 1 }), duration: num({ gt: 0 }), fps: num({ gt: 0 }),
      clock: oneOf("voice", "own"), voice_base: nul(num()),
      events: dict(time()),
      reject: arr(window()), residual: arr(window()),
    })),
    shots: arr(obj({ id: id(), source: nul(id()), label: str(), from: ref(), to: ref(), src_in: nul(time()) }), { min: 1 }),
    scenes: arr(obj({ id: id(), role: oneOf(...ROLES), from: ref(), to: ref(), visual: str({ min: 1 }) }), { min: 1 }),
    storyboard: obj({ brief_id: nul(str({ min: 1 })), tone: str({ min: 1 }), poster_at: ref(), lufs: num({ max: 0 }), ratios: arr(ratio(), { min: 1 }), modes: arr(oneOf("cap", "clean"), { min: 1, max: 2 }) }),
    constraints: arr(obj({ id: id(), kind: oneOf(...KINDS), a: ref(), b: nul(ref()), s: num(), why: str({ min: 1 }) })),
    captions: obj({
      builder: oneOf("auto", "manual"),
      rules: captionRules(),
      groups: arr(obj({
        id: id(), kind: oneOf(...CAPTION_KINDS), copy: str({ min: 1 }), source: str({ min: 1 }),
        deliver: arr(oneOf("burn", "srt"), { min: 1, max: 2 }),
        phrases: arr(id()),
        split: nul(obj({ id: id(), side: oneOf("before", "after") })),
        from: nul(ref()), to: nul(ref()), not_before: nul(ref()), not_after: nul(ref()), lead_in: nul(num()),
        cls: nul(str()), enter: oneOf(...ENTER), enter_dur: nul(time()),
      })),
    }),
    audio: obj({
      voice: obj({ file: str({ min: 1 }), chain: nul(dict({ t: "any" })) }),
      sfx: arr(obj({ id: id(), file: str({ min: 1 }), at: ref(), volume: num({ gt: 0, max: 1 }), why: str({ min: 1 }) })),
      music: nul(obj({
        file: str({ min: 1 }), volume: num({ gt: 0, max: 0.5 }), fade_in: time(), fade_out: time(), licence: str({ min: 1 }),
        sections: arr(obj({ at: ref(), snap: oneOf(...SNAP), energy: int({ min: 0 }), chord: opt(arr(int())), root: opt(int()) }), { min: 1 }),
      })),
    }),
    outputs: obj({ tm: nul(dict(ref())) }),
  }),

  [TIMELINE]: obj({
    schema: lit(TIMELINE),
    name: str({ min: 1 }),
    clock: lit("ad"),
    fps: num({ gt: 0 }),
    duration: num({ gt: 0 }),
    grid: obj({ bpm: num({ gt: 0 }), div: int({ min: 1 }), unit: num({ gt: 0 }), origin: time() }),
    inputs: obj({
      phrasemap: nul(obj({ path: str({ min: 1 }), sha256: hex(), schema: lit(PHRASEMAP) })),
      cutplan: obj({ path: str({ min: 1 }), sha256: hex(), schema: lit(CUTPLAN) }),
    }),
    segments: arr(obj({
      id: segId(), phrases: arr(id(), { min: 1 }),
      src_in: time(), src_out: time(), out_in: num(), out_out: num(), offset: num(), speed: lit(1),
      audio_cut: num(), picture_cut: nul(num()),
    })),
    phrases: arr(obj({
      id: id(), segment: segId(), text: str(), src_start: time(), src_end: time(), start: time(), end: time(),
      words: arr(obj({ text: str({ min: 1 }), start: time(), end: time() })),
    })),
    points: arr(obj({ id: id(), kind: oneOf("cut", "event"), t: time() })),
    shots: arr(obj({
      id: id(), source: nul(id()), file: nul(str({ min: 1 })), label: str(),
      out_in: time(), out_out: time(),
      src_in: nul(time()), src_out: nul(time()), src_fps: nul(num({ gt: 0 })), src_duration: nul(num({ gt: 0 })),
      reject: arr(window()), residual: arr(window()),
    }), { min: 1 }),
    scenes: arr(obj({ id: id(), role: oneOf(...ROLES), start: time(), end: time(), visual: str({ min: 1 }) }), { min: 1 }),
    storyboard: obj({ brief_id: nul(str({ min: 1 })), tone: str({ min: 1 }), poster_at: time(), lufs: num({ max: 0 }), ratios: arr(ratio(), { min: 1 }), modes: arr(oneOf("cap", "clean"), { min: 1, max: 2 }) }),
    captions: obj({
      builder: oneOf("auto", "manual"),
      rules: captionRules(),
      groups: arr(obj({
        id: id(), kind: oneOf(...CAPTION_KINDS), source: str({ min: 1 }),
        deliver: arr(oneOf("burn", "srt"), { min: 1, max: 2 }),
        start: time(), end: time(), text: str({ min: 1 }),
        lines: arr(str({ min: 1 }), { min: 1, max: 2 }),
        words: arr(obj({ text: str({ min: 1 }), start: nul(time()), end: nul(time()), line: int({ min: 0, max: 1 }) }), { min: 1 }),
        phrases: arr(id()),
        cls: nul(str()), enter: oneOf(...ENTER), enter_dur: nul(time()), exit_fade: nul(time()),
      })),
    }),
    audio: obj({
      voice: obj({ file: str({ min: 1 }), chain: nul(dict({ t: "any" })) }),
      sfx: arr(obj({ id: id(), file: str({ min: 1 }), at: time(), volume: num({ gt: 0, max: 1 }), why: str({ min: 1 }) })),
      music: nul(obj({
        file: str({ min: 1 }), volume: num({ gt: 0, max: 0.5 }), fade_in: time(), fade_out: time(), licence: str({ min: 1 }),
        sections: arr(obj({ from: time(), to: time(), energy: int({ min: 0 }), chord: opt(arr(int())), root: opt(int()) }), { min: 1 }),
      })),
    }),
    tm: nul(dict({ t: "any" })),
  }),

  [DERIVED_FROM]: obj({ path: str({ min: 1 }), sha256: hex(), schema: lit(TIMELINE), tm_sha256: nul(hex()) }),
};

// ---------- shape validation
const kindOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function check(spec, v, at, errs) {
  if (v === null) {
    if (!spec.nullable) errs.push(`${at}: must not be null`);
    return;
  }
  switch (spec.t) {
    case "any": return;
    case "literal": if (v !== spec.value) errs.push(`${at}: must be ${JSON.stringify(spec.value)}`); return;
    case "enum": if (!spec.values.includes(v)) errs.push(`${at}: must be one of ${spec.values.join("|")}`); return;
    case "boolean": if (typeof v !== "boolean") errs.push(`${at}: must be a boolean`); return;
    case "number": case "integer": {
      if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${at}: must be a finite number`); return; }
      if (spec.t === "integer" && !Number.isInteger(v)) errs.push(`${at}: must be an integer`);
      if (spec.min !== undefined && v < spec.min) errs.push(`${at}: must be >= ${spec.min}`);
      if (spec.gt !== undefined && !(v > spec.gt)) errs.push(`${at}: must be > ${spec.gt}`);
      if (spec.max !== undefined && v > spec.max) errs.push(`${at}: must be <= ${spec.max}`);
      return;
    }
    case "string": case "ref": {
      if (typeof v !== "string") { errs.push(`${at}: must be a string`); return; }
      if (spec.min !== undefined && v.length < spec.min) errs.push(`${at}: must not be empty`);
      if (spec.pattern && !spec.pattern.test(v)) errs.push(`${at}: ${JSON.stringify(v)} does not match ${spec.pattern}`);
      if (spec.t === "ref" && !parseRef(v)) errs.push(`${at}: ${JSON.stringify(v)} is not a timeline reference`);
      return;
    }
    case "array": {
      if (!Array.isArray(v)) { errs.push(`${at}: must be an array`); return; }
      if (spec.min !== undefined && v.length < spec.min) errs.push(`${at}: needs at least ${spec.min} item(s)`);
      if (spec.max !== undefined && v.length > spec.max) errs.push(`${at}: allows at most ${spec.max} item(s)`);
      v.forEach((x, i) => check(spec.item, x, `${at}[${i}]`, errs));
      return;
    }
    case "dict": {
      if (kindOf(v) !== "object") { errs.push(`${at}: must be an object`); return; }
      for (const [k, x] of Object.entries(v)) check(spec.value, x, `${at}.${k}`, errs);
      return;
    }
    case "union": {
      if (kindOf(v) !== "object") { errs.push(`${at}: must be an object`); return; }
      const variant = spec.variants[v[spec.key]];
      if (!variant) { errs.push(`${at}.${spec.key}: must be one of ${Object.keys(spec.variants).join("|")}`); return; }
      check(variant, v, at, errs);
      return;
    }
    case "object": {
      if (kindOf(v) !== "object") { errs.push(`${at}: must be an object`); return; }
      for (const [k, s] of Object.entries(spec.fields)) {
        if (!(k in v)) { if (!s.optional) errs.push(`${at ? at + "." : ""}${k}: required`); continue; }
        check(s, v[k], at ? `${at}.${k}` : k, errs);
      }
      for (const k of Object.keys(v)) if (!(k in spec.fields)) errs.push(`${at ? at + "." : ""}${k}: unknown field`);
      return;
    }
    default: throw new Error(`schema.mjs: unknown spec type ${spec.t}`);
  }
}

/** Every field path a spec defines, in the notation the doc tables use (`a.b[].c`, `a.<key>`). */
export function fieldPaths(spec, prefix = "") {
  const out = [];
  const walk = (s, p) => {
    if (s.t === "object") for (const [k, f] of Object.entries(s.fields)) { const q = p ? `${p}.${k}` : k; out.push(q); walk(f, q); }
    else if (s.t === "union") {
      const seen = new Set();
      for (const v of Object.values(s.variants)) for (const [k, f] of Object.entries(v.fields)) {
        const q = `${p}.${k}`;
        if (!seen.has(q)) { seen.add(q); out.push(q); }
        walk(f, q);
      }
    } else if (s.t === "array") walk(s.item, `${p}[]`);
    else if (s.t === "dict" && s.value.t !== "any") { out.push(`${p}.<key>`); walk(s.value, `${p}.<key>`); }
  };
  walk(spec, prefix);
  return [...new Set(out)];
}

// ---------- references (cutplan)
const NUM = "[0-9]+(?:\\.[0-9]+)?";
const RID = "[A-Za-z][A-Za-z0-9_]*";
const REF = new RegExp(
  "^(?:(start|end)|point\\.(" + RID + ")|phrase\\.(" + RID + ")\\.(start|end)" +
  "|segment\\.([A-Za-z0-9][A-Za-z0-9_+]*)\\.cut|voice@(" + NUM + ")|clip\\.(" + RID + ")@(" + NUM + ")" +
  "|shot\\.(" + RID + ")(?:\\.(in|out))?)" +
  "(?:([+-])(" + NUM + "))?$",
);

/**
 * Parse a cut-plan reference. Returns null when the text is not a reference.
 * { kind: 'start'|'end'|'point'|'phrase'|'segment'|'voice'|'clip'|'shot', id?, edge?, t?, add }
 */
export function parseRef(text) {
  if (typeof text !== "string") return null;
  const m = REF.exec(text);
  if (!m) return null;
  const add = m[12] ? (m[11] === "-" ? -1 : 1) * Number(m[12]) : 0;
  if (m[1]) return { kind: m[1], add };
  if (m[2]) return { kind: "point", id: m[2], add };
  if (m[3]) return { kind: "phrase", id: m[3], edge: m[4], add };
  if (m[5]) return { kind: "segment", id: m[5], add };
  if (m[6]) return { kind: "voice", t: Number(m[6]), add };
  if (m[7]) return { kind: "clip", id: m[7], t: Number(m[8]), add };
  return { kind: "shot", id: m[9], edge: m[10] ?? null, add };
}

// ---------- semantic helpers
function ratioErrs(sb, errs) {
  sb.ratios.forEach((r, i) => {
    if (Math.abs(r.width / r.height - RATIOS[r.ratio]) > 0.01 * RATIOS[r.ratio]) errs.push(`storyboard.ratios[${i}]: ${r.width}x${r.height} is not ${r.ratio}`);
  });
  if (new Set(sb.ratios.map((r) => r.ratio)).size !== sb.ratios.length) errs.push("storyboard.ratios: duplicate ratio");
  if (new Set(sb.modes).size !== sb.modes.length) errs.push("storyboard.modes: duplicate mode");
}
function dupes(list, what, at, errs) {
  const seen = new Set();
  for (const x of list) { if (seen.has(x)) errs.push(`${at}: duplicate ${what} id ${JSON.stringify(x)}`); seen.add(x); }
  return seen;
}
const okNum = (x) => typeof x === "number" && Number.isFinite(x);
const shapeOf = (schema, value) => { const errs = []; check(SPECS[schema], value, "", errs); return errs; };

// ---------- mce.phrasemap/1
export function validatePhraseMap(pm) {
  const errs = shapeOf(PHRASEMAP, pm);
  if (errs.length) return errs;
  const dur = pm.voice.duration;
  dupes(pm.phrases.map((p) => p.id), "phrase", "phrases", errs);
  pm.phrases.forEach((p, i) => {
    const at = `phrases[${i}]`;
    if (!(p.end > p.start)) errs.push(`${at}: end ${p.end} must be after start ${p.start}`);
    if (p.end > dur + EPS) errs.push(`${at}: end ${p.end} is past the voice duration ${dur}`);
    if (i > 0 && p.start < pm.phrases[i - 1].end - EPS) errs.push(`${at}: starts ${p.start} before phrase ${pm.phrases[i - 1].id} ends ${pm.phrases[i - 1].end}`);
    p.words.forEach((w, j) => {
      if (w.end < w.start) errs.push(`${at}.words[${j}]: end before start`);
      if (j > 0 && w.start < p.words[j - 1].start - EPS) errs.push(`${at}.words[${j}]: words out of order`);
    });
  });
  const byId = new Map(pm.phrases.map((p) => [p.id, p]));
  dupes(pm.splits.map((s) => s.id), "split", "splits", errs);
  pm.splits.forEach((s, i) => {
    const at = `splits[${i}]`;
    const [lo, hi] = s.window;
    if (!(hi > lo)) errs.push(`${at}.window: must be [lo, hi] with hi > lo`);
    if (s.at < lo - EPS || s.at > hi + EPS) errs.push(`${at}.at: ${s.at} is outside its window [${lo}, ${hi}]`);
    const p = byId.get(s.phrase);
    if (!p) errs.push(`${at}.phrase: no phrase ${JSON.stringify(s.phrase)}`);
    else if (s.at <= p.start || s.at >= p.end) errs.push(`${at}.at: ${s.at} is not inside phrase ${p.id} (${p.start} to ${p.end})`);
  });
  if (pm.words_source.method === "whisperx" && !pm.words_source.qualified_against)
    errs.push("words_source.qualified_against: whisperX words are not used until they are measured against hand labels; name the measurement");
  if (pm.words_source.method === "none" && pm.phrases.some((p) => p.words.length)) errs.push("words_source.method: is none but phrases carry words");
  return errs;
}

/**
 * Wrap the object phrase-map.mjs writes today ({ input, duration, silencedetect, phrases, script_check })
 * as mce.phrasemap/1. Facts phrase-map does not record (hash, sample rate, word method) come in opts.
 */
export function fromPhraseMapResult(result, opts = {}) {
  return {
    schema: PHRASEMAP,
    clock: "voice",
    voice: { path: result.input, sha256: opts.sha256 ?? null, duration: result.duration, sample_rate: opts.sample_rate ?? null, channels: opts.channels ?? null },
    edges: { method: "silencedetect", noise: result.silencedetect?.noise ?? null, min_gap: result.silencedetect?.min_gap ?? null },
    words_source: { method: opts.words_method ?? "ffmpeg-whisper", model: opts.model ?? null, qualified_against: opts.qualified_against ?? null },
    phrases: result.phrases.map((p) => ({ id: p.id, start: p.start, end: p.end, text: p.text ?? "", words: (p.words ?? []).map((w) => ({ text: w.text, start: w.start, end: w.end })) })),
    splits: opts.splits ?? [],
    script_check: result.script_check ?? null,
  };
}

// ---------- mce.cutplan/1
export function validateCutPlan(cp) {
  const errs = shapeOf(CUTPLAN, cp);
  if (errs.length) return errs;
  const phraseIds = cp.segments.flatMap((s) => s.phrases);
  const phrases = dupes(phraseIds, "phrase", "segments[].phrases", errs);
  const segments = dupes(cp.segments.map((s) => s.id), "segment", "segments", errs);
  const points = dupes(cp.points.map((p) => p.id), "point", "points", errs);
  dupes(cp.clips.map((c) => c.id), "clip", "clips", errs);
  const shots = dupes(cp.shots.map((s) => s.id), "shot", "shots", errs);
  dupes(cp.scenes.map((s) => s.id), "scene", "scenes", errs);
  dupes(cp.constraints.map((c) => c.id), "constraint", "constraints", errs);
  dupes(cp.captions.groups.map((g) => g.id), "caption group", "captions.groups", errs);
  dupes(cp.audio.sfx.map((s) => s.id), "sfx", "audio.sfx", errs);
  const clipById = new Map(cp.clips.map((c) => [c.id, c]));

  const refErr = (text, at, { allowShotBare = false } = {}) => {
    const r = parseRef(text);
    if (!r) return errs.push(`${at}: ${JSON.stringify(text)} is not a reference`);
    if (r.kind === "point" && !points.has(r.id)) errs.push(`${at}: no point ${JSON.stringify(r.id)}`);
    if (r.kind === "phrase" && !phrases.has(r.id)) errs.push(`${at}: no phrase ${JSON.stringify(r.id)} in segments`);
    if (r.kind === "segment" && !segments.has(r.id)) errs.push(`${at}: no segment ${JSON.stringify(r.id)}`);
    if (r.kind === "clip") {
      const c = clipById.get(r.id);
      if (!c) errs.push(`${at}: no clip ${JSON.stringify(r.id)}`);
      else if (r.t > c.duration + EPS) errs.push(`${at}: clip time ${r.t} is past ${c.id}'s duration ${c.duration}`);
    }
    if (r.kind === "shot") {
      if (!shots.has(r.id)) errs.push(`${at}: no shot ${JSON.stringify(r.id)}`);
      if (r.edge === null && !allowShotBare) errs.push(`${at}: a shot reference needs .in or .out here`);
    }
    return 0;
  };

  cp.segments.forEach((s, i) => {
    const at = `segments[${i}]`;
    const p = s.place;
    if (i === 0 && p.mode === "gap") errs.push(`${at}.place: the first segment has no previous phrase to keep a gap from`);
    if ((p.mode === "sync" || p.mode === "after") && !points.has(p.point)) errs.push(`${at}.place.point: no point ${JSON.stringify(p.point)}`);
    if (p.mode === "gap" && i > 0) {
      const prevEnd = `phrase.${cp.segments[i - 1].phrases.at(-1)}.end`;
      const first = `phrase.${s.phrases[0]}.start`;
      const placing = cp.constraints.filter((c) => c.kind === "min_gap" && c.b === first && c.a === prevEnd);
      if (placing.length !== 1) errs.push(`${at}.place: a gap segment needs exactly one min_gap constraint with a "${prevEnd}" and b "${first}" (found ${placing.length})`);
    }
  });

  cp.points.forEach((p, i) => {
    const at = `points[${i}]`;
    if (p.from !== null) { refErr(p.from, `${at}.from`); return; }
    const placing = cp.constraints.filter((c) => (c.kind === "read_after" || c.kind === "hold_after") && c.b === `point.${p.id}`);
    if (!placing.length) errs.push(`${at}: has no from, so it needs a read_after or hold_after constraint with b "point.${p.id}"`);
    if (p.snap === "down" || p.snap === "nearest") errs.push(`${at}.snap: a point placed by constraints must snap none, up, full_beat_pref or beat_up (snapping earlier breaks the constraint)`);
  });

  cp.clips.forEach((c, i) => {
    const at = `clips[${i}]`;
    if (c.clock === "voice" && c.voice_base === null) errs.push(`${at}.voice_base: required for a voice-clock clip (clip time = voice time - voice_base)`);
    if (c.clock === "own" && c.voice_base !== null) errs.push(`${at}.voice_base: must be null for an own-clock clip`);
    for (const [k, t] of Object.entries(c.events)) if (t > c.duration + EPS) errs.push(`${at}.events.${k}: ${t} is past the clip duration ${c.duration}`);
    for (const key of ["reject", "residual"]) c[key].forEach((w, j) => {
      if (!(w.hi > w.lo)) errs.push(`${at}.${key}[${j}]: hi must be greater than lo`);
      if (w.hi > c.duration + EPS) errs.push(`${at}.${key}[${j}]: hi ${w.hi} is past the clip duration ${c.duration}`);
    });
  });

  cp.shots.forEach((s, i) => {
    const at = `shots[${i}]`;
    refErr(s.from, `${at}.from`);
    refErr(s.to, `${at}.to`);
    if (s.source === null) { if (s.src_in !== null) errs.push(`${at}.src_in: must be null for a shot with no source clip`); return; }
    const c = clipById.get(s.source);
    if (!c) { errs.push(`${at}.source: no clip ${JSON.stringify(s.source)}`); return; }
    if (c.clock === "own" && s.src_in === null) errs.push(`${at}.src_in: required for an own-clock clip`);
    if (c.clock === "voice" && s.src_in !== null) errs.push(`${at}.src_in: must be null for a voice-clock clip (it follows the voice)`);
    if (s.src_in !== null && s.src_in > c.duration + EPS) errs.push(`${at}.src_in: ${s.src_in} is past the clip duration ${c.duration}`);
  });
  if (cp.shots[0] && cp.shots[0].from !== "start") errs.push(`shots[0].from: the first shot must start at "start"`);
  if (cp.shots.at(-1) && cp.shots.at(-1).to !== "end") errs.push(`shots[${cp.shots.length - 1}].to: the last shot must end at "end"`);
  cp.shots.forEach((s, i) => { if (i > 0 && s.from !== cp.shots[i - 1].to) errs.push(`shots[${i}].from: must equal the previous shot's to (${cp.shots[i - 1].to}); shots tile the ad`); });

  cp.scenes.forEach((s, i) => {
    refErr(s.from, `scenes[${i}].from`);
    refErr(s.to, `scenes[${i}].to`);
    if (i > 0 && s.from !== cp.scenes[i - 1].to) errs.push(`scenes[${i}].from: must equal the previous scene's to`);
  });
  refErr(cp.storyboard.poster_at, "storyboard.poster_at");
  ratioErrs(cp.storyboard, errs);
  if (cp.scenes[0].from !== "start") errs.push(`scenes[0].from: the first scene must start at "start"`);
  if (cp.scenes.at(-1).to !== "end") errs.push(`scenes[${cp.scenes.length - 1}].to: the last scene must end at "end"`);

  cp.constraints.forEach((c, i) => {
    const at = `constraints[${i}]`;
    if (c.kind === "max_src") {
      const r = parseRef(c.a);
      if (!r || r.kind !== "shot" || r.edge !== null) errs.push(`${at}.a: max_src takes a bare shot reference ("shot.<id>")`);
      else refErr(c.a, `${at}.a`, { allowShotBare: true });
      if (c.b !== null) errs.push(`${at}.b: must be null for max_src`);
      return;
    }
    refErr(c.a, `${at}.a`);
    if (c.b === null) errs.push(`${at}.b: required for ${c.kind}`);
    else refErr(c.b, `${at}.b`);
  });

  cp.captions.groups.forEach((g, i) => {
    const at = `captions.groups[${i}]`;
    for (const k of ["from", "to", "not_before", "not_after"]) if (g[k] !== null) refErr(g[k], `${at}.${k}`);
    for (const p of g.phrases) if (!phrases.has(p)) errs.push(`${at}.phrases: no phrase ${JSON.stringify(p)} in segments`);
    if (g.kind === "voiceover" && !g.phrases.length) errs.push(`${at}.phrases: a voiceover group names the phrases it captions`);
    if (g.kind !== "voiceover" && (g.from === null || g.to === null)) errs.push(`${at}: a ${g.kind} group needs from and to`);
    if (g.split !== null && g.phrases.length === 0) errs.push(`${at}.split: needs the phrase it splits in phrases`);
    if (g.kind !== "voiceover" && g.deliver.includes("srt")) errs.push(`${at}.deliver: only voiceover groups go to the SRT`);
    if (new Set(g.deliver).size !== g.deliver.length) errs.push(`${at}.deliver: duplicate entry`);
  });
  if (cp.captions.builder === "manual" && !cp.captions.groups.some((g) => g.kind === "voiceover") && phraseIds.length)
    errs.push("captions.groups: a manual builder with spoken phrases needs voiceover groups");

  cp.audio.sfx.forEach((s, i) => refErr(s.at, `audio.sfx[${i}].at`));
  cp.audio.music?.sections.forEach((s, i) => refErr(s.at, `audio.music.sections[${i}].at`));
  for (const [k, r] of Object.entries(cp.outputs.tm ?? {})) refErr(r, `outputs.tm.${k}`);
  return errs;
}

/** Cross-check a cut plan against the phrase map it names (ids, splits, voice and clip times). */
export function validatePlanInputs(pm, cp) {
  const errs = [...validatePhraseMap(pm).map((e) => `phrasemap ${e}`), ...validateCutPlan(cp).map((e) => `cutplan ${e}`)];
  if (errs.length) return errs;
  const pmIds = new Set(pm.phrases.map((p) => p.id));
  const used = cp.segments.flatMap((s) => s.phrases);
  for (const p of used) if (!pmIds.has(p)) errs.push(`cutplan segments: phrase ${JSON.stringify(p)} is not in the phrase map`);
  for (const p of pmIds) if (!used.includes(p)) errs.push(`cutplan segments: phrase ${JSON.stringify(p)} from the phrase map is not placed (drop it in the phrase map, not by omission)`);
  const order = pm.phrases.map((p) => p.id).filter((p) => used.includes(p));
  if (order.join(" ") !== used.filter((p) => pmIds.has(p)).join(" ")) errs.push("cutplan segments: phrases must keep voice order");
  const splits = new Map(pm.splits.map((s) => [s.id, s]));
  cp.captions.groups.forEach((g, i) => {
    if (g.split === null) return;
    const s = splits.get(g.split.id);
    if (!s) errs.push(`cutplan captions.groups[${i}].split: no split ${JSON.stringify(g.split.id)} in the phrase map`);
    else if (!g.phrases.includes(s.phrase)) errs.push(`cutplan captions.groups[${i}].split: split ${s.id} is in phrase ${s.phrase}, which the group does not caption`);
  });
  const refs = [...cp.points.map((p) => p.from), ...cp.shots.flatMap((s) => [s.from, s.to]), ...cp.constraints.flatMap((c) => [c.a, c.b]),
    ...cp.audio.sfx.map((s) => s.at), ...Object.values(cp.outputs.tm ?? {})].filter(Boolean);
  for (const r of refs) {
    const x = parseRef(r);
    if (x?.kind === "voice" && x.t > pm.voice.duration + EPS) errs.push(`cutplan reference ${r}: past the voice duration ${pm.voice.duration}`);
  }
  for (const s of cp.segments) if (s.place.mode === "sync" && s.place.voice_at > pm.voice.duration + EPS) errs.push(`cutplan segment ${s.id}: voice_at past the voice duration`);
  return errs;
}

// ---------- mce.timeline/1
export function validateTimeline(tl) {
  const errs = shapeOf(TIMELINE, tl);
  if (errs.length) return errs;
  const D = tl.duration;
  const within = (t, at) => { if (t < -EPS || t > D + EPS) errs.push(`${at}: ${t} is outside 0 to ${D}`); };
  const beat = 60 / tl.grid.bpm;
  if (Math.abs(tl.grid.unit - beat / tl.grid.div) > 1e-9) errs.push(`grid.unit: must be 60 / bpm / div = ${beat / tl.grid.div}`);

  dupes(tl.segments.map((s) => s.id), "segment", "segments", errs);
  tl.segments.forEach((s, i) => {
    const at = `segments[${i}]`;
    if (!(s.src_out > s.src_in)) errs.push(`${at}: src_out must be after src_in`);
    if (Math.abs((s.out_out - s.out_in) - (s.src_out - s.src_in)) > ROUND_TOL) errs.push(`${at}: out length differs from source length (speech is never retimed)`);
    if (Math.abs(s.out_in - s.src_in - s.offset) > ROUND_TOL) errs.push(`${at}.offset: must equal out_in - src_in`);
    within(s.out_in, `${at}.out_in`); within(s.out_out, `${at}.out_out`); within(s.audio_cut, `${at}.audio_cut`);
    if (i > 0 && s.out_in < tl.segments[i - 1].out_out - EPS) errs.push(`${at}: overlaps segment ${tl.segments[i - 1].id}`);
    if (s.picture_cut !== null && !tl.shots.some((x) => Math.abs(x.out_in - s.picture_cut) <= EPS)) errs.push(`${at}.picture_cut: ${s.picture_cut} is not a shot boundary`);
  });

  const phraseIds = dupes(tl.phrases.map((p) => p.id), "phrase", "phrases", errs);
  const segById = new Map(tl.segments.map((s) => [s.id, s]));
  const listed = tl.segments.flatMap((s) => s.phrases);
  if (listed.join(" ") !== tl.phrases.map((p) => p.id).join(" ")) errs.push("phrases: must list exactly the segments' phrases, in order");
  tl.phrases.forEach((p, i) => {
    const at = `phrases[${i}]`;
    const s = segById.get(p.segment);
    if (!s) { errs.push(`${at}.segment: no segment ${JSON.stringify(p.segment)}`); return; }
    if (!s.phrases.includes(p.id)) errs.push(`${at}.segment: segment ${s.id} does not list ${p.id}`);
    if (!(p.end > p.start)) errs.push(`${at}: end must be after start`);
    if (Math.abs(p.start - (p.src_start + s.offset)) > ROUND_TOL || Math.abs(p.end - (p.src_end + s.offset)) > ROUND_TOL) errs.push(`${at}: start/end must be src_start/src_end + the segment offset`);
    if (p.start < s.out_in - EPS || p.end > s.out_out + EPS) errs.push(`${at}: lies outside its segment ${s.id}`);
    p.words.forEach((w, j) => { if (w.end < w.start) errs.push(`${at}.words[${j}]: end before start`); within(w.start, `${at}.words[${j}].start`); });
  });

  dupes(tl.points.map((p) => p.id), "point", "points", errs);
  tl.points.forEach((p, i) => within(p.t, `points[${i}].t`));

  dupes(tl.shots.map((s) => s.id), "shot", "shots", errs);
  if (Math.abs(tl.shots[0].out_in) > EPS) errs.push("shots[0].out_in: the first shot starts at 0");
  if (Math.abs(tl.shots.at(-1).out_out - D) > EPS) errs.push(`shots[${tl.shots.length - 1}].out_out: the last shot ends at duration ${D}`);
  tl.shots.forEach((s, i) => {
    const at = `shots[${i}]`;
    if (!(s.out_out > s.out_in)) errs.push(`${at}: out_out must be after out_in`);
    if (i > 0 && Math.abs(s.out_in - tl.shots[i - 1].out_out) > EPS) errs.push(`${at}.out_in: must equal the previous shot's out_out (shots tile the ad, one picture at a time)`);
    const srcFields = ["file", "src_in", "src_out", "src_fps", "src_duration"];
    if (s.source === null) {
      for (const k of srcFields) if (s[k] !== null) errs.push(`${at}.${k}: must be null for a shot with no source clip`);
      if (s.reject.length || s.residual.length) errs.push(`${at}: reject and residual windows need a source clip`);
      return;
    }
    for (const k of srcFields) if (s[k] === null) errs.push(`${at}.${k}: required for a shot with a source clip`);
    if (!okNum(s.src_in) || !okNum(s.src_out) || !okNum(s.src_duration)) return;
    if (Math.abs((s.src_out - s.src_in) - (s.out_out - s.out_in)) > ROUND_TOL) errs.push(`${at}: source range length differs from its screen time (speed 1)`);
    if (s.src_out > s.src_duration + EPS) errs.push(`${at}.src_out: ${s.src_out} is past the clip's ${s.src_duration} s`);
    for (const key of ["reject", "residual"]) s[key].forEach((w, j) => {
      if (!(w.hi > w.lo)) errs.push(`${at}.${key}[${j}]: hi must be greater than lo`);
      if (w.hi > s.src_duration + EPS) errs.push(`${at}.${key}[${j}]: past the clip's ${s.src_duration} s`);
    });
  });

  tl.scenes.forEach((s, i) => {
    if (!(s.end > s.start)) errs.push(`scenes[${i}]: end must be after start`);
    if (i > 0 && Math.abs(s.start - tl.scenes[i - 1].end) > EPS) errs.push(`scenes[${i}].start: must equal the previous scene's end`);
  });
  ratioErrs(tl.storyboard, errs);
  within(tl.storyboard.poster_at, "storyboard.poster_at");
  if (Math.abs(tl.scenes[0].start) > EPS) errs.push("scenes[0].start: must be 0");
  if (Math.abs(tl.scenes.at(-1).end - D) > EPS) errs.push(`scenes[${tl.scenes.length - 1}].end: must equal duration ${D}`);

  dupes(tl.captions.groups.map((g) => g.id), "caption group", "captions.groups", errs);
  tl.captions.groups.forEach((g, i) => {
    const at = `captions.groups[${i}]`;
    if (!(g.end > g.start)) errs.push(`${at}: end must be after start`);
    within(g.start, `${at}.start`); within(g.end, `${at}.end`);
    if (g.text !== g.words.map((w) => w.text).join(" ")) errs.push(`${at}.text: must be the words joined by single spaces`);
    const lineIdx = g.words.map((w) => w.line);
    if (lineIdx[0] !== 0 || lineIdx.some((l, j) => j > 0 && l < lineIdx[j - 1])) errs.push(`${at}.words[].line: must start at 0 and never go back`);
    const nLines = Math.max(...lineIdx) + 1;
    if (nLines !== g.lines.length) errs.push(`${at}.lines: ${g.lines.length} line(s) but the words use ${nLines}`);
    else g.lines.forEach((l, k) => {
      const want = g.words.filter((w) => w.line === k).map((w) => w.text).join(" ");
      if (l !== want) errs.push(`${at}.lines[${k}]: ${JSON.stringify(l)} must be its words ${JSON.stringify(want)}`);
    });
    if (g.kind === "voiceover") {
      if (!g.phrases.length) errs.push(`${at}.phrases: a voiceover group names the phrases it captions`);
      g.words.forEach((w, j) => {
        if (w.start === null || w.end === null) { errs.push(`${at}.words[${j}]: a voiceover word carries its time`); return; }
        if (w.end < w.start) errs.push(`${at}.words[${j}]: end before start`);
        if (j > 0 && g.words[j - 1].start !== null && w.start < g.words[j - 1].start - EPS) errs.push(`${at}.words[${j}]: words out of order`);
      });
    } else if (g.deliver.includes("srt")) errs.push(`${at}.deliver: only voiceover groups go to the SRT`);
    for (const p of g.phrases) if (!phraseIds.has(p)) errs.push(`${at}.phrases: no phrase ${JSON.stringify(p)}`);
    if (new Set(g.deliver).size !== g.deliver.length) errs.push(`${at}.deliver: duplicate entry`);
  });
  // One voiceover group on screen at a time, and SRT cues never overlap.
  for (const [lane, pick] of [["burned voiceover", (g) => g.kind === "voiceover" && g.deliver.includes("burn")], ["srt", (g) => g.deliver.includes("srt")]]) {
    const gs = tl.captions.groups.filter(pick).slice().sort((a, b) => a.start - b.start);
    gs.forEach((g, k) => { if (k > 0 && g.start < gs[k - 1].end - EPS) errs.push(`captions.groups: ${lane} group ${g.id} starts ${g.start} before ${gs[k - 1].id} ends ${gs[k - 1].end}`); });
  }

  tl.audio.sfx.forEach((s, i) => within(s.at, `audio.sfx[${i}].at`));
  tl.audio.music?.sections.forEach((s, i) => {
    if (!(s.to > s.from)) errs.push(`audio.music.sections[${i}]: to must be after from`);
    within(s.to, `audio.music.sections[${i}].to`);
  });
  return errs;
}

// ---------- derived_from
export function validateDerivedFrom(df) {
  return shapeOf(DERIVED_FROM, df).map((e) => `derived_from${e.startsWith(":") ? "" : "."}${e}`);
}

/**
 * Round to dp decimals the way Python's round() does: on the exact binary value, ties to even.
 * Every time a timeline writes goes through this, so a JS emitter and the Python builders it
 * replaces agree (11.0575 is 11.05749999... in binary and rounds to 11.057; 3.4375 is an exact
 * tie and rounds to the even 3.438; 1.0625 rounds to 1.062). Math.round(x * 1000) / 1000 gets
 * the first and last of those wrong.
 */
export function roundTime(x, dp = 3) {
  if (!Number.isFinite(x)) throw new Error(`roundTime: ${x} is not finite`);
  if (!Number.isInteger(dp) || dp < 0 || dp > 15) throw new Error(`roundTime: dp ${dp} out of range`);
  const neg = x < 0;
  const exact = Math.abs(x).toFixed(100); // toFixed is exact for doubles at this magnitude
  const [ip, fp] = exact.split(".");
  let digits = ip + fp.slice(0, dp);
  const rest = fp.slice(dp);
  const half = rest[0] > "5" || (rest[0] === "5" && /[1-9]/.test(rest.slice(1)));
  const tie = rest[0] === "5" && !/[1-9]/.test(rest.slice(1));
  if (half || (tie && Number(digits.at(-1)) % 2 === 1)) {
    let carry = 1, out = "";
    for (let i = digits.length - 1; i >= 0; i--) {
      const d = Number(digits[i]) + carry;
      out = String(d % 10) + out;
      carry = d >= 10 ? 1 : 0;
    }
    digits = (carry ? "1" : "") + out;
  }
  const v = Number(dp ? `${digits.slice(0, digits.length - dp)}.${digits.slice(digits.length - dp)}` : digits);
  return neg && v !== 0 ? -v : v;
}

/** Lowercase hex sha256 of a Buffer or string (strings hash as UTF-8). */
export function sha256Hex(data) {
  return crypto.createHash("sha256").update(typeof data === "string" ? Buffer.from(data, "utf8") : data).digest("hex");
}

/** The one serialization a timeline (or phrase map, or cut plan) is written in, so sha256 is stable. */
export function serialize(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

/** The TM text an emitter embeds in the composition: compact JSON, keys in emit order. */
export function serializeTm(tm) {
  return JSON.stringify(tm);
}

/**
 * tm_sha256: sha256 of the canonical TM text, JSON.stringify(JSON.parse(text)). Pass the TM object or
 * the text read out of the composition; whitespace and number spelling (5.0 vs 5) do not change the
 * hash, key order and values do. A text that is not JSON throws.
 */
export function tmSha256(tm) {
  return sha256Hex(serializeTm(typeof tm === "string" ? JSON.parse(tm) : tm));
}

/** Validate by the object's own schema field. */
export function validate(value) {
  const s = value && typeof value === "object" ? value.schema : undefined;
  if (s === PHRASEMAP) return validatePhraseMap(value);
  if (s === CUTPLAN) return validateCutPlan(value);
  if (s === TIMELINE) return validateTimeline(value);
  return [`schema: must be one of ${PHRASEMAP}, ${CUTPLAN}, ${TIMELINE}`];
}
