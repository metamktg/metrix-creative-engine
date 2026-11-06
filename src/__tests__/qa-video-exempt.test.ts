import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXEMPTABLE, judge, loadExemptions, summarize,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/qa-video.mjs";

// An exemption is evidence-bound: it names the check, the window, the reason, the reviewer and a
// still whose hash matches, and it binds to the exact bytes of the file under QA. An exempted
// check reports EXEMPT with its raw measurement; the summary is EXEMPT, never PASS.

const qaVideo = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/qa-video.mjs", import.meta.url));
const base = process.env.MCE_TEST_TMP || os.tmpdir();
const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const STILL = Buffer.from("still bytes");
const ex = (over: Record<string, unknown> = {}) => ({ check: "transitions", lo: 1, hi: 2, reason: "slow push on one picture", reviewer: "a reviewer", still: "s.png", still_sha256: sha(STILL), ...over });

describe("judge and summarize (pure)", () => {
  const ev = [{ start: 1.4, end: 1.53 }];

  it("an event inside an exemption for its check is EXEMPT, and keeps the raw measurement", () => {
    const j = judge("transitions", ev, [ex()]);
    expect(j.verdict).toBe("EXEMPT");
    expect(j.events).toEqual(ev);
    expect(j.exempted[0]).toMatchObject({ start: 1.4, end: 1.53, by: { lo: 1, hi: 2, reviewer: "a reviewer" } });
  });

  it("an event outside the window, partly outside, or exempted for another check stays FAIL", () => {
    expect(judge("transitions", ev, [ex({ lo: 1.45 })]).verdict).toBe("FAIL");
    expect(judge("transitions", ev, [ex({ check: "freeze" })]).verdict).toBe("FAIL");
    expect(judge("transitions", [...ev, { start: 2.5, end: 2.6 }], [ex()]).verdict).toBe("FAIL");
    expect(judge("transitions", [], []).verdict).toBe("PASS");
  });

  it("the summary is FAIL over EXEMPT over PASS, and EXEMPT is never PASS", () => {
    expect(summarize([{ verdict: "PASS" }, { verdict: "EXEMPT" }, { verdict: "WARN" }])).toBe("EXEMPT");
    expect(summarize([{ verdict: "FAIL" }, { verdict: "EXEMPT" }])).toBe("FAIL");
    expect(summarize([{ verdict: "PASS" }, { verdict: "WARN" }])).toBe("PASS");
  });
});

describe("loadExemptions (evidence rules)", () => {
  const video = "a".repeat(64);
  const read = (p: string) => { if (path.basename(p) === "s.png") return STILL; throw new Error("ENOENT"); };
  const load = (doc: unknown) => loadExemptions(doc, { baseDir: "/x", videoSha256: video, readFile: read });
  const doc = (e: unknown[] = [ex()], over: Record<string, unknown> = {}) => ({ schema: "mce.qaexempt/1", video_sha256: video, exemptions: e, ...over });

  it("accepts a complete entry", () => expect(load(doc())).toHaveLength(1));
  it("binds to the file's bytes", () => expect(() => load(doc(undefined, { video_sha256: "b".repeat(64) }))).toThrow(/does not match the file under QA/));
  it("needs the still to exist and hash as cited", () => {
    expect(() => load(doc([ex({ still_sha256: "c".repeat(64) })]))).toThrow(/hashes to/);
    expect(() => load(doc([ex({ still: "missing.png" })]))).toThrow(/cannot read/);
    expect(() => load(doc([ex({ still: undefined })]))).toThrow(/still: required/);
  });
  it("needs a reason and a reviewer", () => {
    expect(() => load(doc([ex({ reason: " " })]))).toThrow(/reason: required/);
    expect(() => load(doc([ex({ reviewer: undefined })]))).toThrow(/reviewer: required/);
  });
  it("only interval checks can be exempted (audio.length, loudness and format never)", () => {
    expect(EXEMPTABLE).not.toContain("audio.length");
    expect(() => load(doc([ex({ check: "audio.length" })]))).toThrow(/cannot be exempted/);
    expect(() => load(doc([ex({ lo: 2, hi: 1 })]))).toThrow(/lo and hi/);
    expect(() => load(doc([], {}))).toThrow(/empty/);
    expect(() => load({ ...doc(), schema: "x" })).toThrow(/schema/);
  });
});

