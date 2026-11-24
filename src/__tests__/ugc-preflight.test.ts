/** Synthetic records exercise dependency checks, never real listening/acting. */
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { KieClient } from "../client.js";
import { registerKieTools } from "../tools.js";
import { ACCEPTANCE_CRITERIA, V1_ALLOWED_RUN_ID_SHA256, isV1AllowedRunId, canonicalJson, inspectUgcPacket, sha256, submitUgcPacket } from "../../skills/metrix-ad-creative/scripts/ugc-preflight.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
/** Packet v2 by default; `version: 1` builds the legacy shape without acceptance. */
async function fixture(opts: { version?: 1 | 2; runId?: string } = {}) {
  const version = opts.version ?? 2;
  const dir = await mkdtemp(path.join(tmpdir(), "ugc-preflight-test-")); roots.push(dir);
  const bind = async (name: string, value: unknown) => {
    const bytes = typeof value === "string" ? value : JSON.stringify(value);
    await writeFile(path.join(dir, name), bytes);
    return { path: name, sha256: sha256(bytes) };
  };
  const text = ["Here's how to save a step.", "Try the app."];
  const brief = await bind("brief.json", { brief_metadata: { brief_id: "anonymous-test", asset_type: "ai_ugc" }, copy_architecture: { spoken_script: text.join(" "), spoken_opening_locked: text[0] } });
  const script = await bind("script.json", { schema_version: 1, brief_id: "anonymous-test", lines: text.map((text, i) => ({ id: `L${i+1}`, text, role: i ? "action" : "hook", intent: "clarify", emotion: "calm", gaze: "lens", gesture: "none", intensity: 1, viewer_thought: "understand one step", emotion_entry: "calm", emotion_exit: "calm", observable_behavior: "steady explanation" })) });
  const identity = await bind("identity.bin", "synthetic unit fixture identity");
  const settings = await bind("voice-settings.json", { voice_id: "fixture-only" });
  const scene = await bind("scene.json", { room: "fixture" });
  const master = await bind("voice.bin", "synthetic unit fixture audio, not a real take");
  const evidence = await bind("evidence.txt", "TEST ONLY: simulated acceptance, schema, quote and upload records");
  const review = (method: string) => ({ status: "accepted", reviewer_id: "fixture-only", method, reviewed_at: new Date(Date.now()-1000).toISOString(), evidence });
  const request = { model: "test/lip-sync", input: { audio_url: "https://example.test/voice", image_url: "https://example.test/identity", duration: 10 } };
  const upload = async (name: string, source: any, value: string) => bind(name, { provider: "kie", source_sha256: source.sha256, provider_value: value, valid_until: new Date(Date.now()+3600000).toISOString() });
  const voiceUpload = await upload("voice-upload.json", master, request.input.audio_url);
  const identityUpload = await upload("identity-upload.json", identity, request.input.image_url);
  const still = await bind("still.bin", "synthetic accepted presenter still");
  const look = await bind("look.json", { wardrobe: "fixture", grade: "fixture" });
  const eyeSheet = await bind("eye-sheet.json", { frames: "fixture", eyes_open_on_lens: true });
  const acceptance = { stills: [still], look, eye_sheet: eyeSheet, criteria: { mood: true, look: true, eyes_open_on_lens: true, expression: true },
    review: { ...review("presenter_acceptance_review"), reviewer_id: "fixture-reviewer", identity_sha256: identity.sha256, scene_sha256: scene.sha256, look_sha256: look.sha256, eye_sheet_sha256: eyeSheet.sha256, still_sha256s: [still.sha256] } };
  const packet: any = {
    schema_version: version, run_id: opts.runId ?? "test-only", brief_id: "anonymous-test", brief, script,
    hook: { line_id: "L1", rationale: "one clear thought", first_frame: "presenter", payoff: "one step" },
    claims: [{ line_id: "L1", status: "supported", rationale: "fixture", evidence }, { line_id: "L2", status: "not_a_claim", rationale: "invitation" }],
    presenter: { identity, voice_settings: settings, scene, fit_rationale: "synthetic fixture", review: { ...review("visual_identity_review"), identity_sha256: identity.sha256, voice_settings_sha256: settings.sha256, scene_sha256: scene.sha256 } },
    voice: { master, duration_seconds: 10, review: review("human_full_listen"), accepted_bindings: { script_sha256: script.sha256, identity_sha256: identity.sha256, voice_settings_sha256: settings.sha256, scene_sha256: scene.sha256, audio_sha256: master.sha256 }, phrases: [{ line_id: "L1", start: 0, end: 5 }, { line_id: "L2", start: 5, end: 10 }] },
    proofs: [], retained_assets: [{ source: evidence, rights: "fixture", reuse_scope: "unaffected illustration" }],
    route: { provider: "kie", audio_mode: "approved_voice", operation: "lip_sync", model: request.model, checked_at: new Date(Date.now()-1000).toISOString(), valid_until: new Date(Date.now()+3600000).toISOString(), schema_evidence: evidence, supported_controls: ["audio_reference", "identity_reference"], required_controls: ["audio_reference"], requested_duration_seconds: 10, supported_durations_seconds: [5,10], duration_input_pointer: "/duration" },
    request, request_sha256: sha256(canonicalJson(request)),
    input_bindings: [{ role: "voice", source: master, upload_receipt: voiceUpload, input_pointer: "/audio_url", provider_value: request.input.audio_url, master_sha256: master.sha256, start_seconds: 0, end_seconds: 10 }, { role: "identity", source: identity, upload_receipt: identityUpload, input_pointer: "/image_url", provider_value: request.input.image_url }],
    budget: { provider: "kie", account: "fixture", unit: "credits", authorization_ref: "fixture only", ceiling: 10, settled: 0, pending: 0, request_upper_bound: 2, finish_reserve: 3, repair_reserve: 5, quote_valid_until: new Date(Date.now()+3600000).toISOString(), quote_evidence: evidence },
  };
  if (version === 2) {
    packet.prepared_by = "fixture-preparer";
    packet.presenter.acceptance = acceptance;
    packet.voice.accepted_bindings.look_sha256 = look.sha256;
  }
  const packetPath = path.join(dir, "packet.json");
  const save = async () => writeFile(packetPath, JSON.stringify(packet));
  await save();
  return { dir, packet, packetPath, save, bind, review, upload, still };
}

