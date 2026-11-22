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
// An option reaches two readers, each by a name that must match on both sides.
// plugin.json maps it into an environment variable that the server reads in
// src/config.ts, and Claude Code hands it to the session hook as
// CLAUDE_PLUGIN_OPTION_<KEY>, which the hook reads through option("<key>") and
// passes to the bundled scripts. Both must see it, so the MCP tools and the
// scripts never run on two different keys or write to two different folders.
const configTs = read("src/config.ts");
const serverReads = new Set([...configTs.matchAll(/\bread\(([^)]*)\)/g)]
  .flatMap((m) => [...m[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((x) => x[1])));
const hookScript = read("hooks/session-start.mjs");
const hookOptions = [...hookScript.matchAll(/\boption\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]);
const carriers = {};
for (const [name, server] of Object.entries(servers)) {
  for (const [envName, value] of Object.entries(server.env ?? {})) {
    check(`${name}: env ${envName} is read by the server (src/config.ts)`, serverReads.has(envName));
    for (const m of String(value).matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)) (carriers[m[1]] ??= []).push(envName);
  }
}
const undeclared = hookOptions.filter((k) => !declared.includes(k));
check("the session hook reads only declared options", undeclared.length === 0, undeclared.join(", "));
for (const key of declared) {
  const cfg = plugin.userConfig[key];
  check(`option ${key} reaches the MCP server through an env name src/config.ts reads`,
    (carriers[key] ?? []).some((envName) => serverReads.has(envName)), (carriers[key] ?? []).join(", ") || "no env carries it");
  check(`option ${key} is read by the session hook, so the bundled scripts see it too`, hookOptions.includes(key));
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
// counts them), so every tracked file is scanned, not only the plugin's own:
// a text file for any absolute path, a binary file (one with a NUL byte) for a
// home folder path in its ASCII or UTF-16 strings.
let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
} catch (error) {
  check("git ls-files ran", false, error instanceof Error ? error.message : String(error));
}
// A path on one machine means nothing on another, and it can say whose
// machine it was. Any absolute path counts, however it is quoted or escaped
// (Markdown puts paths in backticks, JSON doubles backslashes and may write a
// slash as \/, a URL encodes them): a drive path (C:\ or C:/, also with the
// colon or both URL-encoded), a UNC share (\\host\share), a Git Bash, WSL or
// Cygwin drive mount (/c/..., /mnt/c/..., /cygdrive/c/...), and the roots
// that hold a user's files on macOS, Linux and FreeBSD: home (/Users, /home,
// /usr/home, /root), volume (/Volumes, /media, /run/media) and the macOS temp
// roots (/private, /var/folders), written raw, JSON-escaped or URL-encoded,
// also inside a file URL. A path may follow an escape (\n, \r or \t in a
// string, %XX in a URL). A match runs on through the space in "Program
// Files" and "Program Files (x86)", and otherwise ends at whitespace or a
// delimiter. A UNC host has two characters at least, so a one-letter escape
// such as \\d\\ is not taken for one; escaped regex text with a longer word
// between its backslashes is, and is listed like any other path.
const body = String.raw`(?:Program Files(?: \(x86\))?|[^\s"'` + "`" + String.raw`()<>|,;])*`;
// Before a drive letter: no letter, digit or underscore. Before a root slash:
// nothing that continues a path, unless it is a file URL's own slashes, in
// either case and JSON-escaped too (file:///Users, FILE:///Users,
// file:\/\/\/Users), or an editor link's (vscode://file/Users). An escape
// ends a word: \n, \r or \t, a \uXXXX or \xXX escape (JSON may write a
// curly quote as \u201c), or a URL's %XX. Before a Git Bash drive path, which
// reads like a one-letter URL segment (example.com/p/123), only an escape of
// an ASCII character or of punctuation does: U+00A0 to U+00BF (a no-break
// space, guillemets) or U+2000 to U+206F (curly quotes, dashes), whether as
// \uXXXX, as \xXX or as UTF-8 in %XX. So an encoded letter that ends a
// segment (caf%C3%A9/p/1) stays part of the word, and an encoded curly quote
// right before a drive path does not. A closing angle bracket exempts
// nothing: a placeholder and an HTML tag end the same way, so a root folder
// name right after a placeholder is listed in known-absolute-paths.json like
// any other path.
const ci = (word) => [...word].map((c) => `[${c.toUpperCase()}${c}]`).join("");
const afterEscape = String.raw`(?<=\\[nrt])|(?<=\\u[0-9A-Fa-f]{4})|(?<=\\x[0-9A-Fa-f]{2})|(?<=%[0-9A-Fa-f]{2})`;
const afterAsciiOrPunctEscape = String.raw`(?<=\\[nrt])|(?<=\\u00[0-7ABab][0-9A-Fa-f])|(?<=\\u20[0-6][0-9A-Fa-f])|(?<=\\x[0-7ABab][0-9A-Fa-f])|(?<=%[0-7][0-9A-Fa-f])|(?<=%[Cc]2%[ABab][0-9A-Fa-f])|(?<=%[Ee]2%80%[89ABab][0-9A-Fa-f])|(?<=%[Ee]2%81%[89Aa][0-9A-Fa-f])`;
const fileUrl = String.raw`(?<=${ci("file")}:(?:\\?\/){2}(?:${ci("localhost")})?)|(?<=:(?:\\?\/){2}${ci("file")})`;
const notAfterWord = String.raw`(?:(?<![A-Za-z0-9_])|${afterEscape})`;
const notAfterPath = String.raw`(?:(?<![A-Za-z0-9_.~/\\-])|${afterEscape}|${fileUrl})`;
const notAfterPathAsciiOrPunct = String.raw`(?:(?<![A-Za-z0-9_.~/\\-])|${afterAsciiOrPunctEscape}|${fileUrl})`;
const slash = String.raw`(?:\\?\/|%2[Ff])`;
const userRoots = ["Users", "home", "usr/home", "root", "Volumes", "media", "run/media", "private", "var/folders", "mnt/[A-Za-z]"]
  .map((root) => root.split("/").join(slash)).join("|");
