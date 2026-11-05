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
import { canonicalJson, inspectUgcPacket, sha256, submitUgcPacket } from "../../skills/metrix-ad-creative/scripts/ugc-preflight.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() {
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
  const packet: any = {
    schema_version: 1, run_id: "test-only", brief_id: "anonymous-test", brief, script,
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
  const packetPath = path.join(dir, "packet.json");
  const save = async () => writeFile(packetPath, JSON.stringify(packet));
  await save();
  return { dir, packet, packetPath, save, bind, review, upload };
}

describe("UGC preproduction dependency guard", () => {
  it("accepts current synthetic records while explicitly refusing to certify listening", async () => {
    const f = await fixture(); const result = await inspectUgcPacket(f.packetPath);
    expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("cannot prove human listening");
  });
  it.each(["script_sha256", "identity_sha256", "voice_settings_sha256", "scene_sha256", "audio_sha256"])("rejects stale full-read %s", async key => {
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
