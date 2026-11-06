import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  guardYtDlpArgv, loadManifest, resolveRoots, validateManifest, ytDlpArgv,
  // @ts-expect-error plain ESM helper without type declarations
} from "../../scripts/tools-check.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const cli = path.join(repo, "scripts", "tools-check.mjs");
const manifestPath = path.join(repo, "tools", "manifest.json");
const base = process.env.MCE_TEST_TMP || os.tmpdir();
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

type Tool = { id: string; status: string; check: string; files: { root: string; path: string; sha256?: string | null; bytes?: number | null; role: string }[]; [k: string]: unknown };
const realManifest = () => JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { tools: Tool[]; roots: Record<string, { env: string; default: string }>; [k: string]: unknown };

// Env with every manifest root var removed, so the host's settings never leak in.
function cleanEnv(extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const k of ["MCE_TOOLS_DIR", "MCE_MODELS_DIR", "MCE_CACHE_DIR", "MCE_VENV_DIR", "MCE_TOOLS_CONFIG"]) delete env[k];
  return { ...env, ...extra };
}

/** A fake install: two roots in a tmp dir, a binary, a model, an optional archive and a skipped tool. */
function fakeInstall() {
  const root = fs.mkdtempSync(path.join(base, "tools-check-"));
  dirs.push(root);
  const put = (rel: string, body: Buffer | string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
  const bin = Buffer.from("MZ fake yt-dlp binary \x00\x01\x02 payload");
  const model = Buffer.from("ggml fake model weights");
  const zip = Buffer.from("PK fake archive");
  const binPath = put("t/yt-dlp/yt-dlp.exe", bin);
  const modelPath = put("m/ggml-base.en.bin", model);
  const zipPath = put("t/yt-dlp/dl/yt-dlp.zip", zip);
  fs.mkdirSync(path.join(root, "m", "punkt", "english"), { recursive: true });
  const manifest = {
    schema: "mce.tools/1",
    roots: { tools: { env: "MCE_TOOLS_DIR", default: path.join(root, "t") }, models: { env: "MCE_MODELS_DIR", default: path.join(root, "m") } },
    tools: [
      { id: "yt-dlp", version: "1", status: "installed", source_url: "u", licence: "Unlicense", licence_checked: true, check: "sha256",
        files: [
          { root: "tools", path: "yt-dlp/yt-dlp.exe", role: "published", sha256: sha(bin), bytes: bin.length },
          { root: "tools", path: "yt-dlp/dl/yt-dlp.zip", role: "archive", sha256: sha(zip), bytes: zip.length },
        ] },
      { id: "ggml-base.en", version: "1", status: "installed", source_url: "u", licence: "MIT", licence_checked: true, check: "sha256",
        files: [{ root: "models", path: "ggml-base.en.bin", role: "published", sha256: sha(model), bytes: model.length }] },
      { id: "punkt", version: "1", status: "installed", source_url: "u", licence: "Apache-2.0", licence_checked: false, check: "presence",
        files: [{ root: "models", path: "punkt/english", role: "binary", kind: "dir", sha256: null, bytes: null }] },
      { id: "remotion", version: "-", status: "not supported", reason: "no licence decision", source_url: "-", licence: "x", licence_checked: false, check: "skip", files: [] },
    ],
  };
  const mPath = put("manifest.json", JSON.stringify(manifest, null, 2));
  const run = (args: string[] = [], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [cli, "--manifest", mPath, ...args], { encoding: "utf8", env: cleanEnv(env) });
  const rewrite = (fn: (m: typeof manifest) => void) => { fn(manifest); fs.writeFileSync(mPath, JSON.stringify(manifest)); };
  return { root, put, run, rewrite, bin, binPath, modelPath, zipPath, manifest };
}

describe("tools/manifest.json", () => {
  it("validates as mce.tools/1 and names no C: path anywhere", () => {
    const m = loadManifest(manifestPath);
    expect(m.schema).toBe("mce.tools/1");
    expect(fs.readFileSync(manifestPath, "utf8")).not.toMatch(/\bC:[\\/]/i);
    for (const t of m.tools as Tool[]) for (const f of t.files) expect(path.isAbsolute(f.path)).toBe(false);
  });

  it("records Remotion as not supported with its licence flag off, and HyperFrames as installed with scripts disabled and CLI not permitted", () => {
    const m = realManifest();
    const remotion = m.tools.find((t) => t.id === "remotion")!;
    expect(remotion).toMatchObject({ status: "not supported", reason: "no licence decision", check: "skip", licence_checked: false, licence_flag: { env: "MCE_REMOTION", default: "off" } });
    const hf = m.tools.find((t) => t.id === "hyperframes")!;
    expect(hf).toMatchObject({ status: "installed", version: "0.8.186", scripts_disabled: true, cli_permitted: false, licence: "Apache-2.0", check: "sha256" });
    expect(m.tools.find((t) => t.id === "gsap")!.licence).toMatch(/GreenSock/);
  });

  it("carries version, source, licence and a sha256 for every hashed file", () => {
    for (const t of realManifest().tools) {
      expect(t.version, t.id).toBeTruthy();
      expect(t.source_url, t.id).toBeTruthy();
      expect(t.licence, t.id).toBeTruthy();
      if (t.check === "sha256") for (const f of t.files) expect(f.sha256, `${t.id} ${f.path}`).toMatch(/^[0-9a-f]{64}$/);
    }
    const base = realManifest().tools.find((t) => t.id === "ggml-base.en")!;
    expect(base.files[0].sha256).toBe("a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002");
  });

  it("says tools:check is outside npm run verify, and package.json agrees", () => {
    expect(String(realManifest().verify_note)).toMatch(/NOT part of npm run verify/);
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
    expect(pkg.scripts["tools:check"]).toBe("node ./scripts/tools-check.mjs");
    expect(pkg.scripts.verify).not.toContain("tools:check");
    expect(pkg.scripts.verify).not.toContain("tools-check.mjs");
  });

  it("pins the repo tools/yt-dlp.conf byte for byte, and it disables self-update", () => {
    const conf = fs.readFileSync(path.join(repo, "tools", "yt-dlp.conf"));
    const entry = realManifest().tools.find((t) => t.id === "yt-dlp.conf")!.files[0];
    expect(sha(conf)).toBe(entry.sha256);
    expect(conf.length).toBe(entry.bytes);
    expect(conf.toString("utf8").split("\n")).toContain("--no-update");
  });
});

describe("tools-check CLI on a fake install", () => {
  it("passes when every pinned file matches", () => {
    const f = fakeInstall();
    const r = f.run();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/PASS\s+yt-dlp tools\/yt-dlp\/yt-dlp\.exe/);
    expect(r.stdout).toMatch(/PRESENT\s+punkt/);
    expect(r.stdout).toMatch(/SKIP\s+remotion · not supported: no licence decision/);
  });

  it("tamper control: one flipped byte is exit 1 'sha256 mismatch', restoring it is exit 0", () => {
    const f = fakeInstall();
    const original = fs.readFileSync(f.binPath);
    const tampered = Buffer.from(original);
    tampered[5] ^= 0x01;
    fs.writeFileSync(f.binPath, tampered);
    const bad = f.run();
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/MISMATCH\s+yt-dlp tools\/yt-dlp\/yt-dlp\.exe · sha256 mismatch/);
    fs.writeFileSync(f.binPath, original);
    expect(f.run().status).toBe(0);
  });

  it("a size change is a mismatch (exit 1) without hashing", () => {
    const f = fakeInstall();
    fs.appendFileSync(f.modelPath, "x");
    const r = f.run();
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/size mismatch/);
  });

  it("a missing required file is exit 2; a missing optional archive is only a warning", () => {
    const f = fakeInstall();
    fs.rmSync(f.zipPath);
    const warn = f.run();
    expect(warn.status).toBe(0);
    expect(warn.stdout).toMatch(/WARN_MISSING\s+yt-dlp tools\/yt-dlp\/dl\/yt-dlp\.zip/);
    fs.rmSync(f.modelPath);
    const missing = f.run();
    expect(missing.status).toBe(2);
    expect(missing.stdout).toMatch(/MISSING\s+ggml-base\.en models\/ggml-base\.en\.bin · not found/);
  });

  it("a mismatch wins over a missing file (exit 1)", () => {
    const f = fakeInstall();
    fs.rmSync(f.modelPath);
    fs.writeFileSync(f.binPath, Buffer.alloc(f.bin.length));
    expect(f.run().status).toBe(1);
  });

  it("a missing presence-only directory is exit 2", () => {
    const f = fakeInstall();
    fs.rmSync(path.join(f.root, "m", "punkt"), { recursive: true });
    const r = f.run();
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/MISSING\s+punkt/);
  });

  it("an archive that is present but tampered is still exit 1", () => {
    const f = fakeInstall();
    fs.writeFileSync(f.zipPath, "PK fake archivX");
    expect(f.run().status).toBe(1);
  });

  it("--id narrows the check; an unknown id is exit 3", () => {
    const f = fakeInstall();
    fs.rmSync(f.modelPath);
    expect(f.run(["--id", "yt-dlp"]).status).toBe(0);
    expect(f.run(["--id", "ggml-base.en"]).status).toBe(2);
    const unknown = f.run(["--id", "nope"]);
    expect(unknown.status).toBe(3);
    expect(unknown.stderr).toContain("unknown tool id: nope");
  });

  it("--json reports roots, results and the exit code", () => {
    const f = fakeInstall();
    const r = f.run(["--json"]);
    const j = JSON.parse(r.stdout);
    expect(j.schema).toBe("mce.tools-check/1");
    expect(j.exitCode).toBe(0);
    expect(j.roots.tools.source).toBe("manifest default");
    expect(j.results.filter((x: { status: string }) => x.status === "PASS")).toHaveLength(3);
  });

  it("roots resolve env first, then --config, then the manifest default", () => {
    const f = fakeInstall();
    const moved = path.join(f.root, "moved-models");
    fs.cpSync(path.join(f.root, "m"), moved, { recursive: true });
    fs.rmSync(path.join(f.root, "m"), { recursive: true });
    expect(f.run().status).toBe(2);
    const cfg = f.put("local.json", JSON.stringify({ roots: { models: moved } }));
    const viaConfig = f.run(["--config", cfg, "--json"]);
    expect(viaConfig.status).toBe(0);
    expect(JSON.parse(viaConfig.stdout).roots.models.source).toBe("config");
    expect(f.run([], { MCE_TOOLS_CONFIG: cfg }).status).toBe(0);
    const viaEnv = f.run(["--config", cfg, "--json"], { MCE_MODELS_DIR: path.join(f.root, "nowhere") });
    expect(viaEnv.status).toBe(2);
    expect(JSON.parse(viaEnv.stdout).roots.models.source).toBe("env MCE_MODELS_DIR");
    expect(f.run([], { MCE_MODELS_DIR: moved }).status).toBe(0);
  });

  it("an unreadable config or an unknown flag is exit 3", () => {
    const f = fakeInstall();
    expect(f.run(["--config", path.join(f.root, "absent.json")]).status).toBe(3);
    expect(f.run(["--download"]).status).toBe(3);
  });
});

