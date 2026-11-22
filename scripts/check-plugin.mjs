#!/usr/bin/env node
/**
 * The plugin install gate. One repository installs as a unit, so the manifest,
 * the marketplace entry, the MCP definitions, the hook and the skills have to
 * agree with each other and with the files they name. Nothing here needs the
 * Claude Code CLI; CI also runs `claude plugin validate` and hands its JSON
 * report to this script with --validator-report.
 *
 *   node scripts/check-plugin.mjs
 *   node scripts/check-plugin.mjs --validator-report validate.json
 *   node scripts/check-plugin.mjs --print-paths    also list each absolute path found, with its hash
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` · ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const pkg = json("package.json");
const plugin = json(".claude-plugin/plugin.json");
const market = json(".claude-plugin/marketplace.json");
const rootMcp = json(".mcp.json");
const hooks = json("hooks/hooks.json");
const versionTs = read("src/version.ts").match(/ENGINE_VERSION\s*=\s*"([^"]+)"/)?.[1];

console.log("\n== Identity ==");
check("plugin.json, package.json and src/version.ts carry one version",
  plugin.version && plugin.version === pkg.version && plugin.version === versionTs,
  `plugin ${plugin.version}, package ${pkg.version}, version.ts ${versionTs}`);
check("plugin version is semver", /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(plugin.version ?? ""), plugin.version);
const entry = (market.plugins ?? []).find((p) => p.name === plugin.name);
check("marketplace lists this plugin once, from the repository root",
  (market.plugins ?? []).length === 1 && entry?.source === "./", JSON.stringify(market.plugins));
check("marketplace entry sets no second version", !entry?.version || entry.version === plugin.version, entry?.version);

console.log("\n== MCP server ==");
const servers = plugin.mcpServers ?? {};
const declared = Object.keys(plugin.userConfig ?? {});
for (const [name, server] of Object.entries(servers)) {
  const args = server.args ?? [];
  const rooted = args.filter((a) => typeof a === "string" && a.startsWith("${CLAUDE_PLUGIN_ROOT}/"));
  check(`${name}: launches a file inside the plugin through \${CLAUDE_PLUGIN_ROOT}`, rooted.length > 0, JSON.stringify(args));
  for (const arg of rooted) {
    const rel = arg.slice("${CLAUDE_PLUGIN_ROOT}/".length);
    check(`${name}: ${rel} is committed in the repository`, existsSync(path.join(root, rel)));
  }
  const refs = [...JSON.stringify(server).matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
  const unknown = refs.filter((k) => !declared.includes(k));
  check(`${name}: every \${user_config.*} it reads is declared in userConfig`, unknown.length === 0, unknown.join(", "));
}
// Claude Code always merges a plugin's root .mcp.json into the plugin, and a
// plugin.json entry of the same name replaces it (measured on Claude Code
// 2.1.289). The root file launches a path relative to the project, which only
// works when this repository is the open project. So every root server must
// have a plugin.json twin, or a plugin install would carry a broken copy.
const orphans = Object.keys(rootMcp.mcpServers ?? {}).filter((name) => !(name in servers));
check("every .mcp.json server is replaced by a plugin.json server of the same name", orphans.length === 0, orphans.join(", "));
// GO.cmd starts the sprint session inside this checkout, where Claude Code
// also finds .mcp.json. The session settings stop those servers so the
// plugin's copies are the only ones; a renamed server would slip through.
const hidden = json("sprint/session-settings.json").disabledMcpjsonServers ?? [];
const shown = Object.keys(rootMcp.mcpServers ?? {}).filter((name) => !hidden.includes(name));
check("sprint/session-settings.json stops every .mcp.json server, since the plugin brings its own", shown.length === 0, shown.join(", "));
const bundle = read("server/index.js");
check("server/index.js is the bundle and starts with its shebang", bundle.startsWith("#!/usr/bin/env node\n"));

console.log("\n== Options ==");
const hookScript = read("hooks/session-start.mjs");
for (const key of declared) {
  const cfg = plugin.userConfig[key];
  const used = JSON.stringify(servers).includes(`\${user_config.${key}}`) || hookScript.includes(`"${key}"`);
  check(`option ${key} is read by the MCP server or the session hook`, used);
  check(`option ${key} has a title and a description`, Boolean(cfg.title && cfg.description));
}
check("the API key option is sensitive", plugin.userConfig?.kie_api_key?.sensitive === true);

console.log("\n== Hooks ==");
const commands = Object.values(hooks.hooks ?? {}).flat().flatMap((group) => group.hooks ?? []).map((h) => h.command ?? "");
check("hooks.json declares at least one command", commands.length > 0);
for (const command of commands) {
  const files = [...command.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"' ]+)/g)].map((m) => m[1]);
  check(`hook command runs a committed file: ${command}`, files.length > 0 && files.every((f) => existsSync(path.join(root, f))));
}

console.log("\n== Skills ==");
const skillDirs = readdirSync(path.join(root, "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const dir of skillDirs) {
  const file = path.join(root, "skills", dir, "SKILL.md");
  if (!existsSync(file)) {
    check(`skills/${dir} has a top-level SKILL.md`, false);
    continue;
  }
  const front = readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const name = front.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = front.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  check(`skills/${dir}: frontmatter name equals the folder, with a description`, name === dir && Boolean(description), `name ${name}`);
}
check("the entry skill metrix-produce is present", skillDirs.includes("metrix-produce"));

console.log("\n== Nothing private ships ==");
// A plugin install copies every tracked file to every user (the install proof
// counts them), so every tracked file is scanned, not only the plugin's own.
let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
} catch (error) {
  check("git ls-files ran", false, error instanceof Error ? error.message : String(error));
}
// A path on one machine means nothing on another, and it can say whose
// machine it was. Any absolute path counts, however it is quoted: Markdown
// puts paths in backticks. A match ends at whitespace or a delimiter.
const absolutePath = /(?:^|[^A-Za-z0-9_])((?:[A-Za-z]:[\\/]|\/Users\/|\/home\/)[^\s"'`()<>|,;]*)/g;
// Forms that name no machine: a standard Windows folder, a placeholder, a bare root.
const sep = String.raw`(?:\\\\|[\\/])`;
const generic = [
  new RegExp(String.raw`^[A-Za-z]:${sep}Program$`),
  new RegExp(String.raw`^[A-Za-z]:${sep}(?:path|some)${sep}`, "i"),
  new RegExp(String.raw`^[A-Za-z]:${sep}\.\.\.${sep}`),
  new RegExp(String.raw`^[A-Za-z]:${sep}Users${sep}You${sep}`),
  new RegExp(String.raw`^[A-Za-z]:${sep}?$`),
  /^\/(?:Users|home)\/$/,
];
// Every other absolute path is listed, by file and with the reason it is
// there, in scripts/known-absolute-paths.json, as a hash of its text so the
// list repeats no path. A new one anywhere fails; so does a listed one that is
// gone, so the list only ever shrinks to what is really there.
const known = json("scripts/known-absolute-paths.json").files ?? {};
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
const found = {};
for (const rel of tracked) {
  let buf;
  try { buf = readFileSync(path.join(root, rel)); } catch { continue; }
  if (buf.includes(0)) continue;
  buf.toString("utf8").split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(absolutePath)) {
      if (generic.some((g) => g.test(m[1]))) continue;
      (found[rel] ??= []).push({ line: i + 1, text: m[1], hash: hash(m[1]) });
    }
  });
}
if (process.argv.includes("--print-paths")) {
  for (const [rel, hits] of Object.entries(found)) for (const h of hits) console.log(`  ${h.hash}  ${rel}:${h.line}  ${h.text}`);
}
const unlisted = [];
const gone = [];
for (const rel of new Set([...Object.keys(found), ...Object.keys(known)])) {
  const want = [...(known[rel]?.paths ?? [])];
  for (const h of found[rel] ?? []) {
    const at = want.indexOf(h.hash);
    if (at >= 0) want.splice(at, 1);
    else unlisted.push(`${rel}:${h.line} ${h.text} (${h.hash})`);
  }
  for (const h of want) gone.push(`${rel} ${h}`);
}
const reasonless = Object.entries(known).filter(([, v]) => !v.why).map(([rel]) => rel);
check("every absolute path in a tracked file is a generic form or a listed one", unlisted.length === 0, unlisted.join(" | "));
check("every listed absolute path is still there (remove the ones that are gone)", gone.length === 0, gone.join(" | "));
check("every file in known-absolute-paths.json says why", reasonless.length === 0, reasonless.join(", "));
// Brand kits are client material. A kit belongs in the user's assets folder,
// never in the public repository a plugin install copies, wherever in the tree
// it sits. The engine's evaluation fixtures carry its own brand, and only
// those are allowed.
const fixtureKits = [
  "skills/metrix-video-assembly/evals/metrix-feed-4x5-product-journey/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-mst-hook-row/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-reels-from-app-recordings/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-reels-refuses-unsourced-proof/files/brand-kit.json",
];
const kitFiles = tracked.filter((f) =>
  /(?:^|\/)brand[-_]kit\.json$/i.test(f) || /(?:^|\/)MASTER_EXECUTION_PROMPT\.md$/i.test(f) || (f.startsWith("brand-kits/") && f !== "brand-kits/README.md"));
const strays = kitFiles.filter((f) => !fixtureKits.includes(f));
check("no brand kit is tracked outside the engine's own evaluation fixtures", strays.length === 0, strays.join(", "));
for (const f of fixtureKits) {
  let name;
  try { name = JSON.parse(read(f)).identity?.canonical_name; } catch { name = undefined; }
  check(`${f} carries the engine's own brand`, tracked.includes(f) && name === "Metrix", `tracked ${tracked.includes(f)}, brand ${name}`);
}

console.log("\n== GO.cmd updates itself safely ==");
// cmd.exe reads a batch file a line at a time from a byte offset, so a pull
// that replaces GO.cmd mid-run leaves cmd.exe reading the new file from the old
// offset. GO.cmd up to 0.1.x pulled at a plain line ending at byte 1558 of its
// CRLF checkout. That byte must start a line that reruns the file from the top,
// and the pull itself must sit in a block, which cmd.exe reads whole first.
const go = readFileSync(path.join(root, "GO.cmd")).toString("latin1");
const guard = 'if not defined MCE_GO_TOP (set "MCE_GO_PULLED=1" & call "%~f0" %* & exit /b)\r\n';
check("GO.cmd has CRLF line endings only", go.includes("\r\n") && !/[^\r]\n/.test(go));
check("GO.cmd starts a line at byte 1558 that reruns it from the top", go.slice(1556, 1558) === "\r\n" && go.startsWith(guard, 1558), JSON.stringify(go.slice(1558, 1640)));
check("GO.cmd sets MCE_GO_TOP before byte 1558", go.slice(0, 1558).includes('\r\nset "MCE_GO_TOP=1"\r\n'));
check("GO.cmd pulls only inside a block that reruns the updated file, then exits",
  /\r\nif not defined MCE_GO_PULLED \(\r\n {2}set "MCE_GO_PULLED=1"\r\n {2}git pull --ff-only --quiet 2>nul\r\n {2}call "%~f0" %\*\r\n {2}exit \/b\r\n\)\r\n/.test(go) &&
    (go.match(/^\s*git pull/gm) ?? []).length === 1);

const reportAt = process.argv.indexOf("--validator-report");
if (reportAt > 0) {
  console.log("\n== claude plugin validate ==");
  const report = JSON.parse(readFileSync(process.argv[reportAt + 1], "utf8"));
  const entries = [report.manifest, ...(report.contents ?? [])].filter(Boolean);
  const errors = entries.flatMap((e) => (e.errors ?? []).map((x) => `${e.file}: ${x.path} ${x.message}`));
  // The repository is also a project, and its root CLAUDE.md is that project's
  // instructions. The validator notes that a plugin does not load it, which is
  // true and intended. Any other warning fails.
  const allowed = (w, e) => w.path === "root" && /CLAUDE\.md at the plugin root is not loaded/.test(w.message) && /CLAUDE\.md$/.test(e.file ?? "");
  const warnings = entries.flatMap((e) => (e.warnings ?? []).filter((w) => !allowed(w, e)).map((x) => `${e.file}: ${x.path} ${x.message}`));
  check("validator reports success", report.success === true);
  check("validator reports no errors", errors.length === 0, errors.join(" | "));
  check("validator reports no warnings beyond the project CLAUDE.md note", warnings.length === 0, warnings.join(" | "));
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll plugin checks passed.");
process.exit(failures ? 1 : 0);
