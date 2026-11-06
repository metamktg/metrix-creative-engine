import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULTS, closures, eyeGate, eyeState, loadEyeState, rangesFromShots, resolvePython, scoreClip,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/media/eye-state.mjs";
// @ts-expect-error plain ESM helper without type declarations
import { attachScores, loadScores } from "../../skills/metrix-video-assembly/scripts/media/eye-sheet.mjs";

// Real MediaPipe output (eye_state.py, face_landmarker float16/1, VIDEO mode) for two takes from a past AI UGC run.
// The footage is not committed; the scores are, so CI needs neither MediaPipe nor the clips.
const fx = (f: string) => fileURLToPath(new URL(`./fixtures/eye-state/${f}`, import.meta.url));
const S3H = JSON.parse(fs.readFileSync(fx("v19_S3H_phonegrade.scores.json"), "utf8"));
const S1 = JSON.parse(fs.readFileSync(fx("v17_S1_phonegrade.scores.json"), "utf8"));
const CAL = JSON.parse(fs.readFileSync(fx("calibration.json"), "utf8"));
const SCRIPT = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/media/eye-state.mjs", import.meta.url));
const base = process.env.MCE_TEST_TMP || os.tmpdir();

type Finding = { severity: string; rule: string; range: string; edge?: string; cut?: number; closure?: { from: number; to: number } };
type Gate = { verdict: string; findings: Finding[]; thresholds: { edge_frames: number } };
const rules = (g: Gate) => g.findings.map((f) => `${f.severity} ${f.rule}${f.closure ? ` ${f.closure.from.toFixed(2)}` : ""}`);

const synth = (levels: (number | null)[], fps = 25) => ({
  schema: "mce.eyestate/1",
  fps,
  frames: levels.map((v, n) => ({ n, t: Math.round((n / fps) * 1e6) / 1e6, eyeBlinkLeft: v, eyeBlinkRight: v, face_found: v != null })),
});

describe("closures (hysteresis on the weaker eye)", () => {
  it("finds the recorded v19 S3H closure and the requested wink, nothing else", () => {
    const cs = closures(S3H.frames);
    expect(cs.map((c: { from: number; to: number }) => [c.from, c.to])).toEqual([[0.48, 0.68], [2.8, 3.0]]);
    expect(cs[0].peak.t).toBe(0.52);
  });

  it("needs a core frame at close; a run that only reaches open is not a closure; no face breaks a run", () => {
    const f = synth([0.1, 0.35, 0.35, 0.1, 0.35, 0.45, 0.35, 0.1, 0.5, null, 0.5, 0.1]).frames;
    expect(closures(f).map((c: { n0: number; n1: number }) => [c.n0, c.n1])).toEqual([[4, 6], [8, 8], [10, 10]]);
    // Both eyes must reach the level: one closed eye (a wink) is not a closure.
    const wink = [{ n: 0, t: 0, eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1, face_found: true }];
    expect(closures(wink)).toEqual([]);
    expect(() => closures(f, { close: 0.2, open: 0.3 })).toThrow(/open <= close/);
  });

  it("defaults are the calibrated values recorded in calibration.json", () => {
    expect(DEFAULTS.close).toBe(CAL.chosen.close);
    expect(DEFAULTS.open).toBe(CAL.chosen.open);
    expect(DEFAULTS.edgeSeconds).toBe(CAL.chosen.edge_seconds);
    expect(CAL.chosen.named_windows_found).toBe("3/3");
    expect(eyeGate(synth(Array(40).fill(0.1), 25), { ranges: [{ from: 0, to: 1 }] }).thresholds.edge_frames).toBe(3);
    expect(eyeGate(synth(Array(40).fill(0.1), 30), { ranges: [{ from: 0, to: 1 }] }).thresholds.edge_frames).toBe(4);
  });
});

