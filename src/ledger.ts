/**
 * The task ledger.
 *
 * Kie documents result URLs as expiring after about 24 hours, and a taskId is
 * the only handle that outlives them: `recordInfo` will re-issue a fresh URL
 * for a task you can still name. Lose the id and the credits are simply gone,
 * because a re-render is a new generation, not the same asset.
 *
 * That is not hypothetical. A batch rendered overnight, read the next morning,
 * is past the window; its assets exist and are unreachable. Nothing in this
 * server persisted anything until now, so every id lived in one conversation.
 *
 * So: one append-only JSONL file, written on every create and every settle.
 * Append-only because a batch that dies mid-run must not take the record of its
 * earlier successes with it, and JSONL because a half-written last line still
 * leaves every line before it readable, which a JSON array does not.
 *
 * The ledger NEVER fails a render. A write that throws is reported and
 * swallowed: losing the record of a task is bad, losing the task is worse.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Kie's documented result lifetime. The reason this file exists. */
export const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface LedgerEntry {
  /** ISO 8601, so the file sorts and greps as text. */
  ts: string;
  taskId: string;
  model: string;
  event: "created" | "settled";
  state?: string;
  resultUrls?: string[];
  /** The asset name the caller asked for, when there was one. */
  name?: string;
  /** What was actually sent, so a re-render can reproduce the request. */
  param?: unknown;
  error?: string;
}

/** One task folded from its events, which is what a caller actually wants. */
export interface LedgerTask {
  taskId: string;
  model: string;
  createdAt: string;
  settledAt?: string;
  state: string;
  resultUrls: string[];
  name?: string;
  param?: unknown;
  /** True while Kie's documented result window has not yet closed. */
  recoverable: boolean;
  /** Whole minutes left in that window; 0 once it has passed. */
  minutesLeft: number;
}

/**
 * Where the ledger lives. Defaults ON: a ledger nobody switched on protects
 * nobody. `KIE_AI_LEDGER_PATH=off` disables it for a caller who genuinely does
 * not want a file on disk.
 */
export function resolveLedgerPath(
  env: NodeJS.ProcessEnv,
  downloadDir: string | null,
): string | null {
  const configured = env.KIE_AI_LEDGER_PATH?.trim();
  if (configured && configured.toLowerCase() === "off") return null;
  if (configured) return path.resolve(configured);
  return path.resolve(downloadDir ?? "./out", "kie-ledger.jsonl");
}

/**
 * Append one event. Resolves to the error it swallowed, or null, so a caller
 * that wants to surface "the render worked, the ledger did not" can.
 */
export async function appendLedger(
  ledgerPath: string | null,
  entry: LedgerEntry,
): Promise<Error | null> {
  if (!ledgerPath) return null;
  try {
    await mkdir(path.dirname(ledgerPath), { recursive: true });
    await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
    return null;
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause));
  }
}

/**
 * Fold the file into one record per task, newest first.
 *
 * A malformed line is skipped rather than throwing: the most likely cause of
 * one is a process killed mid-append, and the lines before it are exactly the
 * history the caller came for.
 */
export function foldLedger(contents: string, now: number): LedgerTask[] {
  const byTask = new Map<string, LedgerTask>();

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: LedgerEntry;
    try {
      entry = JSON.parse(trimmed) as LedgerEntry;
    } catch {
      continue;
    }
    if (!entry?.taskId || !entry.ts) continue;

    const existing = byTask.get(entry.taskId);
    if (!existing) {
      byTask.set(entry.taskId, {
        taskId: entry.taskId,
        model: entry.model ?? "unknown",
        createdAt: entry.ts,
        settledAt: entry.event === "settled" ? entry.ts : undefined,
        state: entry.state ?? (entry.event === "settled" ? "unknown" : "created"),
        resultUrls: entry.resultUrls ?? [],
        name: entry.name,
        param: entry.param,
        recoverable: false,
        minutesLeft: 0,
      });
      continue;
    }

    // Later events win on the mutable fields; the creation time does not move.
    if (entry.event === "settled") {
      existing.settledAt = entry.ts;
      existing.state = entry.state ?? existing.state;
      if (entry.resultUrls?.length) existing.resultUrls = entry.resultUrls;
    }
    if (entry.name) existing.name = entry.name;
    if (entry.param !== undefined) existing.param = entry.param;
    if (entry.model && entry.model !== "unknown") existing.model = entry.model;
  }

  const tasks = [...byTask.values()];
  for (const task of tasks) {
    // The window runs from the moment the result existed, not from creation:
    // a task that queued for an hour did not spend that hour expiring.
    const from = Date.parse(task.settledAt ?? task.createdAt);
    const msLeft = Number.isFinite(from) ? from + RESULT_TTL_MS - now : 0;
    task.minutesLeft = msLeft > 0 ? Math.floor(msLeft / 60000) : 0;
    task.recoverable = task.minutesLeft > 0;
  }

  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Read and fold the ledger. A missing file is an empty history, not an error. */
export async function readLedger(
  ledgerPath: string | null,
  now: number,
): Promise<LedgerTask[]> {
  if (!ledgerPath) return [];
  try {
    return foldLedger(await readFile(ledgerPath, "utf8"), now);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw cause;
  }
}

/** One readable block, for a tool result or a terminal. */
export function formatLedger(tasks: LedgerTask[]): string {
  if (tasks.length === 0) {
    return "The ledger is empty. No task has been recorded yet, or KIE_AI_LEDGER_PATH is off.";
  }
  const models = new Set(tasks.map((t) => t.model));
  const lines = [`${tasks.length} task(s) recorded across ${models.size} model(s).`];
  for (const task of tasks) {
    const window = task.state === "success"
      ? task.recoverable
        ? `${task.minutesLeft} min of result window left`
        : "result window CLOSED, re-poll to re-issue"
      : task.state;
    lines.push(`  ${task.createdAt}  ${task.taskId}  ${task.model}  ${window}${task.name ? `  ${task.name}` : ""}`);
  }
  if (models.size > 1) {
    lines.push("");
    lines.push(`NOTE: ${models.size} models appear in this ledger. Core rule 3 locks one model per batch; if these are one batch, the comparison is void.`);
  }
  return lines.join("\n");
}
