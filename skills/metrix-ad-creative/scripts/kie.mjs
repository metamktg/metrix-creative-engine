#!/usr/bin/env node
/**
 * kie.mjs — generate through the Kie.ai Market API. No install, no build, no
 * dependencies: Node's global fetch only. Works on Windows, macOS and Linux,
 * which is why this is Node rather than curl+jq (Windows has no jq).
 *
 *   node kie.mjs credits
 *   node kie.mjs run   <model> '<input-json>' [--timeout 600] [--out DIR] [--name ID]
 *   node kie.mjs start <model> '<input-json>'
 *   node kie.mjs poll  <taskId> [--timeout 600] [--out DIR] [--name ID]
 *
 * Needs KIE_AI_API_KEY in the environment. Get one at https://kie.ai/api-key
 */
const BASE = process.env.KIE_AI_BASE_URL || "https://api.kie.ai";
const KEY = process.env.KIE_AI_API_KEY;

const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
// Deferred, not top-level: `ledger` reads a local file and must work without a
// key. The ledger IS the recovery path, so gating it behind a credential is
// exactly backwards on the morning you need it.
const requireKey = () => {
  if (!KEY) die("KIE_AI_API_KEY is not set. Get a key at https://kie.ai/api-key and set it in your environment.");
};

// Transcribed from the `code` enum in
// https://docs.kie.ai/market/common/get-task-detail. No rate-limit figure is
// quoted: Kie documents that 429 means the limit was exceeded, but publishes no
// number, and a hint that invents one sends you to tune the wrong thing.
const HINTS = {
  400: "A required parameter is missing or invalid.",
  401: "Key is missing, wrong or revoked.",
  402: "Insufficient credits. Top up at https://kie.ai",
  404: "No task with that id.",
  408: "Upstream produced no result for over 10 minutes.",
  422: "The model rejected these parameters. Check the model's page on docs.kie.ai.",
  429: "Rate limited. Pace the batch and retry.",
  455: "Kie is under maintenance.",
  500: "Kie server error.",
  501: "Generation failed: the task failed, not the request.",
  505: "That feature is currently disabled on Kie.",
};

// https://docs.kie.ai/market/common/get-task-detail, Best Practices:
// "Generated content URLs typically expire after 24 hours."
const RETENTION = "NOTE: Kie documents result URLs as expiring after about 24 hours. Save anything you need to keep.";

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
function parseResultJson(data) {
  let parsed = data?.resultJson ?? null;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { return null; } }
  return parsed;
}

// The spec types resultUrls, firstFrameUrl and lastFrameUrl all as arrays.
// Anything else is left alone rather than coerced; the raw resultJson is
// printed by the no-results warning, where an unexpected shape shows as itself.
function urlsAt(parsed, field) {
  const v = parsed?.[field];
  return Array.isArray(v) ? v.filter((u) => typeof u === "string" && u.trim()) : [];
}

function resultUrls(data) {
  return urlsAt(parseResultJson(data), "resultUrls");
}

/** The two other URL-bearing fields the recordInfo spec documents. */
function frameUrls(data) {
  const parsed = parseResultJson(data);
  return [...urlsAt(parsed, "firstFrameUrl"), ...urlsAt(parsed, "lastFrameUrl")];
}

/**
 * The task ledger. Kie's result URLs expire in about 24 hours; the taskId does
 * not, and re-polling it re-issues a URL. So every create and every settle is
 * appended to one JSONL file. A batch rendered overnight and read the next
 * morning is recoverable from this file and unrecoverable without it.
 *
 * Append-only, and never fatal: a ledger that cannot be written is a warning on
 * stderr. Losing the record of a task is bad; losing the task is worse.
 */
const LEDGER_OFF = process.env.KIE_AI_LEDGER_PATH?.trim().toLowerCase() === "off";

/** Resolved lazily: `path` is imported per call site in this file, not at top level. */
async function ledgerPath() {
  if (LEDGER_OFF) return null;
  const p = (await import("node:path")).default;
  const configured = process.env.KIE_AI_LEDGER_PATH?.trim();
  if (configured) return p.resolve(configured);
  return p.resolve(process.env.KIE_AI_DOWNLOAD_DIR?.trim() || "./out", "kie-ledger.jsonl");
}

