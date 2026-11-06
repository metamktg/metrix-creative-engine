import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// render.mjs hardening: watchdog, page health, authored-DOM parity, seek determinism, backend
// refusals and the HyperFrames-derived craft checks. The pure verdicts run without a browser;
// the rest drive the real renderer over a real Chrome or Edge against the fixture in
// fixtures/render/base, one broken thing per case.

const scripts = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/", import.meta.url));
const RENDER = path.join(scripts, "render.mjs");
const FIXTURE = fileURLToPath(new URL("./fixtures/render/base/", import.meta.url));
const FONT = fileURLToPath(new URL("./fixtures/fonts/Geist-Regular.ttf", import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Checks = Record<string, (...a: any[]) => any>;
const C = (await import(pathToFileURL(path.join(scripts, "render-checks.mjs")).href)) as Checks;
const { SETTLE_DEFAULT } = (await import(pathToFileURL(path.join(scripts, "timeline", "rules.mjs")).href)) as { SETTLE_DEFAULT: number };

// ------------------------------------------------------------ binaries ---
// The CI-missing-binary rule: a missing browser or ffmpeg is a failure, never a silent skip.
// Under CI it names the workflow step; locally it says how to fix the machine.
const browserProbe = spawnSync(process.execPath, [RENDER, "--mode", "browser"], { encoding: "utf8" });
const browser = browserProbe.status === 0;
const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
const missing = (what: string, local: string) =>
  process.env.CI ? `${what} missing under CI: .github/workflows/ci.yml must provide it` : `${what} not found: ${local}`;

describe("render.mjs has what it needs on this machine", () => {
  it("finds an installed Chrome or Edge", () => {
    expect(browser, missing("Chrome or Edge", "install Chrome or Edge, or set CHROME_PATH to its executable") + `\n${browserProbe.stderr}`).toBe(true);
  });
  it("finds ffmpeg on PATH", () => {
    expect(ffmpeg, missing("ffmpeg", "install ffmpeg (winget install Gyan.FFmpeg, apt install ffmpeg, brew install ffmpeg) and put it on PATH")).toBe(true);
  });
});

// ------------------------------------------------------- pure verdicts ---
describe("watchdog budgets", () => {
  it("defaults to the plan's budgets and the old in-page waits", () => {
    expect(C.parseTimeouts(undefined)).toEqual({ load: 30000, evaluate: 20000, capture: 10000, perFrame: 2000, seekFallback: 3000, readyVideo: 15000 });
  });
  it("overrides any key from JSON and rejects unknown keys or bad values", () => {
    expect(C.parseTimeouts('{"evaluate":1500}').evaluate).toBe(1500);
    expect(() => C.parseTimeouts('{"eval":1}')).toThrow(/unknown key "eval"/);
    expect(() => C.parseTimeouts('{"load":0}')).toThrow(/positive/);
    expect(() => C.parseTimeouts("[1]")).toThrow(/object/);
    expect(() => C.parseTimeouts("{nope")).toThrow(/not JSON/);
  });
});

describe("health verdict", () => {
  const ok = { broken_images: [], unloaded_fonts: [], videos: [{ src: "a.webm", readyState: 4, duration: 8 }], seek_fallbacks: 0, runtime: { current: true }, config: { settleDefault: SETTLE_DEFAULT } };
  it("passes a healthy page", () => expect(C.healthVerdict(ok)).toEqual({ verdict: "PASS", reasons: [] }));
  it("fails each condition that used to be a WARN or silent", () => {
    const fail = (patch: object) => C.healthVerdict({ ...ok, ...patch });
    expect(fail({ broken_images: ["x.png"] }).reasons).toEqual(["broken images: x.png"]);
    expect(fail({ unloaded_fonts: ["G 400 (error)"] }).verdict).toBe("FAIL");
    expect(fail({ videos: [{ src: "v.webm", readyState: 0, duration: "NaN" }] }).reasons[0]).toMatch(/video v.webm not ready/);
    expect(fail({ videos: [{ src: "v.webm", readyState: 1, duration: Number.NaN }] }).verdict).toBe("FAIL");
    expect(fail({ seek_fallbacks: 2 }).reasons[0]).toMatch(/2 clip seek\(s\) gave up/);
    expect(fail({ frame_mismatches: 1 }).reasons[0]).toMatch(/1 clip seek\(s\) presented a different source frame/);
    expect(fail({ runtime: { current: false, reason: "stale" } }).reasons).toEqual(["stale"]);
    expect(fail({ config: { settleDefault: 0.3 } }).reasons[0]).toMatch(/differs from timeline\/rules.mjs SETTLE_DEFAULT/);
  });
});

describe("authored-DOM parity", () => {
  const sb = JSON.parse(fs.readFileSync(path.join(FIXTURE, "storyboard.json"), "utf8"));
  const scene = { id: "s1", start: "0", end: "6" };
  const dom = (patch: Record<string, unknown> = {}, label: Record<string, unknown> = {}) => ({
    texts: [
      { id: "hook", text: "Hook line here", in: "0", out: "2.4", dur: null, enter: "none", exit: null, scene, ...patch },
      { id: "label", text: "See the second line", in: "2.4", out: "6", dur: null, enter: null, exit: null, scene, ...label },
    ],
    scenes: [scene],
  });
  const fields = (r: ReturnType<Checks["parity"]>) => r.findings.map((f: any) => `${f.verdict} ${f.id}.${f.field}`);

  it("passes the fixture as authored", () => expect(C.parity(dom(), sb)).toMatchObject({ verdict: "PASS", checked: { texts: 2, scenes: 1 }, findings: [] }));
  it("fails a hook data-out that drifted from the storyboard", () => {
    const r = C.parity(dom({ out: "1.6" }), sb);
    expect(fields(r)).toEqual(["FAIL hook.out"]);
    expect(r.findings[0].message).toBe("data-out 1.6 differs from storyboard out 2.4");
  });
  it("takes missing data-in/out from the scene, as runtime.js does", () => {
    expect(C.parity(dom({ in: null }), sb).verdict).toBe("PASS");
    expect(fields(C.parity(dom({}, { out: null, scene: { ...scene, end: "5" } }), sb))).toEqual(["FAIL label.out"]);
  });
  it("holds data-dur to the settle default when neither side gives one", () => {
    expect(C.parity(dom({}, { dur: String(SETTLE_DEFAULT) }), sb).verdict).toBe("PASS");
    expect(fields(C.parity(dom({}, { dur: "0.5" }), sb))).toEqual(["FAIL label.dur"]);
    expect(fields(C.parity(dom({}, { dur: "0.5" }), sb, { settleDefault: 0.5 }))).toEqual([]);
  });
  it("fails enter none on one side only, warns a different named motion", () => {
    expect(fields(C.parity(dom({ enter: "fade" }), sb))).toEqual(["FAIL hook.enter"]);
    const sb2 = structuredClone(sb);
    sb2.scenes[0].text[1].enter = "rise";
    expect(fields(C.parity(dom(), sb2))).toEqual(["WARN label.enter"]);
  });
  it("fails authored copy that differs, ignoring case and curly quotes", () => {
    expect(fields(C.parity(dom({ text: "Hook line THERE" }), sb))).toEqual(["FAIL hook.copy"]);
    expect(C.parity(dom({ text: "  hook LINE here " }), sb).verdict).toBe("PASS");
  });
  it("fails a missing or doubled element and a scene that moved; warns DOM-only copy", () => {
    const d = dom();
    expect(fields(C.parity({ ...d, texts: [d.texts[0]] }, sb))).toEqual(["FAIL label.element"]);
    expect(fields(C.parity({ ...d, texts: [...d.texts, d.texts[0]] }, sb))).toEqual(["FAIL hook.id"]);
    expect(fields(C.parity({ ...d, scenes: [{ id: "s1", start: "0.1", end: "6" }] }, sb))).toEqual(["FAIL s1.scene.start"]);
    const extra = C.parity({ ...d, texts: [...d.texts, { ...d.texts[0], id: "cap_x" }] }, sb);
    expect(extra.verdict).toBe("WARN");
    expect(fields(extra)).toEqual(["WARN cap_x.element"]);
  });
  it("allows the 3 dp rounding tolerance and no more", () => {
    expect(C.parity(dom({ out: "2.4014" }), sb).verdict).toBe("PASS");
    expect(C.parity(dom({ out: "2.4016" }), sb).verdict).toBe("FAIL");
  });
});

describe("craft checks (HyperFrames thresholds)", () => {
  const step = 1 / 30;
  const film = (duration: number, lines: { id: string; copy: string; source?: string; from: number; to: number; enterTo?: number }[], extra: (t: number) => object = () => ({})) => {
    const sb = { duration, scenes: [{ id: "s", start: 0, end: duration, text: lines.map((l) => ({ id: l.id, copy: l.copy, source: l.source ?? "framing", in: l.from, out: l.to })) }] };
    const samples = C.sampleTimes(duration, step).map((t: number, k: number) => ({
      t,
      sig: String(k), // always changing unless a case overrides it
      held: false,
      small: [] as object[],
      items: Object.fromEntries(lines.map((l) => {
        const on = t >= l.from && t < l.to;
        const own = !on ? 0 : t < (l.enterTo ?? l.from) ? 0.6 : 1;
        return [l.id, { vis: on, own, eff: own }];
      })),
      ...extra(t),
    }));
    return { sb, samples };
  };
  const codes = (r: ReturnType<Checks["craft"]>) => r.findings.map((f: any) => `${f.verdict} ${f.code}${"id" in f && f.id ? " " + f.id : ""}`);
  const run = (f: ReturnType<typeof film>) => C.craft(f.samples, { sb: f.sb, step, width: 1080, height: 1920 });

  it("uses HyperFrames' numbers", () => {
    expect(C.typeFloorPx(1080, 1920)).toBe(28);
    expect(C.typeFloorPx(1080, 1350)).toBe(28);
    expect(C.lineFloorSec(2, false)).toBe(0.4);
    expect(C.lineFloorSec(3, false)).toBeCloseTo(1.05, 10);
    expect(C.lineFloorSec(1, true)).toBe(2);
    expect(C.readingWords("Take a look at Northwind.")).toBe(5);
    expect(C.readingWords("--")).toBe(0);
  });
  it("FAILs when there is nothing to check, never PASSes it", () => {
    const r = C.craft([], { sb: { duration: 4, scenes: [] }, step, width: 1080, height: 1920 });
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toEqual(["FAIL not_run"]);
  });
  it("passes lines held long enough", () => {
    expect(run(film(8, [{ id: "a", copy: "one two three four", from: 0, to: 2 }, { id: "b", copy: "last line here", from: 2, to: 8 }])).verdict).toBe("PASS");
  });
  it("warns a line under the HyperFrames hold that MCE's floor allows", () => {
    // 3 words: MCE floor 0.8 s, HyperFrames 0.75 x (0.5 + 0.9) = 1.05 s; held 0.9 s
    const r = run(film(8, [{ id: "a", copy: "one two three", from: 1, to: 1.9 }, { id: "b", copy: "last line here", from: 2, to: 8 }]));
    expect(codes(r)).toEqual(["WARN line_unread a"]);
    expect(r.verdict).toBe("WARN");
  });
  it("fails a line that settles on screen under check-storyboard's read floor", () => {
    // 4 words: floorFor 1.2 s; settles 0.2 s late in a 1.3 s window, so 1.1 s settled
    const r = run(film(8, [{ id: "a", copy: "one two three four", from: 1, to: 2.3, enterTo: 1.2 }, { id: "b", copy: "last line here", from: 2.3, to: 8 }]));
    expect(codes(r)).toEqual(["FAIL line_unread a"]);
    expect(r.findings[0].message).toMatch(/under the 1.20 s read floor check-storyboard holds it to/);
  });
  it("holds the last line to 2 s, and voiced captions only to the MCE voiceover floor", () => {
    expect(codes(run(film(6, [{ id: "a", copy: "one two three four", from: 0, to: 4.5 }, { id: "end", copy: "a b c d", from: 4.5, to: 6 }])))).toEqual(["WARN line_unread end"]);
    // voiced, 4 words: voFloorFor 1.0 s; 1.1 s passes though HyperFrames would want 1.275 s
    expect(codes(run(film(8, [{ id: "c", copy: "one two three four", source: "voiceover", from: 1, to: 2.1 }, { id: "b", copy: "x y z", from: 2.1, to: 8 }])))).toEqual([]);
    expect(codes(run(film(8, [{ id: "c", copy: "one two three four", source: "voiceover", from: 1, to: 1.8 }, { id: "b", copy: "x y z", from: 1.8, to: 8 }])))).toEqual(["FAIL line_unread c"]);
  });
  it("warns a dead stretch over 3 s, not inside the end card or under data-hold", () => {
    const still = (from: number, to: number, held = false) => (t: number) => (t >= from && t < to ? { sig: "same", held } : {});
    const lines = [{ id: "b", copy: "last line here", from: 0, to: 10 }];
    const r = run(film(10, lines, still(0.5, 4.2)));
    expect(codes(r)).toEqual(["WARN dead_stretch"]);
    expect(r.findings[0]).toMatchObject({ at: 0.5 });
    expect(codes(run(film(10, lines, still(0.5, 3.4))))).toEqual([]); // 2.9 s
    expect(codes(run(film(10, lines, still(0.5, 4.2, true))))).toEqual([]);
    expect(codes(run(film(10, lines, still(6, 10))))).toEqual([]); // end card: the last 3 s
  });
  it("warns reading text under 2.6 % of the short side held 0.5 s or more", () => {
    const tiny = (from: number, to: number, text = "small print") => (t: number) => (t >= from && t < to ? { small: [{ key: 7, label: "span.fine", text, font_px: 20 }] } : {});
    const lines = [{ id: "b", copy: "last line here", from: 0, to: 8 }];
    const r = run(film(8, lines, tiny(1, 1.6)));
    expect(codes(r)).toEqual(["WARN type_floor"]);
    expect(r.findings[0]).toMatchObject({ font_px: 20, floor_px: 28, element: "span.fine" });
    expect(codes(run(film(8, lines, tiny(1, 1.4))))).toEqual([]);
    expect(codes(run(film(8, lines, tiny(1, 3, "--"))))).toEqual([]);
  });
});

describe("runtime.js cannot drift from the timing rules", () => {
  const runtime = fs.readFileSync(path.join(scripts, "runtime.js"), "utf8");
  const render = fs.readFileSync(RENDER, "utf8");
  it("the page's fallback settle default equals SETTLE_DEFAULT", () => {
    const m = runtime.match(/settleDefault:\s*([\d.]+)/);
    expect(m, "runtime.js CFG settleDefault literal not found").not.toBeNull();
    expect(Number(m![1])).toBe(SETTLE_DEFAULT);
    expect(runtime).toMatch(/num\(el, "data-dur", CFG\.settleDefault\)/);
    // applyText (the settle) must not carry its own literal; applyCount's 0.8 s count is a different thing
    const applyText = runtime.slice(runtime.indexOf("function applyText"), runtime.indexOf("function applyKen"));
    expect(applyText).not.toMatch(/"data-dur",\s*\d/);
  });
  it("render.mjs injects SETTLE_DEFAULT before the page's scripts run", () => {
    expect(render).toMatch(/addScriptToEvaluateOnNewDocument[\s\S]{0,200}settleDefault: SETTLE_DEFAULT/);
  });
});

// ------------------------------------------------------------- the CLI ---
type Run = { status: number | null; stdout: string; stderr: string; ms: number };
function run(args: string[], timeoutMs = 90000): Promise<Run> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [RENDER, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (status) => { clearTimeout(timer); resolve({ status, stdout, stderr, ms: Date.now() - t0 }); });
  });
}

