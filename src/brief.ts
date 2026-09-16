/**
 * The brief input contract.
 *
 * Until this existed the engine read a brief by convention: a field was
 * whatever the brief builder happened to emit, and a mismatch surfaced at
 * render time, mid-spend, as a confused prompt rather than a refusal. The first
 * real brief package this engine was pointed at broke four contracts at once
 * and every one of them would have been caught here, at the door, for free.
 *
 * This is deliberately a GATE, not a parser. It does not repair a brief, fill a
 * default or coerce a near-miss: a brief that does not say what it wants is a
 * brief nobody can hold the render to. Errors block. Warnings are things that
 * will produce an asset, just a worse one, and the caller is told plainly.
 */
import { z } from "zod";

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

/** Formats that are motion, and therefore need a duration to be renderable. */
export const MOTION_TYPES: readonly AssetType[] = ["video", "ugc", "ai_ugc", "motion_graphic"];

/**
 * A render mode. `standard` is the ordinary case and the default.
 * `matrix` turns on the MST overlay: isolation discipline, a locked model, the
 * matrix filename and the comparative half of the confidence gate. It is opt-in
 * because a Matrix Sprint Test is an optional sprint, not a stage every brief
 * passes through.
 */
export const BRIEF_MODES = ["standard", "matrix"] as const;

/**
 * The confidence bar the final pass compares against. These are levels, not
 * provenance: "produced pre-launch, unproven" describes where a brief came
 * from and gives the gate nothing to test, which is how a gate ends up with no
 * operable bar.
 */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

const nonEmpty = z.string().trim().min(1);

const brandAsset = z.object({
  role: nonEmpty.describe('What the reference is: "product_front", "logo", "model", "set".'),
  url: z.string().url().optional().describe("An uploaded URL a model can consume."),
  path: nonEmpty.optional().describe("A local file, to be uploaded before the render."),
});

export const briefSchema = z.object({
  brief_metadata: z.object({
    brief_id: nonEmpty.describe("The creative concept id. The finished asset is named after it."),
    asset_type: z.enum(ASSET_TYPES),
    confidence: z.enum(CONFIDENCE_LEVELS),
    mode: z.enum(BRIEF_MODES).default("standard"),
  }),
  creative_specifications: z.object({
    placement: nonEmpty.describe("Feed, Stories, Reels, in-stream. Decides the ratio."),
    dimensions: nonEmpty.optional(),
    duration_seconds: z.number().positive().optional(),
  }),
  visual_direction: z.object({
    composition: nonEmpty,
    imagery: nonEmpty,
    color_palette: nonEmpty.optional(),
    typography: nonEmpty.optional(),
    style_guide: nonEmpty.optional(),
    avoid_list: z.array(nonEmpty).optional(),
  }),
  copy_architecture: z.record(z.unknown()).optional(),
  brand_assets: z.array(brandAsset).optional(),
  testing_framework: z
    .object({
      isolated_variable: nonEmpty.optional(),
      matrix_position: nonEmpty.optional(),
    })
    .optional(),
  qa_requirements: z.array(nonEmpty).optional(),
});

export type Brief = z.infer<typeof briefSchema>;

export interface BriefVerdict {
  ok: boolean;
  /** Blocking. The render does not start. */
  errors: string[];
  /** Renderable, but the asset will be worse and the caller should know why. */
  warnings: string[];
  brief: Brief | null;
}

/**
 * Checks that the schema cannot express, because they are about how fields
 * relate rather than what each one is.
 */
function crossFieldChecks(brief: Brief): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { asset_type, mode, brief_id } = brief.brief_metadata;

  if (MOTION_TYPES.includes(asset_type) && brief.creative_specifications.duration_seconds === undefined) {
    errors.push(
      `asset_type "${asset_type}" is motion and every eligible model requires a duration, but creative_specifications.duration_seconds is absent.`,
    );
  }

  // An unresolved placeholder in the id reaches the filesystem as a filename.
  if (/\.\.\.|…|\{|\}|<|>|TBD|XXX/i.test(brief_id)) {
    errors.push(
      `brief_metadata.brief_id "${brief_id}" carries an unresolved placeholder. The asset is named after this id, so a placeholder becomes a filename nobody can attribute.`,
    );
  }

  if (mode === "matrix" && !brief.testing_framework?.isolated_variable) {
    errors.push(
      "mode is \"matrix\", which means one variable is under test, but testing_framework.isolated_variable is absent. A matrix cell with nothing isolated measures nothing.",
    );
  }

  if (mode !== "matrix" && brief.testing_framework?.matrix_position) {
    warnings.push(
      "testing_framework.matrix_position is set on a brief whose mode is not \"matrix\". A coordinate is an index, never a name: the asset is named for its concept, not its cell.",
    );
  }

  const assets = brief.brand_assets ?? [];
  if (assets.length === 0) {
    // The single most expensive omission there is, and it is silent: the model
    // renders the right category with the wrong brand, and it looks finished.
    warnings.push(
      "brand_assets is empty. Nothing carries the client's product to the model, so it will invent a plausible generic one. Add references, or accept a generic render knowingly.",
    );
  }
  const unUploaded = assets.filter((asset) => !asset.url && asset.path);
  if (unUploaded.length > 0) {
    warnings.push(
      `${unUploaded.length} brand asset(s) have a local path and no url. Every reference-capable model takes a URL: upload them first (\`node scripts/kie.mjs upload <file>\`).`,
    );
  }
  const useless = assets.filter((asset) => !asset.url && !asset.path);
  if (useless.length > 0) {
    errors.push(`${useless.length} brand_assets entr(ies) carry neither a url nor a path.`);
  }

  return { errors, warnings };
}

