---
name: ugc-creator-edit
description: Produce or repair creator-led UGC paid-social edits from an approved brief and media library. Reuse accepted assets, control generation credits, refine audio and B-roll, and enforce five evidence-bound presentation gates. Use for UGC production, revisions, or an authorized variant set.
---

# UGC creator editing

Optimize accepted, brief-compliant finished creatives per authorized spend. A low-cost generation that cannot be used is waste. Source clips, proofs and intermediate renders are inventory, not finished ads. Never weaken product truth, intelligibility, test validity or agreed quality to improve the count.

This is a production orchestration skill. It uses existing provider tools or the engine's client; it does not install a provider, implement a server-side spending limit, or grant permission to publish. Keep automatic discovery enabled.

## Load only what the work needs

- When connecting a Metrix brief or using Kie, read the engine's own files rather than a summary of them: `prompts/00-core.md` and `prompts/formats/ugc.md` hold the contracts (descriptive names by default, MST names only inside a live matrix, the brief's hook and CTA verbatim, the same approved subject input across comparisons, an inspectable `render_spec.json` before spend). The recovery ledger records task status and settled credits; it does not enforce a budget. Adding this skill folder does not change MCP prompt assembly, because `src/prompts.ts` imports selected prompt files, not arbitrary skill content. The generating clients are `kie-generate`, `kie-tasks` and `metrix-ad-creative`, which carry the shared `ugc-preflight.mjs`; this skill ships no provider client of its own.
- Read [production direction](references/production-prompt.md) and [finishing standard](references/production-standard.md) when planning or editing footage. Send models only shot-specific instructions, relevant references and supported parameters, not this entire skill.
- Read the bundled [creative direction](references/creative-direction.md) before planning or spending. At planning/review, read only the current stage's details in the bundled [UGC playbook](references/ugc-creative-playbook.md), including its negative-prompt sheet and voice, shot and editor blocks. Reuse relevant instructions already in context; never send the whole playbook to a provider. The references below are its checkable companions and defer to it where they overlap.
- These bundled copies work without the repository or MCP. When their `docs/UGC_CREATIVE_PLAYBOOK.md` or `kie://ugc-creative-playbook` pointer is unavailable, use the bundled playbook; resolve its production/review-standard references through this skill's existing [finishing standard](references/production-standard.md) and [review gates](references/review-gates.md). Keep completed client profiles and receipts in the repository's gitignored `out/` or `renders/`, or an external private run directory. Reusable instructions and committed examples stay anonymous.
- Read [casting](references/casting.md) before generating or replacing a presenter: the speaker's relationship to the message, the portable performer card, the identity and motion inputs a lip-sync pass can use, the voice-and-scene audition, performance proof, and what a replacement keeps (suitable B-roll, graphics, rights) and what it resets (face, lips, voice acceptance). Assigned cast is reused when suitable.
- Read [script and delivery](references/script-and-delivery.md) before writing or voicing a talking-head line. It holds the spoken register, length as a budget, the per-line delivery map (intent, emotion, emphasis, pause, gaze, gesture) and the `scripts/check_script.py` gate that runs before any voice spend.
- Read [preproduction director](references/preproduction-director.md) before new creator performance, changed copy or presenter replacement. It connects the existing script, casting, provider and review records to the versioned offline preflight and guarded lip-sync submission; it does not add a second timeline or a copywriting owner.
- Read [hooks](references/hooks.md) when the brief tests openings or the ad gets impressions without watch time: three-layer hooks, twelve patterns with their nearest `HK_` code for reference, the one-variable hook test and the hook log.
- Read [lip-sync routing](references/lip-sync-routing.md) before a talking-head render: the three routes by input type, dated observations of what worked and what was down, the price-check rule, the outage protocol and input QA.
- Read [mandatory review gates](references/review-gates.md) before preparing any finished UGC/video for client presentation. It defines the five reviews, anonymity, evidence bindings and release check.
- Read [production records and budget checks](references/production-records.md) before paid work or resuming a run. Use its sidecar records alongside the engine's existing artifacts.
- Read [provider operations](references/provider-operations.md) only for the selected provider. Inspect the live tool schema/model page before spending; never treat remembered prices or model IDs as current.

