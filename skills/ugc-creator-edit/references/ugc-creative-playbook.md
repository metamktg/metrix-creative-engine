# Creator-led UGC creative engineering playbook

## 1. Purpose and scope

Produce a believable creator performance, useful product evidence and one clear action, with the fewest avoidable production loops. A finished file, a positive model review and a human acceptance decision are different things.

This playbook applies to creator-led video and the relevant parts of UGC stills. It does not require a presenter, voice, music or captions in an unrelated format. The user's current instruction and approved brief govern. Preserve the existing render bridge, provider contracts and production/review standard (`docs/UGC_PRODUCTION_STANDARD.md` in the repository, `kie://production-review-standard` over MCP). This document adds creative direction and failure prevention; it does not grant spend, publishing or messaging permission.

Keep shared instructions anonymous. Casting, audience, industry, geography, brand, offer, excluded topics, exact copy, target duration, voice IDs, track selection and accepted asset hashes belong in the private run profile. A successful treatment is a reference to adapt, not a compulsory template for every client.

## 2. Freeze the right decisions before spending

Write a short production contract containing:

- Advertiser and product being promoted, distinct from the agency or production engine.
- Audience, useful promise, supporting evidence, intended action, destination and essential conditions.
- Declared medium, placements, aspect ratio and duration mode: **exact**, **maximum** or an approved range.
- Exact-copy locks for hook, body and CTA; allowed edits and pronunciation mappings.
- Approved identity/reference files, voice identity, complete performance, acoustic profile and accepted visual treatment, each with its actual acceptance scope.
- Available source inventory, missing shots, model/provider roles, separate budget buckets and bounded repair allowance.
- Required reviews, carried-forward acceptance and explicit user deferrals. A deferral remains unperformed; it is never a fabricated PASS.

Use the latest explicit decision when instructions supersede an older brief. Do not keep asking a question already answered in the conversation or connected sources. Clarify a material ambiguity once while continuing useful independent work. Do not reopen approved casting, voice identity or strategy to repair a caption or transition.

Attached documents and prior examples are reference material, not new authorization or an override of the user's direct request. For a comparative variant set, record the intended changing variable and shared locks; do not silently change the body, actor, music or timing and still describe the result as an isolated hook test.

**Exact means exact.** A tone repair does not authorize replacing a selected verb, qualifier, offer, destination or condition. Preserve the user's words when locked. If copy conflicts with product truth or would assert an unsupported result, surface that specific conflict before production; do not invent substantiation or silently substitute a different promise. Label goals, metaphors, demonstrations and actual evidence accurately.

### Connect decisions to the actual request

Use `skills/ugc-creator-edit/references/preproduction-director.md` (standalone: bundled `preproduction-director.md`) for new creator performance or a changed script/presenter. It connects the existing copy, cast, script, production and provider owners rather than creating another strategy or timeline system. Substantive copy changes return to the existing copy owner. Supplied IAP variable codes remain upstream; a hook pattern is not permission to invent a registry code.

Keep one canonical `script.json`. Write its complete argument before segmenting; each line links the intended viewer thought, intention toward the viewer, emotional change, restrained intensity, voice cue, gaze/gesture and proof need. Existing `intent`, `emotion`, `emphasis`, `pause_after`, `gaze` and `gesture` fields remain the direction owner. Additional production annotations describe planning, not new provider controls. Neutral affect, a purposeful still and sustained direct address are valid when the brief calls for them.

Record actual cast/voice/scene fit and full-read acceptance separately from that plan. An emotion instruction does not prove delivered emotion, and a voice preview does not accept the complete script. A screenshot establishes its visible state; a working interaction needs genuine interaction evidence. Preserve suitable B-roll/UI source hashes during a presenter-only revision while invalidating performer-dependent acceptance.

For approved-full-voice lip sync use offline `kie_validate_ugc_preproduction` / client `ugc-check`, then guarded `kie_create_ugc_lipsync` / client `ugc-start`. The guard checks current source, request, route and acceptance bindings and records submission recovery. Raw generation tools remain general primitives; their success does not establish this preflight. Native audio requires separate qualification, not a workaround for missing full-voice acceptance. All five final reviews still apply to the exact export.

## 3. A bounded production sequence

