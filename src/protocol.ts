/**
 * Pure helpers over the Kie.ai Market job API's wire shapes.
 *
 * Nothing in this file does I/O, so every rule below is unit-testable
 * (`src/__tests__/protocol.test.ts`) without a network or an API key.
 *
 * The three endpoints this server speaks to are documented at
 * https://docs.kie.ai/market/quickstart and
 * https://docs.kie.ai/market/common/get-task-detail:
 *
 *   POST /api/v1/jobs/createTask   { model, input, callBackUrl? } -> { code, msg, data: { taskId } }
 *   GET  /api/v1/jobs/recordInfo   ?taskId=...                    -> { code, msg, data: TaskDetail }
 *   GET  /api/v1/chat/credit                                      -> { code, msg, data: <integer> }
 *
 * Two shapes drive most of the code here:
 *
 *  - The envelope carries its OWN `code`. An HTTP 200 with `code: 429` in the
 *    body is a failure, so success is never inferred from the HTTP status
 *    alone (`assertOk` below checks both).
 *  - `data.resultJson` is a JSON **string**, not an object, and its contents
 *    are model-specific. Only the documented `resultUrls` array is read out of
 *    it; the raw value is always passed through untouched so a model that
 *    returns anything else loses nothing.
 */

export const KIE_BASE_URL = "https://api.kie.ai";
export const CREATE_TASK_PATH = "/api/v1/jobs/createTask";
export const RECORD_INFO_PATH = "/api/v1/jobs/recordInfo";
export const CREDIT_PATH = "/api/v1/chat/credit";

/**
 * How long a result URL lasts.
 *
 * The figure is the one Kie documents, quoted from the `recordInfo` spec's own
 * Best Practices block (https://docs.kie.ai/market/common/get-task-detail):
 * "Download results immediately: Generated content URLs typically expire after
 * 24 hours." An earlier version of this file said 14 days, which is fourteen
 * times too generous and is exactly the error that loses a batch left
 * overnight. Where a model documents a shorter life (OmniHuman 1.5 subject
 * detection returns mask URLs valid for one hour), the model's own figure wins.
 *
 * Surfaced in tool output rather than left for the caller to discover.
 */
export const RESULT_RETENTION_NOTE =
  "Kie.ai documents result URLs as expiring after about 24 hours. Download anything you need to keep, now.";

/** The five task states `recordInfo` documents for `data.state`. */
export const TASK_STATES = ["waiting", "queuing", "generating", "success", "fail"] as const;

export type TaskState = (typeof TASK_STATES)[number];

/**
 * A state we did not recognise. Deliberately NOT terminal: an unfamiliar state
 * means the task is still in flight as far as we can tell, and the caller's
 * timeout — not a guess here — is what stops the wait.
 */
export type ObservedState = TaskState | "unknown";

export interface KieEnvelope<T> {
  code?: unknown;
  msg?: unknown;
  data?: T;
}

/** The documented `recordInfo` payload, normalized into stable types. */
export interface TaskRecord {
  taskId: string;
  model: string | null;
  state: ObservedState;
  /** What the API actually sent, kept when `state` normalized to "unknown". */
  rawState: string | null;
  /** URLs read out of `resultJson.resultUrls`; empty until the task succeeds. */
  resultUrls: string[];
  /**
   * `resultJson.firstFrameUrl` / `.lastFrameUrl`, which Seedance 2 returns
   * beside `resultUrls` when `return_last_frame` is on. Documented in the
   * `recordInfo` spec and kept separate from `resultUrls`, because a frame is
   * not the asset: a caller that downloads every URL indiscriminately would
   * file two stills as though they were renders.
   */
  frameUrls: string[];
  /** `resultJson` parsed when it was valid JSON, else the raw value, else null. */
  resultJson: unknown;
  /**
   * `param`, the JSON string of the request that created this task, parsed when
   * it is valid JSON. It is the only server-side record of the prompt and
   * parameters behind an asset, so an asset's provenance can be recovered from
   * Kie rather than only from whatever the caller happened to keep.
   */
  param: unknown;
  failCode: string | null;
  failMsg: string | null;
  costTimeMs: number | null;
  creditsConsumed: number | null;
  /** 0-100. Only sora2 / sora2 pro populate this. */
  progress: number | null;
  createTime: number | null;
  completeTime: number | null;
  updateTime: number | null;
}

/**
 * A Kie API call that failed, carrying both halves of the failure: the HTTP
 * status and the envelope's own `code`/`msg`. Either can be the real cause.
 */
export class KieApiError extends Error {
  readonly httpStatus: number | null;
  readonly code: number | null;

  constructor(message: string, opts: { httpStatus?: number | null; code?: number | null } = {}) {
    super(message);
    this.name = "KieApiError";
    this.httpStatus = opts.httpStatus ?? null;
    this.code = opts.code ?? null;
  }
}

