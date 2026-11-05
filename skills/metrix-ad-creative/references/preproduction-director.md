# UGC preproduction director and guarded lip sync

This is the implemented agent-side bridge from approved creative decisions to the existing generation and assembly workflow. It consumes the current brief, canonical script, casting/scene evidence and accepted sources. It does not create another strategy, copywriting system, timeline or final-review gate.

Use this reference for new creator performance, changed spoken copy or presenter replacement. Existing copy owners handle authorized drafting and substantive rewriting. The brief owns audience, argument, claims, exact copy permissions and IAP codes. The current project reference owns its UI arrangement, cast and numerical mix choices.

## 1. Direct the whole argument

Write the complete spoken progression before splitting shots. Keep the one canonical `script.json` v1 delivery map described by the available UGC skill's `script-and-delivery.md`. Its ordered line text must reproduce the brief's complete approved `copy_architecture.spoken_script`. Preserve locked words, case and punctuation; provider synthesis aliases do not authorize changing the approved human-readable claim.

For each line retain existing intent, emotion, intensity, emphasis/pause, gaze and gesture. The guarded preflight additionally requires `viewer_thought`, `emotion_entry`, `emotion_exit` and `observable_behavior`. These describe what the speaker wants the viewer to understand, the thought's affective transition and a small plausible vocal/physical cue. Neutral or unchanged affect and no gesture are valid. These are direction, not observations or model API parameters.

Record the selected hook treatment with its line ID, rationale, first frame and body payoff. Create candidate wording only when authorized. Log relevance, support, speaker credibility, visual feasibility and reasons for selection; editorial scores are not predicted performance. A long locked opener can earn attention early and finish naturally. No fixed three-second complete-line rule or speech speed-up overrides it.

## 2. Bind fit, proof and the actual full voice

Use the available UGC skill's `casting.md` for a credible speaker relationship and actual identity/voice/scene fit. Reference current identity, voice/settings and scene files by exact hashes. The scene records wardrobe, framing, microphone distance, acoustics, gaze and practical hand/prop limits. A changed presenter requires fresh performer acceptance; unchanged suitable B-roll/UI originals and rights can remain.

Actual full-read audio establishes measured duration and phrase ranges. Bind its human listening acceptance to that exact script, identity, voice/settings, scene and master audio. A preview, ASR transcript or contact sheet cannot accept whole-read naturalness. An accepted component still needs final integration review. A local checker can verify that an evidence record exists and matches the current bindings; it cannot verify the person's perception.

Link each proof requirement to its source, what it demonstrates, limits and rights. A screenshot is an illustration of its visible state. Only an actual captured interaction can satisfy an interaction requirement. Deliberate real capture, faithful layers/compositing, annotation, movement or a purposeful still are valid treatments; there is no global screenshot-card geometry or motion quota.

## 3. Private versioned packet

Keep the packet and completed evidence in the ignored/private run directory. File bindings use `{ "path": "...", "sha256": "..." }`, with paths relative to the packet (absolute paths also resolve locally) and lowercase SHA256 of actual file bytes. Do not put credentials or secret-bearing URLs into shared reports. The implementation is `skills/metrix-ad-creative/scripts/ugc-preflight.mjs`, distributed with the existing clients. The repository's `examples/ugc-production/preproduction.example.json` is an incomplete anonymous template, never a review, quote or submit-ready packet. Script planning/checks happen before voice generation; the complete packet is required only before dependent lip sync, once actual voice acceptance can exist.

| Packet group | Implemented contract |
| --- | --- |
| `schema_version`, `run_id`, `brief_id` | Version 1 and stable IDs; the brief and script IDs must agree. |
| `brief`, `script` | Exact JSON file bindings. Complete approved spoken text and locked opening must match ordered canonical lines. |
| `hook` | `line_id` for the first line plus `rationale`, `first_frame`, `payoff`. |
| `claims` | Exactly one decision per line: `supported` with evidence file, or `not_a_claim`, each with rationale. Unknown/unsupported outcomes cannot become ready by omission. |
| `presenter` | `identity`, `voice_settings`, `scene` bindings, `fit_rationale` and accepted `visual_identity_review` bound to those hashes. |
| `voice` | Accepted `master` binding, measured `duration_seconds`, ordered `phrases` with every line's actual start/end, `human_full_listen` review and exact `accepted_bindings`. |
| `proofs` | Line ID, `requirement` (`illustration` or `interaction`), source `kind`, binding, `demonstrates`, `limits` and `rights`. Lines marked `proof_required` need a matching proof. |
| `retained_assets` | Source binding, `rights`, `reuse_scope`. Presenter replacement does not discard these unchanged source bindings. |
| `route` | Kie `approved_voice` / `lip_sync`, model, current `checked_at`/`valid_until`, schema evidence, supported/required controls and requested/supported duration. |
| `request`, `request_sha256` | Exact provider `model`/`input` request and SHA256 of the helper's recursively key-sorted `canonicalJson` serialization. No sidecar metadata is sent as model input. |
| `input_bindings` | Exactly one voice and identity role, local source, JSON upload receipt, provider value and JSON Pointer into actual request input. Voice binds accepted master and source range; a derived segment needs `human_segment_listen` tied to segment/master hashes and start/end. A derived visual base needs `visual_derivative_review` tied to source, canonical identity and scene hashes. |
| `budget` | Authorization reference, provider/account/unit, finite ceiling, settled/pending/request upper bound/finishing/repair figures and current quote evidence/expiry. |