## 1. Bind the job to the brief

Before source search or spend, consult the current private client library and
[library/feedback/storage workflow](references/client-library.md). Refresh current
decisions and rejection windows. At authorized milestones sync reusable assets,
recipes and feedback; approved exports have a separate delivery destination.

Read the actual brief, current asset manifest and latest component feedback. Preserve the user's source hierarchy, copy permissions, voice selection, accepted file hashes, offer and intended action. Do not re-audit an approved strategy or invent missing claims.

The brief fixes medium, placements and deliverable count. Default to one master and one hook only when that is the assignment. An authorized variant set may reuse accepted sources; do not impose a one-ad limit on a larger authorized job. Do not create speculative variants because raw material is available.

For Metrix: retain `brief_id`, `brief_metadata.asset_type`, mode, `copy_architecture`, `visual_direction`, `creative_specifications`, `brand_assets` and `qa_requirements`. Matrix rules apply only to a live matrix. Product references marked missing cannot be replaced by invented products. AI people are scenarios/demonstrations, not fabricated customer testimonials; follow the engine's prohibition on named real people/lookalikes.

## 2. Reuse first; write the shot plan before generating

Inventory suitable accepted footage, product captures, stills, dry voice, stems and editable timelines. Identify exact usable segments, source hashes, rights, clean trim handles, recording/acoustic profile and the viewer question each beat answers.

If the presenter changes, preserve suitable existing B-roll/UI/library originals byte for byte. Reassess old face, speaking mouth, voice and other identity cues rather than carrying their acceptance to the new performer. A generic feature card is not proof of a full captured interaction. Read the source/identity rules in [production-standard.md](references/production-standard.md).

For each gap, state the deliverable/shot it serves, action, framing, continuity inputs, usable duration, acceptance criteria and why an edit or existing asset cannot fill it. No generation without an identified gap. Generate one action per clip when multiple actions would compromise control. Use the shortest supported duration that includes the action and necessary handles, not the shortest regardless of usability.

Produce the existing engine's `render_spec.json` where applicable. Keep additional UGC tracking in `ugc-production.json`; its fields are this skill's sidecar convention, not new engine API parameters.

Keep one approved `script.json` and its complete spoken progression. Link selected hook treatment, actor/voice/scene fit, thought-level intention/emotion/behavior and truthful proof requirements from the preproduction packet. Existing copy owners handle authorized rewriting. Preserve user-locked wording and separate estimates from measured read timing.

## 3. Authorize an affordable path to a finished edit

Record a finite run ceiling and the approved deliverables, provider/account, comparison locks, review gates and finishing allowance. Carry forward existing session authorization. If a ceiling or a material scope choice is missing, prepare the concrete plan and quote before asking once. Available account balance is not authorization to spend it.

Choose the lowest expected total-cost route that meets the requirements, considering reuse, likely usable yield, finishing work and evidence from comparable accepted shots. Do not invent yield probabilities. A premium model needs a specific capability advantage for this shot. Use the approved model within a comparison; do not switch mid-matrix to save credits.

Use exact live quotes or a documented conservative upper bound, tagged with provider, model, complete settings, quantity, source and time. An unknown cost is not zero. Requote when settings, quantity or provider change or when quote validity cannot be established. Account separately for Kie credits, Higgsfield credits, currency-denominated editing/render costs and text-token usage; do not add unlike units.

Before every paid submission, apply the budget check in the records reference: settled spend plus outstanding commitments plus the new request plus reserved completion and repair capacity must fit the authorization. Reserve before submitting, including the whole cost of a batch. One submitting operator owns a run's budget; do not fan out concurrent submissions without a shared reservation mechanism. A skill cannot make an uncoordinated ledger atomic.

Proceed autonomously within the approved scope, ceiling and review gates. Ask again only for a required human quality decision, a material scope/provider change, or spend beyond authorization. Do not add confirmation to every render. Budget and authorization checks also apply to premium single renders, retries, upscales and paid editing.

## 4. Resolve uncertainty with the smallest useful proof

Reuse an approved reference frame rather than generating another still. If composition or identity is uncertain, approve a still before animation. If motion, pacing or lip sync is uncertain, use one short representative motion proof before dependent expensive work. A still is not evidence that motion works; do not require an unnecessary paid proof when accepted material already answers the question.

