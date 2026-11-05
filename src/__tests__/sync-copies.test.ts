import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("../../scripts/sync-copies.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function repo(copies: unknown = [{ source: "a/canon.md", targets: ["b/copy.md", "c/copy.md"] }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-copies-"));
  dirs.push(root);
  const put = (p: string, body: string) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), body); };
  put("scripts/skill-copies.json", JSON.stringify({ schemaVersion: 1, copies }));
  put("a/canon.md", "line one\nline two\n");
  const run = (...a: string[]) => spawnSync(process.execPath, [tool, "--root", root, ...a], { encoding: "utf8" });
  return { root, put, run, read: (p: string) => fs.readFileSync(path.join(root, p), "utf8") };
}

describe("sync-copies", () => {
  it("fails --check when a copy is missing, then writes it and passes", () => {
    const r = repo();
    const missing = r.run("--check");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("b/copy.md");
    expect(missing.stderr).toContain("c/copy.md");
    expect(r.run().status).toBe(0);
    expect(r.read("b/copy.md")).toBe("line one\nline two\n");
    expect(r.run("--check").status).toBe(0);
  });

  it("detects a drifted copy, names its canonical source, and repairs it from the source", () => {
    const r = repo();
    r.run();
    r.put("c/copy.md", "line one\nline two EDITED\n");
    const drift = r.run("--check");
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain("differs from a/canon.md: c/copy.md");
    expect(drift.stderr).not.toContain("b/copy.md");
    expect(r.run().status).toBe(0);
    expect(r.read("c/copy.md")).toBe("line one\nline two\n");
  });

  it("treats a Windows line-ending difference as in step, but not a changed word", () => {
    const r = repo();
    r.run();
    r.put("b/copy.md", "line one\r\nline two\r\n");
    expect(r.run("--check").status).toBe(0);
    r.put("b/copy.md", "line one\r\nline 2\r\n");
    expect(r.run("--check").status).toBe(1);
  });

  it("fails when the canonical source is missing instead of copying nothing", () => {
    const r = repo([{ source: "a/gone.md", targets: ["b/copy.md"] }]);
    const result = r.run("--check");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("canonical source missing: a/gone.md");
  });

  it.each([
    ["a path that escapes the repository", [{ source: "a/canon.md", targets: ["../outside.md"] }], "escapes the repository"],
    ["a file listed as its own copy", [{ source: "a/canon.md", targets: ["a/canon.md"] }], "its own copy"],
    ["a target listed twice", [{ source: "a/canon.md", targets: ["b/copy.md", "b/copy.md"] }], "listed twice"],
    ["a chain of copies", [{ source: "a/canon.md", targets: ["b/copy.md"] }, { source: "b/copy.md", targets: ["c/copy.md"] }], "cannot chain"],
    ["an entry with no targets", [{ source: "a/canon.md", targets: [] }], "nonempty targets"],
  ])("refuses a manifest with %s", (_name, copies, message) => {
    const r = repo(copies as unknown);
    const result = r.run("--check");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
    expect(fs.existsSync(path.join(r.root, "..", "outside.md"))).toBe(false);
  });

  it("reports installed skills that differ, updates them with --write, and never deletes or installs", () => {
    const r = repo();
    r.put("skills/alpha/SKILL.md", "alpha v2\n");
    r.put("skills/alpha/references/new.md", "new file\n");
    r.put("skills/alpha/evals/big.bin", "skipped fixture\n");
    r.put("skills/beta/SKILL.md", "beta not installed\n");
    const installed = fs.mkdtempSync(path.join(os.tmpdir(), "installed-skills-"));
    dirs.push(installed);
    fs.mkdirSync(path.join(installed, "alpha", "out"), { recursive: true });
    fs.writeFileSync(path.join(installed, "alpha", "SKILL.md"), "alpha v1\n");
    fs.writeFileSync(path.join(installed, "alpha", "out", "keep.txt"), "a run folder the repo does not know\n");

    const report = r.run("--installed", installed);
    expect(report.status).toBe(1);
    expect(report.stdout).toContain("differs: alpha/SKILL.md");
    expect(report.stdout).toContain("missing: alpha/references/new.md");
    expect(report.stdout).not.toContain("evals");
    expect(report.stdout).not.toContain("beta");
    expect(fs.readFileSync(path.join(installed, "alpha", "SKILL.md"), "utf8")).toBe("alpha v1\n");

    const write = r.run("--installed", installed, "--write");
    expect(write.status).toBe(0);
    expect(fs.readFileSync(path.join(installed, "alpha", "SKILL.md"), "utf8")).toBe("alpha v2\n");
    expect(fs.readFileSync(path.join(installed, "alpha", "references", "new.md"), "utf8")).toBe("new file\n");
    expect(fs.readFileSync(path.join(installed, "alpha", "out", "keep.txt"), "utf8")).toContain("run folder");
    expect(fs.existsSync(path.join(installed, "beta"))).toBe(false);
    expect(r.run("--installed", installed).status).toBe(0);
  });
});

describe("the real repository", () => {
  it("has every deliberate copy in step with its canonical file", () => {
    const real = path.resolve(path.dirname(tool), "..");
    const result = spawnSync(process.execPath, [tool, "--root", real, "--check"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});
