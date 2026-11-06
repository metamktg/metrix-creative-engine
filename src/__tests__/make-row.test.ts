import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/", import.meta.url));
const runs: string[] = [];
afterEach(() => runs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

type Track = { file: string; [key: string]: unknown };
type Audio = { music?: Track | null; voiceover?: Track | null; sfx?: Track[]; [key: string]: unknown };
const tracks = (audio?: Audio | null): Track[] => [audio?.music, audio?.voiceover, ...(audio?.sfx || [])].filter((track): track is Track => Boolean(track?.file));
const audioVariants: [string, () => Audio | null | undefined][] = [
  ["omitted audio", () => undefined],
  ["null audio", () => null],
  ["intentional silence", () => ({ music: null, voiceover: null, sfx: [], silence_reason: "silent fixture" })],
  ["voiceover only", () => ({ voiceover: { file: "speech.wav", at: 0, script: "See it" } })],
  ["effects only", () => ({ sfx: [{ file: "effect.ogg", at: 1 }] })],
];

function fixture(audio: (base: string, root: string) => Audio | null | undefined) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-row-test-"));
  runs.push(root);
  const base = path.join(root, "base");
  const out = path.join(root, "row");
  fs.mkdirSync(path.join(base, "composition"), { recursive: true });
  fs.writeFileSync(path.join(base, "composition", "index.html"), '<h1 data-text="hook">Look closer</h1>');
  const sb = {
    name: "base", format: { ratio: "4:5", width: 1080, height: 1350, fps: 30 },
    duration: 6, poster_at: 0.5, slot: { scene: "s1" }, audio: audio(base, root),
    scenes: [
      { id: "s1", role: "hook", start: 0, end: 3, text: [{ id: "hook", copy: "Look closer", source: "copy_architecture.hook", in: 0, out: 3, enter: "none" }] },
      { id: "s2", role: "cta", start: 3, end: 6, text: [
        { id: "cta", copy: "Find yours", source: "copy_architecture.cta", in: 3, out: 6, enter: "none" },
      ] },
    ],
  };
  if (sb.audio?.voiceover) sb.scenes[1].text.push({ id: "vo", copy: "See it", source: "voiceover", in: 3, out: 6, enter: "none" });
  for (const [i, track] of tracks(sb.audio).entries()) {
    const source = path.resolve(base, track.file);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, `audio fixture ${i}: ${track.file}`);
  }
  // "See it" is the voiced line: strict grounding reads it from the brief, not from audio.voiceover.script.
  const brief = { copy_architecture: { hook: "Look closer", cta: "Find yours", voiceover: "See it" }, testing_framework: {
    matrix_naming_convention: "cell-{UniqueID}", cells: [{ unique_id: "a", hook: "Look closer" }, { unique_id: "b", hook: "Meet something" }],
  } };
  fs.writeFileSync(path.join(base, "storyboard.json"), JSON.stringify(sb));
  const briefPath = path.join(root, "brief.json");
  fs.writeFileSync(briefPath, JSON.stringify(brief));
  const make = () => spawnSync(process.execPath, [path.join(scripts, "make-row.mjs"), "--base", base, "--brief", briefPath, "--out", out], { encoding: "utf8" });
  return { root, base, out, sb, briefPath, make };
}

