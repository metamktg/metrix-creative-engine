import { describe, expect, it } from "vitest";

import {
  DEFAULT_POLL_PACING,
  KieApiError,
  assertOk,
  extractResultUrls,
  isTerminalState,
  normalizeState,
  parseResultJson,
  pollDelayMs,
  safeFilenameFromUrl,
  sanitizeFilename,
  summarizeTask,
  toTaskRecord,
} from "../protocol.js";

describe("assertOk", () => {
  it("returns data when the HTTP status and the envelope code both say success", () => {
    expect(assertOk({ code: 200, msg: "success", data: { taskId: "t1" } }, 200)).toEqual({
      taskId: "t1",
    });
  });

  it("accepts an envelope that omits code entirely", () => {
    expect(assertOk({ data: 42 }, 200)).toBe(42);
  });

  // The failure this guards: Kie answers HTTP 200 with code 429 in the body.
  // Trusting the status alone would read a rate-limit refusal as a result.
  it("fails on a non-200 envelope code even under HTTP 200", () => {
    expect(() => assertOk({ code: 429, msg: "too many requests", data: null }, 200)).toThrow(
      /rate limited/i,
    );
  });

  it("carries both the HTTP status and the envelope code on the error", () => {
    try {
      assertOk({ code: 401, msg: "bad key" }, 200);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(KieApiError);
      expect((error as KieApiError).code).toBe(401);
      expect((error as KieApiError).httpStatus).toBe(200);
      expect((error as KieApiError).message).toMatch(/KIE_AI_API_KEY/);
    }
  });

  it("fails a success code that carries no data", () => {
    expect(() => assertOk({ code: 200, msg: "success" }, 200)).toThrow(/no data payload/i);
  });

  it("fails on an HTTP error even when the body is unreadable", () => {
    expect(() => assertOk(null, 500)).toThrow(/HTTP 500/);
  });
});

describe("normalizeState / isTerminalState", () => {
  it.each(["waiting", "queuing", "generating", "success", "fail"])("recognises %s", (state) => {
    expect(normalizeState(state)).toBe(state);
  });

  it("is case and whitespace insensitive", () => {
    expect(normalizeState("  SUCCESS ")).toBe("success");
  });

  it("maps anything unrecognised to unknown", () => {
    expect(normalizeState("paused")).toBe("unknown");
    expect(normalizeState(undefined)).toBe("unknown");
    expect(normalizeState(7)).toBe("unknown");
  });

  it("treats only success and fail as terminal", () => {
    expect(isTerminalState("success")).toBe(true);
    expect(isTerminalState("fail")).toBe(true);
    expect(isTerminalState("generating")).toBe(false);
  });

  // An unknown state must keep the poller going: if a future Kie state were
  // read as terminal, a running task would be reported as finished with no result.
  it("does not treat an unknown state as terminal", () => {
    expect(isTerminalState("unknown")).toBe(false);
  });
});

describe("parseResultJson / extractResultUrls", () => {
  it("parses the documented JSON-string payload", () => {
    const parsed = parseResultJson('{"resultUrls":["https://example.com/a.jpg"]}');
    expect(extractResultUrls(parsed)).toEqual(["https://example.com/a.jpg"]);
  });

  it("accepts a payload that already arrived as an object", () => {
    expect(extractResultUrls(parseResultJson({ resultUrls: ["https://example.com/b.mp4"] }))).toEqual(
      ["https://example.com/b.mp4"],
    );
  });

  // Malformed JSON must not throw: the rest of the record (state, failMsg)
  // is still what the caller needs to see.
  it("returns malformed JSON unchanged instead of throwing", () => {
    expect(parseResultJson("{not json")).toBe("{not json");
    expect(extractResultUrls("{not json")).toEqual([]);
  });

  it("handles empty, null and absent payloads", () => {
    expect(parseResultJson("")).toBeNull();
    expect(parseResultJson(undefined)).toBeNull();
    expect(extractResultUrls(null)).toEqual([]);
    expect(extractResultUrls({})).toEqual([]);
  });

  it("drops non-string and blank entries rather than passing them through", () => {
    expect(extractResultUrls({ resultUrls: ["https://a", 3, null, "  ", "https://b"] })).toEqual([
      "https://a",
      "https://b",
    ]);
  });

  it("ignores a resultUrls that is not an array", () => {
    expect(extractResultUrls({ resultUrls: "https://a" })).toEqual([]);
  });
});

