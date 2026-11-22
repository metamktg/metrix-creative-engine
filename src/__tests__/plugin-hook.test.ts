import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The plugin's SessionStart hook, run the way Claude Code runs it: a fresh node
 * process, the plugin options as CLAUDE_PLUGIN_OPTION_*, and CLAUDE_ENV_FILE for
 * the session's shell. Its stdout becomes model context, so the key must never
 * appear there.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = path.join(repoRoot, "hooks", "session-start.mjs");
const KEY = "hook-test-key-not-a-real-credential";

function run(extra: Record<string, string>) {
  // Only what the hook needs, so nothing from the developer's own environment
  // (a real KIE_AI_API_KEY, say) leaks into the result.
  const base: Record<string, string> = { PATH: process.env.PATH ?? "" };
  for (const name of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE"]) {
    if (process.env[name]) base[name] = process.env[name] as string;
  }
  const result = spawnSync(process.execPath, [hook], { env: { ...base, ...extra }, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Decode the hook's own `export NAME='value'` lines, the inverse of its quoting. */
function exportsIn(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^export ([A-Z_]+)='(.*)'$/);
    if (m) out[m[1]] = m[2].replaceAll("'\\''", "'");
  }
  return out;
}

function findBash(): string | null {
  for (const candidate of ["bash", "C:/Program Files/Git/bin/bash.exe"]) {
    const probe = spawnSync(candidate, ["-c", "echo ok"], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim() === "ok") return candidate;
  }
  return null;
}

const tricky = path.join(tmpdir(), "My Drive", "client's runs $HOME");

describe("plugin session hook", () => {
  it("hands every option to the shell and names the folders without the key", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    const r = run({
      CLAUDE_ENV_FILE: envFile,
      CLAUDE_PLUGIN_OPTION_KIE_API_KEY: KEY,
      CLAUDE_PLUGIN_OPTION_RUNS_DIR: tricky,
      CLAUDE_PLUGIN_OPTION_ASSETS_DIR: path.join(dir, "assets"),
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).not.toContain(KEY);
    expect(r.stdout).toContain(`Runs folder: ${path.resolve(tricky)}.`);
    expect(r.stdout).toContain(`Assets folder: ${path.resolve(path.join(dir, "assets"))}.`);
    expect(r.stdout).toContain("Kie key: set in the plugin options.");
    expect(r.stdout).toContain("metrix-produce");
    expect(exportsIn(envFile)).toEqual({
      KIE_AI_DOWNLOAD_DIR: tricky,
      METRIX_ASSETS_DIR: path.join(dir, "assets"),
      KIE_AI_API_KEY: KEY,
    });
  });

  // The plugin option wins over an exported key, as it does in the MCP server,
  // so the tools and the script cannot run on two different keys.
  it("exports the option key even when the environment has its own", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    const r = run({ CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_KIE_API_KEY: KEY, KIE_AI_API_KEY: "env-key" });
    expect(r.status).toBe(0);
    expect(exportsIn(envFile).KIE_AI_API_KEY).toBe(KEY);
    expect(r.stdout).not.toContain("env-key");
  });

  // SessionStart fires again on resume, clear and compact, and the options can
  // change in between. A block that kept the first values would leave the
  // script on a rotated key while the MCP tools use the new one.
  it("keeps one block, holding the latest options, however often the session starts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    writeFileSync(envFile, "export OTHER_PLUGIN=1");
    const first = { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_RUNS_DIR: tricky };
    expect(run(first).status).toBe(0);
    expect(run(first).status).toBe(0);
    let text = readFileSync(envFile, "utf8");
    expect(text.startsWith("export OTHER_PLUGIN=1\n")).toBe(true);
    expect(text.match(/^# metrix-creative-engine session settings$/gm)).toHaveLength(1);
    expect(text.match(/^export KIE_AI_DOWNLOAD_DIR=/gm)).toHaveLength(1);

    // Another hook appends after this one's block; then the options change.
    writeFileSync(envFile, `${text}export LATER_PLUGIN=1\n`);
    const moved = path.join(dir, "moved runs");
    expect(run({ CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_RUNS_DIR: moved, CLAUDE_PLUGIN_OPTION_KIE_API_KEY: KEY }).status).toBe(0);
    text = readFileSync(envFile, "utf8");
    expect(text.match(/^# metrix-creative-engine session settings$/gm)).toHaveLength(1);
    expect(exportsIn(envFile)).toEqual({ KIE_AI_DOWNLOAD_DIR: moved, KIE_AI_API_KEY: KEY });
    expect(text.startsWith("export OTHER_PLUGIN=1\n")).toBe(true);
    expect(text).toContain("\nexport LATER_PLUGIN=1\n");
  });

  it("removes its block when every option is cleared, and leaves the rest of the file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    writeFileSync(envFile, "export OTHER_PLUGIN=1\n");
    expect(run({ CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_KIE_API_KEY: KEY }).status).toBe(0);
    expect(exportsIn(envFile).KIE_AI_API_KEY).toBe(KEY);
    expect(run({ CLAUDE_ENV_FILE: envFile }).status).toBe(0);
    expect(readFileSync(envFile, "utf8")).toBe("export OTHER_PLUGIN=1\n");
  });

  it("says the key is missing, and writes nothing, when nothing is configured", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    const r = run({ CLAUDE_ENV_FILE: envFile });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Kie key: missing.");
    expect(r.stdout).toContain("https://kie.ai/api-key");
    expect(r.stdout).toContain("no runs folder configured");
    expect(() => readFileSync(envFile)).toThrow();
  });

  it("reads an unexpanded option as unset", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    const r = run({
      CLAUDE_ENV_FILE: envFile,
      CLAUDE_PLUGIN_OPTION_RUNS_DIR: "${user_config.runs_dir}",
      CLAUDE_PLUGIN_OPTION_KIE_API_KEY: "${KIE_AI_API_KEY}",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Kie key: missing.");
    expect(() => readFileSync(envFile)).toThrow();
  });

  it("never fails the session, even when it cannot write", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    // A directory where the file should be: the append throws inside the hook.
    const r = run({ CLAUDE_ENV_FILE: dir, CLAUDE_PLUGIN_OPTION_RUNS_DIR: tricky });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("metrix-creative-engine session hook:");
    // The session still learns its folders, and that the script missed them.
    expect(r.stdout).toContain(`Runs folder: ${path.resolve(tricky)}.`);
    expect(r.stdout).toContain("its env file could not be written");
  });

  // The decode above is this test's reading of the quoting. Bash is the reader
  // that matters, since Claude Code sources the file before each Bash command.
  const bash = findBash();
  it.skipIf(!bash && !process.env.CI)("quotes values so bash reads them back exactly", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mce-hook-"));
    const envFile = path.join(dir, "env.sh");
    expect(run({ CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_RUNS_DIR: tricky }).status).toBe(0);
    const read = spawnSync(bash ?? "bash", ["-c", 'source "$1" && printf %s "$KIE_AI_DOWNLOAD_DIR"', "_", envFile], { encoding: "utf8" });
    expect(read.status).toBe(0);
    expect(read.stdout).toBe(tricky);
  });
});
