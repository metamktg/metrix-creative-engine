#!/usr/bin/env node
/*
 * The one writer of timeline.json, and every emitter downstream of it.
 *
 *   node timeline.mjs plan --phrases phrases.json --cut cut.json [--out timeline.json]
 *   node timeline.mjs check timeline.json [--cut cut.json] [--phrases phrases.json] [--no-inputs] [--json]
 *   node timeline.mjs emit timeline.json --target <t> [--ratio 9:16] [--captions cap|clean] [--out file]
 *   node timeline.mjs emit timeline.json --all [--dir folder]
 *
 * plan refuses inputs that do not validate, a phrase map whose sha256 differs from the one the
 * cut plan names, and a reference cycle. The timeline is written beside the cut plan by default
 * (its input paths are relative to the timeline's folder).
 *
 * check reads the plan inputs named in timeline.inputs (relative to the timeline) unless --cut,
 * --phrases or --no-inputs say otherwise, verifies their sha256, re-plans and evaluates every
 * constraint. Exit 0 PASS or WARN, 1 FAIL, 2 usage or input error.
 *
 * emit targets: storyboard (needs --ratio and --captions), srt, transcript, cues, edl, voice-graph,
 * tm, stills-times, edge-times. edl reads the plan inputs. --all writes every target into --dir
 * (default the timeline's folder) and stamps each storyboard with the timeline's sha256.
 */
import fs from "node:fs";
import path from "node:path";
import { plan, PlanError } from "./timeline/plan.mjs";
import { check, verdict } from "./timeline/check.mjs";
import { emit, emitAll, EmitError, TARGETS } from "./timeline/emit.mjs";
import { serialize, sha256Hex } from "./timeline/schema.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const valued = ["--phrases", "--cut", "--out", "--target", "--ratio", "--captions", "--dir"];
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith("--") && !valued.includes(all[i - 1]));
const die = (m, code = 2) => { console.error(`timeline: ${m}`); process.exit(code); };
for (const a of argv.slice(1)) if (a.startsWith("--") && ![...valued, "--all", "--json", "--no-inputs"].includes(a)) die(`unknown option ${a}`);

const readBytes = (p) => { try { return fs.readFileSync(p); } catch (e) { die(`cannot read ${p}: ${e.message}`); } };
const readJson = (p) => { const b = readBytes(p); try { return { json: JSON.parse(b.toString("utf8")), sha256: sha256Hex(b) }; } catch (e) { die(`${p} is not JSON: ${e.message}`); } };
const rel = (from, to) => path.relative(from, to).split(path.sep).join("/") || ".";
const write = (file, text) => { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, text); };

if (cmd === "plan") {
  const pf = flag("--phrases"), cf = flag("--cut");
  if (!pf || !cf) die("usage: timeline.mjs plan --phrases phrases.json --cut cut.json [--out timeline.json]");
  const out = flag("--out", path.join(path.dirname(cf), "timeline.json"));
  const pm = readJson(pf), cp = readJson(cf);
  const dir = path.dirname(path.resolve(out));
  try {
    const tl = plan(pm.json, cp.json, { phrasemapPath: rel(dir, path.resolve(pf)), cutplanPath: rel(dir, path.resolve(cf)), phrasemapSha256: pm.sha256, cutplanSha256: cp.sha256 });
    const text = serialize(tl);
    write(out, text);
    console.log(JSON.stringify({ out, sha256: sha256Hex(text), duration: tl.duration, shots: tl.shots.length, captions: tl.captions.groups.length }));
  } catch (e) {
    if (e instanceof PlanError) die(e.message, 1);
    throw e;
  }
} else if (cmd === "check") {
  const tf = positional[0];
  if (!tf) die("usage: timeline.mjs check timeline.json [--cut cut.json] [--phrases phrases.json] [--no-inputs] [--json]");
  const tl = readJson(tf).json;
  const dir = path.dirname(path.resolve(tf));
  const opts = {};
  if (!argv.includes("--no-inputs")) {
    const cf = flag("--cut") ?? (tl.inputs?.cutplan?.path ? path.resolve(dir, tl.inputs.cutplan.path) : null);
    const pf = flag("--phrases") ?? (tl.inputs?.phrasemap?.path ? path.resolve(dir, tl.inputs.phrasemap.path) : null);
    if (cf) { const c = readJson(cf); opts.cutplan = c.json; opts.cutplanSha256 = c.sha256; }
    if (pf) { const p = readJson(pf); opts.phrasemap = p.json; opts.phrasemapSha256 = p.sha256; }
  }
  const findings = check(tl, opts);
  const v = verdict(findings);
  if (argv.includes("--json")) console.log(JSON.stringify({ verdict: v, findings }, null, 2));
  else {
    for (const f of findings) console.log(`${f.verdict.padEnd(4)} ${f.rule}${f.id ? ` [${f.id}]` : ""}: ${f.detail}`);
    console.log(`timeline check: ${v}`);
  }
  process.exit(v === "FAIL" ? 1 : 0);
} else if (cmd === "emit") {
  const tf = positional[0];
  if (!tf) die(`usage: timeline.mjs emit timeline.json (--target ${TARGETS.join("|")} [--ratio 9:16] [--captions cap|clean] [--out file] | --all [--dir folder])`);
  const raw = readBytes(tf);
  const tl = JSON.parse(raw.toString("utf8"));
  const dir = path.dirname(path.resolve(tf));
  const opts = { timelineSha256: sha256Hex(raw) };
  const cf = tl.inputs?.cutplan?.path ? path.resolve(dir, tl.inputs.cutplan.path) : null;
  const pf = tl.inputs?.phrasemap?.path ? path.resolve(dir, tl.inputs.phrasemap.path) : null;
  const loadInputs = () => {
    if (!cf || !pf || !fs.existsSync(cf) || !fs.existsSync(pf)) return;
    const c = readJson(cf), p = readJson(pf);
    if (c.sha256 !== tl.inputs.cutplan.sha256) die(`${cf} changed since the timeline was planned (sha256 ${c.sha256}, timeline says ${tl.inputs.cutplan.sha256}); re-plan`, 1);
    if (p.sha256 !== tl.inputs.phrasemap.sha256) die(`${pf} changed since the timeline was planned; re-plan`, 1);
    opts.cutplan = c.json; opts.phrasemap = p.json;
  };
  try {
    if (argv.includes("--all")) {
      const outDir = flag("--dir", dir);
      opts.timelinePath = rel(path.resolve(outDir), path.resolve(tf));
      loadInputs();
      const files = emitAll(tl, opts);
      for (const f of files) write(path.join(outDir, f.file), f.text);
      console.log(JSON.stringify({ dir: outDir, files: files.map((f) => ({ file: f.file, sha256: sha256Hex(f.text) })) }, null, 2));
    } else {
      const target = flag("--target");
      if (!target) die("pass --target or --all");
      const o = { ...opts, ratio: flag("--ratio"), captions: flag("--captions") };
      const out = flag("--out");
      o.timelinePath = rel(path.resolve(out ? path.dirname(out) : dir), path.resolve(tf));
      if (target === "edl") loadInputs();
      const text = emit(tl, target, o);
      if (out) { write(out, text); console.error(`timeline: wrote ${out}`); } else process.stdout.write(text);
    }
  } catch (e) {
    if (e instanceof EmitError) die(e.message, 1);
    throw e;
  }
} else {
  die("usage: timeline.mjs plan|check|emit ... (see the header of timeline.mjs)");
}
