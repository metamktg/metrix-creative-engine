import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/make-srt.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

type Item = { id: string; copy: string; source: string; in: number; out: number };
function run(items: Item[], extra: string[] = [], duration = 12) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "make-srt-"));
  dirs.push(dir);
  const file = path.join(dir, "storyboard.json");
  fs.writeFileSync(file, JSON.stringify({ duration, scenes: [{ id: "s1", text: items }] }));
  const r = spawnSync(process.execPath, [tool, file, ...extra], { encoding: "utf8" });
  return { ...r, dir };
}
const cue = (id: string, copy: string, start: number, end: number, source = "voiceover"): Item => ({ id, copy, source, in: start, out: end });

describe("make-srt", () => {
  it("writes numbered cues in SRT time format from the voiceover captions only", () => {
    const r = run([cue("a", "Open the app.", 0.5, 2.25), cue("hook", "Not a caption", 0, 3, "copy_architecture.hook"), cue("b", "Pick a step.", 2.5, 4)]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("1\n00:00:00,500 --> 00:00:02,250\nOpen the app.\n\n2\n00:00:02,500 --> 00:00:04,000\nPick a step.\n");
    expect(r.stdout).not.toContain("Not a caption");
  });

  it("sorts cues by start time and formats hours and rounds milliseconds", () => {
    const r = run([cue("late", "Later.", 3661.2345, 3662), cue("early", "Sooner.", 1, 2)], [], 4000);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.indexOf("Sooner.")).toBeLessThan(r.stdout.indexOf("Later."));
    expect(r.stdout).toContain("01:01:01,235 --> 01:01:02,000");
  });

  it("clamps an overlapping cue to end before the next one and says so", () => {
    const r = run([cue("a", "First.", 0, 3), cue("b", "Second.", 2, 5)]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("00:00:00,000 --> 00:00:01,999");
    expect(r.stderr).toContain('cue "a" overlapped "b"');
  });

  it.each([
    ["a cue with no length", [cue("a", "Zero.", 2, 2)], "has no length"],
    ["a negative start", [cue("a", "Early.", -1, 1)], "before 0 s"],
    ["a cue past the storyboard duration", [cue("a", "Long.", 10, 13)], "after the storyboard's 12 s"],
    ["a cue with no text", [cue("a", "   ", 0, 1)], "has no text"],
    ["a non-numeric time", [{ id: "a", copy: "Bad.", source: "voiceover", in: "soon" as unknown as number, out: 2 }], "numeric in and out"],
  ])("fails on %s instead of writing a wrong clock", (_name, items, message) => {
    const r = run(items as Item[]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(message);
    expect(r.stdout).toBe("");
  });

  it("fails when nothing is captioned, and --all exports every text item for review", () => {
    const items = [cue("hook", "Look closer", 0, 3, "copy_architecture.hook")];
    const none = run(items);
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('no text item has source "voiceover"');
    const everything = run(items, ["--all"]);
    expect(everything.status, everything.stderr).toBe(0);
    expect(everything.stdout).toContain("Look closer");
  });

  it("writes to --out, creating folders, and honours --source", () => {
    const items = [cue("a", "Framing line.", 0, 2, "framing"), cue("b", "Voiced.", 2, 4)];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "make-srt-out-"));
    dirs.push(dir);
    const out = path.join(dir, "nested", "captions.srt");
    const r = run(items, ["--source", "framing", "--out", out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe("");
    expect(fs.readFileSync(out, "utf8")).toBe("1\n00:00:00,000 --> 00:00:02,000\nFraming line.\n");
  });
});
