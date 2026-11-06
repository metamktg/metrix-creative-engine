/*
 * Read-only media facts from ffprobe, and the one place L0 spawns ffmpeg and ffprobe.
 *
 *   probe(file) -> { format: {duration}, video: {w,h,fps,nb_frames,duration,pix_fmt,start_time} | null,
 *                    audio: {sr,ch,duration} | null }
 *
 * parseProbe(json) is the pure half; probe() only spawns. Errors are MediaError with
 * code 'ENOFFPROBE' (the binary is not on PATH) or 'UNREADABLE' (ffprobe ran and failed, or
 * the file has no usable stream). The binaries can be overridden with MCE_FFPROBE and
 * MCE_FFMPEG, or per call with { bin }.
 */
import { spawnSync } from "node:child_process";

export class MediaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MediaError";
    this.code = code;
  }
}

const ffprobeBin = () => process.env.MCE_FFPROBE || "ffprobe";
const ffmpegBin = () => process.env.MCE_FFMPEG || "ffmpeg";

/** Spawn ffprobe; throws ENOFFPROBE when the binary is missing. Returns the spawnSync result. */
export function runFfprobe(args, opts = {}) {
  const { bin = ffprobeBin(), ...rest } = opts;
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 256 << 20, ...rest });
  if (r.error && r.error.code === "ENOENT") throw new MediaError("ENOFFPROBE", `ffprobe not found (${bin}); install FFmpeg or set MCE_FFPROBE`);
  if (r.error) throw new MediaError("UNREADABLE", `ffprobe failed to start: ${r.error.message}`);
  return r;
}

/** Spawn ffmpeg with -hide_banner -nostats; throws ENOFFMPEG when the binary is missing. */
export function runFfmpeg(args, opts = {}) {
  const { bin = ffmpegBin(), ...rest } = opts;
  const r = spawnSync(bin, ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 256 << 20, ...rest });
  if (r.error && r.error.code === "ENOENT") throw new MediaError("ENOFFMPEG", `ffmpeg not found (${bin}); install FFmpeg or set MCE_FFMPEG`);
  if (r.error) throw new MediaError("FFMPEG", `ffmpeg failed to start: ${r.error.message}`);
  return r;
}

/** "30000/1001" -> 29.97..., "25/1" -> 25, "0/0" or junk -> null. */
export function parseRate(s) {
  if (s == null) return null;
  const [a, b = "1"] = String(s).split("/");
  const n = Number(a), d = Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0 || n === 0) return null;
  return n / d;
}

const num = (v) => {
  const n = Number(v);
  return v == null || v === "N/A" || !Number.isFinite(n) ? null : n;
};

/** Pure: ffprobe -of json output (string or object) -> probe facts. */
export function parseProbe(json) {
  const j = typeof json === "string" ? JSON.parse(json) : json;
  const streams = Array.isArray(j?.streams) ? j.streams : [];
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === "audio");
  const format = { duration: num(j?.format?.duration) };
  const video = v
    ? {
        w: num(v.width),
        h: num(v.height),
        // Nominal rate: r_frame_rate. avg_frame_rate falls when frames are missing from a
        // variable-rate file, which is exactly what the frame-count check has to see.
        fps: parseRate(v.r_frame_rate) ?? parseRate(v.avg_frame_rate),
        avg_fps: parseRate(v.avg_frame_rate),
        nb_frames: num(v.nb_frames),
        duration: num(v.duration) ?? format.duration,
        start_time: num(v.start_time),
        pix_fmt: v.pix_fmt ?? null,
      }
    : null;
  const audio = a
    ? { sr: num(a.sample_rate), ch: num(a.channels), duration: num(a.duration) ?? format.duration }
    : null;
  return { format, video, audio };
}

const ENTRIES = "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,start_time,pix_fmt,sample_rate,channels:stream_disposition=attached_pic";

/** Spawn ffprobe on a file and return parseProbe() of it. */
export function probe(file, opts = {}) {
  const r = runFfprobe(["-v", "error", "-show_entries", ENTRIES, "-of", "json", file], opts);
  if (r.status !== 0) throw new MediaError("UNREADABLE", `ffprobe could not read ${file}: ${(r.stderr || "").trim().slice(-300)}`);
  let facts;
  try {
    facts = parseProbe(r.stdout);
  } catch (e) {
    throw new MediaError("UNREADABLE", `ffprobe output for ${file} is not JSON: ${e.message}`);
  }
  if (!facts.video && !facts.audio) throw new MediaError("UNREADABLE", `${file} has no audio or video stream`);
  return facts;
}

/** Pure: one pts_time per line (ffprobe -show_entries frame=pts_time -of csv=p=0) -> seconds[]. */
export function parseFramePts(csv) {
  const out = [];
  for (const line of String(csv).split(/\r?\n/)) {
    const t = parseFloat(line);
    if (Number.isFinite(t)) out.push(t);
  }
  return out;
}

/** Spawn ffprobe to list every decoded video frame's pts_time (decodes the whole stream). */
export function framePts(file, opts = {}) {
  const r = runFfprobe(["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", file], opts);
  if (r.status !== 0) throw new MediaError("UNREADABLE", `ffprobe could not decode frames of ${file}: ${(r.stderr || "").trim().slice(-300)}`);
  return parseFramePts(r.stdout);
}
