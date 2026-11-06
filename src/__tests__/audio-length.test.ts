import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/", import.meta.url));
const qaVideo = path.join(scripts, "qa-video.mjs");
let dir = "";
const ff = (args: string[]) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
};
const streamDur = (file: string, type: "audio" | "video") => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", type === "audio" ? "a:0" : "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(r.stdout.trim());
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-length-"));
  ff(["-f", "lavfi", "-i", "sine=f=220:d=6:sample_rate=48000", "-ac", "2", path.join(dir, "bed.wav")]);
  ff(["-f", "lavfi", "-i", "sine=f=440:d=3:sample_rate=48000", "-ac", "2", path.join(dir, "voice.wav")]);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("render audio graph", () => {
  it("keeps the full ad length when the voice is shorter than the music bed", async () => {
    const { audioGraph } = await import(pathToFileURL(path.join(scripts, "audio-graph.mjs")).href);
    const sb = { audio: { music: { file: "bed.wav", volume: 0.3 }, voiceover: { file: "voice.wav", at: 0.5 } } };
    const { inputs, filter } = audioGraph(sb, dir, 6);
    const out = path.join(dir, "mix.wav");
    // Input 0 stands in for the video pipe the renderer feeds.
    ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=6", ...inputs, "-filter_complex", filter, "-map", "[aout]", out]);
    // Before the fix sidechaincompress ended with the 3.5 s voice and this was 3.5.
    expect(streamDur(out, "audio")).toBeCloseTo(6, 2);
  });
});

describe("qa-video audio.length", () => {
  const make = (name: string, audioSeconds: number) => {
    const file = path.join(dir, name);
    ff(["-f", "lavfi", "-i", "color=c=gray:s=160x200:r=30:d=2", "-f", "lavfi", "-i", `sine=f=300:d=${audioSeconds}:sample_rate=48000`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", file]);
    return file;
  };
  const check = (file: string) => {
    const r = spawnSync(process.execPath, [qaVideo, file], { encoding: "utf8" });
    return JSON.parse(r.stdout).results.find((x: { check: string }) => x.check === "audio.length");
  };

  it("fails a file whose audio stops before the picture", () => {
    const c = check(make("short.mp4", 1.5));
    expect(c.verdict).toBe("FAIL");
    expect(c.detail).toMatch(/audio 1\.5\d+s, video 2\.000s/);
  });

  it("passes a file whose audio runs the whole length", () => {
    expect(check(make("full.mp4", 2)).verdict).toBe("PASS");
  });
});
