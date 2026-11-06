import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error untyped skill module
import { plan, check, emit, emitAll, verdict } from "../../skills/metrix-video-assembly/scripts/timeline/index.mjs";
// @ts-expect-error untyped skill module
import { serialize, sha256Hex, tmSha256 } from "../../skills/metrix-video-assembly/scripts/timeline/schema.mjs";

// The delivered v19 edit, anonymised: every number as delivered, every word of copy a neutral token
// of the same length. expected.json holds the delivered v19 numbers (timing.json, edl.json, cues.json,
// the four storyboards, the SRT and the voice graph its builder ran) through the same token map.
const dir = new URL("./fixtures/timeline-v19/", import.meta.url);
const read = (f: string) => fs.readFileSync(fileURLToPath(new URL(f, dir)), "utf8");
const pm = JSON.parse(read("phrases.json"));
const cp = JSON.parse(read("cut.json"));
const golden = read("timeline.json");
const want = JSON.parse(read("expected.json"));
const opts = { phrasemapSha256: sha256Hex(read("phrases.json")), cutplanSha256: sha256Hex(read("cut.json")), phrasemapPath: "phrases.json", cutplanPath: "cut.json" };
const tl = plan(pm, cp, opts);
const emitOpts = { cutplan: cp, phrasemap: pm, timelineSha256: sha256Hex(golden) };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Every number equal to 1e-6, every string and key equal; returns the differences. */
function diff(got: unknown, exp: unknown, at = "", out: string[] = []): string[] {
  if (typeof exp === "number") {
    if (typeof got !== "number" || Math.abs(got - exp) > 1e-6) out.push(`${at}: got ${JSON.stringify(got)} want ${exp}`);
  } else if (Array.isArray(exp)) {
    if (!Array.isArray(got) || got.length !== exp.length) out.push(`${at}: length ${Array.isArray(got) ? got.length : "-"} want ${exp.length}`);
    else exp.forEach((x, i) => diff(got[i], x, `${at}[${i}]`, out));
  } else if (exp && typeof exp === "object") {
    const g = (got ?? {}) as Record<string, unknown>;
    for (const [k, x] of Object.entries(exp)) {
      if (!(k in g)) out.push(`${at}.${k}: missing`);
      else diff(g[k], x, `${at}.${k}`, out);
    }
  } else if (got !== exp) out.push(`${at}: got ${JSON.stringify(got)} want ${JSON.stringify(exp)}`);
  return out;
}

describe("timeline plan reproduces the delivered v19 edit (anonymised fixture)", () => {
  it("plans exactly the committed timeline.json", () => {
    expect(serialize(tl)).toBe(golden);
  });

  it("TM: every value and the key order, and the canonical hash of the composition's TM", () => {
    expect(diff(tl.tm, want.tm)).toEqual([]);
    expect(JSON.stringify(tl.tm)).toBe(JSON.stringify(want.tm));
    const text = emit(tl, "tm");
    expect(tmSha256(text)).toBe(tmSha256(want.tm));
    // The v19 composition holds Python json.dumps spacing; the canonical hash ignores it.
    expect(tmSha256(JSON.stringify(want.tm, null, 1).replace(/\n/g, ""))).toBe(tmSha256(tl.tm));
  });

  it("burned captions (timing.json captions): in, out and copy", () => {
    const got = want.captions.map((c: { id: string }) => {
      const g = tl.captions.groups.find((x: { id: string }) => x.id === c.id);
      return { id: g.id, copy: g.text, in: g.start, out: g.end };
    });
    expect(diff(got, want.captions)).toEqual([]);
  });

  it("measured splits land where v19 measured them", () => {
    expect(pm.splits.map((s: { at: number }) => s.at)).toEqual([want.splits.c, want.splits.h]);
  });

  it("EDL: edit settings and every segment and phrase number; audio_cut is v19 grid_cut", () => {
    const edl = JSON.parse(emit(tl, "edl", emitOpts));
    const got = {
      pre: edl.pre, post: edl.post, lead: edl.lead, bpm: edl.bpm, duration: edl.duration,
      segments: edl.segments.map((s: Record<string, unknown>) => ({ ...s, grid_cut: s.audio_cut })),
    };
    expect(diff(got, want.edl)).toEqual([]);
    // The audio edit before 'H' sits inside the app shot, so it is not a picture cut.
    expect(edl.segments.map((s: { id: string; picture_cut: number | null }) => [s.id, s.picture_cut])).toEqual([
      ["A", 0], ["B+C", null], ["D+E", null], ["F", null], ["G", null], ["H", null], ["I", 15.469],
    ]);
  });

  it("compose-bed cues.json", () => {
    expect(diff(JSON.parse(emit(tl, "cues")), want.cues)).toEqual([]);
  });

  it("the four storyboards: every timing field, and the derived_from stamp", () => {
    for (const [ratio, mode, key] of [["9:16", "cap", "9x16_CAP"], ["9:16", "clean", "9x16_CLEAN"], ["4:5", "cap", "4x5_CAP"], ["4:5", "clean", "4x5_CLEAN"]]) {
      const sb = JSON.parse(emit(tl, "storyboard", { ...emitOpts, ratio, captions: mode }));
      expect(diff(sb, want.storyboards[key], key)).toEqual([]);
      expect(sb.derived_from).toEqual({ path: "timeline.json", sha256: sha256Hex(golden), schema: "mce.timeline/1", tm_sha256: tmSha256(tl.tm) });
      expect(sb.delivery).toEqual({ captions: mode, srt: "captions.srt" });
      expect(sb.audio.voiceover.script_sha256).toBe(sha256Hex(emit(tl, "transcript")));
    }
  });

  it("SRT: every cue's index, times and text, through make-srt's formatter", () => {
    const srt = emit(tl, "srt");
    const blocks = srt.trim().split(/\n\n/).map((b: string) => { const l = b.split("\n"); return { index: Number(l[0]), times: l[1], text: l.slice(2).join("\n") }; });
    expect(blocks).toEqual(want.srt);
    // v19's builder wrote one more blank line after the last cue; make-srt ends at the last text line.
    expect(want.srt_trailing_blank_line).toBe(true);
    expect(srt.endsWith("\n") && !srt.endsWith("\n\n")).toBe(true);
  });

  it("voice graph string, byte for byte, and the transcript", () => {
    expect(emit(tl, "voice-graph")).toBe(`${want.voice_graph}\n`);
    expect(emit(tl, "transcript")).toBe(`${want.transcript}\n`);
  });

  it("clip in-points the composition was built with (OFF_A, OFF_C, OFF_H)", () => {
    const got = Object.fromEntries(Object.keys(want.shot_src_in).map((id) => [id, tl.shots.find((s: { id: string }) => s.id === id).src_in]));
    expect(got).toEqual(want.shot_src_in);
  });

  it("emitAll writes every target, each storyboard stamped with the same timeline hash", () => {
    const files = emitAll(tl, emitOpts).map((f: { file: string }) => f.file);
    expect(files).toEqual([
      "storyboard_9x16_cap.json", "storyboard_9x16_clean.json", "storyboard_4x5_cap.json", "storyboard_4x5_clean.json",
      "captions.srt", "transcript.txt", "edge-times.json", "stills-times.json", "cues.json", "tm.json", "voice-graph.txt", "edl.json",
    ]);
  });
});

