// Compose an original instrumental bed scored to an ad's cuts. Synthesised from
// scratch: no samples, no third-party model, so the bed carries no licence
// question. Write the result into the storyboard as audio.music with
// licence "original, composed by compose-bed.mjs".
//
//   node compose-bed.mjs <out.wav> [cue-sheet.json]
//
// Cue sheet (all times in seconds on the ad timeline):
//   { "duration": 15, "bpm": 100, "grid_start": 0.4,
//     "sections": [ { "from": 0, "to": 2.8, "chord": [57,60,64], "root": 45, "energy": 0 }, ... ] }
// chord and root are MIDI notes. energy 0: pad only (keep the hook calm);
// 1: kick and sub bass; 2: adds hats and a pluck arpeggio; 3: adds a riser into
// the next section; 4: the resolve (CTA): big hit, chime, ring out.
// Choose bpm and grid_start so that cuts land on beats: grid_start + k * 60/bpm.
// Without a cue sheet it writes the default demo bed (100 BPM, cuts 2.8/7.0/10.6, CTA 13.0).
import fs from "node:fs";

const SPEC = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")) : null;
const SR = 48000, DUR = SPEC?.duration ?? 15.0, N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const BEAT = 60 / (SPEC?.bpm ?? 100), GRID0 = SPEC?.grid_start ?? 0.4;
const beats = []; for (let t = GRID0; t < DUR; t += BEAT) beats.push(+t.toFixed(4));
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const sections = SPEC?.sections ?? [
  { from: 0.0, to: 2.8, chord: [57, 60, 64], root: 45, energy: 0 },   // Am: hook, sparse
  { from: 2.8, to: 7.0, chord: [53, 57, 60, 64], root: 41, energy: 1 }, // Fmaj7: the product appears
  { from: 7.0, to: 10.6, chord: [48, 55, 60, 64], root: 36, energy: 2 }, // C: the finding opens
  { from: 10.6, to: 13.0, chord: [55, 59, 62, 67], root: 43, energy: 3 }, // G: evidence, rising
  { from: 13.0, to: 15.0, chord: [48, 55, 60, 64, 67], root: 36, energy: 4 }, // C: CTA, resolve
];
const secAt = (t) => sections.find((s) => t >= s.from && t < s.to) ?? sections.at(-1);
const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

// Sidechain-style duck after each kick, so the pulse breathes.
const firstAt = (e) => sections.find((x) => x.energy >= e)?.from ?? Infinity;
const RESOLVE = sections.find((x) => x.energy >= 4)?.from ?? DUR;
const kicks = beats.filter((b) => b >= firstAt(1) - 0.01 && b < RESOLVE - 0.1).concat(RESOLVE < DUR ? [RESOLVE] : []);
const duck = (t) => { let g = 1; for (const k of kicks) if (t >= k && t < k + 0.4) g = Math.min(g, 1 - 0.38 * Math.exp(-(t - k) / 0.11)); return g; };

// ---- pad: detuned additive saw, soft attack per section, brightness grows with energy
for (const s of sections) {
  const a = Math.floor(s.from * SR), b = Math.min(N, Math.floor((s.to + 0.35) * SR));
  const harm = 4 + s.energy * 2;
  for (let i = a; i < b; i++) {
    const t = i / SR, lt = t - s.from;
    const env = Math.min(1, lt / 0.35) * (t > s.to ? Math.max(0, 1 - (t - s.to) / 0.35) : 1);
    let l = 0, r = 0;
    for (const m of s.chord) for (let h = 1; h <= harm; h++) {
      const amp = 1 / (h * h * 0.9 + 0.1);
      l += amp * Math.sin(2 * Math.PI * hz(m) * 0.998 * h * t);
      r += amp * Math.sin(2 * Math.PI * hz(m) * 1.002 * h * t + 0.3);
    }
    const g = 0.022 * env * (0.75 + 0.1 * s.energy) * duck(t) * (1 + 0.08 * Math.sin(2 * Math.PI * 0.25 * t));
    add(i, l * g, r * g);
  }
}

// ---- sub bass: root on every beat once the product appears
for (const b of beats) {
  if (b < firstAt(1) - 0.01) continue;
  const s = secAt(b + 0.01), f = hz(s.root), a = Math.floor(b * SR), len = Math.floor((s.energy === 4 ? 2.0 : 0.5) * SR);
  for (let j = 0; j < len; j++) {
    const t = j / SR, env = Math.min(1, t / 0.01) * Math.exp(-t / (s.energy === 4 ? 0.9 : 0.22));
    const v = 0.20 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
    add(a + j, v, v);
  }
  if (s.energy === 4) break;
}

