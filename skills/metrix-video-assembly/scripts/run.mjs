#!/usr/bin/env node
/*
 * The run manifest (mce.run/1): one append-only record per run of what each stage read and
 * wrote, by path and sha256, so every deliverable traces back to its brief and a re-run with
 * the same inputs does not repeat a stage (or its spend).
 *
 *   node run.mjs init   <run-dir> --brief brief.json
 *   node run.mjs record <run-dir> --stage <stage> [--in role=path]... [--out role=path]...
 *                       [--source role=path]... [--status PASS|FAIL] [--tool name] [--note text]
 *   node run.mjs status <run-dir>
 *   node run.mjs verify <run-dir>
 *
 * Stages: plan, generate, ingest, assemble, render, qa, review, handoff.
 * --in     a file an earlier stage wrote (or the brief). Its current sha256 must equal what that
 *          stage recorded, or the record is refused: a stage never runs on a stale input.
 * --source a file entering the run from outside it (a Kie download, a direct Gemini or Veo
 *          result, a desktop edit). Only generate and ingest take sources; they are hashed as
 *          they arrive, so everything after them is bound.
 * --out    a file this stage wrote, hashed now.
 * A record whose stage, inputs and sources hash exactly like an earlier PASS record of the same
 * stage is not appended: the stage is already done ("skipped", exit 0), which makes a resumed
 * run free. handoff needs a PASS review record earlier in the run.
 * Paths are stored relative to the run directory and must stay inside it.
 *
 * Exit 0 recorded or skipped · 1 GATE_FAIL (a FAIL stage was recorded, or verify found a
 * changed file) · 2 CONTRACT (bad usage, schema, missing file, hash mismatch, order) ·
 * 3 BLOCKED (handoff without a passing review).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "mce.run/1";
export const STAGES = ["plan", "generate", "ingest", "assemble", "render", "qa", "review", "handoff"];
const SOURCE_STAGES = new Set(["generate", "ingest"]);
const FILE = "run.json";

export class RunError extends Error {
  constructor(code, message, exit) { super(message); this.code = code; this.exit = exit; }
}
const contract = (m) => new RunError("CONTRACT", m, 2);

export const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function inside(runDir, p) {
  const abs = path.resolve(runDir, p);
  const rel = path.relative(runDir, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw contract(`${p} is not inside the run directory`);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw contract(`${p} is not a file`);
  return { abs, rel: rel.split(path.sep).join("/") };
}

function ref(runDir, role, p) {
  const { abs, rel } = inside(runDir, p);
  return { role, path: rel, sha256: sha256File(abs) };
}

export function load(runDir) {
  const file = path.join(runDir, FILE);
  if (!fs.existsSync(file)) throw contract(`no ${FILE} in ${runDir}; run init first`);
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  if (run.schema !== SCHEMA || !Array.isArray(run.stages) || !run.brief) throw contract(`${FILE} is not ${SCHEMA}`);
  return run;
}

function save(runDir, run) {
  const file = path.join(runDir, FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(run, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function init(runDir, briefPath, { now = new Date() } = {}) {
  fs.mkdirSync(runDir, { recursive: true });
  if (fs.existsSync(path.join(runDir, FILE))) throw contract(`${FILE} already exists in ${runDir}`);
  const brief = ref(runDir, "brief", briefPath);
  const run = { schema: SCHEMA, run_id: `run-${crypto.randomUUID().slice(0, 12)}`, created_at: now.toISOString(), brief, stages: [] };
  save(runDir, run);
  return run;
}

// Every file the run knows: the brief and each stage's outputs and sources, latest first.
function known(run) {
  const all = [run.brief];
  for (const s of run.stages) all.push(...s.outputs, ...s.sources);
  return all.reverse();
}

const key = (stage, inputs, sources) =>
  JSON.stringify([stage, ...[...inputs, ...sources].map((f) => [f.role, f.path, f.sha256]).sort()]);

export function record(runDir, { stage, inputs = [], outputs = [], sources = [], status = "PASS", tool = null, note = null }, { now = new Date() } = {}) {
  if (!STAGES.includes(stage)) throw contract(`unknown stage "${stage}"; stages are ${STAGES.join(", ")}`);
  if (!["PASS", "FAIL"].includes(status)) throw contract(`status must be PASS or FAIL, not ${status}`);
  if (sources.length && !SOURCE_STAGES.has(stage)) throw contract(`only generate and ingest take --source; ${stage} reads files the run already holds (--in)`);
  const run = load(runDir);
  const ins = inputs.map(([role, p]) => ref(runDir, role, p));
  const files = known(run);
  for (const f of ins) {
    const prior = files.find((k) => k.path === f.path);
    if (!prior) throw contract(`--in ${f.path} was not written by an earlier stage of this run (use --source on generate or ingest for files from outside)`);
    if (prior.sha256 !== f.sha256) throw new RunError("CONTRACT_HASH", `--in ${f.path} changed since the run recorded it (${prior.sha256.slice(0, 12)} -> ${f.sha256.slice(0, 12)}); re-run the stage that writes it`, 2);
  }
  if (stage === "handoff" && !run.stages.some((s) => s.stage === "review" && s.status === "PASS")) {
    throw new RunError("BLOCKED", "handoff needs a PASS review record earlier in this run", 3);
  }
  const srcs = sources.map(([role, p]) => ref(runDir, role, p));
  const k = key(stage, ins, srcs);
  const done = run.stages.find((s) => s.status === "PASS" && key(s.stage, s.inputs, s.sources) === k);
  if (done && status === "PASS") return { skipped: true, stage: done };
  const entry = {
    n: run.stages.length + 1, stage, status, at: now.toISOString(), tool, note,
    inputs: ins, sources: srcs, outputs: outputs.map(([role, p]) => ref(runDir, role, p)),
  };
  run.stages.push(entry);
  save(runDir, run);
  return { skipped: false, stage: entry };
}

/** Re-hash every recorded file. A file that changed after it was recorded is listed. */
export function verify(runDir) {
  const run = load(runDir);
  const changed = [];
  for (const f of known(run).reverse()) {
    const abs = path.resolve(runDir, f.path);
    const now = fs.existsSync(abs) ? sha256File(abs) : null;
    if (now !== f.sha256) changed.push({ path: f.path, recorded: f.sha256, now });
  }
  // a path can be rewritten by a later stage on purpose; only its latest record must hold
  const latest = new Map();
  for (const f of known(run)) if (!latest.has(f.path)) latest.set(f.path, f.sha256);
  return changed.filter((c) => latest.get(c.path) === c.recorded);
}

