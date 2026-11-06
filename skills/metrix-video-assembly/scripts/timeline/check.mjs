/*
 * timeline check: generic invariants of a planned mce.timeline/1, plus the cut plan's run rules
 * (constraints[]) evaluated by one rule whatever their kind. No check here knows any run.
 *
 *   check(tl, { cutplan?, phrasemap?, cutplanSha256?, phrasemapSha256?, minShot? }) -> Finding[]
 *   Finding = { rule, verdict: "PASS" | "WARN" | "FAIL", id?, detail }
 *
 * Generic (timeline alone): the schema validator (tiling, no overlaps, speed 1), the short-shot
 * gate (rules.min_shot, else MCE_MIN_SHOT, else 0.75 s), every output frame of a clip shot
 * mapped to the clip frame actually decoded, floor((t - out_in + src_in) x src_fps), and failed
 * against the clip's reject windows; residual windows on screen are WARN so review sees them;
 * caption lint (captions/cues.mjs lintCues) on the burned voiceover lane and on the SRT lane;
 * and the SRT lane must carry every spoken word of the script, in order.
 *
 * With the cut plan: each constraint is t(b) - t(a) >= s (max_src: the shot's source out-point
 * <= s), resolved against the WRITTEN timeline (times rounded to 3 decimals, so the tolerance
 * is schema.mjs ROUND_TOL). With the phrase map too, the timeline is re-planned: any byte
 * difference is a FAIL (only plan writes timeline.json), and each constraint is also evaluated
 * on the planner's unrounded times to 1e-6.
 *
 * Pure: no file, clock or process access, except reading MCE_MIN_SHOT through scdet.mjs.
 */
import { ROUND_TOL, parseRef, serialize, sha256Hex, validateTimeline } from "./schema.mjs";
import { resolvePlan } from "./plan.mjs";
import { lintCues } from "../captions/cues.mjs";
import { normalize } from "../phrase-align.mjs";
import { shortShotGate } from "../media/scdet.mjs";

const EPS = 1e-6;
const f3 = (x) => Number(x).toFixed(3);

/** Resolve a cut plan reference against a written timeline (and the cut plan's clip facts). */
export function timelineResolver(tl, cp) {
  const point = new Map(tl.points.map((p) => [p.id, p.t]));
  const phrase = new Map(tl.phrases.map((p) => [p.id, p]));
  const shot = new Map(tl.shots.map((s) => [s.id, s]));
  const clips = new Map((cp?.clips ?? []).map((c) => [c.id, c]));
  const fail = (m) => { throw new Error(m); };
  const voice = (vt) => {
    const s = tl.segments.find((g) => vt >= g.src_in - EPS && vt <= g.src_out + EPS);
    if (!s) fail(`voice@${vt} is outside every segment`);
    return vt + s.offset;
  };
  return function t(text) {
    const r = parseRef(text);
    if (!r) fail(`${JSON.stringify(text)} is not a reference`);
    let v;
    switch (r.kind) {
      case "start": v = 0; break;
      case "end": v = tl.duration; break;
      case "point": if (!point.has(r.id)) fail(`no point ${r.id} in the timeline`); v = point.get(r.id); break;
      case "phrase": if (!phrase.has(r.id)) fail(`no phrase ${r.id} in the timeline`); v = phrase.get(r.id)[r.edge]; break;
      case "segment": { const s = tl.segments.find((g) => g.id === r.id); if (!s) fail(`no segment ${r.id}`); v = s.audio_cut; break; }
      case "voice": v = voice(r.t); break;
      case "clip": {
        const showing = tl.shots.filter((s) => s.source === r.id);
        const inShot = showing.find((s) => r.t >= s.src_in - EPS && r.t <= s.src_out + EPS);
        const c = clips.get(r.id);
        if (inShot) v = inShot.out_in + (r.t - inShot.src_in);
        else if (c?.clock === "voice") v = voice(r.t + c.voice_base);
        else if (showing.length) v = showing[0].out_in + (r.t - showing[0].src_in);
        else fail(`clip ${r.id} is not shown and its clock is unknown without the cut plan`);
        break;
      }
      case "shot": {
        const s = shot.get(r.id);
        if (!s) fail(`no shot ${r.id}`);
        v = r.edge === "out" ? s.out_out : s.out_in;
        break;
      }
      default: fail(`unknown reference ${text}`);
    }
    return v + r.add;
  };
}

