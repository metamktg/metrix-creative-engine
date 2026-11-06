import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module without type declarations
import { CueError, DEFAULTS, ENERGY, buildCues, layoutLines, lintCues, srtStamp, toSrt, visibleAt, wordsFromPhraseMap, wordsFromWhisperCli } from "../../skills/metrix-video-assembly/scripts/captions/cues.mjs";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/captions/cues.mjs", import.meta.url));
const makeSrt = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/make-srt.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "caption-cues-")); dirs.push(d); return d; };

type Word = { text: string; start: number; end: number };
type Cue = { id: string; start: number; end: number; text: string; lines: string[]; words?: Word[]; exit?: { fade_start: number; fade_duration: number; hidden_at: number }; break?: string; adjust?: string[] };
type Finding = { rule: string; severity: string; cue: string; message: string };

/** Words laid end to end from `at`, each `dur` long, with optional gaps after given indexes. */
function lay(texts: string[], { at = 1, dur = 0.4, gaps = {} as Record<number, number> } = {}): Word[] {
  let t = at;
  return texts.map((text, i) => {
    const w = { text, start: t, end: t + dur };
    t = w.end + (gaps[i] ?? 0);
    return w;
  });
}
const build = (words: Word[], script: string, extra: Record<string, unknown> = {}) => buildCues({ words, script, energy: "conversational", fps: 30, ...extra });
const rules = (findings: Finding[]) => findings.map((f) => f.rule);
const cue = (id: string, start: number, end: number, text: string, more: Partial<Cue> = {}): Cue => ({ id, start, end, text, lines: layoutLines(text), exit: { fade_start: end - 0.12, fade_duration: 0.12, hidden_at: end }, ...more });