// ---- kick: pitch sweep 140 -> 45 Hz
for (const k of kicks) {
  const a = Math.floor(k * SR), big = k >= RESOLVE - 0.01;
  let ph = 0;
  for (let j = 0; j < SR * 0.45; j++) {
    const t = j / SR, f = 45 + 95 * Math.exp(-t / 0.035);
    ph += 2 * Math.PI * f / SR;
    const v = (big ? 0.55 : 0.36) * Math.exp(-t / (big ? 0.28 : 0.16)) * Math.sin(ph);
    add(a + j, v, v);
  }
}

// ---- hats: filtered noise on the off-beats from the finding onward
for (const b of beats) {
  if (b < firstAt(2) - 0.01 || b >= RESOLVE - 0.1) continue;
  for (const off of [0, BEAT / 2]) {
    const a = Math.floor((b + off) * SR); let prev = 0;
    const lvl = off ? 0.05 : 0.03;
    for (let j = 0; j < SR * 0.05; j++) {
      const n = rnd(), hp = n - prev; prev = n;
      const v = lvl * Math.exp(-j / SR / 0.012) * hp;
      add(a + j, v * 0.8, v * 1.1);
    }
  }
}

// ---- pluck arpeggio, 16ths, chord tones an octave up, from the finding to the CTA
{
  const step = BEAT / 4;
  let n = 0;
  for (let t = firstAt(2); t < RESOLVE - 0.05; t += step, n++) {
    const s = secAt(t + 0.001), tones = s.chord.map((m) => m + 12);
    const m = tones[n % tones.length] + (n % 8 >= 4 ? 12 : 0), f = hz(m);
    const a = Math.floor(t * SR), pan = 0.5 + 0.35 * Math.sin(n * 0.9);
    const lvl = 0.035 + 0.012 * (s.energy - 2);
    for (let j = 0; j < SR * 0.3; j++) {
      const tt = j / SR, env = Math.min(1, tt / 0.003) * Math.exp(-tt / 0.09);
      const v = lvl * env * (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt));
      add(a + j, v * (1 - pan) * 1.4, v * pan * 1.4);
    }
  }
}

// ---- riser into the CTA: noise with a rising one-pole lowpass, 10.6 -> 13.0
{
  const a = Math.floor(Math.min(firstAt(3), RESOLVE) * SR), b = Math.floor((RESOLVE - 0.02) * SR); let yl = 0, yr = 0;
  for (let i = a; i < b; i++) {
    const p = (i - a) / (b - a), fc = 300 + 6000 * p * p, k = 1 - Math.exp(-2 * Math.PI * fc / SR);
    yl += k * (rnd() - yl); yr += k * (rnd() - yr);
    const g = 0.09 * p * p;
    add(i, yl * g, yr * g);
  }
}

// ---- CTA chime: bell partials on the resolve
for (const [m, d] of [[72, 0], [76, 0.04], [79, 0.08], [84, 0.12]]) {
  if (RESOLVE >= DUR) break;
  const a = Math.floor((RESOLVE + d) * SR), f = hz(m);
  for (let j = 0; j < SR * 1.9; j++) {
    const t = j / SR, env = Math.min(1, t / 0.004) * Math.exp(-t / 0.6);
    const v = 0.04 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.15));
    add(a + j, v * 0.9, v * 1.1);
  }
}

// ---- soft clip, fade the tail, write 24-bit WAV
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 0.8 / peak;
const buf = Buffer.alloc(44 + N * 6);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 6, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.write("data", 36); buf.writeUInt32LE(N * 6, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > DUR - 0.6 ? (DUR - t) / 0.6 : 1;
  for (const [c, x] of [[0, L[i]], [1, R[i]]]) {
    const y = Math.tanh(x * norm * 1.1) * fade;
    const v = Math.max(-8388607, Math.min(8388607, Math.round(y * 8388607)));
    buf.writeIntLE(v, 44 + i * 6 + c * 3, 3);
  }
}
fs.writeFileSync(process.argv[2], buf);
console.log(JSON.stringify({ out: process.argv[2], seconds: DUR, bpm: SPEC?.bpm ?? 100, grid_start: GRID0, section_starts_on_beats: sections.slice(1).map((x) => ({ at: x.from, on_beat: beats.some((b) => Math.abs(b - x.from) < 0.02) })) }));