/**
 * Hints for the envelope `code` values Kie documents, transcribed from the
 * `code` enum in https://docs.kie.ai/market/common/get-task-detail. Every entry
 * below is a code that spec names; codes outside this table fall through to
 * whatever `msg` the API sent rather than being guessed at.
 *
 * 400 is kept although it is not in that enum: the same spec's `responses`
 * block documents HTTP 400 for a missing or invalid taskId, and `assertOk`
 * falls back to the HTTP status when the envelope carries no code.
 *
 * No rate-limit figure is quoted here. A previous version said "20 new
 * generation requests per 10 seconds"; that number appears nowhere in the
 * current docs, and an error hint asserting a limit Kie does not publish sends
 * the reader to tune the wrong thing.
 */
const CODE_HINTS: Record<number, string> = {
  400: "Bad request: a required parameter is missing or invalid.",
  401: "Unauthorized: KIE_AI_API_KEY is missing, wrong, or revoked.",
  402: "Insufficient credits: the account cannot pay for this operation. Check kie_get_credits and top up.",
  404: "Not found: no task exists with that taskId.",
  408: "Upstream produced no result for over 10 minutes.",
  422: "Validation error: the request parameters were rejected. Check the model's own input schema.",
  429: "Rate limited: the request limit for this resource was exceeded. Pace the batch and retry.",
  455: "Service unavailable: Kie.ai is under maintenance.",
  500: "Kie.ai server error.",
  501: "Generation failed: the task itself failed, not the request. Check failMsg on the task record.",
  505: "Feature disabled: the requested feature is currently switched off on Kie.ai.",
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Throw unless BOTH the HTTP status and the envelope's `code` say success.
 * Returns the envelope's `data`.
 */
export function assertOk<T>(envelope: KieEnvelope<T> | null, httpStatus: number): T {
  const code = asFiniteNumber(envelope?.code);
  const msg = asNonEmptyString(envelope?.msg);
  const effective = code ?? httpStatus;

  if (httpStatus >= 200 && httpStatus < 300 && (code === null || code === 200)) {
    if (envelope === null || envelope.data === undefined) {
      throw new KieApiError("Kie.ai returned a success code with no data payload.", {
        httpStatus,
        code,
      });
    }
    return envelope.data;
  }

  const hint = CODE_HINTS[effective];
  const parts = [`Kie.ai request failed (HTTP ${httpStatus}, code ${code ?? "none"})`];
  if (msg) parts.push(msg);
  if (hint) parts.push(hint);
  throw new KieApiError(parts.join(" — "), { httpStatus, code });
}

/** Map an arbitrary `state` value onto a known state, or "unknown". */
export function normalizeState(raw: unknown): ObservedState {
  const text = asNonEmptyString(raw)?.toLowerCase();
  if (!text) return "unknown";
  return (TASK_STATES as readonly string[]).includes(text) ? (text as TaskState) : "unknown";
}

/** Only `success` and `fail` end a wait. "unknown" does not — see ObservedState. */
export function isTerminalState(state: ObservedState): boolean {
  return state === "success" || state === "fail";
}

/**
 * `resultJson` is a JSON string whose contents vary per model. Parse it when we
 * can and hand back the raw value when we cannot — a malformed payload is never
 * a thrown error, because the rest of the record is still useful.
 */
export function parseResultJson(resultJson: unknown): unknown {
  if (typeof resultJson !== "string") return resultJson ?? null;
  const trimmed = resultJson.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return resultJson;
  }
}

/**
 * Read one URL-bearing field out of a parsed `resultJson`. The spec types
 * `resultUrls`, `firstFrameUrl` and `lastFrameUrl` all as arrays, so a value
 * that is not one is ignored rather than coerced: a shape we did not expect is
 * still preserved whole in `TaskRecord.resultJson`, where it is visible as
 * itself instead of being half-read into a list.
 */
