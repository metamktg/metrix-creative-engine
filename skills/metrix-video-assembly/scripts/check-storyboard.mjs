#!/usr/bin/env node
/*
 * Check a storyboard against the assembly laws before anything is rendered.
 *
 *   node check-storyboard.mjs <storyboard.json> --brief brief.json [--kit brand-kit.json] [--phrases phrases.json]
 *        [--script locked-script.(txt|json)] [--packet preproduction.json] [--allow-ungrounded]
 *   node check-storyboard.mjs --row a.json b.json c.json      (Matrix Sprint Test row isolation)
 *
 * Prints a JSON report; exit 1 on any FAIL. WARN never fails the run, it is
 * something a person should look at.
 *
 * Grounding is strict. Without --brief every line that is not "framing" or "kit." FAILs, and
 * without --kit every "kit." line FAILs, because nothing it asserts can be checked. Pass
 * --allow-ungrounded to report those lines as WARN instead; the report then lists the override
 * under "overrides", so an unchecked run cannot be mistaken for a checked one.
 *
 * Voiceover captions ground against the brief's copy_architecture or the LOCKED script: the file
 * given with --script (or the packet's script with --packet) whose sha256 equals
 * audio.voiceover.script_sha256. audio.voiceover.script is author text and grounds nothing; when
 * a locked script is given it must say the same words. A voiced line that asserts (a digit, money,
 * '#1', a superlative or guarantee) also needs claim_source: a brief or kit field, not a
 * forbidden/avoid list, that contains the line.
 *
 * Delivery (delivery.captions "cap" or "clean"): a CAP storyboard burns its voiceover captions; a
 * CLEAN one burns none and satisfies sound-off only through delivery.srt, a caption file whose
 * words equal the voiced script in order and, with --phrases, whose cues overlap every phrase.
 *
 * Also: audio.music.licence is required when audio.music.file is set; a storyboard stamped with
 * derived_from must match its timeline.json byte for byte (sha256) and TM hash, and a storyboard
 * with a timeline.json beside it must carry the stamp; schema_version 2 requires format.placement.
 *
 * --phrases takes phrase-map.mjs output for the voiceover. Any effect starting in the 0.25 s
 * before a phrase onset fails: there it reads as a breath or a clipped word (heard in a recorded
 * run, where a card-slide 50 ms before a phrase was taken for a breath). Without --phrases a
 * voiced storyboard gets a WARN that onsets were not checked.
 *
 * Text "source" values:
 *   "copy_architecture.hook" (any dotted path into the brief, or "kit." + a path into the brand kit)
 *       the on-screen copy must appear in that field (case and whitespace ignored)
 *   "framing"
 *       connective craft the brief did not write. Free to invent, but it may not
 *       assert anything: no digits, no money, no percentages, no superlatives
 *       or guarantees. A claim belongs in the brief, with its evidence.
 *   "voiceover"
 *       a caption of a voiced line, grounded as above.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { zoneFor } from "./placement-zones.mjs";
import { floorFor, norm, ONSET_GUARD, onsetGuard, settled, voFloorFor, words } from "./timeline/rules.mjs";
import { TIMELINE, tmSha256, validateDerivedFrom } from "./timeline/schema.mjs";

const argv = process.argv.slice(2);
const VALUED = ["--brief", "--kit", "--phrases", "--script", "--packet"];
const flag = (k) => {
  const i = argv.indexOf(k);
  return i === -1 ? null : argv[i + 1];
};
const load = (p) => (p ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const results = [];
const overrides = [];
const add = (rule, verdict, detail) => results.push({ rule, verdict, detail });
// words, norm, settled, floorFor, voFloorFor and onsetGuard live in timeline/rules.mjs.

const ASSERTIVE = [
  [/\d/, "a digit"],
  [/[%$£€]/, "a money or percent sign"],
  [/#\s*1\b/i, "'#1'"],
  [/\b(best|fastest|cheapest|leading|guarantee[sd]?|proven|clinically|award[- ]winning|number one|world'?s)\b/i, "a superlative or guarantee"],
];

function resolve(pathStr, brief, kit) {
  const [root, rest] = pathStr.startsWith("kit.") ? [kit, pathStr.slice(4)] : [brief, pathStr];
  if (!root) return undefined;
  let cur = root;
  for (const k of rest.split(".")) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) && !/^\d+$/.test(k) ? cur.map((x) => x?.[k]) : cur[k];
  }
  return cur;
}
const flat = (v) => (v == null ? [] : Array.isArray(v) ? v.flatMap(flat) : typeof v === "object" ? Object.values(v).flatMap(flat) : [String(v)]);
// Caption text compared without sentence punctuation (a caption may drop the full stop).
const bare = (s) => norm(s).replace(/[.,!?;:]/g, "");
// Spoken words for coverage: case, apostrophes and punctuation ignored ("Work's" = "Works").
const spoken = (s) => norm(s).replace(/'/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
const FORBIDDEN_FIELD = /forbidden|banned|avoid|unverified|unsourced/i;

// A locked script file: plain text, or JSON carrying lines[].text (the packet's script.json),
// spoken_script, script or text. The hash is over the file's bytes either way.
function scriptText(buf) {
  const raw = buf.toString("utf8").replace(/^﻿/, "");
  let j;
  try { j = JSON.parse(raw); } catch { return raw.trim(); }
  if (Array.isArray(j?.lines) && j.lines.length && j.lines.every((l) => typeof l?.text === "string")) return j.lines.map((l) => l.text).join(" ");
  for (const k of ["spoken_script", "script", "text"]) if (typeof j?.[k] === "string") return j[k];
  throw new Error("locked script JSON has no lines[].text, spoken_script, script or text");
}

// SRT -> cues [{n, start, end, text}]; throws on a block that is not a cue.
function parseSrt(text) {
  const stamp = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  return text.replace(/^﻿/, "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b, i) => {
    const lines = b.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    const m = at === -1 ? null : lines[at].match(/(\d+):(\d\d):(\d\d)[,.](\d{3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{3})/);
    if (!m || at > 1) throw new Error(`block ${i + 1} has no "hh:mm:ss,mmm --> hh:mm:ss,mmm" line`);
    return { n: i + 1, start: stamp(m[1], m[2], m[3], m[4]), end: stamp(m[5], m[6], m[7], m[8]), text: lines.slice(at + 1).join(" ").trim() };
  });
}

// Strict grounding: a line that cannot be checked FAILs, unless --allow-ungrounded was passed,
// which turns it into a WARN and records the rule under the report's overrides.
function ungrounded(ctx, rule, detail) {
  if (!ctx.allowUngrounded) return add(rule, "FAIL", `${detail}; pass the missing input (or --allow-ungrounded to record an unchecked run)`);
  ctx.unchecked.push(rule);
  add(rule, "WARN", `${detail}; unchecked under --allow-ungrounded`);
}

// The locked voiceover script: --script (or the packet's script) whose bytes hash to
// audio.voiceover.script_sha256, and to the packet's script hashes when --packet is given.
function lockScript(sb, ctx) {
  const vo = sb.audio?.voiceover;
  const want = vo?.script_sha256;
  let file = ctx.scriptPath;
  let packet = null;
  if (ctx.packetPath) {
    packet = load(ctx.packetPath);
    if (!file && packet?.script?.path) file = path.resolve(path.dirname(path.resolve(ctx.packetPath)), packet.script.path);
  }
  if (!file) {
    if (ctx.packetPath) add("voiceover.lock", "FAIL", "--packet given but it names no script.path and no --script was passed");
    else if (want) add("voiceover.lock", "WARN", "audio.voiceover.script_sha256 is set but no --script was given; voiced lines ground only against the brief");
    if (vo?.script != null) add("voiceover.script", "WARN", "audio.voiceover.script is author text and grounds nothing; lock it (script_sha256 plus --script)");
    return null;
  }
  if (!fs.existsSync(file)) { add("voiceover.lock", "FAIL", `locked script ${file} does not exist`); return null; }
  const buf = fs.readFileSync(file);
  const got = sha256(buf);
  if (!vo) { add("voiceover.lock", "FAIL", "a locked script was given but the storyboard has no audio.voiceover"); return null; }
  if (!want) { add("voiceover.lock", "FAIL", `audio.voiceover.script_sha256 missing; the storyboard must name the locked script (${path.basename(file)} is ${got})`); return null; }
  if (got !== want) { add("voiceover.lock", "FAIL", `${path.basename(file)} hashes ${got}, storyboard locks ${want}`); return null; }
  if (packet) {
    const ph = [["script.sha256", packet.script?.sha256], ["voice.accepted_bindings.script_sha256", packet.voice?.accepted_bindings?.script_sha256]];
    const bad = ph.filter(([, h]) => h !== got);
    if (bad.length) { add("voiceover.lock", "FAIL", `packet ${bad.map(([k, h]) => `${k} ${h ?? "missing"}`).join(", ")} is not the locked script ${got}`); return null; }
  }
  let text;
  try { text = scriptText(buf); } catch (e) { add("voiceover.lock", "FAIL", `${path.basename(file)}: ${e.message}`); return null; }
  add("voiceover.lock", "PASS", `${path.basename(file)} sha256 ${got} matches audio.voiceover.script_sha256${packet ? " and the packet" : ""}`);
  if (vo.script != null) {
    const same = spoken(vo.script).join(" ") === spoken(text).join(" ");
    add("voiceover.script", same ? "PASS" : "FAIL", same ? "audio.voiceover.script says the locked words" : "audio.voiceover.script differs from the locked script; the locked file wins, fix the storyboard");
  }
  return { file, sha256: got, text };
}

// The voiced script a caption file must cover: the locked script, else the brief's.
function voicedText(ctx) {
  if (ctx.locked) return { text: ctx.locked.text, from: `locked script (${path.basename(ctx.locked.file)})` };
  const ca = ctx.brief?.copy_architecture;
  for (const k of ["spoken_script", "script"]) if (typeof ca?.[k] === "string" && ca[k].trim()) return { text: ca[k], from: `brief copy_architecture.${k}` };
  return null;
}

// A delivered SRT covers the voice: its words equal the voiced script in order, its cues sit
// inside the ad and do not overlap, and (with --phrases) every phrase has a cue over it.
function srtCovers(sb, ctx, rel) {
  const file = path.resolve(ctx.sbDir, rel);
  if (!fs.existsSync(file)) return { ok: false, detail: `delivery.srt ${rel} does not exist` };
  const bytes = fs.readFileSync(file);
  let cues;
  try { cues = parseSrt(bytes.toString("utf8")); } catch (e) { return { ok: false, detail: `delivery.srt ${rel}: ${e.message}` }; }
  const tag = `${rel} (sha256 ${sha256(bytes).slice(0, 12)}, ${cues.length} cues)`;
  if (!cues.length) return { ok: false, detail: `${tag} has no cues` };
  const timing = [];
  cues.forEach((c, i) => {
    if (!(c.end > c.start)) timing.push(`cue ${c.n} has no length`);
    if (c.start < -1e-6 || c.end > sb.duration + 1e-3) timing.push(`cue ${c.n} ${c.start}-${c.end} runs outside 0-${sb.duration}s`);
    if (i > 0 && c.start < cues[i - 1].end - 1e-6) timing.push(`cue ${c.n} starts before cue ${cues[i - 1].n} ends`);
  });
  if (timing.length) return { ok: false, detail: `${tag}: ${timing.join("; ")}` };
  const voiced = voicedText(ctx);
  if (!voiced) return { ok: false, detail: `${tag}: no voiced script to check it against; pass --script (locked) or a brief with copy_architecture.script` };
  const want = spoken(voiced.text);
  const got = cues.flatMap((c) => spoken(c.text));
  const k = want.findIndex((w, i) => got[i] !== w);
  if (k !== -1 || got.length !== want.length) {
    const at = k === -1 ? want.length : k;
    const what = at >= got.length ? `missing from word ${at + 1} ("${want.slice(at, at + 4).join(" ")}")` : at >= want.length ? `adds "${got.slice(at, at + 4).join(" ")}" after the script ends` : `word ${at + 1} is "${got[at]}", the script says "${want[at]}"`;
    return { ok: false, detail: `${tag} does not carry the ${voiced.from} word for word: ${what}` };
  }
  let phraseNote = "phrase timing not checked; pass --phrases";
  if (ctx.phrases) {
    const at = sb.audio?.voiceover?.at ?? 0;
    const missed = (ctx.phrases.phrases || []).filter((p) => !cues.some((c) => c.start < p.end + at - 1e-6 && c.end > p.start + at + 1e-6));
    if (missed.length) return { ok: false, detail: `${tag}: no cue over phrase ${missed.map((p) => `${p.id} ${(p.start + at).toFixed(3)}-${(p.end + at).toFixed(3)}s`).join(", ")}` };
    phraseNote = `every one of ${(ctx.phrases.phrases || []).length} phrases has a cue over it`;
  }
  return { ok: true, phrasesChecked: Boolean(ctx.phrases), detail: `${tag} carries all ${want.length} words of the ${voiced.from}; ${phraseNote}` };
}

function checkDelivery(sb, ctx, scenes) {
  const d = sb.delivery;
  const vo = sb.audio?.voiceover;
  const burned = scenes.flatMap((s) => (s.text || []).filter((t) => t.source === "voiceover"));
  if (d == null) {
    // No delivery block: the original rule, burned captions carry the voice.
    if (vo && !burned.length) add("sound_off", "FAIL", "voiceover present but no caption lines (source: voiceover) carry it on screen");
    return;
  }
  if (!["cap", "clean"].includes(d.captions)) return add("delivery.captions", "FAIL", `delivery.captions is ${JSON.stringify(d.captions)}, not "cap" or "clean"`);
  if (d.srt != null && typeof d.srt !== "string") return add("delivery.srt", "FAIL", "delivery.srt must be a path to the caption file");
  if (d.captions === "clean" && burned.length) add("delivery.clean", "FAIL", `a CLEAN deliverable burns no captions, but ${burned.length} voiceover line(s) are on screen (${burned.map((t) => t.id).join(", ")})`);
  const srt = d.srt ? srtCovers(sb, ctx, d.srt) : null;
  if (srt) add("delivery.srt", srt.ok ? (srt.phrasesChecked || !vo ? "PASS" : "WARN") : "FAIL", srt.detail);
  if (!vo) return add("delivery", "PASS", `${d.captions.toUpperCase()}, no voiceover`);
  if (d.captions === "cap") {
    add("sound_off", burned.length ? "PASS" : "FAIL", burned.length ? `CAP: ${burned.length} burned voiceover caption line(s)` : "CAP delivery with a voiceover but no caption lines (source: voiceover) on screen");
  } else if (!d.srt) add("sound_off", "FAIL", "CLEAN delivery with a voiceover needs delivery.srt naming a caption file that covers every voiced phrase");
  else add("sound_off", srt.ok ? "PASS" : "FAIL", srt.ok ? `CLEAN: sound-off carried by ${d.srt}` : `CLEAN: ${d.srt} does not cover the voice, see delivery.srt`);
}

// derived_from: the stamp an emitted storyboard carries back to its timeline.json.
function checkDerived(sb, ctx) {
  const df = sb.derived_from;
  const beside = path.join(ctx.sbDir, "timeline.json");
  if (df === undefined) {
    if (fs.existsSync(beside)) add("derived_from", "FAIL", "timeline.json sits beside this storyboard but it carries no derived_from; emit it with timeline.mjs, do not hand-edit");
    return;
  }
  const errs = validateDerivedFrom(df);
  if (errs.length) return add("derived_from", "FAIL", errs.join("; "));
  const file = path.resolve(ctx.sbDir, df.path);
  if (!fs.existsSync(file)) return add("derived_from", "FAIL", `derived_from.path ${df.path} does not exist beside the storyboard`);
  const bytes = fs.readFileSync(file);
  const got = sha256(bytes);
  if (got !== df.sha256) return add("derived_from", "FAIL", `${df.path} hashes ${got}, the storyboard was emitted from ${df.sha256}; re-emit it`);
  let tl;
  try { tl = JSON.parse(bytes.toString("utf8")); } catch (e) { return add("derived_from", "FAIL", `${df.path} is not JSON: ${e.message}`); }
  if (tl?.schema !== TIMELINE) return add("derived_from", "FAIL", `${df.path} has schema ${JSON.stringify(tl?.schema)}, not ${TIMELINE}`);
  const tm = tl.tm == null ? null : tmSha256(tl.tm);
  if (tm !== df.tm_sha256) return add("derived_from", "FAIL", `derived_from.tm_sha256 ${df.tm_sha256} but the timeline's TM hashes ${tm}`);
  add("derived_from", "PASS", `${df.path} sha256 ${got.slice(0, 12)} and TM ${tm ? tm.slice(0, 12) : "null"} match`);
}

function checkVersion(sb) {
  const f = sb.format || {};
  if (sb.schema_version != null && sb.schema_version !== 2) add("schema_version", "FAIL", `schema_version ${JSON.stringify(sb.schema_version)}; only 2 is defined (omit it for the original format)`);
  if (sb.schema_version === 2 && !f.placement) add("format.placement", "FAIL", "schema_version 2 requires format.placement");
  if (f.kind != null && !["video", "still", "carousel"].includes(f.kind)) add("format.kind", "FAIL", `format.kind ${JSON.stringify(f.kind)} is not video, still or carousel`);
  if (f.placement) {
    try {
      const z = zoneFor({ ratio: f.ratio, placement: f.placement });
      add("format.placement", "PASS", `${f.placement} -> zone ${z.id} (${z.source_grade})`);
    } catch (e) { add("format.placement", "FAIL", e.message); }
  }
}

function checkOne(sb, ctx) {
  const { brief, kit, phrases } = ctx;
  checkVersion(sb);
  const ratios = { "9:16": [9, 16], "4:5": [4, 5], "1:1": [1, 1], "16:9": [16, 9] };
  const f = sb.format || {};
  const r = ratios[f.ratio];
  if (!r) add("format.ratio", "FAIL", `ratio ${f.ratio} is not one of ${Object.keys(ratios).join(", ")}`);
  else if (Math.abs(f.width / f.height - r[0] / r[1]) > 0.002) add("format.size", "FAIL", `${f.width}x${f.height} is not ${f.ratio}`);
  else add("format", "PASS", `${f.ratio} ${f.width}x${f.height} @${f.fps || 30}fps`);

  const briefRatio = brief?.creative_specifications?.dimensions;
  if (briefRatio && r && !String(briefRatio).includes(f.ratio)) add("format.brief", "FAIL", `brief dimensions "${briefRatio}" but storyboard renders ${f.ratio}`);

  const scenes = sb.scenes || [];
  if (!scenes.length) return add("scenes", "FAIL", "no scenes");
  let gap = null;
  scenes.forEach((s, i) => {
    if (i === 0 && s.start !== 0) gap = `first scene starts at ${s.start}, not 0`;
    if (i > 0 && Math.abs(s.start - scenes[i - 1].end) > 1e-6) gap = `${scenes[i - 1].id} ends ${scenes[i - 1].end}, ${s.id} starts ${s.start}`;
    if (!(s.end > s.start)) gap = `${s.id} has no length`;
  });
  const end = scenes.at(-1).end;
  if (gap) add("timeline.contiguous", "FAIL", gap);
  else if (Math.abs(end - sb.duration) > 1e-6) add("timeline.sum", "FAIL", `scenes end at ${end}s, duration says ${sb.duration}s`);
  else add("timeline", "PASS", `${scenes.length} scenes, ${sb.duration}s`);

  // The engine's brief schema calls it duration_seconds; older briefs say duration.
  const target = brief?.creative_specifications?.duration_seconds ?? brief?.creative_specifications?.duration;
  if (target != null && Math.abs(target - sb.duration) > 0.5) add("duration.brief", "FAIL", `brief asks ${target}s, storyboard runs ${sb.duration}s`);
  else if (target == null && (sb.duration < 6 || sb.duration > 30)) add("duration.default", "WARN", `${sb.duration}s is outside the 6 to 30s Meta default; say why in the plan`);

  // Hook: the first scene carries it and it is readable inside the first second.
  const first = scenes[0];
  const hookText = (first.text || [])[0];
  if (first.role !== "hook") add("hook.role", "FAIL", `first scene role is "${first.role}", not "hook"`);
  if (!hookText) add("hook.text", "FAIL", "the hook scene shows no text; the idea must read with the sound off");
  else {
    const at = settled(hookText).from;
    add("hook.timing", at <= 1.0 ? "PASS" : "FAIL", `hook line fully on screen at ${at.toFixed(2)}s (limit 1.0s)`);
  }

  // Poster is frame 0: it must be a settled frame, not a fade or a cut.
  if (sb.poster_at == null) add("poster", "FAIL", "poster_at missing; frame 0 is the thumbnail and must be chosen");
  else {
    const all = scenes.flatMap((s) => (s.text || []).map((t) => ({ ...settled(t), scene: s })));
    const ok = all.some((w) => sb.poster_at >= w.from && sb.poster_at <= w.to - 0.05);
    add("poster", ok ? "PASS" : "FAIL", ok ? `poster at ${sb.poster_at}s lands on settled copy` : `poster at ${sb.poster_at}s is not inside any settled text window`);
  }

  // Every readable line holds long enough to read.
  for (const s of scenes) {
    const items = s.text || [];
    for (const t of items) {
      const w = settled(t);
      const hold = w.to - w.from;
      // Captions of speech the viewer also hears are read along at speaking pace.
      const need = t.source === "voiceover" ? voFloorFor(t.copy) : floorFor(t.copy);
      if (t.in < s.start - 1e-6 || t.out > s.end + 1e-6) add(`read.${t.id}`, "FAIL", `"${t.copy}" runs outside its scene ${s.id}`);
      else if (hold + 1e-6 < need) add(`read.${t.id}`, "FAIL", `"${t.copy}" holds ${hold.toFixed(2)}s settled, needs ${need.toFixed(2)}s (${words(t.copy)} words)`);
      else add(`read.${t.id}`, "PASS", `${hold.toFixed(2)}s >= ${need.toFixed(2)}s`);
    }
    // A fixed label (a disclosure, a legal line, a source credit) is read once
    // and then stays put; it does not compete with the line the scene is
    // about. Mark it "label": true, or source it from kit.disclosure or kit.identity
    // (the brand name beside its mark).
    const isLabel = (t) => t.label === true || /^kit\.(disclosure|identity)\b/.test(t.source || "");
    const lines = items.filter((t) => !isLabel(t));
    // Too much copy for the scene: the total read need cannot fit.
    const need = lines.reduce((a, t) => a + floorFor(t.copy), 0);
    if (need > (s.end - s.start) * 1.6) add(`density.${s.id}`, "WARN", `scene ${s.id} carries ${need.toFixed(1)}s of reading in ${(s.end - s.start).toFixed(1)}s; cut copy or split the scene`);
    // Sequential readable lines arriving faster than ~0.6s apart outrun reading.
    const ins = lines.map((t) => t.in).sort((a, b) => a - b);
    for (let i = 1; i < ins.length; i++)
      if (ins[i] - ins[i - 1] < 0.6 - 1e-6) add(`stagger.${s.id}`, "WARN", `two readable lines in ${s.id} arrive ${(ins[i] - ins[i - 1]).toFixed(2)}s apart; reveal on every other beat or hold the set`);
  }

  // CTA: last scene, verbatim from the brief, held.
  const last = scenes.at(-1);
  const ctaItem = scenes.flatMap((s) => s.text || []).find((t) => t.source === "copy_architecture.cta");
  // A hook that hands over to other content has no CTA by design: the brief
  // says so with "cta": null. That is reported, not failed.
  const noCta = brief?.copy_architecture && brief.copy_architecture.cta === null;
  if (noCta && !ctaItem) add("cta", "WARN", `brief sets cta: null; last scene "${last.role}" hands over without a CTA`);
  else if (last.role !== "cta") add("cta.role", "FAIL", `last scene role is "${last.role}", not "cta"`);
  if (noCta && !ctaItem) { /* reported above */ }
  else if (!ctaItem) add("cta.text", "FAIL", "no text item sourced from copy_architecture.cta");
  else {
    const w = settled(ctaItem);
    add("cta.hold", w.to - w.from >= 1.5 ? "PASS" : "FAIL", `CTA settled ${(w.to - w.from).toFixed(2)}s (needs 1.5s)`);
    const want = brief?.copy_architecture?.cta;
    if (want != null) add("cta.verbatim", norm(want) === norm(ctaItem.copy) ? "PASS" : "FAIL", `brief "${want}" vs on screen "${ctaItem.copy}"`);
  }

  // Grounding. What the ad asserts must come from the brief, the kit or the locked script.
  ctx.locked = lockScript(sb, ctx);
  for (const t of scenes.flatMap((s) => s.text || [])) {
    if (!t.source) { add(`ground.${t.id}`, "FAIL", `"${t.copy}" has no source`); continue; }
    const assertive = ASSERTIVE.find(([re]) => re.test(t.copy));
    if (t.source === "framing") {
      add(`ground.${t.id}`, assertive ? "FAIL" : "PASS", assertive ? `framing line "${t.copy}" contains ${assertive[1]}; a claim needs a sourced field` : "framing, asserts nothing");
      continue;
    }
    // A caption of a voiced line grounds in the brief's copy or the locked script, never in
    // audio.voiceover.script, which the storyboard's author writes.
    if (t.source === "voiceover") {
      const grounds = [...(ctx.locked ? [{ v: ctx.locked.text, from: "the locked script" }] : []), ...flat(brief?.copy_architecture).map((v) => ({ v, from: "the brief copy" }))];
      if (!grounds.length) ungrounded(ctx, `ground.${t.id}`, `caption "${t.copy}": no --brief copy and no locked --script to check it against`);
      else {
        const hit = grounds.find((g) => bare(g.v).includes(bare(t.copy)));
        const why = sb.audio?.voiceover?.script != null && !ctx.locked ? " (audio.voiceover.script grounds nothing)" : "";
        add(`ground.${t.id}`, hit ? "PASS" : "FAIL", hit ? `caption found in ${hit.from}` : `caption "${t.copy}" is not in ${ctx.locked ? "the locked script or " : ""}the brief copy${why}`);
      }
      // A voiced claim is still a claim: it needs a field that carries it, with its evidence.
      if (assertive) {
        const cs = t.claim_source;
        if (!cs) add(`claim.${t.id}`, "FAIL", `voiced line "${t.copy}" contains ${assertive[1]}; it needs claim_source naming the brief or kit field that carries it`);
        else if (FORBIDDEN_FIELD.test(cs)) add(`claim.${t.id}`, "FAIL", `claim_source ${cs} is a list of claims that may NOT run`);
        else if (!(cs.startsWith("kit.") ? kit : brief)) ungrounded(ctx, `claim.${t.id}`, `voiced claim "${t.copy}": claim_source ${cs} cannot be read without --${cs.startsWith("kit.") ? "kit" : "brief"}`);
        else {
          const vals = flat(resolve(cs, brief, kit));
          const ok = vals.some((v) => bare(v).includes(bare(t.copy)));
          add(`claim.${t.id}`, ok ? "PASS" : "FAIL", !vals.length ? `claim_source ${cs} is empty or missing` : ok ? `voiced claim found in ${cs}` : `voiced claim "${t.copy}" NOT found in ${cs}`);
        }
      }
      continue;
    }
    if (!brief && !t.source.startsWith("kit.")) { ungrounded(ctx, `ground.${t.id}`, `no --brief given, cannot verify "${t.copy}" against ${t.source}`); continue; }
    if (!kit && t.source.startsWith("kit.")) { ungrounded(ctx, `ground.${t.id}`, `no --kit given, cannot verify "${t.copy}" against ${t.source}`); continue; }
    // A field that names forbidden or unproven claims is not a source for them.
    if (FORBIDDEN_FIELD.test(t.source)) { add(`ground.${t.id}`, "FAIL", `source ${t.source} is a list of claims that may NOT run`); continue; }
    const vals = flat(resolve(t.source, brief, kit));
    if (!vals.length) add(`ground.${t.id}`, "FAIL", `source ${t.source} is empty or missing`);
    else add(`ground.${t.id}`, vals.some((v) => norm(v).includes(norm(t.copy))) ? "PASS" : "FAIL", `"${t.copy}" ${vals.some((v) => norm(v).includes(norm(t.copy))) ? "found in" : "NOT found in"} ${t.source}`);
  }

  // Whatever its stated source, no line may carry a claim the kit forbids.
  const banned = [];
  const collect = (o, p = "") => { if (!o || typeof o !== "object") return; for (const [k, v] of Object.entries(o)) { const here = p ? `${p}.${k}` : k; if (/forbidden|banned/i.test(k)) banned.push(...flat(v).filter((x) => x.length > 3)); else collect(v, here); } };
  collect(kit);
  for (const t of scenes.flatMap((s) => s.text || [])) {
    const c = norm(t.copy);
    const hit = banned.find((b) => { const n = norm(b); return c.includes(n) || (c.length > 6 && n.includes(c)); });
    if (hit) add(`forbidden.${t.id}`, "FAIL", `"${t.copy}" matches the kit's forbidden claim "${hit}"`);
  }

  // Sound off is the default viewing condition: burned captions (CAP), or a covering SRT (CLEAN).
  checkDelivery(sb, ctx, scenes);
  // A bed whose licence cannot be named does not run.
  const music = sb.audio?.music;
  if (music?.file) {
    const lic = typeof music.licence === "string" ? music.licence.trim() : "";
    add("music.licence", lic ? "PASS" : "FAIL", lic ? `music runs under: ${lic}` : `audio.music.file ${music.file} has no audio.music.licence; name the licence or drop the track`);
  }
  const mv = sb.audio?.music?.volume;
  if (mv != null && mv > 0.5) add("mix.music", "FAIL", `music volume ${mv} above 0.5`);
  const sfx = sb.audio?.sfx || [];
  const loud = sfx.filter((s) => (s.volume ?? 0.7) > 0.85);
  if (loud.length) add("mix.sfx", "WARN", `${loud.length} effects above 0.85 volume`);
  if (sfx.length > sb.duration * 0.6) add("mix.density", "WARN", `${sfx.length} effects in ${sb.duration}s; fewer cues, better timed`);
  if (sb.audio?.voiceover?.file) {
    if (!phrases) add("mix.onsets", "WARN", "voice phrase onsets not checked; pass --phrases (phrase-map.mjs output)");
    else {
      const at = sb.audio.voiceover.at ?? 0;
      const onsets = (phrases.phrases || []).map((p) => p.start + at);
      const hits = onsetGuard(sfx, onsets).map((h) => `${h.file} at ${h.at}s, ${h.lead.toFixed(3)}s before the phrase at ${h.onset.toFixed(3)}s`);
      add("mix.onsets", hits.length ? "FAIL" : "PASS", hits.length ? hits.join("; ") : `no effect in the ${ONSET_GUARD}s before any of ${onsets.length} phrase onsets`);
    }
  }
  if (sb.audio && !sb.audio.music && !sb.audio.silence_reason) add("mix.music", "WARN", "no music bed and no silence_reason");
  checkDerived(sb, ctx);
}

