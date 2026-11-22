/**
 * The open-gap fact sheet (council design, step 1).
 *
 * Each case states the target behaviour and is marked `it.fails`: it passes
 * while the gap is open. When a change closes a gap, its case starts failing
 * CI. Replace it then with a real test of the new behaviour in the suite that
 * owns it; never delete a case without that replacement.
 *
 * Plan: .claude/council/sessions/mce-end-to-end-reconciliation-20261122-1558/design.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(repo, p));

describe("open gaps between stages (each closes with a real test)", () => {
  it.fails("format lists agree: claymation is motion wherever a duration is required", () => {
    // formats/claymation.md describes a motion style; brief.ts:36 MOTION_TYPES omits it,
    // so a motion claymation brief is never asked for a duration.
    expect(read("src/brief.ts")).toMatch(/MOTION_TYPES[^\n]*claymation/);
  });

  it.fails("production review covers every motion format, not only ugc, ai_ugc and video", () => {
    // skills/metrix-ad-creative/references/formats.json: motion_graphic is motion with
    // production_review false, so its render prompt carries no five-gate review.
    const rows = JSON.parse(read("skills/metrix-ad-creative/references/formats.json")).formats;
    expect(rows.filter((f: { motion: boolean; production_review: boolean }) => f.motion && !f.production_review)).toEqual([]);
  });

  it.fails("transitions are data: runtime.js has no silent dip default", () => {
    // skills/metrix-video-assembly/scripts/runtime.js:63-64 fall back to "dip" when a
    // scene declares no transition, so emit never has to state one.
    expect(read("skills/metrix-video-assembly/scripts/runtime.js")).not.toMatch(/getAttribute\("data-trans-in"\) \|\| "dip"/);
  });

  it.fails("the brief can carry missing product references the docs gate on (brand_assets.missing)", () => {
    // skills/metrix-ad-creative/SKILL.md:184 and prompts/00-core.md:142 block on
    // brand_assets.missing; brief.ts types brand_assets as an array only.
    expect(read("src/brief.ts")).toMatch(/missing/);
  });

  it.fails("one Kie client: the skill kie.mjs is built from src/, not hand-maintained beside it", () => {
    expect(read("skills/metrix-ad-creative/scripts/kie.mjs")).toMatch(/generated from src\//i);
  });

  it.fails("the skills ship as one plugin: .claude-plugin/plugin.json exists", () => {
    expect(exists(".claude-plugin/plugin.json")).toBe(true);
  });

  it.fails("every spend-path skill carries evals (metrix-ad-creative, ugc-creator-edit)", () => {
    expect(exists("skills/metrix-ad-creative/evals") && exists("skills/ugc-creator-edit/evals")).toBe(true);
  });
});
