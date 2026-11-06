/*
 * Pure helpers for phrase-map.mjs: speech islands from ffmpeg silencedetect output,
 * Whisper word assignment, and the word-for-word check against the approved script.
 * No I/O here, so the tests can drive every branch with fixtures.
 */

/** Parse silencedetect stderr into speech islands [{start, end}] (seconds) inside [0, duration]. */
export function speechIslands(stderr, duration) {
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // Silence intervals; a trailing silence with no end runs to the file end.
  const silences = starts.map((s, i) => [s, i < ends.length ? ends[i] : duration]);
  const islands = [];
  let cursor = 0;
  for (const [s, e] of silences) {
    if (s > cursor + 1e-6) islands.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (duration > cursor + 1e-6) islands.push({ start: cursor, end: duration });
  return islands.map((x) => ({ start: round(x.start), end: round(x.end) }));
}

/**
 * Whisper (ffmpeg whisper filter, format=json, max_len=1) writes one JSON object per line:
 * {"start": ms, "end": ms, "text": "word"}. Token ends run into the next word, so they are
 * good for order and rough position only; island edges carry the precise timing.
 */
export function parseWhisperWords(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    let w;
    // ffmpeg does not escape the text field, so a quote or backslash in a word makes the line
    // invalid JSON. Fall back to reading the three fields by position.
    try { w = JSON.parse(l); } catch {
      const m = l.match(/"start"\s*:\s*(\d+)\s*,\s*"end"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*"(.*)"\s*(?:,\s*"language"[^}]*)?}\s*$/);
      if (!m) throw new Error(`unreadable whisper line: ${l}`);
      w = { start: m[1], end: m[2], text: m[3] };
    }
    return { text: String(w.text).trim(), start: Number(w.start) / 1000, end: Number(w.end) / 1000 };
  }).filter((w) => w.text);
}

/** Assign each word to the island its start falls in, or the nearest island by start time. */
export function assignWords(islands, words) {
  const phrases = islands.map((isl, i) => ({ id: `P${i + 1}`, start: isl.start, end: isl.end, words: [] }));
  for (const w of words) {
    let best = -1, dist = Infinity;
    phrases.forEach((p, i) => {
      const d = w.start < p.start ? p.start - w.start : w.start > p.end ? w.start - p.end : 0;
      if (d < dist) { dist = d; best = i; }
    });
    if (best >= 0) phrases[best].words.push(w);
  }
  for (const p of phrases) p.text = p.words.map((w) => w.text).join(" ");
  return phrases;
}

// Apostrophes are dropped, so ASR "Works" matches the script's "Work's"; that difference is not audible.
export const normalize = (s) => s.toLowerCase().replace(/[‘’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Apply "heard=meant" aliases (e.g. "north wind=northwind") to normalized ASR text. */
export function applyAliases(text, aliases = []) {
  let out = ` ${text} `;
  for (const a of aliases) {
    const [heard, meant] = a.split("=").map((x) => normalize(x));
    if (heard && meant) out = out.split(` ${heard} `).join(` ${meant} `);
  }
  return out.trim();
}

/**
 * Word diff between the approved script and what ASR heard (both normalized), by LCS.
 * Returns [{type: "missing"|"extra", word, index}] where index is the script word position
 * (missing) or heard word position (extra). Empty means every script word was heard in order.
 */
export function scriptDiff(scriptText, heardText, aliases = []) {
  const a = normalize(applyAliases(normalize(scriptText), aliases)).split(" ").filter(Boolean);
  const b = normalize(applyAliases(normalize(heardText), aliases)).split(" ").filter(Boolean);
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const diffs = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) diffs.push({ type: "missing", word: a[i], index: i++ });
    else diffs.push({ type: "extra", word: b[j], index: j++ });
  }
  while (i < a.length) diffs.push({ type: "missing", word: a[i], index: i++ });
  while (j < b.length) diffs.push({ type: "extra", word: b[j], index: j++ });
  return diffs;
}

export function srtTime(t) {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/** One cue per phrase, using the phrase text (ASR) unless a same-length script split is given. */
export function phrasesToSrt(phrases, texts) {
  return phrases.map((p, i) => `${i + 1}\n${srtTime(p.start)} --> ${srtTime(p.end)}\n${texts ? texts[i] : p.text}\n`).join("\n");
}

function round(x) { return Math.round(x * 1000) / 1000; }
