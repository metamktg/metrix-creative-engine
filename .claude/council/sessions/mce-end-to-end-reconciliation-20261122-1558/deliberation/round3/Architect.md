## Architect Final Position — MCE end-to-end reconciliation

**Revised recommendation:** Merge the current branch (1343e47 safe-zone, f2ed82a matrix fields, the runtime.js frame fix) to main with verify and CI green first. Then build the data spine in this order: a fact sheet of open gaps cited by file:line, each paired with a failing fixture. Next, the `mce.formats/1` registry, then the `mce.qa/1` file that review reads, then `mce.run/1` plus `mce.receipt/1`. After that comes post-production as strict data in `mce.timeline/2` (`transitions[]`, `gfx[]`, `sfx[].bind`), with a separate hash-bound `mce.look/1`. Last come zero-spend golden runs per format, each proven by FAIL/PASS lavfi twins.

**Concessions made:**
1. **Stale premises withdrawn.** Craftsman was right. Commit 1343e47 already routes render check bands through `placement-zones.json`. Commit f2ed82a already keeps and checks `cells` and `matrix_naming_convention` (`src/brief.ts:109-110`, `162-183`). qa-video already hashes its video and timeline. I removed these from the gap list. Re-checked at HEAD 4344ad3, these are still open:
   - `scripts/validate_review_gates.py` has no reference to a QA report.
   - `src/prompts.ts` never imports `03-handoff.md`.
   - No run manifest exists.
   - The claymation lists disagree with the production-review lists.
   - There are three `kie.mjs` copies (`skills/{kie-generate,kie-tasks,metrix-ad-creative}/scripts/kie.mjs`).
   - There is no plugin manifest.
2. **Fact sheet first.** I adopted Craftsman's order. No contract work starts until each gap has a file:line citation and a fixture that fails today. This holds my designs to the owner's rule that every technical claim needs proof.
3. **Transition vocabulary changed.** My B7 enum (`dissolve|whip|match|wipe`) is dropped. I adopted the enum `runtime.js` actually implements, `cut|fade|dip|slide|zoom` (runtime.js:11, 63-85). `cut` is the default. Durations are integer frames on the house scale. A schema that names motions the renderer cannot play is a broken contract.
4. **Look is its own contract.** Artisan was right that look values are per brand, private and change on their own cadence. The registry declares look slots and gates only. The values go in `mce.look/1`, which enters the run as a FileRef bound by hash. Putting them in the registry would leak client data into the repo.
5. **Golden-run proof split.** Flat synthetic media would let the gates pass without testing anything. Each visual gate gets generated FAIL/PASS lavfi twins at the contract layer, following the existing blend at `qa-video-exempt.test.ts:92`. Golden runs use structured lavfi media (testsrc2, gradients, geq) plus a variance check, so they prove wiring and not quality. CI uses the committed OFL Geist font and never licensed faces. Real model frames come from a small corpus generated once and replayed, so CI stays zero-spend.
6. **Parity rule.** I dropped my separate transition-exemption idea. Parity is derived from the existing `mce.qaexempt/1` windows. One exemption mechanism, not two.

**Non-negotiables:**
1. **Review reads QA by hash.** `mce.qa/1` is written to a file. `validate_review_gates.py` adds a required artifact role `qa_report`. Review FAILs if the report is absent, if `subject.sha256` differs from the master under review, or if the QA verdict is FAIL. Until this edge exists, no other gate is load-bearing, so contrast and transition gates merge only after it.
2. **One format registry before any new format.** The brief enum, `FORMAT_MODULES`, `requiresProductionReview`, storyboard kinds, zones and QA/review gate lists are all derived from `mce.formats/1`. A vitest consistency test fails on any drift. Each new Q5 format is a registry row plus a golden fixture, never new hard-coded lists.
3. **Append-only run manifest.** `mce.run/1` records every stage's inputs and outputs by path, sha256 and schema. A stage runs only if each input hash equals a prior stage's output. Handoff requires review PASS and writes `mce.receipt/1`. Writes use temp-file plus rename. A re-run with the same input hashes and a PASS record is a no-op, which makes resume safe on credits.
4. **Post-production is data, not markup.** Every transition, GFX layer and SFX cue is a timeline field that a script checks. `emit` must write `data-trans-in`/`data-trans-out` on every scene, because the runtime silently defaults to `dip` (runtime.js:63-64). An undeclared transition is therefore an emit bug, not a style choice.
5. **Additive and backward compatible.** Brief and timeline changes are optional fields under upstream names, and new contracts get new schema ids. Byte copies are edited only at their canonical path. Client data stays in gitignored `out/` and `renders/`.
6. **One ledger for all spend and provenance.** Every non-Kie output (Gemini/Veo direct, Higgsfield, Canva, HeyGen via media-use, desktop edits) re-enters through `run ingest`. It gets a ledger line with `provider`, `run_id` and `file_sha256`, then the same QA and review.

