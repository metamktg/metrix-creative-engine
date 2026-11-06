import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const at = (p: string) => path.join(repo, p);
const read = (p: string) => fs.readFileSync(at(p), "utf8");
const lf = (s: string) => s.replace(/\r\n/g, "\n");

type Zone = {
  id: string; top: number; bottom: number; side: number;
  source: "meta" | "house" | "legacy"; source_grade: string; enforcement: "fail" | "warn";
  url: string | null; retrieved: string | null; warnings: string[];
};
type Row = Omit<Zone, "warnings"> & { ratio?: string; ratios?: string[]; placements: string[]; also?: string[]; basis: string };
type Table = { schema: string; tolerance: number; min_font_ratio: number; zones: Row[]; aliases: Record<string, string> };
type Item = { id: string; box?: { x: number; y: number; w: number; h: number }; kind?: string; font_px?: number };
type Finding = { id: string; kind: string; verdict: "PASS" | "WARN" | "FAIL"; reasons: string[]; zone: string };

const mod = (await import(pathToFileURL(at("skills/metrix-video-assembly/scripts/placement-zones.mjs")).href)) as {
  TABLE_PATH: string;
  loadTable: (file?: string) => Table;
  zoneFor: (q: { ratio?: string; placement?: string | null }, table?: Table) => Zone;
  checkBoxes: (items: Item[], zone: Zone, minPx: number) => Finding[];
};
const { loadTable, zoneFor, checkBoxes } = mod;
const table = loadTable();
const row = (id: string) => table.zones.find((z) => z.id === id)!;

// v19 caption geometry: --cap-top 64% and .cap.ui 71% (composition index.html:18,20).
const captionAt066 = { id: "cap", kind: "text", box: { x: 0.1, y: 0.66, w: 0.8, h: 0.05 }, font_px: 48 };