describe("timeline check on v19", () => {
  const findings = check(tl, { cutplan: cp, phrasemap: pm, ...opts });
  const by = (rule: string) => findings.filter((f: { rule: string }) => f.rule === rule);

  it("every v19 run rule, written as a constraint row, passes; the timeline re-plans to the same bytes", () => {
    expect(by("constraint")).toHaveLength(cp.constraints.length);
    expect(by("constraint").filter((f: { verdict: string }) => f.verdict !== "PASS")).toEqual([]);
    expect(by("timeline.replan")[0].verdict).toBe("PASS");
    expect(by("shots.reject")[0].verdict).toBe("PASS");
    expect(by("shots.min_shot")[0].verdict).toBe("PASS");
  });

  it("v19's captions break the adopted cue rules: abutting cues (2-frame gap) and a 1.172 s first SRT cue", () => {
    // Recorded, not hidden: v19 butts every cue against the next, and its first SRT cue is under the
    // 1.2 s floor its builder used for the burned captions.
    const fails = findings.filter((f: { verdict: string }) => f.verdict === "FAIL").map((f: { rule: string; id: string }) => `${f.rule} ${f.id}`);
    expect(fails).toEqual([
      "captions.burn.gap_under_min cap_f", "captions.burn.gap_under_min cap_g", "captions.burn.gap_under_min cap_h2",
      "captions.srt.under_min_duration o_a", "captions.srt.gap_under_min o_b", "captions.srt.gap_under_min o_c1", "captions.srt.gap_under_min o_c2",
      "captions.srt.gap_under_min cap_de", "captions.srt.gap_under_min cap_f", "captions.srt.gap_under_min cap_g", "captions.srt.gap_under_min cap_h2",
    ]);
    expect(verdict(findings)).toBe("FAIL");
    expect(by("captions.srt.script")[0].verdict).toBe("PASS");
  });
});

describe("negative controls on v19", () => {
  it("(a) an S1 reject window moved over clip 1.10 s: check FAILs naming the clip and the output frames", () => {
    const bad = clone(cp);
    const w = bad.clips.find((c: { id: string }) => c.id === "S1").reject[1];
    w.hi = 1.12;
    const t2 = plan(pm, bad, { phrasemapSha256: opts.phrasemapSha256 });
    const hits = check(t2).filter((f: { rule: string; verdict: string }) => f.rule === "shots.reject" && f.verdict === "FAIL");
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toMatch(/^shot S1a shows clip S1 frames 26-27 \(clip 1\.040 to 1\.080 s\) at output frames 104-105 \(3\.467 to 3\.500 s\), inside reject 0\.53-1\.12/);
  });

  it("(b) the result card point moved 0.6 s later in timeline.json: the read_after row FAILs and re-planning disagrees", () => {
    const t2 = JSON.parse(golden);
    t2.points.find((p: { id: string }) => p.id === "ok").t += 0.6;
    const f = check(t2, { cutplan: cp, phrasemap: pm, ...opts });
    const row = f.find((x: { id?: string }) => x.id === "read_result");
    expect(row.verdict).toBe("FAIL");
    expect(row.detail).toContain("result card readable for 1.0 s before the cut to the talking shot");
    expect(f.find((x: { rule: string }) => x.rule === "timeline.replan").verdict).toBe("FAIL");
  });

  it("(b) the read_after row set to 0.5 s: the plan no longer reproduces v19's cut to the talking shot", () => {
    const bad = clone(cp);
    bad.constraints.find((c: { id: string }) => c.id === "read_result").s = 0.5;
    const t2 = plan(pm, bad, { phrasemapSha256: opts.phrasemapSha256 });
    expect(t2.tm.cutHer).not.toBe(want.tm.cutHer);
    expect(diff(t2.tm, want.tm).length).toBeGreaterThan(0);
  });
});