**Implementation notes:**

| # | Step | Touches render.mjs/runtime.js | Gate to merge |
|---|---|---|---|
| 0 | Merge branch to main; CI green on #17/#18 cause | yes (already done) | verify + CI |
| 1 | Fact sheet: each open gap -> file:line + failing fixture (`__tests__/gaps/*.test.ts`, py unittest for review) | no | fixtures committed as `it.fails`/expectedFailure |
| 2 | `skills/metrix-ad-creative/references/formats.json` (`mce.formats/1`): `asset_type, medium, motion, required_brief_fields, placements, prompt{module,review}, plan{storyboard_kind}, route, look_slots[], qa[], review[], handoff{receipt,mst_row}`; build step generates brief enum; consistency test | no | verify |
| 3 | `qa-video --out <file>` writes `mce.qa/1 {subject, inputs, checks[], verdict, exemptions?}`; review requires `qa_report` role | no | verify; fixture from step 1 flips to pass |
| 4 | `mce.run/1` + `mce.mjs run init/plan/generate/ingest/assemble/render/qa/review/handoff/status`; exit codes 0/1/2/3; `03-handoff.md` loaded in `src/prompts.ts`; `mce.receipt/1` | no | verify; stub-mode Q10 evals (matrix brief, missing asset -> exit 3, lip sync without packet -> BLOCKED_SPEND) |
| 4b | In parallel: ledger optional fields; `MCE_*` env/manifest tool resolver replacing `X:/` defaults; `.claude-plugin/plugin.json` + `plugin validate` in CI; brand_assets accepts array or `{items, missing}` | no | verify |
| 5 | `mce.timeline/2` additions: `transitions[]{id, at: cut point id, kind: cut|fade|dip|slide|zoom, frames:int}`, `gfx[]{id, layer, from, to, zone, copy_source?}`, `sfx[].bind` (cut point id; resolved `at` derived), `audio.duck`; `timeline check` rejects transitions on non-cut points or with frames > adjacent min_shot; emit writes trans-in/out always | emit + render check | verify + CI + lavfi twins (declared vs undeclared xfade, SFX drift) |
| 6 | `mce.look/1` (private, per kit) bound into run; contrast as pure module in vitest, reusing check-mode frames; type floor = `placement-zones.json` `min_font_ratio` (0.03) | render check | verify + CI + contrast twins on Geist |
| 7 | Q5 formats in order: static-compose, shopping/DPA (feed-bound `copy_source`), carousel (seam twin), VO (ASR vs locked `script.sha256`), b-roll (shot list from timeline gaps), ingest + grade | per route | each: registry row + golden stub run + twins |
| 8 | Bundle one Kie client from `src/` into the three `kie.mjs` paths via skill-copies.json | no | verify + MCP surface check |

Error contract shared by every stage CLI:
- `CONTRACT_SCHEMA`/`CONTRACT_HASH` exit 2
- `GATE_FAIL` exit 1
- `BLOCKED_ASSET`/`BLOCKED_SPEND` exit 3
- `TOOL_MISSING` exit 2

`run status` prints the manifest chain so a reviewer can trace any deliverable back to its brief, ledger task ids, QA and review records by hash.