describe("manifest validation", () => {
  const good = () => JSON.parse(JSON.stringify(fakeInstall().manifest));
  const reject = (mutate: (m: ReturnType<typeof good>) => void, msg: RegExp) => {
    const m = good();
    mutate(m);
    expect(() => validateManifest(m)).toThrow(msg);
  };

  it("accepts the fake manifest", () => { expect(validateManifest(good()).schema).toBe("mce.tools/1"); });
  it("refuses absolute, drive-letter and escaping file paths", () => {
    reject((m) => { m.tools[0].files[0].path = path.join(os.tmpdir(), "x.exe"); }, /relative to its root/);
    reject((m) => { m.tools[0].files[0].path = "C:/Users/x.exe"; }, /relative to its root/);
    reject((m) => { m.tools[0].files[0].path = "../outside.exe"; }, /relative to its root/);
  });
  it("refuses a C: root default", () => { reject((m) => { m.roots.tools.default = "C:/Metrix/tools"; }, /C: is not allowed/); });
  it("refuses a bad sha256, an unknown root, a duplicate id and a wrong schema", () => {
    reject((m) => { m.tools[0].files[0].sha256 = "ABC"; }, /sha256 must be 64/);
    reject((m) => { m.tools[0].files[0].root = "elsewhere"; }, /unknown root/);
    reject((m) => { m.tools.push({ ...m.tools[0] }); }, /duplicate tool id yt-dlp/);
    reject((m) => { m.schema = "mce.tools/2"; }, /schema must be mce.tools\/1/);
  });
  it("refuses Remotion moving off 'not supported'", () => { reject((m) => { m.tools[3].status = "installed"; }, /remotion must stay/); });
  it("an invalid manifest on disk is exit 3 from the CLI", () => {
    const f = fakeInstall();
    f.rewrite((m) => { m.tools[0].files[0].path = "../x"; });
    const r = f.run();
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/path must be relative/);
  });
});

