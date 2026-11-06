#!/usr/bin/env node
/**
 * tools-check · verify the pinned media and ASR tools on this machine against
 * tools/manifest.json (mce.tools/1).
 *
 * It reads files and hashes them. It never downloads anything and never runs a
 * tool. Paths come from the manifest roots: each root's env var wins, then the
 * roots{} of a JSON config (--config <file> or MCE_TOOLS_CONFIG), then the
 * manifest default. File paths in the manifest are relative to a root;
 * absolute or escaping paths are refused as an invalid manifest.
 *
 * Not part of `npm run verify`: CI has none of these tools. Run locally with
 * `npm run tools:check`.
 *
 * Usage: node scripts/tools-check.mjs [--manifest <file>] [--config <file>]
 *                                     [--id <tool>]... [--json]
 * Exit 0 all pass · 1 sha256 or size mismatch (wins over missing) ·
 *      2 required file missing · 3 usage, config or manifest error.
 *
 * Also exports the yt-dlp argv guard (guardYtDlpArgv, ytDlpArgv) so any future
 * capture code builds its command line through one place.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MANIFEST = path.join(repoRoot, "tools", "manifest.json");
export const SCHEMA = "mce.tools/1";
const CHECKS = new Set(["sha256", "presence", "skip"]);
const ROLES = new Set(["binary", "published", "archive", "config"]);
const HEX64 = /^[0-9a-f]{64}$/;

export class ManifestError extends Error {}

/** Validate a parsed manifest; throws ManifestError naming the first problem. */
export function validateManifest(m) {
  const bad = (msg) => { throw new ManifestError(msg); };
  if (!m || typeof m !== "object") bad("manifest is not an object");
  if (m.schema !== SCHEMA) bad(`schema must be ${SCHEMA}, got ${JSON.stringify(m.schema)}`);
  if (!m.roots || typeof m.roots !== "object") bad("roots missing");
  for (const [name, r] of Object.entries(m.roots)) {
    if (!r || typeof r.env !== "string" || !r.env) bad(`root ${name}: env missing`);
    if (typeof r.default !== "string" || !r.default) bad(`root ${name}: default missing`);
    if (/^c:/i.test(r.default)) bad(`root ${name}: default on C: is not allowed (${r.default})`);
  }
  if (!Array.isArray(m.tools) || m.tools.length === 0) bad("tools[] missing or empty");
  const ids = new Set();
  for (const t of m.tools) {
    if (!t || typeof t.id !== "string" || !t.id) bad("tool without id");
    if (ids.has(t.id)) bad(`duplicate tool id ${t.id}`);
    ids.add(t.id);
    for (const k of ["version", "status", "source_url", "licence"]) {
      if (typeof t[k] !== "string" || !t[k]) bad(`${t.id}: ${k} missing`);
    }
    if (typeof t.licence_checked !== "boolean") bad(`${t.id}: licence_checked must be boolean`);
    if (!CHECKS.has(t.check)) bad(`${t.id}: check must be one of ${[...CHECKS].join(", ")}`);
    if (!Array.isArray(t.files)) bad(`${t.id}: files[] missing`);
    if (t.check === "skip" && t.files.length) bad(`${t.id}: check skip must list no files`);
    if (t.check !== "skip" && !t.files.length) bad(`${t.id}: no files to check`);
    for (const f of t.files) {
      const where = `${t.id}: ${f && f.path}`;
      if (!f || typeof f.path !== "string" || !f.path) bad(`${t.id}: file without path`);
      if (!(f.root in m.roots)) bad(`${where}: unknown root ${JSON.stringify(f.root)}`);
      if (path.isAbsolute(f.path) || /^[a-z]:/i.test(f.path) || f.path.split(/[\\/]/).includes("..")) {
        bad(`${where}: path must be relative to its root, without ..`);
      }
      if (!ROLES.has(f.role)) bad(`${where}: role must be one of ${[...ROLES].join(", ")}`);
      if (t.check === "sha256") {
        if (!HEX64.test(f.sha256 || "")) bad(`${where}: sha256 must be 64 lowercase hex`);
        if (!Number.isInteger(f.bytes) || f.bytes < 0) bad(`${where}: bytes must be a non-negative integer`);
      }
    }
  }
  if (m.tools.find((t) => t.id === "remotion" && t.status !== "not supported")) bad("remotion must stay 'not supported'");
  return m;
}

export function loadManifest(file = DEFAULT_MANIFEST) {
  let m;
  try { m = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new ManifestError(`cannot read manifest ${file}: ${e.message}`); }
  return validateManifest(m);
}

/** Resolve each root: env var, then config.roots, then manifest default. */
export function resolveRoots(manifest, { env = process.env, config = null } = {}) {
  const out = {};
  for (const [name, r] of Object.entries(manifest.roots)) {
    const fromEnv = env[r.env];
    const fromConfig = config && config.roots && config.roots[name];
    const value = fromEnv || fromConfig || r.default;
    out[name] = { dir: path.resolve(value), source: fromEnv ? `env ${r.env}` : fromConfig ? "config" : "manifest default" };
  }
  return out;
}

export function readConfig(file) {
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new ManifestError(`cannot read config ${file}: ${e.message}`); }
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("error", reject).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex")));
  });
}

/**
 * Check one file. Status: PASS, PRESENT (presence-only), MISMATCH (sha256 or
 * size), MISSING (required), WARN_MISSING (optional archive absent).
 */