function parsePairs(argv, flag) {
  const out = [];
  argv.forEach((a, i) => {
    if (a !== flag) return;
    const v = argv[i + 1] ?? "";
    const eq = v.indexOf("=");
    if (eq < 1) throw contract(`${flag} takes role=path, got "${v}"`);
    out.push([v.slice(0, eq), v.slice(eq + 1)]);
  });
  return out;
}

export function main(argv) {
  const [cmd, runDir] = argv;
  const flag = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  try {
    if (!cmd || !runDir) throw contract("usage: run.mjs init|record|status|verify <run-dir> ...");
    const dir = path.resolve(runDir);
    if (cmd === "init") {
      if (!flag("--brief")) throw contract("init needs --brief <file inside the run directory>");
      console.log(JSON.stringify(init(dir, flag("--brief")), null, 2));
      return 0;
    }
    if (cmd === "record") {
      const r = record(dir, {
        stage: flag("--stage"), status: flag("--status") ?? "PASS", tool: flag("--tool"), note: flag("--note"),
        inputs: parsePairs(argv, "--in"), outputs: parsePairs(argv, "--out"), sources: parsePairs(argv, "--source"),
      });
      console.log(JSON.stringify(r, null, 2));
      return !r.skipped && r.stage.status === "FAIL" ? 1 : 0;
    }
    if (cmd === "status") {
      const run = load(dir);
      console.log(JSON.stringify({ run_id: run.run_id, brief: run.brief, stages: run.stages.map((s) => ({ n: s.n, stage: s.stage, status: s.status, tool: s.tool, outputs: s.outputs.map((o) => `${o.role}:${o.path}`) })) }, null, 2));
      return 0;
    }
    if (cmd === "verify") {
      const changed = verify(dir);
      console.log(JSON.stringify({ verdict: changed.length ? "FAIL" : "PASS", changed }, null, 2));
      return changed.length ? 1 : 0;
    }
    throw contract(`unknown command "${cmd}"`);
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    console.error(`run: ${e.code}: ${e.message}`);
    return e.exit;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