const absolutePath = new RegExp([
  String.raw`${notAfterWord}[A-Za-z]:[\\/]${body}`,
  String.raw`${notAfterWord}[A-Za-z]%3[Aa](?:%5[Cc]|%2[Ff]|[\\/])${body}`,
  String.raw`(?<![A-Za-z0-9_])\\\\[A-Za-z0-9_.$-]{2,}\\${body}`,
  String.raw`${notAfterPath}${slash}(?:${userRoots})${slash}${body}`,
  String.raw`${notAfterPathAsciiOrPunct}\\?\/(?:cygdrive\\?\/)?[A-Za-z]\\?\/(?=[A-Za-z0-9_.~-])${body}`,
].map((form) => `(${form})`).join("|"), "g");
// A home folder in a binary file's strings: the one form worth the cost
// there, in any case (a .pdb may record the path in capitals) and with
// doubled backslashes.
const homePath = /(?:[A-Za-z]:(?:\\\\|[\\/])Users(?:\\\\|[\\/])|\/(?:Users|home|root)\/)[^\s"'`()<>|,;\\/]+/gi;
// Forms that name no machine: a standard install folder, a placeholder in the
// case the docs write it, a bare root, and macOS's real path for /tmp.
const sep = String.raw`(?:\\\\|[\\/])`;
const generic = [
  new RegExp(String.raw`^[A-Za-z]:${sep}Program Files(?: \(x86\))?(?:${sep}(?:nodejs|Git|Google${sep}Chrome|Microsoft${sep}Edge)(?:${sep}|$)|${sep}?$)`),
  new RegExp(String.raw`^[A-Za-z]:${sep}(?:path|some)${sep}`),
  new RegExp(String.raw`^[A-Za-z]:${sep}\.\.\.${sep}`),
  new RegExp(String.raw`^[A-Za-z]:${sep}Users${sep}You${sep}`),
  new RegExp(String.raw`^\\\\host${sep}`),
  /^\/(?:mnt\/|cygdrive\/)?[A-Za-z]\/\.\.\.$/,
  new RegExp(String.raw`^[A-Za-z]:${sep}?$`),
  /^[A-Za-z]%3[Aa](?:%5[Cc]|%2[Ff]|[\\/])$/,
  /^\/(?:Users|home|usr\/home|root|Volumes|media|run\/media|private|var\/folders|mnt\/[A-Za-z])\/$/,
  /^\/(?:private\/tmp)\/?$/,
];
// Every other absolute path is listed, by file and with the reason it is
// there, in scripts/known-absolute-paths.json, as a hash of its text so the
// list repeats no path. A new one anywhere fails; so does a listed one that is
// gone, so the list only ever shrinks to what is really there.
const known = json("scripts/known-absolute-paths.json").files ?? {};
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
// A tracked symlink is read as git stores it, as its target's path, which is
// what a clone gets. Read as a file, it would be followed, or skipped when
// its target is missing.
const linkTargets = new Map();
for (const entry of execFileSync("git", ["ls-files", "-s", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean)) {
  const [meta, rel] = entry.split("\t");
  const [mode, object] = meta.split(" ");
  if (mode === "120000") linkTargets.set(rel, execFileSync("git", ["cat-file", "blob", object], { cwd: root }));
}
// Text as it was saved: UTF-8 (a BOM is dropped), or UTF-16 in either byte
// order, with or without a BOM, which Windows PowerShell 5.1 writes for > and
// Out-File. Anything else holding a NUL is binary, read for its printable
// runs of six or more: as single bytes, and as UTF-16LE at both byte
// alignments. Each UTF-16 slice is cut to an even length, which decodes the
// same characters: Node 24.16 on Windows corrupts its heap decoding an
// odd-length slice at an odd offset as UTF-16.
const even = (b) => b.subarray(0, b.length - (b.length % 2));
const utf16 = (b, bigEndian = false) => {
  const copy = Buffer.from(even(b));
  if (bigEndian) copy.swap16();
  return copy.toString("utf16le");
};
const asText = (buf) => {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  if (buf[0] === 0xff && buf[1] === 0xfe) return utf16(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return utf16(buf.subarray(2), true);
  if (!buf.includes(0)) return buf.toString("utf8");
  // No BOM: UTF-16 text in the ASCII range has a NUL in every other byte.
  let lowNul = 0, highNul = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    if (buf[i] === 0) lowNul += 1;
    if (buf[i + 1] === 0) highNul += 1;
  }
  const pairs = Math.floor(buf.length / 2);
  if (highNul >= pairs * 0.9 && lowNul <= pairs * 0.01) return utf16(buf);
  if (lowNul >= pairs * 0.9 && highNul <= pairs * 0.01) return utf16(buf, true);
  return null;
};
// A kit names its brand in identity.canonical_name. Any quoted value of that
// key counts, in any file and at any depth (a renamed kit, a kit inside
// another object, JSON that does not parse, a kit escaped into a string), and
// so does an unquoted one on the key's line in any file that is not code:
// YAML as a block, a list item or a flow mapping, in a .yml file, a copy of
// one, a Markdown fence or a text file. In code an unquoted value is an
// expression, and a type (canonical_name: string) is no brand. Only file paths
// are reported, never a brand.
const quotedBrand = /canonical_name\\?["']?\s*[:=]\s*\\?["']([^"'\\\r\n]*)/g;
const plainBrand = /(?:^|[\s{,])canonical_name[ \t]*:[ \t]*([^"'\s#,{}[\]][^#,{}\r\n]*)/gm;
const typeWord = /^(?:(?:string|str|String)(?:\s*\|\s*(?:null|undefined|None))?|Optional\[str\]|null|Null|NULL|None|undefined|~)\s*;?$/;
const codeFile = /\.(?:[cm]?[jt]sx?|py|pyi|ps1|psm1|sh|bash|cmd|bat)$/i;
const jsonBrands = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((item) => jsonBrands(item, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "canonical_name" && typeof item === "string") out.push(item);
      jsonBrands(item, out);
    }
  }
  return out;
};
const otherBrand = (text, rel) => {
  const names = [...text.matchAll(quotedBrand)].map((m) => m[1]);
  if (!codeFile.test(rel)) names.push(...[...text.matchAll(plainBrand)].map((m) => m[1].trim()).filter((v) => !typeWord.test(v)));
  if (/\.json$/i.test(rel)) { try { names.push(...jsonBrands(JSON.parse(text))); } catch {} }
  return names.some((name) => name !== "Metrix");
};
const found = {};
const branded = new Set();
for (const rel of tracked) {
  let buf = linkTargets.get(rel);
  if (buf === undefined) { try { buf = readFileSync(path.join(root, rel)); } catch { continue; } }
  const text = asText(buf);
  if (text === null) {
    const strings = [buf.toString("latin1"), utf16(buf), utf16(buf.subarray(1))].flatMap((t) => t.match(/[ -~]{6,}/g) ?? []);
    for (const run of strings) {
      for (const m of run.matchAll(homePath)) {
        if (generic.some((g) => g.test(m[0]))) continue;
        (found[rel] ??= []).push({ line: "binary", text: m[0], hash: hash(m[0]) });
      }
      if (otherBrand(run, "")) branded.add(rel);
    }
    continue;
  }
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(absolutePath)) {
      const hit = m.slice(1).find(Boolean);
      if (generic.some((g) => g.test(hit))) continue;
      (found[rel] ??= []).push({ line: i + 1, text: hit, hash: hash(hit) });
    }
  });
  if (otherBrand(text, rel)) branded.add(rel);
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
// it sits and whatever it is called. The engine's evaluation fixtures carry
// its own brand, and only those are allowed. A kit is caught by its content
// (above: a renamed kit still names its brand) and by its name: a file whose
// name says "brand kit" or "master execution prompt", spelled with any
// separators or none, or a file in a folder whose name does, at any depth. A
// name may run on past the last word (BrandKitFinal, brand-kit-v2,
// brandkitv2), except into the rest of a common word: kitchen, kite, kitten,
// kitty, and promptly, prompter, prompting, prompted. Engine code named like a
// kit fails too, by design: rename it. The one exception is the name of the
// engine's own brand-kit-builder skill folder: what sits below it is checked
// like anything else.
const fixtureKits = [
  "skills/metrix-video-assembly/evals/metrix-feed-4x5-product-journey/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-mst-hook-row/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-reels-from-app-recordings/files/brand-kit.json",
  "skills/metrix-video-assembly/evals/metrix-reels-refuses-unsourced-proof/files/brand-kit.json",
];
const gap = String.raw`(?:[^A-Za-z0-9]|%[0-9A-Fa-f]{2})*`;
const notWord = (...rests) => `(?!(?:${rests.map(ci).join("|")})(?![A-Za-z]))`;
const kitNames = [
  new RegExp(`${ci("brand")}${gap}${ci("kit")}[Ss]?${notWord("chen", "chens", "e", "es", "ten", "tens", "ty")}`),
  new RegExp(`${ci("master")}${gap}${ci("execution")}${gap}${ci("prompt")}[Ss]?${notWord("ly", "er", "ers", "ing", "ings", "ed")}`),
];
const kitNamed = (name) => kitNames.some((re) => re.test(name));
const kitFiles = tracked.filter((f) => {
  const dirs = f.split("/");
  const base = dirs.pop();
  if (kitNamed(base)) return true;
  if (f === "brand-kits/README.md") return false;
  const own = dirs[0] === "skills" && dirs[1] === "brand-kit-builder" ? 2 : 0;
  return dirs.slice(own).some(kitNamed);
});
const strays = kitFiles.filter((f) => !fixtureKits.includes(f));
check("no brand kit is tracked outside the engine's own evaluation fixtures", strays.length === 0, strays.join(", "));
check("no tracked file names a brand other than the engine's own (canonical_name)", branded.size === 0, [...branded].join(", "));
for (const f of fixtureKits) {
  let name;
  try { name = JSON.parse(read(f)).identity?.canonical_name; } catch { name = undefined; }
  check(`${f} carries the engine's own brand`, tracked.includes(f) && name === "Metrix", `tracked ${tracked.includes(f)}, brand ${name}`);
}

