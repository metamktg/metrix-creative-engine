/**
 * The skills that spend credits carry eval cases that prove the guards hold before spend:
 * a matrix with nothing isolated, a product brief with no product, lip sync without a packet,
 * approval without QA. Each case is zero-spend by design: every one includes a grader that no
 * generation was submitted. Run them with `claude plugin eval . --eval-dir skills/<skill>/evals`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe.each(["metrix-ad-creative", "ugc-creator-edit"])("%s evals", (skill) => {
  const dir = path.join(repo, "skills", skill, "evals");
  const cases = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory()) : [];

  it("has guard cases", () => expect(cases.length).toBeGreaterThanOrEqual(2));

  it.each(cases)("%s is a complete, zero-spend case", (name) => {
    const c = path.join(dir, name);
    const caseYaml = fs.readFileSync(path.join(c, "case.yaml"), "utf8");
    expect(caseYaml).toMatch(new RegExp(`^name: ${name}$`, "m"));
    expect(caseYaml).toMatch(/^expected_outcome: \|/m);
    expect(fs.readFileSync(path.join(c, "prompt.md"), "utf8")).toMatch(/^---\n[\s\S]*allowed_tools:[\s\S]*---\n\n\S/);
    const graders = fs.readdirSync(path.join(c, "graders")).map((g) => fs.readFileSync(path.join(c, "graders", g), "utf8"));
    expect(graders.length).toBeGreaterThanOrEqual(2);
    for (const g of graders) expect(g).toMatch(/^---\ntype: llm\nfocus: trace\nweight: 1\n---\n\n\S/);
    // every case proves its guard held before spend
    expect(graders.some((g) => /No (Kie generation|lip-sync)|does not state or imply that .* is approved/.test(g))).toBe(true);
  });
});