describe("caption cues: grouping", () => {
  it("breaks at a pause of 151 ms and does not at 149 ms", () => {
    const script = "one two three four";
    const joined = build(lay(script.split(" "), { gaps: { 1: 0.149 } }), script);
    expect(joined.cues.map((c: Cue) => c.text)).toEqual(["one two three four"]);
    const split = build(lay(script.split(" "), { gaps: { 1: 0.151 } }), script);
    expect(split.cues.map((c: Cue) => c.text)).toEqual(["one two", "three four"]);
    expect(split.cues[0].break).toBe("pause");
  });

  it("breaks at a sentence end even with no pause", () => {
    const script = "Work is done. Kids are asleep.";
    const r = build(lay(script.split(" ")), script);
    expect(r.cues.map((c: Cue) => c.text)).toEqual(["Work is done.", "Kids are asleep."]);
    expect(r.cues[0].break).toBe("sentence");
  });

  it.each([
    ["high", 3],
    ["conversational", 5],
    ["calm", 6],
  ])("keeps %s energy groups to at most %i words and leaves no one-word orphan", (energy, max) => {
    const script = "a1 b2 c3 d4 e5 f6 g7 h8 i9 j10 k11 l12 m13";
    const r = buildCues({ words: lay(script.split(" "), { dur: 0.5 }), script, energy, fps: 30 });
    const sizes = r.cues.map((c: Cue) => c.text.split(" ").length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(max);
    expect(sizes.reduce((a: number, b: number) => a + b, 0)).toBe(13);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(ENERGY[energy].min);
    expect(r.lint.pass, JSON.stringify(r.lint.findings)).toBe(true);
  });

  it("rejects an unknown energy level", () => {
    expect(() => buildCues({ words: lay(["hi"]), script: "hi", energy: "loud" })).toThrow(CueError);
  });

  it("lays 42 characters on one line and wraps 43 onto two", () => {
    const t42 = "abcdefghij abcdefghij abcdefghij abcdefghi"; // 42
    const t43 = "abcdefghij abcdefghij abcdefghij abcdefghij"; // 43
    expect(t42.length).toBe(42);
    expect(t43.length).toBe(43);
    expect(layoutLines(t42)).toEqual([t42]);
    expect(layoutLines(t43)).toEqual(["abcdefghij abcdefghij", "abcdefghij abcdefghij"]);
    const one = build(lay(t42.split(" "), { dur: 0.6 }), t42);
    expect(one.cues[0].lines).toEqual([t42]);
    const two = build(lay(t43.split(" "), { dur: 0.6 }), t43);
    expect(two.cues[0].lines).toHaveLength(2);
    expect(two.lint.pass, JSON.stringify(two.lint.findings)).toBe(true);
  });

  it("splits a group whose text would need a third line", () => {
    const words = ["internationalisation", "standardisation", "telecommunications", "responsibilities", "characterisation"];
    const script = words.join(" ");
    const r = build(lay(words, { dur: 1 }), script);
    expect(r.cues.length).toBeGreaterThan(1);
    for (const c of r.cues) expect(c.lines.length).toBeLessThanOrEqual(2);
    expect(r.cues.at(-1).break).toBe("end");
  });
});

describe("caption cues: text comes from the script", () => {
  it("uses the script spelling by position and reports where the recogniser differed", () => {
    const heard = lay(["Send", "that", "quiet", "time"]);
    const r = build(heard, "Spend that quiet time.");
    expect(r.cues[0].text).toBe("Spend that quiet time.");
    expect(r.cues[0].words[0]).toMatchObject({ text: "Spend", asr: "Send", start: 1 });
    expect(r.asr_differs).toEqual([{ script: "Spend", heard: "Send", start: 1 }]);
  });

  it("collapses an aliased brand name and fails a word-count mismatch instead of guessing", () => {
    const heard = lay(["Take", "a", "look", "at", "North", "Wind."]);
    expect(() => build(heard, "Take a look at Northwind.")).toThrow(/6 were heard/);
    const r = build(heard, "Take a look at Northwind.", { aliases: ["north wind=northwind"] });
    expect(r.cues[0].text).toBe("Take a look at Northwind.");
    expect(r.cues[0].words[4]).toMatchObject({ text: "Northwind.", asr: "North Wind.", start: 2.6 });
    expect(r.asr_differs).toEqual([]);
  });

  it("drops non-word tokens and words in the final silence, and fails a transcript over 20 % junk", () => {
    const words = [...lay(["one", "two", "three", "four"]), { text: "[BLANK_AUDIO]", start: 2.6, end: 2.7 }, { text: "Thank", start: 5, end: 5.2 }, { text: "you.", start: 5.2, end: 5.4 }];
    const r = build(words, "one two three four", { finalSilenceStart: 4 });
    expect(r.cues.map((c: Cue) => c.text)).toEqual(["one two three four"]);
    expect(r.dropped.map((d: { reason: string }) => d.reason)).toEqual(["starts in the final silence", "starts in the final silence", "not a word"]);
    const junky = [...lay(["one", "two", "three"]), { text: "♪", start: 3, end: 3.1 }];
    expect(() => build(junky, "one two three")).toThrow(/1 of 4 tokens are not words/);
    const fine = [...lay(["one", "two", "three", "four"]), { text: "♪", start: 3, end: 3.1 }];
    expect(build(fine, "one two three four").cues).toHaveLength(1);
  });
});

describe("caption cues: Netflix timing", () => {
  it("passes 20 characters a second and fails 21", () => {
    const at20 = cue("c1", 1, 2, "abcdefghij abcdefghi");
    const at21 = cue("c1", 1, 2, "abcdefghij abcdefghij");
    expect(at20.text.length).toBe(20);
    expect(lintCues([at20], { fps: 30 }).pass).toBe(true);
    const bad = lintCues([at21], { fps: 30 });
    expect(rules(bad.findings)).toEqual(["cps_over"]);
    expect(bad.findings[0].message).toContain("21.00 characters a second");
  });

  it("extends a fast cue to meet 20 characters a second when there is room, and reports it when there is not", () => {
    const words = [{ text: "abcdefghij", start: 1, end: 1.3 }, { text: "abcdefghij.", start: 1.3, end: 1.6 }];
    const roomy = build(words, "abcdefghij abcdefghij.");
    expect(roomy.cues[0].end).toBeCloseTo(1 + 21 / 20 + 1 / 60, 1);
    expect(roomy.cues[0].end - roomy.cues[0].start).toBeGreaterThanOrEqual(21 / 20);
    expect(roomy.lint.pass).toBe(true);
    const crowded = build([...words, { text: "next", start: 1.7, end: 2.6 }, { text: "words", start: 2.6, end: 3.2 }], "abcdefghij abcdefghij. next words");
    expect(rules(crowded.lint.findings)).toContain("cps_over");
    expect(crowded.lint.pass).toBe(false);
  });

  it("extends a short cue to the 20-frame minimum and flags one that stays under it", () => {
    const r = build([{ text: "Hi.", start: 1, end: 1.2 }], "Hi.");
    expect(r.cues[0].end - r.cues[0].start).toBeCloseTo(20 / 30, 6);
    expect(r.cues[0].adjust[0]).toContain("reading floor");
    const lint = lintCues([cue("c1", 1, 1 + 19 / 30, "Hi.")], { fps: 30 });
    expect(rules(lint.findings)).toEqual(["under_min_duration"]);
    expect(lintCues([cue("c1", 1, 1 + 20 / 30, "Hi.")], { fps: 30 }).pass).toBe(true);
  });

  it("keeps a 2-frame gap between cues even when words run end to end, so no two cues overlap", () => {
    const script = "Work is done. Kids are asleep.";
    const r = build(lay(script.split(" "), { dur: 0.37 }), script);
    const [a, b] = r.cues;
    expect(b.start - a.end).toBeCloseTo(2 / 30, 6);
    expect(rules(r.lint.findings)).not.toContain("overlap");
    for (const c of r.cues) expect(visibleAt(r.cues, c.start + 0.001)).toHaveLength(1);
  });

  it("closes a gap under 12 frames to 2 frames and leaves a longer one", () => {
    const short = build(lay(["One", "two.", "Three", "four."], { dur: 0.5, gaps: { 1: 0.2 } }), "One two. Three four.");
    expect(short.cues[1].start - short.cues[0].end).toBeCloseTo(2 / 30, 6);
    const long = build(lay(["One", "two.", "Three", "four."], { dur: 0.5, gaps: { 1: 0.6 } }), "One two. Three four.");
    expect(long.cues[1].start - long.cues[0].end).toBeGreaterThan(0.5);
  });

  it("lints overlaps and gaps under 2 frames on any cue list", () => {
    const overlap = lintCues([cue("c1", 1, 2, "one two"), cue("c2", 1.9, 3, "three four")], { fps: 30 });
    expect(rules(overlap.findings)).toEqual(expect.arrayContaining(["overlap", "two_visible"]));
    const tight = lintCues([cue("c1", 1, 2, "one two"), cue("c2", 2 + 1 / 30, 3, "three four")], { fps: 30 });
    expect(rules(tight.findings)).toEqual(["gap_under_min"]);
    expect(lintCues([cue("c1", 1, 2, "one two"), cue("c2", 2 + 2 / 30, 3, "three four")], { fps: 30 }).pass).toBe(true);
  });

  it("snaps the out time to a shot change 0.50 s away and not to one 0.51 s away", () => {
    const words = [{ text: "one", start: 1, end: 1.5 }, { text: "two", start: 1.5, end: 2 }];
    const near = build(words, "one two", { cuts: [2.5] });
    expect(near.cues[0].end).toBe(2.5);
    expect(near.cues[0].adjust).toContain("out snapped to shot change 2.5");
    const far = build(words, "one two", { cuts: [2.51] });
    expect(far.cues[0].end).toBe(2);
  });

  it("snaps the in time back to a shot change 0.50 s before the first word and not 0.51 s", () => {
    const words = [{ text: "one", start: 3, end: 3.5 }, { text: "two", start: 3.5, end: 4 }];
    expect(build(words, "one two", { cuts: [2.5] }).cues[0].start).toBe(2.5);
    expect(build(words, "one two", { cuts: [2.49] }).cues[0].start).toBe(3);
    // Never later than the first word: a cut 0.2 s after it does not move the in time.
    expect(build(words, "one two", { cuts: [3.2] }).cues[0].start).toBe(3);
  });

  it("places a snapped time on the first frame of the new shot", () => {
    const words = [{ text: "one", start: 1, end: 1.5 }, { text: "two", start: 1.5, end: 2 }];
    // A cut at 2.234 s first shows at frame 68 (2.2667 s) at 30 fps.
    expect(build(words, "one two", { cuts: [2.234] }).cues[0].end).toBeCloseTo(68 / 30, 6);
  });
});

describe("caption cues: exit and visibility", () => {
  it("fades each cue over its last 0.12 s and hides it at its end, so nothing is visible at end + 0.01", () => {
    const script = "Work is done. Kids are asleep.";
    const r = build(lay(script.split(" ")), script);
    for (const c of r.cues) {
      expect(c.exit.hidden_at).toBe(c.end);
      expect(c.exit.fade_start).toBeCloseTo(c.end - DEFAULTS.fadeOut, 6);
      expect(visibleAt(r.cues, c.end + 0.01).map((x: Cue) => x.id)).not.toContain(c.id);
    }
  });

  it("fails a cue still visible after its end, a late in time and an early out time", () => {
    const lingering = cue("c1", 1, 2, "one two", { exit: { fade_start: 1.88, fade_duration: 0.12, hidden_at: 2.05 } });
    expect(rules(lintCues([lingering], { fps: 30 }).findings)).toEqual(["visible_after_end"]);
    const late = cue("c1", 1.2, 2, "one two", { words: [{ text: "one", start: 1, end: 1.5 }, { text: "two", start: 1.5, end: 2 }] });
    expect(rules(lintCues([late], { fps: 30 }).findings)).toEqual(["late_start"]);
    const early = cue("c1", 1, 1.8, "one two", { words: [{ text: "one", start: 1, end: 1.5 }, { text: "two", start: 1.5, end: 2 }] });
    expect(rules(lintCues([early], { fps: 30 }).findings)).toEqual(["early_end"]);
  });

  it("warns on a cue at 0 s and on one held across a shot change", () => {
    const r = lintCues([cue("c1", 0, 2, "one two")], { fps: 30, cuts: [1] });
    expect(r.pass).toBe(true);
    expect(rules(r.findings)).toEqual(["starts_at_zero", "crosses_cut"]);
  });
});

describe("caption cues: word sources and SRT", () => {
  it("clamps phrase-map words to their speech islands and applies the voice offset", () => {
    const map = { phrases: [
      { id: "P1", start: 0.2, end: 1.0, words: [{ text: "one", start: 0.3, end: 0.6 }, { text: "two", start: 0.6, end: 1.4 }] },
      { id: "P2", start: 1.5, end: 2.0, words: [{ text: "three", start: 1.4, end: 2.2 }] },
    ] };
    expect(wordsFromPhraseMap(map, 0.5)).toEqual([
      { text: "one", start: 0.7, end: 1.1 },
      { text: "two", start: 1.1, end: 1.5 },
      { text: "three", start: 2, end: 2.5 },
    ]);
  });

  it("reads whisper-cli JSON word segments in milliseconds", () => {
    const json = { transcription: [{ offsets: { from: 120, to: 480 }, text: " Hello" }, { offsets: { from: 480, to: 900 }, text: " world" }, { offsets: { from: 900, to: 900 }, text: "" }] };
    expect(wordsFromWhisperCli(json)).toEqual([{ text: "Hello", start: 0.12, end: 0.48 }, { text: "world", start: 0.48, end: 0.9 }]);
  });

  it("writes SRT byte for byte as make-srt writes the same cues from a storyboard", () => {
    const script = "Pick a topic, then work through internationally recognised professional certification practice.";
    const words = lay(script.split(" "), { at: 0.5, dur: 0.45, gaps: { 2: 0.2 } });
    const r = buildCues({ words, script, energy: "calm", fps: 30 });
    expect(r.cues.some((c: Cue) => c.lines.length === 2)).toBe(true);
    const srt = toSrt(r.cues);
    const dir = tmp();
    const sb = path.join(dir, "storyboard.json");
    const text = r.cues.map((c: Cue) => ({ id: c.id, copy: c.lines.join("\n"), source: "voiceover", in: c.start, out: c.end }));
    fs.writeFileSync(sb, JSON.stringify({ duration: 20, scenes: [{ id: "s1", text }] }));
    const ms = spawnSync(process.execPath, [makeSrt, sb], { encoding: "utf8" });
    expect(ms.status, ms.stderr).toBe(0);
    expect(ms.stderr).toBe("");
    expect(srt).toBe(ms.stdout);
    expect(srtStamp(3661.2345)).toBe("01:01:01,235");
  });
});

describe("caption cues CLI", () => {
  it("writes cues JSON and SRT, and exits 1 when the lint fails", () => {
    const dir = tmp();
    const script = path.join(dir, "script.txt");
    const words = path.join(dir, "words.json");
    fs.writeFileSync(script, "Work is done.\nKids are asleep.\n");
    fs.writeFileSync(words, JSON.stringify(lay(["Work", "is", "done.", "Kids", "are", "asleep."])));
    const out = path.join(dir, "out", "cues.json");
    const srt = path.join(dir, "out", "cues.srt");
    const ok = spawnSync(process.execPath, [tool, "--words", words, "--script", script, "--energy", "conversational", "--out", out, "--srt", srt], { encoding: "utf8" });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("lint: PASS");
    const json = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(json.schema).toBe("mce.captioncues/1");
    expect(fs.readFileSync(srt, "utf8")).toBe(toSrt(json.cues));

    fs.writeFileSync(words, JSON.stringify([{ text: "Work", start: 1, end: 1.05 }, { text: "is", start: 1.05, end: 1.1 }, { text: "done.", start: 1.1, end: 1.15 }, { text: "Kids", start: 1.15, end: 1.2 }, { text: "are", start: 1.2, end: 1.25 }, { text: "asleep.", start: 1.25, end: 1.3 }]));
    const bad = spawnSync(process.execPath, [tool, "--words", words, "--script", script], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain("lint: FAIL");

    const mismatch = spawnSync(process.execPath, [tool, "--words", words, "--script", script, "--energy", "calm", "--bogus", "1"], { encoding: "utf8" });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("unknown option --bogus");
  });
});