console.log("\n== GO.cmd updates itself safely ==");
// cmd.exe reads a batch file a line at a time from a byte offset, so a pull
// that replaces GO.cmd mid-run leaves cmd.exe reading the new file from the old
// offset. The GO.cmd main shipped first (0.1.x) pulls on a plain line, and the
// next line of its CRLF checkout starts at byte 1558. That byte must start the
// guard: one line that jumps to the new file's top (a jump without call never
// returns) unless the run began in the new file, which sets MCE_GO_TOP. Its
// setlocal turns off the delayed expansion that the old file turned on, so a
// ! in an argument survives the jump. This file's own pull shares one line
// with the same jump. No line that carries %* sits in or holds brackets,
// because cmd.exe expands %* before it matches brackets and a ) in a path
// would close the block. Nothing calls "%~f0", since call expands % twice.
const go = readFileSync(path.join(root, "GO.cmd")).toString("latin1");
const goLines = go.split("\r\n");
const goCode = goLines.filter((l) => !/^\s*(?:rem\b|::)/i.test(l));
const guard = 'if not defined MCE_GO_TOP setlocal DisableDelayedExpansion & set "MCE_GO_PULLED=1" & "%~f0" %*';
const pullLine = 'if not defined MCE_GO_PULLED set "MCE_GO_PULLED=1" & git pull --ff-only --quiet 2>nul & "%~f0" %*';
check("GO.cmd has CRLF line endings only", go.includes("\r\n") && !/[^\r]\n/.test(go) && !/\r(?!\n)/.test(go));
check("GO.cmd starts the guard line at byte 1558", go.slice(1556, 1558) === "\r\n" && go.startsWith(`${guard}\r\n`, 1558), JSON.stringify(go.slice(1558, 1660)));
check("GO.cmd sets MCE_GO_TOP before byte 1558", go.slice(0, 1558).includes('\r\nset "MCE_GO_TOP=1"\r\n'));
check("GO.cmd turns delayed expansion off on its second line, and never on",
  goLines[1] === "setlocal DisableDelayedExpansion" && !/EnableDelayedExpansion/i.test(go));