describe("UGC preproduction dependency guard", () => {
  it("accepts current synthetic records while explicitly refusing to certify listening", async () => {
    const f = await fixture(); const result = await inspectUgcPacket(f.packetPath);
    expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("cannot prove human listening");
  });
  it.each(["script_sha256", "identity_sha256", "voice_settings_sha256", "scene_sha256", "audio_sha256", "look_sha256"])("rejects stale full-read %s", async key => {
    const f = await fixture(); f.packet.voice.accepted_bindings[key] = "0".repeat(64); await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain(`voice.accepted_bindings.${key}`);
  });
  it("rejects punctuation drift even after source hashes are updated", async () => {
    const f = await fixture(); const s = JSON.parse(await readFile(path.join(f.dir, "script.json"), "utf8"));
    s.lines[0].text = s.lines[0].text.replace(".", "!"); f.packet.script = await f.bind("script.json", s); f.packet.voice.accepted_bindings.script_sha256 = f.packet.script.sha256; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("spoken_script must match exactly");
  });
  it("new presenter makes old voice/fit stale while retained originals stay valid", async () => {
    const f = await fixture(); f.packet.presenter.identity = await f.bind("new-identity.bin", "new fixture face"); await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors.join(" ");
    expect(errors).toContain("identity_sha256"); expect(errors).not.toContain("retained_asset");
  });
  it("does not accept screenshot proof of interaction", async () => {
    const f = await fixture(); f.packet.proofs = [{ line_id: "L1", requirement: "interaction", kind: "screenshot", source: f.packet.presenter.identity, demonstrates: "visible state", limits: "no click evidence", rights: "fixture" }]; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("cannot prove interaction");
  });
  it.each(["transcript", "frames", "unavailable"])("does not accept %s as full human listening", async method => {
    const f = await fixture(); f.packet.voice.review.method = method; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).ok).toBe(false);
  });
  it("rejects unavailable controls and duration rounding", async () => {
    const f = await fixture(); f.packet.route.required_controls.push("unsupported_emotion"); f.packet.route.requested_duration_seconds = 9; await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors.join(" ");
    expect(errors).toContain("unsupported or unverified"); expect(errors).toContain("unsupported duration");
  });
  it("requires replanning when a measured returned duration changes", async () => {
    const f = await fixture(); expect((await inspectUgcPacket(f.packetPath, { observedDurationSeconds: 12 })).errors.join(" ")).toContain("returned duration differs");
  });
  it("rejects changed actual provider input and inherited JSON pointers", async () => {
    const f = await fixture(); f.packet.request.input.prompt = "changed"; f.packet.input_bindings[1].input_pointer = "/constructor/name"; f.packet.input_bindings[1].provider_value = "Object"; await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors.join(" "); expect(errors).toContain("request_sha256"); expect(errors).toContain("provider value/pointer differs");
  });
  it("rejects stale source/segment approval", async () => {
    const f = await fixture(); const input = f.packet.input_bindings[0]; input.source = await f.bind("segment.bin", "segment fixture"); input.end_seconds = 5; input.review = { ...f.review("human_segment_listen"), segment_sha256: "0".repeat(64), master_sha256: f.packet.voice.master.sha256, start_seconds: 0, end_seconds: 5 }; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("stale segment/master/range");
  });
  it("supports a reviewed identity-bearing base video without replacing canonical identity", async () => {
    const f = await fixture(); const input = f.packet.input_bindings[1]; input.source = await f.bind("base-video.bin", "synthetic video fixture");
    input.review = { ...f.review("visual_derivative_review"), source_sha256: input.source.sha256, identity_sha256: f.packet.presenter.identity.sha256, scene_sha256: f.packet.presenter.scene.sha256 }; input.upload_receipt = await f.upload("video-upload.json", input.source, input.provider_value); await f.save();
    expect((await inspectUgcPacket(f.packetPath)).ok).toBe(true);
    input.review.source_sha256 = "0".repeat(64); await f.save(); expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("stale source/identity/scene");
  });
  it("malformed dates produce errors and an invalid job ID stays held", async () => {
    const f = await fixture(); f.packet.route.valid_until = { toString: "invalid" }; f.packet.budget.quote_valid_until = {}; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).ok).toBe(false);
    const good = await fixture(); await expect(submitUgcPacket(good.packetPath, async () => "")).rejects.toThrow("no valid taskId");
    await expect(submitUgcPacket(good.packetPath, async () => "replacement")).rejects.toThrow("already recorded or uncertain");
  });
  it("rejects expired/stale upload receipts and an unaffordable completion plan", async () => {
    const f = await fixture(); const receipt = JSON.parse(await readFile(path.join(f.dir, "voice-upload.json"), "utf8"));
    receipt.valid_until = "2000-01-01T00:00:00Z"; f.packet.input_bindings[0].upload_receipt = await f.bind("voice-upload.json", receipt); f.packet.budget.pending = 1; await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors.join(" "); expect(errors).toContain("upload receipt"); expect(errors).toContain("exceeds ceiling");
  });
  it("does not treat a native-audio route as accepted-voice lip sync", async () => {
    const f = await fixture(); f.packet.route.audio_mode = "native_audio"; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("native audio requires separate qualification");
  });
  it("holds unknown jobs and blocks resubmission after transport loss", async () => {
    const f = await fixture(); const submit = vi.fn(async () => { throw new Error("transport lost"); });
    await expect(submitUgcPacket(f.packetPath, submit)).rejects.toThrow("transport lost");
    await expect(submitUgcPacket(f.packetPath, submit)).rejects.toThrow("already recorded or uncertain"); expect(submit).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(`${f.packetPath}.submission.json`, "utf8")).status).toBe("submission_unknown");
  });
  it("serializes same-packet submissions and preserves exact input/job identity", async () => {
    const f = await fixture(); const submit = vi.fn(async (request) => { expect(request).toEqual(f.packet.request); return "fixture-task"; });
    const results = await Promise.allSettled([submitUgcPacket(f.packetPath, submit), submitUgcPacket(f.packetPath, submit)]);
    expect(submit).toHaveBeenCalledTimes(1); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(JSON.parse(await readFile(`${f.packetPath}.submission.json`, "utf8")).task_id).toBe("fixture-task");
  });
  it("handles malformed versions/requests without throwing", async () => {
    const f = await fixture(); f.packet.schema_version = 2; delete f.packet.request; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).ok).toBe(false);
  });
  const V1_TEST_RUN = "fixture-v1-run";
  const v1Options = { v1AllowedRunIdSha256: [sha256(V1_TEST_RUN)] };
  it("valid v1 packet with schema_version 3 rejected for its version alone", async () => {
    const f = await fixture({ version: 1, runId: V1_TEST_RUN });
    expect((await inspectUgcPacket(f.packetPath, v1Options)).errors).toEqual([]);
    f.packet.schema_version = 3; await f.save();
    const result = await inspectUgcPacket(f.packetPath, v1Options);
    expect(result.ok).toBe(false); expect(result.errors).toEqual(["schema_version: only version 2 (or version 1 for an allowlisted run_id) is supported"]);
  });
  it("accepts a v1 packet only for a frozen allowlisted run_id", async () => {
    expect(Object.isFrozen(V1_ALLOWED_RUN_ID_SHA256)).toBe(true);
    const allowed = await fixture({ version: 1, runId: V1_TEST_RUN });
    const ok = await inspectUgcPacket(allowed.packetPath, v1Options);
    expect(ok.errors).toEqual([]); expect(ok.ok).toBe(true); expect(ok.schema_version).toBe(1);
    const other = await fixture({ version: 1, runId: "test-only" });
    const blocked = await inspectUgcPacket(other.packetPath, v1Options);
    expect(blocked.ok).toBe(false); expect(blocked.errors).toEqual([expect.stringContaining("not on the frozen v1 allowlist")]);
  });
  it("ships the v1 allowlist as SHA-256 only, matching the exact run_id", () => {
    expect(V1_ALLOWED_RUN_ID_SHA256.length).toBeGreaterThan(0);
    for (const h of V1_ALLOWED_RUN_ID_SHA256) expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(isV1AllowedRunId(V1_TEST_RUN, [sha256(V1_TEST_RUN)])).toBe(true);
    expect(isV1AllowedRunId(V1_TEST_RUN.toUpperCase(), [sha256(V1_TEST_RUN)])).toBe(false);
    expect(isV1AllowedRunId("", [sha256("")])).toBe(false);
    expect(isV1AllowedRunId(V1_TEST_RUN)).toBe(false);
  });
  it("v1 cannot carry a motion route even when allowlisted", async () => {
    const f = await fixture({ version: 1, runId: V1_TEST_RUN }); f.packet.route.operation = "motion"; f.packet.route.audio_mode = "none"; await f.save();
    expect((await inspectUgcPacket(f.packetPath, v1Options)).errors.join(" ")).toContain("motion requires packet version 2");
  });
  it("v2 without presenter acceptance or prepared_by is blocked", async () => {
    const f = await fixture(); delete f.packet.presenter.acceptance; delete f.packet.prepared_by; await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors.join(" ");
    expect(errors).toContain("presenter.acceptance: required in packet v2"); expect(errors).toContain("prepared_by: packet v2");
  });
  it.each(["fixture-preparer", " FIXTURE-PREPARER "])("v2 rejects self-acceptance when reviewer_id is %j", async reviewer => {
    const f = await fixture(); f.packet.presenter.acceptance.review.reviewer_id = reviewer; await f.save();
    const result = await inspectUgcPacket(f.packetPath);
    expect(result.ok).toBe(false); expect(result.errors).toEqual([expect.stringContaining("reviewer_id must differ from prepared_by")]);
  });
  it("stale look: a new look file without fresh voice acceptance is blocked", async () => {
    const f = await fixture(); const a = f.packet.presenter.acceptance;
    a.look = await f.bind("look.json", { wardrobe: "changed", grade: "fixture" }); a.review.look_sha256 = a.look.sha256; await f.save();
    const result = await inspectUgcPacket(f.packetPath);
    expect(result.ok).toBe(false); expect(result.errors).toEqual(["voice.accepted_bindings.look_sha256: stale or missing"]);
  });
  it("stale look or eye sheet against the acceptance review is blocked", async () => {
    const f = await fixture(); const a = f.packet.presenter.acceptance;
    a.look = await f.bind("look.json", { wardrobe: "changed" }); f.packet.voice.accepted_bindings.look_sha256 = a.look.sha256;
    a.eye_sheet = await f.bind("eye-sheet.json", { frames: "re-shot" }); await f.save();
    const errors = (await inspectUgcPacket(f.packetPath)).errors;
    expect(errors).toEqual(["presenter.acceptance.review.look_sha256: stale or missing", "presenter.acceptance.review.eye_sheet_sha256: stale or missing"]);
  });
  it("edited still bytes after acceptance are blocked", async () => {
    const f = await fixture(); await writeFile(path.join(f.dir, "still.bin"), "edited still");
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("presenter.acceptance.stills.0: stale file hash");
  });
  it("an unreviewed extra still is blocked", async () => {
    const f = await fixture(); f.packet.presenter.acceptance.stills.push(await f.bind("still-2.bin", "second still")); await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors).toEqual(["presenter.acceptance.review.still_sha256s: must list exactly the accepted stills"]);
  });
  it.each(ACCEPTANCE_CRITERIA as readonly string[])("v2 blocks when criterion %s is not true", async criterion => {
    const f = await fixture(); f.packet.presenter.acceptance.criteria[criterion] = false; await f.save();
    const result = await inspectUgcPacket(f.packetPath);
    expect(result.ok).toBe(false); expect(result.errors).toEqual([`presenter.acceptance.criteria.${criterion}: reviewer must record true`]);
    delete f.packet.presenter.acceptance.criteria[criterion]; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).ok).toBe(false);
  });
  it.each(["visual_identity_review", "frames"])("v2 acceptance review method %s is not presenter acceptance", async method => {
    const f = await fixture(); f.packet.presenter.acceptance.review.method = method; await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors.join(" ")).toContain("presenter.acceptance.review: actual presenter_acceptance_review");
  });
  it("v2 acceptance dated in the future is blocked", async () => {
    const f = await fixture(); f.packet.presenter.acceptance.review.reviewed_at = new Date(Date.now() + 86400000).toISOString(); await f.save();
    expect((await inspectUgcPacket(f.packetPath)).errors).toEqual(["presenter.acceptance.review: reviewed_at lies in the future"]);
  });
  async function motionFixture() {
    const f = await fixture();
    const request = { model: "test/image-to-video", input: { image_url: "https://example.test/still", duration: 10 } };
    Object.assign(f.packet.route, { operation: "motion", audio_mode: "none", model: request.model });
    f.packet.request = request; f.packet.request_sha256 = sha256(canonicalJson(request));
    f.packet.input_bindings = [{ role: "identity", source: f.still, upload_receipt: await f.upload("still-upload.json", f.still, request.input.image_url), input_pointer: "/image_url", provider_value: request.input.image_url }];
    delete f.packet.voice; await f.save();
    return f;
  }
  it("motion route is accepted with presenter acceptance and an accepted still", async () => {
    const f = await motionFixture(); const result = await inspectUgcPacket(f.packetPath);
    expect(result.errors).toEqual([]); expect(result.ok).toBe(true); expect(result.operation).toBe("motion");
    expect(result.warnings.join(" ")).toContain("voice, phrase timing and lip sync are not validated");
  });
  it("motion route is blocked without acceptance, from an unaccepted image, or with audio", async () => {
    const noAcceptance = await motionFixture(); delete noAcceptance.packet.presenter.acceptance; await noAcceptance.save();
    expect((await inspectUgcPacket(noAcceptance.packetPath)).errors.join(" ")).toContain("presenter.acceptance: required");
    const other = await motionFixture(); const input = other.packet.input_bindings[0];
    input.source = other.packet.presenter.identity; input.upload_receipt = await other.upload("id-upload.json", input.source, input.provider_value); await other.save();
    expect((await inspectUgcPacket(other.packetPath)).errors).toEqual(["input identity: motion must start from an accepted presenter still"]);
    const audio = await motionFixture(); audio.packet.route.audio_mode = "native_audio"; await audio.save();
    expect((await inspectUgcPacket(audio.packetPath)).errors.join(" ")).toContain("guarded motion is silent");
  });
  it("an operation-scoped caller refuses the other route", async () => {
    const f = await motionFixture();
    expect((await inspectUgcPacket(f.packetPath, { operation: "motion" })).ok).toBe(true);
    expect((await inspectUgcPacket(f.packetPath, { operation: "lip_sync" })).errors.join(" ")).toContain("this path accepts only lip_sync");
    const unknown = await fixture(); unknown.packet.route.operation = "text_to_video"; await unknown.save();
    expect((await inspectUgcPacket(unknown.packetPath)).errors.join(" ")).toContain("route.operation: lip_sync or motion required");
    const submit = vi.fn(async () => "never");
    await expect(submitUgcPacket(f.packetPath, submit, { operation: "lip_sync" })).rejects.toThrow("this path accepts only lip_sync"); expect(submit).not.toHaveBeenCalled();
  });
  it("MCP blocked preflight makes zero paid calls; valid guard submits once with typed output", async () => {
    const f = await fixture(); const createTask = vi.fn(async () => "fixture-task");
    const server = new McpServer({ name: "ugc-test", version: "1" }); const client = new Client({ name: "ugc-test", version: "1" });
    registerKieTools(server, { client: { createTask } as unknown as KieClient, defaultWaitSeconds: 10, downloadDir: null });
    const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
    try {
      const invalid = await client.callTool({ name: "kie_create_ugc_lipsync", arguments: { packetPath: path.join(f.dir, "missing.json") } });
      expect(invalid.isError).toBe(true); expect(createTask).not.toHaveBeenCalled();
      const checked = await client.callTool({ name: "kie_validate_ugc_preproduction", arguments: { packetPath: f.packetPath } });
      expect((checked.structuredContent as Record<string, unknown> | undefined)?.ok).toBe(true); expect(createTask).not.toHaveBeenCalled();
      const result = await client.callTool({ name: "kie_create_ugc_lipsync", arguments: { packetPath: f.packetPath } });
      expect(result.isError).not.toBe(true); expect((result.structuredContent as Record<string, unknown> | undefined)?.taskId).toBe("fixture-task"); expect(createTask).toHaveBeenCalledWith(f.packet.request);
    } finally { await client.close(); await server.close(); }
  });
});