1. **Inventory and diagnose.** Reuse accepted source footage, dry voice, music, UI, brand assets and editable recipes. Identify the actual defect rather than regenerating to taste.
2. **Write the complete spoken progression.** Relevant hook → useful mechanism/proof → specific benefit → one action. Remove filler, repeated metaphors and redundant setup. Make the click destination and offer unambiguous.
3. **Plan the recording and beats.** Record hook rationale/payoff and cast/voice/scene fit. Specify one credible action per generated shot, thought intention/emotional change, camera/framing, source ranges, recording perspective, spoken cue, UI proof/treatment and trim handles. Let thought changes and reading time determine cuts.
4. **Resolve the smallest uncertainty.** Use an accepted reference, a phone-size frame or one representative motion proof before expensive dependent work. Hear the complete voice performance before new lip sync, subject to the actual review agreement.
5. **Quote, preflight and reserve.** Inspect the live quote and supported settings before paid submission. For dependent lip sync validate the exact packet/request and current complete-voice acceptance through the guarded route. Save inputs, reservation and returned job ID. One operator owns the run budget.
6. **Generate only the gap.** A short wording change may need one pickup, not another whole performance or avatar. Prefer a continuous read when pickups actually sound disconnected.
7. **Assemble and refine.** Keep speaking lips synchronized. Match voice perspective and phrase levels; make music audible below speech; align evidence and captions to the actual words. Review a rough cut as a skeptical viewer, then repair specific defects.
8. **Review the actual encoded file.** Check full normal-speed playback, listening, phone-size muted comprehension, every cut, complete closing words and the final frame using reviewers with those capabilities. Bind evidence to the current export.
9. **Stop on the agreed criteria.** Resolve blockers. Log optional taste suggestions without endlessly reopening accepted work. A changed component invalidates affected approval, not every unrelated decision.
10. **Deliver and retain.** Supply one clearly current export per authorized variation, recoverable sources/stems, editable recipe, source/rights map, review limits and cost reconciliation. Run the repository's keep-three retention workflow (`docs/draft-retention.md`, `scripts/retain_drafts.py`) only after its recovery and dependency checks. It plans first, applies only an exact reviewed plan, and never deletes a source.

## 4. Negative prompt and rejection sheet

These are production constraints, not one giant payload to paste into every model. Select the relevant block and pair it with a positive direction. Use a `negative_prompt`, delivery control or style tag only when the selected provider actually supports it. **Never paste directing notes into a speech field unless the engine explicitly separates instructions from spoken text.**

