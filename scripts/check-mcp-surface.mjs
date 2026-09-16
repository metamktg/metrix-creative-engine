#!/usr/bin/env node
/**
 * check-mcp-surface — drive the BUILT server over a real stdio MCP session.
 *
 * Every other check in this repo tests a function. None of them proves the
 * thing an MCP client actually meets: that the bundle starts, negotiates,
 * advertises the capabilities it should, and answers tools/list, resources/read,
 * prompts/get and tools/call with the shapes it promised. A tool can be
 * perfectly unit-tested and still be invisible because its capability was never
 * advertised, or unusable because its outputSchema and its structuredContent
 * disagree — the SDK validates that at call time, so it fails in front of a
 * user, not in a test.
 *
 * Kie is stubbed on localhost, so this spends no credits and needs no API key.
 *
 * Usage: node scripts/check-mcp-surface.mjs      (run `pnpm run build` first)
 * Exit 0 all checks passed / 1 a check failed.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(repoRoot, "dist", "index.js");
const STUB_PORT = 8799;

// ---------------------------------------------------------------- Kie stub
let reads = 0;
const stub = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (body) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/v1/jobs/createTask") {
    req.resume();
    req.on("end", () => json({ code: 200, msg: "ok", data: { taskId: "task_demo" } }));
    return;
  }
  if (url.pathname === "/api/v1/jobs/recordInfo") {
    reads += 1;
    // Settle on the third read, so progress has to fire more than once.
    const done = reads >= 3;
    return json({
      code: 200,
      msg: "ok",
      data: {
        taskId: "task_demo",
        model: "google/nano-banana",
        state: done ? "success" : "generating",
        progress: done ? 100 : 40,
        costTime: done ? 4200 : null,
        creditsConsumed: done ? 14 : null,
        param: '{"model":"google/nano-banana","input":{"prompt":"p","aspect_ratio":"4:5"}}',
        updateTime: 1698765432000,
        resultJson: done ? JSON.stringify({ resultUrls: ["https://cdn.example/a.jpg"] }) : "",
      },
    });
  }
  if (url.pathname === "/api/v1/chat/credit") return json({ code: 200, msg: "ok", data: 9876 });
  res.statusCode = 404;
  json({ code: 404, msg: "no such endpoint on the stub" });
});

await new Promise((resolve, reject) => {
  stub.once("error", reject);
  stub.listen(STUB_PORT, "127.0.0.1", resolve);
});

// ------------------------------------------------------------- MCP session
const downloadDir = await mkdtemp(path.join(tmpdir(), "kie-mcp-surface-"));
const child = spawn("node", [bundle], {
  env: {
    ...process.env,
    KIE_AI_API_KEY: "stub-key-not-a-real-credential",
    KIE_AI_BASE_URL: `http://127.0.0.1:${STUB_PORT}`,
    KIE_AI_DOWNLOAD_DIR: downloadDir,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrText = "";
child.stderr.on("data", (chunk) => {
  stderrText += chunk;
});

const pending = new Map();
const notifications = [];
let strayStdout = null;
createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    // stdout belongs to the protocol: one stray log corrupts the stream.
    strayStdout ??= line.slice(0, 200);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.method) {
    notifications.push(message);
  }
});

let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 30_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "check-mcp-surface", version: "1" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);

  console.log("\n== Handshake ==");
  check("initialize succeeded", Boolean(init.result), init.error && JSON.stringify(init.error));
  const capabilities = init.result?.capabilities ?? {};
  check("advertises tools", Boolean(capabilities.tools));
  check("advertises resources", Boolean(capabilities.resources));
  check("advertises prompts", Boolean(capabilities.prompts));

  console.log("\n== Tools ==");
  const tools = (await rpc("tools/list", {})).result?.tools ?? [];
  check("all seven tools listed", tools.length === 7, `${tools.length} listed`);
  const typed = tools.filter((tool) => tool.outputSchema);
  check("every tool declares an outputSchema", typed.length === tools.length, `${typed.length}/${tools.length}`);

  console.log("\n== Resources ==");
  const resources = (await rpc("resources/list", {})).result?.resources ?? [];
  check("both reference documents listed", resources.length === 2, resources.map((r) => r.uri).join(", "));
  const catalog = await rpc("resources/read", { uri: "kie://model-catalog" });
  const catalogText = catalog.result?.contents?.[0]?.text ?? "";
  check(
    "the catalog reads back inlined, not empty",
    catalogText.includes("google/nano-banana"),
    `${catalogText.length} chars`,
  );

  console.log("\n== Prompts ==");
  const prompts = (await rpc("prompts/list", {})).result?.prompts ?? [];
  check("six format prompts plus brand intake and MST", prompts.length === 8, `${prompts.length} listed`);
  const rendered = await rpc("prompts/get", {
    name: "kie_render_static",
    arguments: { brief: '{"asset_type":"static"}' },
  });
  const promptText = rendered.result?.messages?.[0]?.content?.text ?? "";
  check("a render prompt assembles the whole workflow", promptText.length > 15_000, `${promptText.length} chars`);
  check("the supplied brief reaches the prompt", promptText.includes('"asset_type":"static"'));

  console.log("\n== Brief gate ==");
  // The gate that protects spend. Exercised through the JSON-string path,
  // which is how a caller pasting a brief actually reaches it.
  const gate = await rpc("tools/call", {
    name: "kie_validate_brief",
    arguments: { brief: JSON.stringify({ brief_metadata: { brief_id: "x", asset_type: "hologram", confidence: "medium" } }) },
  });
  const verdict = gate.result?.structuredContent;
  check("an unmapped asset_type is refused", verdict?.ok === false);
  check("the refusal names the closed set", (verdict?.errors ?? []).join(" ").includes("static, carousel, video"));

  // The brief comes from IAP already validated, so its dialect is normalized
  // rather than refused. This asserts the normalization survives the bundle and
  // the JSON-string path, not just the unit test.
  const dialect = await rpc("tools/call", {
    name: "kie_validate_brief",
    arguments: {
      brief: JSON.stringify({
        brief_metadata: { brief_id: "ECAS_C1A_001", asset_type: "static_4x5", mode: "MST_matrix_cell", confidence: "medium" },
        creative_specifications: { placement: "Feed" },
        visual_direction: { composition: "Framed print on a panelled wall", imagery: "Painted city scene, legible street nameplate" },
        testing_framework: { isolated_variable: "HK_Problem" },
        brand_assets: [{ role: "product_front", url: "https://cdn.example/print.png" }],
      }),
    },
  });
  const dv = dialect.result?.structuredContent;
  check("an IAP dialect brief renders instead of stopping", dv?.ok === true);
  check("static_4x5 is read as a static at 4:5", (dv?.warnings ?? []).join(" ").includes("4:5"));

  console.log("\n== Structured output and progress ==");
  const call = await rpc("tools/call", {
    name: "kie_run_task",
    arguments: { model: "google/nano-banana", input: { prompt: "p" }, timeoutSeconds: 60 },
    _meta: { progressToken: "surface-check" },
  });
  const structured = call.result?.structuredContent;
  check("tools/call returns structuredContent", Boolean(structured));
  check(
    "resultUrls is an array, not prose to be re-parsed",
    structured?.task?.resultUrls?.[0] === "https://cdn.example/a.jpg",
  );
  check("param survives as the parsed request that made the asset", structured?.task?.param?.input?.aspect_ratio === "4:5");
  check("timedOut is a boolean, so a timeout is not confused with a failure", structured?.timedOut === false);
  check("a text summary remains for clients that read no schema", Boolean(call.result?.content?.[0]?.text));

  const progress = notifications.filter((note) => note.method === "notifications/progress");
  check("progress was reported during the wait", progress.length >= 2, `${progress.length} notifications`);
  const values = progress.map((note) => note.params.progress);
  check(
    "progress never goes backwards",
    values.every((value, index) => index === 0 || value >= values[index - 1]),
    values.join(" -> "),
  );
  check("each carries the client's token", progress.every((note) => note.params.progressToken === "surface-check"));
  check("each says what the task is doing", progress.every((note) => typeof note.params.message === "string" && note.params.message));

  console.log("\n== Transport hygiene ==");
  check("nothing but JSON-RPC was written to stdout", strayStdout === null, strayStdout ?? "");
  check("the server reported readiness on stderr", stderrText.includes("ready"));
} finally {
  child.kill();
  stub.close();
}

console.log(`\n${failures === 0 ? "MCP surface OK" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
