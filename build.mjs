import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");

await rm(distDir, { recursive: true, force: true });

// Bundled, not just compiled: an MCP client launches `node <path>/dist/index.js`
// directly, often with no node_modules beside it, so every dependency has to be
// in the one file. The shebang lets it also run as ./dist/index.js.
await esbuild({
  entryPoints: [path.resolve(artifactDir, "src/index.ts")],
  outfile: path.resolve(distDir, "index.js"),
  platform: "node",
  target: "node22",
  format: "esm",
  bundle: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
