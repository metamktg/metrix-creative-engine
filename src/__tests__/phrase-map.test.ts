import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM helper without type declarations
import { applyAliases, assignWords, normalize, parseWhisperWords, phrasesToSrt, scriptDiff, speechIslands } from "../../skills/metrix-video-assembly/scripts/phrase-align.mjs";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/phrase-map.mjs", import.meta.url));

describe("phrase-align helpers", () => {
  it("turns silencedetect output into speech islands, including a leading and trailing island", () => {
    const stderr = [
      "[silencedetect @ 0x1] silence_start: -0.002",
      "[silencedetect @ 0x1] silence_end: 1.000542 | silence_duration: 1.0",
      "[silencedetect @ 0x1] silence_start: 1.815292",
      "[silencedetect @ 0x1] silence_end: 2.841646 | silence_duration: 1.02",
    ].join("\n");
    expect(speechIslands(stderr, 4)).toEqual([{ start: 1.001, end: 1.815 }, { start: 2.842, end: 4 }]);
    expect(speechIslands("", 3)).toEqual([{ start: 0, end: 3 }]);
    // A trailing silence with no end runs to the file end.
    expect(speechIslands("silence_start: 2.5", 3)).toEqual([{ start: 0, end: 2.5 }]);
  });

  it("reads whisper JSON lines, including a line ffmpeg left unescaped", () => {
    const w = parseWhisperWords('{"start":880,"end":1340,"text":"Work\'s"}\n\n{"start":1400,"end":1700,"text":" "say "hi""}\n');
    expect(w).toEqual([{ text: "Work's", start: 0.88, end: 1.34 }, { text: '"say "hi"', start: 1.4, end: 1.7 }]);
  });

  it("assigns words to the island they start in, or the nearest one", () => {
    const islands = [{ start: 1, end: 2 }, { start: 3, end: 4 }];
    const p = assignWords(islands, [{ text: "a", start: 1.2, end: 1.5 }, { text: "b", start: 2.3, end: 2.6 }, { text: "c", start: 2.9, end: 3.4 }]);
    expect(p.map((x: { text: string }) => x.text)).toEqual(["a b", "c"]);
    expect(p[0].id).toBe("P1");
  });

  it("normalizes case, punctuation and apostrophes, and applies heard=meant aliases", () => {
    expect(normalize("Work's done, the KIDS!")).toBe("works done the kids");
    expect(applyAliases("take a look at north wind", ["North Wind=Northwind"])).toBe("take a look at northwind");
  });

  it("reports a substituted word as missing plus extra, and nothing when the take matches", () => {
    const script = "Spend that quiet time working on something specific.";
    expect(scriptDiff(script, "spend that quiet time working on something specific")).toEqual([]);
    expect(scriptDiff(script, "Send that quiet time working on something specific")).toEqual([
      { type: "missing", word: "spend", index: 0 },
      { type: "extra", word: "send", index: 0 },
    ]);
    expect(scriptDiff("a b c", "a c")).toEqual([{ type: "missing", word: "b", index: 1 }]);
    expect(scriptDiff("a b", "a b b")).toEqual([{ type: "extra", word: "b", index: 2 }]);
  });

  it("writes SRT cues from phrases, with script lines when given", () => {
    const phrases = [{ start: 1.0005, end: 1.815, text: "works done" }];
    expect(phrasesToSrt(phrases)).toBe("1\n00:00:01,001 --> 00:00:01,815\nworks done\n");
    expect(phrasesToSrt(phrases, ["Work's done."])).toContain("Work's done.");
  });
});

describe("phrase-map CLI", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "phrase-map-"));
    // Two tone bursts: 0.5-1.5 s and 2.5-3.5 s, silence around them, 4 s in all.
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "sine=f=440:d=4:sample_rate=48000,volume='if(between(t,0.5,1.5)+between(t,2.5,3.5),1,0)':eval=frame",
      path.join(dir, "voice.wav")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    fs.writeFileSync(path.join(dir, "words.jsonl"),
      ['{"start":520,"end":900,"text":"Spend"}', '{"start":900,"end":1500,"text":"time"}', '{"start":2550,"end":3400,"text":"North"}', '{"start":3000,"end":3500,"text":"wind."}'].join("\n"));
    fs.writeFileSync(path.join(dir, "script.txt"), "Spend time.\nNorthwind.\n");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (extra: string[]) => spawnSync(process.execPath, [tool, path.join(dir, "voice.wav"), "--words", path.join(dir, "words.jsonl"), ...extra], { encoding: "utf8" });

  it("finds the phrases, matches the script through an alias and writes the script text as captions", () => {
    const srt = path.join(dir, "out.srt");
    const out = path.join(dir, "out.json");
    const r = run(["--script", path.join(dir, "script.txt"), "--alias", "north wind=northwind", "--srt", srt, "--out", out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("script check: MATCH");
    const j = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(j.phrases.map((p: { start: number; end: number }) => [p.start, p.end])).toEqual([[0.5, 1.5], [2.5, 3.5]].map(([a, b]) => [expect.closeTo(a, 1), expect.closeTo(b, 1)]));
    expect(fs.readFileSync(srt, "utf8")).toMatch(/^1\n00:00:00,5\d\d --> 00:00:01,[45]\d\d\nSpend time\.\n\n2\n/);
  });

  it("exits 1 and names the word when the take does not say the script", () => {
    fs.writeFileSync(path.join(dir, "bad.jsonl"), fs.readFileSync(path.join(dir, "words.jsonl"), "utf8").replace("Spend", "Send"));
    const r = spawnSync(process.execPath, [tool, path.join(dir, "voice.wav"), "--words", path.join(dir, "bad.jsonl"), "--script", path.join(dir, "script.txt"), "--alias", "north wind=northwind"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('script missing word "spend"');
    expect(r.stderr).toContain('script extra word "send"');
  });

  it("fails without a model or a words file", () => {
    const env = { ...process.env };
    delete env.METRIX_WHISPER_MODEL;
    const r = spawnSync(process.execPath, [tool, path.join(dir, "voice.wav")], { encoding: "utf8", env });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no Whisper model");
  });
});
