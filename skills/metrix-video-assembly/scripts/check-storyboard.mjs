#!/usr/bin/env node
/*
 * Check a storyboard against the assembly laws before anything is rendered.
 *
 *   node check-storyboard.mjs <storyboard.json> [--brief brief.json] [--kit brand-kit.json] [--phrases phrases.json]
 *   node check-storyboard.mjs --row a.json b.json c.json      (Matrix Sprint Test row isolation)
 *
 * Prints a JSON report; exit 1 on any FAIL. WARN never fails the run, it is
 * something a person should look at.
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
 */
import fs from "node:fs";

const argv = process.argv.slice(2);
const flag = (k) => {
  const i = argv.indexOf(k);
  return i === -1 ? null : argv[i + 1];
};
const load = (p) => (p ? JSON.parse(fs.readFileSync(p, "utf8")) : null);
const results = [];
const add = (rule, verdict, detail) => results.push({ rule, verdict, detail });
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// Reading floor from brag, kept as is: a short label needs ~0.8s settled, a
// sentence ~0.3s per word with a 1.2s minimum. Pace comes from motion and
// cuts, never from pulling text before it can be read.
const floorFor = (copy) => (words(copy) <= 3 ? 0.8 : Math.max(1.2, 0.3 * words(copy)));
const settled = (t) => ({ from: t.in + (t.enter === "none" ? 0 : t.dur ?? 0.35), to: t.out });

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

const ONSET_GUARD = 0.25;

function checkOne(sb, brief, kit, phrases) {
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
      // Captions of speech the viewer also hears are read along at speaking
      // pace: about 4 words a second, never under 0.6s.
      const need = t.source === "voiceover" ? Math.max(0.6, 0.25 * words(t.copy)) : floorFor(t.copy);
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

  // Grounding. What the ad asserts must come from the brief or the kit.
  for (const t of scenes.flatMap((s) => s.text || [])) {
    if (!t.source) { add(`ground.${t.id}`, "FAIL", `"${t.copy}" has no source`); continue; }
    if (t.source === "framing") {
      const hit = ASSERTIVE.find(([re]) => re.test(t.copy));
      add(`ground.${t.id}`, hit ? "FAIL" : "PASS", hit ? `framing line "${t.copy}" contains ${hit[1]}; a claim needs a sourced field` : "framing, asserts nothing");
      continue;
    }
    // A caption of a voiced line is grounded in the script it captions: the
    // brief's copy, or audio.voiceover.script when the storyboard carries one.
    if (t.source === "voiceover") {
      const script = [sb.audio?.voiceover?.script, ...flat(brief?.copy_architecture)].filter(Boolean);
      if (!script.length) { add(`ground.${t.id}`, "WARN", `caption "${t.copy}": no brief copy or voiceover script to check it against`); continue; }
      const ok = script.some((v) => norm(v).replace(/[.,!?;:]/g, "").includes(norm(t.copy).replace(/[.,!?;:]/g, "")));
      add(`ground.${t.id}`, ok ? "PASS" : "FAIL", ok ? `caption found in the voiced script` : `caption "${t.copy}" is not in the brief copy or voiceover script`);
      continue;
    }
    if (!brief && !t.source.startsWith("kit.")) { add(`ground.${t.id}`, "WARN", `no --brief given, cannot verify "${t.copy}" against ${t.source}`); continue; }
    if (!kit && t.source.startsWith("kit.")) { add(`ground.${t.id}`, "WARN", `no --kit given, cannot verify "${t.copy}" against ${t.source}`); continue; }
    // A field that names forbidden or unproven claims is not a source for them.
    if (/forbidden|banned|avoid|unverified|unsourced/i.test(t.source)) { add(`ground.${t.id}`, "FAIL", `source ${t.source} is a list of claims that may NOT run`); continue; }
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

  // Sound off is the default viewing condition.
  if (sb.audio?.voiceover && !scenes.some((s) => (s.text || []).some((t) => t.source === "voiceover"))) add("sound_off", "FAIL", "voiceover present but no caption lines (source: voiceover) carry it on screen");
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
      const hits = sfx.flatMap((x) => onsets.filter((o) => x.at >= o - ONSET_GUARD && x.at < o).map((o) => `${x.file} at ${x.at}s, ${(o - x.at).toFixed(3)}s before the phrase at ${o.toFixed(3)}s`));
      add("mix.onsets", hits.length ? "FAIL" : "PASS", hits.length ? hits.join("; ") : `no effect in the ${ONSET_GUARD}s before any of ${onsets.length} phrase onsets`);
    }
  }
  if (sb.audio && !sb.audio.music && !sb.audio.silence_reason) add("mix.music", "WARN", "no music bed and no silence_reason");
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
else checkOne(load(argv[0]), load(flag("--brief")), load(flag("--kit")), load(flag("--phrases")));

const fails = results.filter((r) => r.verdict === "FAIL").length;
const warns = results.filter((r) => r.verdict === "WARN").length;
console.log(JSON.stringify({ verdict: fails ? "FAIL" : "PASS", fails, warns, results }, null, 2));
process.exit(fails ? 1 : 0);