describe("toTaskRecord", () => {
  it("normalizes a full success payload", () => {
    const record = toTaskRecord(
      {
        taskId: "task_1",
        model: "google/nano-banana",
        state: "success",
        resultJson: '{"resultUrls":["https://example.com/x.png"]}',
        costTime: 12_500,
        creditsConsumed: 4,
        createTime: 1_700_000_000_000,
        completeTime: 1_700_000_012_500,
      },
      "fallback",
    );

    expect(record.taskId).toBe("task_1");
    expect(record.state).toBe("success");
    expect(record.resultUrls).toEqual(["https://example.com/x.png"]);
    expect(record.costTimeMs).toBe(12_500);
    expect(record.creditsConsumed).toBe(4);
    expect(record.failMsg).toBeNull();
  });

  it("keeps the raw state when it did not normalize", () => {
    const record = toTaskRecord({ state: "throttled" }, "fallback");
    expect(record.state).toBe("unknown");
    expect(record.rawState).toBe("throttled");
  });

  it("falls back to the requested taskId when the response omits one", () => {
    expect(toTaskRecord({ state: "waiting" }, "asked-for").taskId).toBe("asked-for");
  });

  it("survives an empty or null payload", () => {
    const record = toTaskRecord(null, "t");
    expect(record.state).toBe("unknown");
    expect(record.resultUrls).toEqual([]);
    expect(record.model).toBeNull();
  });

  it("reads a failure's code and message", () => {
    const record = toTaskRecord(
      { state: "fail", failCode: "400", failMsg: "prompt rejected" },
      "t",
    );
    expect(record.state).toBe("fail");
    expect(record.failCode).toBe("400");
    expect(record.failMsg).toBe("prompt rejected");
  });
});

describe("pollDelayMs", () => {
  it("starts at the initial delay and grows", () => {
    expect(pollDelayMs(0)).toBe(DEFAULT_POLL_PACING.initialDelayMs);
    expect(pollDelayMs(1)).toBe(3_000);
    expect(pollDelayMs(2)).toBe(4_500);
  });

  it("never exceeds the cap", () => {
    expect(pollDelayMs(50)).toBe(DEFAULT_POLL_PACING.maxDelayMs);
  });

  it("clamps a negative attempt to the first delay", () => {
    expect(pollDelayMs(-3)).toBe(DEFAULT_POLL_PACING.initialDelayMs);
  });
});

describe("sanitizeFilename / safeFilenameFromUrl", () => {
  // The download directory is fixed by configuration; neither the remote URL
  // nor the caller's filename may escape it.
  it("strips path separators and traversal from a caller-supplied name", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc_passwd");
    expect(sanitizeFilename("/abs/path.png")).toBe("abs_path.png");
  });

  it("strips traversal reachable through a URL path", () => {
    expect(safeFilenameFromUrl("https://example.com/a/../../../etc/passwd", "fb")).toBe("passwd");
    expect(safeFilenameFromUrl("https://example.com/%2e%2e%2fescape.png", "fb")).toBe("escape.png");
  });

  it("prefers a caller-supplied name over the URL's", () => {
    expect(safeFilenameFromUrl("https://example.com/remote.png", "fb", "mine.png")).toBe("mine.png");
  });

  it("falls back to the URL's last segment, then to the fallback", () => {
    expect(safeFilenameFromUrl("https://example.com/x/hero.mp4?sig=abc", "fb")).toBe("hero.mp4");
    expect(safeFilenameFromUrl("https://example.com/", "fb")).toBe("fb");
    expect(safeFilenameFromUrl("not a url", "fb")).toBe("fb");
  });

  it("never returns an empty name", () => {
    expect(safeFilenameFromUrl("https://example.com/", "...", "///")).toBe("kie-result");
  });

  it("bounds the length", () => {
    expect(sanitizeFilename("a".repeat(500))).toHaveLength(120);
  });
});

describe("summarizeTask", () => {
  it("names the failure on a failed task", () => {
    const summary = summarizeTask(toTaskRecord({ taskId: "t", state: "fail", failMsg: "nope" }, "t"));
    expect(summary).toMatch(/State: fail/);
    expect(summary).toMatch(/nope/);
  });

  it("lists result URLs and the retention warning on success", () => {
    const summary = summarizeTask(
      toTaskRecord({ taskId: "t", state: "success", resultJson: '{"resultUrls":["https://a/b.png"]}' }, "t"),
    );
    expect(summary).toMatch(/https:\/\/a\/b.png/);
    expect(summary).toMatch(/14 days/);
  });

  it("says what an unknown state actually reported", () => {
    expect(summarizeTask(toTaskRecord({ taskId: "t", state: "throttled" }, "t"))).toMatch(
      /reported "throttled"/,
    );
  });
});