// Row isolation: across a Matrix Sprint Test row everything is identical
// except the declared slot. Paths below the slot scene, and ids/names, may differ.
function checkRow(paths) {
  const sbs = paths.map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
  const slot = sbs[0].slot;
  if (!slot?.scene) return add("row.slot", "FAIL", `${paths[0]} declares no slot.scene`);
  const ignore = new Set(["name", "brief_id", "id", "slot", "notes"]);
  const diffs = [];
  const walk = (a, b, p) => {
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(p);
      return;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (p === "" && ignore.has(k)) continue;
      walk(a[k], b[k], p ? `${p}.${k}` : k);
    }
  };
  const slotIdx = sbs[0].scenes.findIndex((s) => s.id === slot.scene);
  for (let i = 1; i < sbs.length; i++) walk(sbs[0], sbs[i], "");
  const bad = [...new Set(diffs)].filter((d) => !d.startsWith(`scenes.${slotIdx}.text`) && !d.startsWith(`scenes.${slotIdx}.visual`) && !d.startsWith(`scenes.${slotIdx}.layers`));
  add("row.isolation", bad.length ? "FAIL" : "PASS", bad.length ? `differences outside slot ${slot.scene}: ${bad.slice(0, 12).join(", ")}` : `${sbs.length} cells differ only inside ${slot.scene}`);
  const timing = [...new Set(diffs)].filter((d) => /\.(in|out|dur|start|end)$/.test(d));
  if (timing.length) add("row.timing", "FAIL", `timing differs across cells: ${timing.join(", ")}; the slot changes words, never the clock`);
}

