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
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const input = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !["--out", "--source"].includes(argv[i - 1])));
const die = (m) => { console.error(`make-srt: ${m}`); process.exit(1); };
if (!input) die("usage: make-srt.mjs <storyboard.json> [--out captions.srt] [--source voiceover] [--all]");

let sb;
try { sb = JSON.parse(fs.readFileSync(input, "utf8")); } catch (e) { die(`cannot read ${input}: ${e.message}`); }
const source = flag("--source", "voiceover");
const all = argv.includes("--all");
const duration = Number(sb.duration);

const items = [];
for (const scene of sb.scenes || []) {
  for (const t of scene.text || []) {
    if (!all && t.source !== source) continue;
    items.push({ id: t.id ?? `${scene.id}#${items.length}`, text: String(t.copy ?? "").trim(), start: Number(t.in), end: Number(t.out) });
  }
}
if (!items.length) die(all ? "the storyboard has no text items" : `no text item has source "${source}"; nothing to caption`);

for (const c of items) {
  if (!c.text) die(`cue "${c.id}" has no text`);
  if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) die(`cue "${c.id}" needs numeric in and out times`);
  if (c.start < 0) die(`cue "${c.id}" starts before 0 s`);
  if (!(c.end > c.start)) die(`cue "${c.id}" has no length (in ${c.start}, out ${c.end})`);
  if (Number.isFinite(duration) && c.end > duration + 1e-6) die(`cue "${c.id}" ends at ${c.end} s, after the storyboard's ${duration} s`);
}
items.sort((a, b) => a.start - b.start || a.end - b.end);
for (let i = 0; i + 1 < items.length; i++) {
  const next = items[i + 1];
  if (items[i].end > next.start) {
    const clamped = Math.max(items[i].start + 0.001, next.start - 0.001);
    console.error(`make-srt: cue "${items[i].id}" overlapped "${next.id}"; its end was clamped from ${items[i].end} s to ${clamped.toFixed(3)} s`);
    items[i].end = clamped;
  }
}

const pad = (n, w) => String(n).padStart(w, "0");
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  return `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`;
};
const srt = items.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");

const out = flag("--out", null);
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, srt);
  console.error(`make-srt: wrote ${items.length} cue(s) to ${out}`);
} else process.stdout.write(srt);
