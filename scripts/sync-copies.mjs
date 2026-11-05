#!/usr/bin/env node
/*
 * Keep the repository's deliberate byte copies in step with their canonical source.
 *
 * Some files must exist more than once: a skill has to work when it is installed on
 * its own, and the scripts that `npm run verify` runs live in scripts/. Hand-edited
 * copies drift, and a fix applied to one copy passes a gate while the runtime uses
 * the broken file. scripts/skill-copies.json lists every canonical file and the
 * copies derived from it. Edit the canonical file only, then run this tool.
 *
 *   node scripts/sync-copies.mjs                  write the copies from their sources
 *   node scripts/sync-copies.mjs --check          fail if any copy differs or is missing
 *   node scripts/sync-copies.mjs --installed DIR  report skills under DIR that differ from the repo
 *   node scripts/sync-copies.mjs --installed DIR --write
 *                                                 copy repo skill files into DIR (never deletes)
 *   --root DIR    use another repository root (tests)
 *
 * --check compares with line endings normalised, so a Windows checkout that adds CR
 * characters does not count as drift. Writing copies source bytes exactly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const val = (k) => (has(k) ? args[args.indexOf(k) + 1] : undefined);
const repo = path.resolve(val("--root") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const die = (m, code = 2) => { console.error(`sync-copies: ${m}`); process.exit(code); };

const manifestFile = path.join(repo, "scripts", "skill-copies.json");
let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
catch (e) { die(`cannot read ${manifestFile}: ${e.message}`); }
if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.copies)) die("manifest needs schemaVersion 1 and a copies array");

const lf = (buf) => Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const same = (a, b) => lf(a).equals(lf(b));
const rel = (p) => path.relative(repo, p).split(path.sep).join("/");
const safe = (p) => {
  const abs = path.resolve(repo, p);
  if (abs !== repo && !abs.startsWith(repo + path.sep)) die(`manifest path escapes the repository: ${p}`);
  return abs;
};

const pairs = [];
const seen = new Set();
for (const entry of manifest.copies) {
  if (typeof entry?.source !== "string" || !Array.isArray(entry.targets) || !entry.targets.length) die("every copy needs a source and a nonempty targets array");
  const source = safe(entry.source);
  for (const t of entry.targets) {
    const target = safe(t);
    if (target === source) die(`a file cannot be its own copy: ${t}`);
    if (seen.has(target)) die(`target listed twice: ${t}`);
    seen.add(target);
    pairs.push({ source, target });
  }
}
for (const { source, target } of pairs) if (seen.has(source)) die(`${rel(source)} is both a canonical source and a target; copies cannot chain`);

function skillFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "__pycache__" || e.name === "evals" || e.name === "out" || e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out;
}

if (has("--installed")) {
  const installed = val("--installed");
  if (!installed) die("--installed needs a skills directory");
  const dest = path.resolve(installed);
  const skillsRoot = path.join(repo, "skills");
  let differing = 0, written = 0;
  for (const name of fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    const installedSkill = path.join(dest, name);
    if (!fs.existsSync(installedSkill)) continue; // never installs a skill that is not already there
    for (const file of skillFiles(path.join(skillsRoot, name))) {
      const relative = path.relative(path.join(skillsRoot, name), file);
      const target = path.join(installedSkill, relative);
      const want = fs.readFileSync(file);
      const have = fs.existsSync(target) ? fs.readFileSync(target) : null;
      if (have && same(want, have)) continue;
      differing++;
      console.log(`${have ? "differs" : "missing"}: ${name}/${relative.split(path.sep).join("/")}`);
      if (has("--write")) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target); written++; }
    }
  }
  console.log(`${differing} installed file(s) ${has("--write") ? `updated (${written} written)` : "out of date"} under ${dest}`);
  process.exit(!has("--write") && differing ? 1 : 0);
}

let bad = 0;
for (const { source, target } of pairs) {
  if (!fs.existsSync(source)) { console.error(`canonical source missing: ${rel(source)}`); bad++; continue; }
  const want = fs.readFileSync(source);
  const have = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (have && same(want, have)) continue;
  if (has("--check")) { console.error(`${have ? "differs from" : "missing; should copy"} ${rel(source)}: ${rel(target)}`); bad++; continue; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, want);
  console.log(`wrote ${rel(target)} from ${rel(source)}`);
}
if (has("--check")) {
  if (bad) { console.error(`${bad} copy problem(s). Edit the canonical file, then run: npm run sync:copies`); process.exit(1); }
  console.log(`copies in step: ${pairs.length} target(s) from ${manifest.copies.length} canonical file(s)`);
} else if (bad) process.exit(1);
