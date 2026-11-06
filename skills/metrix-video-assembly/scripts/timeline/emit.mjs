/*
 * timeline emit: every artifact downstream of timeline.json, from timeline.json alone (plus the
 * plan inputs for the two targets that need facts the timeline does not carry).
 *
 *   emit(tl, target, opts) -> string (file text)      emitAll(tl, opts) -> [{ file, text }]
 *
 * Targets:
 *   storyboard   storyboard_{ratio}_{cap|clean}.json: opts.ratio ("9:16") and opts.captions
 *                ("cap" | "clean"). Caption text items are the timeline's burned caption groups
 *                (CLEAN drops the voiceover ones), copy = lines joined by "\n". Stamped
 *                derived_from {path, sha256, schema, tm_sha256} and delivery {captions, srt}.
 *   srt          the groups delivered to "srt", through make-srt.mjs srtFromItems (no other formatter)
 *   transcript   the spoken script, phrase texts joined by spaces, plus "\n"; its sha256 is the
 *                storyboard's audio.voiceover.script_sha256
 *   cues         compose-bed cues.json: {duration, bpm, grid_start, sections}
 *   edl          the voice edit, audio_cut and picture_cut split (needs opts.cutplan, opts.phrasemap)
 *   voice-graph  the ffmpeg filter_complex that cuts the voice master into the ad clock
 *                (input 0 = the master, output [out]); formatted as the v19 builder formatted it
 *   tm           the TM JSON the composition reads (compact; tmSha256 is stamped in derived_from)
 *   stills-times review stills: poster, each scene's settled moment, both sides of every cut
 *   edge-times   eye-sheet input: per source clip, the clip ranges each shot shows
 *
 * Pure: no file, clock or process access. sha256 is over serialize() bytes.
 */
import { DERIVED_FROM, TIMELINE, roundTime, serialize, serializeTm, sha256Hex, tmSha256, validateTimeline } from "./schema.mjs";
import { settled } from "./rules.mjs";
import { srtFromItems } from "../make-srt.mjs";

export const TARGETS = Object.freeze(["storyboard", "srt", "transcript", "cues", "edl", "voice-graph", "tm", "stills-times", "edge-times"]);

export class EmitError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmitError";
  }
}

const canvasOf = (ratio) => String(ratio).replace(":", "x");
/** File names emitAll writes, relative to the timeline's folder. */
export const fileFor = (target, opts = {}) => ({
  storyboard: `storyboard_${canvasOf(opts.ratio)}_${opts.captions}.json`,
  srt: "captions.srt", transcript: "transcript.txt", cues: "cues.json", edl: "edl.json",
  "voice-graph": "voice-graph.txt", tm: "tm.json", "stills-times": "stills-times.json", "edge-times": "edge-times.json",
}[target]);

/** The spoken script: every planned phrase's text, in order, single spaces. */
export const scriptOf = (tl) => tl.phrases.map((p) => p.text).join(" ");

