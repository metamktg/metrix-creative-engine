import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// CAP / CLEAN delivery in check-storyboard.mjs. CAP burns the voiceover captions. CLEAN burns none,
// so sound-off rests on delivery.srt: a caption file carrying every voiced word in order and,
// with --phrases, a cue over every phrase.
const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/check-storyboard.mjs", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-mode-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

type Rule = { rule: string; verdict: string; detail: string };
const sha = (b: string) => crypto.createHash("sha256").update(b).digest("hex");
const SCRIPT = "Work's done. Pick a topic tonight. Get it now.";
const BRIEF = JSON.stringify({ copy_architecture: { hook: "Learn faster", cta: "Get it now" } });
// Phrases on the voice clock; voiceover.at 0.5 puts them at 1.0-1.8, 2.0-3.6 and 4.2-5.0 on the ad clock.
const PHRASES = JSON.stringify({ phrases: [{ id: "P1", start: 0.5, end: 1.3 }, { id: "P2", start: 1.5, end: 3.1 }, { id: "P3", start: 3.7, end: 4.5 }] });
const SRT_OK = "1\n00:00:01,000 --> 00:00:01,800\nWorks done,\n\n2\n00:00:02,000 --> 00:00:03,600\npick a topic\ntonight.\n\n3\n00:00:04,200 --> 00:00:05,000\nGet it now.\n";
let n = 0;

function sb(captions: string | null, opts: { srt?: string; burned?: boolean } = {}) {
  const text: object[] = [{ id: "h", copy: "Learn faster", source: "copy_architecture.hook", in: 0, out: 4, enter: "none" }];
  if (opts.burned) text.push({ id: "cap1", copy: "Pick a topic tonight.", source: "voiceover", in: 2, out: 3.6, enter: "none" });
  return {
    name: "d", duration: 8, poster_at: 0.5, format: { ratio: "9:16", width: 1080, height: 1920, fps: 30 },
    ...(captions === null ? {} : { delivery: { captions, ...(opts.srt ? { srt: opts.srt } : {}) } }),
    audio: { music: { file: "m.wav", volume: 0.3, licence: "test fixture" }, voiceover: { file: "v.wav", at: 0.5, script_sha256: sha(SCRIPT) } },
    scenes: [
      { id: "s1", role: "hook", start: 0, end: 4, text },
      { id: "s2", role: "cta", start: 4, end: 8, text: [{ id: "c", copy: "Get it now", source: "copy_architecture.cta", in: 4, out: 8, enter: "none" }] },
    ],
  };
}

