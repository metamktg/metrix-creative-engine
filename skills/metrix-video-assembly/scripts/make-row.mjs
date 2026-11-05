#!/usr/bin/env node
/*
 * Build every cell of a Matrix Sprint Test row from one base.
 *
 *   node make-row.mjs --base <base-run-dir> --brief brief.json --out <row-dir>
 *        [--field hook] [--text-id hook]
 *
 * <base-run-dir> holds storyboard.json (with "slot": {"scene": ...}) and
 * composition/. For each entry in brief.testing_framework.cells, this copies
 * the composition, puts the cell's <field> (default "hook") into the slot
 * scene's text item <text-id> (default: the slot scene's first line), both in
 * storyboard.json and in the composition's data-text element, names the cell by
 * testing_framework.matrix_naming_convention, and runs the row check.
 *
 * Nothing else changes between cells: same media, same clock, same audio, same
 * poster time. That is the point of the row.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const base = path.resolve(flag("--base"));
const brief = JSON.parse(fs.readFileSync(flag("--brief"), "utf8"));
const outDir = path.resolve(flag("--out"));
const field = flag("--field", "hook");
const die = (m) => { console.error(`make-row: ${m}`); process.exit(1); };

const sb = JSON.parse(fs.readFileSync(path.join(base, "storyboard.json"), "utf8"));
const tf = brief.testing_framework || die("brief has no testing_framework");
const cells = tf.cells || die("testing_framework.cells is missing");
const conv = tf.matrix_naming_convention || die("testing_framework.matrix_naming_convention is missing");
const slotScene = sb.scenes.findIndex((s) => s.id === sb.slot?.scene);
if (slotScene < 0) die('base storyboard needs "slot": {"scene": "<id>"} naming an existing scene');
const textId = flag("--text-id", sb.scenes[slotScene].text?.[0]?.id);
const ti = (sb.scenes[slotScene].text || []).findIndex((t) => t.id === textId);
if (ti < 0) die(`slot scene has no text item "${textId}"`);
const html = fs.readFileSync(path.join(base, "composition", "index.html"), "utf8");
const elRe = new RegExp(`(<([a-zA-Z0-9]+)[^>]*\\bdata-text="${textId}"[^>]*>)([\\s\\S]*?)(</\\2>)`);
if (!elRe.test(html)) die(`composition has no element with data-text="${textId}"`);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const made = [];
cells.forEach((cell, i) => {
  const copy = cell[field];
  if (!copy) die(`cell ${i} has no "${field}"`);
  const name = conv.replace(/\{(\w+)\}/g, (_, k) => {
    const key = { MatrixPosition: "matrix_position", ConceptCodes: "concept_codes", AngleCodes: "angle_codes", UniqueID: "unique_id" }[k] || k;
    if (cell[key] == null) die(`cell ${i} has no ${key} for {${k}}`);
    return cell[key];
  });
  const dir = path.join(outDir, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(path.join(base, "composition"), path.join(dir, "composition"), { recursive: true });
  fs.writeFileSync(path.join(dir, "composition", "index.html"), html.replace(elRe, (_, open, _t, _old, close) => `${open}${esc(copy)}${close}`));
  const cellSb = structuredClone(sb);
  cellSb.name = name;
  Object.assign(cellSb.scenes[slotScene].text[ti], { copy, source: `testing_framework.cells.${i}.${field}` });
  fs.writeFileSync(path.join(dir, "storyboard.json"), JSON.stringify(cellSb, null, 2) + "\n");
  made.push(path.join(dir, "storyboard.json"));
  console.error(`make-row: ${name}  "${copy}"`);
});

const check = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "check-storyboard.mjs"), "--row", ...made], { encoding: "utf8" });
process.stdout.write(check.stdout);
process.exit(check.status);
