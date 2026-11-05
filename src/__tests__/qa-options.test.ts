import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/", import.meta.url));
const { resolveQaOptions, mixMode, DEFAULT_LUFS } = (await import(pathToFileURL(path.join(scripts, "qa-options.mjs")).href)) as {
  resolveQaOptions: (argv: string[], storyboard?: unknown) => { ratio?: string; duration?: number; mode: string; lufs?: number; sources: Record<string, string>; notes: string[] };
  mixMode: (storyboard: unknown) => string | undefined;
  DEFAULT_LUFS: number;
};

const sb = (audio: unknown, extra: Record<string, unknown> = {}) => ({ format: { ratio: "4:5" }, duration: 12, audio, ...extra });
const music = { file: "bed.wav" };

describe("QA options without a storyboard", () => {
  it("keeps the previous behaviour: flags only, -14 default, mix mode", () => {
    const o = resolveQaOptions(["ad.mp4", "--ratio", "9:16", "--duration", "15"]);
    expect(o).toMatchObject({ ratio: "9:16", duration: 15, mode: "mix", lufs: DEFAULT_LUFS });
    expect(o.sources).toMatchObject({ ratio: "flag", duration: "flag", lufs: "default", mode: "default" });
    expect(resolveQaOptions(["ad.mp4", "--lufs", "-16"]).lufs).toBe(-16);
    expect(resolveQaOptions(["ad.mp4", "--silent"]).mode).toBe("silent");
    expect(resolveQaOptions(["ad.mp4", "--effects-only"]).mode).toBe("effects-only");
  });

  it("rejects a non-numeric loudness target or a non-positive duration", () => {
    expect(() => resolveQaOptions(["ad.mp4", "--lufs", "loud"])).toThrow(/--lufs needs a number/);
    expect(() => resolveQaOptions(["ad.mp4", "--duration", "0"])).toThrow(/--duration needs a positive number/);
  });
});

describe("QA options from the storyboard", () => {
  it("takes ratio, duration and the declared loudness target the renderer used", () => {
    const o = resolveQaOptions(["ad.mp4"], sb({ music, lufs: -16 }));
    expect(o).toMatchObject({ ratio: "4:5", duration: 12, mode: "mix", lufs: -16 });
    expect(o.sources).toMatchObject({ ratio: "storyboard", duration: "storyboard", lufs: "storyboard", mode: "storyboard" });
    expect(o.notes).toEqual([]);
  });

  it("falls back to the -14 default when the storyboard declares no target", () => {
    const o = resolveQaOptions(["ad.mp4"], sb({ music }));
    expect(o.lufs).toBe(DEFAULT_LUFS);
    expect(o.sources.lufs).toBe("default");
  });

  it("lets an explicit flag win and says so when it differs", () => {
    const o = resolveQaOptions(["ad.mp4", "--lufs", "-12", "--ratio", "9:16", "--duration", "12"], sb({ music, lufs: -16 }));
    expect(o).toMatchObject({ lufs: -12, ratio: "9:16", duration: 12 });
    expect(o.sources).toMatchObject({ lufs: "flag", ratio: "flag", duration: "flag" });
    expect(o.notes).toEqual(["--ratio 9:16 overrides the storyboard's 4:5", "--lufs -12 overrides the storyboard's -16"]);
  });

  it("classifies the mix the way the renderer does", () => {
    expect(mixMode(sb({ music }))).toBe("mix");
    expect(mixMode(sb({ voiceover: { file: "v.wav" } }))).toBe("mix");
    expect(mixMode(sb({ music: null, voiceover: null, sfx: [{ file: "e.ogg", at: 1 }] }))).toBe("effects-only");
    expect(mixMode(sb({ music: null, voiceover: null, sfx: [], silence_reason: "silent" }))).toBe("silent");
    expect(mixMode(sb(undefined))).toBeUndefined();
    expect(resolveQaOptions(["ad.mp4"], sb(undefined)).mode).toBe("mix");
    expect(resolveQaOptions(["ad.mp4"], sb({ music: null, sfx: [{ file: "e.ogg" }] })).mode).toBe("effects-only");
    expect(resolveQaOptions(["ad.mp4", "--silent"], sb({ music })).mode).toBe("silent");
  });

  it("does not ask a silent or effects-only mix for a loudness target", () => {
    expect(resolveQaOptions(["ad.mp4"], sb({ music: null, sfx: [] })).lufs).toBeUndefined();
  });
});

const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe.skipIf(!ffmpeg)("qa-video.mjs reads the same facts (real ffmpeg)", () => {
  function clip() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-video-"));
    dirs.push(dir);
    const file = path.join(dir, "ad.mp4");
    const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=400x500:d=1.5:r=15", "-f", "lavfi", "-i", "sine=f=440:d=1.5",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file], { encoding: "utf8" });
    expect(made.status, made.stderr).toBe(0);
    const storyboard = path.join(dir, "storyboard.json");
    fs.writeFileSync(storyboard, JSON.stringify(sb({ music, lufs: -20 }, { duration: 1.5 })));
    return { file, storyboard };
  }
  const qa = (...args: string[]) => {
    const r = spawnSync(process.execPath, [path.join(scripts, "qa-video.mjs"), ...args], { encoding: "utf8" });
    return { ...r, report: JSON.parse(r.stdout) as { options: { lufs: number; sources: Record<string, string>; notes: string[]; ratio: string }; results: { check: string; detail: string }[] } };
  };

  it("checks loudness against the storyboard's target and reports where it came from", () => {
    const { file, storyboard } = clip();
    const r = qa(file, "--storyboard", storyboard);
    const loud = r.report.results.find((x) => x.check === "loudness")!;
    expect(loud.detail).toMatch(/target -20 \+\/- 1 \(storyboard\)/);
    expect(r.report.options).toMatchObject({ lufs: -20, ratio: "4:5" });
    expect(r.report.results.find((x) => x.check === "format.ratio")!.detail).toContain("wanted 4:5");
    expect(r.report.results.find((x) => x.check === "format.duration")!.detail).toContain("wanted 1.5s");
  });

  it("lets --lufs override the storyboard and notes the override", () => {
    const { file, storyboard } = clip();
    const r = qa(file, "--storyboard", storyboard, "--lufs", "-9");
    expect(r.report.results.find((x) => x.check === "loudness")!.detail).toMatch(/target -9 \+\/- 1 \(flag\)/);
    expect(r.report.options.notes).toEqual(["--lufs -9 overrides the storyboard's -20"]);
  });

  it("stops with a clear error for an unreadable storyboard", () => {
    const { file } = clip();
    const r = spawnSync(process.execPath, [path.join(scripts, "qa-video.mjs"), file, "--storyboard", path.join(os.tmpdir(), "no-such-storyboard.json")], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("cannot read --storyboard");
  });
});
