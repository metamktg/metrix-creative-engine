/*
 * The verdicts render.mjs reaches from what the page reports: watchdog budgets, page health,
 * authored-DOM parity with the storyboard, and the craft checks. Pure: no I/O, no browser, so
 * each rule is unit tested without Chrome (src/__tests__/render-health.test.ts).
 *
 * Craft thresholds (line_unread, dead_stretch, type floor) are adapted from HyperFrames
 * packages/cli/src/utils/craftAudit.ts at fc0b53361bf3 (Apache-2.0, HeyGen). The numbers and
 * the rules are theirs; this file re-implements them over MCE's per-frame page samples.
 * They WARN. A craft finding FAILs only where an MCE rule already says so: a storyboard line
 * that settles on screen for less than check-storyboard's read floor (floorFor, or voFloorFor for
 * a voiced caption).
 */
import { floorFor, norm, SETTLE_DEFAULT, voFloorFor, words } from "./timeline/rules.mjs";

// ---------------------------------------------------------------- watchdog ---
// Milliseconds. load covers launch, navigation and page readiness; evaluate is one in-page call;
// capture one screenshot; perFrame times the number of seeks a mode makes gives the total budget.
// seekFallback and readyVideo are the in-page waits runtime.js used to hard-code (3 s and 15 s).
export const TIMEOUT_DEFAULTS = Object.freeze({ load: 30000, evaluate: 20000, capture: 10000, perFrame: 2000, seekFallback: 3000, readyVideo: 15000 });

export function parseTimeouts(text) {
  const out = { ...TIMEOUT_DEFAULTS };
  if (text == null || text === "") return out;
  let given;
  try {
    given = typeof text === "string" ? JSON.parse(text) : text;
  } catch (e) {
    throw new Error(`--timeouts is not JSON: ${e.message}`);
  }
  if (!given || typeof given !== "object" || Array.isArray(given)) throw new Error("--timeouts must be a JSON object of millisecond values");
  for (const [k, v] of Object.entries(given)) {
    if (!(k in TIMEOUT_DEFAULTS)) throw new Error(`--timeouts: unknown key "${k}" (known: ${Object.keys(TIMEOUT_DEFAULTS).join(", ")})`);
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new Error(`--timeouts: ${k} must be a positive number of milliseconds`);
    out[k] = v;
  }
  return out;
}

// ------------------------------------------------------------------ health ---
// Each of these used to be a WARN on stderr, or silent. They FAIL now: a frame rendered over a
// broken image, a fallback font, a video that never loaded or a seek that gave up is a wrong frame.
export function healthVerdict(h, { settleDefault = SETTLE_DEFAULT } = {}) {
  const reasons = [];
  if (h.broken_images?.length) reasons.push(`broken images: ${h.broken_images.join(", ")}`);
  if (h.unloaded_fonts?.length) reasons.push(`fonts not loaded: ${h.unloaded_fonts.join(", ")}`);
  for (const v of h.videos || []) {
    if (!(v.readyState >= 1) || !Number.isFinite(v.duration)) reasons.push(`video ${v.src} not ready (readyState ${v.readyState}, duration ${v.duration})`);
  }
  if (h.seek_fallbacks > 0) reasons.push(`${h.seek_fallbacks} clip seek(s) gave up after the fallback wait instead of a seeked event and a presented frame`);
  if (h.frame_mismatches > 0) reasons.push(`${h.frame_mismatches} clip seek(s) presented a different source frame from the one the timeline maps to`);
  if (h.runtime && !h.runtime.current) reasons.push(h.runtime.reason || "the page does not run the skill's current runtime.js");
  if (h.config && h.config.settleDefault !== settleDefault) reasons.push(`page settle default ${h.config.settleDefault} differs from timeline/rules.mjs SETTLE_DEFAULT ${settleDefault}`);
  return { verdict: reasons.length ? "FAIL" : "PASS", reasons };
}

// ------------------------------------------------------------------ parity ---
// The authored DOM (before any seek or bind) against the storyboard. Effective values follow
// runtime.js exactly: data-in falls back to the scene's data-start, data-out to its data-end,
// data-dur to the settle default, data-enter to "fade", data-exit to "none".
export const PARITY_TOL = 1.5e-3; // timeline/schema.mjs ROUND_TOL: times are written to 3 dp

const attrNum = (v) => (v === null || v === undefined || v === "" ? null : parseFloat(v));

