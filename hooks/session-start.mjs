#!/usr/bin/env node
/**
 * Plugin SessionStart hook. Two jobs, both cheap, neither able to fail a session:
 *
 * 1. Hand the plugin's options to the session's shell. Claude Code gives the MCP
 *    server the options through its `env`, but the bundled CLI (`scripts/kie.mjs`
 *    in each generating skill) runs in the Bash tool, which only sees what this
 *    hook writes to CLAUDE_ENV_FILE. Without it, a key set in the plugin's options
 *    would reach the MCP tools and not `kie.mjs upload`, which has no MCP twin.
 * 2. Tell the model, in one line, where runs are written and where inputs live.
 *    SessionStart stdout becomes session context, so it never carries the key.
 */
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const MARKER = "# metrix-creative-engine session settings";

/** Unset, blank, or a reference the host never expanded. */
function real(value) {
  const v = value?.trim();
  return v && !/\$\{[^}]*\}/.test(v) ? v : undefined;
}

function option(name) {
  return real(process.env[`CLAUDE_PLUGIN_OPTION_${name.toUpperCase()}`]) ?? real(process.env[`CLAUDE_PLUGIN_OPTION_${name}`]);
}

/** One bash `export`, single-quoted so spaces, `$` and Windows backslashes survive. */
function exportLine(name, value) {
  return `export ${name}='${value.replaceAll("'", "'\\''")}'`;
}

function main() {
  const optionKey = option("kie_api_key");
  const optionRuns = option("runs_dir");
  const optionAssets = option("assets_dir");
  const envKey = real(process.env.KIE_AI_API_KEY);

  // The plugin's options win, as they do in the MCP server (src/config.ts), so
  // the MCP tools and the bundled script never run on two different keys or
  // write to two different folders.
  const exports = [];
  if (optionRuns) exports.push(exportLine("KIE_AI_DOWNLOAD_DIR", optionRuns));
  if (optionAssets) exports.push(exportLine("METRIX_ASSETS_DIR", optionAssets));
  if (optionKey) exports.push(exportLine("KIE_AI_API_KEY", optionKey));

  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile && exports.length) {
    let existing = "";
    try {
      existing = readFileSync(envFile, "utf8");
    } catch {
      // No file yet: this hook is the first writer.
    }
    // SessionStart fires again on resume, clear and compact. Write once per file.
    if (!existing.includes(MARKER)) appendFileSync(envFile, `${existing && !existing.endsWith("\n") ? "\n" : ""}${MARKER}\n${exports.join("\n")}\n`);
  }

  const runs = optionRuns ?? real(process.env.KIE_AI_DOWNLOAD_DIR);
  const assets = optionAssets ?? real(process.env.METRIX_ASSETS_DIR);
  const keySource = optionKey ? "set in the plugin options" : envKey ? "set in the environment" : "missing";
  const lines = [
    `Metrix Creative Engine: an approved brief goes through the metrix-produce skill, which routes it by the brief's declared format.`,
    `Runs folder: ${runs ? path.resolve(runs) : "./out in the folder Claude Code started in (no runs folder configured)"}. Assets folder: ${assets ? path.resolve(assets) : "not configured"}. Kie key: ${keySource}.`,
  ];
  if (keySource === "missing") {
    lines.push("Generation will fail until a key is set: the plugin's Kie.ai API key option, or KIE_AI_API_KEY in the environment (https://kie.ai/api-key).");
  }
  if (!envFile && (optionKey || optionRuns || optionAssets)) {
    lines.push("This Claude Code has no CLAUDE_ENV_FILE, so the bundled kie.mjs script does not see the plugin's options; the MCP tools do.");
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

try {
  main();
} catch (error) {
  // A hook error must never block a session. Say what failed, on stderr only.
  process.stderr.write(`metrix-creative-engine session hook: ${error instanceof Error ? error.message : String(error)}\n`);
}
process.exit(0);
