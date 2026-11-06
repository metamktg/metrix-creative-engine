#!/usr/bin/env node
// Turn a checked phrase map (phrase-map.mjs --out) into a HyperFrames caption
// component. The engine stays the one source of word timing: the words come from
// the ASR pass that already passed the script check, and caption groups never
// cross a phrase, so every caption breaks where the speaker actually pauses.
//
//   node captions-from-phrases.mjs <phrases.json> --component <caption-*.html>
//        --out <file.html> [--offset 0] [--max-words 3] [--width 1080] [--height 1920]
//        [--duration <s>] [--bottom <px>]
//
// The component is any registry caption block installed with
// `npx hyperframes add caption-<name>`; its WORDS and RAW_GROUPS arrays and its
// canvas size are replaced, the animation is left as HyperFrames wrote it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Flatten phrases into words on the ad clock and group them inside each phrase. */
export function buildCaptionTrack(phrases, { offset = 0, maxWords = 3 } = {}) {
  if (!Array.isArray(phrases) || phrases.length === 0) throw new Error("no phrases in the phrase map");
  if (!(maxWords >= 1)) throw new Error("--max-words must be 1 or more");
  const words = [];
  const groups = [];
  for (const p of phrases) {
    const pw = (p.words || []).filter((w) => String(w.text).trim() !== "");
    if (pw.length === 0) continue;
    for (let i = 0; i < pw.length; i += maxWords) {
      const first = words.length;
      for (const w of pw.slice(i, i + maxWords)) {
        const start = round(Number(w.start) + offset);
        const end = round(Math.max(Number(w.end), Number(w.start)) + offset);
        if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`word "${w.text}" has no valid time`);
        if (words.length && start < words[words.length - 1].start) throw new Error(`word "${w.text}" at ${start}s starts before the word before it`);
        words.push({ text: String(w.text).trim(), start, end });
      }
      groups.push([first, words.length - 1]);
    }
  }
  if (words.length === 0) throw new Error("the phrase map has no words: run phrase-map.mjs with ASR, not --no-asr");
  return { words, groups };
}

/** Replace the component's transcript, groups and canvas size. Fails loudly if the block's shape changed. */
export function injectCaptionComponent(html, { words, groups }, { width, height, duration, bottom }) {
  const wordsRe = /var WORDS = \[[\s\S]*?\];/;
  const groupsRe = /var RAW_GROUPS = \[[\s\S]*?\];/;
  if (!wordsRe.test(html) || !groupsRe.test(html)) throw new Error("component has no WORDS / RAW_GROUPS arrays: not a registry caption block, or its format changed");
  const m = html.match(/data-width="(\d+)"[\s\S]*?data-height="(\d+)"/);
  if (!m) throw new Error("component has no data-width / data-height");
  const [ow, oh] = [m[1], m[2]];
  let out = html
    .replace(wordsRe, `var WORDS = ${JSON.stringify(words, null, 2)};`)
    .replace(groupsRe, `var RAW_GROUPS = ${JSON.stringify(groups)};`);
  if (width && height) {
    out = out
      .replace(new RegExp(`width=${ow}, height=${oh}`, "g"), `width=${width}, height=${height}`)
      .replace(new RegExp(`width: ${ow}px`, "g"), `width: ${width}px`)
      .replace(new RegExp(`height: ${oh}px`, "g"), `height: ${height}px`)
      .replace(`data-width="${ow}"`, `data-width="${width}"`)
      .replace(`data-height="${oh}"`, `data-height="${height}"`);
  }
  // Registry blocks end a group 0.05 s before the next one starts: a 1.5-frame blank
  // at every caption change. A human editor cuts caption to caption, so close it.
  out = out.replace(/nextStart - 0\.05\b/g, "nextStart");
  if (bottom != null) {
    const re = /(\.[\w-]*group\s*\{[^}]*?bottom:\s*)\d+px/;
    if (!re.test(out)) throw new Error("component has no group bottom offset to move: set the caption position by hand");
    out = out.replace(re, `$1${Math.round(bottom)}px`);
  }
  if (duration) out = out.replace(/(data-composition-id="[^"]+"[\s\S]*?data-duration=")[\d.]+(")/, `$1${round(duration)}$2`);
  return out;
}

/**
 * Keep the closing caption on screen to the end of the film. Registry blocks end a
 * group 0.5 s after its last word, so the last word's end is moved to duration - 0.5
 * (never earlier than it was). The closing line is the one viewers read longest.
 */
export function holdLastGroup(track, duration) {
  const last = track.words.at(-1);
  if (last && duration) last.end = round(Math.max(last.end, duration - 0.5));
  return track;
}

const round = (n) => Math.round(n * 1000) / 1000;

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

function main(argv) {
  const input = argv[0];
  const component = arg(argv, "--component");
  const out = arg(argv, "--out");
  if (!input || !component || !out) {
    console.error("usage: captions-from-phrases.mjs <phrases.json> --component <caption.html> --out <file.html> [--offset s] [--max-words n] [--width px] [--height px] [--duration s]");
    return 2;
  }
  const map = JSON.parse(fs.readFileSync(input, "utf8"));
  if (map.script_check && map.script_check.verdict !== "MATCH") {
    console.error("phrase map failed its script check: fix the take before captioning it");
    return 1;
  }
  const offset = Number(arg(argv, "--offset", 0));
  const track = buildCaptionTrack(map.phrases, { offset, maxWords: Number(arg(argv, "--max-words", 3)) });
  const duration = Number(arg(argv, "--duration", 0)) || round((map.duration || track.words.at(-1).end) + offset);
  holdLastGroup(track, duration);
  const width = Number(arg(argv, "--width", 0)) || undefined;
  const height = Number(arg(argv, "--height", 0)) || undefined;
  // Vertical video: keep captions above the platform's bottom overlay (caption,
  // CTA and profile rows). 36 % of the height clears it; pass --bottom to override.
  const bottomArg = arg(argv, "--bottom");
  const bottom = bottomArg != null ? Number(bottomArg) : height && width && height / width > 1.5 ? height * 0.36 : undefined;
  const html = injectCaptionComponent(fs.readFileSync(component, "utf8"), track, { width, height, duration, bottom });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`captions: ${track.words.length} words in ${track.groups.length} groups, ${duration}s -> ${out}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
