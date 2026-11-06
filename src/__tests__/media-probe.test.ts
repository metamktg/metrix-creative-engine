import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error plain ESM helper without type declarations
import { MediaError, parseFramePts, parseProbe, parseRate, probe } from "../../skills/metrix-video-assembly/scripts/media/probe.mjs";

// Fixtures are generated with lavfi under MCE_TEST_TMP (default the OS temp folder).
const base = process.env.MCE_TEST_TMP || os.tmpdir();

describe("probe parser", () => {
  it("reads rates as rationals and rejects 0/0", () => {
    expect(parseRate("25/1")).toBe(25);
    expect(parseRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseRate("0/0")).toBeNull();
    expect(parseRate(undefined)).toBeNull();
  });

  it("maps ffprobe JSON to video and audio facts, and ignores cover art", () => {
    const facts = parseProbe({
      format: { duration: "18.133333" },
      streams: [
        { codec_type: "video", width: 600, height: 600, r_frame_rate: "90000/1", disposition: { attached_pic: 1 } },
        { codec_type: "video", width: 1080, height: 1920, r_frame_rate: "30/1", avg_frame_rate: "30/1", nb_frames: "544", duration: "18.133333", pix_fmt: "yuv420p", start_time: "0.000000" },
        { codec_type: "audio", sample_rate: "48000", channels: 2, duration: "18.130000" },
      ],
    });
    expect(facts).toEqual({
      format: { duration: 18.133333 },
      video: { w: 1080, h: 1920, fps: 30, avg_fps: 30, nb_frames: 544, duration: 18.133333, start_time: 0, pix_fmt: "yuv420p" },
      audio: { sr: 48000, ch: 2, duration: 18.13 },
    });
    expect(parseProbe({ format: { duration: "2.0" }, streams: [{ codec_type: "audio", sample_rate: "44100", channels: 1 }] }))
      .toEqual({ format: { duration: 2 }, video: null, audio: { sr: 44100, ch: 1, duration: 2 } });
  });

  it("reads one pts per line and skips blanks", () => {
    expect(parseFramePts("0.000000,\n0.040000\n\nN/A\n0.080000\n")).toEqual([0, 0.04, 0.08]);
  });
});

describe("probe on a real file", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "media-probe-"));
    // testsrc2 2.0 s at 25 fps with a 1.9 s sine: the audio ends before the picture.
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=160x120:r=25:d=2", "-f", "lavfi", "-i", "sine=f=440:d=1.9:sample_rate=48000",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(dir, "av.mp4")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    fs.writeFileSync(path.join(dir, "not-media.mp4"), "this is text, not a video");
  }, 30_000);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("reports picture and sound lengths separately", () => {
    const f = probe(path.join(dir, "av.mp4"));
    expect(f.video).toMatchObject({ w: 160, h: 120, fps: 25, nb_frames: 50, pix_fmt: "yuv420p" });
    expect(f.video.duration).toBeCloseTo(2.0, 2);
    expect(f.audio.sr).toBe(48000);
    expect(f.audio.duration).toBeCloseTo(1.9, 1);
    // The A/V length check: the picture runs longer than the sound in this fixture.
    expect(f.video.duration - f.audio.duration).toBeGreaterThan(0.05);
  }, 15_000);

  it("throws MediaError UNREADABLE for a file that is not media", () => {
    let err: unknown;
    try { probe(path.join(dir, "not-media.mp4")); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(MediaError);
    expect((err as { code: string }).code).toBe("UNREADABLE");
  }, 15_000);

  it("throws MediaError ENOFFPROBE when ffprobe is not installed", () => {
    expect(() => probe(path.join(dir, "av.mp4"), { bin: "ffprobe-not-installed-mce" })).toThrow(expect.objectContaining({ code: "ENOFFPROBE" }));
  });
});
