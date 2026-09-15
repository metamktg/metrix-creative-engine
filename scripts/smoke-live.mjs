#!/usr/bin/env node
/**
 * One command that proves the whole chain against the LIVE Kie API:
 * balance, generate a 4:5 static, download it, report pass or fail.
 *
 *   node scripts/smoke-live.mjs
 *
 * Needs KIE_AI_API_KEY. Spends a small number of credits (one image).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kie = path.join(root, "skills", "kie-generate", "scripts", "kie.mjs");
const spec = path.join(root, "examples", "smoke-static.json");
const out = path.join(root, "out");

if (!process.env.KIE_AI_API_KEY) {
  console.error("FAIL: KIE_AI_API_KEY is not set in this terminal.\n" +
    "  Windows  : set KIE_AI_API_KEY=your-key\n" +
    "  mac/Linux: export KIE_AI_API_KEY=your-key");
  process.exit(1);
}

function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [kie, ...args], { stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    p.stdout.on("data", (d) => { stdout += d; process.stderr.write(d); });
    p.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
  });
}

console.error("=== 1/3  balance (costs nothing) ===");
const c = await run(["credits"]);
if (c.code !== 0) { console.error("\nFAIL at step 1. The key was rejected, or Kie is unreachable."); process.exit(1); }
const credits = Number(c.stdout);
console.error(`    balance: ${credits}`);
if (Number.isFinite(credits) && credits <= 0) { console.error("\nFAIL: no credits on the account. Top up at https://kie.ai"); process.exit(1); }

console.error("\n=== 2/3  generate a 4:5 static (spends credits) ===");
const g = await run(["run", "google/nano-banana", "--input-file", spec, "--out", out, "--timeout", "300"]);
if (g.code === 2) { console.error("\nINCONCLUSIVE: timed out. The task is still running; poll the taskId above."); process.exit(2); }
if (g.code !== 0) {
  console.error("\nFAIL at step 2. The model rejected the request, or generation failed.");
  console.error("Send the error above verbatim: a 422 means the catalog's parameters are wrong.");
  process.exit(1);
}

console.error("\n=== 3/3  check a file actually landed ===");
const files = existsSync(out) ? readdirSync(out).filter((f) => statSync(path.join(out, f)).size > 1024) : [];
if (!files.length) {
  console.error("PARTIAL: generation succeeded and returned a URL, but nothing downloaded.");
  console.error("The URL above is valid for about 24 hours. Open it in a browser.");
  process.exit(1);
}
for (const f of files) console.error(`    ${path.join(out, f)}  (${statSync(path.join(out, f)).size} bytes)`);

console.error(`
PASS. The chain works end to end: key, model id, parameters, polling, download.

Now LOOK at the file above. The plumbing working is not the same as the output
being right. Check it is 4:5 (taller than wide), that it is a product shot, and
that it is not mangled. That is the part no script can verify.`);