export async function checkFile(tool, f, roots) {
  const abs = path.join(roots[f.root].dir, f.path);
  const base = { tool: tool.id, root: f.root, path: f.path, abs, role: f.role };
  let st;
  try { st = fs.statSync(abs); } catch {
    return { ...base, status: f.role === "archive" ? "WARN_MISSING" : "MISSING", detail: "not found" };
  }
  if (f.kind === "dir") {
    return st.isDirectory() ? { ...base, status: "PRESENT", detail: "directory present" } : { ...base, status: "MISSING", detail: "not a directory" };
  }
  if (!st.isFile()) return { ...base, status: "MISSING", detail: "not a file" };
  if (tool.check === "presence") return { ...base, status: "PRESENT", detail: `${st.size} bytes, presence only` };
  if (st.size !== f.bytes) return { ...base, status: "MISMATCH", detail: `size mismatch: expected ${f.bytes} bytes, found ${st.size}` };
  const got = await sha256File(abs);
  if (got !== f.sha256) return { ...base, status: "MISMATCH", detail: `sha256 mismatch: expected ${f.sha256}, found ${got}` };
  return { ...base, status: "PASS", detail: "sha256 ok" };
}

export async function checkTools(manifest, roots, { ids = [] } = {}) {
  const known = new Set(manifest.tools.map((t) => t.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new ManifestError(`unknown tool id: ${unknown.join(", ")}`);
  const picked = ids.length ? manifest.tools.filter((t) => ids.includes(t.id)) : manifest.tools;
  const results = [];
  for (const t of picked) {
    if (t.check === "skip") { results.push({ tool: t.id, status: "SKIP", detail: t.status + (t.reason ? `: ${t.reason}` : "") }); continue; }
    for (const f of t.files) results.push(await checkFile(t, f, roots));
  }
  return { results, exitCode: exitCodeFor(results) };
}

export function exitCodeFor(results) {
  if (results.some((r) => r.status === "MISMATCH")) return 1;
  if (results.some((r) => r.status === "MISSING")) return 2;
  return 0;
}

// ------------------------------------------------------------ yt-dlp guard
// Long options refused anywhere before "--". A user arg that is a prefix of one
// of these (optparse accepts unambiguous abbreviations) is refused too.
const REFUSED_LONG = ["--update", "--update-to", "--remote-components", "--config-locations", "--config-location"];

/** Returns the refused args (empty when argv is safe). */
export function guardYtDlpArgv(argv) {
  const refused = [];
  for (const a of argv) {
    if (typeof a !== "string") { refused.push(String(a)); continue; }
    if (a === "--") break;
    if (a.startsWith("--")) {
      const name = a.split("=")[0];
      if (name.length >= 3 && REFUSED_LONG.some((r) => r.startsWith(name))) refused.push(a);
    } else if (/^-[A-Za-z0-9]+$/.test(a) && a.includes("U")) {
      refused.push(a); // -U alone or bundled short flags such as -vU
    }
  }
  return refused;
}

/** Build the only argv capture code may hand to the pinned yt-dlp. */
export function ytDlpArgv(userArgs, confPath) {
  if (!confPath) throw new Error("ytDlpArgv: confPath is required");
  const refused = guardYtDlpArgv(userArgs);
  if (refused.length) throw new Error(`yt-dlp argv refused: ${refused.join(" ")}`);
  return ["--ignore-config", "--config-locations", confPath, "--no-update", "--no-remote-components", ...userArgs];
}

// ---------------------------------------------------------------- CLI
function parseArgs(argv) {
  const o = { ids: [], json: false, manifest: DEFAULT_MANIFEST, config: process.env.MCE_TOOLS_CONFIG || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (!v) throw new ManifestError(`${a} needs a value`); return v; };
    if (a === "--id") o.ids.push(val());
    else if (a === "--json") o.json = true;
    else if (a === "--manifest") o.manifest = path.resolve(val());
    else if (a === "--config") o.config = path.resolve(val());
    else throw new ManifestError(`unknown argument ${a}`);
  }
  return o;
}

export async function main(argv = process.argv.slice(2), { env = process.env, out = console.log, err = console.error } = {}) {
  try {
    const o = parseArgs(argv);
    const manifest = loadManifest(o.manifest);
    const roots = resolveRoots(manifest, { env, config: readConfig(o.config) });
    const { results, exitCode } = await checkTools(manifest, roots, { ids: o.ids });
    if (o.json) {
      out(JSON.stringify({ schema: "mce.tools-check/1", roots, results, exitCode }, null, 2));
    } else {
      for (const [n, r] of Object.entries(roots)) out(`root ${n} = ${r.dir} (${r.source})`);
      for (const r of results) out(`${r.status.padEnd(12)} ${r.tool}${r.path ? ` ${r.root}/${r.path}` : ""} · ${r.detail}`);
      const n = (s) => results.filter((r) => r.status === s).length;
      out(`tools-check: ${n("PASS")} pass, ${n("PRESENT")} present, ${n("MISMATCH")} mismatch, ${n("MISSING")} missing, ${n("WARN_MISSING")} optional missing, ${n("SKIP")} skipped · exit ${exitCode}`);
    }
    return exitCode;
  } catch (e) {
    err(`tools-check: ${e.message}`);
    return 3;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; });
}
