import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/check-storyboard.mjs", import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onset-guard-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

type Rule = { rule: string; verdict: string; detail: string };
function onsets(sfxAt: number | null, withPhrases = true): Rule | undefined {
  const sb = {
    duration: 6,
    format: { ratio: "9:16" },
    scenes: [{ id: "s1", in: 0, out: 6, text: [] }],
    audio: { voiceover: { file: "voice.wav", at: 0.5 }, sfx: sfxAt === null ? [] : [{ file: "sfx/card-slide.ogg", at: sfxAt }] },
  };
  const sbFile = path.join(dir, `sb-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(sbFile, JSON.stringify(sb));
  const phrasesFile = path.join(dir, "phrases.json");
  // Phrases at 1.0 and 3.0 s in the voice file, so 1.5 and 3.5 s on the ad clock.
  fs.writeFileSync(phrasesFile, JSON.stringify({ phrases: [{ id: "P1", start: 1, end: 2 }, { id: "P2", start: 3, end: 4 }] }));
  const r = spawnSync(process.execPath, [tool, sbFile, ...(withPhrases ? ["--phrases", phrasesFile] : [])], { encoding: "utf8" });
  return (JSON.parse(r.stdout).results as Rule[]).find((x) => x.rule === "mix.onsets");
}

describe("check-storyboard mix.onsets", () => {
  it("fails an effect 50 ms before a phrase onset, on the ad clock", () => {
    const r = onsets(3.45);
    expect(r?.verdict).toBe("FAIL");
    expect(r?.detail).toContain("0.050s before the phrase at 3.500s");
  });

  it("passes effects clear of every onset, including one on the onset itself and one after it", () => {
    expect(onsets(3.2)?.verdict).toBe("PASS");
    expect(onsets(3.5)?.verdict).toBe("PASS");
    expect(onsets(null)?.verdict).toBe("PASS");
  });

  it("warns that onsets were not checked when no phrase map is given", () => {
    expect(onsets(3.45, false)?.verdict).toBe("WARN");
  });
});
