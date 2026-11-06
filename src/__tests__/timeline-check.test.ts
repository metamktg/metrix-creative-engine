import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error untyped skill module
import { plan, check, emit, emitAll, verdict, snapper, pyFloat, PlanError, EmitError, frameHits } from "../../skills/metrix-video-assembly/scripts/timeline/index.mjs";
// @ts-expect-error untyped skill module
import { serialize, sha256Hex, tmSha256, validateTimeline } from "../../skills/metrix-video-assembly/scripts/timeline/schema.mjs";
// @ts-expect-error untyped skill module
import { srtFromItems } from "../../skills/metrix-video-assembly/scripts/make-srt.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;
// A second, synthetic plan (a desk-planner demo, not derived from any client run): an own-clock
// clip, gap/after/start segments, down/nearest/beat_up/full_beat_pref snaps, and the auto caption
// builder (captions/cues.mjs) grouping the script's words on the ad clock.
const fx = new URL("./fixtures/timeline-synthetic/", import.meta.url);
const read = (f: string) => fs.readFileSync(fileURLToPath(new URL(f, fx)), "utf8");
const pm = JSON.parse(read("phrases.json"));
const cp = JSON.parse(read("cut.json"));
const golden = read("timeline.json");
const opts = { phrasemapSha256: sha256Hex(read("phrases.json")), cutplanSha256: sha256Hex(read("cut.json")), phrasemapPath: "phrases.json", cutplanPath: "cut.json" };
const tl = plan(pm, cp, opts);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const fails = (f: J[]) => f.filter((x) => x.verdict === "FAIL");
const cli = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/timeline.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-")); dirs.push(d); return d; };
const replan = (mut: (c: J) => void) => { const c = clone(cp); mut(c); return plan(pm, c, { phrasemapSha256: opts.phrasemapSha256 }); };

describe("synthetic plan", () => {
  it("plans the committed timeline.json and checks green (no FAIL)", () => {
    expect(serialize(tl)).toBe(golden);
    const f = check(tl, { cutplan: cp, phrasemap: pm, ...opts });
    expect(fails(f)).toEqual([]);
    expect(verdict(f)).toBe("WARN"); // a residual window on screen and a cue under 0.1 s, both for review
    expect(f.filter((x: J) => x.rule === "constraint").map((x: J) => [x.id, x.verdict])).toEqual(cp.constraints.map((c: J) => [c.id, "PASS"]));
  });

  it("places points, segments and shots by the plan semantics", () => {
    const t = Object.fromEntries(tl.points.map((p: J) => [p.id, p.t]));
    // toDesk = down(P2 start + 0.2); tick = nearest(P3 start); card = beat_up(max(tick + 1.0, P3 end + 0.5))
    expect(t).toEqual({ toDesk: 2.125, tick: 3.875, card: 6 });
    expect(tl.segments.map((s: J) => [s.id, s.audio_cut, s.picture_cut])).toEqual([["S1", 0, 0], ["S2", 1.875, null], ["S3", 3.875, null], ["S4", 6, 6]]);
    const desk = tl.shots.find((s: J) => s.id === "desk");
    expect([desk.src_in, desk.src_out, desk.src_fps]).toEqual([0.5, 4.375, 24]);
    expect(tl.shots.find((s: J) => s.id === "face").src_in).toBe(0.04); // out 0 - offset(-0.34) - voice_base 0.3
    expect(tl.audio.sfx[0].at).toBe(3.425); // clip.desk@1.8 on an own clip: shot.from + (1.8 - src_in)
    expect(tl.audio.music.sections.map((s: J) => [s.from, s.to])).toEqual([[0, 2.5], [2.5, 6], [6, 8.46]]);
    expect(tl.tm).toEqual({ toDesk: 2.125, ui: { tick: 3.875 }, card: 6, end: 8.46 });
  });

  it("auto captions: script text, never the ASR spelling, grouped by the cue builder", () => {
    const vo = tl.captions.groups.filter((g: J) => g.kind === "voiceover");
    expect(vo.map((g: J) => g.text).join(" ")).toBe(pm.phrases.map((p: J) => p.text).join(" "));
    const heard = clone(pm);
    heard.phrases[1].words[2].text = "planer,"; // ASR misspelling: times only, the script wins
    const c2 = clone(cp);
    c2.phrasemap.sha256 = sha256Hex(serialize(heard));
    const t2 = plan(heard, c2);
    expect(t2.captions.groups.filter((g: J) => g.kind === "voiceover").map((g: J) => g.text)).toEqual(vo.map((g: J) => g.text));
    for (const g of vo) {
      expect(g.deliver).toEqual(["burn", "srt"]);
      expect(g.exit_fade).toBe(0.12);
      expect(g.words.every((w: J) => w.start !== null)).toBe(true);
    }
    expect(emit(tl, "srt")).toBe(srtFromItems(vo.map((g: J) => ({ id: g.id, text: g.lines.join("\n"), start: g.start, end: g.end })), { duration: tl.duration }).srt);
  });
});

