/**
 * The ledger's job is to answer one question the morning after a batch: which
 * of these assets can I still get back without paying again? Every case below
 * is a way that answer went wrong when the ledger did not exist.
 */
import { describe, expect, it } from "vitest";

import { RESULT_TTL_MS, foldLedger, formatLedger, resolveLedgerPath } from "../ledger.js";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe("folding events into tasks", () => {
  it("folds a create and a settle into one task", () => {
    const tasks = foldLedger(
      [
        line({ ts: at(600_000), taskId: "t1", model: "nano-banana-2", event: "created" }),
        line({ ts: at(300_000), taskId: "t1", model: "nano-banana-2", event: "settled", state: "success", resultUrls: ["https://cdn/a.jpg"] }),
      ].join("\n"),
      NOW,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.state).toBe("success");
    expect(tasks[0]!.resultUrls).toEqual(["https://cdn/a.jpg"]);
    expect(tasks[0]!.createdAt).toBe(at(600_000));
  });

  it("counts the result window from the settle, not the create", () => {
    // A task that queued for hours did not spend those hours expiring.
    const tasks = foldLedger(
      [
        line({ ts: at(RESULT_TTL_MS + 60_000), taskId: "t1", model: "m", event: "created" }),
        line({ ts: at(60_000), taskId: "t1", model: "m", event: "settled", state: "success" }),
      ].join("\n"),
      NOW,
    );
    expect(tasks[0]!.recoverable).toBe(true);
  });

  it("marks a task past the window as not recoverable", () => {
    const tasks = foldLedger(
      line({ ts: at(RESULT_TTL_MS + 1000), taskId: "t1", model: "m", event: "settled", state: "success" }),
      NOW,
    );
    expect(tasks[0]!.recoverable).toBe(false);
    expect(tasks[0]!.minutesLeft).toBe(0);
  });

  it("skips a half-written last line instead of losing the file", () => {
    // The likeliest cause of a malformed line is a process killed mid-append,
    // and every line before it is exactly the history the caller came for.
    const tasks = foldLedger(
      [
        line({ ts: at(1000), taskId: "t1", model: "m", event: "created" }),
        '{"ts":"2026-09-16T11:5',
      ].join("\n"),
      NOW,
    );
    expect(tasks).toHaveLength(1);
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(foldLedger("", NOW)).toEqual([]);
  });

  it("sorts newest first", () => {
    const tasks = foldLedger(
      [
        line({ ts: at(900_000), taskId: "old", model: "m", event: "created" }),
        line({ ts: at(100_000), taskId: "new", model: "m", event: "created" }),
      ].join("\n"),
      NOW,
    );
    expect(tasks.map((t) => t.taskId)).toEqual(["new", "old"]);
  });
});

describe("the report", () => {
  it("names a closed window as re-pollable, not as lost", () => {
    const out = formatLedger(
      foldLedger(line({ ts: at(RESULT_TTL_MS + 1000), taskId: "t1", model: "m", event: "settled", state: "success" }), NOW),
    );
    expect(out).toMatch(/CLOSED/);
    expect(out).toMatch(/re-poll/i);
  });

  it("flags two models in one ledger, because core rule 3 locks one per batch", () => {
    const out = formatLedger(
      foldLedger(
        [
          line({ ts: at(2000), taskId: "a", model: "nano-banana-2", event: "created" }),
          line({ ts: at(1000), taskId: "b", model: "google/nano-banana", event: "created" }),
        ].join("\n"),
        NOW,
      ),
    );
    expect(out).toMatch(/2 models/);
    expect(out).toMatch(/void/);
  });

  it("says so when the ledger is empty rather than printing nothing", () => {
    expect(formatLedger([])).toMatch(/empty/i);
  });
});

describe("where the ledger lives", () => {
  it("is on by default, beside the downloads", () => {
    expect(resolveLedgerPath({}, "/tmp/out")).toBe("/tmp/out/kie-ledger.jsonl");
  });

  it("can be switched off explicitly", () => {
    expect(resolveLedgerPath({ KIE_AI_LEDGER_PATH: "off" }, "/tmp/out")).toBeNull();
  });

  it("honours an explicit path", () => {
    expect(resolveLedgerPath({ KIE_AI_LEDGER_PATH: "/var/kie.jsonl" }, "/tmp/out")).toBe("/var/kie.jsonl");
  });
});
