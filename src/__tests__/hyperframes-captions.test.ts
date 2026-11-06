import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM helper without type declarations
import { buildCaptionTrack, holdLastGroup, injectCaptionComponent } from "../../skills/metrix-video-assembly/scripts/hyperframes/captions-from-phrases.mjs";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/hyperframes/captions-from-phrases.mjs", import.meta.url));

// The shape of a HyperFrames registry caption block (caption-highlight at v0.9.19), cut to the parts the adapter edits.
const component = `<meta name="viewport" content="width=1920, height=1080" />
<style>html, body { width: 1920px; height: 1080px; }
#c { width: 1920px; height: 1080px; }
.hl-group { position: absolute; bottom: 140px; left: 0; }</style>
<div id="c" data-composition-id="caption-highlight" data-start="0" data-duration="8" data-fps="30" data-width="1920" data-height="1080"></div>
<script>
var WORDS = [
  { text: "Every", start: 0.0, end: 0.3 },
];
var RAW_GROUPS = [
  [0, 0],
];
var gEnd = Math.min(WORDS[we].end + 0.5, nextStart - 0.05);
</script>`;

const phrases = [
  { id: "P1", start: 0, end: 1, words: [{ text: "Work's", start: 0.04, end: 0.5 }, { text: "done,", start: 0.5, end: 1.0 }] },
  { id: "P2", start: 1.2, end: 3, words: [{ text: "pick", start: 1.2, end: 1.5 }, { text: "a", start: 1.5, end: 1.6 }, { text: "topic", start: 1.6, end: 2.0 }, { text: "today.", start: 2.0, end: 2.6 }] },
];

describe("buildCaptionTrack", () => {
  it("groups words inside each phrase and never across a pause", () => {
    const t = buildCaptionTrack(phrases, { maxWords: 3 });
    expect(t.groups).toEqual([[0, 1], [2, 4], [5, 5]]);
    expect(t.words.map((w: { text: string }) => w.text)).toEqual(["Work's", "done,", "pick", "a", "topic", "today."]);
  });

  it("moves every word onto the ad clock by the voice offset", () => {
    const t = buildCaptionTrack(phrases, { offset: 0.5, maxWords: 3 });
    expect(t.words[0]).toEqual({ text: "Work's", start: 0.54, end: 1 });
  });

  it("refuses a phrase map with no words and words that go backwards", () => {
    expect(() => buildCaptionTrack([{ words: [] }])).toThrow(/no words/);
    expect(() => buildCaptionTrack([{ words: [{ text: "b", start: 2, end: 3 }, { text: "a", start: 1, end: 2 }] }])).toThrow(/before the word before it/);
  });

  it("holds the closing caption to the end of the film", () => {
    const t = holdLastGroup(buildCaptionTrack(phrases), 6);
    expect(t.words.at(-1).end).toBe(5.5);
  });
});

describe("injectCaptionComponent", () => {
  const track = buildCaptionTrack(phrases, { maxWords: 3 });
  const out = injectCaptionComponent(component, track, { width: 1080, height: 1920, duration: 6, bottom: 691 });

  it("replaces the transcript and groups", () => {
    expect(out).toContain('"text": "Work\'s"');
    expect(out).toContain("var RAW_GROUPS = [[0,1],[2,4],[5,5]];");
    expect(out).not.toContain('"Every"');
  });

  it("resizes the canvas, sets the duration and moves captions above the bottom overlay", () => {
    expect(out).toContain('data-width="1080"');
    expect(out).toContain('data-height="1920"');
    expect(out).toContain("width=1080, height=1920");
    expect(out).toContain('data-duration="6"');
    expect(out).toMatch(/\.hl-group \{[^}]*bottom: 691px/);
    expect(out).not.toContain("1920px; height: 1080px");
  });

  it("closes the blank gap between caption groups", () => {
    expect(out).not.toContain("nextStart - 0.05");
    expect(out).toContain("nextStart);");
  });

  it("fails loudly when the block is not a registry caption block", () => {
    expect(() => injectCaptionComponent("<div></div>", track, {})).toThrow(/WORDS/);
  });
});

describe("captions-from-phrases CLI", () => {
  it("refuses a phrase map whose script check did not match", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-cap-"));
    try {
      fs.writeFileSync(path.join(dir, "c.html"), component);
      fs.writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ duration: 3, phrases, script_check: { verdict: "MISMATCH" } }));
      fs.writeFileSync(path.join(dir, "ok.json"), JSON.stringify({ duration: 3, phrases, script_check: { verdict: "MATCH" } }));
      const run = (f: string) => spawnSync(process.execPath, [tool, path.join(dir, f), "--component", path.join(dir, "c.html"), "--out", path.join(dir, "o.html"), "--width", "1080", "--height", "1920"], { encoding: "utf8" });
      const bad = run("bad.json");
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("failed its script check");
      const ok = run("ok.json");
      expect(ok.status, ok.stderr).toBe(0);
      expect(fs.readFileSync(path.join(dir, "o.html"), "utf8")).toMatch(/bottom: 691px/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