describe("plan refuses what it cannot plan", () => {
  it("a phrase map that no longer matches the hash the cut plan names", () => {
    const moved = clone(pm);
    moved.phrases[0].end = 1.95;
    expect(() => plan(moved, cp)).toThrow(/written against phrase map/);
  });

  it("a reference cycle, naming the chain", () => {
    const c = clone(cp);
    c.points.find((p: J) => p.id === "tick").from = "point.card-1.2";
    let err: J;
    try { plan(pm, c, { phrasemapSha256: opts.phrasemapSha256 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PlanError);
    expect(err.message).toMatch(/reference cycle: point (card|tick) -> .*point (card|tick)/);
  });

  it("a manual caption whose copy has a different word count from its phrases", () => {
    const c = clone(cp);
    c.captions.builder = "manual";
    c.captions.groups.push({ id: "v1", kind: "voiceover", copy: "Morning light.", source: "voiceover", deliver: ["srt"], phrases: ["P1"], split: null, from: null, to: null, not_before: null, not_after: null, lead_in: null, cls: null, enter: "none", enter_dur: null });
    expect(() => plan(pm, c, { phrasemapSha256: opts.phrasemapSha256 })).toThrow(/copy has 2 words but its phrases \(P1\) carry 6 timed words/);
  });

  it("voiceover groups under the auto builder", () => {
    const c = clone(cp);
    c.captions.groups.push({ id: "v1", kind: "voiceover", copy: "Morning light on a quiet desk.", source: "voiceover", deliver: ["srt"], phrases: ["P1"], split: null, from: null, to: null, not_before: null, not_after: null, lead_in: null, cls: null, enter: "none", enter_dur: null });
    expect(() => plan(pm, c, { phrasemapSha256: opts.phrasemapSha256 })).toThrow(/builder "auto" groups the spoken words itself/);
  });

  it("inputs that do not validate", () => {
    const c = clone(cp);
    c.points[0].snap = "sideways";
    expect(() => plan(pm, c, { phrasemapSha256: opts.phrasemapSha256 })).toThrow(PlanError);
  });
});

describe("snap modes", () => {
  const s = snapper({ bpm: 120, div: 4, origin: 0 }, 0.04); // unit 0.125, beat 0.5
  it.each([
    ["none", 1.3, 1.3], ["up", 1.3, 1.375], ["up", 1.375, 1.375], ["down", 1.3, 1.25], ["down", 1.25, 1.25],
    ["nearest", 1.3, 1.25], ["nearest", 1.32, 1.375], ["beat_up", 1.3, 1.5], ["full_beat_pref", 1.3, 1.375], ["full_beat_pref", 1.44, 1.5],
  ])("%s(%d) = %d", (mode, t, want) => {
    expect(s(mode, t)).toBeCloseTo(want, 12);
  });
  it("honours the grid origin", () => {
    expect(snapper({ bpm: 120, div: 4, origin: 0.1 }, 0)("up", 0.2)).toBeCloseTo(0.225, 12);
  });
});

describe("check: generic invariants and constraints, no run knowledge", () => {
  it("a shot under rules.min_shot FAILs naming the shot", () => {
    const t2 = replan((c) => { c.points[0].from = "phrase.P1.end+0.05"; c.points[0].snap = "none"; c.constraints = c.constraints.filter((x: J) => x.id !== "cut_after_line"); });
    // The face shot is now 1.99 s; raise the floor to see the gate bite.
    const f = check(t2, { minShot: 2.5 });
    expect(fails(f).map((x: J) => [x.rule, x.id])).toContainEqual(["shots.min_shot", "face"]);
  });

  it("a rejected clip frame on screen FAILs; a residual one WARNs", () => {
    const t2 = replan((c) => { c.clips[1].reject = [{ lo: 2.0, hi: 2.1, why: "focus hunt" }]; });
    const hit = fails(check(t2)).find((x: J) => x.rule === "shots.reject");
    expect(hit.detail).toMatch(/^shot desk shows clip desk frames 48-50 \(clip 2\.000 to 2\.083 s\) at output frames 109-112 \(3\.633 to 3\.733 s\)/);
    expect(frameHits(tl, "residual")).toHaveLength(1);
  });

  it("each constraint kind FAILs by the same rule when its row is not met", () => {
    for (const [id, s] of [["gap_P3", 0.5], ["decay", 1.5], ["desk_take", 3.5], ["cut_after_line", 1.0]] as const) {
      const c = clone(cp);
      c.constraints.find((x: J) => x.id === id).s = s;
      // check the unchanged timeline against the stricter row
      const row = check(tl, { cutplan: c }).find((x: J) => x.id === id);
      expect(row.verdict, id).toBe("FAIL");
    }
  });

  it("a hand-edited timeline FAILs re-planning; a stale cut plan hash FAILs the inputs check", () => {
    const t2 = JSON.parse(golden);
    t2.scenes[1].visual = "edited by hand";
    expect(check(t2, { cutplan: cp, phrasemap: pm, ...opts }).find((x: J) => x.rule === "timeline.replan").verdict).toBe("FAIL");
    expect(fails(check(tl, { cutplan: cp, cutplanSha256: "0".repeat(64) })).map((x: J) => x.rule)).toEqual(["timeline.inputs"]);
  });

  it("an SRT lane that drops a spoken word FAILs", () => {
    const t2 = clone(tl);
    const g = t2.captions.groups.find((x: J) => x.id === "vo2");
    g.words.pop(); g.text = g.words.map((w: J) => w.text).join(" "); g.lines = [g.text];
    expect(validateTimeline(t2)).toEqual([]);
    expect(check(t2).find((x: J) => x.rule === "captions.srt.script").verdict).toBe("FAIL");
  });

  it("a timeline that does not validate stops at the schema", () => {
    const t2 = clone(tl);
    t2.shots[1].out_in += 0.1;
    const f = check(t2);
    expect(f.every((x: J) => x.rule === "timeline.schema" && x.verdict === "FAIL")).toBe(true);
  });
});

describe("emit", () => {
  it("CLEAN storyboards drop burned voiceover captions and keep overlays; scenes and stamp intact", () => {
    const cap = JSON.parse(emit(tl, "storyboard", { ratio: "1:1", captions: "cap" }));
    const clean = JSON.parse(emit(tl, "storyboard", { ratio: "1:1", captions: "clean" }));
    expect(cap.format).toEqual({ ratio: "1:1", width: 1080, height: 1080, fps: 30 });
    expect(cap.scenes.flatMap((s: J) => s.text.map((x: J) => x.source))).toContain("voiceover");
    expect(clean.scenes.flatMap((s: J) => s.text.map((x: J) => x.id))).toEqual(["hook", "cta"]);
    expect(clean.scenes.find((s: J) => s.id === "s1").text[0]).toEqual({ id: "hook", copy: "One task, done before lunch", source: "copy_architecture.hook", in: 0, out: 2.125, enter: "rise", dur: 0.3 });
    expect(cap.derived_from).toEqual({ path: "timeline.json", sha256: sha256Hex(golden), schema: "mce.timeline/1", tm_sha256: tmSha256(tl.tm) });
  });

  it("stills and eye-sheet edge times come from the timeline", () => {
    const st = JSON.parse(emit(tl, "stills-times"));
    expect(st.stills.map((s: J) => s.name)).toEqual(["poster", "scene-s1", "cut-face-desk-before", "cut-face-desk-after", "scene-s2", "cut-desk-card-before", "cut-desk-card-after", "scene-s3"]);
    const et = JSON.parse(emit(tl, "edge-times"));
    expect(et.clips.map((c: J) => [c.clip, c.ranges.map((r: J) => [r.from, r.to])])).toEqual([["face", [[0.04, 2.165]]], ["desk", [[0.5, 4.375]]]]);
  });

  it("refuses targets it cannot write and names them", () => {
    expect(() => emit(tl, "edl")).toThrow(/needs the plan inputs/);
    expect(() => emit(tl, "storyboard", { ratio: "4:5", captions: "cap" })).toThrow(/no "4:5" canvas/);
    expect(() => emit(tl, "subtitles")).toThrow(EmitError);
    const noTm = clone(tl); noTm.tm = null;
    expect(() => emit(noTm, "tm")).toThrow(/no TM block/);
  });

  it("formats numbers in the voice graph as Python str(float) did", () => {
    expect([pyFloat(2), pyFloat(0.961), pyFloat(18.13), pyFloat(0.00001), pyFloat(-3)]).toEqual(["2.0", "0.961", "18.13", "1e-05", "-3.0"]);
  });
});

describe("the doc example (references/timeline.md) plans to the doc's timeline", () => {
  const md = fs.readFileSync(fileURLToPath(new URL("../../skills/metrix-video-assembly/references/timeline.md", import.meta.url)), "utf8");
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
  const dpm = blocks.find((b) => b.schema === "mce.phrasemap/1");
  const dcp = blocks.find((b) => b.schema === "mce.cutplan/1");
  const dtl = blocks.find((b) => b.schema === "mce.timeline/1");
  it("plans to the doc's timeline byte for byte", () => {
    const got = plan(dpm, dcp, { cutplanSha256: dtl.inputs.cutplan.sha256 });
    expect(serialize(got)).toBe(serialize(dtl));
  });
});

describe("timeline.mjs CLI", () => {
  it("plan, check and emit --all round-trip in a run folder", () => {
    const d = tmp();
    fs.copyFileSync(fileURLToPath(new URL("phrases.json", fx)), path.join(d, "phrases.json"));
    fs.copyFileSync(fileURLToPath(new URL("cut.json", fx)), path.join(d, "cut.json"));
    const p = spawnSync(process.execPath, [cli, "plan", "--phrases", path.join(d, "phrases.json"), "--cut", path.join(d, "cut.json")], { encoding: "utf8" });
    expect(p.status, p.stderr).toBe(0);
    expect(fs.readFileSync(path.join(d, "timeline.json"), "utf8")).toBe(golden);
    const c = spawnSync(process.execPath, [cli, "check", path.join(d, "timeline.json"), "--json"], { encoding: "utf8" });
    expect(c.status, c.stdout).toBe(0);
    expect(JSON.parse(c.stdout).verdict).toBe("WARN");
    const e = spawnSync(process.execPath, [cli, "emit", path.join(d, "timeline.json"), "--all", "--dir", path.join(d, "out")], { encoding: "utf8" });
    expect(e.status, e.stderr).toBe(0);
    const names = fs.readdirSync(path.join(d, "out")).sort();
    expect(names).toEqual(emitAll(tl, { cutplan: cp, phrasemap: pm }).map((f: J) => f.file).sort());
    const sb = JSON.parse(fs.readFileSync(path.join(d, "out", "storyboard_9x16_cap.json"), "utf8"));
    expect(sb.derived_from.path).toBe("../timeline.json");
    expect(sb.derived_from.sha256).toBe(sha256Hex(fs.readFileSync(path.join(d, "timeline.json"))));
  });

  it("check exits 1 on a FAIL, and emit refuses a cut plan changed since planning", () => {
    const d = tmp();
    for (const f of ["phrases.json", "cut.json", "timeline.json"]) fs.copyFileSync(fileURLToPath(new URL(f, fx)), path.join(d, f));
    const c = clone(cp);
    c.constraints.find((x: J) => x.id === "decay").s = 1.5;
    fs.writeFileSync(path.join(d, "cut.json"), serialize(c));
    const r = spawnSync(process.execPath, [cli, "check", path.join(d, "timeline.json")], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL timeline.inputs");
    expect(r.stdout).toMatch(/FAIL constraint \[decay\]/);
    const e = spawnSync(process.execPath, [cli, "emit", path.join(d, "timeline.json"), "--all"], { encoding: "utf8" });
    expect(e.status).toBe(1);
    expect(e.stderr).toContain("changed since the timeline was planned");
  });

  it("plan exits 1 with the reason on inputs it cannot plan, 2 on usage", () => {
    const d = tmp();
    fs.copyFileSync(fileURLToPath(new URL("phrases.json", fx)), path.join(d, "phrases.json"));
    const c = clone(cp);
    c.phrasemap.sha256 = "f".repeat(64);
    fs.writeFileSync(path.join(d, "cut.json"), serialize(c));
    const r = spawnSync(process.execPath, [cli, "plan", "--phrases", path.join(d, "phrases.json"), "--cut", path.join(d, "cut.json")], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("written against phrase map");
    expect(spawnSync(process.execPath, [cli, "plan"], { encoding: "utf8" }).status).toBe(2);
  });
});
