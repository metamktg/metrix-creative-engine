#!/usr/bin/env node
/*
 * Check a finished ad file. ffmpeg only.
 *
 *   node qa-video.mjs <ad.mp4> [--poster ad.jpg] [--ratio 4:5] [--duration 12] [--lufs -14] [--silent | --effects-only]
 *
 * Checks, each PASS or FAIL:
 *   format      width x height matches --ratio; duration within 0.1s of --duration
 *   audio       an audio stream exists (some upload paths reject files without one)
 *   loudness    within 1 LU of --lufs; --silent: below -60 LUFS; --effects-only (no music bed):
 *               at or under -16 LUFS with peaks at or under -1 dBFS
 *   poster      --poster matches frame 0 (SSIM >= 0.98): the thumbnail is the first frame
 *   colour      tagged limited-range BT.709, what phones and Meta assume
 *   transitions no double exposure: no frame is a mid blend of two different shots
 *
 * The transition check samples at 15 fps. For each frame f it takes the shots
 * 0.4s either side (A, B) and fits f ~ a*A + b*B + c. Two different pictures
 * blended with both weights between 0.2 and 0.8 is a double exposure. A fade of
 * one picture (B predicted from A by gain and offset alone) and a dip through a
 * flat colour do not fit, so they are not counted.
 */
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const v = argv[0];
const results = [];
const add = (check, ok, detail) => results.push({ check, verdict: ok ? "PASS" : "FAIL", detail });

const pj = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,pix_fmt,color_range,color_space", "-of", "json", v], { encoding: "utf8" }).stdout);
const vs = pj.streams.find((s) => s.codec_type === "video");
const dur = +pj.format.duration;

const ratio = flag("--ratio");
if (ratio) {
  const [a, b] = ratio.split(":").map(Number);
  add("format.ratio", Math.abs(vs.width / vs.height - a / b) < 0.003, `${vs.width}x${vs.height}, wanted ${ratio}`);
}
const want = flag("--duration");
if (want) add("format.duration", Math.abs(dur - +want) <= 0.1, `${dur.toFixed(3)}s, wanted ${want}s`);
add("audio", pj.streams.some((s) => s.codec_type === "audio"), "audio stream present");

