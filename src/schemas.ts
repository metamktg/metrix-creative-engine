/**
 * Output schemas for the tool surface.
 *
 * A tool that declares an `outputSchema` must return `structuredContent`, and
 * the SDK validates it against the schema before it leaves the process. That is
 * the point: until this existed, a task record went back as `JSON.stringify`
 * inside a text block and the model re-read prose to find `resultUrls`. A typed
 * result is read, not parsed.
 *
 * The shapes below mirror `TaskRecord` in `protocol.ts` exactly. `resultJson`
 * and `param` stay `unknown` on purpose: both are model-specific and Kie
 * documents several shapes for each, so pinning them would reject valid
 * payloads the day a model returns a new one.
 */
import { z } from "zod";

import { TASK_STATES } from "./protocol.js";

export const taskRecordShape = {
  taskId: z.string(),
  model: z.string().nullable(),
  state: z.enum([...TASK_STATES, "unknown"]),
  rawState: z.string().nullable(),
  resultUrls: z.array(z.string()),
  frameUrls: z.array(z.string()),
  resultJson: z.unknown(),
  param: z.unknown(),
  failCode: z.string().nullable(),
  failMsg: z.string().nullable(),
  costTimeMs: z.number().nullable(),
  creditsConsumed: z.number().nullable(),
  progress: z.number().nullable(),
  createTime: z.number().nullable(),
  completeTime: z.number().nullable(),
  updateTime: z.number().nullable(),
} as const;

const taskRecordObject = z.object(taskRecordShape);

/** What `kie_get_task` returns: the record, nothing else. */
export const taskOutputShape = { task: taskRecordObject } as const;

/**
 * What the two waiting tools return. `timedOut` is a first-class field rather
 * than a sentence in the summary, because "still running" and "failed" are
 * different outcomes and a caller must be able to tell them apart without
 * reading English.
 */
export const waitOutputShape = {
  task: taskRecordObject,
  timedOut: z.boolean().describe("True when the deadline passed while the task was still running. The task is NOT finished and NOT failed; wait again with the same taskId."),
  polls: z.number().int().describe("How many times the task was read."),
} as const;

export const createOutputShape = {
  taskId: z.string(),
  model: z.string(),
} as const;

export const creditsOutputShape = {
  credits: z.number().describe("Remaining credit balance on the configured Kie.ai account."),
} as const;

export const downloadOutputShape = {
  filePath: z.string(),
  bytes: z.number().int(),
} as const;

/**
 * A brief verdict. `errors` block the render; `warnings` mean it will render
 * but worse. They are separate arrays rather than one severity-tagged list
 * because the caller's decision differs: stop, versus proceed knowingly.
 */
export const briefVerdictShape = {
  ok: z.boolean().describe("True when nothing blocks the render. Warnings do not affect this."),
  errors: z.array(z.string()).describe("Blocking problems. The render must not start."),
  warnings: z.array(z.string()).describe("Renderable, but the asset will be worse. Proceed knowingly."),
} as const;
