/*
 * The renderer's audio graph, kept apart from render.mjs so it can be tested with ffmpeg alone.
 * Input 0 is the video pipe; this returns the extra -i inputs and the filter_complex that ends
 * in [aout], exactly `duration` seconds long.
 */
import path from "node:path";

export function audioGraph(sb, sbDir, duration) {
  const a = sb.audio || {};
  const inputs = [];
  const chains = [];
  const labels = [];
  const res = (f) => (path.isAbsolute(f) ? f : path.resolve(sbDir, f));
  let n = 1; // input 0 is the video pipe
  if (a.music?.file) {
    const m = a.music;
    inputs.push("-i", res(m.file));
    const fo = m.fade_out ?? 0.8;
    chains.push(
      `[${n}:a]atrim=start=${m.start ?? 0},asetpts=PTS-STARTPTS,volume=${m.volume ?? 0.35},` +
        `afade=t=in:d=${m.fade_in ?? 0.3},afade=t=out:st=${Math.max(0, duration - fo)}:d=${fo},` +
        `apad,atrim=0:${duration}[mus]`
    );
    n++;
    if (a.voiceover?.file) {
      inputs.push("-i", res(a.voiceover.file));
      chains.push(`[${n}:a]adelay=${Math.round((a.voiceover.at ?? 0) * 1000)}:all=1,volume=${a.voiceover.volume ?? 1},apad,atrim=0:${duration},asplit=2[vo][vokey]`);
      // The voice is padded to the ad's length before the split: sidechaincompress ends with its
      // shorter input, so an unpadded voice cut the whole mix at the voice's last sample.
      chains.push(`[mus][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[musd]`);
      labels.push("[musd]", "[vo]");
      n++;
    } else labels.push("[mus]");
  } else {
    chains.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[sil]`);
    labels.push("[sil]");
    if (a.voiceover?.file) {
      inputs.push("-i", res(a.voiceover.file));
      chains.push(`[${n}:a]adelay=${Math.round((a.voiceover.at ?? 0) * 1000)}:all=1,volume=${a.voiceover.volume ?? 1}[vo]`);
      labels.push("[vo]");
      n++;
    }
  }
  for (const [i, s] of (a.sfx || []).entries()) {
    inputs.push("-i", res(s.file));
    const ms = Math.max(0, Math.round(s.at * 1000));
    chains.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${s.volume ?? 0.7},adelay=${ms}:all=1[sx${i}]`);
    labels.push(`[sx${i}]`);
    n++;
  }
  const mix =
    `${labels.join("")}amix=inputs=${labels.length}:duration=first:normalize=0,` +
    `alimiter=limit=0.89,atrim=0:${duration}[aout]`;
  return { inputs, filter: [...chains, mix].join(";") };
}
