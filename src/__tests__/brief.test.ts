/**
 * Every case below is a real failure class from the first brief package this
 * engine was pointed at. All four reached a render and would have been caught
 * here, at the door, before a credit was spent.
 */
import { describe, expect, it } from "vitest";

import { validateBrief } from "../brief.js";

const renderable = {
  brief_metadata: {
    brief_id: "hero-bottle-concrete-ledge",
    asset_type: "static",
    confidence: "medium",
  },
  creative_specifications: { placement: "Feed" },
  visual_direction: {
    composition: "Product centred, low angle, concrete ledge",
    imagery: "Matte bottle, hard morning light, deep shadow",
  },
  brand_assets: [{ role: "product_front", url: "https://cdn.example/bottle.png" }],
};

const errorsOf = (brief: unknown) => validateBrief(brief).errors.join(" | ");
const warningsOf = (brief: unknown) => validateBrief(brief).warnings.join(" | ");

describe("a renderable brief", () => {
  it("passes with no findings", () => {
    const verdict = validateBrief(renderable);
    expect(verdict.errors).toEqual([]);
    expect(verdict.warnings).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it("defaults mode to standard, so a matrix is opt-in", () => {
    expect(validateBrief(renderable).brief?.brief_metadata.mode).toBe("standard");
  });
});

describe("an unmapped asset_type stops", () => {
  it('rejects "static_4x5" and names the closed set', () => {
    const message = errorsOf({
      ...renderable,
      brief_metadata: { ...renderable.brief_metadata, asset_type: "static_4x5" },
    });
    expect(message).toMatch(/static_4x5/);
    expect(message).toMatch(/no route/i);
    expect(message).toMatch(/static, carousel, video, ugc, ai_ugc, motion_graphic, claymation/);
  });

  it('rejects an unknown mode rather than silently ignoring it', () => {
    expect(
      errorsOf({
        ...renderable,
        brief_metadata: { ...renderable.brief_metadata, mode: "MST_matrix_cell" },
      }),
    ).toMatch(/mode/);
  });
});

describe("the confidence field has to be a level the gate can compare against", () => {
  it("rejects a provenance sentence", () => {
    expect(
      errorsOf({
        ...renderable,
        brief_metadata: { ...renderable.brief_metadata, confidence: "produced_pre-launch, unproven" },
      }),
    ).toMatch(/confidence/);
  });

  it.each(["low", "medium", "high"])("accepts %s", (level) => {
    expect(
      validateBrief({ ...renderable, brief_metadata: { ...renderable.brief_metadata, confidence: level } }).ok,
    ).toBe(true);
  });
});

describe("brand assets", () => {
  it("warns, rather than blocks, when none are given", () => {
    const { brand_assets, ...withoutAssets } = renderable;
    const verdict = validateBrief(withoutAssets);
    // Renderable on purpose: a generic asset is a knowing choice, not an error.
    expect(verdict.ok).toBe(true);
    expect(verdict.warnings.join(" ")).toMatch(/generic/);
  });

  it("warns when a reference is a local path that no model can read", () => {
    expect(
      warningsOf({ ...renderable, brand_assets: [{ role: "product_front", path: "./bottle.png" }] }),
    ).toMatch(/upload/i);
  });

  it("blocks a reference carrying neither url nor path", () => {
    expect(errorsOf({ ...renderable, brand_assets: [{ role: "logo" }] })).toMatch(/neither a url nor a path/);
  });
});

describe("an id that becomes a filename", () => {
  it.each(["ECAS-MST1-C1A_...", "concept-{id}", "hero-TBD"])("blocks the placeholder in %s", (id) => {
    expect(
      errorsOf({ ...renderable, brief_metadata: { ...renderable.brief_metadata, brief_id: id } }),
    ).toMatch(/placeholder/);
  });
});

describe("motion needs a duration", () => {
  it.each(["video", "ugc", "ai_ugc", "motion_graphic"])("blocks %s without one", (assetType) => {
    expect(
      errorsOf({
        ...renderable,
        brief_metadata: { ...renderable.brief_metadata, asset_type: assetType },
      }),
    ).toMatch(/duration/);
  });

  it("does not ask a static for one", () => {
    expect(errorsOf(renderable)).not.toMatch(/duration/);
  });
});

describe("matrix mode", () => {
  it("blocks a cell that isolates nothing", () => {
    expect(
      errorsOf({
        ...renderable,
        brief_metadata: { ...renderable.brief_metadata, mode: "matrix" },
      }),
    ).toMatch(/isolated_variable/);
  });

  it("warns when a coordinate is carried on a brief that is not a matrix cell", () => {
    expect(
      warningsOf({ ...renderable, testing_framework: { matrix_position: "C1A" } }),
    ).toMatch(/coordinate is an index/);
  });
});
