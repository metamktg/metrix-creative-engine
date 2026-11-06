import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cuts, frameCheck, freezeCheck, isAllowed, parseFreeze, parseRange, parseScdet, shortShotGate, shotsFromCuts,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/media/scdet.mjs";

const base = process.env.MCE_TEST_TMP || os.tmpdir();
const cli = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/media/scdet.mjs", import.meta.url));
const FRAME = 1 / 25;
type Shot = { from: number; to: number; len: number };

describe("scdet parser and shots", () => {
  it("reads lavfi.scd.time lines, sorted and de-duplicated", () => {
    const log = [
      "[Parsed_scdet_0 @ 0x1] lavfi.scd.score: 31.778, lavfi.scd.time: 2.52",
      "[Parsed_scdet_0 @ 0x1] lavfi.scd.score: 15.625, lavfi.scd.time: 1",
      "[Parsed_scdet_0 @ 0x1] lavfi.scd.score: 15.625, lavfi.scd.time: 1",
      "frame=   88 fps=0.0 q=-0.0 Lsize=N/A",
    ].join("\n");
    expect(parseScdet(log)).toEqual([1, 2.52]);
    expect(parseScdet("")).toEqual([]);
  });

  it("turns cuts into shots from 0 to the end, dropping a cut at 0 or past the end", () => {
    expect(shotsFromCuts([1, 2.52], 3.52)).toEqual([{ from: 0, to: 1, len: 1 }, { from: 1, to: 2.52, len: 1.52 }, { from: 2.52, to: 3.52, len: 1 }]);
    expect(shotsFromCuts([0, 4], 3)).toEqual([{ from: 0, to: 3, len: 3 }]);
  });
});

describe("short-shot gate (owner rule: no shot under 0.75 s)", () => {
  const saved = process.env.MCE_MIN_SHOT;
  afterEach(() => { if (saved === undefined) delete process.env.MCE_MIN_SHOT; else process.env.MCE_MIN_SHOT = saved; });
  const at30 = (frames: number[]) => {
    let t = 0;
    return frames.map((n) => { const s = { from: t, to: t + n / 30, len: n / 30 }; t += n / 30; return s; });
  };

  it("fails 22 frames at 30 fps (0.733 s) and passes 23 frames and exactly 0.75 s", () => {
    const g = shortShotGate(at30([40, 22, 23, 40]));
    expect(g.verdict).toBe("FAIL");
    expect(g.min_shot).toBe(0.75);
    expect(g.short.map((s: Shot & { index: number }) => s.index)).toEqual([1]);
    expect(shortShotGate([{ from: 0, to: 0.75, len: 0.75 }, { from: 0.75, to: 2, len: 1.25 }]).verdict).toBe("PASS");
  });

  it("counts the first and the last shot too, and names them", () => {
    const g = shortShotGate(at30([10, 40, 12]));
    expect(g.short.map((s: { edge: string | null }) => s.edge)).toEqual(["first", "last"]);
  });

  it("takes the minimum from the option, then MCE_MIN_SHOT, and rejects junk", () => {
    const shots = at30([40, 25, 40]); // 0.833 s middle shot
    expect(shortShotGate(shots).verdict).toBe("PASS");
    expect(shortShotGate(shots, { minShot: 1 }).verdict).toBe("FAIL");
    process.env.MCE_MIN_SHOT = "0.9";
    expect(shortShotGate(shots).verdict).toBe("FAIL");
    expect(() => shortShotGate(shots, { minShot: "soon" })).toThrow(/positive number/);
  });
});

describe("freeze and frame-count parsers", () => {
  it("pairs freeze start and end, and closes an open freeze at the end of the file", () => {
    const log = [
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_start: 1",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_duration: 0.52",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_end: 1.52",
      "[Parsed_freezedetect_0 @ 0x1] lavfi.freezedetect.freeze_start: 17.2",
    ].join("\n");
    expect(parseFreeze(log, 18.133333)).toEqual([
      { start: 1, end: 1.52, duration: 0.52 },
      { start: 17.2, end: 18.133333, duration: 0.933333, open_at_eof: true },
    ]);
  });

  it("allows a freeze only when it sits inside an allowed range", () => {
    expect(isAllowed({ start: 1, end: 1.52 }, [{ from: 0.9, to: 1.6 }])).toBe(true);
    expect(isAllowed({ start: 1, end: 1.7 }, [{ from: 0.9, to: 1.6 }])).toBe(false);
    expect(parseRange("17.2-18.2")).toEqual({ from: 17.2, to: 18.2 });
    expect(() => parseRange("3-1")).toThrow(/range/);
  });

  it("passes a full frame list and fails missing frames and holes", () => {
    const full = Array.from({ length: 50 }, (_, i) => i * FRAME);
    expect(frameCheck({ pts: full, duration: 2, fps: 25 })).toMatchObject({ verdict: "PASS", decoded: 50, expected: 50, gaps: [] });
    const holed = full.filter((_, i) => i < 10 || i > 14);
    const r = frameCheck({ pts: holed, duration: 2, fps: 25 });
    expect(r).toMatchObject({ verdict: "FAIL", decoded: 45, expected: 50 });
    expect(r.gaps).toEqual([{ after: 0.36, at: 0.6, dt: 0.24, frames_missing: 5 }]);
    // One frame short is inside the default tolerance; a hole is never tolerated.
    expect(frameCheck({ pts: full.slice(0, 49), duration: 2, fps: 25 }).verdict).toBe("PASS");
  });
});