export function effectiveText(a, settleDefault = SETTLE_DEFAULT) {
  const sceneStart = a.scene ? attrNum(a.scene.start) : null;
  const sceneEnd = a.scene ? attrNum(a.scene.end) : null;
  return {
    in: attrNum(a.in) ?? sceneStart ?? 0,
    out: attrNum(a.out) ?? sceneEnd ?? Infinity,
    dur: attrNum(a.dur) ?? settleDefault,
    enter: a.enter || "fade",
    exit: a.exit || "none",
  };
}

export function parity(authored, sb, { settleDefault = SETTLE_DEFAULT, tol = PARITY_TOL } = {}) {
  const findings = [];
  const add = (verdict, id, field, message, extra = {}) => findings.push({ id, field, verdict, message, ...extra });
  const byId = new Map();
  for (const a of authored.texts || []) {
    if (byId.has(a.id)) add("FAIL", a.id, "id", `two [data-text="${a.id}"] elements: the checks cannot tell which one the storyboard means`);
    else byId.set(a.id, a);
  }
  const items = (sb.scenes || []).flatMap((s) => (s.text || []).map((t) => ({ ...t, scene: s.id })));
  const near = (x, y) => (x === Infinity && y === Infinity) || Math.abs(x - y) <= tol;
  for (const item of items) {
    const a = byId.get(item.id);
    if (!a) {
      add("FAIL", item.id, "element", `no [data-text="${item.id}"] element in the composition`);
      continue;
    }
    const e = effectiveText(a, settleDefault);
    for (const k of ["in", "out"]) {
      if (typeof item[k] === "number" && !near(e[k], item[k])) add("FAIL", item.id, k, `data-${k} ${e[k]} differs from storyboard ${k} ${item[k]}`, { authored: e[k], storyboard: item[k] });
    }
    const sbNone = item.enter === "none", domNone = e.enter === "none";
    if (sbNone !== domNone) {
      add("FAIL", item.id, "enter", `data-enter "${e.enter}" differs from storyboard enter "${item.enter ?? "(default)"}": one settles at once, the other after its dur`, { authored: e.enter, storyboard: item.enter ?? null });
    } else if (item.enter && item.enter !== e.enter) {
      add("WARN", item.id, "enter", `data-enter "${e.enter}" differs from storyboard enter "${item.enter}" (same settle time, different motion)`, { authored: e.enter, storyboard: item.enter });
    }
    if (!sbNone && !domNone) {
      const want = typeof item.dur === "number" ? item.dur : settleDefault;
      if (!near(e.dur, want)) add("FAIL", item.id, "dur", `data-dur ${e.dur} differs from storyboard dur ${want}${typeof item.dur === "number" ? "" : " (default)"}`, { authored: e.dur, storyboard: want });
    }
    if (item.exit && item.exit !== e.exit) add("FAIL", item.id, "exit", `data-exit "${e.exit}" differs from storyboard exit "${item.exit}"`, { authored: e.exit, storyboard: item.exit });
    if (norm(a.text) !== norm(item.copy)) add("FAIL", item.id, "copy", `authored copy "${String(a.text).trim()}" differs from storyboard "${item.copy}"`, { authored: a.text, storyboard: item.copy });
  }
  const known = new Set(items.map((t) => t.id));
  for (const a of byId.values()) {
    if (!known.has(a.id)) add("WARN", a.id, "element", `[data-text="${a.id}"] is in the composition but not in the storyboard, so no storyboard check saw its copy`);
  }
  let scenes = 0;
  const domScenes = new Map((authored.scenes || []).map((s) => [s.id, s]));
  for (const s of sb.scenes || []) {
    const d = domScenes.get(s.id);
    if (!d) continue; // compositions may drive scenes from a hook (v19 does); then there is nothing to compare
    scenes++;
    for (const [k, attr] of [["start", "start"], ["end", "end"]]) {
      const v = attrNum(d[attr]);
      if (v !== null && typeof s[k] === "number" && !near(v, s[k])) add("FAIL", s.id, `scene.${k}`, `scene data-${k} ${v} differs from storyboard ${k} ${s[k]}`, { authored: v, storyboard: s[k] });
    }
  }
  const fails = findings.filter((f) => f.verdict === "FAIL").length;
  return { verdict: fails ? "FAIL" : findings.length ? "WARN" : "PASS", checked: { texts: items.length, scenes }, findings };
}

