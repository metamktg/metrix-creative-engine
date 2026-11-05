#!/usr/bin/env node
/*
 * Estimate a beat grid and strong cues for a music track. ffmpeg only.
 *
 *   node beats.mjs <track> [--window 30] [--out cues.json]
 *
 * Output: { duration, tempo, beats: [{time, intensity}], strongCues: [{time, intensity, kind}] }
 * This is an estimate from onset energy and autocorrelation, good enough to
 * bias 1 to 3 reveals toward a hit. It is not a musicological beat tracker;
 * listen before locking anything to it.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { dirname as dirname } from "node:path";

const argv = process.argv.slice(2);
const flag = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const file = argv[0];
const win = parseFloat(flag("--window", "30"));
const SR = 11025, HOP = 128, WIN = 256;

const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-t", String(win + 5), "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
if (pcm.status !== 0) { console.error(pcm.stderr.toString()); process.exit(1); }
const x = new Float32Array(pcm.stdout.buffer, pcm.stdout.byteOffset, pcm.stdout.byteLength / 4);
const dur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);

// Onset envelope: positive change in RMS amplitude per hop. Amplitude, not log
// energy, so a loud accent outranks a quiet tick instead of scoring the same.
// Envelope frame i describes the window centred on (i * HOP + WIN / 2).
const n = Math.floor((x.length - WIN) / HOP);
const env = new Float32Array(n);
let prev = 0;
for (let i = 0; i < n; i++) {
  let e = 0;
  for (let j = 0; j < WIN; j++) { const v = x[i * HOP + j]; e += v * v; }
  const rms = Math.sqrt(e / WIN);
  env[i] = Math.max(0, rms - prev);
  prev = rms;
}
const fr = SR / HOP; // envelope frames per second
const T0 = WIN / 2 / SR; // centre offset of frame 0

// Tempo: autocorrelation peak between 70 and 180 BPM.
let best = 0, bestLag = 0;
for (let bpm = 70; bpm <= 180; bpm += 0.25) {
  const lag = (60 / bpm) * fr;
  let s = 0, c = 0;
  for (let i = 0; i + lag + 1 < n; i++) {
    const l = Math.floor(i + lag), f = i + lag - l;
    s += env[i] * (env[l] * (1 - f) + env[l + 1] * f); c++;
  }
  s /= c || 1;
  if (s > best) { best = s; bestLag = lag; }
}
const period = bestLag / fr;
const tempo = 60 / period;

// Phase: the offset whose beat train collects the most onset energy.
// Phase is searched in envelope-frame time; T0 converts back to track time.
let bestPh = 0, bestSum = -1;
for (let ph = 0; ph < period; ph += 1 / fr) {
  let s = 0;
  for (let t = ph; t < win; t += period) s += env[Math.round(t * fr)] || 0;
  if (s > bestSum) { bestSum = s; bestPh = ph; }
}
const at = (te) => { let m = 0; for (let k = -2; k <= 2; k++) m = Math.max(m, env[Math.round(te * fr) + k] || 0); return m; };
const beatsRaw = [];
for (let te = bestPh; te + T0 < Math.min(win, dur); te += period) beatsRaw.push({ time: +(te + T0).toFixed(3), v: at(te) });
const vmax = Math.max(...beatsRaw.map((b) => b.v), 1e-9);
const beats = beatsRaw.map((b) => ({ time: b.time, intensity: +(b.v / vmax).toFixed(2) }));

// Strong cues: local onset peaks in the top band, at least half a second apart.
const peaks = [];
for (let i = 2; i < Math.min(n, win * fr) - 2; i++)
  if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > env[i - 2] && env[i] >= env[i + 2]) peaks.push({ time: i / fr + T0, v: env[i] });
peaks.sort((a, b) => b.v - a.v);
const strong = [];
for (const p of peaks) {
  if (strong.length >= 10) break;
  if (strong.every((s) => Math.abs(s.time - p.time) > 0.5)) strong.push(p);
}
const pmax = strong[0]?.v || 1;
const onBeat = (t) => beats.some((b) => Math.abs(b.time - t) < 0.08);
const strongCues = strong
  .map((p) => ({ time: +p.time.toFixed(3), intensity: +(p.v / pmax).toFixed(2), kind: onBeat(p.time) ? "strong_beat" : "onset_peak" }))
  .filter((c) => c.intensity >= 0.6) // accents, not every tick of an even pulse
  .sort((a, b) => a.time - b.time);

const out = { track: file, duration: +dur.toFixed(2), tempo: +tempo.toFixed(1), window: win, method: "estimate: RMS onsets + autocorrelation", beats, strongCues };
const o = flag("--out", null);
if (o) { fs.mkdirSync(dirname(o), { recursive: true }); fs.writeFileSync(o, JSON.stringify(out, null, 2)); }
console.log(JSON.stringify(out, null, 2));
