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
// roots (/private, /var/folders). The slashes of a mount or a root may be
// raw, JSON-escaped or URL-encoded, also inside a file URL. So do a share
// behind a long-path prefix (a drive behind one is read as a drive), and a
// home or a volume on a WSL share written with forward slashes or in an
// editor's remote URI, raw or as a file URL; the generic forms below are
// tested on the path such a prefix holds. A path may follow
// an escape (\n, \r or \t in a string, %XX in a URL). A match runs on through
// the space in "Program Files" and "Program Files (x86)", and otherwise ends
// at whitespace or a delimiter; its last segment also ends at its first
// letter of a script written without spaces (proseAfter, below). A UNC host
// has two characters at least, so a one-letter escape such as \\d\\ is not
// taken for one; escaped regex text with a longer word between its
// backslashes is, and is listed like any other path.
const body = String.raw`(?:Program Files(?: \(x86\))?|[^\s"'` + "`" + String.raw`()<>|,;])*`;
// A match is a path of its own unless it goes on from a word or a path
// written right before it. An escape there counts as the character it stands
// for (\n, \r, \t, \/, \uXXXX with a surrogate pair as one character, \u{X},
// \UXXXXXXXX, \xXX, a URL's UTF-8 in %XX), and a mark (an accent, a
// variation selector) as the character it is on. A drive letter or a UNC
// share goes on from a word: a letter or digit of a script written with
// spaces between words (Latin, Greek, Cyrillic, Arabic, Hangul and the
// rest), or an underscore that is not emphasis (one or two after no word, as
// Markdown writes italics). A root slash goes on from that and from . ~ / \ -,
// so a segment of a URL or of a relative path (example.com/cafe/p/123,
// assets/menu/media/x) is no path. Han, Kana, Thai and the other scripts
// written without spaces run straight into what follows: a letter of one
// goes on before a root slash only inside a URL or path segment, and before
// a drive letter never. A file URL's own slashes go on from nothing, in any
// case and however escaped or encoded (file:///Users, file:\/\/\/Users,
// file%3A%2F%2F%2FUsers), and neither do an editor link's
// (vscode://file/Users). Anything else ends a word: punctuation, a symbol or
// an emoji, a space. A closing angle bracket exempts nothing: a placeholder
// and an HTML tag end the same way, so a root folder name right after a
// placeholder is listed in known-absolute-paths.json like any other path.
const ci = (word) => [...word].map((c) => `[${c.toUpperCase()}${c}]`).join("");
const afterEscape = String.raw`(?<=\\[nrt])|(?<=\\u[0-9A-Fa-f]{4})|(?<=\\u\{[0-9A-Fa-f]{1,6}\})|(?<=\\U[0-9A-Fa-f]{8})|(?<=\\x[0-9A-Fa-f]{2})|(?<=%[0-9A-Fa-f]{2})`;
const slash = String.raw`(?:\\?\/|%2[Ff])`;
const colon = "(?::|%3[Aa])";
const fileUrl = String.raw`(?<=${ci("file")}${colon}${slash}{2}(?:${ci("localhost")})?)|(?<=${colon}${slash}{2}${ci("file")})`;
const emphasis = String.raw`(?<=(?:^|[^A-Za-z0-9_])_{1,2})`;
const notAfterWord = String.raw`(?:(?<![A-Za-z0-9_])|${afterEscape}|${emphasis})`;
const notAfterPath = String.raw`(?:(?<![A-Za-z0-9_.~/\\-])|${afterEscape}|${fileUrl}|${emphasis})`;
const userRoots = ["Users", "home", "usr/home", "root", "Volumes", "media", "run/media", "private", "var/folders", "mnt/[A-Za-z]"]
  .map((root) => root.split("/").join(slash)).join("|");
// The name of a WSL distribution or of an editor's remote (wsl+ubuntu), raw
// or URL-encoded, which a path on that system follows.
const remoteName = String.raw`(?:[^\s"'<>\\/%]|%(?!2[Ff])[0-9A-Fa-f]{2})+`;
const wslShare = String.raw`(?:${ci("file")}${colon})?${slash}{2}(?:${ci("wsl")}[.]${ci("localhost")}|${ci("wsl")}\$)${slash}${remoteName}`;
const editorRemote = String.raw`${ci("vscode")}-${ci("remote")}${colon}${slash}{2}${remoteName}`;
// One group per form, so a match says which it is: the two drive forms, the
// UNC share, the two root forms, a share behind a long-path prefix
// (\\?\UNC\host\), and a WSL share (//wsl.localhost/Ubuntu, also in a file
// URL) or an editor's remote URI (vscode-remote://wsl+ubuntu) with a home or
// a volume after it. A form matches as far as its first folder, and the rest
// of a path is read only for a match that is a path of its own, so a long
// line costs time in step with its length.
const pathStart = new RegExp([
  String.raw`${notAfterWord}[A-Za-z]:[\\/]`,
  String.raw`${notAfterWord}[A-Za-z]%3[Aa](?:%5[Cc]|%2[Ff]|[\\/])`,
  String.raw`(?<![A-Za-z0-9_])\\\\[A-Za-z0-9_.$-]{2,}\\`,
  String.raw`${notAfterPath}${slash}(?:${userRoots})${slash}`,
  String.raw`${notAfterPath}${slash}(?:cygdrive${slash})?[A-Za-z]${slash}(?=[A-Za-z0-9_.~-])`,
  String.raw`(?<![A-Za-z0-9_])\\\\[?.]\\${ci("UNC")}\\[A-Za-z0-9_.$-]{2,}\\`,
  String.raw`(?<![A-Za-z0-9_/])${wslShare}(?=${slash}(?:${userRoots})${slash})`,
  String.raw`${editorRemote}(?=${slash}(?:${userRoots})${slash})`,
].map((form) => `(${form})`).join("|"), "gu");
const rootForms = new Set([3, 4]);
// The generic forms are tested on the path that such a prefix holds.
const pathPrefix = new RegExp(String.raw`^(?:\\\\[?.]\\${ci("UNC")}\\|${wslShare}|${editorRemote})`, "u");
const pathRest = new RegExp(body, "uy");
const unspaced = new RegExp(`[${["Han", "Hiragana", "Katakana", "Bopomofo", "Thai", "Lao", "Khmer", "Myanmar", "Tibetan", "Yi", "Javanese", "Balinese"]
  .map((script) => String.raw`\p{scx=${script}}`).join("")}]`, "u");
