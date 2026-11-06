import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error plain ESM module without types
import { tmSha256 } from "../../skills/metrix-video-assembly/scripts/timeline/schema.mjs";

// Strict grounding in check-storyboard.mjs: what the ad says comes from the brief, the kit or a
// hash-locked script, never from text the storyboard's author wrote beside it.
const tool = fileURLToPath(new URL("../../skills/metrix-video-assembly/scripts/check-storyboard.mjs", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "grounding-strict-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

type Rule = { rule: string; verdict: string; detail: string };
type Report = { verdict: string; fails: number; warns: number; overrides: { flag: string; unchecked: string[] }[]; results: Rule[] };
const sha = (b: string | Buffer) => crypto.createHash("sha256").update(b).digest("hex");
let n = 0;

function run(sb: object, args: string[] = [], files: Record<string, string> = {}) {
  const dir = path.join(root, `case-${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  const file = path.join(dir, "storyboard.json");
  fs.writeFileSync(file, JSON.stringify(sb));
  const r = spawnSync(process.execPath, [tool, file, ...args.map((a) => (a.startsWith("@") ? path.join(dir, a.slice(1)) : a))], { encoding: "utf8" });
  const report = JSON.parse(r.stdout) as Report;
  const rule = (name: string) => report.results.find((x) => x.rule === name);
  return { status: r.status, stderr: r.stderr, report, rule, dir };
}

const BRIEF = { copy_architecture: { cta: "Get it now", hook: "Learn faster" }, visual_direction: { avoid: ["Rated #1 by 10,000 users, guaranteed"] } };
const brief = (b: object = BRIEF) => JSON.stringify(b);

// The attack-1 scratch case (X:/metrix-work/scratch-understand/skeptic/sb.json), with a licensed bed
// so the only defect left is the voiced claim. Before this change it passed with exit 0.
function attack(extra: Record<string, unknown> = {}) {
  return {
    name: "t", duration: 8, poster_at: 0.5, format: { ratio: "9:16", width: 1080, height: 1920, fps: 30 },
    audio: { music: { file: "m.wav", volume: 0.3, licence: "test fixture" }, voiceover: { file: "v.wav", script: "Rated #1 by 10,000 users, guaranteed. Get it now.", ...extra } },
    scenes: [
      { id: "s1", role: "hook", start: 0, end: 4, text: [{ id: "h", copy: "Rated #1 by 10,000 users, guaranteed", source: "voiceover", in: 0, out: 4, enter: "none" }] },
      { id: "s2", role: "cta", start: 4, end: 8, text: [{ id: "c", copy: "Get it now", source: "copy_architecture.cta", in: 4, out: 8, enter: "none" }] },
    ],
  };
}

// A storyboard with nothing assertive: hook from the brief, a voiced caption, the CTA.
function plain(vo: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    name: "p", duration: 8, poster_at: 0.5, format: { ratio: "9:16", width: 1080, height: 1920, fps: 30 },
    audio: { music: { file: "m.wav", volume: 0.3, licence: "test fixture" }, voiceover: { file: "v.wav", at: 0, ...vo } },
    scenes: [
      { id: "s1", role: "hook", start: 0, end: 4, text: [
        { id: "h", copy: "Learn faster", source: "copy_architecture.hook", in: 0, out: 4, enter: "none" },
        { id: "v1", copy: "Pick a topic tonight", source: "voiceover", in: 1, out: 4, enter: "none" },
      ] },
      { id: "s2", role: "cta", start: 4, end: 8, text: [{ id: "c", copy: "Get it now", source: "copy_architecture.cta", in: 4, out: 8, enter: "none" }] },
    ],
    ...extra,
  };
}
const SCRIPT = "Pick a topic tonight. Get it now.";

describe("strict grounding: the attack-1 voiced claim", () => {
  it("FAILs with --brief: the claim is in the author's voiceover.script only", () => {
    const r = run(attack(), ["--brief", "@brief.json"], { "brief.json": brief() });
    expect(r.status).toBe(1);
    expect(r.rule("ground.h")?.verdict).toBe("FAIL");
    expect(r.rule("ground.h")?.detail).toContain("audio.voiceover.script grounds nothing");
    expect(r.rule("claim.h")?.verdict).toBe("FAIL");
    expect(r.rule("voiceover.script")?.verdict).toBe("WARN");
  });

  it("control: the same caption grounded in the brief copy passes ground, the claim rule still runs", () => {
    const b = { copy_architecture: { ...BRIEF.copy_architecture, proof: "Rated #1 by 10,000 users, guaranteed" } };
    const r = run(attack(), ["--brief", "@brief.json"], { "brief.json": brief(b) });
    expect(r.rule("ground.h")?.verdict).toBe("PASS");
    expect(r.rule("claim.h")?.verdict).toBe("FAIL");
  });

  it("a voiced claim passes only with claim_source naming a field that carries it", () => {
    const b = { copy_architecture: { ...BRIEF.copy_architecture, proof: "Rated #1 by 10,000 users, guaranteed" } };
    const sb = attack();
    (sb.scenes[0].text[0] as Record<string, unknown>).claim_source = "copy_architecture.proof";
    const ok = run(sb, ["--brief", "@brief.json"], { "brief.json": brief(b) });
    expect(ok.rule("claim.h")?.verdict).toBe("PASS");
    expect(ok.status).toBe(0);
    (sb.scenes[0].text[0] as Record<string, unknown>).claim_source = "visual_direction.avoid";
    const avoid = run(sb, ["--brief", "@brief.json"], { "brief.json": brief({ ...BRIEF, copy_architecture: b.copy_architecture }) });
    expect(avoid.rule("claim.h")?.verdict).toBe("FAIL");
    expect(avoid.rule("claim.h")?.detail).toContain("may NOT run");
    (sb.scenes[0].text[0] as Record<string, unknown>).claim_source = "copy_architecture.hook";
    const wrong = run(sb, ["--brief", "@brief.json"], { "brief.json": brief(b) });
    expect(wrong.rule("claim.h")?.verdict).toBe("FAIL");
    expect(wrong.rule("claim.h")?.detail).toContain("NOT found in copy_architecture.hook");
  });
});

describe("strict grounding: no --brief", () => {
  it("FAILs every brief-sourced and voiced line, and records no override", () => {
    const r = run(plain());
    expect(r.status).toBe(1);
    for (const id of ["h", "c", "v1"]) expect(r.rule(`ground.${id}`)?.verdict, id).toBe("FAIL");
    expect(r.report.overrides).toEqual([]);
  });

  it("--allow-ungrounded turns them into WARN and lists the override in the report and on stderr", () => {
    const r = run(plain(), ["--allow-ungrounded"]);
    expect(r.status).toBe(0);
    for (const id of ["h", "c", "v1"]) expect(r.rule(`ground.${id}`)?.verdict, id).toBe("WARN");
    expect(r.report.overrides).toHaveLength(1);
    expect(r.report.overrides[0].flag).toBe("--allow-ungrounded");
    expect(r.report.overrides[0].unchecked).toEqual(["ground.h", "ground.v1", "ground.c"]);
    expect(r.stderr).toContain("OVERRIDE --allow-ungrounded, 3 rule(s) unchecked");
  });

  it("--allow-ungrounded does not excuse a framing line that asserts", () => {
    const sb = plain();
    sb.scenes[0].text.push({ id: "f", copy: "The best way to study", source: "framing", in: 1.6, out: 4, enter: "none" });
    const r = run(sb, ["--allow-ungrounded"]);
    expect(r.rule("ground.f")?.verdict).toBe("FAIL");
    expect(r.status).toBe(1);
  });

  it("a kit line without --kit FAILs, and is WARN under --allow-ungrounded", () => {
    const sb = plain();
    sb.scenes[1].text.push({ id: "k", copy: "Acme", source: "kit.identity.name", in: 4, out: 8, enter: "none" });
    expect(run(sb, ["--brief", "@brief.json"], { "brief.json": brief() }).rule("ground.k")?.verdict).toBe("FAIL");
    expect(run(sb, ["--brief", "@brief.json", "--allow-ungrounded"], { "brief.json": brief() }).rule("ground.k")?.verdict).toBe("WARN");
  });
});

describe("strict grounding: the locked script", () => {
  it("a caption grounds in --script when its sha256 equals audio.voiceover.script_sha256", () => {
    const r = run(plain({ script_sha256: sha(SCRIPT), script: SCRIPT }), ["--brief", "@brief.json", "--script", "@script.txt"], { "brief.json": brief(), "script.txt": SCRIPT });
    expect(r.rule("voiceover.lock")?.verdict).toBe("PASS");
    expect(r.rule("voiceover.script")?.verdict).toBe("PASS");
    expect(r.rule("ground.v1")?.verdict).toBe("PASS");
    expect(r.rule("ground.v1")?.detail).toBe("caption found in the locked script");
    expect(r.status).toBe(0);
  });

  it("a locked script grounds voiced lines without a brief; brief lines still FAIL", () => {
    const r = run(plain({ script_sha256: sha(SCRIPT) }), ["--script", "@script.txt"], { "script.txt": SCRIPT });
    expect(r.rule("ground.v1")?.verdict).toBe("PASS");
    expect(r.rule("ground.h")?.verdict).toBe("FAIL");
  });

  it("FAILs a script whose hash is not the storyboard's lock, and then grounds nothing in it", () => {
    const r = run(plain({ script_sha256: sha("something else") }), ["--brief", "@brief.json", "--script", "@script.txt"], { "brief.json": brief(), "script.txt": SCRIPT });
    expect(r.rule("voiceover.lock")?.verdict).toBe("FAIL");
    expect(r.rule("ground.v1")?.verdict).toBe("FAIL");
  });

  it("FAILs --script when the storyboard names no script_sha256", () => {
    const r = run(plain(), ["--brief", "@brief.json", "--script", "@script.txt"], { "brief.json": brief(), "script.txt": SCRIPT });
    expect(r.rule("voiceover.lock")?.verdict).toBe("FAIL");
    expect(r.rule("voiceover.lock")?.detail).toContain("script_sha256 missing");
  });

  it("FAILs an audio.voiceover.script that says other words than the locked file", () => {
    const r = run(plain({ script_sha256: sha(SCRIPT), script: "Pick a topic tonight. Rated number one." }), ["--brief", "@brief.json", "--script", "@script.txt"], { "brief.json": brief(), "script.txt": SCRIPT });
    expect(r.rule("voiceover.script")?.verdict).toBe("FAIL");
  });

  it("reads the packet's script.json lines and requires the packet's hashes to match", () => {
    const scriptJson = JSON.stringify({ schema_version: 1, lines: [{ id: "L1", text: "Pick a topic tonight." }, { id: "L2", text: "Get it now." }] });
    const h = sha(scriptJson);
    const packet = (a: string, b: string) => JSON.stringify({ script: { path: "script.json", sha256: a }, voice: { accepted_bindings: { script_sha256: b } } });
    const ok = run(plain({ script_sha256: h }), ["--brief", "@brief.json", "--packet", "@packet.json"], { "brief.json": brief(), "script.json": scriptJson, "packet.json": packet(h, h) });
    expect(ok.rule("voiceover.lock")?.verdict).toBe("PASS");
    expect(ok.rule("voiceover.lock")?.detail).toContain("and the packet");
    expect(ok.rule("ground.v1")?.detail).toBe("caption found in the locked script");
    const stale = run(plain({ script_sha256: h }), ["--brief", "@brief.json", "--packet", "@packet.json"], { "brief.json": brief(), "script.json": scriptJson, "packet.json": packet(h, sha("old")) });
    expect(stale.rule("voiceover.lock")?.verdict).toBe("FAIL");
    expect(stale.rule("voiceover.lock")?.detail).toContain("voice.accepted_bindings.script_sha256");
  });
});

describe("music licence", () => {
  it("FAILs a music file with no licence, PASSes a named one, and says nothing without music", () => {
    const sb = plain();
    const noLic = { ...sb, audio: { ...sb.audio, music: { file: "m.wav", volume: 0.3 } } };
    expect(run(noLic, ["--brief", "@brief.json"], { "brief.json": brief() }).rule("music.licence")?.verdict).toBe("FAIL");
    const blank = { ...sb, audio: { ...sb.audio, music: { file: "m.wav", volume: 0.3, licence: "  " } } };
    expect(run(blank, ["--brief", "@brief.json"], { "brief.json": brief() }).rule("music.licence")?.verdict).toBe("FAIL");
    expect(run(sb, ["--brief", "@brief.json"], { "brief.json": brief() }).rule("music.licence")?.verdict).toBe("PASS");
    const none = { ...sb, audio: { ...sb.audio, music: null, silence_reason: "voice only" } };
    expect(run(none, ["--brief", "@brief.json"], { "brief.json": brief() }).rule("music.licence")).toBeUndefined();
  });
});

describe("derived_from against a hand-written mce.timeline/1 file", () => {
  // Shape per references/timeline.md "derived_from"; the timeline body is not validated here,
  // only its bytes, its schema field and its tm.
  const TL = JSON.stringify({ schema: "mce.timeline/1", tm: { picApp: 5.234, cutHer: 12.109 } }, null, 2) + "\n";
  const stamp = (o: Record<string, unknown> = {}) => ({ path: "timeline.json", sha256: sha(TL), schema: "mce.timeline/1", tm_sha256: tmSha256({ picApp: 5.234, cutHer: 12.109 }), ...o });
  const files = { "brief.json": brief(), "timeline.json": TL };
  const args = ["--brief", "@brief.json", "--script", "@script.txt"];
  const sb = (df?: object) => ({ ...plain({ script_sha256: sha(SCRIPT) }), ...(df ? { derived_from: df } : {}) });
  const go = (df?: object, f: Record<string, string> = files) => run(sb(df), args, { ...f, "script.txt": SCRIPT }).rule("derived_from");

  it("PASSes a stamp whose sha256 and tm_sha256 match", () => {
    expect(go(stamp())?.verdict).toBe("PASS");
  });
  it("FAILs a storyboard with timeline.json beside it and no stamp", () => {
    expect(go()?.verdict).toBe("FAIL");
  });
  it("says nothing for a hand-authored storyboard with no timeline beside it", () => {
    expect(go(undefined, { "brief.json": brief() })).toBeUndefined();
  });
  it("FAILs a stale timeline hash", () => {
    const r = go(stamp(), { ...files, "timeline.json": TL.replace("12.109", "12.110") });
    expect(r?.verdict).toBe("FAIL");
    expect(r?.detail).toContain("re-emit");
  });
  it("FAILs a TM hash that is not the timeline's", () => {
    expect(go(stamp({ tm_sha256: sha("x") }))?.detail).toContain("TM hashes");
  });
  it("FAILs a malformed stamp, a missing file and a wrong schema", () => {
    expect(go(stamp({ schema: "mce.timeline/2" }))?.verdict).toBe("FAIL");
    expect(go({ path: "timeline.json", sha256: sha(TL), schema: "mce.timeline/1" })?.verdict).toBe("FAIL");
    expect(go(stamp({ path: "gone.json" }))?.detail).toContain("does not exist");
    const other = JSON.stringify({ schema: "mce.cutplan/1", tm: null });
    expect(go(stamp({ sha256: sha(other), tm_sha256: null }), { ...files, "timeline.json": other })?.detail).toContain("not mce.timeline/1");
  });
  it("PASSes tm_sha256 null for a timeline with no TM", () => {
    const noTm = JSON.stringify({ schema: "mce.timeline/1", tm: null });
    expect(go(stamp({ sha256: sha(noTm), tm_sha256: null }), { ...files, "timeline.json": noTm })?.verdict).toBe("PASS");
  });
});

describe("schema_version 2 and format.placement", () => {
  it("requires format.placement in v2 and resolves it through the zone table", () => {
    const base = plain();
    const go = (format: object, v: unknown = 2) => run({ ...base, schema_version: v, format: { ...base.format, ...format } }, ["--allow-ungrounded"]);
    expect(go({}).rule("format.placement")?.verdict).toBe("FAIL");
    expect(go({ placement: "Instagram Reels" }).rule("format.placement")?.detail).toContain("instagram_reels");
    expect(go({ placement: "Nowhere Feed" }).rule("format.placement")?.verdict).toBe("FAIL");
    expect(go({ placement: "Instagram Reels", kind: "gif" }).rule("format.kind")?.verdict).toBe("FAIL");
    expect(go({}, 3).rule("schema_version")?.verdict).toBe("FAIL");
  });
});
