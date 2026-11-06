import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts", import.meta.url));

type Item = { in: number; out: number; enter?: string; dur?: number };
type Hit = { file: string; at: number; onset: number; lead: number };
const rules = (await import(pathToFileURL(path.join(scripts, "timeline", "rules.mjs")).href)) as {
  SETTLE_DEFAULT: number;
  ONSET_GUARD: number;
  words: (s: string) => number;
  norm: (s: unknown) => string;
  settled: (t: Item) => { from: number; to: number };
  floorFor: (copy: string) => number;
  voFloorFor: (copy: string) => number;
  ceilTo: (t: number, step: number) => number;
  gridSnap: (t: number, o: { bpm: number; div?: number; preferFullBeatCost?: number }) => number;
  onsetGuard: (sfx: { file: string; at: number }[], onsets: number[], guard?: number) => Hit[];
};

describe("timeline rules: settled window", () => {
  it("defaults a missing dur to 0.35 s, as check-storyboard.mjs did before extraction", () => {
    expect(rules.SETTLE_DEFAULT).toBe(0.35);
    expect(rules.settled({ in: 1, out: 3 })).toEqual({ from: 1.35, to: 3 });
    expect(rules.settled({ in: 1, out: 3, enter: "fade" })).toEqual({ from: 1.35, to: 3 });
  });
  it("settles at once for enter none, and honours an explicit dur, including 0", () => {
    expect(rules.settled({ in: 2, out: 4, enter: "none", dur: 0.9 })).toEqual({ from: 2, to: 4 });
    expect(rules.settled({ in: 2, out: 4, dur: 0.5 })).toEqual({ from: 2.5, to: 4 });
    expect(rules.settled({ in: 2, out: 4, dur: 0 })).toEqual({ from: 2, to: 4 });
  });
});

describe("timeline rules: reading floors", () => {
  it("gives a label of up to 3 words 0.8 s, a sentence 0.3 s a word with a 1.2 s minimum", () => {
    expect(rules.floorFor("Pick a topic")).toBe(0.8);
    expect(rules.floorFor("  one  ")).toBe(0.8);
    expect(rules.floorFor("one two three four")).toBe(1.2);
    expect(rules.floorFor("a b c d e f g h i j")).toBeCloseTo(3, 12);
  });
  it("gives voiceover captions 0.25 s a word with a 0.6 s minimum", () => {
    expect(rules.voFloorFor("Work's done.")).toBe(0.6);
    expect(rules.voFloorFor("a b c d e f g h")).toBe(2);
  });
  it("normalises case, curly quotes and whitespace and nothing else", () => {
    expect(rules.norm("  It’s  “Done”\n now ")).toBe("it's \"done\" now");
    expect(rules.norm("Done.")).not.toBe(rules.norm("Done"));
    expect(rules.norm(42)).toBe("42");
  });
});