| Stage | Do not produce or accept | Positive target / acceptance check |
|---|---|---|
| Spoken copy | Filler, repeated setup, a second hook metaphor late in the ad, vague invitations, unrelated sidebars, a destination borrowed from the production platform. | Concise thought progression, actual product mechanism and one specific next action. |
| Claims | Fabricated or unsupported results, personal experience, scores, testimonials, urgency, affiliations or guaranteed outcomes; access to restricted answers/content that the product does not provide. | Supported claims and clearly framed goals/scenarios; exact approved offer and conditions. Legitimate, substantiated creator testimony remains usable. |
| Delivery | Announcer projection, a forced pitch jump on the hook, identical sentence attacks, theatrical exaggeration, perpetual high energy, uniform emphatic stress or machine-perfect cadence. | An ordinary person explaining something useful, with composure and selective natural emphasis. |
| Breath and phrasing | Unlimited-breath run-ons, abrupt consonant starts, chopped word tails, an upward punch at every ending, or an identical fade on every sentence. | Complete thought groups, comfortable breathing opportunities, clear beginnings and relaxed endings appropriate to meaning. |
| Manufactured humanity | Random gain jitter, pasted breaths, deliberate stumbles, fake accents, artificial hiss, clipping, distortion or room echoes added just to sound human. | A convincing performance and consistent recording perspective. Preserve genuine variation. |
| Voice/room continuity | A new mic or room sound at every cut, incompatible pickups, mismatched timbre/level, heavy normalization that erases expression, or a voice inconsistent with the visible person and mic distance. | One defined acoustic profile carried through offscreen narration, B-roll, UI and CTA. Establish an actual speaking-setting change before changing it. |
| Competing audio | Two narrators, a singer fighting the VO, leaked original clip dialogue, duplicate tracks, delay mistaken for a second voice, or music used to hide a defective read. | Inspect isolated stems. Deliberately mix one intended narration and the selected bed/other justified sounds. A single AAC stream alone proves none of this. |
| Music entrance | A transient striking against the opening word, a harsh full-level start, aggressive ducking/pumping, or a sudden change of genre or energy. | Cue and gently shape the entrance around the performance. Keep the bed noticeable and speech intelligible at ordinary and low playback levels. |
| Music selection | An assumed "trending" track, unverified paid-use rights, competing lyrics, or a producer's default genre despite the brief/reference. | A fitting contemporary or brief-specific sound, with exact source and rights for the intended placements. Track popularity and commercial permission are separate checks. |
| Transition sound | A whoosh, click, tick, pop or impact at every cut; a loud CTA sting; nuisance sounds without a communication purpose. | Use SFX only for a justified cue with known rights and controlled level. Silence is valid. |
| Creator expression | Frightened/wide-eyed or frantic expressions, fixed smiles, hyperactive eyebrows, emotion unrelated to the words, odd held looks, or a speaking pose with no physical composure. | Relaxed, believable affect matching the line and persona. Trim before a bad expression returns. |
| Framing | An awkward extreme close-up, clipped eyes/chin/hands, incorrect body proportions, a poor camera angle, or a voice/mic relationship the picture cannot support. | Brief-appropriate camera height, distance, headroom and practical microphone placement. Lead with a well-framed creator when the hook calls for direct address. |
| B-roll | A motionless person posing, arbitrary chores, repeated gestures/loops, disconnected industry footage, a static gaze before an action, or a stock-looking shot chosen only because it is available. | Candid, relevant work or product use. Select the actual usable action range, enter near the action and exit before it becomes awkward. |
| Generated motion | Warped hands/props, floating objects, morphing faces, inconsistent wardrobe/identity, flicker, implausible cadence or several conflicting actions in one shot. | Stable identity and believable physical action after the actual delivery crop. Source resolution does not excuse temporal defects. |
| Opening text | A large headline card plus full captions saying a competing hook, decoration across the face, or a blank card waiting for text. | One primary hook message. For creator-led work, start with a clean caption or a deliberately chosen headline according to the brief. The assembly storyboard check fails a hook scene with no text. A separate sound-off hook must earn its place. |
| Captions | Tiny type, over-heavy outlines, unreadable contrast, clipped lines, orphan words, captions on eyes/mouth/product evidence, or a footer that disappears for a few frames before a cut. | Measured line fit, restrained outline/shadow, coherent short groups, placement-safe positioning and a clean handoff through the cut. Inspect the encoded phone-size result. |
| Product UI | A screenshot slideshow, long stagnant screens, illegible miniature UI, fake interactions, invented content/results, mismatched product content or obsolete product states. | Authentic current captures or clearly identified genuine feature illustrations. Animate real layers/annotations where useful; never imply an uncaptured working interaction. |
| Creator/UI balance | Automatically replacing the creator with every screenshot, or covering the product with an unnecessary face cutout. | Creator overlays for continuity and selected readable full-screen proof when it helps. Choose for the actual spoken feature and accepted treatment. |
| Compositing | Double screenshots, competing ghosted headings, empty flashes, an unintended one-frame insert, text jumping between unrelated positions, or a transition that obscures proof. | One coherent visual handoff. Inspect every transition frame as well as normal playback; keep evidence and captions readable. |
| Beat timing | An arbitrary cut quota, every scene the same length, an exceptionally long static beat, fleeting unusable cutaways or footage changing before the thought lands. | Match duration to the thought, action, evidence and reading load. Break a long beat with relevant coverage or a meaningful product event. |
| Duration | Exceeding the current brief, inheriting an older duration, padding with a dead outro, or accelerating speech to force too much copy into the slot. | Budget words and holds before generation. Add useful content only when requested; distinguish an exact runtime from a ceiling. |
| CTA | A vague or wrong action, competing offers, unsupported conditions, distorted/slurred final words, a chopped tail or an unnecessarily long empty end slate. | Accurate offer/destination/conditions, complete speech and a readable hold. Keep creator presence where it serves the invitation; a brief final card is an option. |
| Labels/watermarks | Unrequested tool/status/"presenter" badges, generated logos/text, or damaging framing to conceal a watermark without a permitted clean-output path. | Compose branding in post, choose rights-compliant outputs and preserve any actually required disclosure. Cosmetic preferences do not waive required disclosure. |

### Editorial rejection block

