/**
 * The mapped types, exactly as `references/format-routing.md` lists them.
 * The table's last row is "anything else -> stop", so this enum IS that rule:
 * a type outside it has no route, and routing it to the nearest neighbour
 * produces an asset that looks finished and tests nothing.
 */
export const ASSET_TYPES = [
  "static",
  "carousel",
  "video",
  "ugc",
  "ai_ugc",
  "motion_graphic",
  "claymation",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
