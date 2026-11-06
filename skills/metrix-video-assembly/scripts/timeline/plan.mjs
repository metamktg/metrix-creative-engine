/*
 * timeline plan: phrase map (voice clock) + cut plan (references and constraints as data) ->
 * mce.timeline/1 (ad clock). Implements "Plan semantics" in references/timeline.md, which is
 * normative: segment placement, point placement by read_after/hold_after, shot source mapping,
 * the manual caption rule, music sections and TM nesting. The auto caption builder is
 * captions/cues.mjs, fed the planned words on the ad clock and the picture cuts.
 *
 * Two readings the doc does not spell out, both recorded for the doc owner: a voiceover group
 * with a split takes the words whose MIDPOINT lies on its side (the doc says start; real
 * whisper-cli DTW starts ran 20 ms across a measured split), and overlay groups (hook, cta,
 * label, framing) keep their copy on one line (the 42-character break is a subtitle rule).
 *
 * Pure: no file, clock or process access. Arithmetic runs on unrounded values; every written
 * time goes through schema.mjs roundTime (Python round on the exact binary value).
 */
import { gridSnap, ceilTo } from "./rules.mjs";
import {
  CUTPLAN, PHRASEMAP, TIMELINE, parseRef, roundTime, serialize, sha256Hex, validatePlanInputs, validateTimeline,
} from "./schema.mjs";
import { buildCues, layoutLines, wordsFromPhraseMap, DEFAULTS as CUE_DEFAULTS } from "../captions/cues.mjs";

const EPS = 1e-9;

export class PlanError extends Error {
  constructor(message, errors = []) {
    super(errors.length ? `${message}:\n  ${errors.join("\n  ")}` : message);
    this.name = "PlanError";
    this.errors = errors;
  }
}

/** Caption rule values the manual builder uses when the cut plan leaves one out. */
export const CAPTION_DEFAULTS = Object.freeze({
  energy: "conversational",
  lead_in: 0.06,
  linger: 0.25,
  per_word: 0.3,
  max_chars_line: CUE_DEFAULTS.maxLineChars,
  max_lines: CUE_DEFAULTS.maxLines,
});

/** Snap t to the cut plan grid. Modes as in references/timeline.md; up and beat_up use rules.mjs. */
export function snapper(grid, prefer = 0) {
  const beat = 60 / grid.bpm;
  const unit = beat / grid.div;
  const o = grid.origin;
  return (mode, t) => {
    switch (mode) {
      case "none": return t;
      case "up": return o + ceilTo(t - o, unit);
      case "down": return o + Math.floor((t - o) / unit + EPS) * unit + 0;
      case "nearest": return o + Math.round((t - o) / unit) * unit + 0;
      case "beat_up": return o + ceilTo(t - o, beat);
      case "full_beat_pref": return o + gridSnap(t - o, { bpm: grid.bpm, div: grid.div, preferFullBeatCost: prefer });
      default: throw new PlanError(`unknown snap mode ${JSON.stringify(mode)}`);
    }
  };
}

const splitWords = (s) => String(s).split(" ");

/** Assign each word its line index from layoutLines' line breaks. */
function wordLines(text, maxChars) {
  const lines = layoutLines(text, maxChars);
  const out = [];
  lines.forEach((l, k) => splitWords(l).forEach((w) => out.push({ text: w, line: k })));
  return { lines, words: out };
}

/**
 * Resolve a cut plan against its phrase map. Returns { timeline, t, place, point } where t(ref)
 * gives the unrounded ad time of any reference (check.mjs uses it for exact constraint margins).
 * opts: { phrasemapPath, cutplanPath, phrasemapSha256, cutplanSha256 } (paths relative to the
 * timeline's folder; hashes of the input files' bytes, default sha256 of serialize(input)).
 */
