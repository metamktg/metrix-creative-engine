import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { build as esbuild } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(root, "server");
const bundlePath = path.resolve(serverDir, "index.js");
const noticesPath = path.resolve(serverDir, "THIRD_PARTY_NOTICES.md");
const check = process.argv.includes("--check");

// The bundle is committed, not built on install. A Claude Code plugin install
// copies the repository and runs nothing, an MCP client launches
// `node <path>/server/index.js` directly, and neither has node_modules beside
// it, so every dependency has to be inside the one file and that file has to be
// in git. `--check` is what keeps the committed file equal to src/: verify runs
// it and fails when server/ is stale. The shebang lets it also run as
// ./server/index.js.
const result = await esbuild({
  absWorkingDir: root,
  entryPoints: ["src/index.ts"],
  outfile: bundlePath,
  platform: "node",
  target: "node22",
  format: "esm",
  bundle: true,
  // No source map: it would double the committed size and change on every
  // edit, and a stack trace from a single unminified file is already readable.
  sourcemap: false,
  write: false,
  metafile: true,
  // Resources and prompts serve markdown that lives in the repository. The
  // bundle is launched with an arbitrary working directory and usually no
  // repository beside it, so reading these at runtime would find nothing.
  // Inlined here instead.
  loader: { ".md": "text" },
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});

const bundle = result.outputFiles.find((file) => path.resolve(file.path) === bundlePath);
if (!bundle) throw new Error(`esbuild produced no ${bundlePath}`);
const notices = await thirdPartyNotices(result.metafile);

if (check) {
  const stale = [];
  for (const [file, expected] of [[bundlePath, Buffer.from(bundle.contents)], [noticesPath, Buffer.from(notices)]]) {
    const actual = await readFile(file).catch(() => null);
    if (!actual || !actual.equals(expected)) stale.push(path.relative(root, file).replaceAll("\\", "/"));
  }
  if (stale.length) {
    console.error(`server/ is stale: ${stale.join(", ")} ${stale.length === 1 ? "differs" : "differ"} from a fresh build of src/.`);
    console.error("Run `pnpm run build` and commit server/. Install with pnpm (the packageManager), since another package manager lays node_modules out differently and changes the bundle's path comments.");
    process.exit(1);
  }
  console.log(`server/ matches a fresh build of src/ (${bundle.contents.length} bytes).`);
} else {
  await mkdir(serverDir, { recursive: true });
  await writeFile(bundlePath, bundle.contents);
  await writeFile(noticesPath, notices);
  console.log(`wrote server/index.js (${bundle.contents.length} bytes) and server/THIRD_PARTY_NOTICES.md`);
}

/**
 * The bundle carries other people's code, so it ships their licence texts.
 * Derived from esbuild's own record of what went into the file, so a new
 * dependency cannot reach the bundle without its notice.
 */
async function thirdPartyNotices(metafile) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const parts = input.split("/");
    const at = parts.lastIndexOf("node_modules");
    if (at < 0) continue;
    const width = parts[at + 1]?.startsWith("@") ? 2 : 1;
    dirs.add(parts.slice(0, at + 1 + width).join("/"));
  }

  const packages = [];
  for (const dir of dirs) {
    const abs = path.resolve(root, dir);
    const manifest = JSON.parse(await readFile(path.join(abs, "package.json"), "utf8"));
    const names = await readdir(abs);
    const licenceFile = names.filter((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name)).sort()[0];
    const text = licenceFile
      ? (await readFile(path.join(abs, licenceFile), "utf8")).replace(/\r\n?/g, "\n").trim()
      : `No licence file ships with this package; its package.json declares ${manifest.license ?? "no licence"}.`;
    packages.push({ name: manifest.name, version: manifest.version, license: manifest.license ?? "–", text });
  }
  packages.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const sections = packages.map((p) => `## ${p.name} ${p.version} · ${p.license}\n\n\`\`\`text\n${p.text}\n\`\`\``);
  return [
    "# Third-party notices",
    "",
    "`server/index.js` is a single-file bundle of this repository's `src/` and the",
    "packages below. `build.mjs` writes this file from the bundle's own input list;",
    "do not edit it by hand.",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}