check("GO.cmd pulls once, on the line that jumps to the updated file",
  goCode.filter((l) => /\bgit\s+pull\b/i.test(l)).length === 1 && goCode.includes(pullLine));
// A line ending in "(" opens a block and one starting with ")" closes it.
let depth = 0;
const bracketed = [];
goLines.forEach((l, i) => {
  const t = l.trim();
  if (/^(?:rem\b|::)/i.test(t)) return;
  if (t.startsWith(")")) depth = Math.max(0, depth - 1);
  if (l.includes("%*") && (depth > 0 || /[()]/.test(l.replace(/"[^"]*"/g, "")))) bracketed.push(i + 1);
  if (t.endsWith("(")) depth += 1;
});
check("GO.cmd keeps %* off every line inside or holding brackets", bracketed.length === 0, `lines ${bracketed.join(", ")}`);
check("GO.cmd never calls itself (call expands % a second time)", !goCode.some((l) => /\bcall\s+"%~f0"/i.test(l)));
// The same second expansion takes a % out of a value already put into a call
// line, a folder name holding one, and doubles a quoted ^. So a call line
// leaves each variable to call's own expansion: written %%NAME%%, the value
// goes in once, as it is.
const earlyCalls = goCode.filter((l) => /\bcall\s/i.test(l) && !/^\s*echo\b/i.test(l))
  .filter((l) => l.replace(/%%[A-Za-z_][A-Za-z0-9_]*%%/g, "").includes("%"));
check("GO.cmd's call lines leave every variable to call's own expansion (%%NAME%%)", earlyCalls.length === 0, earlyCalls.join(" | "));
// setup.ps1 updates itself too, when it runs on its own. Under GO.cmd
// (MCE_GO_PULLED is set) a second pull could replace GO.cmd while cmd.exe
// waits on the line that started setup, and cmd.exe would read on in the new
// file at the old offset. There setup.ps1 only fetches, which changes no file.
const setupPs = read("sprint/setup.ps1").split(/\r?\n/);
const underGo = setupPs.findIndex((l) => /^\s*if \(\$env:MCE_GO_PULLED\) \{\s*$/.test(l));
const indent = underGo < 0 ? "" : setupPs[underGo].match(/^\s*/)[0];
const onItsOwn = underGo < 0 ? -1 : setupPs.findIndex((l, i) => i > underGo && l.trimEnd() === `${indent}} else {`);
const ownEnd = onItsOwn < 0 ? -1 : setupPs.findIndex((l, i) => i > onItsOwn && l.trimEnd() === `${indent}}`);
const setupPulls = setupPs.flatMap((l, i) => (/\bgit\b.*\spull\b/.test(l) && !/^\s*#/.test(l) ? [i] : []));
check("setup.ps1 pulls only when GO.cmd has not (MCE_GO_PULLED)",
  ownEnd > onItsOwn && onItsOwn > underGo && setupPulls.length > 0 && setupPulls.every((i) => i > onItsOwn && i < ownEnd),
  `if at line ${underGo + 1}, else at ${onItsOwn + 1}, its end at ${ownEnd + 1}, pulls at ${setupPulls.map((i) => i + 1).join(", ")}`);

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