describe("scdet, short-shot and freeze on lavfi fixtures", () => {
  let dir = "";
  const ff = (args: string[]) => {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const x264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p"];
  const three = (a: string, b: string, c: string, out: string) =>
    ff(["-f", "lavfi", "-i", a, "-f", "lavfi", "-i", b, "-f", "lavfi", "-i", c, "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", ...x264, path.join(dir, out)]);

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "media-scdet-"));
    // Red 1 s, blue 1.5 s (38 frames at 25 fps, so it ends at 2.52), testsrc2 1 s.
    three("color=red:s=160x120:r=25:d=1", "color=blue:s=160x120:r=25:d=1.5", "testsrc2=s=160x120:r=25:d=1", "cuts.mp4");
    // A 0.6 s middle shot: under the 0.75 s rule.
    three("color=red:s=160x120:r=25:d=1", "color=blue:s=160x120:r=25:d=0.6", "testsrc2=s=160x120:r=25:d=1", "short.mp4");
    // Moving picture, a 0.5 s frozen grey card, moving picture.
    three("testsrc2=s=160x120:r=25:d=1", "color=gray:s=160x120:r=25:d=0.5", "testsrc2=s=160x120:r=25:d=1", "frozen.mp4");
    // A slow push-in with no cut and no still frame.
    ff(["-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=3,zoompan=z='1+0.0015*on':d=1:s=160x120:fps=25", ...x264, path.join(dir, "zoom.mp4")]);
    // 2 s at 25 fps with frames 10 to 14 dropped and their timestamps kept: a hole in the picture.
    ff(["-f", "lavfi", "-i", "testsrc2=s=160x120:r=25:d=2", "-vf", "select='not(between(n\\,10\\,14))'", "-fps_mode", "passthrough", ...x264, path.join(dir, "dropped.mp4")]);
  }, 60_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("finds the two cuts within one source frame of 1.0 and 2.5", () => {
    const r = cuts(path.join(dir, "cuts.mp4"));
    expect(r.cuts).toHaveLength(2);
    expect(Math.abs(r.cuts[0] - 1.0)).toBeLessThanOrEqual(FRAME + 1e-6);
    expect(Math.abs(r.cuts[1] - 2.5)).toBeLessThanOrEqual(FRAME + 1e-6);
    expect(r.shots).toHaveLength(3);
    expect(shortShotGate(r.shots).verdict).toBe("PASS");
  }, 20_000);

  it("finds no cut in a slow push-in at the default threshold", () => {
    const r = cuts(path.join(dir, "zoom.mp4"));
    expect(r.cuts).toEqual([]);
    expect(r.shots).toEqual([{ from: 0, to: 3, len: 3 }]);
  }, 20_000);

  it("fails the 0.6 s shot", () => {
    const r = cuts(path.join(dir, "short.mp4"));
    const g = shortShotGate(r.shots);
    expect(g.verdict).toBe("FAIL");
    expect(g.short).toHaveLength(1);
    expect(g.short[0].len).toBeCloseTo(0.6, 1);
    expect(g.short[0].from).toBeCloseTo(1.0, 1);
  }, 20_000);

  it("finds the frozen card, and passes it when the range is allowed", () => {
    const r = freezeCheck(path.join(dir, "frozen.mp4"));
    expect(r.verdict).toBe("FAIL");
    expect(r.freezes).toHaveLength(1);
    expect(r.freezes[0].start).toBeCloseTo(1.0, 2);
    expect(r.freezes[0].end).toBeCloseTo(1.52, 2);
    expect(r.frames.verdict).toBe("PASS");
    expect(freezeCheck(path.join(dir, "frozen.mp4"), { allow: [{ from: 0.96, to: 1.56 }] }).verdict).toBe("PASS");
  }, 20_000);

  it("passes a moving picture with every frame present", () => {
    const r = freezeCheck(path.join(dir, "zoom.mp4"));
    expect(r).toMatchObject({ verdict: "PASS", freezes: [] });
    expect(r.frames).toMatchObject({ decoded: 75, expected: 75, gaps: [] });
  }, 20_000);

  it("fails dropped frames: fewer decoded than duration x fps, and a hole in pts", () => {
    const r = freezeCheck(path.join(dir, "dropped.mp4"));
    expect(r.verdict).toBe("FAIL");
    expect(r.frames.decoded).toBe(45);
    expect(r.frames.expected).toBe(50);
    expect(r.frames.gaps).toHaveLength(1);
    expect(r.frames.gaps[0].frames_missing).toBe(5);
  }, 20_000);

  it("CLI exits 1 on a short shot and 0 on a clean file", () => {
    const bad = spawnSync(process.execPath, [cli, path.join(dir, "short.mp4")], { encoding: "utf8" });
    expect(bad.status, bad.stderr).toBe(1);
    expect(bad.stdout).toMatch(/short-shot \(< 0.75 s\): FAIL/);
    const good = spawnSync(process.execPath, [cli, path.join(dir, "zoom.mp4"), "--json"], { encoding: "utf8" });
    expect(good.status, good.stderr).toBe(0);
    expect(JSON.parse(good.stdout)[0].verdict).toBe("PASS");
  }, 30_000);
});
