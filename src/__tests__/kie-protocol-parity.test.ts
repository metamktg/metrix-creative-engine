/**
 * One Kie protocol. The skills' zero-dependency CLI (skills/metrix-ad-creative/scripts/kie.mjs,
 * byte-copied into kie-generate and kie-tasks) and the MCP server (src/protocol.ts, src/ledger.ts)
 * are two implementations of the same API, so this runs the real CLI against a stubbed Kie and
 * holds every outcome to what the server's protocol code says for the same response: which URLs
 * are results, which are frames, that a 200 with a failing body code is an error, that a failed
 * task fails, and that the ledger lines the CLI writes fold the same way the server's own do.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { foldLedger } from "../ledger.js";
import { extractFrameUrls, extractResultUrls, parseResultJson } from "../protocol.js";

const cli = fileURLToPath(new URL("../../skills/metrix-ad-creative/scripts/kie.mjs", import.meta.url));

// What recordInfo answers for the next task; createTask hands out ids in order.
let nextRecord: Record<string, unknown> = {};
let createBody: Record<string, unknown> = { code: 200, data: { taskId: "t-1" } };
let seenAuth = "";
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seenAuth = String(req.headers.authorization ?? "");
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/api/v1/jobs/createTask")) res.end(JSON.stringify(createBody));
    else if (req.url?.startsWith("/api/v1/jobs/recordInfo")) res.end(JSON.stringify({ code: 200, data: nextRecord }));
    else { res.statusCode = 404; res.end("{}"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function runCli(args: string[], ledger: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, KIE_AI_BASE_URL: base, KIE_AI_API_KEY: "test-key", KIE_AI_LEDGER_PATH: ledger },
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kie-parity-")), "ledger.jsonl");

const SHAPES: Array<[string, unknown]> = [
  ["a JSON string with results", JSON.stringify({ resultUrls: ["https://r.example/a.png", "https://r.example/b.png"] })],
  ["an object, not a string", { resultUrls: ["https://r.example/c.mp4"] }],
  ["results plus first and last frames", JSON.stringify({ resultUrls: ["https://r.example/v.mp4"], firstFrameUrl: ["https://r.example/f0.png"], lastFrameUrl: ["https://r.example/f1.png"] })],
  ["a non-array resultUrls, ignored rather than coerced", JSON.stringify({ resultUrls: "https://r.example/x.png" })],
  ["blank and non-string entries dropped", JSON.stringify({ resultUrls: ["", "  ", 7, "https://r.example/ok.png"] })],
  ["a string that is not JSON", "not json at all"],
];

describe("the skill CLI and the server agree on the Kie protocol", { timeout: 60000 }, () => {
  it.each(SHAPES)("success with %s: same results on stdout, same frames in the ledger", async (_label, resultJson) => {
    const ledger = tmp();
    nextRecord = { taskId: "t-1", model: "m-1", state: "success", resultJson, creditsConsumed: 4 };
    const r = await runCli(["run", "m-1", '{"prompt":"x"}', "--timeout", "30"], ledger);
    expect(r.status, r.stderr).toBe(0);
    expect(seenAuth).toBe("Bearer test-key");
    const parsed = parseResultJson(resultJson);
    const expected = extractResultUrls(parsed);
    expect(r.stdout.split("\n").filter(Boolean)).toEqual(expected);
    const lines = fs.readFileSync(ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.event)).toEqual(["created", "settled"]);
    expect(lines[1].resultUrls).toEqual([...expected, ...extractFrameUrls(parsed)]);
    // the server's ledger reader folds the CLI's lines into the same task, cost and state
    const [task] = foldLedger(fs.readFileSync(ledger, "utf8"), Date.now());
    expect(task).toMatchObject({ taskId: "t-1", model: "m-1", state: "success", credits: 4 });
  });

  it("a failed task fails, with the provider's message", async () => {
    nextRecord = { taskId: "t-1", model: "m-1", state: "fail", failMsg: "content rejected", failCode: "501" };
    const r = await runCli(["run", "m-1", '{"prompt":"x"}', "--timeout", "30"], tmp());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Generation failed: content rejected \(code 501\)/);
  });

  it("an HTTP 200 whose body code is an error is an error, with the documented hint", async () => {
    createBody = { code: 402, msg: "insufficient" };
    try {
      const r = await runCli(["start", "m-1", '{"prompt":"x"}'], tmp());
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Kie error \(HTTP 200, code 402\): insufficient/);
      expect(r.stderr).toMatch(/Insufficient credits/);
    } finally {
      createBody = { code: 200, data: { taskId: "t-1" } };
    }
  });
});