describe("backends and arguments (no browser needed)", () => {
  it("points hyperframes to its own CLI route and refuses remotion, exit 2", async () => {
    const hf = await run(["--backend", "hyperframes"]);
    expect(hf.status).toBe(2);
    expect(hf.stderr).toMatch(/render\.mjs does not drive hyperframes: render a HyperFrames project with its own CLI/);
    const rm = await run(["--backend", "remotion"]);
    expect(rm.status).toBe(2);
    expect(rm.stderr).toMatch(/backend remotion is refused: no licence record/);
    const other = await run(["--backend", "puppeteer"]);
    expect(other.status).toBe(2);
    expect(other.stderr).toMatch(/unknown --backend puppeteer/);
  });
  it("rejects bad --timeouts with exit 2", async () => {
    const r = await run(["--timeouts", '{"evaluate":-1}']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/evaluate must be a positive number/);
  });
});

// ------------------------------------------------------- real browser ---
const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-health-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
let clip = "";
let clip30 = "";

type Edit = [string, string];
function makeCase(name: string, edits: Edit[] = [], sbPatch: (sb: any) => void = () => {}, clipFile = () => clip) {
  const dir = path.join(root, name);
  const comp = path.join(dir, "composition");
  fs.mkdirSync(path.join(comp, "fonts"), { recursive: true });
  let html = fs.readFileSync(path.join(FIXTURE, "index.html"), "utf8");
  for (const [from, to] of edits) {
    expect(html.includes(from), `fixture marker ${from}`).toBe(true);
    html = html.replace(from, to);
  }
  fs.writeFileSync(path.join(comp, "index.html"), html);
  fs.copyFileSync(path.join(FIXTURE, "logo.svg"), path.join(comp, "logo.svg"));
  fs.copyFileSync(FONT, path.join(comp, "fonts", "Geist-Regular.ttf"));
  fs.copyFileSync(clipFile(), path.join(comp, "clip.webm"));
  const sb = JSON.parse(fs.readFileSync(path.join(FIXTURE, "storyboard.json"), "utf8"));
  sbPatch(sb);
  fs.writeFileSync(path.join(dir, "storyboard.json"), JSON.stringify(sb, null, 2));
  return { dir, comp, sb: path.join(dir, "storyboard.json") };
}
const check = async (c: ReturnType<typeof makeCase>, ...extra: string[]) => {
  const r = await run([c.comp, "--storyboard", c.sb, "--mode", "check", ...extra]);
  let report: any = null;
  try { report = JSON.parse(r.stdout); } catch {}
  return { ...r, report };
};