describe.skipIf(!ffmpeg)("qa-video --exempt on a real double exposure", () => {
  let dir = "", file = "", still = "", fileSha = "";
  const TAGS = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-c:a", "aac", "-shortest"];
  const write = (name: string, entries: unknown[], over: Record<string, unknown> = {}) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify({ schema: "mce.qaexempt/1", video_sha256: fileSha, exemptions: entries, ...over }));
    return p;
  };
  const qa = (...args: string[]) => {
    const r = spawnSync(process.execPath, [qaVideo, file, "--silent", ...args], { encoding: "utf8" });
    return { status: r.status, stderr: r.stderr, report: r.stdout ? JSON.parse(r.stdout) : null };
  };
  const trans = (rep: { results: { check: string }[] }) => rep.results.find((x) => x.check === "transitions") as { verdict: string; detail: string; measured: unknown[]; exempted?: unknown[] };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "qa-video-exempt-"));
    file = path.join(dir, "dx.mp4");
    // Two different moving pictures crossfaded over frames 40 to 50: a double exposure around 1.4 to 1.53 s.
    const graph = "testsrc2=s=160x288:r=30:d=3[a];testsrc=s=160x288:r=30:d=3[b];[a][b]blend=all_expr='if(lt(N\\,40)\\,A\\,if(gt(N\\,50)\\,B\\,(A*(50-N)+B*(N-40))/10))'";
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", graph, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=3", ...TAGS, file], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    fileSha = sha(fs.readFileSync(file));
    still = path.join(dir, "stills", "dx-1.45.png");
    fs.mkdirSync(path.dirname(still));
    const s = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.45", "-i", file, "-frames:v", "1", still], { encoding: "utf8" });
    if (s.status !== 0) throw new Error(s.stderr);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const entry = (over: Record<string, unknown> = {}) => ({ check: "transitions", lo: 1.3, hi: 1.6, reason: "test: deliberate dissolve", reviewer: "test", still: "stills/dx-1.45.png", still_sha256: sha(fs.readFileSync(still)), ...over });

  it("fails the unexempted double exposure", () => {
    const r = qa();
    expect(r.status).toBe(1);
    expect(r.report.verdict).toBe("FAIL");
    expect(trans(r.report).verdict).toBe("FAIL");
    expect(trans(r.report).detail).toMatch(/double exposure at 1\.[34]\d-1\.5\ds/);
  });

  it("reports an exempted double exposure as EXEMPT with its measurement, and the summary is not PASS", () => {
    const p = write("ok.json", [entry()]);
    const r = qa("--exempt", p);
    expect(r.status, r.stderr).toBe(0);
    expect(r.report.verdict).toBe("EXEMPT");
    expect(r.report.verdict).not.toBe("PASS");
    const t = trans(r.report);
    expect(t.verdict).toBe("EXEMPT");
    expect(t.measured.length).toBeGreaterThan(0);
    expect(t.detail).toMatch(/double exposure at .* \(all exempted\)/);
    expect(r.report.exemptions.sha256).toBe(sha(fs.readFileSync(p)));
    expect(r.report.exemptions.used).toEqual([expect.objectContaining({ check: "transitions", lo: 1.3, hi: 1.6, reviewer: "test", still_sha256: entry().still_sha256 })]);
    expect(r.report.exemptions.unused).toEqual([]);
  });

  it("an exemption that does not cover the whole event leaves the check FAIL", () => {
    const r = qa("--exempt", write("narrow.json", [entry({ lo: 1.5, hi: 1.6 })]));
    expect(r.status).toBe(1);
    expect(trans(r.report).verdict).toBe("FAIL");
  });

  it("refuses an exemption for other bytes, a changed still or a scalar check (exit 2)", () => {
    expect(qa("--exempt", write("other.json", [entry()], { video_sha256: "0".repeat(64) })).status).toBe(2);
    const bad = qa("--exempt", write("still.json", [entry({ still_sha256: "0".repeat(64) })]));
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/still_sha256/);
    expect(qa("--exempt", write("scalar.json", [entry({ check: "audio.length" })])).status).toBe(2);
  });
});
