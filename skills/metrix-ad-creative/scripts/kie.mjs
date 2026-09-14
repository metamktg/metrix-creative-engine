#!/usr/bin/env node
/**
 * kie.mjs — generate through the Kie.ai Market API. No install, no build, no
 * dependencies: Node's global fetch only. Works on Windows, macOS and Linux,
 * which is why this is Node rather than curl+jq (Windows has no jq).
 *
 *   node kie.mjs credits
 *   node kie.mjs run   <model> '<input-json>' [--timeout 600] [--out DIR]
 *   node kie.mjs start <model> '<input-json>'
 *   node kie.mjs poll  <taskId> [--timeout 600] [--out DIR]
 *
 * Needs KIE_AI_API_KEY in the environment. Get one at https://kie.ai/api-key
 */
const BASE = process.env.KIE_AI_BASE_URL || "https://api.kie.ai";
const KEY = process.env.KIE_AI_API_KEY;

const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
if (!KEY) die("KIE_AI_API_KEY is not set. Get a key at https://kie.ai/api-key and set it in your environment.");

const HINTS = {
  401: "Key is missing, wrong or revoked.",
  402: "Insufficient credits. Top up at https://kie.ai",
  404: "No task with that id.",
  422: "The model rejected these parameters. Check the model's page on docs.kie.ai.",
  429: "Rate limited. Kie allows 20 new generations per 10 seconds.",
  408: "Upstream produced no result for over 10 minutes.",
};

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
  } catch (e) {
    die(`Could not reach Kie.ai (${path}): ${e.message}`);
  }
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { die(`Kie.ai returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  // Kie puts its own code in the body: an HTTP 200 can still be a failure.
  const code = Number(body.code ?? res.status);
  if (!res.ok || (code && code !== 200)) {
    die(`Kie error (HTTP ${res.status}, code ${code}): ${body.msg || "no message"}${HINTS[code] ? "\n  " + HINTS[code] : ""}`);
  }
  return body.data;
}

/** resultJson is a JSON *string* whose shape is model-specific. */
function resultUrls(data) {
  let parsed = data?.resultJson ?? null;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return []; } }
  const urls = parsed?.resultUrls;
  return Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && u.trim()) : [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(taskId, timeoutSec, outDir) {
  const deadline = Date.now() + timeoutSec * 1000;
  let delay = 2000;
  for (;;) {
    await sleep(delay);
    const d = await call(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    const state = String(d?.state ?? "unknown");
    if (state === "success") {
      const urls = resultUrls(d);
      console.error(`done in ${d.costTime ? (d.costTime / 1000).toFixed(1) + "s" : "?"}, credits: ${d.creditsConsumed ?? "?"}`);
      urls.forEach((u) => console.log(u));
      if (outDir) await download(urls, outDir, taskId);
      if (!urls.length) console.error("WARNING: succeeded but carried no resultUrls. Raw:\n" + JSON.stringify(d.resultJson));
      return;
    }
    if (state === "fail") die(`Generation failed: ${d.failMsg || "no message"}${d.failCode ? ` (code ${d.failCode})` : ""}`);
    console.error(`  ${state}${d.progress != null ? ` ${d.progress}%` : ""}...`);
    if (Date.now() >= deadline) {
      die(`Timed out after ${timeoutSec}s. The task is STILL RUNNING on Kie.\n  Resume with: node kie.mjs poll ${taskId}`, 2);
    }
    delay = Math.min(15000, Math.round(delay * 1.5));
  }
}

async function download(urls, dir, taskId) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(dir, { recursive: true });
  for (const [i, url] of urls.entries()) {
    // The URL is remote input: reduce it to one safe path segment.
    let name = "";
    try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch {}
    name = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "").slice(0, 120) || `${taskId}-${i}`;
    const res = await fetch(url);
    if (!res.ok) { console.error(`  download failed (HTTP ${res.status}): ${url}`); continue; }
    const file = path.join(dir, name);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.error(`  saved ${file}`);
  }
}

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const timeout = Number(flag("--timeout", 300));
const outDir = flag("--out", process.env.KIE_AI_DOWNLOAD_DIR || null);
const [cmd, a, b] = argv;

if (cmd === "credits") {
  console.log(await call("/api/v1/chat/credit"));
} else if (cmd === "start" || cmd === "run") {
  if (!a || !b) die(`usage: node kie.mjs ${cmd} <model> '<input-json>'`);
  let input;
  try { input = JSON.parse(b); } catch { die(`input must be valid JSON, got: ${b}`); }
  const d = await call("/api/v1/jobs/createTask", { method: "POST", body: JSON.stringify({ model: a, input }) });
  const taskId = d?.taskId;
  if (!taskId) die("Kie accepted the task but returned no taskId.");
  console.error(`task: ${taskId}`);
  if (cmd === "start") console.log(taskId);
  else await poll(taskId, timeout, outDir);
} else if (cmd === "poll") {
  if (!a) die("usage: node kie.mjs poll <taskId>");
  await poll(a, timeout, outDir);
} else {
  die("usage: node kie.mjs credits | run <model> '<json>' | start <model> '<json>' | poll <taskId>   [--timeout N] [--out DIR]");
}
