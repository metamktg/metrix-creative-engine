/**
 * mce.run/1: each stage reads only what an earlier stage wrote, by hash; a repeated stage with
 * the same inputs is skipped; handoff needs a passing review; files changed after recording
 * are found.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/run.mjs", import.meta.url));
const R = (await import(pathToFileURL(script).href)) as any;

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mce-run-"));
  dirs.push(dir);
  const put = (rel: string, text: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); return rel; };
  put("brief.json", '{"brief_metadata":{"brief_id":"x"}}');
  R.init(dir, "brief.json");
  return { dir, put };
}
const cli = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe("mce.run/1 run manifest", () => {
  it("chains brief -> generate (source) -> render -> qa -> review -> handoff, every file by sha256", () => {
    const { dir, put } = fresh();
    R.record(dir, { stage: "plan", inputs: [["brief", "brief.json"]], outputs: [["storyboard", put("storyboard.json", "{}")]] });
    R.record(dir, { stage: "generate", inputs: [["storyboard", "storyboard.json"]], sources: [["clip", put("media/clip.mp4", "kie bytes")]], tool: "kie" });
    R.record(dir, { stage: "render", inputs: [["clip", "media/clip.mp4"]], outputs: [["master", put("ad.mp4", "master")]] });
    R.record(dir, { stage: "qa", inputs: [["master", "ad.mp4"]], outputs: [["qa_report", put("qa.json", "{}")]] });
    R.record(dir, { stage: "review", inputs: [["qa_report", "qa.json"], ["master", "ad.mp4"]], outputs: [["record", put("production-review.json", "{}")]] });
    const h = R.record(dir, { stage: "handoff", inputs: [["record", "production-review.json"]], outputs: [["receipt", put("receipt.json", "{}")]] });
    expect(h.skipped).toBe(false);
    const run = R.load(dir);
    expect(run.schema).toBe("mce.run/1");
    expect(run.stages.map((s: any) => s.stage)).toEqual(["plan", "generate", "render", "qa", "review", "handoff"]);
    expect(run.stages[1].sources[0]).toMatchObject({ role: "clip", path: "media/clip.mp4" });
    expect(R.verify(dir)).toEqual([]);
  });

  it("refuses an input no earlier stage wrote, and one that changed after it was recorded", () => {
    const { dir, put } = fresh();
    put("stray.mp4", "x");
    expect(() => R.record(dir, { stage: "render", inputs: [["clip", "stray.mp4"]] })).toThrow(/not written by an earlier stage/);
    R.record(dir, { stage: "ingest", sources: [["clip", "stray.mp4"]], tool: "desktop-edit" });
    put("stray.mp4", "edited after ingest");
    expect(() => R.record(dir, { stage: "render", inputs: [["clip", "stray.mp4"]] })).toThrow(/changed since the run recorded it/);
    expect(R.verify(dir)).toEqual([expect.objectContaining({ path: "stray.mp4" })]);
  });

  it("takes outside files only on generate and ingest", () => {
    const { dir, put } = fresh();
    expect(() => R.record(dir, { stage: "render", sources: [["clip", put("a.mp4", "a")]] })).toThrow(/only generate and ingest take --source/);
  });

  it("skips a stage already passed with the same inputs, so a resumed run does not spend twice", () => {
    const { dir, put } = fresh();
    const first = R.record(dir, { stage: "generate", inputs: [["brief", "brief.json"]], sources: [["clip", put("c.mp4", "1")]] });
    const again = R.record(dir, { stage: "generate", inputs: [["brief", "brief.json"]], sources: [["clip", "c.mp4"]] });
    expect(again).toEqual({ skipped: true, stage: first.stage });
    expect(R.load(dir).stages).toHaveLength(1);
  });

  it("blocks handoff without a passing review (exit 3) and records a FAIL stage with exit 1", () => {
    const { dir, put } = fresh();
    put("receipt.json", "{}");
    const blocked = cli("record", dir, "--stage", "handoff", "--in", "brief=brief.json");
    expect(blocked.status).toBe(3);
    expect(blocked.stderr).toMatch(/BLOCKED: handoff needs a PASS review/);
    put("qa.json", "{}");
    const failed = cli("record", dir, "--stage", "qa", "--in", "brief=brief.json", "--out", "qa_report=qa.json", "--status", "FAIL");
    expect(failed.status).toBe(1);
    expect(R.load(dir).stages[0]).toMatchObject({ stage: "qa", status: "FAIL" });
  });

  it("keeps paths inside the run and refuses a second init", () => {
    const { dir } = fresh();
    const outside = path.join(os.tmpdir(), `mce-outside-${process.pid}.txt`);
    fs.writeFileSync(outside, "x");
    try {
      expect(() => R.record(dir, { stage: "ingest", sources: [["clip", outside]] })).toThrow(/not inside the run directory/);
    } finally { fs.rmSync(outside); }
    expect(cli("init", dir, "--brief", "brief.json").status).toBe(2);
  });
});