function urlsAt(source: unknown, field: string): string[] {
  if (source === null || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[field];
  if (!Array.isArray(value)) return [];
  return value.filter((url): url is string => typeof url === "string" && url.trim() !== "");
}

/**
 * Read the documented `resultUrls` array out of a parsed `resultJson`.
 * Anything else in there is left to the caller via `TaskRecord.resultJson`;
 * this never guesses at an undocumented field.
 */
export function extractResultUrls(parsedResultJson: unknown): string[] {
  return urlsAt(parsedResultJson, "resultUrls");
}

/**
 * Read `firstFrameUrl` / `lastFrameUrl`, the two other URL-bearing fields the
 * `recordInfo` spec documents (Seedance 2 with `return_last_frame`).
 */
export function extractFrameUrls(parsedResultJson: unknown): string[] {
  return [...urlsAt(parsedResultJson, "firstFrameUrl"), ...urlsAt(parsedResultJson, "lastFrameUrl")];
}

/** Normalize a raw `recordInfo` `data` object into a `TaskRecord`. */
export function toTaskRecord(data: unknown, fallbackTaskId: string): TaskRecord {
  const row = (data ?? {}) as Record<string, unknown>;
  const parsed = parseResultJson(row.resultJson);
  return {
    taskId: asNonEmptyString(row.taskId) ?? fallbackTaskId,
    model: asNonEmptyString(row.model),
    state: normalizeState(row.state),
    rawState: asNonEmptyString(row.state),
    resultUrls: extractResultUrls(parsed),
    frameUrls: extractFrameUrls(parsed),
    resultJson: parsed,
    param: parseResultJson(row.param),
    failCode: asNonEmptyString(row.failCode),
    failMsg: asNonEmptyString(row.failMsg),
    costTimeMs: asFiniteNumber(row.costTime),
    creditsConsumed: asFiniteNumber(row.creditsConsumed),
    progress: asFiniteNumber(row.progress),
    createTime: asFiniteNumber(row.createTime),
    completeTime: asFiniteNumber(row.completeTime),
    updateTime: asFiniteNumber(row.updateTime),
  };
}

export interface PollPacing {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

/**
 * These match the pacing Kie's own `recordInfo` spec recommends under Best
 * Practices: "Implement exponential backoff: Start with 2-3 second intervals,
 * increase gradually." The 15 s ceiling is ours. Kie names no numeric rate
 * limit anywhere in the docs, for `recordInfo` or for new generations, so
 * nothing here is tuned against one: a generation takes seconds to minutes, so
 * polling faster buys nothing and risks a 429 on a shared key.
 */
export const DEFAULT_POLL_PACING: PollPacing = {
  initialDelayMs: 2_000,
  maxDelayMs: 15_000,
  factor: 1.5,
};

/** Delay before poll number `attempt` (0-based): exponential, capped. */
export function pollDelayMs(attempt: number, pacing: PollPacing = DEFAULT_POLL_PACING): number {
  const step = Math.max(0, Math.floor(attempt));
  const raw = pacing.initialDelayMs * Math.pow(pacing.factor, step);
  return Math.min(pacing.maxDelayMs, Math.round(raw));
}

/**
 * Reduce any string to a single path segment safe to join onto a directory.
 * Path separators and leading dots are stripped, so neither a remote URL nor a
 * caller-supplied name can traverse out of the configured download directory.
 * Returns "" when nothing usable survives.
 */
export function sanitizeFilename(candidate: string): string {
  return candidate
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 120);
}

/**
 * A filename safe to join onto a download directory: the caller's preferred
 * name when it survives sanitizing, else the URL's last path segment, else the
 * fallback. Both inputs are untrusted, so both go through `sanitizeFilename`.
 */
export function safeFilenameFromUrl(
  url: string,
  fallback: string,
  preferredName?: string,
): string {
  const preferred = preferredName ? sanitizeFilename(preferredName) : "";
  if (preferred !== "") return preferred;

  let fromUrl = "";
  try {
    fromUrl = sanitizeFilename(decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""));
  } catch {
    fromUrl = "";
  }
  if (fromUrl !== "") return fromUrl;

  const cleanedFallback = sanitizeFilename(fallback);
  return cleanedFallback === "" ? "kie-result" : cleanedFallback;
}

/** One human-readable line per fact, for a tool result's text content. */
export function summarizeTask(record: TaskRecord): string {
  const lines = [
    `Task ${record.taskId}`,
    `State: ${record.state}${record.state === "unknown" && record.rawState ? ` (reported "${record.rawState}")` : ""}`,
  ];
  if (record.model) lines.push(`Model: ${record.model}`);
  if (record.progress !== null) lines.push(`Progress: ${record.progress}%`);
  if (record.state === "fail") {
    lines.push(`Failure: ${record.failMsg ?? "no message"}${record.failCode ? ` (code ${record.failCode})` : ""}`);
  }
  if (record.costTimeMs !== null) lines.push(`Took: ${(record.costTimeMs / 1000).toFixed(1)}s`);
  if (record.creditsConsumed !== null) lines.push(`Credits consumed: ${record.creditsConsumed}`);
  if (record.resultUrls.length > 0) {
    lines.push(`Result URLs:`, ...record.resultUrls.map((url) => `  ${url}`));
  }
  if (record.frameUrls.length > 0) {
    lines.push(`Frame URLs (first/last frame, not the asset):`, ...record.frameUrls.map((url) => `  ${url}`));
  }
  if (record.resultUrls.length > 0 || record.frameUrls.length > 0) {
    lines.push(RESULT_RETENTION_NOTE);
  }
  return lines.join("\n");
}