/** Output frames of each clip shot that decode a frame inside a reject (or residual) window. */
export function frameHits(tl, key = "reject") {
  const fps = tl.fps;
  const out = [];
  for (const s of tl.shots) {
    if (s.source === null || !s[key].length) continue;
    const first = Math.ceil(s.out_in * fps - 1e-9), last = Math.ceil(s.out_out * fps - 1e-9);
    for (const w of s[key]) {
      const frames = [];
      for (let k = first; k < last; k++) {
        const tSrc = k / fps - s.out_in + s.src_in;
        const decoded = Math.floor(tSrc * s.src_fps + 1e-9);
        const at = decoded / s.src_fps;
        if (at >= w.lo - EPS && at < w.hi - EPS) frames.push({ frame: k, t: k / fps, clip_frame: decoded, clip_t: at });
      }
      if (frames.length) out.push({ shot: s.id, clip: s.source, window: w, frames });
    }
  }
  return out;
}

function captionFindings(tl, add) {
  const R = tl.captions.rules;
  const options = {};
  if (R.max_chars_line !== undefined) options.maxLineChars = R.max_chars_line;
  if (R.max_lines !== undefined) options.maxLines = R.max_lines;
  if (R.max_cps !== undefined) options.maxCps = R.max_cps;
  if (R.min_gap_frames !== undefined) options.minGapFrames = R.min_gap_frames;
  if (R.min_cue !== undefined) options.minCueFrames = Math.round(R.min_cue * tl.fps);
  if (R.exit_fade !== undefined) options.fadeOut = R.exit_fade;
  const cuts = tl.shots.slice(1).map((s) => s.out_in);
  // Written times carry 3 decimals, so a cue the builder put on a frame edge reads up to 0.5 ms
  // off it, and a 2-frame gap reads as 1.98 frames. Lint sees such a time back on its frame; a time
  // further than the rounding tolerance from every frame (a manual 5.625 at 30 fps) is left alone.
  const onFrame = (t) => { const f = Math.round(t * tl.fps); return Math.abs(t - f / tl.fps) <= ROUND_TOL / 3 ? f / tl.fps : t; };
  const toCue = (g) => ({
    id: g.id, start: onFrame(g.start), end: onFrame(g.end), text: g.text, lines: g.lines,
    words: g.words.every((w) => w.start !== null) ? g.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) : undefined,
    exit: g.exit_fade !== null ? { fade_start: Math.max(onFrame(g.start), onFrame(g.end) - g.exit_fade), fade_duration: g.exit_fade, hidden_at: onFrame(g.end) } : undefined,
  });
  const lanes = [
    ["burn", tl.captions.groups.filter((g) => g.kind === "voiceover" && g.deliver.includes("burn"))],
    ["srt", tl.captions.groups.filter((g) => g.deliver.includes("srt"))],
  ];
  for (const [lane, groups] of lanes) {
    if (!groups.length) continue;
    const cues = groups.slice().sort((a, b) => a.start - b.start).map(toCue);
    const lint = lintCues(cues, { fps: tl.fps, cuts, options });
    for (const f of lint.findings) {
      if (f.severity === "info") continue;
      add(`captions.${lane}.${f.rule}`, f.severity === "fail" ? "FAIL" : "WARN", `${f.cue}: ${f.message}`, f.cue);
    }
    if (lint.pass) add(`captions.${lane}`, "PASS", `${cues.length} group(s) pass the cue lint`);
  }
  const srt = lanes[1][1].slice().sort((a, b) => a.start - b.start);
  if (srt.length) {
    const said = normalize(tl.phrases.map((p) => p.text).join(" "));
    const shown = normalize(srt.map((g) => g.text).join(" "));
    if (said === shown) add("captions.srt.script", "PASS", "the SRT carries every spoken word of the script, in order");
    else add("captions.srt.script", "FAIL", `the SRT words differ from the script: SRT "${shown}" against script "${said}"`);
  }
}

