/**
 * The skills ship as one plugin (.claude-plugin/plugin.json), so they install together at one
 * version. CI has no claude CLI to run `claude plugin validate .` (it passes locally), so this
 * holds the parts it checks that this repo can break: the manifest, and a top-level SKILL.md
 * with name and description frontmatter in every skill folder it points at.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(repo, ".claude-plugin/plugin.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));

describe(".claude-plugin/plugin.json", () => {
  it("names the package and tracks its version", () => {
    expect(manifest.name).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.skills).toBe("./skills/");
  });

  it("points at skill folders that each carry a SKILL.md whose frontmatter names it", () => {
    const dir = path.join(repo, manifest.skills);
    const skills = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(skills.length).toBeGreaterThan(0);
    for (const name of skills) {
      const file = path.join(dir, name, "SKILL.md");
      expect(fs.existsSync(file), `${name}/SKILL.md`).toBe(true);
      const front = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(front, `${name}: frontmatter`).not.toBeNull();
      expect(front![1], `${name}: name`).toMatch(new RegExp(`^name:\\s*${name}\\s*$`, "m"));
      expect(front![1], `${name}: description`).toMatch(/^description:\s*\S/m);
    }
  });
});
