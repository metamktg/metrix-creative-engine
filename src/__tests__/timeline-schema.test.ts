import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CUTPLAN, DERIVED_FROM, PHRASEMAP, SPECS, TIMELINE,
  fieldPaths, fromPhraseMapResult, parseRef, roundTime, serialize, sha256Hex, tmSha256,
  validate, validateCutPlan, validateDerivedFrom, validatePhraseMap, validatePlanInputs, validateTimeline,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/timeline/schema.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const docPath = fileURLToPath(new URL("../../skills/metrix-video-assembly/references/timeline.md", import.meta.url));
const doc = fs.readFileSync(docPath, "utf8").replace(/\r\n/g, "\n");

/** The doc split at its "## " headings. */
function sections(): Map<string, string> {
  const out = new Map<string, string>();
  const parts = doc.split(/^## /m).slice(1);
  for (const p of parts) out.set(p.slice(0, p.indexOf("\n")).trim(), p);
  return out;
}
const jsonBlocks = (text: string): J[] => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
const tablePaths = (text: string): string[] => {
  const fields = text.slice(text.indexOf("### Fields"));
  return [...fields.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
};
const clone = (x: J): J => JSON.parse(JSON.stringify(x));

const S = sections();
const example = (name: string): J => {
  const blocks = jsonBlocks(S.get(name) ?? "");
  expect(blocks.length, `one example block under ## ${name}`).toBe(1);
  return blocks[0];
};
const pm = (): J => clone(example(PHRASEMAP));
const cp = (): J => clone(example(CUTPLAN));
const tl = (): J => clone(example(TIMELINE));
const df = (): J => clone(example(DERIVED_FROM).derived_from);

describe("timeline.md examples validate", () => {
  it("has a section for every frozen format", () => {
    for (const name of [PHRASEMAP, CUTPLAN, TIMELINE, DERIVED_FROM]) expect(S.has(name), name).toBe(true);
  });

  it("every JSON block on the page parses and validates by its own schema", () => {
    const all = jsonBlocks(doc);
    expect(all.length).toBe(4);
    for (const b of all) {
      if ("derived_from" in b) expect(validateDerivedFrom(b.derived_from)).toEqual([]);
      else expect(validate(b), b.schema).toEqual([]);
    }
  });

  it("the phrase map example passes", () => expect(validatePhraseMap(pm())).toEqual([]));
  it("the cut plan example passes, alone and against its phrase map", () => {
    expect(validateCutPlan(cp())).toEqual([]);
    expect(validatePlanInputs(pm(), cp())).toEqual([]);
  });
  it("the timeline example passes", () => expect(validateTimeline(tl())).toEqual([]));
  it("the derived_from example passes", () => expect(validateDerivedFrom(df())).toEqual([]));

  it("the examples are one consistent run: every hash names the example it points at", () => {
    expect(cp().phrasemap.sha256).toBe(sha256Hex(serialize(pm())));
    expect(tl().inputs.phrasemap.sha256).toBe(sha256Hex(serialize(pm())));
    expect(tl().inputs.cutplan.sha256).toBe(sha256Hex(serialize(cp())));
    expect(df().sha256).toBe(sha256Hex(serialize(tl())));
    expect(df().tm_sha256).toBe(tmSha256(tl().tm));
    expect(tl().name).toBe(cp().name);
  });

  it("each format's field table lists exactly the validator's fields", () => {
    for (const name of [PHRASEMAP, CUTPLAN, TIMELINE, DERIVED_FROM]) {
      const documented = tablePaths(S.get(name)!);
      const defined = fieldPaths(SPECS[name]);
      expect(documented.filter((p) => !defined.includes(p)), `${name}: documented but not in the validator`).toEqual([]);
      expect(defined.filter((p: string) => !documented.includes(p)), `${name}: in the validator but not documented`).toEqual([]);
      expect(new Set(documented).size, `${name}: a field is documented twice`).toBe(documented.length);
    }
  });

  it("the page carries no em dash", () => expect(doc.includes("\u2014")).toBe(false));
});

describe("removing a required field fails, naming the field", () => {
  const cases: [string, () => J, (x: J) => string[]][] = [
    [PHRASEMAP, pm, validatePhraseMap], [CUTPLAN, cp, validateCutPlan], [TIMELINE, tl, validateTimeline], [DERIVED_FROM, df, validateDerivedFrom],
  ];
  for (const [name, make, check] of cases) {
    it(`${name}: every top-level field is required`, () => {
      for (const k of Object.keys(make())) {
        const x = make();
        delete x[k];
        const errs = check(x);
        expect(errs.some((e) => e.includes(`${k}: required`)), `${name} without ${k}: ${errs.join("; ")}`).toBe(true);
      }
    });
  }
  it("nested: a timeline caption group without lines, a shot without src_fps, a cut plan segment without place", () => {
    const t = tl(); delete t.captions.groups[1].lines;
    expect(validateTimeline(t)).toContain("captions.groups[1].lines: required");
    const t2 = tl(); delete t2.shots[0].src_fps;
    expect(validateTimeline(t2)).toContain("shots[0].src_fps: required");
    const c = cp(); delete c.segments[1].place;
    expect(validateCutPlan(c)).toContain("segments[1].place: required");
  });
  it("an unknown field fails, so new fields are added to the contract first", () => {
    const t = tl(); t.shots[0].speed = 1;
    expect(validateTimeline(t)).toContain("shots[0].speed: unknown field");
    const c = cp(); c.edit.min_gap = { B: 0.3 };
    expect(validateCutPlan(c)).toContain("edit.min_gap: unknown field");
  });
  it("a wrong schema tag is refused", () => {
    expect(validate({ schema: "mce.timeline/2" })[0]).toMatch(/schema: must be one of/);
    const t = tl(); t.schema = "mce.timeline/2";
    expect(validateTimeline(t)).toContain('schema: must be "mce.timeline/1"');
  });
});

describe("mce.phrasemap/1 rules", () => {
  it("phrases may not overlap, end before they start, or run past the voice", () => {
    const a = pm(); a.phrases[1].start = 1.5;
    expect(validatePhraseMap(a).join("\n")).toMatch(/starts 1.5 before phrase P1 ends/);
    const b = pm(); b.phrases[0].end = 0.4;
    expect(validatePhraseMap(b).join("\n")).toMatch(/end 0.4 must be after start/);
    const c = pm(); c.phrases[1].end = 5.5;
    expect(validatePhraseMap(c).join("\n")).toMatch(/past the voice duration/);
  });
  it("a split sits inside its window and strictly inside its phrase", () => {
    const a = pm(); a.splits[0].at = 3.5;
    expect(validatePhraseMap(a).join("\n")).toMatch(/outside its window/);
    const b = pm(); b.splits[0].phrase = "P1";
    expect(validatePhraseMap(b).join("\n")).toMatch(/not inside phrase P1/);
  });
  it("whisperX words are refused until a hand-label measurement is named", () => {
    const a = pm(); a.words_source.method = "whisperx";
    expect(validatePhraseMap(a).join("\n")).toMatch(/qualified_against: whisperX/);
    a.words_source.qualified_against = "qa/whisperx-hand-labels.json";
    expect(validatePhraseMap(a)).toEqual([]);
  });
  it("wraps what phrase-map.mjs writes today", () => {
    const legacy = {
      input: "X:/run/voice.wav", duration: 5, silencedetect: { noise: "-40dB", min_gap: 0.15 }, script_check: null,
      phrases: [{ id: "P1", start: 0.5, end: 1.7, words: [{ text: "Hi", start: 0.5, end: 0.9 }], text: "Hi" }],
    };
    const w = fromPhraseMapResult(legacy, { sha256: "a".repeat(64), sample_rate: 48000, channels: 1 });
    expect(validatePhraseMap(w)).toEqual([]);
    expect(w.voice).toEqual({ path: "X:/run/voice.wav", sha256: "a".repeat(64), duration: 5, sample_rate: 48000, channels: 1 });
    expect(w.words_source.method).toBe("ffmpeg-whisper");
  });
});

describe("mce.cutplan/1 rules", () => {
  it("references must parse and name something that exists", () => {
    const a = cp(); a.points[0].from = "point.nowhere";
    expect(validateCutPlan(a)).toContain('points[0].from: no point "nowhere"');
    const b = cp(); b.shots[1].to = "point card";
    expect(validateCutPlan(b).join("\n")).toMatch(/shots\[1\].to: "point card" is not a timeline reference/);
    const c = cp(); c.points[0].from = "clip.face@9.5";
    expect(validateCutPlan(c).join("\n")).toMatch(/past face's duration/);
  });
  it("a gap segment needs exactly one placing min_gap constraint", () => {
    const a = cp(); a.constraints = a.constraints.filter((k: J) => k.id !== "gap_P2");
    expect(validateCutPlan(a).join("\n")).toMatch(/a gap segment needs exactly one min_gap constraint/);
    const b = cp(); b.segments[0].place = { mode: "gap" };
    expect(validateCutPlan(b).join("\n")).toMatch(/first segment has no previous phrase/);
  });
  it("a point with no from is placed by read_after or hold_after, and never snaps earlier", () => {
    const a = cp(); a.constraints = a.constraints.filter((k: J) => !["read_plan", "hold_end"].includes(k.id));
    expect(validateCutPlan(a).join("\n")).toMatch(/points\[2\]: has no from/);
    const b = cp(); b.points[2].snap = "down";
    expect(validateCutPlan(b).join("\n")).toMatch(/must snap none, up, full_beat_pref or beat_up/);
  });
  it("shots and scenes tile the ad from start to end", () => {
    const a = cp(); a.shots[1].from = "point.tap";
    expect(validateCutPlan(a).join("\n")).toMatch(/shots\[1\].from: must equal the previous shot's to/);
    const b = cp(); b.shots.at(-1).to = "point.card+0.5";
    expect(validateCutPlan(b).join("\n")).toMatch(/the last shot must end at "end"/);
    const c = cp(); c.scenes[0].from = "point.toApp";
    expect(validateCutPlan(c).join("\n")).toMatch(/first scene must start at "start"/);
  });
  it("clip clocks: voice clips need voice_base and take no src_in; own clips need src_in", () => {
    const a = cp(); a.clips[0].voice_base = null;
    expect(validateCutPlan(a).join("\n")).toMatch(/voice_base: required for a voice-clock clip/);
    const b = cp(); b.shots[0].src_in = 0.3;
    expect(validateCutPlan(b).join("\n")).toMatch(/must be null for a voice-clock clip/);
    const c = cp(); c.clips[0].clock = "own"; c.clips[0].voice_base = null;
    expect(validateCutPlan(c).join("\n")).toMatch(/src_in: required for an own-clock clip/);
  });
  it("max_src takes a bare shot and no b; other kinds need b", () => {
    const a = cp(); a.constraints.find((k: J) => k.id === "face_take").b = "end";
    expect(validateCutPlan(a).join("\n")).toMatch(/must be null for max_src/);
    const b = cp(); b.constraints.find((k: J) => k.id === "face_take").a = "shot.face.out";
    expect(validateCutPlan(b).join("\n")).toMatch(/max_src takes a bare shot reference/);
    const c = cp(); c.constraints.find((k: J) => k.id === "decay").b = null;
    expect(validateCutPlan(c).join("\n")).toMatch(/b: required for decay_after/);
  });
  it("overlays need from and to; only voiceover goes to the SRT", () => {
    const a = cp(); a.captions.groups[0].to = null;
    expect(validateCutPlan(a).join("\n")).toMatch(/a hook group needs from and to/);
    const b = cp(); b.captions.groups[0].deliver = ["burn", "srt"];
    expect(validateCutPlan(b).join("\n")).toMatch(/only voiceover groups go to the SRT/);
  });
  it("against the phrase map: unknown or unplaced phrases, reordering, and missing splits fail", () => {
    const a = cp(); a.segments[1].phrases = ["P3"]; a.constraints[0].b = "phrase.P3.start";
    a.captions.groups.forEach((g: J) => { g.phrases = g.phrases.map((p: string) => (p === "P2" ? "P3" : p)); });
    a.points[1].from = "phrase.P3.start+1.1"; a.constraints[2].a = "phrase.P3.end"; a.constraints[4].a = "phrase.P3.end";
    const errs = validatePlanInputs(pm(), a).join("\n");
    expect(errs).toMatch(/phrase "P3" is not in the phrase map/);
    expect(errs).toMatch(/phrase "P2" from the phrase map is not placed/);
    const b = cp(); b.captions.groups[2].split.id = "nope";
    expect(validatePlanInputs(pm(), b).join("\n")).toMatch(/no split "nope" in the phrase map/);
    const c = cp(); c.points[0].from = "voice@7.5";
    expect(validatePlanInputs(pm(), c).join("\n")).toMatch(/past the voice duration/);
  });
});

describe("mce.timeline/1 rules", () => {
  it("shots tile 0 to duration with no gap", () => {
    const a = tl(); a.shots[1].out_in += 0.1;
    expect(validateTimeline(a).join("\n")).toMatch(/shots\[1\].out_in: must equal the previous shot's out_out/);
    const b = tl(); b.shots.at(-1).out_out = b.duration - 0.2;
    expect(validateTimeline(b).join("\n")).toMatch(/the last shot ends at duration/);
  });
  it("a sourced shot's range fits its clip and runs at speed 1; a composition shot carries no source fields", () => {
    const a = tl(); a.shots[0].src_out = 6;
    const e = validateTimeline(a).join("\n");
    expect(e).toMatch(/past the clip's 5 s/);
    expect(e).toMatch(/source range length differs/);
    const b = tl(); b.shots[1].src_in = 0.5;
    expect(validateTimeline(b).join("\n")).toMatch(/shots\[1\].src_in: must be null for a shot with no source clip/);
    const c = tl(); c.shots[0].reject[0].hi = 0;
    expect(validateTimeline(c).join("\n")).toMatch(/hi must be greater than lo/);
  });
  it("the grid unit, segment order and offsets are consistent", () => {
    const a = tl(); a.grid.unit = 0.1;
    expect(validateTimeline(a).join("\n")).toMatch(/grid.unit: must be 60 \/ bpm \/ div/);
    const b = tl(); b.segments[1].out_in = 1.2; b.segments[1].out_out = 3.02; b.segments[1].offset = -1.16;
    expect(validateTimeline(b).join("\n")).toMatch(/overlaps segment S1/);
    const c = tl(); c.segments[1].offset = -0.8;
    expect(validateTimeline(c).join("\n")).toMatch(/offset: must equal out_in - src_in/);
    const d = tl(); d.segments[1].picture_cut = 1.4;
    expect(validateTimeline(d).join("\n")).toMatch(/picture_cut: 1.4 is not a shot boundary/);
  });
  it("phrases sit at src + offset inside their segment", () => {
    const a = tl(); a.phrases[1].start += 0.05;
    expect(validateTimeline(a).join("\n")).toMatch(/phrases\[1\]: start\/end must be src_start\/src_end \+ the segment offset/);
  });
  it("caption groups: text is the words, lines are the word lines, at most two", () => {
    const a = tl(); a.captions.groups[0].lines = ["Clear desk, clear"];
    expect(validateTimeline(a).join("\n")).toMatch(/lines\[0\]: "Clear desk, clear" must be its words "Clear desk, clear head\."/);
    const b = tl(); b.captions.groups[2].text = "Pick a plan!";
    expect(validateTimeline(b).join("\n")).toMatch(/text: must be the words joined/);
    const c = tl(); c.captions.groups[0].lines.push("more", "again");
    expect(validateTimeline(c).join("\n")).toMatch(/lines: allows at most 2/);
    const d = tl(); d.captions.groups[0].words[1].line = 1; d.captions.groups[0].words[2].line = 0;
    expect(validateTimeline(d).join("\n")).toMatch(/words\[\].line: must start at 0 and never go back/);
  });
  it("voiceover words carry times; burned voiceover groups and SRT cues never overlap", () => {
    const a = tl(); a.captions.groups[2].words[0].start = null;
    expect(validateTimeline(a).join("\n")).toMatch(/a voiceover word carries its time/);
    const b = tl(); b.captions.groups[3].start = 2.2;
    const e = validateTimeline(b).join("\n");
    expect(e).toMatch(/burned voiceover group c2b starts 2.2 before c2a ends 2.3/);
    expect(e).toMatch(/srt group c2b starts 2.2 before c2a ends 2.3/);
    const c = tl(); c.captions.groups[0].deliver = ["burn", "srt"];
    expect(validateTimeline(c).join("\n")).toMatch(/only voiceover groups go to the SRT/);
  });
  it("scenes tile the ad and storyboard canvases match their ratio", () => {
    const a = tl(); a.scenes[1].start = 1.3;
    expect(validateTimeline(a).join("\n")).toMatch(/scenes\[1\].start: must equal the previous scene's end/);
    const b = tl(); b.storyboard.ratios[1].height = 1920;
    expect(validateTimeline(b).join("\n")).toMatch(/1080x1920 is not 4:5/);
  });
});

describe("derived_from", () => {
  it("names the timeline by path, sha256 and schema, and carries tm_sha256 (null allowed)", () => {
    const a = df(); a.tm_sha256 = null;
    expect(validateDerivedFrom(a)).toEqual([]);
    const b = df(); delete b.tm_sha256;
    expect(validateDerivedFrom(b)).toContain("derived_from.tm_sha256: required");
    const c = df(); c.sha256 = c.sha256.toUpperCase();
    expect(validateDerivedFrom(c).join("\n")).toMatch(/derived_from.sha256: .* does not match/);
    const d = df(); d.schema = "mce.cutplan/1";
    expect(validateDerivedFrom(d)).toContain('derived_from.schema: must be "mce.timeline/1"');
  });
});

describe("helpers", () => {
  it("parses every reference form, and only those", () => {
    expect(parseRef("start")).toEqual({ kind: "start", add: 0 });
    expect(parseRef("end-0.5")).toEqual({ kind: "end", add: -0.5 });
    expect(parseRef("point.tap+0.07")).toEqual({ kind: "point", id: "tap", add: 0.07 });
    expect(parseRef("phrase.G.end-0.04")).toEqual({ kind: "phrase", id: "G", edge: "end", add: -0.04 });
    expect(parseRef("segment.D+E.cut")).toEqual({ kind: "segment", id: "D+E", add: 0 });
    expect(parseRef("voice@9.43")).toEqual({ kind: "voice", t: 9.43, add: 0 });
    expect(parseRef("clip.door@1.92-0.01")).toEqual({ kind: "clip", id: "door", t: 1.92, add: -0.01 });
    expect(parseRef("shot.door")).toEqual({ kind: "shot", id: "door", edge: null, add: 0 });
    expect(parseRef("shot.Hs.out")).toEqual({ kind: "shot", id: "Hs", edge: "out", add: 0 });
    for (const bad of ["", "point.", "point.a-b", "phrase.A", "phrase.A.mid", "voice@", "clip.S1", "point.tap+", "12.5", "point.tap +1"]) expect(parseRef(bad), bad).toBeNull();
  });

  it("rounds like Python round(): exact binary value, ties to even", () => {
    // Values checked against CPython 3 round(): 11.0575 is 11.05749... in binary.
    expect(roundTime(11.0575, 3)).toBe(11.057);
    expect(roundTime(3.4375, 3)).toBe(3.438);
    expect(roundTime(1.0625, 3)).toBe(1.062);
    expect(roundTime(2.675, 2)).toBe(2.67);
    expect(roundTime(0.5, 0)).toBe(0);
    expect(roundTime(1.5, 0)).toBe(2);
    expect(roundTime(-2.5, 0)).toBe(-2);
    expect(roundTime(-0.0004, 3)).toBe(0);
    expect(roundTime(18.130000000000003, 2)).toBe(18.13);
    expect(roundTime(-6.65760000001, 4)).toBe(-6.6576);
    expect(roundTime(9.9996, 3)).toBe(10);
    expect(() => roundTime(Number.NaN, 3)).toThrow();
  });

  it("hashes TM canonically: whitespace and 5.0 vs 5 do not matter, values and key order do", () => {
    const tm = { a: 5, b: { c: 1.25 } };
    const h = tmSha256(tm);
    expect(tmSha256('{"a": 5.0, "b": {"c": 1.25}}')).toBe(h);
    expect(tmSha256(JSON.stringify(tm))).toBe(h);
    expect(tmSha256({ b: { c: 1.25 }, a: 5 })).not.toBe(h);
    expect(tmSha256({ a: 5, b: { c: 1.26 } })).not.toBe(h);
    expect(h).toBe(sha256Hex('{"a":5,"b":{"c":1.25}}'));
  });

  it("serializes with two-space indent and a final newline", () => {
    expect(serialize({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });
});