// ------------------------------------------------------------------- craft ---
export const CRAFT = Object.freeze({
  readOpacity: 0.5,
  settledOpacity: 0.98, // the layout check's visibility bar (runtime.js __layout)
  shortLineWords: 2,
  shortLineFloorSec: 0.4,
  holdBaseSec: 0.5,
  holdPerWordSec: 0.3,
  holdFloorFraction: 0.75,
  finalLineFloorSec: 2,
  deadStretchSec: 3,
  endCardSec: 3,
  typeFloorFraction: 0.026,
  typeFloorHoldSec: 0.5,
});

const WORD_RUNS = /[\p{L}\p{M}\p{N}%$]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
export const readingWords = (text) => (String(text).toLowerCase().normalize("NFC").match(WORD_RUNS) || []).length;

// Shortest on-screen hold that does not warn: 0.75 x (0.5 s + 0.3 s a word), 0.4 s for one or
// two words, and at least 2 s for the film's last line.
export function lineFloorSec(n, finalLine) {
  const floor = n <= CRAFT.shortLineWords ? CRAFT.shortLineFloorSec : CRAFT.holdFloorFraction * (CRAFT.holdBaseSec + CRAFT.holdPerWordSec * n);
  return finalLine ? Math.max(floor, CRAFT.finalLineFloorSec) : floor;
}

export const typeFloorPx = (width, height) => Math.round(CRAFT.typeFloorFraction * Math.min(width, height));

