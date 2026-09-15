/**
 * HTTP client for the Kie.ai Market job API.
 *
 * Everything that can be decided without a network lives in `protocol.ts`;
 * this file is the thin I/O shell around it. `fetchImpl` is injectable so the
 * request/response handling can be tested against a fake.
 */
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  CREATE_TASK_PATH,
  CREDIT_PATH,
  DEFAULT_POLL_PACING,
  KIE_BASE_URL,
  KieApiError,
  RECORD_INFO_PATH,
  assertOk,
  isTerminalState,
  pollDelayMs,
  safeFilenameFromUrl,
  toTaskRecord,
  type KieEnvelope,
  type PollPacing,
  type TaskRecord,
} from "./protocol.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface KieClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Per-request timeout. The wait loop's own deadline is separate. */
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface CreateTaskInput {
  model: string;
  input: Record<string, unknown>;
  callBackUrl?: string;
}

export interface PollUpdate {
  record: TaskRecord;
  /** How many reads have happened, including this one. */
  polls: number;
  /** Milliseconds since the wait began. */
  elapsedMs: number;
  /** The wait's whole budget, so a reporter can express elapsed as a fraction. */
  timeoutMs: number;
}

export interface WaitOptions {
  timeoutMs: number;
  pacing?: PollPacing;
  signal?: AbortSignal;
  /**
   * Called after every read, including the first and the last. A generation
   * runs for minutes, so a caller that can report progress needs the reads as
   * they happen rather than only the outcome. Never allowed to fail the wait:
   * a reporter that throws is ignored, because a broken progress channel must
   * not lose a task the caller has already paid for.
   */
  onPoll?: (update: PollUpdate) => void | Promise<void>;
}

export interface WaitResult {
  record: TaskRecord;
  /** True when the deadline expired while the task was still in flight. */
  timedOut: boolean;
  polls: number;
}

export interface DownloadResult {
  filePath: string;
  bytes: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Wait cancelled."));
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new Error("Wait cancelled."));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class KieClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #requestTimeoutMs: number;
  readonly #fetch: FetchLike;

  constructor(options: KieClientOptions) {
    if (!options.apiKey || options.apiKey.trim() === "") {
      throw new Error("A Kie.ai API key is required.");
    }
    this.#apiKey = options.apiKey.trim();
    this.#baseUrl = (options.baseUrl ?? KIE_BASE_URL).replace(/\/+$/, "");
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#fetch = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  /**
   * The API key goes on the Authorization header and nowhere else — never into
   * a URL, a log line, or an error message.
   */
  async #request<T>(pathname: string, init: RequestInit & { query?: Record<string, string> }): Promise<T> {
    const url = new URL(this.#baseUrl + pathname);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#requestTimeoutMs);

    let response: Response;
    try {
      response = await this.#fetch(url.toString(), {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        body: init.body,
        signal: controller.signal,
      });
    } catch (error) {
      const reason = controller.signal.aborted
        ? `timed out after ${this.#requestTimeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
      throw new KieApiError(`Could not reach Kie.ai (${pathname}): ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let envelope: KieEnvelope<T> | null = null;
    if (text.trim() !== "") {
      try {
        envelope = JSON.parse(text) as KieEnvelope<T>;
      } catch {
        throw new KieApiError(
          `Kie.ai returned a non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`,
          { httpStatus: response.status },
        );
      }
    }

    return assertOk<T>(envelope, response.status);
  }

  /** POST /api/v1/jobs/createTask — returns the new task's id. */
  async createTask(task: CreateTaskInput): Promise<string> {
    const body: Record<string, unknown> = { model: task.model, input: task.input };
    if (task.callBackUrl) body.callBackUrl = task.callBackUrl;

    const data = await this.#request<{ taskId?: unknown }>(CREATE_TASK_PATH, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const taskId = typeof data?.taskId === "string" ? data.taskId.trim() : "";
    if (taskId === "") {
      throw new KieApiError("Kie.ai accepted the task but returned no taskId.");
    }
    return taskId;
  }

  /** GET /api/v1/jobs/recordInfo?taskId=... */
  async getTask(taskId: string): Promise<TaskRecord> {
    const data = await this.#request<unknown>(RECORD_INFO_PATH, { query: { taskId } });
    return toTaskRecord(data, taskId);
  }

  /** GET /api/v1/chat/credit — `data` is the remaining credit count itself. */
  async getCredits(): Promise<number> {
    const data = await this.#request<unknown>(CREDIT_PATH, {});
    const credits = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(credits)) {
      throw new KieApiError(`Kie.ai returned an unreadable credit balance: ${JSON.stringify(data)}`);
    }
    return credits;
  }

  /**
   * Poll `recordInfo` until the task settles or the deadline passes.
   *
   * A deadline that expires is NOT an error: the task is still running on
   * Kie's side, so the caller gets the last record read and `timedOut: true`
   * and can poll again with the same taskId.
   */
  async waitForTask(taskId: string, options: WaitOptions): Promise<WaitResult> {
    const pacing = options.pacing ?? DEFAULT_POLL_PACING;
    const startedAt = Date.now();
    const deadline = startedAt + options.timeoutMs;
    let polls = 0;

    const report = async (record: TaskRecord): Promise<void> => {
      if (!options.onPoll) return;
      try {
        await options.onPoll({
          record,
          polls,
          elapsedMs: Date.now() - startedAt,
          timeoutMs: options.timeoutMs,
        });
      } catch {
        // A progress channel that fails is not a reason to lose the task.
      }
    };

    let record = await this.getTask(taskId);
    polls += 1;
    await report(record);

    while (!isTerminalState(record.state)) {
      const delay = pollDelayMs(polls - 1, pacing);
      if (Date.now() + delay >= deadline) {
        return { record, timedOut: true, polls };
      }
      await sleep(delay, options.signal);
      record = await this.getTask(taskId);
      polls += 1;
      await report(record);
    }

    return { record, timedOut: false, polls };
  }

  /**
   * Download one result URL into `destDir`.
   *
   * The URL is remote input, so the protocol is checked and the filename is
   * derived through `safeFilenameFromUrl` — the response can never pick the
   * write location.
   */
  async downloadResult(
    url: string,
    destDir: string,
    names: { preferredName?: string; fallbackName: string },
  ): Promise<DownloadResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Not a valid URL: ${url}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Refusing to download a non-HTTP URL: ${parsed.protocol}`);
    }

    await mkdir(destDir, { recursive: true });
    const filePath = path.join(
      destDir,
      safeFilenameFromUrl(url, names.fallbackName, names.preferredName),
    );

    const response = await this.#fetch(url, { method: "GET" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (HTTP ${response.status}) for ${url}`);
    }

    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(filePath));
    const { size } = await stat(filePath);
    return { filePath, bytes: size };
  }
}