describe("make-row audio dependencies", () => {
  it.each(["wav", "mp3"])("packages storyboard-relative music (%s) into every valid cell", (ext) => {
    const f = fixture(() => ({ music: { file: `media/bed.${ext}`, start: 0.25, volume: 0.3, licence: "anonymous fixture" }, voiceover: null, sfx: [], lufs: -16 }));
    const result = f.make();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(f.base, "storyboard.json"), "utf8"))).toEqual(f.sb);
    const original = fs.readFileSync(path.resolve(f.base, f.sb.audio!.music!.file));
    const relocated = path.join(f.root, "relocated");
    fs.renameSync(f.out, relocated);
    fs.rmSync(f.base, { recursive: true });
    for (const name of ["cell-a", "cell-b"]) {
      const dir = path.join(relocated, name);
      const sb = JSON.parse(fs.readFileSync(path.join(dir, "storyboard.json"), "utf8"));
      expect(fs.readFileSync(path.resolve(dir, sb.audio.music.file))).toEqual(original);
      expect({ ...sb.audio.music, file: f.sb.audio!.music!.file }).toEqual(f.sb.audio!.music);
      const check = spawnSync(process.execPath, [path.join(scripts, "check-storyboard.mjs"), path.join(dir, "storyboard.json"), "--brief", f.briefPath], { encoding: "utf8" });
      expect(check.status, check.stdout + check.stderr).toBe(0);
    }
  });

  it("packages music, voiceover and every effect, including absolute and parent paths, without escaping the cell", () => {
    const f = fixture((_base, root) => ({
      music: { file: "../shared/track.wav", volume: 0.25, licence: "anonymous fixture" },
      voiceover: { file: path.join(root, "voice", "track.wav"), at: 0.1, volume: 0.9, script: "See it" },
      sfx: [
        { file: "composition/media/click.ogg", at: 2, volume: 0.2 },
        { file: "../shared-external/track.wav", at: 4, volume: 0.3 },
      ],
    }));
    const original = tracks(f.sb.audio).map((t) => fs.readFileSync(path.resolve(f.base, t.file)));
    const result = f.make();
    expect(result.status, result.stderr).toBe(0);
    for (const name of ["cell-a", "cell-b"]) {
      const check = spawnSync(process.execPath, [path.join(scripts, "check-storyboard.mjs"), path.join(f.out, name, "storyboard.json"), "--brief", f.briefPath], { encoding: "utf8" });
      expect(check.status, check.stdout + check.stderr).toBe(0);
    }
    // Copy only generated cells to a different root, then remove every source.
    const moved = fs.mkdtempSync(path.join(os.tmpdir(), "make-row-moved-"));
    runs.push(moved);
    fs.cpSync(f.out, moved, { recursive: true });
    for (const t of tracks(f.sb.audio)) fs.rmSync(path.resolve(f.base, t.file));
    fs.rmSync(f.root, { recursive: true });
    for (const name of ["cell-a", "cell-b"]) {
      const dir = path.join(moved, name);
      const sb = JSON.parse(fs.readFileSync(path.join(dir, "storyboard.json"), "utf8"));
      const copied = tracks(sb.audio);
      expect(copied).toHaveLength(original.length);
      copied.forEach((track, i) => {
        const resolved = path.resolve(dir, track.file);
        expect(path.relative(dir, resolved).startsWith(`..${path.sep}`)).toBe(false);
        expect(path.isAbsolute(track.file)).toBe(false);
        expect(fs.readFileSync(resolved)).toEqual(original[i]);
        expect({ ...track, file: tracks(f.sb.audio)[i].file }).toEqual(tracks(f.sb.audio)[i]);
      });
      expect(fs.readFileSync(path.join(dir, "composition", "index.html"), "utf8")).toContain(name === "cell-a" ? "Look closer" : "Meet something");
    }
    const check = spawnSync(process.execPath, [path.join(scripts, "check-storyboard.mjs"), "--row", ...["cell-a", "cell-b"].map((name) => path.join(moved, name, "storyboard.json"))], { encoding: "utf8" });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it.each(audioVariants)("preserves %s", (_name, audio) => {
    const f = fixture(audio);
    const result = f.make();
    expect(result.status, result.stderr).toBe(0);
    for (const name of ["cell-a", "cell-b"]) {
      const dir = path.join(f.out, name);
      const sb = JSON.parse(fs.readFileSync(path.join(dir, "storyboard.json"), "utf8"));
      expect(tracks(sb.audio)).toHaveLength(tracks(f.sb.audio).length);
      tracks(sb.audio).forEach((track) => expect(fs.existsSync(path.resolve(dir, track.file))).toBe(true));
      if (!tracks(f.sb.audio).length) expect(sb.audio).toEqual(f.sb.audio);
    }
  });

  it("fails before creating cells when a referenced dependency is missing", () => {
    const f = fixture(() => ({ music: { file: "media/missing.wav" } }));
    fs.rmSync(path.resolve(f.base, f.sb.audio!.music!.file));
    const result = f.make();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot read audio input");
    expect(fs.existsSync(f.out)).toBe(false);
  });
});