async function ledger(event, fields) {
  const file = await ledgerPath();
  if (!file) return;
  try {
    const p = (await import("node:path")).default;
    const { mkdirSync, appendFileSync } = await import("node:fs");
    mkdirSync(p.dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + "\n", "utf8");
  } catch (e) {
    console.error(`  WARNING: could not write the ledger (${e.message}). The task is fine; its record is not.`);
  }
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
      await ledger("settled", {
        taskId,
        model: d?.model ?? "unknown",
        state,
        resultUrls: [...urls, ...frameUrls(d)],
        name: wantedName ?? undefined,
        credits: d?.creditsConsumed ?? undefined,
      });
      console.error(`done in ${d.costTime ? (d.costTime / 1000).toFixed(1) + "s" : "?"}, credits: ${d.creditsConsumed ?? "?"}`);
      urls.forEach((u) => console.log(u));
      // firstFrameUrl / lastFrameUrl are documented beside resultUrls (Seedance 2
      // with return_last_frame). Reported, never downloaded as if they were the
      // asset, and never printed to stdout where they would be read as results.
      const frames = frameUrls(d);
      if (frames.length) console.error(`  frames (not the asset): ${frames.join(" ")}`);
      if (urls.length) console.error("  " + RETENTION);
      if (outDir) await download(urls, outDir, taskId, wantedName);
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

async function download(urls, dir, taskId, preferredName) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(dir, { recursive: true });
  for (const [i, url] of urls.entries()) {
    // The URL is remote input: reduce it to one safe path segment.
    let name = "";
    try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch {}
    name = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "").slice(0, 120) || `${taskId}-${i}`;
    // A caller-supplied name wins, so an asset can be filed under its concept
    // or MST id rather than whatever the CDN called it. Sanitized the same way:
    // it is still untrusted input and must stay one path segment.
    if (preferredName) {
      // The extension comes off the delivered file, never off the requested
      // name: a brief that asks for "..._4x5.png" from a model that returns jpg
      // used to produce "..._4x5.png.jpg", and with several URLs
      // "..._4x5.png-1.jpg". The stem is the caller's, the suffix is the file's.
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
      let stem = preferredName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^[._]+/, "").slice(0, 160);
      stem = stem.replace(/\.(png|jpe?g|webp|gif|mp4|mov|webm|m4a|mp3|wav)$/i, "");
      if (stem) name = urls.length > 1 ? `${stem}-${i + 1}${ext}` : `${stem}${ext}`;
    }
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
 * Kie's own docs disagree on the host, and the disagreement is settled:
 * https://docs.kie.ai/file-upload-api/upload-file-stream shows
 * `curl -X POST https://kieai.redpandaai.co/api/file-stream-upload` in its
 * example while its OpenAPI `servers` block says api.kie.ai. A live probe
 * matched the example: redpandaai answers (401 to a bad key), api.kie.ai
 * returns 404. The servers block is the wrong half. Both are still tried, in
 * that order, so the day Kie fixes the block nothing here breaks.
 *
 * The documented response carries `fileName`, `filePath` and `downloadUrl`.
 * `fileUrl` is read too, as a superset, because an older documented shape used
 * that name and reading both costs nothing.
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
    // https://docs.kie.ai/file-upload-api/upload-file-stream: "Uploaded files
    // are temporary and will be automatically deleted after 3 days."
    console.error("NOTE: Kie deletes uploaded files after 3 days. Re-upload brand assets per batch,");
    console.error("      rather than reusing a URL from a previous sprint.");
    return url;
  }
  die(`upload failed on every documented host:\n  ${problems.join("\n  ")}`);
}

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const timeout = Number(flag("--timeout", 300));
const wantedName = flag("--name", null);
// --name only ever reached a file when --out was also passed, so the documented
// `run` example (which omits --out) named nothing and the asset kept whatever
// the CDN called it. Naming the file after its concept id is the point, so a
// --name with nowhere to go now picks the default directory and says so, rather
// than being silently dropped after the credits are spent.
let outDir = flag("--out", process.env.KIE_AI_DOWNLOAD_DIR || null);
const [cmd, a, b] = argv;
if (wantedName && !outDir && (cmd === "run" || cmd === "poll")) {
  outDir = "out";
  console.error(`NOTE: --name needs somewhere to write. Saving to ./${outDir} (pass --out DIR to choose).`);
}

if (cmd === "ledger") {
  const file = await ledgerPath();
  if (!file) die("The ledger is off (KIE_AI_LEDGER_PATH=off).", 2);
  const { readFileSync } = await import("node:fs");
  let raw = "";
  try { raw = readFileSync(file, "utf8"); } catch { die(`No ledger yet at ${file}. It is written on the first run.`, 2); }
  const byTask = new Map();
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t) continue;
    let e; try { e = JSON.parse(t); } catch { continue; }   // a half-written last line
    if (!e?.taskId) continue;
    const prev = byTask.get(e.taskId) ?? { taskId: e.taskId, model: e.model, createdAt: e.ts, state: "created", urls: [] };
    if (e.event === "settled") { prev.settledAt = e.ts; prev.state = e.state ?? prev.state; if (e.resultUrls?.length) prev.urls = e.resultUrls; }
    if (e.name) prev.name = e.name;
    if (e.model) prev.model = e.model;
    byTask.set(e.taskId, prev);
  }
  const rows = [...byTask.values()].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const TTL = 24 * 60 * 60 * 1000;
  console.error(`${rows.length} task(s) in ${file}`);
  for (const r of rows) {
    const left = Math.floor((Date.parse(r.settledAt ?? r.createdAt) + TTL - Date.now()) / 60000);
    const win = r.state === "success" ? (left > 0 ? `${left} min left` : "window CLOSED, re-poll to re-issue") : r.state;
    console.log(`${r.createdAt}  ${r.taskId}  ${r.model ?? "?"}  ${win}${r.name ? "  " + r.name : ""}`);
  }
  const models = new Set(rows.map((r) => r.model));
  if (models.size > 1) console.error(`NOTE: ${models.size} models in this ledger. One model per batch, or the comparison is void.`);
} else if (cmd === "credits") {
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
  await ledger("created", { taskId, model: a, param: input, name: wantedName ?? undefined });
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
  die("usage: node kie.mjs credits | ledger | upload <file> | run <model> '<json>' | start <model> '<json>' | poll <taskId>   [--timeout N] [--out DIR] [--name NAME]");
}
