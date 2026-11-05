/*
 * Resolve the targets qa-video.mjs checks a finished file against.
 *
 * The renderer takes its loudness target, ratio and duration from storyboard.json.
 * qa-video.mjs used to default the loudness target to -14 whatever the storyboard said,
 * so a mix rendered to a different approved target failed QA unless someone remembered
 * --lufs. With --storyboard the same facts feed both. An explicit flag always wins, and
 * every value records where it came from, so a reader can see what was checked against what.
 *
 * Pure and synchronous: no files, no ffmpeg.
 */
export const DEFAULT_LUFS = -14;

const flagValue = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** How the storyboard's audio block classifies the mix, matching render.mjs. */
export function mixMode(storyboard) {
  const audio = storyboard?.audio;
  if (!audio || typeof audio !== "object") return undefined;
  const hasBed = Boolean(audio.music?.file) || Boolean(audio.voiceover?.file);
  if (hasBed) return "mix";
  return Array.isArray(audio.sfx) && audio.sfx.length > 0 ? "effects-only" : "silent";
}

export function resolveQaOptions(argv, storyboard) {
  const notes = [];
  const out = { ratio: undefined, duration: undefined, mode: "mix", lufs: undefined, sources: {}, notes };
  const set = (key, flag, fromStoryboard) => {
    const explicit = flagValue(argv, flag);
    if (explicit !== undefined) {
      out[key] = key === "ratio" ? explicit : Number(explicit);
      out.sources[key] = "flag";
      if (fromStoryboard !== undefined && String(fromStoryboard) !== String(explicit)) {
        notes.push(`${flag} ${explicit} overrides the storyboard's ${fromStoryboard}`);
      }
    } else if (fromStoryboard !== undefined) {
      out[key] = fromStoryboard;
      out.sources[key] = "storyboard";
    }
  };

  if (storyboard) {
    const ratio = typeof storyboard.format?.ratio === "string" ? storyboard.format.ratio : undefined;
    const duration = finite(Number(storyboard.duration)) && Number(storyboard.duration) > 0 ? Number(storyboard.duration) : undefined;
    set("ratio", "--ratio", ratio);
    set("duration", "--duration", duration);
  } else {
    set("ratio", "--ratio", undefined);
    set("duration", "--duration", undefined);
  }

  if (argv.includes("--silent")) { out.mode = "silent"; out.sources.mode = "flag"; }
  else if (argv.includes("--effects-only")) { out.mode = "effects-only"; out.sources.mode = "flag"; }
  else if (storyboard && mixMode(storyboard)) { out.mode = mixMode(storyboard); out.sources.mode = "storyboard"; }
  else out.sources.mode = "default";

  if (out.mode === "mix") {
    const declared = storyboard?.audio?.lufs;
    set("lufs", "--lufs", finite(declared) ? declared : undefined);
    if (out.lufs === undefined) { out.lufs = DEFAULT_LUFS; out.sources.lufs = "default"; }
    if (!finite(out.lufs)) throw new Error("--lufs needs a number");
  }
  for (const key of ["duration"]) if (out[key] !== undefined && !(out[key] > 0)) throw new Error(`--${key} needs a positive number`);
  return out;
}