export function resolvePlan(pm, cp, opts = {}) {
  const errs = validatePlanInputs(pm, cp);
  if (errs.length) throw new PlanError("plan inputs do not validate", errs);
  const pmSha = opts.phrasemapSha256 ?? sha256Hex(serialize(pm));
  const cpSha = opts.cutplanSha256 ?? sha256Hex(serialize(cp));
  if (cp.phrasemap && cp.phrasemap.sha256 !== pmSha) {
    throw new PlanError(`the cut plan was written against phrase map ${cp.phrasemap.sha256}, but the phrase map given hashes to ${pmSha}; re-check the cut plan against the new phrase map and update phrasemap.sha256`);
  }

  const E = cp.edit;
  const snap = snapper(cp.grid, E.prefer_full_beat_cost);
  const P = new Map(pm.phrases.map((p) => [p.id, p]));
  const segIndexOfPhrase = new Map();
  cp.segments.forEach((s, k) => s.phrases.forEach((p) => segIndexOfPhrase.set(p, k)));
  const points = new Map(cp.points.map((p) => [p.id, p]));
  const clips = new Map(cp.clips.map((c) => [c.id, c]));
  const shots = new Map(cp.shots.map((s) => [s.id, s]));
  const srcRange = (s) => [P.get(s.phrases[0]).start - E.pre, P.get(s.phrases.at(-1)).end + E.post];

  const memo = new Map();
  const stack = [];
  const once = (key, fn) => {
    if (memo.has(key)) return memo.get(key);
    if (stack.includes(key)) throw new PlanError(`reference cycle: ${[...stack.slice(stack.indexOf(key)), key].join(" -> ")}`);
    stack.push(key);
    try {
      const v = fn();
      memo.set(key, v);
      return v;
    } finally {
      stack.pop();
    }
  };

  const place = (k) => once(`segment ${cp.segments[k].id}`, () => {
    const s = cp.segments[k];
    const p0 = P.get(s.phrases[0]);
    const m = s.place.mode;
    let cut, onset;
    if (m === "start") { cut = s.place.at; onset = cut + E.lead; }
    else if (m === "gap") {
      const prevEnd = `phrase.${cp.segments[k - 1].phrases.at(-1)}.end`;
      const c = cp.constraints.find((x) => x.kind === "min_gap" && x.a === prevEnd && x.b === `phrase.${s.phrases[0]}.start`);
      cut = snap(s.snap, t(c.a) + c.s - E.lead); onset = cut + E.lead;
    } else if (m === "sync") { onset = t(`point.${s.place.point}`) - (s.place.voice_at - p0.start); cut = onset - E.lead; }
    else { cut = snap(s.snap, t(`point.${s.place.point}`)); onset = cut + E.lead; }
    return { cut, offset: onset - p0.start };
  });

  const duration = () => once("end", () => {
    const k = cp.segments.length - 1;
    return roundTime(P.get(cp.segments[k].phrases.at(-1)).end + place(k).offset + E.tail, E.duration_dp);
  });

  const point = (id) => once(`point ${id}`, () => {
    const p = points.get(id);
    if (p.from !== null) return snap(p.snap, t(p.from));
    const rows = cp.constraints.filter((c) => (c.kind === "read_after" || c.kind === "hold_after") && c.b === `point.${id}`);
    return snap(p.snap, Math.max(...rows.map((c) => t(c.a) + c.s)));
  });

  // The shot showing an own-clock clip at clip time ct: the one whose source range holds it, else the first.
  const ownShotFor = (clipId, ct) => {
    const list = cp.shots.filter((s) => s.source === clipId);
    if (!list.length) throw new PlanError(`clip ${clipId} is referenced by time but no shot shows it`);
    return list.find((s) => ct >= s.src_in - EPS && ct <= s.src_in + (t(s.to) - t(s.from)) + EPS) ?? list[0];
  };

  function t(text) {
    const r = parseRef(text);
    if (!r) throw new PlanError(`${JSON.stringify(text)} is not a reference`);
    let v;
    switch (r.kind) {
      case "start": v = 0; break;
      case "end": v = duration(); break;
      case "point": v = point(r.id); break;
      case "phrase": v = P.get(r.id)[r.edge] + place(segIndexOfPhrase.get(r.id)).offset; break;
      case "segment": v = place(cp.segments.findIndex((s) => s.id === r.id)).cut; break;
      case "voice": {
        const k = cp.segments.findIndex((s) => { const [a, b] = srcRange(s); return r.t >= a - EPS && r.t <= b + EPS; });
        if (k < 0) throw new PlanError(`voice@${r.t} is not inside any segment's source range`);
        v = r.t + place(k).offset;
        break;
      }
      case "clip": {
        const c = clips.get(r.id);
        if (c.clock === "voice") v = t(`voice@${r.t + c.voice_base}`);
        else { const sh = ownShotFor(c.id, r.t); v = t(sh.from) + (r.t - sh.src_in); }
        break;
      }
      case "shot": {
        if (r.edge === null) throw new PlanError(`${text}: a bare shot reference only names a max_src shot`);
        const sh = shots.get(r.id);
        v = t(r.edge === "out" ? sh.to : sh.from);
        break;
      }
      default: throw new PlanError(`unknown reference kind in ${text}`);
    }
    return v + r.add;
  }

  const dp = (x) => roundTime(x, E.time_dp);
  const D = duration();
  cp.segments.forEach((_, k) => place(k));

  // Shots, with unrounded edges kept aside for the segment picture cuts.
  const segOut = cp.segments.map((s, k) => { const [a, b] = srcRange(s); const o = place(k).offset; return { a: a + o, b: b + o, offset: o }; });
  const shotRows = cp.shots.map((s) => {
    const a = t(s.from), b = t(s.to);
    const base = { id: s.id, source: s.source, label: s.label, a, b };
    if (s.source === null) return { ...base, srcIn: null };
    const c = clips.get(s.source);
    let srcIn;
    if (c.clock === "own") srcIn = s.src_in;
    else {
      let k = segOut.findIndex((g) => a >= g.a - EPS && a <= g.b + EPS);
      if (k < 0) { const before = segOut.map((g, i) => (g.a <= a + EPS ? i : -1)).filter((i) => i >= 0); k = before.length ? before.at(-1) : 0; }
      srcIn = a - segOut[k].offset - c.voice_base;
    }
    return { ...base, srcIn, clip: c };
  });
  const shotsOut = shotRows.map((s) => (s.srcIn === null
    ? { id: s.id, source: null, file: null, label: s.label, out_in: dp(s.a), out_out: dp(s.b), src_in: null, src_out: null, src_fps: null, src_duration: null, reject: [], residual: [] }
    : { id: s.id, source: s.source, file: s.clip.file, label: s.label, out_in: dp(s.a), out_out: dp(s.b), src_in: dp(s.srcIn), src_out: dp(s.srcIn + s.b - s.a), src_fps: s.clip.fps, src_duration: s.clip.duration, reject: s.clip.reject.map((w) => ({ ...w })), residual: s.clip.residual.map((w) => ({ ...w })) }));

  const segmentsOut = cp.segments.map((s, k) => {
    const { cut, offset } = place(k);
    const [si, so] = srcRange(s);
    const pc = shotRows.find((x) => Math.abs(x.a - cut) < 1e-6);
    return { id: s.id, phrases: [...s.phrases], src_in: dp(si), src_out: dp(so), out_in: dp(si + offset), out_out: dp(so + offset), offset: roundTime(offset, 4), speed: 1, audio_cut: dp(cut), picture_cut: pc ? dp(pc.a) : null };
  });

  // Phrases and words on the ad clock, unrounded (captions read these) and written.
  const adPhrases = cp.segments.flatMap((s, k) => s.phrases.map((id) => {
    const p = P.get(id), off = place(k).offset;
    return { id, segment: s.id, text: p.text, src_start: p.start, src_end: p.end, start: p.start + off, end: p.end + off, words: p.words.map((w) => ({ text: w.text, start: w.start + off, end: w.end + off })) };
  }));
  const phrasesOut = adPhrases.map((p) => ({ ...p, start: dp(p.start), end: dp(p.end), words: p.words.map((w) => ({ text: w.text, start: dp(w.start), end: dp(w.end) })) }));

  const groupsOut = planCaptions({ pm, cp, t, dp, place, segIndexOfPhrase, adPhrases, shotRows, D });

  let tm = null;
  if (cp.outputs.tm) {
    tm = {};
    for (const [key, ref] of Object.entries(cp.outputs.tm)) {
      const ks = key.split(".");
      let o = tm;
      ks.slice(0, -1).forEach((x) => { o = o[x] ??= {}; });
      o[ks.at(-1)] = roundTime(t(ref), 3);
    }
  }

  let music = null;
  if (cp.audio.music) {
    const m = cp.audio.music;
    const starts = m.sections.map((s) => dp(snap(s.snap, t(s.at))));
    music = {
      file: m.file, volume: m.volume, fade_in: m.fade_in, fade_out: m.fade_out, licence: m.licence,
      sections: m.sections.map((s, i) => {
        const row = { from: starts[i], to: starts[i + 1] ?? D, energy: s.energy };
        if (s.chord) row.chord = [...s.chord];
        if (s.root !== undefined) row.root = s.root;
        return row;
      }),
    };
  }

  const beat = 60 / cp.grid.bpm;
  const timeline = {
    schema: TIMELINE,
    name: cp.name,
    clock: "ad",
    fps: cp.fps,
    duration: D,
    grid: { bpm: cp.grid.bpm, div: cp.grid.div, unit: beat / cp.grid.div, origin: cp.grid.origin },
    inputs: {
      phrasemap: cp.phrasemap ? { path: opts.phrasemapPath ?? cp.phrasemap.path, sha256: pmSha, schema: PHRASEMAP } : null,
      cutplan: { path: opts.cutplanPath ?? "cut.json", sha256: cpSha, schema: CUTPLAN },
    },
    segments: segmentsOut,
    phrases: phrasesOut,
    points: cp.points.map((p) => ({ id: p.id, kind: p.kind, t: dp(point(p.id)) })),
    shots: shotsOut,
    scenes: cp.scenes.map((s) => ({ id: s.id, role: s.role, start: dp(t(s.from)), end: dp(t(s.to)), visual: s.visual })),
    storyboard: { ...cp.storyboard, ratios: cp.storyboard.ratios.map((r) => ({ ...r })), modes: [...cp.storyboard.modes], poster_at: dp(t(cp.storyboard.poster_at)) },
    captions: { builder: cp.captions.builder, rules: { ...cp.captions.rules }, groups: groupsOut },
    audio: {
      voice: { file: cp.audio.voice.file, chain: cp.audio.voice.chain },
      sfx: cp.audio.sfx.map((s) => ({ id: s.id, file: s.file, at: dp(t(s.at)), volume: s.volume, why: s.why })),
      music,
    },
    tm,
  };
  const terrs = validateTimeline(timeline);
  if (terrs.length) throw new PlanError("the planned timeline does not validate", terrs);
  return { timeline, t, place, point, duration: D };
}

