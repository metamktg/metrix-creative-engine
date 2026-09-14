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
 * Kie retains generated media for roughly 14 days
 * (https://docs.kie.ai/market/quickstart), so a result URL is not durable
 * storage. Surfaced in tool output rather than left for the caller to discover.
 */
export const RESULT_RETENTION_NOTE =
  "Kie.ai retains generated media for about 14 days. Download anything you need to keep.";

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
  /** `resultJson` parsed when it was valid JSON, else the raw value, else null. */
  resultJson: unknown;
  failCode: string | null;
  failMsg: string | null;
  costTimeMs: number | null;
  creditsConsumed: number | null;
  /** 0-100. Only sora2 / sora2 pro populate this. */
  progress: number | null;
  createTime: number | null;
  completeTime: number | null;
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
 * Hints for the status codes documented at
 * https://docs.kie.ai/market/common/get-task-detail. Codes outside this table
 * fall through to whatever `msg` the API sent rather than being guessed at.
 */
const CODE_HINTS: Record<number, string> = {
  400: "Bad request: a required parameter is missing or invalid.",
  401: "Unauthorized: KIE_AI_API_KEY is missing, wrong, or revoked.",
  404: "Not found: no task exists with that taskId.",
  422: "Validation error: the request parameters were rejected. Check the model's own input schema.",
  429: "Rate limited: Kie.ai allows 20 new generation requests per 10 seconds.",
  500: "Kie.ai server error.",
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
 * Read the documented `resultUrls` array out of a parsed `resultJson`.
 * Anything else in there is left to the caller via `TaskRecord.resultJson`;
 * this never guesses at an undocumented field.
 */
export function extractResultUrls(parsedResultJson: unknown): string[] {
  if (parsedResultJson === null || typeof parsedResultJson !== "object") return [];
  const urls = (parsedResultJson as { resultUrls?: unknown }).resultUrls;
  if (!Array.isArray(urls)) return [];
  return urls.filter((url): url is string => typeof url === "string" && url.trim() !== "");
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
    resultJson: parsed,
    failCode: asNonEmptyString(row.failCode),
    failMsg: asNonEmptyString(row.failMsg),
    costTimeMs: asFiniteNumber(row.costTime),
    creditsConsumed: asFiniteNumber(row.creditsConsumed),
    progress: asFiniteNumber(row.progress),
    createTime: asFiniteNumber(row.createTime),
    completeTime: asFiniteNumber(row.completeTime),
  };
}

export interface PollPacing {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
}

/**
 * Kie documents a limit on new generation requests (20 per 10 s) but none for
 * `recordInfo`. These are a deliberately unhurried default rather than a
 * documented figure: a generation takes seconds to minutes, so polling faster
 * buys nothing and risks a 429 on a shared key.
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
    lines.push(`Result URLs:`, ...record.resultUrls.map((url) => `  ${url}`), RESULT_RETENTION_NOTE);
  }
  return lines.join("\n");
}
