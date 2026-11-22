/**
 * The format registry (mce.formats/1), read from the canonical JSON the skills
 * carry. esbuild inlines it into the bundle, so the MCP server needs no file
 * beside it at run time. src/__tests__/formats-registry.test.ts holds every
 * other format list in the repo to this one.
 */
import registry from "../skills/metrix-ad-creative/references/formats.json";
import { ASSET_TYPES, type AssetType } from "./asset-types.js";

export interface FormatRow {
  asset_type: AssetType;
  title: string;
  motion: boolean;
  prompt_module: string;
  production_review: boolean;
  storyboard_kind: string | null;
}

if (registry.schema !== "mce.formats/1") throw new Error(`format registry: expected schema mce.formats/1, got ${registry.schema}`);
for (const row of registry.formats) {
  if (!(ASSET_TYPES as readonly string[]).includes(row.asset_type)) throw new Error(`format registry: ${row.asset_type} is not a brief asset type`);
}

export const FORMATS: readonly FormatRow[] = registry.formats as FormatRow[];
export const STORYBOARD_KINDS: readonly string[] = registry.storyboard_kinds;
export const formatOf = (assetType: AssetType): FormatRow => {
  const row = FORMATS.find((f) => f.asset_type === assetType);
  if (!row) throw new Error(`format registry has no row for ${assetType}`);
  return row;
};
