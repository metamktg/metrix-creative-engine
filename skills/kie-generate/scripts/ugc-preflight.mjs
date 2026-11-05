/** Local UGC dependency checks. These validate records, never acting or listening.
 * All file paths resolve relative to the private packet. No network calls.
 * Generic provider tools deliberately remain raw; only the guarded route uses this.
 */
import { createHash } from 'node:crypto';
import { readFile, open, rename } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const filled = v => typeof v === 'string' && v.trim().length > 0;
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const speechText = v => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
const dateValue = v => filled(v) ? Date.parse(v) : NaN;
const at = (root, pointer) => {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || /~(?:[^01]|$)/.test(pointer)) return undefined;
  return pointer.slice(1).split('/').reduce((v, k) => {
    const key = k.replace(/~1/g, '/').replace(/~0/g, '~');
    return v !== null && typeof v === 'object' && Object.hasOwn(v, key) ? v[key] : undefined;
  }, root);
};

/** Return only ok/errors/warnings to a public caller. packet/request stay private. */
export async function inspectUgcPacket(packetPath, options = {}) {
  const errors = [], warnings = ['Record validation cannot prove human listening, performance quality, remote upload fidelity or final release.'];
  let packet;
  try { packet = JSON.parse(await readFile(packetPath, 'utf8')); }
  catch { return { ok: false, errors: ['packet: unreadable or invalid JSON'], warnings }; }
  const base = path.dirname(path.resolve(packetPath));
  const need = (ok, label) => { if (!ok) errors.push(label); };
  const file = async (binding, label) => {
    if (!object(binding) || !filled(binding.path) || !hash(binding.sha256)) {
      errors.push(`${label}: requires path and lowercase SHA256`); return null;
    }
    try {
      const bytes = await readFile(path.resolve(base, binding.path));
      if (sha256(bytes) !== binding.sha256) { errors.push(`${label}: stale file hash`); return null; }
      return bytes;
    } catch { errors.push(`${label}: file unavailable`); return null; }
  };
  const json = async (binding, label) => {
    const bytes = await file(binding, label);
    if (!bytes) return null;
    try { return JSON.parse(bytes.toString('utf8')); }
    catch { errors.push(`${label}: invalid JSON`); return null; }
  };
  const review = async (r, label, method) => {
    need(object(r) && r.status === 'accepted', `${label}: acceptance missing, rejected, unavailable or stale`);
    need(filled(r?.reviewer_id) && r?.method === method && filled(r?.reviewed_at) && Number.isFinite(Date.parse(r.reviewed_at)), `${label}: actual ${method} reviewer/time required`);
    await file(r?.evidence, `${label}.evidence`);
  };
  if (!object(packet)) return { ok: false, errors: ['packet: expected object'], warnings };
  need(packet.schema_version === 1, 'schema_version: only version 1 is supported');
  need(filled(packet.run_id) && filled(packet.brief_id), 'run_id and brief_id required');
  const brief = await json(packet.brief, 'brief');
  const script = await json(packet.script, 'script');
  need(script?.schema_version === 1 && script?.brief_id === packet.brief_id, 'script: version/brief binding differs');
  need(brief?.brief_metadata?.brief_id === packet.brief_id, 'brief: brief_id differs');
  need(['ugc', 'ai_ugc', 'video'].includes(brief?.brief_metadata?.asset_type), 'brief: approved creator-motion asset_type required; use existing brief intake first');
  const lines = Array.isArray(script?.lines) ? script.lines : [];
  const ids = lines.map(l => l?.id);
  need(lines.length > 0 && ids.every(filled) && new Set(ids).size === ids.length, 'script.lines: nonempty unique IDs required');
  need(lines.every(l => filled(l?.text)), 'script.lines: exact spoken text required');
  const spoken = lines.map(l => l?.text ?? '').join(' ');
  need(filled(brief?.copy_architecture?.spoken_script) && speechText(spoken) === speechText(brief.copy_architecture.spoken_script), 'script: complete approved spoken_script must match exactly (case, punctuation and words; whitespace joining only)');
  if (filled(brief?.copy_architecture?.spoken_opening_locked)) {
    need(speechText(lines[0]?.text) === speechText(brief.copy_architecture.spoken_opening_locked), 'hook: locked opening differs');
  }
  for (const l of lines) {
    need(['intent', 'emotion', 'gaze', 'gesture', 'viewer_thought', 'emotion_entry', 'emotion_exit', 'observable_behavior'].every(k => filled(l?.[k])), `line ${l?.id}: thought/performance direction incomplete`);
    need(Number.isInteger(l?.intensity) && l.intensity >= 1 && l.intensity <= 3, `line ${l?.id}: intensity must be 1..3 direction, not a quality score`);
    if (l?.locked && filled(l.lock_source)) {
      const approved = at(brief, '/' + String(l.lock_source ?? '').split('.').join('/'));
      need(filled(approved) && speechText(l.text) === speechText(approved), `line ${l?.id}: exact lock_source differs or is unavailable`);
    }
  }
  const hook = packet.hook;
  need(hook?.line_id === ids[0] && ['rationale', 'first_frame', 'payoff'].every(k => filled(hook?.[k])), 'hook: rationale/first_frame/payoff and first line binding required');
  const claims = Array.isArray(packet.claims) ? packet.claims : [];
  need(claims.length === lines.length && new Set(claims.map(c => c?.line_id)).size === lines.length, 'claims: exactly one decision for each script line required');
  for (const c of claims) {
    need(ids.includes(c?.line_id) && ['supported', 'not_a_claim'].includes(c?.status), `claim ${c?.line_id}: unresolved or unsupported`);
    need(filled(c?.rationale), `claim ${c?.line_id}: decision rationale required`);
    if (c?.status === 'supported') await file(c.evidence, `claim ${c.line_id}.evidence`);
  }
  const presenter = packet.presenter;
  await file(presenter?.identity, 'presenter.identity');
  await file(presenter?.voice_settings, 'presenter.voice_settings');
  await file(presenter?.scene, 'presenter.scene');
  need(filled(presenter?.fit_rationale), 'presenter: actual role/voice/scene fit rationale required');
  await review(presenter?.review, 'presenter.review', 'visual_identity_review');
  for (const key of ['identity', 'voice_settings', 'scene']) {
    need(hash(presenter?.[key]?.sha256) && presenter?.review?.[`${key}_sha256`] === presenter[key].sha256, `presenter.review.${key}_sha256: stale fit decision`);
  }
  const voice = packet.voice;
  await file(voice?.master, 'voice.master');
  await review(voice?.review, 'voice.review', 'human_full_listen');
  const expectedBindings = {
    script_sha256: packet.script?.sha256, identity_sha256: presenter?.identity?.sha256,
    voice_settings_sha256: presenter?.voice_settings?.sha256, scene_sha256: presenter?.scene?.sha256,
    audio_sha256: voice?.master?.sha256,
  };
  for (const [key, value] of Object.entries(expectedBindings)) {
    need(hash(value) && voice?.accepted_bindings?.[key] === value, `voice.accepted_bindings.${key}: stale or missing`);
  }
  need(finite(voice?.duration_seconds) && voice.duration_seconds > 0, 'voice: measured full-read duration required');
  const phrases = Array.isArray(voice?.phrases) ? voice.phrases : [];
  need(phrases.length === lines.length, 'voice.phrases: actual timing for every line required');
  let end = 0;
  for (const [i, p] of phrases.entries()) {
    need(p?.line_id === ids[i] && finite(p?.start) && finite(p?.end) && p.start >= end && p.end > p.start && p.end <= voice?.duration_seconds, `voice.phrases.${i}: missing, reordered or invalid actual timing`);
    end = p?.end;
  }
  const proofs = Array.isArray(packet.proofs) ? packet.proofs : [];
  for (const p of proofs) {
    need(ids.includes(p?.line_id) && ['illustration', 'interaction'].includes(p?.requirement), 'proof: line/requirement invalid');
    need(['screenshot', 'interaction_capture', 'broll', 'document'].includes(p?.kind), 'proof: unknown source kind');
    need(p?.requirement !== 'interaction' || p?.kind === 'interaction_capture', `proof ${p?.line_id}: screenshot/illustration cannot prove interaction`);
    need(filled(p?.demonstrates) && filled(p?.limits) && filled(p?.rights), `proof ${p?.line_id}: truth limits/rights required`);
    await file(p?.source, `proof ${p?.line_id}.source`);
  }
  for (const l of lines) {
    if (l?.proof_required) need(proofs.some(p => p?.line_id === l.id), `line ${l.id}: required proof missing`);
  }
  for (const asset of Array.isArray(packet.retained_assets) ? packet.retained_assets : []) {
    await file(asset?.source, 'retained_asset');
    need(filled(asset?.rights) && filled(asset?.reuse_scope), 'retained_asset: rights/reuse scope required');
  }
  const route = packet.route;
  const now = options.now ?? Date.now();
  need(route?.provider === 'kie' && route?.audio_mode === 'approved_voice' && route?.operation === 'lip_sync', 'route: guarded submit only supports Kie approved-voice lip sync; native audio requires separate qualification');
  need(filled(route?.model) && route?.model === packet.request?.model && object(packet.request?.input), 'request: model/input must match active route');
  need(Number.isFinite(dateValue(route?.checked_at)) && dateValue(route.checked_at) <= now && Number.isFinite(dateValue(route?.valid_until)) && dateValue(route.valid_until) > now, 'route: current checked_at/valid_until required');
  await file(route?.schema_evidence, 'route.schema_evidence');
  const supported = route?.supported_controls, required = route?.required_controls;
  need(Array.isArray(supported) && Array.isArray(required) && required.every(c => filled(c) && supported.includes(c)), 'route: unsupported or unverified requested control');
  need(object(packet.request) && hash(packet.request_sha256) && packet.request_sha256 === sha256(canonicalJson(packet.request)), 'request_sha256: changed request or missing canonical digest');
  const seconds = route?.requested_duration_seconds;
  need(finite(seconds) && seconds > 0 && Array.isArray(route?.supported_durations_seconds) && route.supported_durations_seconds.includes(seconds), 'route: unsupported duration; explicitly replan any rounding');
  if (filled(route?.duration_input_pointer)) need(Number(at(packet.request?.input, route.duration_input_pointer)) === seconds, 'route: requested duration differs from actual input');
  if (options.observedDurationSeconds !== undefined) need(options.observedDurationSeconds === seconds, 'result: returned duration differs; replan timing/captions before dependent work');
  const inputs = Array.isArray(packet.input_bindings) ? packet.input_bindings : [];
  need(inputs.length === 2 && inputs.filter(i => i?.role === 'voice').length === 1 && inputs.filter(i => i?.role === 'identity').length === 1 && new Set(inputs.map(i => i?.input_pointer)).size === 2, 'input_bindings: one exact voice and identity input with distinct pointers required');
  for (const input of inputs) {
    await file(input?.source, `input ${input?.role}.source`);
    const upload = await json(input?.upload_receipt, `input ${input?.role}.upload_receipt`);
    need(upload?.provider === 'kie' && upload?.source_sha256 === input?.source?.sha256 && upload?.provider_value === input?.provider_value && dateValue(upload?.valid_until) > now, `input ${input?.role}: upload receipt source/value expired, stale or unverified`);
    need(filled(input?.provider_value) && at(packet.request?.input, input?.input_pointer) === input.provider_value, `input ${input?.role}: provider value/pointer differs`);
    if (input?.role === 'identity' && input?.source?.sha256 !== presenter?.identity?.sha256) {
      await review(input?.review, 'input identity derivative review', 'visual_derivative_review');
      need(input?.review?.source_sha256 === input?.source?.sha256 && input?.review?.identity_sha256 === presenter?.identity?.sha256 && input?.review?.scene_sha256 === presenter?.scene?.sha256, 'input identity derivative review: stale source/identity/scene binding');
    }
    if (input?.role === 'voice') {
      need(input?.master_sha256 === voice?.master?.sha256, 'input voice: accepted master binding differs');
      need(finite(input?.start_seconds) && finite(input?.end_seconds) && input.start_seconds >= 0 && input.end_seconds > input.start_seconds && input.end_seconds <= voice?.duration_seconds && input.end_seconds - input.start_seconds <= seconds, 'input voice: source range exceeds actual master or planned output');
      if (input?.source?.sha256 !== voice?.master?.sha256) {
        await review(input?.review, 'input voice segment review', 'human_segment_listen');
        need(input?.review?.segment_sha256 === input?.source?.sha256 && input?.review?.master_sha256 === voice?.master?.sha256 && input?.review?.start_seconds === input?.start_seconds && input?.review?.end_seconds === input?.end_seconds, 'input voice segment review: stale segment/master/range binding');
      }
      else need(input.start_seconds === 0 && input.end_seconds === voice?.duration_seconds, 'input voice: full master input requires full range');
    }
  }
  const b = packet.budget;
  const fields = ['ceiling', 'settled', 'pending', 'request_upper_bound', 'finish_reserve', 'repair_reserve'];
  need(filled(b?.authorization_ref) && filled(b?.unit) && filled(b?.account) && b?.provider === route?.provider && fields.every(k => finite(b?.[k]) && b[k] >= 0), 'budget: finite authorized same-provider/account/unit completion plan required');
  need(fields.slice(1).every(k => finite(b?.[k])) && fields.slice(1).reduce((sum, k) => sum + b[k], 0) <= b?.ceiling, 'budget: settled + pending + request + finish + repair exceeds ceiling');
  need(Number.isFinite(dateValue(b?.quote_valid_until)) && dateValue(b.quote_valid_until) > now, 'budget: current conservative quote bound required');
  await file(b?.quote_evidence, 'budget.quote_evidence');
  return { ok: errors.length === 0, errors, warnings, packet, request: packet.request };
}

