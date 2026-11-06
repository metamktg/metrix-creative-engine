import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error plain ESM helper without type declarations
import { checkKeyframes, stageArgs, stageClip, verifyStaged } from "../../skills/metrix-video-assembly/scripts/media/stage.mjs";

const base = process.env.MCE_TEST_TMP || os.tmpdir();

describe("stage arguments and keyframe rule", () => {
  it("re-encodes with x264 CRF 18 and a GOP of exactly fps frames", () => {
    const a = stageArgs("in.mp4", "out.mp4", { fps: 30 });
    const after = (k: string) => a[a.indexOf(k) + 1];
    expect(after("-c:v")).toBe("libx264");
    expect(after("-crf")).toBe("18");
    expect(after("-g")).toBe("30");
    expect(after("-keyint_min")).toBe("30");
    expect(after("-c:a")).toBe("copy");
    expect(a[a.length - 1]).toBe("out.mp4");
    expect(() => stageArgs("in.mp4", "out.mp4", { fps: 29.97 })).toThrow(/integer fps/);
  });

  it("passes keyframes every second and fails a sparse GOP, a late first keyframe and a long tail", () => {
    expect(checkKeyframes([0, 1, 2], { fps: 25, duration: 3 })).toMatchObject({ verdict: "PASS", max_interval_frames: 25 });
    // A scene-cut keyframe between grid points only shortens an interval.
    expect(checkKeyframes([0, 0.6, 1, 2], { fps: 25, duration: 3 }).verdict).toBe("PASS");
    const sparse = checkKeyframes([0], { fps: 25, duration: 3 });
    expect(sparse).toMatchObject({ verdict: "FAIL", max_interval_frames: 75 });
    expect(sparse.problems[0]).toMatch(/75 frames exceeds the 25-frame GOP/);
    expect(checkKeyframes([0.2, 1.2, 2.2], { fps: 25, duration: 3 }).problems[0]).toMatch(/first keyframe/);
    expect(checkKeyframes([], { fps: 25, duration: 3 }).verdict).toBe("FAIL");
  });
});

describe("stageClip on a sparse-GOP source", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "media-stage-"));
    // 3 s at 25 fps with one keyframe for the whole clip, as generated clips often arrive.
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=160x120:r=25:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3:sample_rate=48000",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "250", "-keyint_min", "250", "-sc_threshold", "0", "-c:a", "aac",
      path.join(dir, "sparse.mp4")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  }, 30_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("the source fails the keyframe check", () => {
    expect(verifyStaged(path.join(dir, "sparse.mp4")).verdict).toBe("FAIL");
  }, 15_000);

  it("the staged copy has a keyframe every 25 frames, every frame, and the audio", () => {
    const res = stageClip(path.join(dir, "sparse.mp4"), path.join(dir, "staged", "sparse.mp4"));
    expect(res.verdict).toBe("PASS");
    expect(res.gop).toBe(25);
    expect(res.keyframes.times).toEqual([0, 1, 2]);
    expect(res.frames).toEqual({ source: 75, staged: 75, verdict: "PASS" });
    const a = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", res.dst], { encoding: "utf8" });
    expect(a.stdout.trim()).toBe("aac");
  }, 30_000);

  it("refuses to overwrite the source", () => {
    expect(() => stageClip(path.join(dir, "sparse.mp4"), path.join(dir, "sparse.mp4"))).toThrow(/must not overwrite/);
  });
});
