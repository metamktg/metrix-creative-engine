/**
 * The format registry is the one list of formats. Every other list in the repo
 * is either read from it or held to it here, so a format added in one place and
 * not another fails CI instead of routing a brief nowhere.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ASSET_TYPES, MOTION_TYPES } from "../brief.js";
import { FORMATS, STORYBOARD_KINDS } from "../formats.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(repo, p), "utf8");
const registry = JSON.parse(read("skills/metrix-ad-creative/references/formats.json"));

describe("mce.formats/1 registry", () => {
  it("is one file: the video-assembly copy is byte-identical and listed in skill-copies.json", () => {
    expect(read("skills/metrix-video-assembly/references/formats.json")).toBe(read("skills/metrix-ad-creative/references/formats.json"));
    const copies = JSON.parse(read("scripts/skill-copies.json")).copies;
    expect(copies.find((c: { source: string }) => c.source === "skills/metrix-ad-creative/references/formats.json")?.targets)
      .toEqual(["skills/metrix-video-assembly/references/formats.json"]);
  });

  it("has exactly one row per brief asset type, in the brief gate's order", () => {
    expect(FORMATS.map((f) => f.asset_type)).toEqual([...ASSET_TYPES]);
  });

  it("decides which brief types need a duration", () => {
    expect([...MOTION_TYPES]).toEqual(registry.formats.filter((f: { motion: boolean }) => f.motion).map((f: { asset_type: string }) => f.asset_type));
  });

  it("names a prompt module that exists for every row", () => {
    for (const f of FORMATS) expect(fs.existsSync(path.join(repo, f.prompt_module)), `${f.asset_type}: ${f.prompt_module}`).toBe(true);
  });

  it("names only storyboard kinds check-storyboard accepts, and check-storyboard reads them from the registry", () => {
    for (const f of FORMATS) if (f.storyboard_kind !== null) expect(STORYBOARD_KINDS).toContain(f.storyboard_kind);
    const src = read("skills/metrix-video-assembly/scripts/check-storyboard.mjs");
    expect(src).toMatch(/references\/formats\.json[\s\S]{0,80}storyboard_kinds/);
    expect(src).not.toMatch(/\["video", "still", "carousel"\]/);
  });

  it("drives the MCP render prompts and their production-review routing", () => {
    const src = read("src/prompts.ts");
    expect(src).toMatch(/FORMATS\.map\(/);
    expect(src).not.toMatch(/assetType === "ugc" \|\| assetType === "ai_ugc"/);
    for (const f of FORMATS) expect(src, `prompts.ts loads ${f.prompt_module}`).toContain(`"${f.prompt_module}"`);
  });
});
