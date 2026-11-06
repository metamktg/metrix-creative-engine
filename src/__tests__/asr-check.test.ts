import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  chainSummary, checkStage, finalSilenceStart, hygiene, isJunk, loadAliases, parseWhisperCli, parseWordsFile,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../skills/metrix-video-assembly/scripts/asr-check.mjs";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/asr-check.mjs", import.meta.url));
const base = process.env.MCE_TEST_TMP || os.tmpdir();
const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
type W = { text: string; start: number; end: number; p?: number | null };
const w = (text: string, start: number, end = start + 0.3, p: number | null = null): W => ({ text, start, end, p });

// whisper-cli -ojf -ml 1 -sow --dtw shape (whisper.cpp v1.9.5, observed 2026-11-06): segments of one
// word, special tokens like [_BEG_] and [_TT_n] carry t_dtw -1, t_dtw is in 10 ms units.
const tok = (text: string, p: number, t_dtw: number) => ({ text, p, t_dtw, offsets: { from: 0, to: 0 } });
const cliJson = {
  transcription: [
    { offsets: { from: 0, to: 100 }, text: "", tokens: [tok("[_BEG_]", 0.99, -1)] },
    { offsets: { from: 40, to: 570 }, text: " Spend", tokens: [tok(" Sp", 0.8, 20), tok("end", 0.95, 38)] },
    { offsets: { from: 570, to: 1210 }, text: " time.", tokens: [tok(" time", 0.4, 66), tok(".", 0.7, 114), tok("[_TT_60]", 0.2, -1)] },
  ],
};

describe("pure rules", () => {
  it("reads whisper-cli words with DTW start, segment end and the lowest token probability", () => {
    expect(parseWhisperCli(cliJson)).toEqual([
      { text: "Spend", start: 0.2, end: 0.57, seg_start: 0.04, p: 0.8, dtw: true },
      { text: "time.", start: 0.66, end: 1.21, seg_start: 0.57, p: 0.4, dtw: true },
    ]);
    expect(parseWordsFile(JSON.stringify(cliJson)).format).toBe("whisper-cli");
    expect(parseWordsFile('{"start":0,"end":300,"text":"Spend"}\n{"start":300,"end":600,"text":"time."}').format).toBe("ffmpeg-whisper");
  });

  it("classes bracketed tags, music notes and bare punctuation as junk", () => {
    for (const j of ["[BLANK_AUDIO]", "(music)", "♪", "-", "..."]) expect(isJunk(j), j).toBe(true);
    for (const ok of ["Spend", "it's", "4"]) expect(isJunk(ok), ok).toBe(false);
  });

  it("finds the final silence only when the last silence runs to the end", () => {
    expect(finalSilenceStart("silence_start: 0.5\nsilence_end: 0.9\nsilence_start: 2.2\n", 3)).toBe(2.2);
    expect(finalSilenceStart("silence_start: 2.2\nsilence_end: 2.995\n", 3)).toBe(2.2);
    expect(finalSilenceStart("silence_start: 1.0\nsilence_end: 1.8\n", 3)).toBeNull();
    expect(finalSilenceStart("", 3)).toBeNull();
  });

  it("drops a word that starts in the final silence and keeps one that starts before it", () => {
    const h = hygiene([w("Spend", 0.2), w("time", 1.9), w("thanks", 2.4)], { finalSilence: 2.2 });
    expect(h.kept.map((x: W) => x.text)).toEqual(["Spend", "time"]);
    expect(h.dropped).toEqual([expect.objectContaining({ text: "thanks", reason: "starts in the final silence" })]);
  });

  it("fails a transcript with more than 20 % junk tokens; exactly 20 % passes with the junk dropped", () => {
    const four = [w("a", 0), w("b", 1), w("c", 2), w("d", 3)];
    const at20 = hygiene([...four, w("[BLANK_AUDIO]", 4)]);
    expect(at20.failed).toBe(false);
    expect(at20.junk).toEqual({ count: 1, total: 5, ratio: 0.2 });
    expect(at20.kept).toHaveLength(4);
    expect(hygiene([...four, w("[BLANK_AUDIO]", 4), w("(music)", 5)]).failed).toBe(true);
  });

  it("'send' heard for 'spend' is a MISMATCH naming both words", () => {
    const r = checkStage({ script: "Spend that quiet time.", words: [w("Send", 0), w("that", 1), w("quiet", 2), w("time.", 3)] });
    expect(r.verdict).toBe("MISMATCH");
    expect(r.diffs).toEqual([{ type: "missing", word: "spend", index: 0 }, { type: "extra", word: "send", index: 0 }]);
  });

  it("a junk-heavy stage is TRANSCRIPT_FAILED even when the words match", () => {
    const r = checkStage({ script: "Spend time.", words: [w("Spend", 0), w("time.", 1), w("[BLANK_AUDIO]", 2)] });
    expect(r.verdict).toBe("TRANSCRIPT_FAILED");
  });

  it("validates the per-client alias file and lists the aliases that changed the text", () => {
    const a = loadAliases({ schema: "mce.asraliases/1", client: "Example Co", aliases: [{ heard: "Zen Trip", meant: "Zentrip", why: "brand split in two" }, { heard: "zen drip", meant: "zentrip", why: "seen once" }] });
    expect(a.pairs).toEqual(["zen trip=zentrip", "zen drip=zentrip"]);
    const r = checkStage({ script: "Try Zentrip today.", words: [w("Try", 0), w("Zen", 1), w("Trip", 1.3), w("today.", 2)], aliases: a });
    expect(r.verdict).toBe("MATCH");
    expect(r.aliases_applied).toEqual(["zen trip=zentrip"]);
    expect(() => loadAliases({ schema: "mce.asraliases/1", aliases: [] })).toThrow(/client/);
    expect(() => loadAliases({ schema: "mce.asraliases/1", client: "x", aliases: [{ heard: "a", meant: "b" }] })).toThrow(/why/);
    expect(() => loadAliases({ schema: "mce.asraliases/1", client: "x", aliases: [{ heard: "It's", meant: "its", why: "y" }] })).toThrow(/same/);
    expect(() => loadAliases({ schema: "other", client: "x", aliases: [] })).toThrow(/schema/);
  });

  it("names the first failing stage and the diffs each stage added", () => {
    const s = chainSummary([
      { stage: "raw", verdict: "MATCH", diffs: [] },
      { stage: "polish", verdict: "MISMATCH", diffs: [{ type: "missing", word: "spend" }, { type: "extra", word: "send" }] },
      { stage: "master", verdict: "MISMATCH", diffs: [{ type: "missing", word: "spend" }, { type: "extra", word: "send" }] },
    ]);
    expect(s.first_failing_stage).toBe("polish");
    expect(s.changes.map((c: { added: string[] }) => c.added)).toEqual([[], ["missing:spend", "extra:send"], []]);
  });
});

