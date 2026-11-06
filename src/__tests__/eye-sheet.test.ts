import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachScores, eyeSheet, parseShowinfo, planEdges, planRange,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/media/eye-sheet.mjs";

const base = process.env.MCE_TEST_TMP || os.tmpdir();
// Geist Regular, SIL OFL 1.1 (licence beside it). CI's apt ffmpeg has no guaranteed font.
const font = fileURLToPath(new URL("./fixtures/fonts/Geist-Regular.ttf", import.meta.url));
const at25 = (n: number) => Array.from({ length: n }, (_, i) => Math.round(i * 40) / 1000);
type Frame = { i: number; t_src: number; range?: number; edge?: string; score?: unknown };

describe("eye sheet planning", () => {
  it("range mode keeps from <= t < to", () => {
    const p = planRange(at25(75), 0.5, 1.3);
    expect(p).toHaveLength(20);
    expect(p[0]).toEqual({ n: 13, t: 0.52 });
    expect(p[19].t).toBe(1.28);
  });

  it("edges mode keeps the first and last N frames of each range", () => {
    const p = planEdges(at25(75), [{ from: 0.2, to: 1.0 }, { from: 1.5, to: 2.5 }], 3);
    expect(p.map((f: { t: number }) => f.t)).toEqual([0.2, 0.24, 0.28, 0.88, 0.92, 0.96, 1.52, 1.56, 1.6, 2.4, 2.44, 2.48]);
    expect(p.map((f: { edge: string }) => f.edge)).toEqual(["head", "head", "head", "tail", "tail", "tail", "head", "head", "head", "tail", "tail", "tail"]);
    // 0 to 0.2 s holds 5 frames: fewer than 2N = 6, so head and tail would overlap.
    expect(() => planEdges(at25(75), [{ from: 0, to: 0.2 }], 3)).toThrow(/fewer than 2 x edges/);
    expect(planEdges(at25(75), [{ from: 0, to: 0.24 }], 3)).toHaveLength(6);
  });

  it("reads frame times from showinfo", () => {
    const log = "[Parsed_showinfo_1 @ 0x1] n:   0 pts:  13312 pts_time:0.52    duration: 512\n[Parsed_showinfo_1 @ 0x1] n:   1 pts:  13824 pts_time:0.56    duration: 512\n";
    expect(parseShowinfo(log)).toEqual([0.52, 0.56]);
  });

  it("attaches a score within half a frame, and null where none matches (hook for automated scoring)", () => {
    const frames = [{ i: 0, t_src: 0.52 }, { i: 1, t_src: 0.56 }, { i: 2, t_src: 0.6 }];
    const scores = [{ t_src: 0.521, eyeBlinkLeft: 0.9, eyeBlinkRight: 0.8 }, { t_src: 0.57, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }];
    const out = attachScores(frames, scores, { fps: 25 });
    expect(out[0].score).toEqual({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.8 });
    expect(out[1].score).toEqual({ eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }); // 0.01 s away, inside half a frame
    expect(out[2].score).toBeNull(); // 0.03 s away, more than half a frame
    expect(attachScores(frames, [{ t_src: 5 }], { fps: 25 }).every((f: Frame) => f.score === null)).toBe(true);
    expect(attachScores(frames, null, { fps: 25 })).toBe(frames);
  });
});

describe("eyeSheet on a 25 fps clip", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "eye-sheet-"));
    // Red 1 s, blue 1.5 s, testsrc2 1 s at 25 fps, B-frames on (the x264 default).
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=red:s=160x120:r=25:d=1", "-f", "lavfi", "-i", "color=blue:s=160x120:r=25:d=1.5", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=25:d=1",
      "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "clip.mp4")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  }, 30_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("tiles every decoded source frame in range, (to - from) x 25 of them, with source times", () => {
    const res = eyeSheet(path.join(dir, "clip.mp4"), { from: 0.5, to: 1.3, cols: 8, out: path.join(dir, "range.png"), fontfile: font });
    expect(res.frames).toHaveLength((1.3 - 0.5) * 25);
    expect(res.frames.map((f: Frame) => f.t_src)).toEqual(at25(75).filter((t) => t >= 0.5 && t < 1.3));
    expect(res.frames.map((f: Frame) => f.i)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(res.fps).toBe(25);
    expect([res.cols, res.rows]).toEqual([8, 3]);
    expect(fs.statSync(res.png).size).toBeGreaterThan(1000);
    const rec = JSON.parse(fs.readFileSync(res.json, "utf8"));
    expect(rec).toMatchObject({ schema: "mce.eyesheet/1", mode: "range", from: 0.5, to: 1.3, fps: 25, scores: null });
    expect(rec.frames).toEqual(res.frames);
  }, 30_000);

  it("edges mode shows 2N frames per range, one row per range", () => {
    const res = eyeSheet(path.join(dir, "clip.mp4"), { ranges: [{ from: 0.2, to: 1.0 }, { from: 1.5, to: 2.5 }], edges: 3, out: path.join(dir, "edges.png"), fontfile: font });
    expect(res.frames).toHaveLength(2 * 3 * 2);
    expect(res.frames.map((f: Frame) => f.t_src)).toEqual([0.2, 0.24, 0.28, 0.88, 0.92, 0.96, 1.52, 1.56, 1.6, 2.4, 2.44, 2.48]);
    expect(res.frames.filter((f: Frame) => f.range === 1 && f.edge === "tail")).toHaveLength(3);
    expect([res.cols, res.rows]).toEqual([6, 2]);
  }, 30_000);

  it("carries an optional scores file into the record", () => {
    const scoresFile = path.join(dir, "scores.json");
    fs.writeFileSync(scoresFile, JSON.stringify({ frames: [{ t_src: 0.52, eyeBlinkLeft: 0.95, eyeBlinkRight: 0.97 }] }));
    const res = eyeSheet(path.join(dir, "clip.mp4"), { from: 0.5, to: 0.6, out: path.join(dir, "scored.png"), fontfile: font, scores: scoresFile });
    expect(res.frames[0].score).toEqual({ eyeBlinkLeft: 0.95, eyeBlinkRight: 0.97 });
    expect(res.frames[1].score).toBeNull();
    expect(JSON.parse(fs.readFileSync(res.json, "utf8")).scores).toMatchObject({ matched: 1 });
  }, 30_000);
});