describe("timeline rules: grid", () => {
  it("ceilTo keeps on-grid times in place and rounds others up", () => {
    const step = 60 / 96 / 8;
    expect(step).toBe(0.078125);
    expect(rules.ceilTo(44 * step, step)).toBe(44 * step);
    expect(rules.ceilTo(44 * step + 1e-12, step)).toBe(44 * step);
    expect(rules.ceilTo(3.4, step)).toBe(44 * step);
    expect(rules.ceilTo(0, step)).toBe(0);
    expect(() => rules.ceilTo(1, 0)).toThrow(RangeError);
  });
  it("snaps to the eighth-beat grid (0.078125 s) at 96 bpm div 8", () => {
    expect(rules.gridSnap(3.4, { bpm: 96, div: 8 })).toBe(3.4375);
    expect(rules.gridSnap(0.08, { bpm: 96, div: 8 })).toBe(0.15625);
  });
  it("prefers the full beat when it costs no more than preferFullBeatCost", () => {
    // Next eighth after 1.2 is 1.25 (n16); next beat is 1.25 too, so either way 1.25.
    expect(rules.gridSnap(1.2, { bpm: 96, div: 8, preferFullBeatCost: 0.04 })).toBe(1.25);
    // After 1.13: eighth 1.171875, beat 1.25 costs 0.078 > 0.04, so the eighth wins.
    expect(rules.gridSnap(1.13, { bpm: 96, div: 8, preferFullBeatCost: 0.04 })).toBe(1.171875);
    // After 0.50: eighth 0.546875, beat 0.625 costs 0.078125: over 0.04 the eighth wins, at 0.08 the beat.
    expect(rules.gridSnap(0.5, { bpm: 96, div: 8, preferFullBeatCost: 0.04 })).toBe(0.546875);
    expect(rules.gridSnap(0.5, { bpm: 96, div: 8, preferFullBeatCost: 0.08 })).toBe(0.625);
    // The bound is inclusive, as in the v19 builder (f - h <= prefer_full): a cost of exactly 0.078125 takes the beat.
    expect(rules.gridSnap(0.5, { bpm: 96, div: 8, preferFullBeatCost: 0.078125 })).toBe(0.625);
    // Default cost 0 is a plain eighth-beat ceiling.
    expect(rules.gridSnap(0.5, { bpm: 96, div: 8 })).toBe(0.546875);
  });
  it("reproduces grid_at_or_after from the v19 builder on the v19 cut grid indices", () => {
    // Grid indices from the v19 timing (t = n x 0.078125): picC n44, pushC n54, picApp n67, endCard n198.
    const g = (t: number) => rules.gridSnap(t, { bpm: 96, div: 8, preferFullBeatCost: 0.04 });
    for (const n of [44, 54, 67, 72, 94, 102, 118, 140, 155, 198]) expect(g(n * 0.078125)).toBe(n * 0.078125);
    // Just past n43: the eighth is n44 (3.4375), the beat after is 3.75, too far.
    expect(g(43 * 0.078125 + 0.001)).toBe(3.4375);
    // Just past n39 (3.046875): eighth n40 = 3.125 is itself a full beat (5 x 0.625).
    expect(g(3.05)).toBe(3.125);
  });
  it("rejects a bad bpm or div", () => {
    expect(() => rules.gridSnap(1, { bpm: 0 })).toThrow(RangeError);
    expect(() => rules.gridSnap(1, { bpm: 96, div: 0 })).toThrow(RangeError);
    expect(() => rules.gridSnap(1, { bpm: 96, div: 1.5 })).toThrow(RangeError);
  });
});

describe("timeline rules: onset guard", () => {
  it("flags effects in [onset - 0.25, onset) and nothing on or after the onset", () => {
    expect(rules.ONSET_GUARD).toBe(0.25);
    const hits = rules.onsetGuard([{ file: "a.ogg", at: 3.45 }, { file: "b.ogg", at: 3.5 }, { file: "c.ogg", at: 3.2 }, { file: "d.ogg", at: 3.25 }], [3.5]);
    expect(hits.map((h) => h.file)).toEqual(["a.ogg", "d.ogg"]);
    expect(hits[0].lead.toFixed(3)).toBe("0.050");
    expect(hits[0].onset).toBe(3.5);
  });
  it("returns one finding per effect and onset pair, and none for empty input", () => {
    expect(rules.onsetGuard([{ file: "x", at: 1.9 }], [2, 2.1])).toHaveLength(2);
    expect(rules.onsetGuard([], [1])).toEqual([]);
    expect(rules.onsetGuard([{ file: "x", at: 1 }], [])).toEqual([]);
  });
});

// Parity: the storyboard check and the renderer read one settled() and one norm(). Changing the
// default in rules.mjs moves the check-storyboard verdict, which proves the CLI uses the import.
describe("timeline rules: check-storyboard reads the shared definitions", () => {
  it("fails a 3-word label on screen 1.1 s with no dur (needs 0.8 s settled after the 0.35 s default enter)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-rules-"));
    try {
      const sb = {
        duration: 2,
        format: { ratio: "9:16", width: 1080, height: 1920, fps: 30 },
        scenes: [{ id: "s1", role: "hook", start: 0, end: 2, text: [{ id: "t1", copy: "pick a topic", source: "framing", in: 0, out: 1.1 }] }],
      };
      const file = path.join(dir, "storyboard.json");
      fs.writeFileSync(file, JSON.stringify(sb));
      const r = spawnSync(process.execPath, [path.join(scripts, "check-storyboard.mjs"), file], { encoding: "utf8" });
      const read = (JSON.parse(r.stdout).results as { rule: string; verdict: string; detail: string }[]).find((x) => x.rule === "read.t1");
      // 1.1 - 0.35 = 0.75 settled < 0.8 floor.
      expect(read?.verdict).toBe("FAIL");
      expect(read?.detail).toContain("holds 0.75s settled, needs 0.80s");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