describe("resolveRoots", () => {
  it("uses the manifest default when neither env nor config names a root", () => {
    const m = realManifest();
    const r = resolveRoots(m, { env: {}, config: null });
    expect(r.tools.source).toBe("manifest default");
    expect(r.tools.dir).toBe(path.resolve("X:/Metrix/tools"));
  });
});

describe("yt-dlp argv guard", () => {
  it.each([
    ["-U"], ["--update"], ["--update-to"], ["--update-to=nightly"], ["--update-t"], ["--upd"],
    ["--remote-components"], ["--remote-components=ejs:github"], ["--remote-comp"],
    ["--config-locations"], ["--config-location"], ["--config"], ["-vU"], ["-Uv"],
  ])("refuses %s", (arg) => {
    expect(guardYtDlpArgv(["--skip-download", arg, "https://example.test/v"])).toEqual([arg]);
    expect(() => ytDlpArgv([arg], "conf")).toThrow(/yt-dlp argv refused/);
  });

  it.each([["--no-update"], ["--no-remote-components"], ["-v"], ["-f"], ["--username"], ["--write-info-json"], ["-o"]])("allows %s", (arg) => {
    expect(guardYtDlpArgv([arg])).toEqual([]);
  });

  it("does not inspect URLs after --", () => {
    expect(guardYtDlpArgv(["--skip-download", "--", "-U"])).toEqual([]);
  });

  it("prefixes the pinned config, --no-update and --no-remote-components", () => {
    expect(ytDlpArgv(["--skip-download", "https://example.test/v"], "X:/c/yt-dlp.conf")).toEqual([
      "--ignore-config", "--config-locations", "X:/c/yt-dlp.conf", "--no-update", "--no-remote-components", "--skip-download", "https://example.test/v",
    ]);
    expect(() => ytDlpArgv([], "")).toThrow(/confPath is required/);
  });
});
