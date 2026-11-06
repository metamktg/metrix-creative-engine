/*
 * Timing rules for the assembly scripts. The sole definitions: check-storyboard.mjs and
 * render.mjs import them, and src/__tests__/single-definition.test.ts fails any other file
 * under scripts/ that defines one of these names again.
 *
 * Pure: no I/O, no globals, no side effects at import.
 *
 * Not covered here: runtime.js runs in the page and carries its own data-dur default of
 * 0.35 s (runtime.js:85). It must stay equal to SETTLE_DEFAULT below.
 */

// Default enter duration in seconds when a text item gives no dur.
export const SETTLE_DEFAULT = 0.35;

// Effects starting this many seconds before a phrase onset read as a breath or a clipped word.
export const ONSET_GUARD = 0.25;

export const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Copy compared for equality: case, curly quotes and runs of whitespace ignored.
export const norm = (s) => String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// The settled window of a text item: fully entered, not yet leaving.
export const settled = (t) => ({ from: t.in + (t.enter === "none" ? 0 : t.dur ?? SETTLE_DEFAULT), to: t.out });

// Reading floor from brag, kept as is: a short label needs ~0.8s settled, a
// sentence ~0.3s per word with a 1.2s minimum. Pace comes from motion and
// cuts, never from pulling text before it can be read.
export const floorFor = (copy) => (words(copy) <= 3 ? 0.8 : Math.max(1.2, 0.3 * words(copy)));

// Captions of speech the viewer also hears are read along at speaking
// pace: about 4 words a second, never under 0.6s.
export const voFloorFor = (copy) => Math.max(0.6, 0.25 * words(copy));

// Smallest multiple of step at or after t. The 1e-9 keeps a time already on the grid
// (up to float noise) where it is instead of pushing it one step later.
export const ceilTo = (t, step) => {
  if (!(step > 0)) throw new RangeError(`ceilTo: step must be > 0, got ${step}`);
  return Math.ceil(t / step - 1e-9) * step + 0; // + 0 turns -0 (from t = 0) into 0
};

// The musical grid point at or after t: beat = 60 / bpm, grid unit = beat / div.
// When the next full beat costs at most preferFullBeatCost seconds more than the next
// grid unit, the full beat wins. Default 0: plain ceiling to the grid unit.
// Reproduces grid_at_or_after in the LP-AI-01 v19 builder (prefer_full 0.04 there).
export const gridSnap = (t, { bpm, div = 1, preferFullBeatCost = 0 } = {}) => {
  if (!(bpm > 0)) throw new RangeError(`gridSnap: bpm must be > 0, got ${bpm}`);
  if (!(div >= 1) || !Number.isInteger(div)) throw new RangeError(`gridSnap: div must be a positive integer, got ${div}`);
  const beat = 60 / bpm;
  const unit = ceilTo(t, beat / div);
  const full = ceilTo(t, beat);
  return full - unit <= preferFullBeatCost ? full : unit;
};

// Effects that start in the guard window before a phrase onset (onset - guard <= at < onset).
// sfx: [{file, at}] on the ad clock; onsets: ad-clock seconds. One finding per (effect, onset).
export const onsetGuard = (sfx, onsets, guard = ONSET_GUARD) =>
  (sfx || []).flatMap((x) => (onsets || []).filter((o) => x.at >= o - guard && x.at < o).map((o) => ({ file: x.file, at: x.at, onset: o, lead: o - x.at })));