/**
 * The brief arrives from `metrix-brief-builder`, which passed its own QA before
 * it reached us. Its vocabulary is not always this engine's vocabulary: IAP
 * writes `static_4x5` for a 4:5 static and `MST_matrix_cell` for a matrix cell,
 * and neither is a value the enums carry.
 *
 * Rejecting those was wrong. A brief that IAP validated does not need this
 * engine's discernment; it needs rendering. So a known dialect difference is
 * NORMALIZED and reported as a note, and only a genuinely unroutable type stops.
 *
 * Note what is deliberately NOT here: a fuzzy nearest-match. `static_4x5` maps
 * to `static` because the suffix is a ratio this engine already sets as a
 * parameter, not because the strings look similar.
 */
const MODE_ALIASES: Record<string, (typeof BRIEF_MODES)[number]> = {
  mst_matrix_cell: "matrix",
  matrix_cell: "matrix",
  mst: "matrix",
  general: "standard",
};

/** `4x5` / `4_5` / `4-5` all mean the same ratio. */
const RATIO_SUFFIX = /[_-](\d{1,2})[x_-](\d{1,2})$/i;

export function normalizeBriefVocabulary(input: unknown): { input: unknown; notes: string[] } {
  const notes: string[] = [];
  if (!input || typeof input !== "object") return { input, notes };

  const brief = structuredClone(input) as Record<string, any>;
  const meta = brief.brief_metadata;
  if (!meta || typeof meta !== "object") return { input: brief, notes };

  if (typeof meta.asset_type === "string" && !ASSET_TYPES.includes(meta.asset_type)) {
    const match = meta.asset_type.match(RATIO_SUFFIX);
    if (match) {
      const stem = meta.asset_type.slice(0, match.index).toLowerCase();
      if ((ASSET_TYPES as readonly string[]).includes(stem)) {
        const ratio = `${match[1]}:${match[2]}`;
        notes.push(
          `asset_type "${meta.asset_type}" read as "${stem}" at ${ratio}. The ratio is a parameter, not part of the type. Set aspect_ratio explicitly.`,
        );
        meta.asset_type = stem;
        brief.creative_specifications ??= {};
        brief.creative_specifications.dimensions ??= ratio;
      }
    }
  }

  if (typeof meta.mode === "string" && !(BRIEF_MODES as readonly string[]).includes(meta.mode)) {
    const mapped = MODE_ALIASES[meta.mode.toLowerCase()];
    if (mapped) {
      notes.push(`mode "${meta.mode}" read as "${mapped}".`);
      meta.mode = mapped;
    }
  }

  return { input: brief, notes };
}

/**
 * Validate a brief. Never throws: a malformed brief is a verdict, not an
 * exception, because the caller's next move is to report it, not to crash.
 */
export function validateBrief(rawInput: unknown): BriefVerdict {
  const { input, notes } = normalizeBriefVocabulary(rawInput);
  const parsed = briefSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      // Name the closed set rather than just rejecting, so the fix is obvious.
      if (issue.code === "invalid_enum_value" && path.endsWith("asset_type")) {
        return `${path}: "${String((issue as { received?: unknown }).received)}" has no route. Mapped types are ${ASSET_TYPES.join(", ")}. An unmapped type stops rather than falling back to the nearest one.`;
      }
      return `${path}: ${issue.message}`;
    });
    return { ok: false, errors, warnings: [], brief: null };
  }

  const { errors, warnings } = crossFieldChecks(parsed.data);
  return { ok: errors.length === 0, errors, warnings: [...notes, ...warnings], brief: parsed.data };
}

/** One readable block, for a tool result or a terminal. */
export function formatVerdict(verdict: BriefVerdict): string {
  const lines = [verdict.ok ? "Brief is renderable." : "Brief is NOT renderable."];
  for (const error of verdict.errors) lines.push(`  BLOCKS: ${error}`);
  for (const warning of verdict.warnings) lines.push(`  WARNS:  ${warning}`);
  if (verdict.errors.length === 0 && verdict.warnings.length === 0) lines.push("  No findings.");
  return lines.join("\n");
}
