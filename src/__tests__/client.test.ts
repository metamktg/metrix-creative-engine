import { describe, expect, it, vi } from "vitest";

import { KieClient, type FetchLike } from "../client.js";
import { KieApiError } from "../protocol.js";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch double that replays a queue of responses and records every call. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>): {
  fetchImpl: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return new Response(text, { status: next.status ?? 200 });
  };
  return { fetchImpl, calls };
}

function clientWith(responses: Array<{ status?: number; body: unknown }>) {
  const { fetchImpl, calls } = fakeFetch(responses);
  return { client: new KieClient({ apiKey: "secret-key", fetchImpl }), calls };
}

describe("constructor", () => {
  it("refuses an empty API key rather than failing on the first call", () => {
    expect(() => new KieClient({ apiKey: "  " })).toThrow(/API key is required/);
  });
});

describe("createTask", () => {
  it("posts model and input to the documented endpoint and returns the taskId", async () => {
    const { client, calls } = clientWith([{ body: { code: 200, msg: "success", data: { taskId: "task_9" } } }]);

    const taskId = await client.createTask({
      model: "google/nano-banana",
      input: { prompt: "a cat" },
    });

    expect(taskId).toBe("task_9");
    expect(calls[0].url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      model: "google/nano-banana",
      input: { prompt: "a cat" },
    });
  });

  it("sends the API key as a bearer token and never in the URL", async () => {
    const { client, calls } = clientWith([{ body: { code: 200, data: { taskId: "t" } } }]);
    await client.createTask({ model: "m", input: {} });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    expect(calls[0].url).not.toContain("secret-key");
  });

  it("omits callBackUrl unless one was given", async () => {
    const { client, calls } = clientWith([{ body: { code: 200, data: { taskId: "t" } } }]);
    await client.createTask({ model: "m", input: {}, callBackUrl: "https://hook.example/cb" });
    expect(JSON.parse(String(calls[0].init?.body)).callBackUrl).toBe("https://hook.example/cb");
  });

  it("fails loudly when the API accepts the task but returns no taskId", async () => {
    const { client } = clientWith([{ body: { code: 200, data: {} } }]);
    await expect(client.createTask({ model: "m", input: {} })).rejects.toThrow(/no taskId/);
  });

  it("surfaces a rate limit sent as an envelope code under HTTP 200", async () => {
    const { client } = clientWith([{ body: { code: 429, msg: "slow down" } }]);
    await expect(client.createTask({ model: "m", input: {} })).rejects.toThrow(/rate limited/i);
  });

  it("reports a non-JSON body instead of throwing a parse error", async () => {
    const { client } = clientWith([{ status: 502, body: "<html>gateway</html>" }]);
    await expect(client.createTask({ model: "m", input: {} })).rejects.toThrow(/non-JSON/);
  });

  it("wraps a transport failure as a KieApiError naming the endpoint", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = new KieClient({ apiKey: "k", fetchImpl });
    await expect(client.createTask({ model: "m", input: {} })).rejects.toBeInstanceOf(KieApiError);
  });
});

describe("getTask", () => {
  it("queries recordInfo by taskId and normalizes the record", async () => {
    const { client, calls } = clientWith([
      {
        body: {
          code: 200,
          data: {
            taskId: "task_9",
            state: "success",
            resultJson: '{"resultUrls":["https://cdn.example/out.png"]}',
          },
        },
      },
    ]);

    const record = await client.getTask("task_9");

    expect(calls[0].url).toBe("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_9");
    expect(record.state).toBe("success");
    expect(record.resultUrls).toEqual(["https://cdn.example/out.png"]);
  });
});

describe("getCredits", () => {
  it("reads the bare integer the credit endpoint puts in data", async () => {
    const { client, calls } = clientWith([{ body: { code: 200, msg: "success", data: 137 } }]);
    await expect(client.getCredits()).resolves.toBe(137);
    expect(calls[0].url).toBe("https://api.kie.ai/api/v1/chat/credit");
  });

  it("rejects an unreadable balance rather than reporting NaN credits", async () => {
    const { client } = clientWith([{ body: { code: 200, data: "plenty" } }]);
    await expect(client.getCredits()).rejects.toThrow(/unreadable credit balance/);
  });
});

describe("waitForTask", () => {
  it("polls until the task settles", async () => {
    vi.useFakeTimers();
    try {
      const { client, calls } = clientWith([
        { body: { code: 200, data: { state: "waiting" } } },
        { body: { code: 200, data: { state: "generating" } } },
        { body: { code: 200, data: { state: "success", resultJson: '{"resultUrls":["https://a/x"]}' } } },
      ]);

      const pending = client.waitForTask("t", { timeoutMs: 600_000 });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.timedOut).toBe(false);
      expect(result.polls).toBe(3);
      expect(result.record.resultUrls).toEqual(["https://a/x"]);
      expect(calls).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  // A deadline that passes is not a failed generation: the task is still
  // running on Kie's side, so the caller gets the taskId back to resume on.
  it("returns the last record with timedOut instead of throwing", async () => {
    vi.useFakeTimers();
    try {
      const { client } = clientWith([{ body: { code: 200, data: { state: "generating" } } }]);

      const pending = client.waitForTask("t", { timeoutMs: 1_000 });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.timedOut).toBe(true);
      expect(result.record.state).toBe("generating");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops on a failed task and keeps the failure message", async () => {
    const { client } = clientWith([
      { body: { code: 200, data: { state: "fail", failMsg: "content policy" } } },
    ]);
    const result = await client.waitForTask("t", { timeoutMs: 10_000 });
    expect(result.timedOut).toBe(false);
    expect(result.record.failMsg).toBe("content policy");
  });

  it("keeps polling through an unrecognised state until the deadline", async () => {
    vi.useFakeTimers();
    try {
      const { client } = clientWith([{ body: { code: 200, data: { state: "throttled" } } }]);
      const pending = client.waitForTask("t", { timeoutMs: 5_000 });
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.timedOut).toBe(true);
      expect(result.record.state).toBe("unknown");
    } finally {
      vi.useRealTimers();
    }
  });
});
