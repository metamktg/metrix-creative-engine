import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  crossCheck, cutFrame, parseBlack, snapToFrame, timelineFacts,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/qa-video.mjs";

// Frame checks in qa-video.mjs: black frames, freeze with holds from the timeline, the short-shot
// gate on timeline shots, the scdet cross-check, and the stricter check at cuts.

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/", import.meta.url));
const qaVideo = path.join(scripts, "qa-video.mjs");
const docPath = path.join(scripts, "..", "references", "timeline.md");
const base = process.env.MCE_TEST_TMP || os.tmpdir();
const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

type Result = { check: string; verdict: string; detail: string; measured?: unknown };
type Report = { verdict: string; results: Result[]; timeline?: { cuts: number[]; holds: { from: number; to: number; shot: string }[] } };

/** The documented mce.timeline/1 example: 4.66 s at 30 fps, shots face (footage) 0-1.25, app 1.25-3.875, card 3.875-4.66 (compositions). */
function exampleTimeline() {
  const doc = fs.readFileSync(docPath, "utf8").replace(/\r\n/g, "\n");
  const sec = doc.split(/^## /m).slice(1).find((p) => p.startsWith("mce.timeline/1"))!;
  return JSON.parse([...sec.matchAll(/```json\n([\s\S]*?)\n```/g)][0][1]);
}

describe("pure helpers", () => {
  it("parses blackdetect runs and closes one open at EOF on the file duration", () => {
    const log = [
      "[blackdetect @ 0x1] black_start:0.5 black_end:0.533333 black_duration:0.0333333",
      "[blackdetect @ 0x1] black_start:0.8 black_end:0.966667 black_duration:0.166667",
    ].join("\n");
    expect(parseBlack(log, { duration: 1, fps: 30 })).toEqual([
      { start: 0.5, end: 0.533333, duration: 0.033333 },
      { start: 0.8, end: 1, duration: 0.2, open_at_eof: true },
    ]);
    expect(parseBlack("", { duration: 1, fps: 30 })).toEqual([]);
  });

  it("snaps a timeline time to the frame the cut lands on", () => {
    expect(cutFrame(3.438, 30)).toBe(104);
    expect(snapToFrame(3.438, 30)).toBeCloseTo(3.466667, 6);
    expect(cutFrame(snapToFrame(1.25, 30), 30)).toBe(38); // already snapped stays on its frame
    expect(cutFrame(4.2, 30)).toBe(126);
  });

  it("derives cuts, frame-snapped shots and holds (compositions only) from a timeline", () => {
    const f = timelineFacts(exampleTimeline(), { fps: 30, duration: 4.666667 });
    expect(f.cuts.map((c: number) => Math.round(c * 30))).toEqual([38, 117]);
    expect(f.shots.map((s: { id: string }) => s.id)).toEqual(["face", "app", "card"]);
    expect(f.shots[2].to).toBeCloseTo(4.666667, 6);
    expect(f.holds.map((h: { shot: string }) => h.shot)).toEqual(["app", "card"]);
    expect(f.holds[0].from).toBeCloseTo(38 / 30 - 1 / 60, 5);
  });

  it("refuses an invalid timeline", () => {
    const tl = exampleTimeline();
    tl.shots[1].out_in = 1.3; // shots no longer tile
    expect(() => timelineFacts(tl, { fps: 30, duration: 4.666667 })).toThrow(/not a valid mce.timeline\/1/);
  });

  it("cross-checks timeline cuts against scdet at one frame", () => {
    expect(crossCheck([1, 2], [1.03, 2.5], 30)).toEqual({ missing: [2], unexpected: [2.5] });
    expect(crossCheck([1], [1.0333], 30)).toEqual({ missing: [], unexpected: [] });
  });
});

describe.skipIf(!ffmpeg)("qa-video frame checks on real ffmpeg fixtures", () => {
  let dir = "";
  let tl = "";
  const TAGS = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-c:a", "aac", "-shortest"];
  // 140 frames at 30 fps: moving testsrc2 for frames 0-37 (the face shot), a still app screen from
  // frame 38, a still end card from frame 117. `face` is a blend expression deciding how the face shot meets the app screen.
  const make = (name: string, opts: { face?: string; black?: string; freeze?: [number, number] } = {}) => {
    const file = path.join(dir, `${name}.mp4`);
    // blend counts N one ahead of the decoded frame index (observed on ffmpeg 9.0.1): N < 39 puts the cut on decoded frame 38.
    const face = opts.face ?? "if(lt(N\\,39)\\,A\\,B)";
    const black = opts.black ? `,drawbox=enable='${opts.black}':c=black:t=fill` : "";
    const src = opts.freeze ? `testsrc2=s=160x288:r=30:d=4.6667,split[t1][t2];[t1][t2]freezeframes=first=${opts.freeze[0]}:last=${opts.freeze[1]}:replace=${opts.freeze[0]}[t];` : "testsrc2=s=160x288:r=30:d=4.6667[t];";
    const graph = `${src}color=c=0x3060a0:s=160x288:r=30:d=4.6667,drawbox=x=20:y=40:w=100:h=60:c=white:t=fill[b];` +
      `color=c=0xa04020:s=160x288:r=30:d=4.6667,drawbox=x=30:y=150:w=90:h=40:c=yellow:t=fill[c];[t][b]blend=all_expr='${face}'[x];[x][c]overlay=enable='gte(n,117)'${black}`;
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", graph, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=4.6667", ...TAGS, file], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return file;
  };
  const qa = (file: string, ...args: string[]) => {
    const r = spawnSync(process.execPath, [qaVideo, file, "--silent", ...args], { encoding: "utf8" });
    return { status: r.status, stderr: r.stderr, report: (r.stdout ? JSON.parse(r.stdout) : null) as Report };
  };
  const get = (rep: Report, check: string) => rep.results.find((x) => x.check === check)!;
  let good = "";

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "qa-video-black-"));
    tl = path.join(dir, "timeline.json");
    fs.writeFileSync(tl, JSON.stringify(exampleTimeline(), null, 2));
    good = make("good");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("passes a clean cut with the timeline: holds allowed, shots from the timeline, hard cuts", () => {
    const r = qa(good, "--timeline", tl);
    expect(r.status, r.stderr).toBe(0);
    expect(r.report.verdict).toBe("PASS");
    for (const c of ["black_frames", "freeze", "short_shot", "cuts.crosscheck", "transitions", "transitions.at_cuts"]) expect(get(r.report, c).verdict, c).toBe("PASS");
    expect(get(r.report, "freeze").detail).toMatch(/inside timeline holds \(app, card\)/);
    expect(get(r.report, "short_shot").detail).toMatch(/^3 shots from the timeline/);
  });

  it("fails the deliberate holds without a timeline, and never lowers the freeze threshold", () => {
    const r = qa(good);
    expect(r.status).toBe(1);
    const f = get(r.report, "freeze");
    expect(f.verdict).toBe("FAIL");
    expect(f.detail).toMatch(/no --timeline, so no hold ranges/);
    expect((f.measured as { noise: number; min_freeze: number })).toMatchObject({ noise: 0.001, min_freeze: 0.1 });
    expect(r.report.results.some((x) => x.check === "transitions.at_cuts")).toBe(false);
  });

  it("fails a single black frame and reports its time", () => {
    const r = qa(make("black", { black: "eq(n,20)" }), "--timeline", tl);
    const b = get(r.report, "black_frames");
    expect(b.verdict).toBe("FAIL");
    expect(b.measured).toEqual([{ start: expect.closeTo(20 / 30, 3), end: expect.closeTo(21 / 30, 3), duration: expect.closeTo(1 / 30, 3) }]);
    expect(r.status).toBe(1);
  });

  it("does not flag a frame whose black area is 20 % (rule: over 30 % under luma 10)", () => {
    const file = path.join(dir, "band.mp4");
    const r0 = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x200:r=30:d=1,drawbox=x=0:y=0:w=32:h=200:c=black:t=fill", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=1", ...TAGS, file], { encoding: "utf8" });
    expect(r0.status, r0.stderr).toBe(0);
    expect(get(qa(file).report, "black_frames").verdict).toBe("PASS");
  });

  it("fails a freeze inside a footage shot even with the timeline", () => {
    // Hold testsrc2 frame 5 for frames 5-20 of the face shot.
    const file = make("stall", { face: "if(lt(N\\,38)\\,A\\,B)" });
    const stalled = path.join(dir, "stall2.mp4");
    const r0 = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", "select='not(between(n\\,6\\,20))',setpts=N/30/TB,tpad=stop=0", "-af", "anull", ...TAGS.slice(0, -1), "-r", "30", "-fps_mode", "cfr", stalled], { encoding: "utf8" });
    expect(r0.status, r0.stderr).toBe(0);
    const r = qa(stalled, "--timeline", tl);
    const f = get(r.report, "freeze");
    expect(f.verdict).toBe("FAIL");
    expect(f.detail).toMatch(/freeze at 0\.\d\d-/);
  });

  it("applies the 0.75 s short-shot rule to timeline shots (end card 23 frames passes at 0.75, fails at 0.8)", () => {
    expect(get(qa(good, "--timeline", tl).report, "short_shot").verdict).toBe("PASS");
    const r = qa(good, "--timeline", tl, "--min-shot", "0.8");
    const s = get(r.report, "short_shot");
    expect(s.verdict).toBe("FAIL");
    expect(s.measured).toEqual([{ start: expect.closeTo(117 / 30, 5), end: expect.closeTo(140 / 30, 5), len: expect.closeTo(23 / 30, 5), shot: "card" }]);
  });

  it("catches a one-frame blend at a cut that the 15 fps full scan misses", () => {
    const r = qa(make("oneblend", { face: "if(lt(N\\,38)\\,A\\,if(gt(N\\,38)\\,B\\,(A+B)/2))" }), "--timeline", tl);
    expect(get(r.report, "transitions").verdict).toBe("PASS");
    const c = get(r.report, "transitions.at_cuts");
    expect(c.verdict).toBe("FAIL");
    expect(c.detail).toMatch(/is a blend of the shots either side of the cut at 1\.267 s/);
  });

  it("fails a cut that lands away from the timeline's cut and warns on the scdet disagreement", () => {
    const r = qa(make("late", { face: "if(lt(N\\,45)\\,A\\,B)" }), "--timeline", tl);
    expect(get(r.report, "transitions.at_cuts").detail).toMatch(/no hard cut within one frame of 1\.267 s/);
    const x = get(r.report, "cuts.crosscheck");
    expect(x.verdict).toBe("WARN");
    expect(x.detail).toMatch(/timeline cuts scdet did not see: 1\.267; scdet cuts not in the timeline: 1\.(467|500)/);
  });

  it("stops with exit 2 on an invalid timeline", () => {
    const bad = path.join(dir, "bad-timeline.json");
    const t = exampleTimeline();
    delete t.shots;
    fs.writeFileSync(bad, JSON.stringify(t));
    const r = spawnSync(process.execPath, [qaVideo, good, "--silent", "--timeline", bad], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not a valid mce.timeline\/1/);
  });
});
