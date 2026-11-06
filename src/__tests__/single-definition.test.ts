import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The timing rules have one definition, in timeline/rules.mjs. A second copy drifts: before
// extraction settled() lived in check-storyboard.mjs and render.mjs, and norm() in both again.
const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts", import.meta.url));
const RULES = path.join(scripts, "timeline", "rules.mjs");
const FUNCS = ["settled", "floorFor", "voFloorFor", "norm", "onsetGuard", "gridSnap", "ceilTo"];
const CONSTS = ["SETTLE_DEFAULT", "ONSET_GUARD"];
const NAMES = [...FUNCS, ...CONSTS];

// Bodies that are a copy whatever the copy is called (render.mjs had norm() inline as n()).
const BODIES: [RegExp, string][] = [
  [/\.replace\(\/\[‘’\]\/g,\s*"'"\)\.replace\(\/\[“”\]\/g/, "norm() body (curly-quote folding)"],
  [/enter\s*===\s*"none"\s*\?\s*0\s*:\s*\w+\.dur\s*\?\?/, "settled() body (enter none, dur default)"],
  [/words\(\w+\)\s*<=\s*3\s*\?\s*0\.8/, "floorFor() body (0.8 s label floor)"],
];

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sources(p);
    return /\.(mjs|js)$/.test(e.name) ? [p] : [];
  });
}

// A definition of a rule function: function NAME(, or NAME bound (const|let|var or a bare
// assignment) to an arrow or function expression. A same-named value that is not a function
// (compose-bed.mjs has const norm = 0.8 / peak, a gain) is a different thing and passes.
// A guarded constant counts on any binding.
const FN_RHS = String.raw`(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)`;
const defines = (src: string, name: string) => {
  const bind = String.raw`(?:\b(?:const|let|var)\s+${name}|^\s*${name})\s*=(?!=)\s*`;
  const re = CONSTS.includes(name) ? new RegExp(bind, "m") : new RegExp(String.raw`\bfunction\s*\*?\s*${name}\s*\(|${bind}${FN_RHS}`, "m");
  return re.test(src);
};

function findCopies(files: string[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    if (path.resolve(f) === path.resolve(RULES)) continue;
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(scripts, f).replace(/\\/g, "/");
    for (const n of NAMES) if (defines(src, n)) found.push(`${rel} defines ${n}`);
    for (const [re, what] of BODIES) if (re.test(src)) found.push(`${rel} carries a ${what}`);
  }
  return found;
}

describe("timing rules have a single definition", () => {
  const files = sources(scripts);

  it("scans the real script tree, rules.mjs included", () => {
    expect(files.map((f) => path.resolve(f))).toContain(path.resolve(RULES));
    expect(files.some((f) => f.endsWith("check-storyboard.mjs"))).toBe(true);
    expect(files.some((f) => f.endsWith("render.mjs"))).toBe(true);
  });

  it("rules.mjs defines every guarded name", () => {
    const src = fs.readFileSync(RULES, "utf8");
    for (const n of NAMES) expect(defines(src, n), n).toBe(true);
    for (const [re, what] of BODIES) expect(re.test(src), what).toBe(true);
  });

  it("no other script under skills/metrix-video-assembly/scripts defines one", () => {
    expect(findCopies(files)).toEqual([]);
  });

  it("check-storyboard.mjs and render.mjs import from timeline/rules.mjs", () => {
    for (const f of ["check-storyboard.mjs", "render.mjs"]) {
      expect(fs.readFileSync(path.join(scripts, f), "utf8"), f).toMatch(/from\s+"\.\/timeline\/rules\.mjs"/);
    }
  });

  it("the scanner catches each shape of copy it guards against", () => {
    const shapes = [
      "function settled(item) {\n  const enterEnd = item.in + (item.enter === \"none\" ? 0 : item.dur ?? 0.35);\n}",
      "const floorFor = (copy) => (words(copy) <= 3 ? 0.8 : 1.2);",
      "let norm = (s) => s;",
      "voFloorFor = function (c) { return 1; };",
      "const ONSET_GUARD = 0.3;",
      "const n = (s) => String(s).toLowerCase().replace(/[‘’]/g, \"'\").replace(/[“”]/g, '\"');",
    ];
    for (const s of shapes) {
      const hits = NAMES.some((n) => defines(s, n)) || BODIES.some(([re]) => re.test(s));
      expect(hits, s).toBe(true);
    }
    // Calls and imports are not definitions.
    for (const s of ["const w = settled(t);", "import { norm, settled } from \"./timeline/rules.mjs\";", "if (norm(a) === norm(b)) x();", "const normalize = (s) => s;", "const norm = 0.8 / peak;", "if (settled == null) x();"]) {
      expect(NAMES.some((n) => defines(s, n)), s).toBe(false);
    }
  });
});