// Index runs where pred holds; returns the longest as [first, last] or null.
function longestRun(samples, pred) {
  let best = null, start = -1;
  for (let i = 0; i <= samples.length; i++) {
    const on = i < samples.length && pred(samples[i], i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = -1;
    }
  }
  return best;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/*
 * samples: [{t, sig, held, items: {id: {vis, own, eff}}, small: [{key, label, text, font_px}]}]
 *   vis  the element renders (display, visibility, its scene visible)
 *   own  the element's own computed opacity (what runtime.js animates)
 *   eff  opacity multiplied up the ancestor chain
 *   small: text elements at or above readOpacity whose font is under the type floor
 * step is the sample spacing in seconds; one step is the measuring tolerance.
 */
export function craft(samples, { sb, step, width, height }) {
  // No samples means nothing was checked (an older runtime without __probe): FAIL, never PASS.
  if (!samples.length) {
    return { verdict: "FAIL", step: r3(step), samples: 0, type_floor_px: typeFloorPx(width, height), lines: [],
      findings: [{ code: "not_run", verdict: "FAIL", message: "craft checks not run: the page returned no samples (its runtime.js has no __probe)" }] };
  }
  const findings = [];
  const duration = sb.duration;
  const items = (sb.scenes || []).flatMap((s) => (s.text || []).map((t) => ({ ...t, scene: s.id })));

  // line_unread
  const measured = items.map((item) => {
    const look = (s) => s.items?.[item.id];
    const visible = longestRun(samples, (s) => look(s)?.vis && look(s).eff >= CRAFT.readOpacity);
    // settled: fully entered (own opacity at the layout bar) until the element leaves.
    const firstSettled = samples.findIndex((s) => look(s)?.vis && look(s).own >= CRAFT.settledOpacity);
    let lastOn = -1;
    if (firstSettled >= 0) {
      lastOn = firstSettled;
      while (lastOn + 1 < samples.length && look(samples[lastOn + 1])?.vis && look(samples[lastOn + 1]).own > 0) lastOn++;
    }
    return {
      item,
      visible: visible ? { from: samples[visible[0]].t, to: samples[visible[1]].t + step, sec: (visible[1] - visible[0] + 1) * step } : null,
      settled: firstSettled >= 0 ? { from: samples[firstSettled].t, to: samples[lastOn].t + step, sec: (lastOn - firstSettled + 1) * step } : null,
    };
  });
  const latest = Math.max(-Infinity, ...measured.filter((m) => m.visible).map((m) => m.visible.to));
  for (const m of measured) {
    const { item } = m;
    const need = item.source === "voiceover" ? voFloorFor(item.copy) : floorFor(item.copy);
    if (m.settled && m.settled.sec + step + 1e-6 < need) {
      findings.push({ code: "line_unread", verdict: "FAIL", id: item.id, rule: "check-storyboard read floor",
        seconds: r3(m.settled.sec), floor_seconds: r3(need), at: r3(m.settled.from),
        message: `"${item.copy}" is settled on screen ${m.settled.sec.toFixed(2)} s (${r3(m.settled.from)}-${r3(m.settled.to)} s), under the ${need.toFixed(2)} s read floor check-storyboard holds it to (${words(item.copy)} words)` });
      continue;
    }
    // Voiced captions are read along with the speech, as HyperFrames treats captions: MCE's own
    // floor (above) covers them; the HyperFrames hold does not.
    if (item.source === "voiceover" || !m.visible) continue;
    const n = readingWords(item.copy);
    const finalLine = m.visible.to >= latest - 1e-6;
    const floor = lineFloorSec(n, finalLine);
    if (m.visible.sec + step + 1e-6 < floor) {
      findings.push({ code: "line_unread", verdict: "WARN", id: item.id, rule: "hyperframes craft",
        seconds: r3(m.visible.sec), floor_seconds: r3(floor), at: r3(m.visible.from), final_line: finalLine,
        message: `"${item.copy}" (${n} words) is on screen ${m.visible.sec.toFixed(2)} s, under its ${floor.toFixed(2)} s floor: hold it about 0.5 s + 0.3 s a word${finalLine ? ", and at least 2 s as the last line" : ""}` });
    }
  }

  // dead_stretch: identical page signatures for more than 3 s, outside the end card and data-hold.
  const endCardStart = duration - CRAFT.endCardSec;
  let start = null, end = 0;
  const flush = () => {
    if (start !== null && end - start > CRAFT.deadStretchSec + 1e-9) {
      findings.push({ code: "dead_stretch", verdict: "WARN", at: r3(start), until: r3(end), seconds: r3(end - start), floor_seconds: CRAFT.deadStretchSec,
        message: `nothing on screen changes for ${(end - start).toFixed(2)} s (${r3(start)}-${r3(end)} s): start the next move within ${CRAFT.deadStretchSec} s, or mark deliberate stillness with data-hold` });
    }
    start = null;
  };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const still = a.sig !== "" && a.sig === b.sig && !a.held && !b.held && a.t < endCardStart;
    if (!still) { flush(); continue; }
    start ??= a.t;
    end = Math.min(b.t, endCardStart);
  }
  flush();

  // type floor: reading text under 2.6 % of the short side for 0.5 s or more.
  const floorPx = typeFloorPx(width, height);
  const seen = new Map();
  samples.forEach((s, i) => {
    for (const p of s.small || []) {
      if (!(p.font_px < floorPx - 0.5) || readingWords(p.text) === 0) continue;
      const e = seen.get(p.key) || { p, idx: new Set(), min: p.font_px };
      e.idx.add(i);
      e.min = Math.min(e.min, p.font_px);
      seen.set(p.key, e);
    }
  });
  for (const e of seen.values()) {
    const idx = [...e.idx].sort((x, y) => x - y);
    let best = idx.length ? 1 : 0, cur = 1;
    for (let k = 1; k < idx.length; k++) {
      cur = idx[k] === idx[k - 1] + 1 ? cur + 1 : 1;
      best = Math.max(best, cur);
    }
    const sec = best * step;
    if (sec + 1e-9 < CRAFT.typeFloorHoldSec) continue;
    findings.push({ code: "type_floor", verdict: "WARN", key: e.p.key, element: e.p.label, font_px: r3(e.min), floor_px: floorPx, seconds: r3(sec), at: r3(samples[idx[0]].t),
      message: `"${String(e.p.text).trim().slice(0, 40)}" (${e.p.label}) is ${Math.round(e.min)} px for ${sec.toFixed(2)} s, under the ${floorPx} px type floor (2.6 % of the ${Math.min(width, height)} px short side); set reading text to at least ${floorPx} px or mark texture with data-layout-ignore` });
  }

  const fails = findings.filter((f) => f.verdict === "FAIL").length;
  return {
    verdict: fails ? "FAIL" : findings.length ? "WARN" : "PASS",
    step: r3(step),
    samples: samples.length,
    type_floor_px: floorPx,
    lines: measured.map((m) => ({ id: m.item.id, visible_s: m.visible ? r3(m.visible.sec) : 0, settled_s: m.settled ? r3(m.settled.sec) : 0 })),
    findings,
  };
}

// Sample times for the craft pass: every step from 0 to just before the end.
export function sampleTimes(duration, step) {
  const n = Math.max(1, Math.ceil(duration / step - 1e-9));
  return Array.from({ length: n }, (_, k) => +(k * step).toFixed(6));
}
