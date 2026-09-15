/**
 * The contracts between the pure layer and the MCP layer.
 *
 * These exist because both failures they catch are invisible until a real
 * client calls the tool: the SDK validates `structuredContent` against the
 * declared `outputSchema` at call time, so a schema that has drifted from
 * `TaskRecord` fails in front of a user rather than in a test.
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { KieClient } from "../client.js";
import { toTaskRecord } from "../protocol.js";
import { taskRecordShape, waitOutputShape } from "../schemas.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const RUNNING = { taskId: "t", model: "m", state: "generating", progress: 40 };
const DONE = {
  taskId: "t",
  model: "m",
  state: "success",
  progress: 100,
  resultJson: JSON.stringify({ resultUrls: ["https://a/b.png"] }),
};

describe("outputSchema matches TaskRecord", () => {
  it("declares exactly the fields toTaskRecord produces", () => {
    // Drift in either direction is a runtime failure: a missing key fails
    // validation, an extra key is a field the client is promised and never got.
    const record = toTaskRecord({}, "t");
    expect(Object.keys(taskRecordShape).sort()).toEqual(Object.keys(record).sort());
  });

  it("accepts a real record, including its null and unknown fields", () => {
    const record = toTaskRecord(
      { taskId: "t", state: "success", param: '{"a":1}', resultJson: JSON.stringify({ resultUrls: [] }) },
      "t",
    );
    const parsed = z.object(waitOutputShape).safeParse({ task: record, timedOut: false, polls: 2 });
    expect(parsed.success, parsed.error && JSON.stringify(parsed.error.issues)).toBe(true);
  });

  it("accepts a record whose state the API has not documented", () => {
    const record = toTaskRecord({ taskId: "t", state: "throttled" }, "t");
    expect(record.state).toBe("unknown");
    expect(z.object(taskRecordShape).safeParse(record).success).toBe(true);
  });
});

describe("waitForTask progress reporting", () => {
  const client = (states: unknown[]) => {
    let call = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 200, msg: "ok", data: states[Math.min(call++, states.length - 1)] }));
    return new KieClient({ apiKey: "k", fetchImpl });
  };

  it("reports the first read and every read after it", async () => {
    const seen: number[] = [];
    const result = await client([RUNNING, RUNNING, DONE]).waitForTask("t", {
      timeoutMs: 60_000,
      pacing: { initialDelayMs: 0, maxDelayMs: 0, factor: 1 },
      onPoll: ({ polls }) => {
        seen.push(polls);
      },
    });
    expect(result.timedOut).toBe(false);
    // Three reads, three reports: a caller that only heard about the outcome
    // would show nothing for the minutes a generation actually takes.
    expect(seen).toEqual([1, 2, 3]);
  });

  it("does not lose the task when the progress channel throws", async () => {
    const result = await client([RUNNING, DONE]).waitForTask("t", {
      timeoutMs: 60_000,
      pacing: { initialDelayMs: 0, maxDelayMs: 0, factor: 1 },
      onPoll: () => {
        throw new Error("client went away");
      },
    });
    // The credits are already spent; a broken reporter must not cost the result.
    expect(result.record.state).toBe("success");
    expect(result.record.resultUrls).toEqual(["https://a/b.png"]);
  });

  it("hands the reporter a monotonic elapsed time inside the stated budget", async () => {
    const elapsed: number[] = [];
    await client([RUNNING, RUNNING, DONE]).waitForTask("t", {
      timeoutMs: 60_000,
      pacing: { initialDelayMs: 0, maxDelayMs: 0, factor: 1 },
      onPoll: ({ elapsedMs, timeoutMs }) => {
        expect(timeoutMs).toBe(60_000);
        elapsed.push(elapsedMs);
      },
    });
    expect(elapsed).toEqual([...elapsed].sort((a, b) => a - b));
    expect(elapsed.every((ms) => ms >= 0 && ms <= 60_000)).toBe(true);
  });
});