/** Per-packet exclusive receipt. An uncertain call is held, never auto-retried.
 * This is not an account-wide budget lock or provider idempotency guarantee.
 */
export async function submitUgcPacket(packetPath, submit) {
  const result = await inspectUgcPacket(packetPath);
  if (!result.ok) throw new Error(`UGC preflight blocked:\n${result.errors.join('\n')}`);
  const receiptPath = path.resolve(`${packetPath}.submission.json`);
  let handle;
  try { handle = await open(receiptPath, 'wx'); }
  catch (e) {
    if (e.code === 'EEXIST') throw new Error('UGC submission already recorded or uncertain. Recover its receipt/job before any replacement.');
    throw e;
  }
  const receipt = { schema_version: 1, request_sha256: result.packet.request_sha256, run_id: result.packet.run_id, status: 'submission_unknown', created_at: new Date().toISOString() };
  try { await handle.writeFile(JSON.stringify(receipt, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  // Never release an unknown receipt after a provider/transport failure.
  const taskId = await submit(result.request);
  if (!filled(taskId)) throw new Error('Provider returned no valid taskId. Submission remains uncertain; reconcile before replacement.');
  const settled = { ...receipt, status: 'submitted', task_id: taskId };
  const temporary = `${receiptPath}.tmp`;
  try { await import('node:fs/promises').then(fs => fs.writeFile(temporary, JSON.stringify(settled, null, 2))); await rename(temporary, receiptPath); }
  catch { return { taskId, model: result.request.model, receiptPath, warning: 'Task created, but receipt update failed. Preserve this taskId; the receipt remains held.' }; }
  return { taskId, model: result.request.model, receiptPath };
}