function run(board: object, { srt, phrases = true, script = true, briefBody = BRIEF }: { srt?: string; phrases?: boolean; script?: boolean; briefBody?: string } = {}) {
  const dir = path.join(root, `case-${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "storyboard.json"), JSON.stringify(board));
  fs.writeFileSync(path.join(dir, "brief.json"), briefBody);
  fs.writeFileSync(path.join(dir, "script.txt"), SCRIPT);
  fs.writeFileSync(path.join(dir, "phrases.json"), PHRASES);
  if (srt !== undefined) fs.writeFileSync(path.join(dir, "captions.srt"), srt);
  const args = [path.join(dir, "storyboard.json"), "--brief", path.join(dir, "brief.json")];
  if (script) args.push("--script", path.join(dir, "script.txt"));
  if (phrases) args.push("--phrases", path.join(dir, "phrases.json"));
  const r = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" });
  const results = JSON.parse(r.stdout).results as Rule[];
  return { status: r.status, rule: (k: string) => results.find((x) => x.rule === k) };
}

describe("CAP delivery", () => {
  it("passes sound-off with burned voiceover captions", () => {
    const r = run(sb("cap", { burned: true }));
    expect(r.rule("sound_off")?.verdict).toBe("PASS");
    expect(r.status).toBe(0);
  });
  it("fails sound-off with none on screen", () => {
    expect(run(sb("cap")).rule("sound_off")?.verdict).toBe("FAIL");
  });
});

describe("CLEAN delivery", () => {
  it("passes sound-off when delivery.srt carries every voiced word and covers every phrase", () => {
    const r = run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK });
    expect(r.rule("delivery.srt")?.verdict).toBe("PASS");
    expect(r.rule("delivery.srt")?.detail).toContain("every one of 3 phrases has a cue over it");
    expect(r.rule("sound_off")?.verdict).toBe("PASS");
    expect(r.status).toBe(0);
  });
  it("without --phrases the words still pass but the timing is a WARN, not a PASS", () => {
    const r = run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK, phrases: false });
    expect(r.rule("delivery.srt")?.verdict).toBe("WARN");
    expect(r.rule("sound_off")?.verdict).toBe("PASS");
  });
  it("fails with no delivery.srt", () => {
    const r = run(sb("clean"));
    expect(r.rule("sound_off")?.verdict).toBe("FAIL");
    expect(r.rule("sound_off")?.detail).toContain("needs delivery.srt");
  });
  it("fails a delivery.srt that does not exist", () => {
    expect(run(sb("clean", { srt: "captions.srt" })).rule("delivery.srt")?.detail).toContain("does not exist");
  });
  it("fails an SRT missing a voiced phrase's words", () => {
    const srt = SRT_OK.split("\n\n3\n")[0] + "\n";
    const r = run(sb("clean", { srt: "captions.srt" }), { srt });
    expect(r.rule("delivery.srt")?.verdict).toBe("FAIL");
    expect(r.rule("delivery.srt")?.detail).toContain('missing from word 7 ("get it now")');
    expect(r.rule("sound_off")?.verdict).toBe("FAIL");
  });
  it("fails an SRT with a word the voice does not say", () => {
    const r = run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK.replace("pick a topic", "pick a free topic") });
    expect(r.rule("delivery.srt")?.detail).toContain('word 5 is "free"');
  });
  it("fails an SRT whose words are right but leaves a phrase with no cue over it", () => {
    const srt = SRT_OK.replace("00:00:04,200 --> 00:00:05,000", "00:00:05,100 --> 00:00:05,900");
    const r = run(sb("clean", { srt: "captions.srt" }), { srt });
    expect(r.rule("delivery.srt")?.detail).toContain("no cue over phrase P3");
  });
  it("fails overlapping cues and cues past the end of the ad", () => {
    expect(run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK.replace("00:00:02,000", "00:00:01,500") }).rule("delivery.srt")?.detail).toContain("starts before cue 1 ends");
    expect(run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK.replace("00:00:05,000", "00:00:09,000") }).rule("delivery.srt")?.detail).toContain("runs outside");
  });
  it("fails a CLEAN storyboard that burns voiceover captions", () => {
    const r = run(sb("clean", { srt: "captions.srt", burned: true }), { srt: SRT_OK });
    expect(r.rule("delivery.clean")?.verdict).toBe("FAIL");
  });
  it("fails when there is no voiced script to check the SRT against", () => {
    const r = run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK, script: false });
    expect(r.rule("delivery.srt")?.detail).toContain("no voiced script");
  });
  it("uses the brief's copy_architecture.script when no locked script is given", () => {
    const briefBody = JSON.stringify({ copy_architecture: { hook: "Learn faster", cta: "Get it now", script: SCRIPT } });
    const r = run(sb("clean", { srt: "captions.srt" }), { srt: SRT_OK, script: false, briefBody });
    expect(r.rule("delivery.srt")?.verdict).toBe("PASS");
    expect(r.rule("delivery.srt")?.detail).toContain("brief copy_architecture.script");
  });
});

describe("delivery block shape and the legacy rule", () => {
  it("fails a captions value that is not cap or clean", () => {
    expect(run(sb("burned")).rule("delivery.captions")?.verdict).toBe("FAIL");
  });
  it("without a delivery block, a voiceover with no burned captions fails as before", () => {
    expect(run(sb(null)).rule("sound_off")?.verdict).toBe("FAIL");
    expect(run(sb(null, { burned: true })).rule("sound_off")).toBeUndefined();
  });
});