Reviews carry accepted status, reviewer identity, method, review time and exact evidence file/hash. Preserve precise scope and limitations in the evidence itself. The validator consumes declared facts and bindings, not a model's assertion that it listened. The packet is a local orchestration contract, not a new brief/provider API schema.

The route contract must describe the actual selected operation. Unsupported requested controls, expired compatibility/quote evidence, changed input hashes or incompatible duration block this guarded submission. Upload receipts preserve local provenance; the guard cannot prove that a remote asset's bytes still match or that the account has a feature. Check actual provider responses and capability documentation separately.

Each upload receipt is actual JSON with `provider: "kie"`, `source_sha256`,
the exact current `provider_value` and future `valid_until`. The client command
`upload <file> --receipt <private.json>` records the uploaded source hash and
returned URL/value. It records provider expiry when returned, otherwise null.
An unknown expiry stays unverified until current authoritative operation
evidence establishes validity; do not invent a future timestamp to clear the
guard. The guard matches receipt URL/value, source hash and expiry; it cannot
prove remote content fidelity. Refresh expired transport with the same accepted
source rather than regenerating content.

## 4. Validate offline, then submit once

MCP:

- `kie_validate_ugc_preproduction { packetPath, observedDurationSeconds? }`: read-only local validation; no credits or provider calls.
- `kie_create_ugc_lipsync { packetPath }`: revalidates and submits only the packet's exact request through Kie, with an exclusive per-packet recovery receipt.

Existing client equivalents:

```text
node skills/metrix-ad-creative/scripts/kie.mjs ugc-check <run>/ugc-preproduction.json
node skills/metrix-ad-creative/scripts/kie.mjs ugc-check <run>/ugc-preproduction.json --observed-duration <returned-seconds>
node skills/metrix-ad-creative/scripts/kie.mjs ugc-start <run>/ugc-preproduction.json
```

Use the same actual packet path when resuming. The companion `<packet>.submission.json` holds an unknown or submitted job. Recover its existing job/receipt before any replacement. Do not remove or rename a receipt, clone the packet or switch to raw `start`/`kie_create_task` to evade a blocked or uncertain operation. Per-packet exclusion is not provider idempotency or an account-wide spending lock; keep one submitting operator and the existing budget/job ledgers.

Pass returned duration to offline validation before dependent assembly. A duration adjustment requires a deliberate replan of full speech coverage, handles, captions and reading holds; do not silently trim a word or stretch speech. Keep the actual returned media and relevant task IDs.

Raw task tools remain general generation primitives and do not automatically apply this creator guard. For creator dependent lip sync, use the guarded path. Guarded validation is not a provider capability test, perceptual approval or release certification.

## 5. Native audio and final handoff

The implemented guard accepts only approved-full-voice Kie lip sync. A native-audio model owns speech with its video and requires a separately qualified exact-speech/identity/performance contract. It cannot inherit an unrelated TTS preview's pass or bypass a current full-voice-before-lip-sync requirement. Resolve architecture explicitly before spending.

Keep `ugc-production.json` as the run/asset/job context and `storyboard.json` as the sole composition timeline. Link script lines, shot IDs, proof sources and measured ranges there; creator/UI/B-roll classifications do not invent new storyboard role values. Preserve accepted master audio once in assembly and retain editable recipe, sources, stems, rights and recovery records.

New creator runs set `creator_preproduction_required: true` in the bound profile. In the final review record, `production.preproduction` is one `{path, sha256}` descriptor or a nonempty array of such descriptors, listing every actual operation packet directly. Do not bind only a manifest that refers to packets: the final validator rehashes the listed packets, not a manifest's indirect contents. Their descriptors enter review context; Python does not rerun Node preflight or recursively check nested sources. Rerun offline preflight on each current packet before final review. Allowed artifact roles remain unchanged; do not add a `performance` role. The five reviews still judge the exact export through actual media access. Missing listening, rejected components or stale dependencies remain unresolved while independent work continues. No machine preflight promises flawless UGC or conversion lift.
