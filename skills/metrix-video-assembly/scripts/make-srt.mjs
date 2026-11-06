#!/usr/bin/env node
/*
 * Export the storyboard's spoken-caption lines as an SRT file.
 *
 *   node make-srt.mjs <storyboard.json> [--out captions.srt] [--source voiceover] [--all]
 *
 * A caption cue is a storyboard text item whose "source" is "voiceover" (the caption of
 * a voiced line, the one kind check-storyboard.mjs requires beside a voiceover). Each cue
 * runs from the item's "in" to its "out". --source names a different source value;
 * --all exports every text item, which is a review aid and not a caption track.
 *
 * Cues are sorted by start time. A cue that would run into the next one is clamped to end
 * 1 ms before it and reported on stderr. A cue with no length, a negative time or a time
 * past the storyboard's duration fails, because an SRT with a wrong clock is worse than none.
 * Times are the storyboard's own: this tool reads no media and never hears a take.
 *
 * The core (srtFromItems, storyboardItems, srtStamp) is exported so timeline.mjs emit writes
 * the SRT through this one formatter; the CLI below is unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class SrtError extends Error {
  constructor(message) {
    super(message);
    this.name = "SrtError";
  }
}

/** Caption items from a storyboard: text items with the given source, or every item with all. */
export function storyboardItems(sb, { source = "voiceover", all = false } = {}) {
  const items = [];
  for (const scene of sb.scenes || []) {
    for (const t of scene.text || []) {
      if (!all && t.source !== source) continue;
      items.push({ id: t.id ?? `${scene.id}#${items.length}`, text: String(t.copy ?? "").trim(), start: Number(t.in), end: Number(t.out) });
    }
  }
  return items;
}

const pad = (n, w) => String(n).padStart(w, "0");
/** SRT time stamp, nearest millisecond. */
export const srtStamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  return `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`;
};

/**
 * items [{id, text, start, end}] -> { srt, notes[], count }. Throws SrtError on a cue with no
 * text, a non-numeric or negative time, no length, or an end past duration. Sorts by start and
 * clamps an overlapping cue to end 1 ms before the next (each clamp is a note).
 */
export function srtFromItems(input, { duration } = {}) {
  const items = input.map((c) => ({ ...c }));
  for (const c of items) {
    if (!c.text) throw new SrtError(`cue "${c.id}" has no text`);
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) throw new SrtError(`cue "${c.id}" needs numeric in and out times`);
    if (c.start < 0) throw new SrtError(`cue "${c.id}" starts before 0 s`);
    if (!(c.end > c.start)) throw new SrtError(`cue "${c.id}" has no length (in ${c.start}, out ${c.end})`);
    if (Number.isFinite(duration) && c.end > duration + 1e-6) throw new SrtError(`cue "${c.id}" ends at ${c.end} s, after the storyboard's ${duration} s`);
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  const notes = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const next = items[i + 1];
    if (items[i].end > next.start) {
      const clamped = Math.max(items[i].start + 0.001, next.start - 0.001);
      notes.push(`cue "${items[i].id}" overlapped "${next.id}"; its end was clamped from ${items[i].end} s to ${clamped.toFixed(3)} s`);
      items[i].end = clamped;
    }
  }
  const srt = items.map((c, i) => `${i + 1}\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\n${c.text}\n`).join("\n");
  return { srt, notes, count: items.length };
}

function main(argv) {
  const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !["--out", "--source"].includes(argv[i - 1])));
  const die = (m) => { console.error(`make-srt: ${m}`); process.exit(1); };
  if (!input) die("usage: make-srt.mjs <storyboard.json> [--out captions.srt] [--source voiceover] [--all]");

  let sb;
  try { sb = JSON.parse(fs.readFileSync(input, "utf8")); } catch (e) { die(`cannot read ${input}: ${e.message}`); }
  const source = flag("--source", "voiceover");
  const all = argv.includes("--all");
  const items = storyboardItems(sb, { source, all });
  if (!items.length) die(all ? "the storyboard has no text items" : `no text item has source "${source}"; nothing to caption`);

  let result;
  try {
    result = srtFromItems(items, { duration: Number(sb.duration) });
  } catch (e) {
    if (e instanceof SrtError) die(e.message);
    throw e;
  }
  for (const n of result.notes) console.error(`make-srt: ${n}`);

  const out = flag("--out", null);
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, result.srt);
    console.error(`make-srt: wrote ${result.count} cue(s) to ${out}`);
  } else process.stdout.write(result.srt);
}

// Run as a CLI only when executed directly (realpath, so a junction or symlink path still runs it).
const self = (() => { try { return pathToFileURL(fs.realpathSync(process.argv[1] ?? "")).href; } catch { return ""; } })();
if (self === import.meta.url) main(process.argv.slice(2));