if (argv[0] === "--row") checkRow(argv.slice(1));
else {
  const sbPath = argv.find((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
  if (!sbPath) {
    console.error("usage: check-storyboard.mjs <storyboard.json> --brief brief.json [--kit kit.json] [--phrases phrases.json] [--script locked] [--packet packet.json] [--allow-ungrounded]");
    process.exit(2);
  }
  const ctx = {
    brief: load(flag("--brief")), kit: load(flag("--kit")), phrases: load(flag("--phrases")),
    scriptPath: flag("--script"), packetPath: flag("--packet"), allowUngrounded: argv.includes("--allow-ungrounded"),
    sbDir: path.dirname(path.resolve(sbPath)), unchecked: [], locked: null,
  };
  checkOne(load(sbPath), ctx);
  if (ctx.allowUngrounded) {
    overrides.push({ flag: "--allow-ungrounded", effect: "rules that could not be grounded are WARN, not FAIL", unchecked: ctx.unchecked });
    console.error(`check-storyboard: OVERRIDE --allow-ungrounded, ${ctx.unchecked.length} rule(s) unchecked${ctx.unchecked.length ? `: ${ctx.unchecked.join(", ")}` : ""}`);
  }
}

const fails = results.filter((r) => r.verdict === "FAIL").length;
const warns = results.filter((r) => r.verdict === "WARN").length;
console.log(JSON.stringify({ verdict: fails ? "FAIL" : "PASS", fails, warns, overrides, results }, null, 2));
process.exit(fails ? 1 : 0);