describe.skipIf(!ffmpeg)("asr-check CLI (saved words, real ffmpeg audio)", () => {
  let dir = "";
  const p = (n: string) => path.join(dir, n);
  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" });
    return { ...r, report: r.stdout ? JSON.parse(r.stdout) : null };
  };
  const words = (name: string, list: [string, number, number][]) => {
    fs.writeFileSync(p(name), list.map(([text, s, e]) => JSON.stringify({ start: s * 1000, end: e * 1000, text })).join("\n") + "\n");
    return p(name);
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(base, "asr-check-"));
    // 2 s of tone then 1 s of silence: the final silence starts at 2.0 s.
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=300:d=2:sample_rate=48000,apad=pad_dur=1", "-ac", "1", p("voice.wav")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    const v = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=64x64:r=10:d=3", "-i", p("voice.wav"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", p("ad.mp4")], { encoding: "utf8" });
    if (v.status !== 0) throw new Error(v.stderr);
    fs.writeFileSync(p("script.txt"), "Spend that time on Zentrip.\n");
    fs.writeFileSync(p("aliases.json"), JSON.stringify({ schema: "mce.asraliases/1", client: "Example Co", aliases: [{ heard: "zen trip", meant: "zentrip", why: "brand split in two" }] }));
    words("good.jsonl", [["Spend", 0.1, 0.4], ["that", 0.4, 0.6], ["time", 0.6, 0.9], ["on", 0.9, 1.0], ["Zen", 1.0, 1.3], ["Trip.", 1.3, 1.8], ["Thank", 2.3, 2.5], ["you.", 2.5, 2.8]]);
    words("send.jsonl", [["Send", 0.1, 0.4], ["that", 0.4, 0.6], ["time", 0.6, 0.9], ["on", 0.9, 1.0], ["Zen", 1.0, 1.3], ["Trip.", 1.3, 1.8]]);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("rejects --alias on the command line", () => {
    const r = run(["--script", p("script.txt"), "--alias", "send=spend", "--words", `voice=${p("send.jsonl")}`, `voice=${p("voice.wav")}`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--alias is not accepted: aliases come only from a per-client file/);
  });

  it("passes when every word is heard, drops the hallucination in the final silence, and records the alias file hash", () => {
    const r = run(["--script", p("script.txt"), "--aliases", p("aliases.json"), "--words", `voice=${p("good.jsonl")}`, `voice=${p("voice.wav")}`]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.report.verdict).toBe("MATCH");
    const s = r.report.stages[0];
    expect(s.final_silence_start).toBeCloseTo(2, 1);
    expect(s.dropped.map((d: { text: string }) => d.text)).toEqual(["Thank", "you."]);
    expect(s.aliases_applied).toEqual(["zen trip=zentrip"]);
    expect(r.report.aliases.sha256).toBe(sha(fs.readFileSync(p("aliases.json"))));
    expect(r.report.script.sha256).toBe(sha(fs.readFileSync(p("script.txt"))));
    expect(s.words_source).toMatchObject({ kind: "file", format: "ffmpeg-whisper" });
  });

  it("fails 'send' for 'spend' and names the first stage where it appeared (wav then mp4)", () => {
    const r = run(["--script", p("script.txt"), "--aliases", p("aliases.json"), "--words", `raw=${p("good.jsonl")}`, "--words", `master=${p("send.jsonl")}`, `raw=${p("voice.wav")}`, `master=${p("ad.mp4")}`]);
    expect(r.status).toBe(1);
    expect(r.report.verdict).toBe("FAIL");
    expect(r.report.first_failing_stage).toBe("master");
    expect(r.report.stages.map((s: { verdict: string }) => s.verdict)).toEqual(["MATCH", "MISMATCH"]);
    expect(r.stderr).toMatch(/master: MISMATCH \[script missing word "spend"\] \[script extra word "send"\]/);
  });

  it("without the client alias file the brand split is a mismatch (no built-in aliases)", () => {
    const r = run(["--script", p("script.txt"), "--words", `voice=${p("good.jsonl")}`, `voice=${p("voice.wav")}`]);
    expect(r.status).toBe(1);
    expect(r.report.aliases).toBeNull();
  });

  it("refuses a --words stage that is not an input", () => {
    const r = run(["--script", p("script.txt"), "--words", `nope=${p("good.jsonl")}`, `voice=${p("voice.wav")}`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not an input/);
  });
});