Approve the complete vocal performance through human listening before lip sync. Preserve the exact approved voice file and dry source; do not substitute an old audition or change its rate to force pacing. Clearly label temporary performances, excerpts and provisional mixes. Reuse a passing proof in the final edit when it fits.

Validate the current packet with `kie_validate_ugc_preproduction` or the existing client `ugc-check` command. The packet is version 2 (version 1 only for a `run_id` on the frozen `V1_ALLOWED_RUN_IDS` list in `ugc-preflight.mjs`). It needs `prepared_by` and `presenter.acceptance`: the exact accepted stills, look and eye sheet bound by hash; the criteria `mood`, `look`, `eyes_open_on_lens` and `expression` each recorded `true`; and a `review` with method `presenter_acceptance_review` whose `reviewer_id` differs from `prepared_by` and whose hashes name those stills, look, eye sheet, identity and scene. This comes before any lip-sync or motion spend. `route.operation` is `lip_sync` (Kie approved-voice lip sync) or, in version 2 only, `motion` (silent Kie image-to-video from one accepted still, `audio_mode` `none`). Then use `kie_create_ugc_lipsync` or client `ugc-start` for guarded approved-audio submission. Bind the exact request and file hashes, required current acceptance, route capabilities and finite budget evidence. Raw `kie_create_task`/`start` are general primitives, not equivalent guarded submissions. Native generated speech requires a separate qualified route; it cannot borrow a standalone voice pass.

For comparative work, reuse the approved subject file and the same approved footage wherever the test holds them constant. Identical words in prompts do not lock pixels. Inspect the actual outputs together before expanding.

## 5. Generate, recover and repair narrowly

Save the submission record and returned job/task IDs immediately. An unknown submission holds its reserved cost. A wait timeout resumes the same job; it never automatically triggers another generation. Recover original jobs and existing downloads before considering replacement. Download successful assets promptly and retain IDs, prompts, parameters, hashes and evidence of cost.

When a defect appears, diagnose it before spending. Prefer a trim, cutaway, caption correction, mix repair or CTA card when these preserve the brief and test. Never regenerate a full master to fix one local defect unless a smaller repair cannot work. Never cover a defective voice with music.

Use a default maximum of two paid repair cycles per affected shot/cell, within the original ceiling and any stricter user limit. This is a ceiling, not an entitlement to two retries. Each needs the defect, the changed input or method, expected correction, quote and pass criterion. No identical-prompt rerolls to taste. Further paid repair requires a revised authorized plan. A shared-base repair does not reset the counters or spend history.

Matrix exception: a repair to a shared base/subject must be applied consistently across the comparison as a new version; patching one cell can invalidate the test. Preserve the old version, quote the whole affected repair, and proceed only within the existing authorization or obtain the changed scope/budget decision. Reuse unchanged accepted components where that preserves validity.

## 6. Edit with purpose and continuity

Keep speech natural. Create pace with shot duration, frame trims, selective silent-footage retiming, relevant B-roll, reframing, reveals and useful holds. Never retime visible lips independently of speech. Record source/output ranges and speed changes.

Use the finishing standard's explicit checks for coherent narration and phrase levels, competing voices, audible subordinate music, a smooth music entrance, product/spoken synchronization, clean UI/composite handoffs and believable gaze/action. Bind the accepted treatment reference and its engine-wide, brand/project or run-specific scope. Choose proof handling for the actual format; no screenshot-slideshow default, fixed gain/fade, motion quota or inherited layout template governs every brief.

Assign an acoustic profile to each visible speaking setting. Carry the active profile through offscreen narration, screens and CTA; change it only when the creator is visibly established speaking in another setting. Preserve word tails, compatible level and room decay. A crop or B-roll change is not a new recording event.

For captions, motion graphics, grades and finishing passes, use the HyperFrames layer described in `metrix-video-assembly` ("HyperFrames layer"): word-timed captions come from the accepted voice's checked phrase map, so they follow the speaker's real pauses, and every export passes both `hyperframes check` and `qa-video.mjs`. Its `hyperframes-registry` and `media-use` skills supply the blocks and looks; they do not change the authenticity rules here (natural speech, no retimed lips, one acoustic profile per setting).