Keep these in the editor/reviewer brief, not as an unsupported provider negative field: stale excluded copy surviving in audio or UI after a picture swap; an audition/static wrapper mislabeled as a finished motion ad; the same recognizable motion cycle restarted through different crops or lip files; generic task footage used to fill an unrelated sector story; effects at every cut or music masking voice; a source/overlay change reusing a frame-count-only cache; and a review credited with modalities it did not receive. Pair each applicable rejection with the current positive shot purpose, source window, native clock, readable hold and actual evidence. Beat duration, music energy and creator recurrence follow the brief; do not generalize one client's exact recipe.

Before source search and at handoff, use bundled `client-library.md` (repository: `skills/ugc-creator-edit/references/client-library.md`) for current client decisions, source-window history, feedback routing and authorized repository synchronization.

### Ready-to-use performance direction

Place this in a supported directing field or the production brief, **not automatically in spoken text**:

> A thoughtful person sharing a useful recommendation with one viewer, semi-comfortable on camera. Conversational and composed, with ordinary contractions and clear thought groups. Let a few important words matter without punching every benefit. Make sentence beginnings clear and endings easy. Allow natural breathing and comfortable small pauses. Match the visible posture, emotion, mic distance and room. Preserve genuine variation; avoid acting out "casualness."

**Voice rejection block:** announcer/sales-pitch projection; forced hook lift; repeated benefit-word punch; exaggerated emotion; identical clause cadence; unlimited-breath delivery; clipped beginnings/endings; an incompatible mic/room; fake breaths, random gain errors or robotic flattening.

Map each line's intent, selective emphasis, breath opportunity and visible action before generating. Use filtering, de-essing, denoising or level automation only for a diagnosed defect. Compare processed and dry audio at matched loudness; reject pumping, phase/delay artifacts and damaged consonants. A filter or music bed cannot repair an implausible performance.

### Ready-to-use shot direction

Fill the bracketed fields from the private profile:

> Use the approved [identity/reference] in [wardrobe/setting]. Camera: [height, distance, framing]. Perform one action: [specific useful action]. Expression: [calm affect matching the line]. For direct address, maintain a comfortable eye line; for working footage, attend naturally to the actual task. Recording perspective: [mic, distance, room]. Preserve [continuity anchors] and [trim handles]. Do not render captions, UI or branding into the footage unless explicitly required by this shot's test.

**Shot rejection block:** distressed stare; fixed pose; artificial grin; unexplained gaze shifts; inconsistent identity/proportions; malformed hands/objects; frozen/looped work; multiple incompatible actions; drifting generated text/logos; speaking lips assigned to different audio.

### Ready-to-use editor direction

> Build from the locked sources and exact current script. Keep one primary opening message and unobstructed creator framing. Make product evidence arrive with the relevant words; preserve creator continuity with purposeful overlays and use full-screen proof selectively. Use relevant native action and another useful angle before a long beat goes stale. Prefer clean direct/match cuts or restrained single-image motion to decorative effects. Keep captions readable through handoffs, the music audible below speech and the CTA complete. Repair the affected component only. Export and review at normal speed and phone size before presenting it as approved.

**Editor rejection block:** screenshot-only default; duplicate/ghosted cards or headings; blank blips; arbitrary rapid cuts; overlong static proof; unrelated B-roll; aggressive music/SFX; competing voices; a stale or distorted CTA; silent performance/source substitutions.

## 5. Provider, cost and token discipline

Use the engine's approved provider roles. In this workflow Kie is the default generation/reusable-video route; use available Higgsfield capabilities for an authorized voice or first editing pass, and deterministic local tools for suitable finishing. This is not a ban on another route: record a concrete capability/quality/cost reason and preserve any matrix locks before changing it. Do not invent an editor capability, voice ID, unsupported negative field or model parameter.

- Reuse accepted media before spending. Generate the smallest missing useful material; do not recreate an actor to move a caption.
- Inspect the **returned** live quote before reserving/submitting. Do not put a quote and a dependent paid call into an uninspected batch. A previous price or account balance is not the new request's authorized cost.
- Keep provider credits, currency, text tokens and local render costs separate. Reserve settled/held cost, outstanding jobs, the new request, finishing and repairs against a finite authorized bucket. Unknown charge is not zero.
- Resume the original job after timeout; never create a second job merely because polling was slow. Save IDs immediately and download completed assets promptly.
- Bound paid repairs and local refinement loops by specific defects and stop criteria. A repair allowance is not a reason to use it. Do not run identical-prompt taste rerolls or repeat broad checks after a passing unchanged component.
- Discover only relevant tools; read only necessary schemas/references. Save full receipts locally and print concise IDs/status/cost summaries. Avoid huge catalogs, repeated file dumps and irrelevant investigations.
- Carry authorization and approvals forward. Ask only for missing material information, an actually required unresolved quality decision, a material scope change or spend outside authorization. Do not turn every reversible finishing choice into a user checkpoint.