describe("eyeGate on real scores from a past run", () => {
  it("v19 S3H: the reject window inside the kept range FAILs at its head edge", () => {
    const g: Gate = eyeGate(S3H, { ranges: [{ id: "H", from: 0.4, to: 4.169 }] });
    expect(g.verdict).toBe("FAIL");
    expect(rules(g)).toEqual(["FAIL edge_closure 0.48", "WARN mid_closure 2.80"]);
    expect(g.findings[0].edge).toBe("head");
  });

  it("v19 S3H: the owner-passed kept range (reject window excluded) has no FAIL; only the mid-range wink WARNs", () => {
    const g: Gate = eyeGate(S3H, { ranges: [{ id: "H", from: 0.809, to: 4.169 }] });
    expect(g.verdict).toBe("WARN");
    expect(rules(g)).toEqual(["WARN mid_closure 2.80"]);
    expect(eyeGate(S3H, { ranges: [{ from: 0.809, to: 2.6 }] }).verdict).toBe("PASS");
    // The first frame after the recorded window (0.42 to 0.72) is clean.
    expect(eyeGate(S3H, { ranges: [{ from: 0.72, to: 2.6 }] }).verdict).toBe("PASS");
  });

  it("a closure that runs off the tail of a range FAILs", () => {
    const g: Gate = eyeGate(S3H, { ranges: [{ from: 1.0, to: 2.84 }] });
    expect(rules(g)).toEqual(["FAIL edge_closure 2.80"]);
    expect(g.findings[0].edge).toBe("tail");
  });

  it("v17 S1: the punch-in on closed lids FAILs as a cut closure, the eye-close on 'exam' at the tail FAILs", () => {
    const g: Gate = eyeGate(S1, { ranges: [{ id: "pC", from: 0.175, to: 3.222 }], cuts: [1.6595] });
    expect(rules(g)).toEqual(["WARN mid_closure 0.56", "FAIL cut_closure 1.44", "FAIL edge_closure 2.92"]);
    expect(g.findings[1].cut).toBe(1.6595);
  });

  it("v19 S1: the owner-passed punch-in after the blink passes the cut check; the blink itself WARNs", () => {
    const g: Gate = eyeGate(S1, { ranges: [{ id: "pC", from: 1.048, to: 2.844 }], cuts: [1.829] });
    expect(rules(g)).toEqual(["WARN mid_closure 1.44"]);
    // With a 5-frame edge the same cut FAILs: the edge width is what calibration.json records.
    expect(eyeGate(S1, { ranges: [{ from: 1.048, to: 2.844 }], cuts: [1.829], edgeFrames: 5 }).verdict).toBe("FAIL");
  });

  it("the calibration record matches what the gate says now", () => {
    for (const [k, v] of Object.entries(CAL.edits_checked as Record<string, { verdict: string }>)) {
      const rec = k.startsWith("v19 S3H") ? S3H : k.includes("S1") ? S1 : null;
      if (!rec) continue; // the S3 scores are not committed
      const nums = [...k.matchAll(/(\d+\.\d+)-(\d+\.\d+)/g)].map((m) => ({ from: Number(m[1]), to: Number(m[2]) }));
      const cut = /cut (\d+\.\d+)/.exec(k);
      expect(eyeGate(rec, { ranges: nums, cuts: cut ? [Number(cut[1])] : [] }).verdict, k).toBe(v.verdict);
    }
  });
});

describe("eyeGate coverage rules", () => {
  it("FAILs a range the record does not cover", () => {
    const g: Gate = eyeGate(S3H, { ranges: [{ from: 4.0, to: 6.0 }] });
    expect(g.verdict).toBe("FAIL");
    expect(g.findings[0].rule).toBe("unscored");
  });

  it("no face at an edge FAILs by default, WARNs with noFace warn; mid-range it WARNs", () => {
    const lv = Array(25).fill(0.1);
    lv[0] = null;
    expect(rules(eyeGate(synth(lv), { ranges: [{ from: 0, to: 1 }] }))).toEqual(["FAIL no_face"]);
    expect(rules(eyeGate(synth(lv), { ranges: [{ from: 0, to: 1 }], noFace: "warn" }))).toEqual(["WARN no_face"]);
    const mid = Array(25).fill(0.1);
    mid[12] = null;
    expect(rules(eyeGate(synth(mid), { ranges: [{ from: 0, to: 1 }] }))).toEqual(["WARN no_face"]);
  });

  it("rejects bad input", () => {
    expect(() => loadEyeState({ schema: "x", fps: 25, frames: [] })).toThrow(/mce.eyestate\/1/);
    expect(() => loadEyeState({ schema: "mce.eyestate/1", fps: 25, frames: [{ t: 0, face_found: true, eyeBlinkLeft: null, eyeBlinkRight: 0.1 }] })).toThrow(/no blink scores/);
    expect(() => eyeGate(S3H, { ranges: [] })).toThrow(/needs ranges/);
    expect(() => eyeGate(S3H, { ranges: [{ from: 1, to: 1 }] })).toThrow(/from < to/);
    expect(() => eyeGate(S3H, { ranges: [{ from: 0, to: 1 }], noFace: "skip" })).toThrow(/noFace/);
  });

  it("takes the kept ranges of one clip from timeline shots[]", () => {
    const shots = [
      { id: "s1", file: "/m/a.mp4", src_in: 1.0, src_out: 2.0 },
      { id: "s2", file: "/m/b.mp4", src_in: 0, src_out: 1 },
      { id: "s3", file: "/m/a.mp4", src_in: 2.0, src_out: 2.8 },
    ];
    expect(rangesFromShots(shots, "/m/a.mp4")).toEqual([{ id: "s1", from: 1, to: 2 }, { id: "s3", from: 2, to: 2.8 }]);
  });
});