const er = spawnSync("ffmpeg", ["-v", "info", "-nostats", "-i", v, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const I = parseFloat(([...er.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1) || [])[1]);
const P = parseFloat(([...er.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1) || [])[1]);
if (argv.includes("--silent")) add("loudness", !(I > -60), `${I} LUFS, silent mix expected`);
else if (argv.includes("--effects-only")) add("loudness", I <= -16 && !(P > -1), `${I} LUFS, peak ${P} dBFS; effects-only mix must sit at or under -16 LUFS with peaks at or under -1 dBFS`);
else { const t = +flag("--lufs", "-14"); add("loudness", Math.abs(I - t) <= 1, `${I} LUFS, target ${t} +/- 1`); }

const poster = flag("--poster");
if (poster) {
  // Through rgb24 first, so a full-range JPEG and a limited-range video are
  // compared on the same scale (straight to gray skips the range conversion).
  const s = spawnSync("ffmpeg", ["-i", v, "-i", poster, "-lavfi", `[0:v]select=eq(n\\,0),format=rgb24,format=gray[a];[1:v]scale=${vs.width}:${vs.height},format=rgb24,format=gray[b];[a][b]ssim`, "-frames:v", "1", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/All:([\d.]+)/);
  const ss = s ? +s[1] : 0;
  add("poster", ss >= 0.98, `poster vs frame 0 SSIM ${ss.toFixed(4)}`);
}
add("colour", vs.color_range === "tv" && vs.color_space === "bt709", `${vs.pix_fmt}, range ${vs.color_range}, matrix ${vs.color_space}`);

// ---- transitions
const FPS = 15, W = 48, H = Math.round((W * vs.height) / vs.width / 2) * 2, N = W * H;
const raw = spawnSync("ffmpeg", ["-v", "error", "-i", v, "-vf", `fps=${FPS},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 }).stdout;
const n = Math.floor(raw.length / N);
const fr = (i) => raw.subarray(i * N, (i + 1) * N);
// Every measure works on any slice of a frame, so the same test runs on the
// whole frame and on horizontal bands. A band catches the common case where
// the product shots crossfade while the type dips separately: the whole frame
// is then not a clean blend, but the product band is.
const rms = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s / a.length); };
const mean = (a) => { let m = 0; for (let k = 0; k < a.length; k++) m += a[k]; return m / a.length; };
const std = (a) => { const m = mean(a); let s = 0; for (let k = 0; k < a.length; k++) s += (a[k] - m) ** 2; return Math.sqrt(s / a.length); };
const corr = (a, b) => {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let k = 0; k < a.length; k++) { const x = a[k] - ma, y = b[k] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 1;
};
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
function fit(f, A, B) {
  const L = f.length;
  let saa = 0, sbb = 0, sab = 0, sa = 0, sb = 0, sfa = 0, sfb = 0, sf = 0;
  for (let k = 0; k < L; k++) { const a = A[k], b = B[k], y = f[k]; saa += a * a; sbb += b * b; sab += a * b; sa += a; sb += b; sfa += y * a; sfb += y * b; sf += y; }
  const M = [[saa, sab, sa], [sab, sbb, sb], [sa, sb, L]], r = [sfa, sfb, sf], D = det3(M);
  if (Math.abs(D) < 1e-6) return null;
  const [a, b] = [0, 1].map((j) => det3(M.map((row, i) => row.map((x, k) => (k === j ? r[i] : x)))) / D);
  const c = det3(M.map((row, i) => row.map((x, k) => (k === 2 ? r[i] : x)))) / D;
  let res = 0;
  for (let k = 0; k < L; k++) res += (f[k] - (a * A[k] + b * B[k] + c)) ** 2;
  return { a, b, res: Math.sqrt(res / L) };
}
function blended(f, A, B, band = false) {
  // One picture held or pushed in: A and B barely differ, relative to contrast.
  if (rms(A, B) < Math.max(6, 0.45 * Math.min(std(A), std(B)))) return false;
  // Inside a band a pan or push-in also looks like a blend of the frames either
  // side of it. A camera move keeps the band's picture correlated with itself;
  // a dissolve between two different screens does not. So a band must show two
  // clearly different pictures before it can count.
  // A band where either shot is empty (flat ground) cannot hold two pictures.
  if (band && Math.min(std(A), std(B)) < 8) return false;
  if (band && (corr(A, B) > 0.45 || rms(A, B) < Math.max(12, 0.7 * Math.min(std(A), std(B))))) return false;
  // One picture fading: B is predicted from A by gain and offset alone.
  const r = corr(A, B), sb = std(B);
  if (sb * Math.sqrt(Math.max(0, 1 - r * r)) < 0.2 * sb + 2) return false;
  const p = fit(f, A, B);
  if (!p || p.a < 0.2 || p.b < 0.2 || p.a > 0.8 || p.b > 0.8 || p.a + p.b < 0.7 || p.a + p.b > 1.3) return false;
  if (!(p.res < 0.35 * Math.min(rms(f, A), rms(f, B)) && p.res < 0.25 * std(f) + 4)) return false;
  // A frame mid-dip is one picture at reduced strength: it fits A alone, or B
  // alone, with gain and offset almost perfectly. A double exposure needs both.
  const single = (X) => std(f) * Math.sqrt(Math.max(0, 1 - corr(f, X) ** 2));
  return p.res < 0.6 * Math.min(single(A), single(B));
}
// Regions: the whole frame, then bands a third of the height, overlapping by half.
const regions = [[0, H]];
const bh = Math.max(4, Math.round(H / 3)), step = Math.max(2, Math.round(bh / 2));
for (let r0 = 0; r0 + bh <= H; r0 += step) regions.push([r0, r0 + bh]);
const cut = (a, [r0, r1]) => a.subarray(r0 * W, r1 * W);
const OFF = Math.round(0.4 * FPS), hits = [];
for (let i = OFF; i < n - OFF; i++) {
  const f = fr(i), A = fr(i - OFF), B = fr(i + OFF);
  if (regions.some((g, j) => blended(cut(f, g), cut(A, g), cut(B, g), j > 0))) hits.push(i / FPS);
}
const events = [];
for (const t of hits) { const e = events.at(-1); if (e && t - e[1] <= 2 / FPS + 1e-6) e[1] = t; else events.push([t, t]); }
add("transitions", !events.length, events.length ? `double exposure at ${events.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}s`).join(", ")}; dip through the background instead` : "no double exposures");

const fails = results.filter((r) => r.verdict === "FAIL").length;
console.log(JSON.stringify({ file: v, verdict: fails ? "FAIL" : "PASS", results }, null, 2));
process.exit(fails ? 1 : 0);
