#!/usr/bin/env node
/*
 * Render an HTML composition to an ad video, frame by frame.
 *
 *   node render.mjs <composition-dir> --storyboard <storyboard.json> [--mode render|stills|check]
 *        [--out ad.mp4] [--draft] [--chrome <path>]
 *
 * Needs only Node 22+, ffmpeg on PATH, and an installed Chrome or Edge. It
 * drives the browser over the DevTools protocol with Node's built-in
 * WebSocket, so there is nothing to npm install.
 *
 * Modes
 *   render  frames -> H.264 MP4 with the storyboard's audio mix, poster baked as frame 0,
 *           poster also written as <out>.jpg
 *   stills  one PNG per scene at its settled midpoint and one per transition midpoint,
 *           plus contact.png (all stills tiled) to look at before a full render
 *   check   layout check of every data-text element at its settled midpoint:
 *           safe zone, overflow, minimum type size. Exit 1 on any FAIL.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { audioGraph } from "./audio-graph.mjs";
import { norm, settled } from "./timeline/rules.mjs";

const args = process.argv.slice(2);
const flag = (k, d) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i + 1];
};
const has = (k) => args.includes(k);
const compDir = path.resolve(args[0] || ".");
const sbPath = path.resolve(flag("--storyboard", path.join(compDir, "..", "storyboard.json")));
const mode = flag("--mode", "render");
const draft = has("--draft");
const sb = JSON.parse(fs.readFileSync(sbPath, "utf8"));
const sbDir = path.dirname(sbPath);
const { width: W, height: H } = sb.format;
const fps = draft ? Math.min(15, sb.format.fps || 30) : sb.format.fps || 30;
const duration = sb.duration;
const outPath = path.resolve(flag("--out", path.join(sbDir, `${sb.name || "ad"}.mp4`)));

function die(msg) {
  console.error(`render: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser ---
function findChrome() {
  const explicit = flag("--chrome", process.env.CHROME_PATH);
  const candidates = [
    explicit,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const hit = candidates.find((c) => fs.existsSync(c));
  if (!hit) die("no Chrome or Edge found. Pass --chrome <path> or set CHROME_PATH.");
  return hit;
}

async function launch() {
  // Profile and caches live beside the output, not on the system drive.
  const profile = path.join(sbDir, "work", `.chrome-${process.pid}`);
  fs.mkdirSync(profile, { recursive: true });
  const proc = spawn(
    findChrome(),
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--window-size=${W},${H}`,
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--disable-lcd-text", // greyscale antialiasing: no colour fringes on type
      "--mute-audio",
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const portFile = path.join(profile, "DevToolsActivePort");
  // Chrome writes this file while we poll for it; on Windows a read can land
  // mid-write (EBUSY) or see it empty. Retry until it holds a port number.
  let port = null;
  for (let i = 0; i < 300 && !port; i++) {
    try {
      const first = fs.readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (/^\d+$/.test(first)) port = first;
    } catch (e) {
      if (!["ENOENT", "EBUSY", "EPERM", "EACCES"].includes(e.code)) throw e;
    }
    if (!port) await new Promise((r) => setTimeout(r, 50));
  }
  if (!port) die("Chrome did not start (no readable DevToolsActivePort after 15s).");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      for (const w of waiters.splice(0)) w(msg) || waiters.push(w);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const once = (method) => new Promise((r) => waiters.push((m) => (m.method === method ? (r(m), true) : false)));
  // Chrome holds its profile until it has exited; delete only after that.
  const close = async () => {
    const exited = new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r)));
    // Browser.close shuts down every Chrome process; kill() alone leaves the
    // renderer and GPU children holding the profile on Windows.
    try { await Promise.race([send("Browser.close"), new Promise((r) => setTimeout(r, 2000))]); } catch {}
    try { ws.close(); } catch {}
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    if (proc.exitCode === null) proc.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
      // A renderer or GPU child can outlive the browser on Windows and keep
      // the profile locked: end the whole tree, then try once more.
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 800));
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); return; } catch {}
      console.error(`render: WARN could not remove ${profile}: ${e.code}`);
    }
  };
  return { send, once, close };
}

async function evaluate(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function openComposition() {
  // The composition always runs the skill's current runtime. A stale copy
  // left in the folder from an earlier run would silently change motion.
  fs.copyFileSync(new URL("./runtime.js", import.meta.url), path.join(compDir, "runtime.js"));
  const cdp = await launch();
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: pathToFileURL(path.join(compDir, "index.html")).href });
  await loaded;
  const hasRuntime = await evaluate(cdp, "typeof window.__seek === 'function'");
  if (!hasRuntime) die("composition does not load runtime.js (window.__seek missing).");
  const health = await evaluate(cdp, "window.__ready()");
  if (health.broken_images.length) console.error(`render: WARN broken images: ${health.broken_images.join(", ")}`);
  if (health.unloaded_fonts.length) console.error(`render: WARN fonts not loaded: ${health.unloaded_fonts.join(", ")}`);
  return { cdp, health };
}

async function frameAt(cdp, t, format = "jpeg") {
  await evaluate(cdp, `window.__seek(${t.toFixed(5)})`);
  const shot = await cdp.send("Page.captureScreenshot", {
    format,
    quality: format === "jpeg" ? 95 : undefined,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
  });
  return Buffer.from(shot.data, "base64");
}

// ------------------------------------------------------------ timing data ---
// settled(): the window a text item is fully entered and not yet leaving (timeline/rules.mjs).

function textItems() {
  return sb.scenes.flatMap((s) => (s.text || []).map((t) => ({ ...t, scene: s.id })));
}

// ------------------------------------------------------------------ audio ---
// The graph lives in audio-graph.mjs.

// Feeds play at roughly -14 LUFS. Measure the mix, apply the exact gain to
// reach the target, then limit peaks to about -1.5 dBFS. Video is copied, not
// re-encoded. A silent mix is left alone.
function measureLufs(file) {
  const r = spawnSync("ffmpeg", ["-v", "info", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+|-inf) LUFS/g)].at(-1);
  const p = [...r.stderr.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].at(-1);
  return { lufs: m && m[1] !== "-inf" ? parseFloat(m[1]) : null, peak: p && p[1] !== "-inf" ? parseFloat(p[1]) : null };
}
function normalizeLoudness(file, target) {
  const before = measureLufs(file);
  if (before.lufs === null || before.lufs < -60) return { target, before, after: before, note: "silent mix, not normalized" };
  // The limiter takes some level back on peaky mixes, so measure and correct
  // again, at most three passes in all.
  let now = before, total = 0, passes = 0;
  while (passes < 3 && Math.abs(target - now.lufs) >= 0.5) {
    const gain = target - now.lufs;
    const tmp = file.replace(/\.mp4$/, ".loud.mp4");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-map", "0:v", "-map", "0:a", "-c:v", "copy",
      "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=false`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart", tmp], { encoding: "utf8" });
    if (r.status !== 0) { console.error(`render: WARN loudness pass failed: ${r.stderr}`); return { target, before, after: now, error: true }; }
    fs.renameSync(tmp, file);
    total += gain; passes++;
    now = measureLufs(file);
  }
  if (Math.abs(target - now.lufs) >= 1) console.error(`render: WARN mix lands at ${now.lufs} LUFS, target ${target}; the mix is too peaky to raise further without audible limiting`);
  return { target, before, after: now, gain_db: +total.toFixed(2), passes };
}

// ----------------------------------------------------------------- modes ---
async function render() {
  const { cdp } = await openComposition();
  const total = Math.round(duration * fps);
  const posterAt = sb.poster_at ?? null;
  const { inputs, filter } = audioGraph(sb, sbDir, duration);
  const ff = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
      ...inputs,
      "-filter_complex", filter,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "libx264", "-preset", draft ? "veryfast" : "medium", "-crf", draft ? "26" : "18",
      // Screenshots arrive as full-range BT.601 JPEG. Convert to the limited-range
      // BT.709 that phones, browsers and Meta assume, and tag it, so colours match.
      "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-r", String(fps),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", String(duration), "-movflags", "+faststart",
      outPath,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once("drain", r)));
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    // Frame 0 is the poster: it is the thumbnail every feed and player shows.
    const t = i === 0 && posterAt !== null ? posterAt : i / fps;
    const buf = await frameAt(cdp, t);
    if (i === 0) fs.writeFileSync(outPath.replace(/\.mp4$/, ".jpg"), buf);
    await write(buf);
    if (i % fps === 0) process.stderr.write(`\rrender: ${i}/${total} frames`);
  }
  ff.stdin.end();
  const code = await new Promise((r) => ff.on("close", r));
  await cdp.close();
  if (code !== 0) die(`ffmpeg exited ${code}`);
  // A mix with no music bed and no voice is a few short effects. Raising that to
  // -14 LUFS integrated would make each click painfully loud, so it is left as
  // mixed (peaks are already limited) and reported as effects-only.
  const effectsOnly = !sb.audio?.music?.file && !sb.audio?.voiceover?.file;
  const loudness = has("--no-loudnorm")
    ? null
    : effectsOnly
      ? { note: "effects-only mix: not normalised", ...measureLufs(outPath) }
      : normalizeLoudness(outPath, sb.audio?.lufs ?? -14);
  // The thumbnail is the encoded frame 0, exactly what a feed shows before playback,
  // not the pre-encode screenshot.
  spawnSync("ffmpeg", ["-y", "-v", "error", "-i", outPath, "-frames:v", "1", "-q:v", "1", outPath.replace(/\.mp4$/, ".jpg")]);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", outPath], { encoding: "utf8" });
  console.error(`\rrender: ${total}/${total} frames in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify({ out: outPath, poster: outPath.replace(/\.mp4$/, ".jpg"), fps, frames: total, loudness, probe: JSON.parse(probe.stdout) }, null, 2));
}

async function stills() {
  const { cdp } = await openComposition();
  const dir = path.join(sbDir, "work", "stills");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const shots = [];
  sb.scenes.forEach((s, i) => {
    const items = (s.text || []).map(settled).filter((w) => w.to > w.from);
    // Latest "everything is in" moment that is still before the first exit.
    const allIn = items.length ? Math.max(...items.map((w) => w.from)) : (s.start + s.end) / 2;
    const firstOut = items.length ? Math.min(...items.map((w) => w.to)) : s.end;
    const t = allIn < firstOut ? (allIn + firstOut) / 2 : (s.start + s.end) / 2;
    shots.push({ name: `${String(shots.length + 1).padStart(2, "0")}-scene-${s.id}`, t });
    if (i < sb.scenes.length - 1) {
      shots.push({ name: `${String(shots.length + 1).padStart(2, "0")}-cut-${s.id}-${sb.scenes[i + 1].id}`, t: Math.max(0, s.end - 0.06) });
      shots.push({ name: `${String(shots.length + 1).padStart(2, "0")}-cut-${s.id}-${sb.scenes[i + 1].id}b`, t: s.end + 0.06 });
    }
  });
  if (sb.poster_at != null) shots.unshift({ name: "00-poster", t: sb.poster_at });
  for (const s of shots) fs.writeFileSync(path.join(dir, `${s.name}.png`), await frameAt(cdp, s.t, "png"));
  await cdp.close();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const cols = Math.min(4, files.length);
  const tw = 360, th = Math.round((360 * H) / W);
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, files.map((f) => `file '${path.join(dir, f).replace(/\\/g, "/")}'`).join("\n"));
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `scale=${tw}:${th},tile=${cols}x${Math.ceil(files.length / cols)}:padding=6:color=0x808080`,
    "-frames:v", "1", path.join(dir, "contact.png")]);
  console.log(JSON.stringify({ dir, stills: shots.map((s) => ({ file: `${s.name}.png`, t: +s.t.toFixed(3) })), contact: path.join(dir, "contact.png") }, null, 2));
}

async function check() {
  const { cdp, health } = await openComposition();
  const ratio = `${sb.format.ratio}`;
  // Meta overlays profile, caption and CTA rows on Stories and Reels.
  const zone = ratio === "9:16" ? { top: 0.14, bottom: 0.2, side: 0.06 } : { top: 0.05, bottom: 0.05, side: 0.05 };
  const minPx = Math.round(W * 0.03);
  const results = [];
  for (const item of textItems()) {
    const w = settled(item);
    if (!(w.to > w.from)) {
      results.push({ id: item.id, verdict: "FAIL", reason: "never settles (enter outlasts its window)" });
      continue;
    }
    const t = (w.from + w.to) / 2;
    await evaluate(cdp, `window.__seek(${t})`);
    const found = (await evaluate(cdp, `window.__layout(${t})`)).find((e) => e.id === item.id);
    if (!found) {
      results.push({ id: item.id, t, verdict: "FAIL", reason: "no visible data-text element with this id at its settled midpoint" });
      continue;
    }
    const b = found.box;
    const reasons = [];
    if (b.y < zone.top - 0.002) reasons.push(`top ${(b.y * 100).toFixed(1)}% inside the ${Math.round(zone.top * 100)}% overlay band`);
    if (b.y + b.h > 1 - zone.bottom + 0.002) reasons.push(`bottom ${((b.y + b.h) * 100).toFixed(1)}% inside the ${Math.round(zone.bottom * 100)}% overlay band`);
    if (b.x < zone.side - 0.002 || b.x + b.w > 1 - zone.side + 0.002) reasons.push("outside the side margin");
    if (found.overflow) reasons.push("text overflows its box");
    // The composition must show the storyboard's copy, which the storyboard
    // check has already matched to the brief. Case is left to CSS.
    if (norm(found.text) !== norm(item.copy)) reasons.push(`on screen "${String(found.text).trim()}" differs from storyboard "${item.copy}"`);
    if (found.font_px < minPx) reasons.push(`type ${found.font_px}px is under the ${minPx}px feed-legibility floor`);
    results.push({ id: item.id, t: +t.toFixed(3), verdict: reasons.length ? "FAIL" : "PASS", reasons, on_screen: found.text, storyboard: item.copy, box: b, font_px: found.font_px });
  }
  await cdp.close();
  const fails = results.filter((r) => r.verdict === "FAIL").length;
  console.log(JSON.stringify({ safe_zone: zone, min_font_px: minPx, health, results, verdict: fails ? "FAIL" : "PASS" }, null, 2));
  process.exit(fails ? 1 : 0);
}

// Debug: seek to --t and evaluate --expr in the page, print the value.
async function evalMode() {
  const { cdp } = await openComposition();
  await evaluate(cdp, `window.__seek(${parseFloat(flag("--t", "0"))})`);
  console.log(JSON.stringify(await evaluate(cdp, flag("--expr", "window.__layout(0)")), null, 2));
  await cdp.close();
}

const run = { render, stills, check, eval: evalMode }[mode];
if (!run) die(`unknown --mode ${mode}`);
run().catch((e) => die(e.stack || e.message));