/** Python str(float), as the v19 builder wrote numbers into the voice graph. */
export function pyFloat(x) {
  if (!Number.isFinite(x)) throw new EmitError(`${x} is not a finite number`);
  if (Number.isInteger(x)) return x.toFixed(1);
  const a = Math.abs(x);
  if (a < 1e-4 || a >= 1e16) {
    const [m, e] = x.toExponential().split("e");
    const n = Number(e);
    return `${m}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
  }
  return String(x);
}

function storyboard(tl, opts) {
  const { ratio, captions } = opts;
  if (!["cap", "clean"].includes(captions)) throw new EmitError(`storyboard needs captions "cap" or "clean" (got ${JSON.stringify(captions)})`);
  const canvas = tl.storyboard.ratios.find((r) => r.ratio === ratio);
  if (!canvas) throw new EmitError(`the timeline plans no ${JSON.stringify(ratio)} canvas (has ${tl.storyboard.ratios.map((r) => r.ratio).join(", ")})`);
  if (!tl.storyboard.modes.includes(captions)) throw new EmitError(`the timeline plans no ${captions} master (modes ${tl.storyboard.modes.join(", ")})`);
  const shown = tl.captions.groups.filter((g) => g.deliver.includes("burn") && !(captions === "clean" && g.kind === "voiceover"));
  const sceneOf = (g) => tl.scenes.find((s, i) => g.start >= s.start - 1e-6 && (g.start < s.end - 1e-6 || i === tl.scenes.length - 1));
  const item = (g) => {
    const x = { id: g.id, copy: g.lines.join("\n"), source: g.source };
    if (g.kind === "label") x.label = true;
    x.in = g.start;
    x.out = g.end;
    x.enter = g.enter;
    if (g.enter_dur !== null) x.dur = g.enter_dur;
    return x;
  };
  const script = scriptOf(tl);
  const sb = {
    name: `${tl.name}_${canvasOf(ratio)}_${captions.toUpperCase()}`,
    brief_id: tl.storyboard.brief_id,
    format: { ratio, width: canvas.width, height: canvas.height, fps: tl.fps },
    duration: tl.duration,
    tone: tl.storyboard.tone,
    poster_at: tl.storyboard.poster_at,
    scenes: tl.scenes.map((s) => ({ id: s.id, role: s.role, start: s.start, end: s.end, visual: s.visual, text: shown.filter((g) => sceneOf(g) === s).map(item) })),
    audio: {
      music: tl.audio.music
        ? { file: tl.audio.music.file, start: 0, volume: tl.audio.music.volume, fade_in: tl.audio.music.fade_in, fade_out: tl.audio.music.fade_out, licence: tl.audio.music.licence }
        : null,
      sfx: tl.audio.sfx.map((s) => ({ file: s.file, at: s.at, volume: s.volume, why: s.why })),
      voiceover: tl.phrases.length
        ? { file: tl.audio.voice.file, at: 0, volume: 1, script, script_sha256: sha256Hex(`${script}\n`) }
        : null,
      lufs: tl.storyboard.lufs,
    },
    slot: null,
    delivery: { captions, srt: fileFor("srt") },
    derived_from: {
      path: opts.timelinePath ?? "timeline.json",
      sha256: opts.timelineSha256 ?? sha256Hex(serialize(tl)),
      schema: TIMELINE,
      tm_sha256: tl.tm ? tmSha256(tl.tm) : null,
    },
  };
  if (!sb.audio.music) delete sb.audio.music;
  if (!sb.audio.voiceover) delete sb.audio.voiceover;
  return serialize(sb);
}

function srt(tl) {
  const items = tl.captions.groups.filter((g) => g.deliver.includes("srt")).map((g) => ({ id: g.id, text: g.lines.join("\n"), start: g.start, end: g.end }));
  if (!items.length) throw new EmitError("no caption group is delivered to the SRT");
  return srtFromItems(items, { duration: tl.duration }).srt;
}

function cues(tl) {
  if (!tl.audio.music) throw new EmitError("the timeline has no music bed, so there are no compose-bed cues");
  return serialize({
    duration: tl.duration, bpm: tl.grid.bpm, grid_start: tl.grid.origin,
    sections: tl.audio.music.sections.map((s) => {
      const row = { from: s.from, to: s.to };
      if (s.chord) row.chord = [...s.chord];
      if (s.root !== undefined) row.root = s.root;
      row.energy = s.energy;
      return row;
    }),
  });
}

function needInputs(target, opts) {
  if (!opts.cutplan || !opts.phrasemap) throw new EmitError(`${target} needs the plan inputs (opts.cutplan and opts.phrasemap): the timeline does not carry the edit settings or the voice master path`);
  return { cp: opts.cutplan, pm: opts.phrasemap };
}

function edl(tl, opts) {
  const { cp, pm } = needInputs("edl", opts);
  const phrase = new Map(tl.phrases.map((p) => [p.id, p]));
  return serialize({
    source: pm.voice.path, pre: cp.edit.pre, post: cp.edit.post, lead: cp.edit.lead, bpm: tl.grid.bpm,
    grid: `1/${tl.grid.div} beat from ${tl.grid.origin}`, duration: tl.duration,
    segments: tl.segments.map((s) => ({
      id: s.id, src_in: s.src_in, src_out: s.src_out, out_in: s.out_in, out_out: s.out_out, offset: s.offset, speed: s.speed,
      audio_cut: s.audio_cut, picture_cut: s.picture_cut,
      phrases: s.phrases.map((id) => { const p = phrase.get(id); return { id, text: p.text, src: [p.src_start, p.src_end], out: [p.start, p.end] }; }),
    })),
    dropped: [],
    note: "out = master + offset within a segment; speech never retimed (speed 1). audio_cut is where the voice edit sits; picture_cut is the shot boundary at it, or null when the audio cut falls inside a shot.",
  });
}

function voiceGraph(tl) {
  if (!tl.segments.length) throw new EmitError("the timeline has no voice segments");
  const chains = tl.segments.map((s, k) => {
    const d = s.src_out - s.src_in;
    return `[0]atrim=${pyFloat(s.src_in)}:${pyFloat(s.src_out)},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${roundTime(d - 0.01, 3).toFixed(3)}:d=0.01,adelay=${roundTime(s.out_in * 1000, 0)}:all=1[s${k}]`;
  });
  const labels = tl.segments.map((_, k) => `[s${k}]`).join("");
  return `${chains.join(";")};${labels}amix=inputs=${tl.segments.length}:normalize=0,apad,atrim=0:${pyFloat(tl.duration)}[out]`;
}

function stillsTimes(tl) {
  const frame = 1 / tl.fps;
  const r3 = (x) => roundTime(x, 3);
  const out = [{ name: "poster", t: tl.storyboard.poster_at, why: "poster_at" }];
  const burned = tl.captions.groups.filter((g) => g.deliver.includes("burn"));
  for (const s of tl.scenes) {
    const items = burned.filter((g) => g.start >= s.start - 1e-6 && g.start < s.end - 1e-6)
      .map((g) => settled({ in: g.start, out: g.end, enter: g.enter, dur: g.enter_dur ?? undefined })).filter((w) => w.to > w.from);
    const allIn = items.length ? Math.max(...items.map((w) => w.from)) : (s.start + s.end) / 2;
    const firstOut = items.length ? Math.min(...items.map((w) => w.to)) : s.end;
    const t = allIn < firstOut ? (allIn + firstOut) / 2 : (s.start + s.end) / 2;
    out.push({ name: `scene-${s.id}`, t: r3(t), why: "scene settled moment" });
  }
  tl.shots.slice(1).forEach((s, i) => {
    const prev = tl.shots[i];
    out.push({ name: `cut-${prev.id}-${s.id}-before`, t: r3(Math.max(0, s.out_in - frame)), why: `last frame of ${prev.id}` });
    out.push({ name: `cut-${prev.id}-${s.id}-after`, t: s.out_in, why: `first frame of ${s.id}` });
  });
  return serialize({ schema: "mce.stillstimes/1", fps: tl.fps, stills: out.sort((a, b) => a.t - b.t) });
}

function edgeTimes(tl, opts) {
  const edges = opts.edges ?? 3;
  const byClip = new Map();
  for (const s of tl.shots) {
    if (s.source === null) continue;
    if (!byClip.has(s.source)) byClip.set(s.source, { clip: s.source, file: s.file, src_fps: s.src_fps, edges, ranges: [] });
    byClip.get(s.source).ranges.push({ shot: s.id, from: s.src_in, to: s.src_out, out_in: s.out_in, out_out: s.out_out });
  }
  return serialize({ schema: "mce.edgetimes/1", note: "clip seconds; pass ranges and edges to media/eye-sheet.mjs eyeSheet(file, {ranges, edges})", clips: [...byClip.values()] });
}

/** emit(tl, target, opts) -> file text. */
export function emit(tl, target, opts = {}) {
  const errs = validateTimeline(tl);
  if (errs.length) throw new EmitError(`timeline does not validate:\n  ${errs.join("\n  ")}`);
  switch (target) {
    case "storyboard": return storyboard(tl, opts);
    case "srt": return srt(tl);
    case "transcript": return `${scriptOf(tl)}\n`;
    case "cues": return cues(tl);
    case "edl": return edl(tl, opts);
    case "voice-graph": return `${voiceGraph(tl)}\n`;
    case "tm": if (!tl.tm) throw new EmitError("the timeline has no TM block"); return `${serializeTm(tl.tm)}\n`;
    case "stills-times": return stillsTimes(tl);
    case "edge-times": return edgeTimes(tl, opts);
    default: throw new EmitError(`unknown target ${JSON.stringify(target)}; one of ${TARGETS.join(", ")}`);
  }
}

/** Every target the timeline supports: storyboards for each ratio x mode, then the rest. */
export function emitAll(tl, opts = {}) {
  const files = [];
  for (const r of tl.storyboard.ratios) for (const m of tl.storyboard.modes) files.push({ file: fileFor("storyboard", { ratio: r.ratio, captions: m }), text: emit(tl, "storyboard", { ...opts, ratio: r.ratio, captions: m }) });
  const want = ["transcript", "edge-times", "stills-times"];
  if (tl.captions.groups.some((g) => g.deliver.includes("srt"))) want.unshift("srt");
  if (tl.audio.music) want.push("cues");
  if (tl.tm) want.push("tm");
  if (tl.segments.length) want.push("voice-graph");
  if (opts.cutplan && opts.phrasemap) want.push("edl");
  for (const target of want) files.push({ file: fileFor(target), text: emit(tl, target, opts) });
  return files;
}

export { DERIVED_FROM };
