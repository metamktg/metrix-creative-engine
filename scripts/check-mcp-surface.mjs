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
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(repoRoot, "dist", "index.js");

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
  stub.listen(0, "127.0.0.1", resolve);
});
const stubAddress = stub.address();
if (!stubAddress || typeof stubAddress === "string") throw new Error("Kie stub did not bind a TCP port");
const stubPort = stubAddress.port;

// ------------------------------------------------------------- MCP session
const downloadDir = await mkdtemp(path.join(tmpdir(), "kie-mcp-surface-"));
const child = spawn("node", [bundle], {
  env: {
    ...process.env,
    KIE_AI_API_KEY: "stub-key-not-a-real-credential",
    KIE_AI_BASE_URL: `http://127.0.0.1:${stubPort}`,
    KIE_AI_DOWNLOAD_DIR: downloadDir,
    KIE_AI_LEDGER_PATH: path.join(downloadDir, "tasks.jsonl"),
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
  const instructions = init.result?.instructions ?? "";
  check("handshake routes creator workflows to prompts and on-demand references",
    ["kie_render_ugc", "kie_render_ai_ugc", "kie_render_video", "kie://ugc-creative-playbook", "kie://production-review-standard"].every((route) => instructions.includes(route)));
  check("handshake keeps workflow routing concise", instructions.length > 0 && instructions.length < 1000);

  console.log("\n== Tools ==");
  const tools = (await rpc("tools/list", {})).result?.tools ?? [];
  // Named, not counted: a count passes when one tool is swapped for another,
  // and this check exists to catch a tool that stopped being registered.
  const EXPECTED_TOOLS = [
    "kie_validate_brief",
    "kie_validate_ugc_preproduction",
    "kie_create_ugc_lipsync",
    "kie_get_credits",
    "kie_create_task",
    "kie_get_task",
    "kie_wait_for_task",
    "kie_run_task",
    "kie_ledger",
    "kie_download_result",
  ];
  const listed = new Set(tools.map((tool) => tool.name));
  const missing = EXPECTED_TOOLS.filter((name) => !listed.has(name));
  const extra = [...listed].filter((name) => !EXPECTED_TOOLS.includes(name));
  check(
    "every expected tool is listed, and nothing unexpected",
    missing.length === 0 && extra.length === 0,
    missing.length || extra.length ? `missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}` : `${tools.length} listed`,
  );
  const typed = tools.filter((tool) => tool.outputSchema);
  check("every tool declares an outputSchema", typed.length === tools.length, `${typed.length}/${tools.length}`);
  const ugcMissing = await rpc("tools/call", { name: "kie_validate_ugc_preproduction", arguments: { packetPath: path.join(downloadDir, "missing-packet.json") } });
  check("UGC offline preflight returns typed blocked evidence for missing packet", ugcMissing.result?.structuredContent?.ok === false && ugcMissing.result?.structuredContent?.errors?.length > 0);
  const ugcBlocked = await rpc("tools/call", { name: "kie_create_ugc_lipsync", arguments: { packetPath: path.join(downloadDir, "missing-packet.json") } });
  check("UGC guarded submit refuses missing dependencies", ugcBlocked.result?.isError === true);

  console.log("\n== Resources ==");
  const resources = (await rpc("resources/list", {})).result?.resources ?? [];
  const expectedResources = ["kie://model-catalog", "kie://format-routing", "kie://production-review-standard", "kie://ugc-creative-playbook", "kie://ugc-preproduction"];
  const resourceUris = resources.map((resource) => resource.uri);
  check(
    "all five reference documents are listed, with no substitution",
    resourceUris.length === expectedResources.length && expectedResources.every((uri) => resourceUris.includes(uri)),
    resourceUris.join(", "),
  );
  const catalog = await rpc("resources/read", { uri: "kie://model-catalog" });
  const preproduction = await rpc("resources/read", { uri: "kie://ugc-preproduction" });
  const preproductionText = preproduction.result?.contents?.[0]?.text ?? "";
  check("preproduction contract and incomplete template are readable without repository access", preproductionText.includes("kie_create_ugc_lipsync") && preproductionText.includes('"accepted_bindings"') && preproductionText.includes("INCOMPLETE TEMPLATE"));
  const catalogText = catalog.result?.contents?.[0]?.text ?? "";
  check(
    "the catalog reads back inlined, not empty",
    catalogText.includes("google/nano-banana"),
    `${catalogText.length} chars`,
  );
  const productionStandard = await rpc("resources/read", { uri: "kie://production-review-standard" });
  const standardText = productionStandard.result?.contents?.[0]?.text ?? "";
  const productionGates = ["iap_variables", "communications", "sound_check", "editorial_peer", "blind_review"];
  check(
    "the production standard resource serves the complete five-gate contract",
    standardText.length > 500 && productionGates.every((gate) => standardText.includes(gate)),
    `${standardText.length} chars`,
  );
  const creativePlaybook = await rpc("resources/read", { uri: "kie://ugc-creative-playbook" });
  const playbookText = creativePlaybook.result?.contents?.[0]?.text ?? "";
  const expectedPlaybook = await readFile(path.join(repoRoot, "docs", "UGC_CREATIVE_PLAYBOOK.md"), "utf8");
  const creativeDirection = await readFile(path.join(repoRoot, "prompts", "07-ugc-creative-direction.md"), "utf8");
  check(
    "the creative playbook resource serves the complete source document",
    playbookText.length > 1000 && playbookText === expectedPlaybook,
    `${playbookText.length} chars`,
  );

  console.log("\n== Prompts ==");
  const prompts = (await rpc("prompts/list", {})).result?.prompts ?? [];
  check("seven format prompts plus brand intake and MST", prompts.length === 9, `${prompts.length} listed`);
  const rendered = await rpc("prompts/get", {
    name: "kie_render_static",
    arguments: { brief: '{"asset_type":"static"}' },
  });
  const promptText = rendered.result?.messages?.[0]?.content?.text ?? "";
  check("a render prompt assembles the whole workflow", promptText.length > 15_000, `${promptText.length} chars`);
  check("the supplied brief reaches the prompt", promptText.includes('"asset_type":"static"'));

  // Read the runtime prompt over MCP, not its source file. Installing a skill
  // without importing its review stage used to leave these checks invisible.
  const productionMarker = "# Stage 6: Mandatory production review for UGC and video";
  for (const format of ["static", "carousel", "motion_graphic", "claymation", "ugc", "ai_ugc", "video"]) {
    const result = format === "static" ? rendered : await rpc("prompts/get", { name: `kie_render_${format}`, arguments: {} });
    const text = result.result?.messages?.[0]?.content?.text ?? "";
    const requiresProductionReview = format === "ugc" || format === "ai_ugc" || format === "video";
    const description = prompts.find((prompt) => prompt.name === `kie_render_${format}`)?.description ?? "";
    check(
      `${format} advertises the additional presentation gates only when applicable`,
      description.includes("five evidence-bound presentation gates") === requiresProductionReview,
    );
    check(
      `${format} loads the production-review module only when applicable`,
      text.includes(productionMarker) === requiresProductionReview,
    );
    check(
      `${format} loads the short creative-direction module only when applicable`,
      creativeDirection.trim().length > 100 && text.includes(creativeDirection) === requiresProductionReview,
    );
    check(`${format} does not inject the complete playbook`, !text.includes(expectedPlaybook));
    if (requiresProductionReview) {
      // ai_ugc shares the UGC format module; the rest of the assembly keeps its existing order.
      const formatFile = format === "ai_ugc" ? "ugc" : format;
      const previousSections = await Promise.all([
        "prompts/00-core.md", "prompts/02-render-bridge.md", `prompts/formats/${formatFile}.md`,
        "prompts/04-self-validation.md", "prompts/06-production-review.md",
      ].map((file) => readFile(path.join(repoRoot, file), "utf8")));
      const previousPrompt = previousSections.join("\n\n---\n\n");
      check(
        `${format} adds exactly the short module to the preserved baseline assembly`,
        text === `${previousPrompt}\n\n---\n\n${creativeDirection}`,
        `${previousPrompt.length} -> ${text.length} chars; delta +${text.length - previousPrompt.length}`,
      );
      check(`${format} points to the on-demand creative playbook`, text.includes("kie://ugc-creative-playbook"));
      check(`${format} carries every mandatory gate`, productionGates.every((gate) => text.includes(gate)));
      check(`${format} requires an explicit background-music decision`, text.includes("Make an explicit background-music decision."));
      check(`${format} points to the detailed review resource`, text.includes("kie://production-review-standard"));
    }
    check(
      `${format} keeps the complete production standard on demand`,
      standardText.length > 500 && !text.includes(standardText),
    );
  }

  for (const name of ["kie_brand_intake", "kie_mst_sprint"]) {
    const result = await rpc("prompts/get", { name, arguments: {} });
    const text = result.result?.messages?.[0]?.content?.text ?? "";
    check(`${name} does not load UGC-specific creative direction`, !text.includes(creativeDirection));
    check(`${name} does not inject the complete playbook`, !text.includes(expectedPlaybook));
  }

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
        brief_metadata: { brief_id: "creative-001", asset_type: "static_4x5", mode: "MST_matrix_cell", confidence: "medium" },
        creative_specifications: { placement: "Feed" },
        visual_direction: { composition: "Approved subject in a neutral setting", imagery: "Accurate reference details and clear visual hierarchy" },
        testing_framework: { isolated_variable: "HK_Problem" },
        brand_assets: [{ role: "product_front", url: "https://cdn.example/reference.png" }],
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

  // The ledger is the recovery path for a batch read after Kie's ~24h result
  // window closes. It is only worth having if the run that spent the credits
  // actually wrote to it, which is what this asserts: the run above, not a
  // fixture.
  console.log("\n== Task ledger ==");
  const led = await rpc("tools/call", { name: "kie_ledger", arguments: {} });
  const ledger = led.result?.structuredContent;
  const logged = (ledger?.tasks ?? []).find((t) => t.taskId === structured?.task?.taskId);
  check("the run that spent credits was recorded", Boolean(logged));
  check("it carries the model it ran on", logged?.model === "google/nano-banana");
  check("it settled, not merely created", logged?.state === "success");
  check("its result urls were kept", (logged?.resultUrls ?? []).length > 0);
  check("a fresh task is inside the result window", logged?.recoverable === true);
  check("the ledger names its own file", typeof ledger?.ledgerPath === "string");

  const filtered = await rpc("tools/call", {
    name: "kie_ledger",
    arguments: { model: "a-model-nothing-ran-on" },
  });
  check("filtering by a model with no tasks returns none, not everything",
    (filtered.result?.structuredContent?.tasks ?? []).length === 0);

  console.log("\n== Transport hygiene ==");
  check("nothing but JSON-RPC was written to stdout", strayStdout === null, strayStdout ?? "");
  check("the server reported readiness on stderr", stderrText.includes("ready"));
} finally {
  child.kill();
  stub.close();
}

console.log(`\n${failures === 0 ? "MCP surface OK" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