/** check(tl, opts) -> Finding[]. See the header for what runs with which inputs. */
export function check(tl, opts = {}) {
  const out = [];
  const add = (rule, verdict, detail, id) => out.push(id === undefined ? { rule, verdict, detail } : { rule, verdict, id, detail });
  const schemaErrs = validateTimeline(tl);
  if (schemaErrs.length) {
    for (const e of schemaErrs) add("timeline.schema", "FAIL", e);
    return out;
  }
  add("timeline.schema", "PASS", `mce.timeline/1, ${tl.shots.length} shots, ${tl.duration} s`);
  const cp = opts.cutplan ?? null;
  const pm = opts.phrasemap ?? null;

  if (cp && opts.cutplanSha256 && tl.inputs.cutplan.sha256 !== opts.cutplanSha256) {
    add("timeline.inputs", "FAIL", `the timeline was planned from cut plan ${tl.inputs.cutplan.sha256}, the cut plan given hashes to ${opts.cutplanSha256}; re-plan`);
  }
  if (pm && opts.phrasemapSha256 && tl.inputs.phrasemap && tl.inputs.phrasemap.sha256 !== opts.phrasemapSha256) {
    add("timeline.inputs", "FAIL", `the timeline was planned from phrase map ${tl.inputs.phrasemap.sha256}, the phrase map given hashes to ${opts.phrasemapSha256}; re-plan`);
  }

  // Short shots.
  const minShot = opts.minShot ?? cp?.rules.min_shot;
  const gate = shortShotGate(tl.shots.map((s) => ({ id: s.id, from: s.out_in, to: s.out_out, len: s.out_out - s.out_in })), { minShot });
  if (gate.verdict === "PASS") add("shots.min_shot", "PASS", `${tl.shots.length} shots, none under ${gate.min_shot} s`);
  for (const s of gate.short) add("shots.min_shot", "FAIL", `shot ${s.id} runs ${f3(s.len)} s (${f3(s.from)} to ${f3(s.to)}), under the ${gate.min_shot} s minimum`, s.id);

  // Reject and residual windows, on the frames actually decoded.
  const rejects = frameHits(tl, "reject");
  if (!rejects.length) add("shots.reject", "PASS", "no shown frame decodes a rejected clip frame");
  for (const h of rejects) {
    const a = h.frames[0], b = h.frames.at(-1);
    add("shots.reject", "FAIL", `shot ${h.shot} shows clip ${h.clip} frames ${a.clip_frame}-${b.clip_frame} (clip ${f3(a.clip_t)} to ${f3(b.clip_t)} s) at output frames ${a.frame}-${b.frame} (${f3(a.t)} to ${f3(b.t)} s), inside reject ${h.window.lo}-${h.window.hi}: ${h.window.why}`, h.shot);
  }
  for (const h of frameHits(tl, "residual")) {
    const a = h.frames[0], b = h.frames.at(-1);
    add("shots.residual", "WARN", `shot ${h.shot} shows accepted residual ${h.window.lo}-${h.window.hi} of clip ${h.clip} at output frames ${a.frame}-${b.frame} (${f3(a.t)} to ${f3(b.t)} s): ${h.window.why}`, h.shot);
  }

  captionFindings(tl, add);

  // Re-plan: the timeline must be exactly what plan writes from its inputs.
  let exact = null;
  if (cp && pm) {
    try {
      const r = resolvePlan(pm, cp, {
        phrasemapPath: tl.inputs.phrasemap?.path, cutplanPath: tl.inputs.cutplan.path,
        phrasemapSha256: opts.phrasemapSha256 ?? tl.inputs.phrasemap?.sha256, cutplanSha256: opts.cutplanSha256 ?? tl.inputs.cutplan.sha256,
      });
      exact = r.t;
      const same = serialize(r.timeline) === serialize(tl);
      add("timeline.replan", same ? "PASS" : "FAIL", same
        ? `re-planning the inputs writes these bytes (sha256 ${sha256Hex(serialize(tl)).slice(0, 12)})`
        : "re-planning the inputs writes a different timeline: timeline.json was edited by hand or its inputs changed; edit cut.json and re-plan");
    } catch (e) {
      add("timeline.replan", "FAIL", `the inputs do not plan: ${e.message}`);
    }
  }

  // Constraints, one rule for every kind.
  if (cp) {
    const tw = timelineResolver(tl, cp);
    for (const c of cp.constraints) {
      let written, precise = null;
      try {
        if (c.kind === "max_src") {
          const s = tl.shots.find((x) => `shot.${x.id}` === c.a);
          if (!s || s.src_out === null) throw new Error(`${c.a} is not a clip shot`);
          written = c.s - s.src_out;
        } else written = tw(c.b) - tw(c.a) - c.s;
        if (exact && c.kind !== "max_src") precise = exact(c.b) - exact(c.a) - c.s;
      } catch (e) {
        add("constraint", "FAIL", `${c.id} (${c.kind}): cannot resolve: ${e.message}`, c.id);
        continue;
      }
      const okWritten = written >= -ROUND_TOL;
      const okExact = precise === null || precise >= -EPS;
      const margin = `margin ${f3(written)} s on the written times${precise === null ? "" : `, ${precise.toFixed(6)} s planned`}`;
      const what = c.kind === "max_src" ? `${c.a} source out <= ${c.s}` : `${c.b} - ${c.a} >= ${c.s}`;
      add("constraint", okWritten && okExact ? "PASS" : "FAIL", `${c.id} (${c.kind}) ${what}: ${margin}. ${c.why}`, c.id);
    }
  }
  return out;
}

/** FAIL when any finding fails, else WARN when any warns, else PASS. */
export function verdict(findings) {
  if (findings.some((f) => f.verdict === "FAIL")) return "FAIL";
  if (findings.some((f) => f.verdict === "WARN")) return "WARN";
  return "PASS";
}