## 6. Reviews that mean what they say

Keep the five existing gates: **IAP/technical variables, communications, the 12-Year-Old Sound Check, editorial peer review and blind review**. Use the canonical records and validator in the production/review standard (`docs/UGC_PRODUCTION_STANDARD.md`, or `kie://production-review-standard` over MCP). Registry codes and technical media variables are separate. Use the authoritative registry and an explicit non-applicability decision where appropriate; never invent codes.

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| Full decode, probe, sample/frame clocks and peaks | Actual encoded technical properties | A human-sounding voice or good editing |
| ASR and exact-copy comparison | Recognized words, with documented normalization/limits | Tone, breath, intention or comprehension |
| Source hashes, native ranges and speed maps | Which material was used and how | Credible motion or lips on their own |
| Encoded phone-size frames | Sampled hierarchy, fit, face/product clearance and handoff frames | Complete motion or listening |
| Actual full-media review | Declared perceptual observations from a capable reviewer | Universal quality, measured conversion lift or an automatic human/blind gate |

### Automated reviewer prompt

> Watch and listen to the complete attached current export once at normal speed. State whether full moving video and audio are actually accessible. Quote the opening and closing words you heard, distinguishing speech from visible text. Assess conversational delivery, emphasis/breath/joins and mic perspective; shot relevance and motion; every cut and UI/caption handoff; phone-size text and face clearance; audible music without masking; and the complete CTA/tail. Give concrete observed timecoded blockers and separate optional style suggestions. If any modality is inaccessible, mark it unverified rather than infer it. Do not invent exact loudness, duration, success metrics or a human review. Keep the response concise.

Use a configured, authorized audio/video-capable reviewer. Verify the available model/mode rather than always selecting the fastest default or assuming a branded tool can hear. Bind the uploaded file/proxy to the final master hash and disclose proxy differences.

Local measurements govern exact duration and levels. An approximate model timecode or filename error is a documented caveat; reconcile it against the source. Impossible events beyond the file, wrong speech, missing modality or unsupported access claims invalidate the affected conclusion. Do not count praise as evidence. Do not repeatedly regenerate an ad because a reviewer hallucinated its timing.

If a service fails, allow at most one justified recovery using an available different mode or input format within authorization; stop repeated service retries. An audio-only recovery cannot validate cuts, captions or face clearance. A contextual follow-up is editorial re-review, not a fresh blind review.

A blind reviewer must have a genuinely fresh context and neutral packet, distinct from producers and earlier gate reviewers. Withhold production history, models, costs and previous grades. Disclose residual brand/category cues. Do not call a same-history subagent blind.

Preserve explicit user review deferrals alongside the existing PENDING/NOT_CHECKED records. Continue authorized independent work and label deliverables with their real review limits. Never claim a human listened, all gates passed or paid release was approved when that did not happen.

## 7. Version, deliver and stop

Use stable revision IDs and immutable canonical source/render paths, with a current-pointer manifest or gallery. Do not overwrite the only accepted performance, silently swap sources behind a prior approval, or break relinking when archiving. Retain current source hashes and record any relocation.

Keep the latest **three completed render sets**, plus current/pinned/referenced material, through the repository's retention utility (`scripts/retain_drafts.py`). Preserve raw/generated sources, reusable performances, references, stems, rights, recipes, ledgers and review records. Only explicitly indexed disposable derived files may expire. Verify recovery, dependency resolution, safe contained paths and the exact dry-run plan before applying it in a quiescent run. Never infer deletion from an MP4 extension or a source-directory glob.

Deliver the authorized creative count, not every intermediate. Use one clearly current player/export so comparisons cannot play over each other. Include script/captions, source/rights and speed map, editable recipe/stems, current review status and quoted/actual/unknown costs. Describe choices as hypotheses until campaign evidence establishes actual hook rate, retention or conversion performance.

**Completion rule:** the current brief is met, required non-waived checks have evidence, blockers are resolved and the agreed review state is stated honestly. Optional model taste notes do not require unlimited polishing. Save the decision log and finish the authorized deliverable.