Apply restraint: an effect needs a specific viewer benefit and a cost-aware way to achieve it. Prefer existing edit capabilities before paid motion generation. No mandatory effect quota, artificial errors or trend decoration. Interface-animation frequency thresholds and millisecond budgets do not govern ad footage.

For selected effects, specify timecode, purpose, properties/transition, duration in frames or seconds, source and cost. Reject effects that obscure evidence, reduce caption readability, break recording continuity or add spend without a brief-specific benefit. Do not claim an effect is viral or improves conversion without evidence. Keep trend references and commercial-use rights specific to the intended platform.

## 7. Complete the five presentation gates

Every finished creator-led UGC/video candidate must pass all five reviews: **IAP variable validation, communications effectiveness, the 12-Year-Old Sound Check, editorial peer review, and blind review**. Use the exact checks and evidence contract in [review-gates.md](references/review-gates.md). Technical media variables and IAP registry codes are separate checks; neither can substitute for the other.

Bind every verdict to the current export and its brief, script, voice, captions, edit decisions, source map, delivery profile and registry snapshot. Run `scripts/validate_review_gates.py` on `production-review.json` before client-ready presentation. Missing, pending, failed, unavailable or stale evidence blocks release. A successful render or technical/frame check cannot satisfy actual listening, editorial independence or a blind assessment.

Use a separate editorial reviewer and a fresh blind reviewer without production history or prior verdicts. Identify humans, audio-capable agents, text/frame reviewers and automated checks honestly. The Sound Check is an independent plain-language comprehension test, not a claim that a child listened or that one reviewer proves universal accessibility. A same-history subagent is not blind.

Keep reusable procedures, templates, test fixtures and shared learning anonymous across clients, brands, industries and niches. Necessary private production bindings stay in the run. Blind review hides production provenance; disclose any identity cues that remain in the creative itself. Never remove legitimate offer facts merely to pretend full anonymity.

Continue authorized independent work while a review is pending. Keep unfinished candidates internal and clearly marked; do not present them as approved work or use a client-facing preview to bypass a gate. Route missing internal review to the appropriate reviewer without adding routine user permission requests. A required human review that cannot be performed remains pending.

Calibrate reviewer capabilities against actual full-media access before assigning a gate. A scoped user deferral records the exact gate, candidate, authority and expiry/resume condition as deferred/NOT REVIEWED; it is neither PASS nor removal of the reusable review contract. Preserve authorized internal progress without claiming approved release.

### Review the actual result

Assemble a rough cut, reassess it as a skeptical viewer, then refine identified weaknesses. Keep a short decision/defect log. Track raw voice, acoustics, mix, picture, visible sync, CTA and placement as separate decisions tied to exact files. Preserve unrelated accepted work; reopen only decisions affected by a reported defect.

Check brief alignment, exact in-frame hook/CTA text, required placements, product fidelity and comparison validity. Inspect every cut, visible mouth span, silent span and CTA tail. Human review includes raw voice and final mix listening, full normal-speed playback, muted phone-size viewing and placement context. General praise and technical checks cannot fabricate component acceptance. If a required human check is pending, deliver a clearly marked review cut and complete independent work; do not claim final acceptance.

Deliver the approved master(s), editable recipe/timeline and recoverable stems, an asset map, validation report, and cost reconciliation.

Before authorized removal of superseded drafts, verify a recovery manifest/archive, critical-source hashes, editable relinking and sufficient workspace capacity. Preserve accepted originals, rights, stems, job/cost ledgers and reviews. Record incomplete or inaccessible recovery material; do not turn provider-job recovery into a claim of a complete production archive.

The execution table is:

`Timecode | Viewer purpose | Visual/action/framing | Source hash/ranges | Output ranges/speed | On-camera/acoustic profile | Transition/GFX | Music/ambience/SFX cue and rights | Acceptance evidence`

Name actual tools and rights, or `None`; never imply CapCut/After Effects or a paid preset was used when it was not. State unresolved limitations, the next required review, actual incremental spend and pending/unreported charges. Report finished ads separately from variants, placement exports, source clips and proofs. Use the metric definitions in the records reference so extra files cannot inflate output per credit.
