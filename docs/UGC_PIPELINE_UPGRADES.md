# UGC pipeline upgrades · audit and implementation record

Date: 2026-11-05. Branch: `claude/ugc-pipeline-upgrades`. Baseline before changes: `npm run verify` green with 125 vitest tests, MCP surface OK, 69 Python review tests (1 skipped).

This record is anonymous on purpose: shared engine files carry no client, brand, industry or case detail. Run-specific evidence lives in each run's private records.

## What was audited

- A creative-direction course set: positioning, brand world, creator brief, ad math, ads readouts. Its copy craft feeds three points here: two key messages per script, the three-layer hook, and the four copy styles as presenter register.
- Nine public skill repositories covering AI UGC production. Licences are MIT or Apache-2.0 except one with no licence file; its ideas are restated here and none of its text is copied.
- Public tool roundups, one creator walkthrough and a social post that links no downloadable skills.
- Two private production runs: every instruction, correction and rejection, every provider failure, and every rule that was converged on in chat but never written into the engine.
- The staged creative playbook, short creative-direction module and example profile from a separate consolidation, merged by hand into this tree (see below).

## Gaps found, and where each now lives

| # | Gap | Now |
| --- | --- | --- |
| 1 | No script rules, no words-per-second rule, no spoken-register rules; a voice rejected as "too AI produced" | `references/script-and-delivery.md`, the delivery map, `scripts/check_script.py` (21 tests) |
| 2 | Per-line direction (intent, emotion, emphasis, pause, gaze, gesture) existed only in a document outside the engine | Delivery map fields with closed vocabularies; direction kept out of spoken text; the playbook's rejection rows |
| 3 | No casting logic or identity-still spec; the "reuse B-roll, never the actor" rule lived in chat | `references/casting.md`; People section of `prompts/formats/ugc.md` |
| 4 | No hook taxonomy, test design or hook log | `references/hooks.md`: three-layer hook, twelve patterns mapped to `HK_` codes, one-variable test, log |
| 5 | The working lip-sync route, a day-long avatar outage and a doubled base-clip price were recorded only in run folders | `references/lip-sync-routing.md`; dated rows in `model-routing.md`, `format-routing.md`, `docs/MODEL_CATALOG.md` |
| 6 | The review validator failed any run reached through a junction (19 of 69 tests in PowerShell) | Root resolved before the ancestry check; `root` and `root_given` reported; proven by negative control |
| 7 | The review scripts exist twice and `npm run verify` runs the root copy; nothing kept them identical | `test_review_scripts_drift.py` |
| 8 | `ai_ugc` had no MCP prompt | `kie_render_ai_ugc` on the UGC module with the review stage and the short direction module |
| 9 | `check-storyboard.mjs` read `duration`; briefs carry `duration_seconds`, so the check never fired | Reads both; proven on a fixture |
| 10 | No post-render dialogue check | `check_script.py --transcript` fails when a locked, hook or action line is not heard verbatim |

## The playbook merge

The staged playbook (negative-prompt sheet, voice, shot and editor blocks, reviewer prompt, bounded sequence) adds `docs/UGC_CREATIVE_PLAYBOOK.md`, `prompts/07-ugc-creative-direction.md`, `examples/ugc-production/creative-profile.example.json`, a `kie://ugc-creative-playbook` resource and `src/__tests__/creative-direction.test.ts`. Its patch did not apply to this tree (it was cut from an older snapshot), so its seven modified-file hunks were ported by hand with exact-match assertions. The short module adds 3,123 characters to the UGC, AI-UGC and video prompts; the playbook is served on demand.

Reconciliation between the playbook and this work:

- Direction is not spoken text. The checker fails bracketed, angled and starred direction in a line, warns on stage-noise words, and the provider table no longer inserts breath tags. `breath_before` became `breath_opportunity`, a phrasing note.
- Duration is a declared mode: exact, maximum or range, with the latest instruction winning.
- Exact copy locks are verbatim after a `pronunciation_map`, through `lock_source`.
- `real_creator` joins the identities, so substantiated creator testimony remains usable.
- One source for line direction: `script.json`; the profile's `copy.line_direction` references it.
- Opening text follows the playbook: one primary message, no headline plate stacked on full captions.
- Numeric voice settings are starting points for the run profile, not defaults.
- The playbook and 07 module referred to a retention utility that exists only in a separate vendor copy. Those references now say that this engine has none yet.

## What was deliberately not changed

- The Zod brief schema. `script.json` is a sidecar, so no API contract moved.
- Provider clients, routing for any other format, and spend.
- The composed `UGC_PRODUCTION_STANDARD.md` content beyond one pointer paragraph.
- The retention utility (`retain_drafts.py`, its tests and `draft-retention.md`). It can expire files, so it needs its own review before it enters this engine.

## Decisions carried forward

1. Whether `script.json` becomes part of the brief gate (a schema change) or stays a sidecar.
2. Whether to bring the retention utility in as its own reviewed change.
3. Each run's own open decisions (allocation, capture access, voice choice, disclosure label) stay in that run's records.