describe("placement-zones table", () => {
  it("the skill copy is the canonical table byte for byte (line endings aside)", () => {
    expect(path.resolve(mod.TABLE_PATH)).toBe(path.resolve(at("skills/metrix-video-assembly/references/placement-zones.json")));
    expect(lf(read("skills/metrix-video-assembly/references/placement-zones.json"))).toBe(lf(read("skills/metrix-ad-creative/references/placement-zones.json")));
    const manifest = JSON.parse(read("scripts/skill-copies.json")) as { copies: { source: string; targets: string[] }[] };
    expect(manifest.copies.find((c) => c.source === "skills/metrix-ad-creative/references/placement-zones.json")?.targets)
      .toEqual(["skills/metrix-video-assembly/references/placement-zones.json"]);
  });

  it("every Meta primary row names a Meta ads-guide page and a retrieval date; third_party rows only warn", () => {
    expect(table.schema).toBe("mce.zones/1");
    const primary = table.zones.filter((z) => z.source_grade === "primary");
    expect(primary.map((z) => z.id).sort()).toEqual(["facebook_stories", "instagram_reels", "instagram_stories"]);
    for (const z of primary) {
      expect(z.source).toBe("meta");
      expect(z.url).toMatch(/^https:\/\/www\.facebook\.com\/business\/ads-guide\/update\//);
      expect(z.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect([z.top, z.bottom, z.side]).toEqual([0.14, 0.35, 0.06]);
      expect(z.enforcement).toBe("fail");
    }
    for (const z of table.zones.filter((r) => r.source_grade === "third_party")) expect(z.enforcement).toBe("warn");
    expect(row("feed").source).toBe("house");
  });

  it("legacy rows equal the values render.mjs --mode check hard-codes", () => {
    const src = read("skills/metrix-video-assembly/scripts/render.mjs");
    const m = src.match(/const zone = ratio === "9:16" \? \{ top: ([\d.]+), bottom: ([\d.]+), side: ([\d.]+) \} : \{ top: ([\d.]+), bottom: ([\d.]+), side: ([\d.]+) \};/);
    expect(m, "render.mjs zone line moved or changed; update the legacy rows and this test together").not.toBeNull();
    const [, t9, b9, s9, to, bo, so] = m!.map(Number);
    expect([row("legacy_9x16").top, row("legacy_9x16").bottom, row("legacy_9x16").side]).toEqual([t9, b9, s9]);
    expect([row("legacy_other").top, row("legacy_other").bottom, row("legacy_other").side]).toEqual([to, bo, so]);
    expect(src).toContain("Math.round(W * " + table.min_font_ratio + ")");
  });

  it("loadTable refuses a third_party row that would fail, and a primary row without a source", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zones-"));
    try {
      const bad = structuredClone(table);
      bad.zones.find((z) => z.id === "facebook_reels")!.enforcement = "fail";
      fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify(bad));
      expect(() => loadTable(path.join(dir, "a.json"))).toThrow(/third_party row may only warn/);
      const bad2 = structuredClone(table);
      bad2.zones.find((z) => z.id === "instagram_reels")!.retrieved = null;
      fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify(bad2));
      expect(() => loadTable(path.join(dir, "b.json"))).toThrow(/needs url and retrieved/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("zoneFor", () => {
  it("reels_stories, Instagram Reels, Stories names all resolve to Meta 14/35/6", () => {
    for (const placement of ["reels_stories", "Instagram Reels", "instagram-reels", "Instagram Stories", "Facebook Stories"]) {
      const z = zoneFor({ ratio: "9:16", placement });
      expect([z.top, z.bottom, z.side], placement).toEqual([0.14, 0.35, 0.06]);
      expect(z.source).toBe("meta");
      expect(z.source_grade).toBe("primary");
      expect(z.retrieved).toBe("2026-11-06");
      expect(z.warnings).toEqual([]);
    }
  });

  it("no placement falls back to the legacy row for the ratio, with a warning", () => {
    const z9 = zoneFor({ ratio: "9:16" });
    expect([z9.id, z9.top, z9.bottom, z9.side, z9.source]).toEqual(["legacy_9x16", 0.14, 0.2, 0.06, "legacy"]);
    expect(z9.warnings[0]).toMatch(/no placement declared/);
    const z45 = zoneFor({ ratio: "4:5", placement: null });
    expect([z45.id, z45.top, z45.bottom, z45.side]).toEqual(["legacy_other", 0.05, 0.05, 0.05]);
    expect(z45.warnings).toHaveLength(1);
  });

  it("feed is a house 5% rule at every feed ratio", () => {
    for (const ratio of ["4:5", "1:1", "9:16"]) {
      const z = zoneFor({ ratio, placement: "Facebook Feed" });
      expect([z.id, z.source, z.top, z.bottom, z.side]).toEqual(["feed", "house", 0.05, 0.05, 0.05]);
    }
  });

  it("Facebook Reels is third_party grade and says so", () => {
    const z = zoneFor({ ratio: "9:16", placement: "Facebook Reels" });
    expect([z.source_grade, z.enforcement]).toEqual(["third_party", "warn"]);
    expect(z.warnings[0]).toMatch(/third_party grade/);
  });

  it("refuses an unknown placement and a placement at the wrong ratio", () => {
    expect(() => zoneFor({ ratio: "9:16", placement: "Snapchat Spotlight" })).toThrow(/unknown placement/);
    expect(() => zoneFor({ ratio: "4:5", placement: "reels_stories" })).toThrow(/runs at 9:16, not 4:5/);
    expect(() => zoneFor({ placement: "feed" })).toThrow(/needs a ratio/);
  });
});

describe("checkBoxes", () => {
  const reels = zoneFor({ ratio: "9:16", placement: "reels_stories" });
  const minPx = Math.round(1080 * 0.03);

  it("a caption at 66% to 71% sits inside the Meta 35% bottom band and FAILs", () => {
    const [f] = checkBoxes([captionAt066], reels, minPx);
    expect(f.verdict).toBe("FAIL");
    expect(f.reasons).toEqual(["bottom 71.0% inside the 35% overlay band"]);
  });

  it("the same caption passes the legacy 20% band, which is why v19 passes today", () => {
    expect(checkBoxes([captionAt066], zoneFor({ ratio: "9:16" }), minPx)[0].verdict).toBe("PASS");
  });

  it("a logo in the 6% side margin FAILs, a centred product passes", () => {
    const res = checkBoxes([
      { id: "logo", kind: "logo", box: { x: 0.03, y: 0.3, w: 0.1, h: 0.05 } },
      { id: "product", kind: "product", box: { x: 0.2, y: 0.2, w: 0.6, h: 0.4 } },
    ], reels, minPx);
    expect(res.map((r) => r.verdict)).toEqual(["FAIL", "PASS"]);
    expect(res[0].reasons).toEqual(["outside the side margin"]);
  });

  it("the top band and the tolerance match render.mjs", () => {
    const res = checkBoxes([
      { id: "a", box: { x: 0.1, y: 0.139, w: 0.5, h: 0.05 } },
      { id: "b", box: { x: 0.1, y: 0.137, w: 0.5, h: 0.05 } },
    ], reels, minPx);
    expect(res.map((r) => r.verdict)).toEqual(["PASS", "FAIL"]);
    expect(res[1].reasons).toEqual(["top 13.7% inside the 14% overlay band"]);
  });

  it("a third_party zone WARNs on bands but the type floor still FAILs", () => {
    const fb = zoneFor({ ratio: "9:16", placement: "facebook_reels" });
    const [band] = checkBoxes([captionAt066], fb, minPx);
    expect(band.verdict).toBe("WARN");
    const [small] = checkBoxes([{ ...captionAt066, box: { x: 0.1, y: 0.3, w: 0.8, h: 0.05 }, font_px: 20 }], fb, minPx);
    expect(small.verdict).toBe("FAIL");
    expect(small.reasons).toEqual(["type 20px is under the 32px feed-legibility floor"]);
  });

  it("an item without a measurable box FAILs", () => {
    expect(checkBoxes([{ id: "ghost", kind: "face" }], reels, minPx)[0]).toMatchObject({ verdict: "FAIL", reasons: ["no measurable box"] });
  });
});

describe("readers cite the table", () => {
  const readers = [
    "skills/metrix-ad-creative/references/placement-specs.md",
    "prompts/02-render-bridge.md",
    "skills/metrix-video-assembly/evals/metrix-reels-from-app-recordings/files/brief.json",
    "skills/metrix-video-assembly/evals/metrix-reels-from-app-recordings/graders/05-readable-copy-stays-out-of.md",
    "skills/metrix-video-assembly/evals/metrix-reels-refuses-unsourced-proof/files/brief.json",
    "skills/metrix-video-assembly/evals/metrix-reels-refuses-unsourced-proof/graders/05-readable-copy-stays-out-of.md",
    "skills/metrix-video-assembly/evals/metrix-feed-4x5-product-journey/files/brief.json",
    "skills/metrix-video-assembly/evals/metrix-mst-hook-row/files/brief.json",
  ];
  it.each(readers)("%s names placement-zones.json and no stale 9:16 bottom figure", (file) => {
    const text = read(file);
    expect(text).toContain("placement-zones.json");
    expect(text).not.toMatch(/bottom 20%|last 20%/);
  });

  it("the 9:16 readers state the Meta 14/35/6 figures from the table", () => {
    const z = row("instagram_reels");
    const figures = `top ${Math.round(z.top * 100)}%, bottom ${Math.round(z.bottom * 100)}%`;
    for (const file of readers.filter((f) => /reels|render-bridge|placement-specs/.test(f))) expect(read(file), file).toContain(figures);
  });
});