describe("scores sources", () => {
  it("refuses scores made from a different file", () => {
    const dir = fs.mkdtempSync(path.join(base, "eye-state-"));
    const clip = path.join(dir, "other.mp4");
    fs.writeFileSync(clip, "not the scored clip");
    expect(() => eyeState(clip, { scores: fx("v19_S3H_phonegrade.scores.json") })).toThrow(/different file/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("finds the interpreter from MCE_PY312 or INSTALLED.json, and says so when there is none", () => {
    const dir = fs.mkdtempSync(path.join(base, "eye-py-"));
    const venv = path.join(dir, "venv312");
    fs.mkdirSync(path.join(venv, "Scripts"), { recursive: true });
    fs.writeFileSync(path.join(venv, "Scripts", "python.exe"), "");
    const installed = path.join(dir, "INSTALLED.json");
    fs.writeFileSync(installed, JSON.stringify({ tools: [{ name: "venv312", file_path: venv }] }));
    expect(resolvePython({ MCE_INSTALLED: installed })).toBe(path.join(venv, "Scripts", "python.exe"));
    expect(resolvePython({ MCE_PY312: path.join(dir, "missing.exe") })).toBeNull();
    expect(resolvePython({ MCE_INSTALLED: path.join(dir, "none.json") })).toBeNull();
    expect(() => scoreClip("x.mp4", { out: path.join(dir, "s.json"), python: null })).toThrow(/no Python 3.12/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("eye-sheet's scores hook reads an eye-state record directly", () => {
    const list = loadScores(fx("v19_S3H_phonegrade.scores.json"));
    expect(list).toHaveLength(125);
    expect(list[12]).toMatchObject({ t_src: 0.48, face_found: true });
    const out = attachScores([{ i: 0, t_src: 0.52 }], list, { fps: 25 });
    expect(out[0].score).toMatchObject({ n: 13, eyeBlinkLeft: S3H.frames[13].eyeBlinkLeft });
  });
});

describe("CLI", () => {
  const run = (...a: string[]) => spawnSync(process.execPath, [SCRIPT, "absent.mp4", "--scores", fx("v19_S3H_phonegrade.scores.json"), ...a], { encoding: "utf8" });
  it("exits 1 on FAIL, 0 on WARN or PASS, 2 on a usage error", () => {
    const fail = run("--range", "0.40-4.169");
    expect(fail.status).toBe(1);
    expect(fail.stdout).toMatch(/FAIL edge_closure/);
    expect(run("--range", "0.809-4.169").status).toBe(0);
    const json = JSON.parse(run("--range", "0.809-2.6", "--json").stdout);
    expect(json.verdict).toBe("PASS");
    expect(run("--range", "nope").status).toBe(2);
  });
});

// Runs only where the MediaPipe venv exists (not on CI): scores a generated clip with no face.
const py = resolvePython();
describe.skipIf(!py)("eye_state.py with MediaPipe (local only)", () => {
  it("scores every decoded frame and reports no face on a test pattern", () => {
    const dir = fs.mkdtempSync(path.join(base, "eye-mp-"));
    const clip = path.join(dir, "pattern.mp4");
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x120:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const rec = scoreClip(clip, { out: path.join(dir, "s.json"), python: py });
    expect(rec.frame_count).toBe(25);
    expect(rec.frames.map((f: { t: number }) => f.t)).toEqual(Array.from({ length: 25 }, (_, i) => i * 0.04).map((t) => Math.round(t * 1e6) / 1e6));
    expect(rec.faces_found).toBe(0);
    expect(eyeGate(rec, { ranges: [{ from: 0, to: 1 }] }).findings[0].rule).toBe("no_face");
    fs.rmSync(dir, { recursive: true, force: true });
  }, 180_000);
});