/** plan(phrases, cut, opts) -> mce.timeline/1. Throws PlanError naming every problem. */
export function plan(pm, cp, opts = {}) {
  return resolvePlan(pm, cp, opts).timeline;
}

function planCaptions({ pm, cp, t, dp, place, segIndexOfPhrase, adPhrases, shotRows, D }) {
  const R = { ...CAPTION_DEFAULTS, min_cue: 20 / cp.fps, ...cp.captions.rules };
  const exitFade = cp.captions.rules.exit_fade ?? null;
  const splitAd = (id) => { const s = pm.splits.find((x) => x.id === id); return s.at + place(segIndexOfPhrase.get(s.phrase)).offset; };
  const vo = cp.captions.groups.filter((g) => g.kind === "voiceover");
  if (cp.captions.builder === "auto" && vo.length) {
    throw new PlanError(`captions.builder "auto" groups the spoken words itself; drop the voiceover groups (${vo.map((g) => g.id).join(", ")}) or set builder "manual"`);
  }
  const rawStart = (g) => (g.split?.side === "after" ? splitAd(g.split.id) : t(`phrase.${g.phrases[0]}.start`));
  const rawIn = (g) => (g.from !== null ? t(g.from) : rawStart(g) - (g.lead_in ?? R.lead_in));
  const inOf = (g) => (g.from !== null ? t(g.from) : Math.max(g.not_before ? t(g.not_before) : -Infinity, rawIn(g)));

  const manual = (g) => {
    const copy = g.copy;
    if (copy !== copy.trim().split(/\s+/).join(" ")) throw new PlanError(`caption ${g.id}: copy must be words joined by single spaces (line breaks come from the layout)`);
    const tin = inOf(g);
    let tout;
    if (g.to !== null) tout = t(g.to);
    else {
      const rawEnd = g.split?.side === "before" ? splitAd(g.split.id) : t(`phrase.${g.phrases.at(-1)}.end`);
      const k = vo.indexOf(g);
      const next = vo[k + 1] ? rawIn(vo[k + 1]) : Infinity;
      const floor = Math.max(R.min_cue, R.per_word * splitWords(copy).length);
      tout = Math.min(next, Math.max(rawEnd + R.linger, tin + floor), g.not_after ? t(g.not_after) : Infinity);
    }
    // Caption line breaks (42 characters, 2 lines) are a subtitle rule: voiceover groups get them.
    // An overlay (hook, cta, label, framing) is set type; the composition lays it out, one line here.
    const { lines, words } = g.kind === "voiceover" ? wordLines(copy, R.max_chars_line) : { lines: [copy], words: splitWords(copy).map((w) => ({ text: w, line: 0 })) };
    const outWords = words.map((w) => ({ text: w.text, start: null, end: null, line: w.line }));
    if (g.kind === "voiceover") {
      const lo = g.split?.side === "after" ? splitAd(g.split.id) : -Infinity;
      const hi = g.split?.side === "before" ? splitAd(g.split.id) : Infinity;
      // A word sits on the side of the split its midpoint is on. ASR word starts run early or late
      // by tens of ms (whisper-cli DTW put "working" 20 ms before a measured split it follows), so
      // the start alone misplaces a word that begins at the split.
      const mid = (w) => (w.start + w.end) / 2;
      const timed = adPhrases.filter((p) => g.phrases.includes(p.id)).flatMap((p) => p.words).filter((w) => mid(w) >= lo - EPS && mid(w) < hi);
      if (timed.length !== outWords.length) {
        throw new PlanError(`caption ${g.id}: its copy has ${outWords.length} words but its phrases (${g.phrases.join(", ")}${g.split ? `, ${g.split.side} split ${g.split.id}` : ""}) carry ${timed.length} timed words; fix the copy or the split`);
      }
      // Times from the measured words, text from the copy (the script), never the ASR spelling.
      timed.forEach((w, j) => { outWords[j].start = dp(w.start); outWords[j].end = dp(w.end); });
    }
    return {
      id: g.id, kind: g.kind, source: g.source, deliver: [...g.deliver], start: dp(tin), end: dp(tout),
      text: copy, lines, words: outWords, phrases: [...g.phrases], cls: g.cls, enter: g.enter, enter_dur: g.enter_dur,
      exit_fade: g.kind === "voiceover" && g.deliver.includes("burn") ? exitFade : null,
    };
  };

  const overlays = cp.captions.groups.map(manual);
  if (cp.captions.builder === "manual") return overlays;

  // auto: the cue builder groups the script's words on the ad clock, snapping to picture cuts.
  const script = adPhrases.map((p) => p.text).join(" ");
  const words = wordsFromPhraseMap({ phrases: adPhrases }, 0);
  const cuts = shotRows.slice(1).map((s) => s.a);
  const o = {};
  const map = { pause_break: "pauseBreak", max_chars_line: "maxLineChars", max_lines: "maxLines", max_cps: "maxCps", min_gap_frames: "minGapFrames", snap_to_shot: "snapWindow", exit_fade: "fadeOut" };
  for (const [k, v] of Object.entries(map)) if (cp.captions.rules[k] !== undefined) o[v] = cp.captions.rules[k];
  if (cp.captions.rules.min_cue !== undefined) o.minCueFrames = Math.round(cp.captions.rules.min_cue * cp.fps);
  let built;
  try {
    built = buildCues({ words, script, energy: R.energy, cuts, fps: cp.fps, options: o });
  } catch (e) {
    throw new PlanError(`caption cue builder: ${e.message}`, (e.details?.diffs ?? []).map((d) => `${d.type} "${d.word}"`));
  }
  const taken = new Set(overlays.map((g) => g.id));
  const spoken = built.cues.map((c, i) => {
    const id = `vo${i + 1}`;
    if (taken.has(id)) throw new PlanError(`caption group id ${id} is used by an overlay; the auto builder names its groups vo1, vo2, ...`);
    const { words: wl } = wordLines(c.text, R.max_chars_line);
    const phraseIds = [...new Set(c.words.map((w) => adPhrases.find((p) => w.start >= p.start - 1e-6 && w.start <= p.end + 1e-6)?.id).filter(Boolean))];
    return {
      id, kind: "voiceover", source: "voiceover", deliver: ["burn", "srt"], start: dp(c.start), end: dp(Math.min(c.end, D)),
      text: c.text, lines: c.lines, words: c.words.map((w, j) => ({ text: w.text, start: dp(w.start), end: dp(w.end), line: wl[j].line })),
      phrases: phraseIds, cls: null, enter: "none", enter_dur: null, exit_fade: c.exit.fade_duration,
    };
  });
  return [...overlays, ...spoken].sort((a, b) => a.start - b.start || (a.kind === "voiceover") - (b.kind === "voiceover"));
}
