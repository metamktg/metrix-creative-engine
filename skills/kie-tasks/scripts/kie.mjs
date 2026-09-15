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


/**
 * Upload a local file so a reference-capable model can consume it.
 *
 * Kie's docs contradict themselves on the host: every prose example uses
 * kieai.redpandaai.co, the OpenAPI servers block says api.kie.ai. Rather than
 * pick one and be wrong half the time, try both and report which answered.
 * They also disagree on the response shape, so read downloadUrl OR fileUrl,
 * the only two URL fields either shape documents.
 */
const UPLOAD_HOSTS = [
  process.env.KIE_AI_UPLOAD_BASE_URL,
  "https://kieai.redpandaai.co",
  "https://api.kie.ai",
].filter(Boolean);

async function upload(filePath, uploadPath) {
  const { readFile } = await import("node:fs/promises");
  const pathMod = await import("node:path");
  let bytes;
  try { bytes = await readFile(filePath); }
  catch (e) { die(`cannot read ${filePath}: ${e.message}`); }

  const name = pathMod.basename(filePath);
  const problems = [];
  for (const host of UPLOAD_HOSTS) {
    const form = new FormData();
    form.append("file", new Blob([bytes]), name);
    form.append("uploadPath", uploadPath);
    form.append("fileName", name);
    let res;
    try {
      res = await fetch(`${host}/api/file-stream-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}` }, // no Content-Type: fetch sets the boundary
        body: form,
      });
    } catch (e) { problems.push(`${host}: ${e.message}`); continue; }

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { problems.push(`${host}: non-JSON (HTTP ${res.status}) ${text.slice(0,120)}`); continue; }
    const code = Number(body.code ?? res.status);
    if (!res.ok || (code && code !== 200)) {
      problems.push(`${host}: HTTP ${res.status} code ${code} ${body.msg || ""}`.trim());
      continue;
    }
    const d = body.data || {};
    const url = d.downloadUrl || d.fileUrl;
    if (!url) { problems.push(`${host}: succeeded but returned no downloadUrl or fileUrl`); continue; }
    console.error(`uploaded via ${host}${d.expiresAt ? `, expires ${d.expiresAt}` : ""}`);
    console.error("NOTE: Kie documents this URL as lasting 24 hours in one place and 3 days in");
    console.error("      another. Upload immediately before the generation that consumes it.");
    return url;
  }
  die(`upload failed on every documented host:\n  ${problems.join("\n  ")}`);
}

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const timeout = Number(flag("--timeout", 300));
const outDir = flag("--out", process.env.KIE_AI_DOWNLOAD_DIR || null);
const [cmd, a, b] = argv;

if (cmd === "credits") {
  console.log(await call("/api/v1/chat/credit"));
} else if (cmd === "start" || cmd === "run") {
  // --input-file avoids shell quoting entirely. cmd.exe cannot pass a JSON
  // literal without backslash-escaping every quote, which is the single most
  // likely way a first run fails on Windows.
  const inputFile = flag("--input-file", null);
  if (!a) die(`usage: node kie.mjs ${cmd} <model> '<input-json>'  |  ${cmd} <model> --input-file spec.json`);
  let raw = b;
  if (inputFile) {
    const { readFileSync } = await import("node:fs");
    try { raw = readFileSync(inputFile, "utf8"); } catch (e) { die(`cannot read ${inputFile}: ${e.message}`); }
  }
  if (!raw) die(`no input. Pass JSON as the third argument, or --input-file <path>.`);
  let input;
  try { input = JSON.parse(raw); } catch { die(`input must be valid JSON, got: ${String(raw).slice(0, 120)}`); }
  const d = await call("/api/v1/jobs/createTask", { method: "POST", body: JSON.stringify({ model: a, input }) });
  const taskId = d?.taskId;
  if (!taskId) die("Kie accepted the task but returned no taskId.");
  console.error(`task: ${taskId}`);
  if (cmd === "start") console.log(taskId);
  else await poll(taskId, timeout, outDir);
} else if (cmd === "upload") {
  if (!a) die("usage: node kie.mjs upload <file> [--path images/user-uploads]");
  console.log(await upload(a, flag("--path", "images/user-uploads")));
} else if (cmd === "poll") {
  if (!a) die("usage: node kie.mjs poll <taskId>");
  await poll(a, timeout, outDir);
} else {
  die("usage: node kie.mjs credits | upload <file> | run <model> '<json>' | start <model> '<json>' | poll <taskId>   [--timeout N] [--out DIR]");
}
