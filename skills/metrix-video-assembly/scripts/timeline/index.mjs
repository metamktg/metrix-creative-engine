/*
 * The timeline module: one timing truth per ad. plan writes mce.timeline/1 from a phrase map and
 * a cut plan; check evaluates generic invariants and the cut plan's constraints; emit writes every
 * downstream artifact from the timeline. See references/timeline.md for the formats and the
 * normative plan semantics. The CLI is scripts/timeline.mjs.
 */
export { plan, resolvePlan, snapper, PlanError, CAPTION_DEFAULTS } from "./plan.mjs";
export { check, verdict, timelineResolver, frameHits } from "./check.mjs";
export { emit, emitAll, fileFor, scriptOf, pyFloat, TARGETS, EmitError } from "./emit.mjs";
export * as schema from "./schema.mjs";
export * as rules from "./rules.mjs";
