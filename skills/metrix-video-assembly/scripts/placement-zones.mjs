/*
 * Placement safe zones: one table, one lookup, one box check.
 *
 * The table is references/placement-zones.json (canonical copy in
 * metrix-ad-creative/references; this skill carries a byte copy so it works
 * installed on its own). Each row names its source, its grade and the Meta page
 * it was read from with the retrieval date.
 *
 *   zoneFor({ ratio, placement })  -> { id, top, bottom, side, source, source_grade,
 *                                       enforcement, url, retrieved, warnings[] }
 *   checkBoxes(items, zone, minPx) -> Finding[] (one per item)
 *
 * No placement: the legacy row for the ratio, with a WARN, because a storyboard
 * that does not say where it runs cannot be held to that placement's overlay.
 * An unknown placement, or a placement that does not run at the given ratio,
 * throws: guessing a zone is how a CTA ends up under the profile row.
 *
 * Not yet consumed by render.mjs (its check still hard-codes the legacy values).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const TABLE_PATH = path.join(here, "..", "references", "placement-zones.json");

export function loadTable(file = TABLE_PATH) {
  const t = JSON.parse(fs.readFileSync(file, "utf8"));
  if (t?.schema !== "mce.zones/1" || !Array.isArray(t.zones)) throw new Error(`${file}: expected schema mce.zones/1 with a zones array`);
  for (const z of t.zones) {
    for (const k of ["top", "bottom", "side"]) {
      if (!(typeof z[k] === "number" && z[k] >= 0 && z[k] < 0.5)) throw new Error(`zone ${z.id}: ${k} must be a fraction in [0, 0.5)`);
    }
    if (z.top + z.bottom >= 1) throw new Error(`zone ${z.id}: top and bottom leave no frame`);
    if (!["fail", "warn"].includes(z.enforcement)) throw new Error(`zone ${z.id}: enforcement must be fail or warn`);
    if (z.source === "meta" && z.source_grade === "primary" && !(z.url && z.retrieved)) throw new Error(`zone ${z.id}: a primary Meta row needs url and retrieved`);
    if (z.source_grade === "third_party" && z.enforcement !== "warn") throw new Error(`zone ${z.id}: a third_party row may only warn`);
  }
  return t;
}

// Placement name to table id ("Instagram Reels" -> "instagram_reels"). Not the copy norm() in timeline/rules.mjs.
const placementKey = (s) => String(s).trim().toLowerCase().replace(/[\s-]+/g, "_");
const ratiosOf = (z) => z.ratios ?? [z.ratio];
const runsAt = (z, ratio) => ratiosOf(z).some((r) => r === "*" || r === ratio);

const view = (z, warnings) => ({
  id: z.id, top: z.top, bottom: z.bottom, side: z.side,
  source: z.source, source_grade: z.source_grade, enforcement: z.enforcement,
  url: z.url ?? null, retrieved: z.retrieved ?? null, warnings,
});

export function zoneFor({ ratio, placement } = {}, table = loadTable()) {
  if (!ratio) throw new Error("zoneFor needs a ratio");
  ratio = String(ratio);
  const warnings = [];
  if (placement == null || placement === "") {
    const z = table.zones.find((r) => r.source === "legacy" && r.ratio === ratio) ?? table.zones.find((r) => r.id === "legacy_other");
    warnings.push(`no placement declared: legacy ${z.id} zone (top ${z.top}, bottom ${z.bottom}, side ${z.side}) applied; declare format.placement to be held to the placement's overlay`);
    return view(z, warnings);
  }
  const key = placementKey(placement);
  const target = table.aliases?.[key] ?? key;
  const z = table.zones.find((r) => r.source !== "legacy" && (r.id === target || r.placements.some((p) => placementKey(p) === target)));
  if (!z) throw new Error(`unknown placement "${placement}"; known: ${table.zones.filter((r) => r.source !== "legacy").map((r) => r.id).join(", ")}`);
  if (!runsAt(z, ratio)) throw new Error(`placement "${placement}" (${z.id}) runs at ${ratiosOf(z).join(", ")}, not ${ratio}`);
  if (z.source_grade === "third_party") warnings.push(`${z.id} zone is third_party grade (no Meta page states it): band violations WARN, never FAIL`);
  return view(z, warnings);
}

/*
 * items: [{ id, box: { x, y, w, h } normalised to the frame, kind?: text|logo|product|face|cta, font_px? }]
 * Same band arithmetic and wording as render.mjs --mode check, so the renderer can
 * switch to this function without changing its report. font_px is checked only on
 * text items that carry it.
 */
export function checkBoxes(items, zone, minPx, { tolerance = 0.002 } = {}) {
  const sev = zone.enforcement === "warn" ? "WARN" : "FAIL";
  return items.map((item) => {
    const b = item.box;
    const kind = item.kind ?? "text";
    const reasons = [];
    if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite)) {
      return { id: item.id, kind, verdict: "FAIL", reasons: ["no measurable box"], zone: zone.id };
    }
    if (b.y < zone.top - tolerance) reasons.push(`top ${(b.y * 100).toFixed(1)}% inside the ${Math.round(zone.top * 100)}% overlay band`);
    if (b.y + b.h > 1 - zone.bottom + tolerance) reasons.push(`bottom ${((b.y + b.h) * 100).toFixed(1)}% inside the ${Math.round(zone.bottom * 100)}% overlay band`);
    if (b.x < zone.side - tolerance || b.x + b.w > 1 - zone.side + tolerance) reasons.push("outside the side margin");
    const bandVerdict = reasons.length ? sev : "PASS";
    // The type floor is a legibility rule, not a placement rule: it fails whatever the zone grade.
    let verdict = bandVerdict;
    if (kind === "text" && Number.isFinite(item.font_px) && Number.isFinite(minPx) && item.font_px < minPx) {
      reasons.push(`type ${item.font_px}px is under the ${minPx}px feed-legibility floor`);
      verdict = "FAIL";
    }
    return { id: item.id, kind, verdict, reasons, zone: zone.id, source_grade: zone.source_grade };
  });
}