const letterOrDigit = /^[\p{L}\p{N}]$/u;
const markChar = /^\p{M}$/u;
const wordChar = /^[A-Za-z0-9_]$/;
const pathChar = /^[.~\/\\-]$/;
// The escape that ends at index i of a line, if one does: the character it
// stands for and the index it starts at. Bytes in %XX that are not UTF-8, a
// lone surrogate and a code point past U+10FFFF read as U+FFFD, which ends a
// word.
const utf8 = new TextDecoder("utf-8", { fatal: true });
const notAChar = String.fromCharCode(0xfffd);
const escapeBefore = (line, i) => {
  const from = Math.max(0, i - 12);
  const head = line.slice(from, i);
  let m;
  if ((m = head.match(/\\([nrt\/])$/))) return { c: { n: "\n", r: "\r", t: "\t", "/": "/" }[m[1]], at: from + m.index };
  if ((m = head.match(/\\u\{([0-9A-Fa-f]{1,6})\}$/) ?? head.match(/\\U([0-9A-Fa-f]{8})$/))) {
    const code = parseInt(m[1], 16);
    return { c: code <= 0x10ffff ? String.fromCodePoint(code) : notAChar, at: from + m.index };
  }
  if ((m = head.match(/\\u([Dd][89ABab][0-9A-Fa-f]{2})\\u([Dd][C-Fc-f][0-9A-Fa-f]{2})$/))) {
    return { c: String.fromCharCode(parseInt(m[1], 16), parseInt(m[2], 16)), at: from + m.index };
  }
  if ((m = head.match(/\\u([0-9A-Fa-f]{4})$/) ?? head.match(/\\x([0-9A-Fa-f]{2})$/))) return { c: String.fromCharCode(parseInt(m[1], 16)), at: from + m.index };
  if ((m = head.match(/(?:%[0-9A-Fa-f]{2}){1,4}$/))) {
    const bytes = m[0].slice(1).split("%").map((hex) => parseInt(hex, 16));
    for (let k = bytes.length - 1; k >= 0; k--) {
      try {
        const c = utf8.decode(Uint8Array.from(bytes.slice(k)));
        if ([...c].length === 1) return { c, at: from + m.index + 3 * k };
      } catch {}
    }
    return { c: notAChar, at: i - 3 };
  }
  return null;
};
// The character that ends at index i of a line, read through an escape, and
// the index it starts at.
const charBefore = (line, i) => {
  if (i <= 0) return null;
  const escaped = escapeBefore(line, i);
  if (escaped) return escaped;
  const low = line.charCodeAt(i - 1);
  const high = i > 1 ? line.charCodeAt(i - 2) : 0;
  const pair = low >= 0xdc00 && low < 0xe000 && high >= 0xd800 && high < 0xdc00 ? 2 : 1;
  return { c: line.slice(i - pair, i), at: i - pair };
};
// Whether a file URL's slashes end at index i of a line, read through escapes.
const fileUrlBefore = (line, i) => {
  if (!/file/i.test(line.slice(Math.max(0, i - 40), i))) return false;
  let text = "";
  for (let p = charBefore(line, i), k = 0; p && k < 24; p = charBefore(line, p.at), k++) text = p.c + text;
  return /file:\/\/(?:localhost)?$|:\/\/file$/i.test(text);
};
const goesOn = (line, i, form) => {
  let p = charBefore(line, i);
  while (p && markChar.test(p.c)) p = charBefore(line, p.at);
  if (!p) return false;
  const root = rootForms.has(form);
  // One or two underscores of emphasis after no word (a path in italics) are
  // no word.
  if (p.c === "_") {
    let q = charBefore(line, p.at);
    if (q && q.c === "_") q = charBefore(line, q.at);
    if (!q || !(letterOrDigit.test(q.c) || q.c === "_" || (root && pathChar.test(q.c)))) return false;
  }
  let on = wordChar.test(p.c) || (root && pathChar.test(p.c)) || (letterOrDigit.test(p.c) && !unspaced.test(p.c));
  if (!on && root && letterOrDigit.test(p.c)) {
    // A letter of a script without spaces goes on only inside a segment.
    for (let q = charBefore(line, p.at); q; q = charBefore(line, q.at)) {
      if (pathChar.test(q.c)) { on = true; break; }
      if (!letterOrDigit.test(q.c) && !markChar.test(q.c) && q.c !== "_") break;
    }
  }
  return on && !(root && fileUrlBefore(line, i));
};
// The last segment of a path ends at its first letter of a script written
// without spaces: such text right after a path is prose (a drive root and then
// a sentence in Japanese), while a folder named in one goes on to the
// separator after it.
const proseAfter = (rest) => {
  let from = 0;
  for (const s of rest.matchAll(/[\\/]|%2[Ff]|%5[Cc]/g)) from = s.index + s[0].length;
  for (let k = from; k < rest.length; ) {
    const c = String.fromCodePoint(rest.codePointAt(k));
    if (unspaced.test(c)) return rest.slice(0, k);
    k += c.length;
  }
  return rest;
};
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
// A kit names its brand in identity.canonical_name. Every file is read for
// it, at any depth and however the key is written: quoted, after a dot
// (identity.canonical_name), in Markdown code or bold, after \n in a JSON
// string, escaped twice in a string inside a string. A value counts when it
// is quoted in "", '' or backticks (unless it holds a ${...} interpolation),
// also after a YAML anchor or tag, when it is a typed field's quoted default
// (str = '...'), in an XML element (with a namespace prefix or none), and in
// parsed JSON at any depth, where a schema of the field gives its examples,
// default, const and enum. An unquoted value counts as YAML reads it, in a
// file that is not code (YAML, JSON that does not parse, plain text, a .env, a
// style sheet): a block value with its commas and the more indented lines
// that go on with it, a flow mapping's values and a flow list's items, and
// when the key's line ends at the colon or at a block scalar's | or >, the
// lines below that are indented past the key or are list items at its
// indent. A line that sets canonical_name= counts in such a file too, after
// dotted keys or none. Markdown reads the same way in its front matter and in
// a fence with no language or a data language (yaml, json, toml, text);
// outside a fence it is prose, and so is an HTML page outside its script,
// style and PHP. In prose a value also ends at a comma, a semicolon, a full
// stop, a bracket or a table's bar, and an HTML tag, a comment's marks or
// Markdown emphasis around it is not part of it, nor is an inline tag between
// the key and its colon. Code, and a fence labelled with a programming
// language, holds expressions: an unquoted value there is not read, but a
// comment is read as prose, and the text of a string, a heredoc, a
// here-string or a SQL dollar-quoted body as YAML (a kit written to a file).
// A batch file's rem lines are prose, and what each echo writes is YAML. A
// type (str, string, Optional[str] = None, z.string()) is no brand, nor is a
// placeholder ({{name}}, {name}, ${NAME}, $NAME, $1, $(command), %NAME%, a
// printf conversion such as %s, <name>, an expression in braces), nor an
// empty value, nor a mapping under the key that has a $ref key or a JSON
// Schema type: that is a schema describing the field (JSON Schema, OpenAPI).
// In prose, a comment or a string, a value that describes the field is no
// brand either (describes, below). Punctuation and closing brackets that end
// a value are not part of it. Only file paths are reported, never a brand.
const quotedBrand = /canonical_name(?:\\*["']|[`*_]){0,3}\s*[:=]\s*(?:[&!][^\s"'\\]*\s+)*(\\*)(["'])([^"'\\\r\n]*)/g;
const backtickBrand = /canonical_name(?:\\?["']|[`*_]){0,3}[ \t]*[:=][ \t]*(`+)([^`\r\n]*)\1/g;
const typeName = "(?:str|string|String|None|null|Null|NULL|undefined)";
const typeExpr = String.raw`(?:(?:Optional|Union)\[)?${typeName}(?:[\s\[\]|!?,]*${typeName})*[\s\[\]|!?]*`;
const typeWord = new RegExp(String.raw`^(?:~|${typeExpr}(?:=.*)?|z\.string\(\)\S*)\s*[;,]?$`);
const typedDefault = new RegExp(String.raw`canonical_name(?:\\?["']|[\x60*_]){0,3}[ \t]*:[ \t]*${typeExpr}=[ \t]*(["'\x60])([^"'\x60\\\r\n]*)\1`, "g");
const xmlBrand = /<(?:[A-Za-z_][\w.-]*:)?canonical_name(?:\s[^<>]*)?>([^<]*)</g;
const placeholder = /^(?:\{\{.*|\{[A-Za-z_][\w.]*\}?|\$\{[^{}]*\}?|\$\(?[A-Za-z_][\w:]*\)?|\$(?:\d+|[@*#?])|\$\((?:[^()]|\([^()]*\))*\)|%(?:\([A-Za-z_]\w*\))?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh?|ll?|[Lqjzt])?[A-Za-z]|%[A-Za-z_]\w*%|<[^<>]*>?)$/;
// In prose, a comment or a code string, a value can describe the field rather
// than give it: an article and a lower-case word ("the brand name, exactly as
// printed"), or a word for a value that is not there.
const describes = (name) => /^(?:[Tt]he|[Aa]n?)\s+\p{Ll}/u.test(name) || /^(?:missing|required|optional|empty|unset|not set|none|n\/a|tbd|todo|unknown|invalid)$/i.test(name);
const plainKey = /(?:(?<![A-Za-z0-9_])|(?<=\\[nrt])|(?<=(?:^|[^A-Za-z0-9_])_{1,2}))(["']?)canonical_name\1[`*_]{0,3}[ \t]*:/g;
const envKey = /^[ \t]*(?:export[ \t]+)?(?:[A-Za-z_][\w-]*\.)*canonical_name[ \t]*=(.*)$/;
const itemStart = /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+)*/;
// A schema's own keys, which a brand map does not have.
const schemaKey = /(?:^|[{,\s])(["']?)(?:type\1[ \t]*:[ \t]*(?:\[[ \t]*)?["']?(?:string|number|integer|boolean|object|array|null)(?![\w-])|\$ref\1[ \t]*:)/;
const htmlLang = /^(?:html?|xhtml|vue|svelte|astro|php)$/i;
const codeLang = /^(?:[cm]?[jt]sx?|javascript|typescript|py|python|pyi|ps1|psm1|powershell|pwsh|sh|bash|zsh|shell|cmd|bat|batch|rb|ruby|go|rs|rust|java|kts?|kotlin|swift|c|cc|cpp|h|hpp|cs|csharp|lua|graphql|gql|sql|css|scss)$/i;
const fenceLine = /^\s*(`{3,}|~{3,})[ \t]*([^\s`]*)/;
// Adds every item to a list one at a time: a spread call passes each item as
// an argument, and a file with a hundred thousand of them overflows the stack.
const pushAll = (into, items) => {
  for (const item of items) into.push(item);
  return into;
};
// Every canonical_name string in a parsed JSON value, walked with a list of
// its own rather than by recursion, so a deeply nested file cannot overflow.
// A schema of the field gives values of it too: its examples, default, const
// and enum.
const schemaValues = ["examples", "default", "const", "enum"];
const jsonBrands = (root) => {
  const out = [];
  for (const stack = [root]; stack.length; ) {
    const value = stack.pop();
    if (Array.isArray(value)) pushAll(stack, value);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (key === "canonical_name" && typeof item === "string") out.push(item);
        else if (key === "canonical_name" && item && typeof item === "object" && !Array.isArray(item)) {
          for (const k of schemaValues) {
            for (const x of Array.isArray(item[k]) ? item[k] : [item[k]]) if (typeof x === "string") out.push(x);
          }
        }
        stack.push(item);
      }
    }
  }
  return out;
};
// How code in a language writes comments and text.
const lexerFor = (lang) => {
  const l = lang.toLowerCase();
  const ps = /^(?:ps1|psm1|powershell|pwsh)$/.test(l);
  const sh = /^(?:sh|bash|zsh|shell)$/.test(l);
  const hash = ps || sh || /^(?:py|python|pyi|rb|ruby|graphql|gql)$/.test(l);
  const js = /^(?:[cm]?[jt]sx?|javascript|typescript)$/.test(l);
  const sql = l === "sql";
  return {
    line: hash ? ["#"] : sql || l === "lua" ? ["--"] : l === "php" ? ["//", "#"] : ["//"],
    blocks: ps ? [["<#", "#>"]] : /^(?:rb|ruby)$/.test(l) ? [["=begin", "=end"]] : hash ? [] : l === "lua" ? [["--[[", "]]"]] : [["/*", "*/"]],
    quotes: js || l === "go" ? "\"'`" : "\"'",
    triple: /^(?:py|python|pyi|graphql|gql|kts?|kotlin|swift|java|cs|csharp)$/.test(l),
    heredoc: sh ? /^<<-?[ \t]*\\?(["']?)([A-Za-z_]\w*)\1/ : /^(?:rb|ruby)$/.test(l) ? /^<<[-~]?(["']?)([A-Za-z_]\w*)\1/ : l === "php" ? /^<<<[ \t]*(["']?)([A-Za-z_]\w*)\1/ : null,
    hereString: ps,
    spans: sh || ps,
    // PowerShell escapes with a backtick, and neither it nor a shell escapes
    // in single quotes.
    escape: ps ? "`" : "\\",
    rawSingle: sh || ps,
    // A SQL body between $$ or $tag$ marks.
    dollar: sql,
    regex: js,
  };
};
const unescapeText = (s) => s.replace(/\\(r\\n|[nrt]|[\s\S])/g, (all, c) => (c === "t" ? "\t" : c === "n" || c === "r" || c === "r\\n" ? "\n" : c));
const lineEnd = (text, k) => {
  const e = text.indexOf("\n", k);
  return e < 0 ? text.length : e;
};
// The parts of code that a person writes text in: a comment, read as prose,
// and the text of a string, a heredoc or a here-string, read as YAML. In a
// batch file those are a rem or :: line and what an echo writes.
const codePieces = (text, lang) => {
  const pieces = [];
  // A style sheet's declarations are keys and values: it reads as YAML does.
  if (/^(?:css|scss)$/i.test(lang)) return [{ prose: false, lines: text.split(/\r?\n/) }];
  if (/^(?:cmd|bat|batch)$/i.test(lang)) {
    const notes = [];
    const echoes = [];
    for (const line of text.split(/\r?\n/)) {
      notes.push(line.match(/^\s*@?(?:rem(?=\s|$)|::)(.*)$/i)?.[1] ?? "\0");
      // An echo writes up to an unescaped & or |, which starts another command.
      for (const e of line.matchAll(/(?:^|[\s&|(])@?echo[ \t.:]((?:\^[^\r\n]|[^\r\n&|^])*)/gi)) echoes.push(e[1].split(/(?<!\^)[<>]/)[0]);
    }
    return [{ prose: true, lines: notes }, { prose: false, lines: echoes }];
  }
  const o = lexerFor(lang);
  const n = text.length;
  // A string's text is said: a passage of it can describe a field.
  const say = (s) => pieces.push({ prose: false, said: true, lines: unescapeText(s).split(/\r?\n/) });
  // A quote that closes nothing up to an index does not close later either.
  const noClose = new Map();
  let notes = null;
  let notesEnd = -1;
  let heredocs = [];
  let last = "";
  let before = "";
  let word = "";
  let regexMiss = -1;
  for (let i = 0; i < n; ) {
    const c = text[i];
    if (c === "\n" && heredocs.length) {
      let k = i + 1;
      for (const end of heredocs) {
        const lines = [];
        while (k < n) {
          const e = lineEnd(text, k);
          const l = text.slice(k, e).replace(/\r$/, "");
          k = e + 1;
          if (l.trim() === end || l.trim() === `${end};`) break;
          lines.push(l);
        }
        pieces.push({ prose: false, lines });
      }
      heredocs = [];
      i = Math.min(n, k);
      continue;
    }
    const block = o.blocks.find(([open]) => text.startsWith(open, i));
    if (block) {
      let e = text.indexOf(block[1], i + block[0].length);
      if (e < 0) e = n;
      pieces.push({ prose: true, lines: text.slice(i + block[0].length, e).split(/\r?\n/).map((l) => l.replace(/^[ \t]*\*(?!\/)[ \t]?/, "")) });
      i = Math.min(n, e + block[1].length);
      continue;
    }
    const mark = o.line.find((open) => text.startsWith(open, i) && (open !== "#" || i === 0 || /\s/.test(text[i - 1])));
    if (mark) {
      const e = lineEnd(text, i);
      const note = text.slice(i + mark.length, e).replace(/\r$/, "");
      // Line comments one after another read as one passage.
      if (notes && /^\r?\n[ \t]*$/.test(text.slice(notesEnd, i))) notes.push(note);
      else pieces.push({ prose: true, lines: (notes = [note]) });
      notesEnd = e;
      i = e;
      continue;
    }
    if (c === "<" && o.heredoc) {
      const h = text.slice(i, i + 80).match(o.heredoc);
      if (h) {
        heredocs.push(h[2]);
        i += h[0].length;
        last = "w";
        continue;
      }
    }
    if (c === "@" && o.hereString && (text[i + 1] === '"' || text[i + 1] === "'") && /^[ \t]*\r?$/.test(text.slice(i + 2, lineEnd(text, i)))) {
      const q = text[i + 1];
      const lines = [];
      let k = lineEnd(text, i) + 1;
      while (k < n) {
        const e = lineEnd(text, k);
        const l = text.slice(k, e).replace(/\r$/, "");
        if (l.startsWith(`${q}@`)) {
          k += 2;
          break;
        }
        lines.push(l);
        k = e + 1;
      }
      pieces.push({ prose: false, lines });
      i = Math.min(n, k);
      last = q;
      continue;
    }
    if (o.triple && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
      const q = text.slice(i, i + 3);
      let e = text.indexOf(q, i + 3);
      if (e < 0) e = n;
      say(text.slice(i + 3, e));
      i = Math.min(n, e + 3);
      last = '"';
      continue;
    }
    if (c === "$" && o.dollar) {
      const t = text.slice(i, i + 66).match(/^\$(?:[A-Za-z_]\w{0,63})?\$/);
      if (t) {
        let e = text.indexOf(t[0], i + t[0].length);
        if (e < 0) e = n;
        say(text.slice(i + t[0].length, e));
        i = Math.min(n, e + t[0].length);
        last = "'";
        continue;
      }
    }
    if (o.quotes.includes(c) && !(i < (noClose.get(c) ?? -1))) {
      let j = i + 1;
      let closed = false;
      for (; j < n; j++) {
        const d = text[j];
        if (d === o.escape && !(o.rawSingle && c === "'")) { j++; continue; }
        if (d === c) { closed = true; break; }
        if (d === "\n" && !o.spans && c !== "`") break;
      }
      if (closed) {
        say(text.slice(i + 1, j));
        i = j + 1;
      } else {
        // An apostrophe, a prime or a lifetime: a quote that closes nothing.
        noClose.set(c, j);
        i += 1;
      }
      last = c;
      continue;
    }
    // A slash after i++ or i-- divides. A scan that found no closing slash
    // ends where this line does, and no later slash on the line starts one.
    if (c === "/" && o.regex && i >= regexMiss && !(/^[+-]$/.test(last) && before === last) && (/^[(,=:[!&|?{};+\-*%<>~^]?$/.test(last) || /^(?:return|typeof|case|do|else|in|of|void|yield|await|delete|instanceof|new|throw)$/.test(word))) {
      // A regular expression literal, to its closing slash on this line.
      let j = i + 1;
      let inClass = false;
      for (; j < n && text[j] !== "\n"; j++) {
        if (text[j] === "\\") j++;
        else if (text[j] === "[") inClass = true;
        else if (text[j] === "]") inClass = false;
        else if (text[j] === "/" && !inClass) break;
      }
      if (text[j] === "/") {
        i = j + 1;
        last = "/";
        word = "";
        continue;
      }
      regexMiss = j;
    }
    if (/[A-Za-z0-9_$]/.test(c)) word = /[A-Za-z0-9_$]/.test(text[i - 1] ?? "") ? word + c : c;
    else if (!/\s/.test(c)) word = "";
    if (!/\s/.test(c)) {
      before = last;
      last = c;
    }
    i += 1;
  }
  return pieces;
};
const blankOut = (s) => s.replace(/[^\r\n]/g, " ");
// A line of prose without a comment's marks or the inline tags that can sit
// between a key and its colon (code, span, emphasis, a link).
const inlineTag = /<\/?(?:code|span|b|strong|em|i|kbd|samp|var|tt|mark|a|u|small|q|cite|abbr)\b[^<>]*>/gi;
const proseLine = (line) => line.replace(/<!--|-->/g, (marks) => " ".repeat(marks.length)).replace(inlineTag, "");
// An HTML page, a Vue, Svelte or Astro component, or a PHP page: its script,
// style and PHP are code, the rest is prose.
const htmlPieces = (text, lang) => {
  const pieces = [];
  let page = text;
  if (/^astro$/i.test(lang)) {
    page = page.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, (front) => {
      pushAll(pieces, codePieces(front.slice(3, -3), "ts"));
      return blankOut(front);
    });
  }
  page = page.replace(/<script\b[^<>]*>([\s\S]*?)(?:<\/script\s*>|$)|<style\b[^<>]*>([\s\S]*?)(?:<\/style\s*>|$)|<\?(?:php\b|=)?([\s\S]*?)(?:\?>|$)/gi, (all, script, style, php) => {
    pushAll(pieces, codePieces(script ?? style ?? php ?? "", script !== undefined ? "js" : style !== undefined ? "css" : "php"));
    return blankOut(all);
  });
  pieces.push({ prose: true, lines: page.split(/\r?\n/).map(proseLine) });
  return pieces;
};
// Markdown: front matter is YAML, prose outside a fence, and a fence as the
// file of its language would be.
const markdownPieces = (text) => {
  const lines = text.split(/\r?\n/);
  const pieces = [];
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.findIndex((l, j) => j > 0 && /^(?:---|\.\.\.)$/.test(l));
    const stop = end < 0 ? lines.length : end;
    pieces.push({ prose: false, lines: lines.slice(1, stop) });
    i = stop + 1;
  }
  let prose = [];
  pieces.push({ prose: true, lines: prose });
  for (; i < lines.length; i++) {
    const f = lines[i].match(fenceLine);
    if (!f) {
      prose.push(proseLine(lines[i]));
      continue;
    }
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const g = lines[j].match(fenceLine);
      if (g && g[1][0] === f[1][0] && g[1].length >= f[1].length && !g[2]) break;
      body.push(lines[j]);
    }
    if (htmlLang.test(f[2])) pushAll(pieces, htmlPieces(body.join("\n"), f[2]));
    else if (codeLang.test(f[2])) pushAll(pieces, codePieces(body.join("\n"), f[2]));
    else pieces.push({ prose: false, lines: body });
    pieces.push({ prose: true, lines: (prose = []) });
    i = j;
  }
  return pieces;
};
const piecesOf = (text, rel) => {
  const ext = rel.match(/\.([^./]+)$/)?.[1] ?? "";
  if (/^(?:md|markdown|mdx)$/i.test(ext)) return markdownPieces(text);
  if (htmlLang.test(ext)) return htmlPieces(text, ext);
  if (codeLang.test(ext)) return codePieces(text, ext);
  return [{ prose: false, lines: text.split(/\r?\n/) }];
};
// What a reading gives for a value too long to read in full. No name runs
// that long, so the file fails rather than pass on the part that was read.
const tooLong = "(a value too long to read in full)";
// A flow mapping or list, from its opening bracket at lines[i][v] to the one
// that closes it, and where that one ends. A body that stops first, at 20,000
// characters, at 50 lines, or where the file's flow budget (flow.left) runs
// out, comes back cut; one that runs to the end of the text does not.
const flowBody = (lines, i, v, flow) => {
  if (flow.left <= 0) return { body: "", cut: true };
  const most = Math.min(20000, flow.left);
  let depth = 0;
  let body = "";
  let j = i;
  for (; j < lines.length && j < i + 50; j++) {
    const text = lines[j];
    for (let k = j === i ? v : 0; k < text.length; k++) {
      const c = text[k];
      body += c;
      if (c === "{" || c === "[") depth += 1;
      else if ((c === "}" || c === "]") && --depth === 0) {
        flow.left -= body.length;
        return { body, cut: false, line: j, col: k + 1 };
      }
      if (body.length >= most) {
        flow.left -= body.length;
        return { body, cut: true };
      }
    }
    body += "\n";
  }
  flow.left -= body.length;
  return { body, cut: j < lines.length };
};
// A line's or a flow item's value, without its list dashes or its key. A
// quoted key's colon needs no space after it ({"en":"Metrix"}); a plain key
// runs to the first colon, with no quote before it and a space or the end
// after it. Read in one pass, so a long line costs time in step with it.
const space = /\s/;
const valueOf = (piece) => {
  const s = piece.replace(/^\s*(?:-(?:\s+|$))*/, "");
  const quoted = s.match(/^(?:"[^"]*"|'[^']*')\s*:\s*/);
  if (quoted) return s.slice(quoted[0].length);
  const k = s.search(/[:"']/);
  if (k > 0 && s[k] === ":" && (k + 1 === s.length || space.test(s[k + 1]))) {
    let e = k + 1;
    while (e < s.length && space.test(s[e])) e += 1;
    return s.slice(e);
  }
  return s;
};
// The values in a flow mapping or list: a list's items and a mapping's
// values. A mapping's item without a key is a key with no value, as a
// placeholder ({brand}, {{ name }}) reads.
const flowValues = (body) => {
  const values = [];
  const open = [];
  let piece = "";
  const end = () => {
    const value = valueOf(piece);
    if (open[open.length - 1] !== "{" || value !== piece.replace(/^\s*(?:-(?:\s+|$))*/, "")) values.push(value);
    piece = "";
  };
  for (const c of body) {
    if (c === "{" || c === "[") { end(); open.push(c); }
    else if (c === "}" || c === "]") { end(); open.pop(); }
    else if (c === "," || c === "\n") end();
    else piece += c;
  }
  end();
  return values;
};
const proseCut = /[,;|"`)]|(?<!\$)\(|\.(?:\s|$)|[ \t]#|\\t/;
// A value up to the first of its cuts. One that fills its 4,096-character
// window (more: its line goes on past the window) with no cut in it comes back
// null: it is too long to read in full.
const upTo = (text, cut, more) => {
  const piece = text.split(cut)[0];
  return more && piece.length === text.length ? null : piece;
};
const proseValue = (s, more = false) => upTo(s.replace(/<[^<>]*>/g, " "), proseCut, more);
// A value without a comment, the quotes and emphasis around it, or the
// punctuation after it; a closing bracket goes too when nothing opened it.
// Trimmed a character at a time, so a long run of spaces costs time in step
// with it. No type or placeholder runs past 256 characters, so a longer value
// is a name without being tested as one.
const leadMark = /[\s"'`*_]/;
const tailMark = /[\s"'`*_.,;:!?}\]]/;
const tailMarkParen = /[\s"'`*_.,;:!?})\]]/;
const trimWith = (s, lead, tail) => {
  let a = 0;
  let b = s.length;
  while (lead && a < b && lead.test(s[a])) a += 1;
  while (b > a && tail.test(s[b - 1])) b -= 1;
  return s.slice(a, b);
};
const brandName = (piece) => {
  let name = trimWith(piece.replace(/(?:^|[ \t])#.*$/, ""), leadMark, tailMark);
  if (!name.includes("(")) name = trimWith(name, null, tailMarkParen);
  if (name.length > 256) return name;
  return name && !typeWord.test(name) && !placeholder.test(name) ? name : "";
};
// A quoted or parsed value names a brand unless it is empty, the engine's
// own, a type or a placeholder.
const named = (raw) => {
  const s = raw.trim();
  if (!s || s === "Metrix") return false;
  return s.length > 256 || (!typeWord.test(s) && !placeholder.test(s));
};
// A line that starts a block of its own (a list item, a heading, a fence, a
// quote, a rule, a YAML document marker), and a line that is a YAML key.
const blockStart = /^[ \t]*(?:(?:[-*+]|\d+[.)])(?:[ \t]|$)|#|```|~~~|>|(?:[-*_=][ \t]*){3,}$|\.\.\.[ \t]*$)/;
const yamlKey = /^[ \t]*(?:\?(?:[ \t]|$)|(?:(?:"[^"]*"|'[^']*')[ \t]*|[^\s"'#][^:#]*):(?:[ \t]|$))/;
const plainBrands = (raw, prose, flow, lenient) => {
  const names = [];
  const lines = raw.flatMap((line) => (line.includes("canonical_name") && /\\[nr]/.test(line) ? line.split(/\\r\\n|\\[nr]/) : [line]));
  if (!lines.some((line) => line.includes("canonical_name"))) return names;
  // In a chain of keys, each one inside the last, every key looks at the lines
  // below all of them, so what a line is gets worked out once, a walk below a
  // key steps over blank lines in one go, and a line read as a value once is
  // not read again: it would give the same name.
  const blank = lines.map((line) => !line.trim());
  const nextFilled = [];
  nextFilled[lines.length] = lines.length;
  for (let j = lines.length - 1; j >= 0; j--) nextFilled[j] = blank[j] ? nextFilled[j + 1] : j;
  const facts = new Map();
  const fact = (j) => {
    let f = facts.get(j);
    if (!f) facts.set(j, (f = { indent: lines[j].match(/^[ \t]*/)[0].length, item: /^[ \t]*-(?:[ \t]|$)/.test(lines[j]), schema: schemaKey.test(lines[j]) }));
    return f;
  };
  const readBelow = new Set();
  const readOn = new Set();
  // Where the last flow value read as values ends. A key whose flow value
  // opens before there sits inside it, and its values are among those read.
  let flowEnd = { line: -1, col: 0 };
  // In prose, a comment or a string, a value that describes the field is no
  // name (describes, above).
  const nameOf = (piece) => {
    const name = brandName(piece);
    return name && !(lenient && describes(name)) ? name : "";
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("canonical_name")) continue;
    const env = prose ? null : line.match(envKey);
    if (env) names.push(nameOf(env[1].split(/[ \t]#/)[0]));
    // Brackets still open before a key say it sits in a flow mapping or list.
    let at = 0;
    let open = 0;
    // Every key on a line has the same column (its line's indent and list
    // marks), so the lines below are walked once for the line, not per key.
    let walkedBelow = false;
    let walkedOn = false;
    for (const m of line.matchAll(plainKey)) {
      for (; at < m.index; at++) {
        if (line[at] === "{" || line[at] === "[") open += 1;
        else if (line[at] === "}" || line[at] === "]") open -= 1;
      }
      // After the colon: the closing marks of a bold or italic key, then any
      // YAML anchor or tag.
      let v = m.index + m[0].length;
      while (v < line.length && /[ \t*_]/.test(line[v])) v += 1;
      for (let t; (t = line.slice(v, v + 200).match(/^[&!]\S*(?:[ \t]+|$)/)); ) v += t[0].length;
      const value = line.slice(v, v + 4096);
      if (/^["'`]/.test(value)) continue;
      // A value in braces that holds an expression, with no colon, comma or
      // brace in it (an f-string's {kit['identity']['canonical_name']}), is a
      // placeholder.
      if (/^\{[A-Za-z_][^{}:,\r\n]*\}/.test(value)) continue;
      const more = line.length > v + 4096;
      const col = Math.min(m.index, line.match(itemStart)[0].length);
      const pieces = [];
      if (/^[{[]/.test(value)) {
        if (i < flowEnd.line || (i === flowEnd.line && v < flowEnd.col)) continue;
        const read = flowBody(lines, i, v, flow);
        if (read.cut) return [tooLong];
        if (!schemaKey.test(read.body)) {
          pushAll(pieces, flowValues(read.body));
          flowEnd = { line: read.line, col: read.col };
        }
      } else if (/^(?:[|>][-+0-9]*)?[ \t]*(?:#.*)?$/.test(value)) {
        if (walkedBelow) continue;
        walkedBelow = true;
        const below = [];
        for (let j = nextFilled[i + 1]; j < lines.length; j = nextFilled[j + 1]) {
          const { indent, item } = fact(j);
          if (indent > col || (indent === col && item)) {
            below.push(j);
            continue;
          }
          // The line right after the key is its value too when it can be no
          // sibling of the key: in prose a paragraph goes on, at any indent,
          // until a blank line or a new block; in YAML a line at the key's
          // indent that is no key and no list item can only be the value.
          if (j === i + 1 && !blockStart.test(lines[j]) && (prose || (indent === col && !yamlKey.test(lines[j])))) below.push(j);
          break;
        }
        if (!below.some((j) => fact(j).schema)) {
          for (const j of below) {
            if (readBelow.has(j)) continue;
            readBelow.add(j);
            pieces.push(prose ? proseValue(valueOf(lines[j])) : valueOf(lines[j]));
          }
        }
      } else if (open > 0) {
        const piece = upTo(value, /[,}\]]|[ \t]#|["`]|\\t/, more);
        if (piece === null) return [tooLong];
        pieces.push(piece);
      } else if (prose) {
        const piece = proseValue(value, more);
        if (piece === null) return [tooLong];
        pieces.push(piece);
      } else {
        const piece = upTo(value, /[ \t]#|["`]|\\t/, more);
        if (piece === null) return [tooLong];
        pieces.push(piece);
        // A plain value goes on in the lines below that are indented past it.
        for (let j = i + 1; !walkedOn && j < lines.length && !blank[j] && fact(j).indent > col; j++) {
          if (readOn.has(j)) continue;
          readOn.add(j);
          pieces.push(lines[j]);
        }
        walkedOn = true;
      }
      for (const piece of pieces) names.push(nameOf(piece));
    }
  }
  return names.filter(Boolean);
};
// The quoted forms beyond "" and '': a value in backticks that opens there
// (an even count of backticks before it on its line) and holds no ${...}, a
// typed field's quoted default, an XML element.
const extraBrands = (text) => {
  const names = [];
  let at = 0;
  let ticks = 0;
  for (const m of text.matchAll(backtickBrand)) {
    const opens = m.index + m[0].length - m[2].length - 2 * m[1].length;
    for (; at < opens; at++) {
      if (text[at] === "\n") ticks = 0;
      else if (text[at] === "`") ticks += 1;
    }
    if (ticks % 2 === 0 && !m[2].includes("${")) names.push(brandName(m[2]));
  }
  for (const m of text.matchAll(typedDefault)) names.push(brandName(m[2]));
  for (const m of text.matchAll(xmlBrand)) names.push(brandName(m[1]));
  return names.filter(Boolean);
};
// Whether any reading of a file finds a name other than the engine's own. The
// try holds JSON.parse alone: a file that does not parse goes without the JSON
// walk, and any other error stops the gate, which then fails.
const otherBrand = (text, rel) => {
  const other = (name) => name !== "Metrix";
  if (text.includes("canonical_name")) {
    // A quoted value read to its closing quote is tested as a whole (named);
    // one cut short by an escape is a name unless it is the engine's.
    for (const m of text.matchAll(quotedBrand)) {
      const whole = text.startsWith(m[1] + m[2], m.index + m[0].length);
      if (whole ? named(m[3]) : other(m[3])) return true;
    }
    if (extraBrands(text).some(other)) return true;
    // The flow values read in a file come to four times its length and a
    // million characters at most; past that it fails, so no shape of nested
    // values costs more than that.
    const flow = { left: 1000000 + 4 * text.length };
    for (const { prose, said, lines } of piecesOf(text, rel)) if (plainBrands(lines, prose, flow, prose || said === true).some(other)) return true;
  }
  if (!/\.json$/i.test(rel)) return false;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return false; }
  return jsonBrands(parsed).some(named);
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
    // A match that goes on from a word or a path before it is part of that:
    // skip it and look again from the next character.
    pathStart.lastIndex = 0;
    for (let m; (m = pathStart.exec(line)); ) {
      const form = m.slice(1).findIndex((g) => g !== undefined);
      if (goesOn(line, m.index, form)) {
        pathStart.lastIndex = m.index + 1;
        continue;
      }
      pathRest.lastIndex = m.index + m[0].length;
      const hit = m[0] + proseAfter(pathRest.exec(line)?.[0] ?? "");
      pathStart.lastIndex = m.index + hit.length;
      const held = hit.replace(pathPrefix, (p) => (/^\\{2}[?.]\\[Uu][Nn][Cc]\\$/.test(p) ? "\\\\" : ""));
      if (generic.some((g) => g.test(hit) || (held !== hit && g.test(held)))) continue;
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
// A rest continues the word only in the case of the letter before it
// (kitchen, KITCHEN): after a lower-case letter a capital starts a new word,
// as in BrandKitChen or MasterExecutionPromptEd.
const notWord = (...rests) => `(?!(?<=[a-z])(?:${rests.join("|")})(?![A-Za-z])|(?<=[A-Z])(?:${rests.map((r) => r.toUpperCase()).join("|")})(?![A-Za-z]))`;
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