// The decoded clip frame from a still: ten 32 px stripes in the top 80 rows, bit k at x 32k.
function decodedFrame(png: string): number {
  const raw = spawnSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "crop=320:1:0:40,format=gray", "-f", "rawvideo", "-"]).stdout as Buffer;
  expect(raw.length).toBe(320);
  let n = 0;
  for (let k = 0; k < 10; k++) if (raw[32 * k + 16] > 128) n |= 1 << k;
  return n;
}
// floor((t - data-start + data-offset) * 25) in exact decimal arithmetic (milliseconds).
const expectedFrame = (t: number) => Math.max(0, Math.floor((Math.round(t * 1000) - 500 + 300) * 25 / 1000));

const BROWSER_TIMEOUT = 90000;
describe.runIf(browser && ffmpeg)("render.mjs in a real browser", { concurrent: true }, () => {
  beforeAll(() => {
    const make = (file: string, fps: number) => {
      const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=gray:s=320x320:r=${fps}:d=8`,
        "-vf", "geq=lum='if(lt(Y,80),if(mod(floor(N/pow(2,floor(X/32))),2),235,16),128)':cb=128:cr=128",
        "-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuv420p", "-g", String(fps), file], { encoding: "utf8" });
      expect(made.status, made.stderr).toBe(0);
      return file;
    };
    clip = make(path.join(root, "clip.webm"), 25);
    // WebM keeps whole-millisecond timestamps: 30 fps frame 2 sits at 67 ms, not 66.67.
    clip30 = make(path.join(root, "clip30.webm"), 30);
  }, 60000);

  it("passes the healthy fixture: health, parity, layout and craft, with the injected settle default", async () => {
    const r = await check(makeCase("base"));
    expect(r.status, r.stderr).toBe(0);
    expect(r.report.verdict).toBe("PASS");
    expect(r.report.health).toMatchObject({ verdict: "PASS", seek_fallbacks: 0, runtime: { current: true }, config: { settleDefault: SETTLE_DEFAULT } });
    expect(r.report.health.videos).toEqual([{ src: "clip.webm", readyState: 4, duration: 8, error: null }]);
    expect(r.report.parity).toMatchObject({ verdict: "PASS", checked: { texts: 2, scenes: 1 } });
    expect(r.report.craft).toMatchObject({ verdict: "PASS", samples: 180, type_floor_px: 8 });
    expect(r.report.results.map((x: any) => x.verdict)).toEqual(["PASS", "PASS"]);
    expect(r.report.backend).toBe("mce-cdp");
  }, BROWSER_TIMEOUT);

  it("decodes floor(t_src x 25) for seeks out of order, across and on frame boundaries", async () => {
    const c = makeCase("seek");
    // t_src = t - 0.2. 0.6, 1.68, 2.2 and 3.12 put t_src exactly on a 25 fps boundary.
    const times = [3.124, 0.596, 1.684, 0.6, 0.604, 3.116, 0.1, 2.2, 1.676, 0.404, 1.68, 3.12];
    const r = await run([c.comp, "--storyboard", c.sb, "--mode", "stills", "--times", times.join(",")]);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.stills.map((s: any) => s.t)).toEqual(times);
    const got = out.stills.map((s: any) => decodedFrame(path.join(out.dir, s.file)));
    expect(got).toEqual(times.map(expectedFrame));
    // the runtime's reported currentTime maps to the same source frame
    expect(out.stills.map((s: any) => Math.floor(s.clips[0].currentTime * 25 + 1e-9))).toEqual(times.map(expectedFrame));
    expect(out.health.seek_fallbacks).toBe(0);
  }, BROWSER_TIMEOUT);

  it("shows source frame i at ad frame i for a 30 fps WebM at offset 0 (stills and a real render)", async () => {
    const at0: Edit = ['data-start="0.5" data-offset="0.3"', 'data-start="0" data-offset="0"'];
    const c = makeCase("seek30", [at0], () => {}, () => clip30);
    // Four passes over frames 0 to 14: a lagging capture is intermittent, so one pass can miss it.
    const times = Array.from({ length: 60 }, (_, i) => (i % 15) / 30);
    const r = await run([c.comp, "--storyboard", c.sb, "--mode", "stills", "--times", times.join(",")]);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.health.clips).toEqual([{ src: "clip.webm", fps: 30, mapping: "frame-centre" }]);
    expect(out.stills.map((s: any) => decodedFrame(path.join(out.dir, s.file)))).toEqual(times.map((_, i) => i % 15));
    // the render loop seeks i / fps through the same frameAt: every encoded frame is the next source frame
    const rc = makeCase("render30", [at0], (sb) => { sb.duration = 1; }, () => clip30);
    const ad = path.join(rc.dir, "ad.mp4");
    const rr = await run([rc.comp, "--storyboard", rc.sb, "--out", ad, "--no-loudnorm"]);
    expect(rr.status, rr.stderr).toBe(0);
    const raw = spawnSync("ffmpeg", ["-v", "error", "-i", ad, "-vf", "format=gray,crop=320:1:0:40", "-f", "rawvideo", "-"]).stdout as Buffer;
    const frames = Array.from({ length: raw.length / 320 }, (_, i) => {
      let n = 0;
      for (let k = 0; k < 10; k++) if (raw[320 * i + 32 * k + 16] > 128) n |= 1 << k;
      return n;
    });
    expect(frames).toEqual(Array.from({ length: 30 }, (_, i) => i));
  }, BROWSER_TIMEOUT);

  it("a clip hidden by a wrapper and shown again shows the frame its seek asked for, every time", async () => {
    // The stale picture is intermittent (about 1 in 8 here with every clip seeked and no turn-on
    // handling), so 30 alternations. This guards the turn-on handling as a whole: on this fixture
    // the re-present alone also covers a hidden clip being seeked again.
    const c = makeCase("turn-on", [
      ['<video class="clip" data-clip src="clip.webm" data-start="0.5" data-offset="0.3" muted preload="auto"></video>',
        '<div id="wrap"><video class="clip" data-clip src="clip.webm" data-start="1" data-offset="0" muted preload="auto"></video></div>'],
      ["<!--AFTER-RUNTIME-->", '<script>Motion.on((t) => { document.getElementById("wrap").style.visibility = t >= 1 ? "" : "hidden"; });</script>'],
    ]);
    const times = Array.from({ length: 60 }, (_, i) => (i % 2 ? 2.0 : 0.5));
    const r = await run([c.comp, "--storyboard", c.sb, "--mode", "stills", "--times", times.join(",")]);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    const shown = out.stills.filter((s: any) => s.t === 2).map((s: any) => decodedFrame(path.join(out.dir, s.file)));
    expect(shown).toEqual(Array(30).fill(25)); // floor((2.0 - 1) * 25)
    expect(out.health).toMatchObject({ seek_fallbacks: 0, frame_mismatches: 0 });
  }, BROWSER_TIMEOUT);

  it("frames differ where the hook is visible and where it is hidden", async () => {
    const c = makeCase("hook-frames");
    const r = await run([c.comp, "--storyboard", c.sb, "--mode", "stills", "--times", "2.0,2.45"]);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    const region = (f: string) => spawnSync("ffmpeg", ["-v", "error", "-i", path.join(out.dir, f), "-vf", "crop=272:34:24:190,format=gray", "-f", "rawvideo", "-"]).stdout as Buffer;
    const [shown, hidden] = out.stills.map((s: any) => region(s.file));
    expect(shown.equals(hidden)).toBe(false);
    expect(Math.max(...hidden)).toBeLessThan(140); // only the clip's mid grey where the hook was
    expect(Math.max(...shown)).toBeGreaterThan(200); // white type
  }, BROWSER_TIMEOUT);

  it("FAILs a broken image", async () => {
    const r = await check(makeCase("missing-image", [['src="logo.svg"', 'src="missing.png"']]));
    expect(r.status).toBe(1);
    expect(r.report.health.verdict).toBe("FAIL");
    expect(r.report.health.broken_images).toEqual(["missing.png"]);
  }, BROWSER_TIMEOUT);

  it("FAILs a video that never loads (readyState 0, NaN duration)", async () => {
    const r = await check(makeCase("nan-video", [['src="clip.webm"', 'src="nothing.webm"']]), "--timeouts", '{"readyVideo":3000}');
    expect(r.status).toBe(1);
    expect(r.report.health.verdict).toBe("FAIL");
    expect(r.report.health.videos[0]).toMatchObject({ src: "nothing.webm", readyState: 0, duration: "NaN" });
  }, BROWSER_TIMEOUT);

  it("FAILs a hook data-out that drifted from the storyboard, before any seek", async () => {
    const r = await check(makeCase("drift", [['data-in="0" data-out="2.4"', 'data-in="0" data-out="1.6"']]));
    expect(r.status).toBe(1);
    expect(r.report.parity.verdict).toBe("FAIL");
    expect(r.report.parity.findings).toEqual([expect.objectContaining({ id: "hook", field: "out", verdict: "FAIL", authored: 1.6, storyboard: 2.4 })]);
    // the layout pass alone sees nothing wrong: the hook is still up at its settled midpoint
    expect(r.report.results.map((x: any) => x.verdict)).toEqual(["PASS", "PASS"]);
    // and render refuses to start on it
    const c = makeCase("drift-render", [['data-in="0" data-out="2.4"', 'data-in="0" data-out="1.6"']]);
    const rr = await run([c.comp, "--storyboard", c.sb, "--out", path.join(c.dir, "ad.mp4")]);
    expect(rr.status).toBe(1);
    expect(rr.stderr).toMatch(/FAIL parity hook\.out/);
    expect(rr.stderr).toMatch(/refusing to render/);
    expect(fs.existsSync(path.join(c.dir, "ad.mp4"))).toBe(false);
  }, BROWSER_TIMEOUT);

  it("kills the browser tree and exits 3 when __seek never resolves", async () => {
    const c = makeCase("hang", [["<!--AFTER-RUNTIME-->", "<script>window.__seek = () => new Promise(() => {});</script>"]]);
    const r = await check(c, "--timeouts", '{"evaluate":1500}');
    expect(r.status, r.stderr).toBe(3);
    expect(r.stderr).toMatch(/TIMEOUT evaluate window\.__seek/);
    expect(r.ms).toBeLessThan(30000);
    const pid = Number(r.stderr.match(/browser pid (\d+)/)![1]);
    expect(() => process.kill(pid, 0), `browser ${pid} still alive`).toThrow();
  }, BROWSER_TIMEOUT);

  it("counts a clip seek that falls back instead of firing seeked, and FAILs it", async () => {
    const noSeek = "<script>Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { configurable: true, get() { return -1; }, set() {} });</script>";
    const r = await check(makeCase("seek-fallback", [["<!--AFTER-RUNTIME-->", noSeek]]), "--timeouts", '{"seekFallback":200}');
    expect(r.status).toBe(1);
    expect(r.report.health.verdict).toBe("FAIL");
    expect(r.report.health.seek_fallbacks).toBeGreaterThan(0);
    expect(r.report.health.reasons.join(" ")).toMatch(/gave up after the fallback wait/);
  }, BROWSER_TIMEOUT);

  it("FAILs a page that loads a stale runtime.js from elsewhere", async () => {
    const c = makeCase("stale-runtime", [['<script src="runtime.js"></script>', '<script src="old/runtime.js"></script>']]);
    fs.mkdirSync(path.join(c.comp, "old"));
    fs.writeFileSync(path.join(c.comp, "old", "runtime.js"), fs.readFileSync(path.join(scripts, "runtime.js"), "utf8") + "\n// an older copy\n");
    const r = await check(c);
    expect(r.status).toBe(1);
    expect(r.report.health.runtime).toMatchObject({ current: false });
    expect(r.report.health.reasons.join(" ")).toMatch(/differs from the skill's runtime.js/);
  }, BROWSER_TIMEOUT);

  it("says parity and craft were not run on an older runtime, and FAILs, instead of passing them", async () => {
    const c = makeCase("old-runtime", [['<script src="runtime.js"></script>', '<script src="old/runtime.js"></script>']]);
    fs.mkdirSync(path.join(c.comp, "old"));
    // the shape of a pre-hardening runtime: seek, ready and layout only
    fs.writeFileSync(path.join(c.comp, "old", "runtime.js"),
      "window.__seek = async () => {}; window.__ready = async () => ({ broken_images: [], unloaded_fonts: [] }); window.__layout = () => [];\n");
    const r = await check(c);
    expect(r.status).toBe(1);
    expect(r.report.parity.findings).toEqual([expect.objectContaining({ field: "runtime", verdict: "FAIL" })]);
    expect(r.report.craft).toMatchObject({ verdict: "FAIL", samples: 0 });
    expect(r.report.health.reasons.join(" ")).toMatch(/page settle default null differs/);
  }, BROWSER_TIMEOUT);

  it("WARNs (never FAILs) a dead stretch and small type; data-layout-ignore is skipped", async () => {
    const c = makeCase("craft", [
      ['<video class="clip" data-clip src="clip.webm" data-start="0.5" data-offset="0.3" muted preload="auto"></video>', ""],
      ["<!--EXTRA-->", '<span style="position:absolute;left:24px;top:100px;font-size:6px;color:#fff">small print here</span><span data-layout-ignore style="position:absolute;left:24px;top:120px;font-size:6px;color:#fff">texture text</span>'],
      ['data-in="0" data-out="2.4"', 'data-in="0" data-out="4.4"'],
      ['data-in="2.4" data-out="6"', 'data-in="4.4" data-out="8"'],
      ['data-end="6"', 'data-end="8"'],
    ], (sb) => {
      sb.duration = 8;
      sb.scenes[0].end = 8;
      sb.scenes[0].text[0].out = 4.4;
      Object.assign(sb.scenes[0].text[1], { in: 4.4, out: 8 });
    });
    const r = await check(c);
    expect(r.status, r.stderr).toBe(0);
    expect(r.report.verdict).toBe("PASS");
    expect(r.report.craft.verdict).toBe("WARN");
    const codes = r.report.craft.findings.map((f: any) => f.code).sort();
    expect(codes).toEqual(["dead_stretch", "type_floor"]);
    const dead = r.report.craft.findings.find((f: any) => f.code === "dead_stretch");
    expect(dead).toMatchObject({ at: 0 });
    expect(dead.seconds).toBeGreaterThan(3);
    const small = r.report.craft.findings.find((f: any) => f.code === "type_floor");
    expect(small.message).toMatch(/small print here/);
  }, BROWSER_TIMEOUT);
});
