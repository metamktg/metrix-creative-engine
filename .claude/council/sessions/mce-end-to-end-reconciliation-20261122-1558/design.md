# Design Document: metrix-creative-engine end-to-end reconciliation

## Overview

A Metrix IAP brief JSON should become finished, gated, launch-ready creative for every format, with CI green. Today the stages between brief and handoff are loosely joined. Review (`scripts/validate_review_gates.py`) never reads QA output. `src/prompts.ts` never loads `prompts/03-handoff.md`. No run manifest exists. Format knowledge is spread over several hard-coded lists that already disagree (claymation). There are three copies of `kie.mjs` and no plugin manifest. Post-production (transitions, GFX, SFX, captions, look) lives in markup rather than data that can be checked, and `runtime.js:63-64` silently defaults every scene transition to `dip`. Two problems that came up in round 1 are already fixed: commit 1343e47 sends safe-zone checks through `placement-zones.json`, and commit f2ed82a keeps and checks the matrix `cells` and `matrix_naming_convention` fields. Both commits exist only on `engineering/jolly-hamilton-dwi3ej`, not on main.

The council (Architect, Artisan, Craftsman) agreed on one order of work:
- (0) Merge the branch with verify and CI green.
- (1) Write a fact sheet of open gaps. Each gap gets a file:line citation and a fixture that fails today.
- (2) Build the `mce.formats/1` registry, the single source for the brief enum, prompt modules, production-review routing, storyboard kinds, zones and gate lists.
- (3) Have `qa-video` write a `mce.qa/1` file that review reads by hash.
- (4) Add the append-only, hash-bound `mce.run/1` manifest and the `mce.receipt/1` handoff receipt.
- (5) Make post-production strict data in `mce.timeline/2` (`transitions[]`, `gfx[]`, `sfx[].bind`, `audio.duck`), plus a private, hash-bound `mce.look/1`.
- (6) Add zero-spend golden runs per registry format, after the contracts they exercise are stable.

Each gate is proven by generated FAIL/PASS lavfi twins at the contract layer. Golden runs prove wiring, not quality. Everything runs inside the single `npm run verify` entry point.

## Architecture

**Data spine (Architect).**
- **`mce.formats/1`** lives at `skills/metrix-ad-creative/references/formats.json`. Each row carries `asset_type, medium, motion, required_brief_fields, placements, prompt{module,review}, plan{storyboard_kind}, route, look{slots[],gates[]}, qa[], review[], handoff{receipt,mst_row}`. A build step generates the brief enum. A vitest consistency test, extending `single-definition.test.ts`, fails on any drift or on a missing fixture dir.
- **`mce.qa/1`** is written by `qa-video --out <file>` as `{subject{sha256}, inputs, checks[], verdict, exemptions?}`. `validate_review_gates.py` adds a required artifact role `qa_report`. Review FAILs if the report is absent, if its sha does not match the master under review, or if the verdict is FAIL.
- **`mce.run/1`** records each stage's inputs and outputs by path, sha256 and schema. A stage runs only if each input hash equals a prior stage's output. Writes use temp-file plus rename. A re-run with the same input hashes and a PASS record is a no-op, so resume costs no credits.
- **`mce.mjs run init|plan|generate|ingest|assemble|render|qa|review|handoff|status`** shares one error contract:

  | Error | Exit code |
  |---|---|
  | `GATE_FAIL` | 1 |
  | `CONTRACT_SCHEMA`, `CONTRACT_HASH`, `TOOL_MISSING` | 2 |
  | `BLOCKED_ASSET`, `BLOCKED_SPEND` | 3 |

  `run status` prints the manifest chain from the brief through ledger task ids, QA and review records.
- **Handoff** loads `03-handoff.md`, requires review PASS and writes `mce.receipt/1` listing every deliverable sha256.
- **One ledger.** Every non-Kie output (Gemini/Veo, Higgsfield, Canva, HeyGen, desktop edits) re-enters through `run ingest` with `provider`, `run_id` and `file_sha256`, then goes through the same QA and review.
- **Packaging.** Add `.claude-plugin/plugin.json` (16 skills) and run `plugin validate` in CI. An `MCE_*` env/manifest resolver replaces the `X:/` defaults. `brand_assets` accepts an array or `{items, missing}`. One Kie client is bundled from `src/` into the three `kie.mjs` paths via `skill-copies.json`.
- **Compatibility.** All brief and timeline changes are optional fields. New contracts get new schema ids. Byte copies are edited only at their canonical path. Client data stays in gitignored `out/` and `renders/`.

## User Experience

**Look, GFX, transitions, captions, SFX (Artisan).**
- **Look as a contract.** `mce.look/1` is compiled by a pure `look compile` from a private brand kit into `--look-*` CSS custom properties, passed through `window.__MCE`. The raw hex/px values in `assets/template/index.html:21-27` become `var(--look-*)`. The token set is small: about 12 primitives, 6 semantics and 5 components, and any token no format slot reads gets cut. Video, static-compose, carousel cards, shopping overlays and the end card all read one look through one renderer. The static and poster are the settled frame of the same composition.
- **Transitions as data.** Each entry in `transitions[]` is `{id, at: cut-point ref, kind: cut|fade|dip|slide|zoom, frames: int, why}`. The kinds are exactly the enum `runtime.js:11` implements. Durations use the house scale 0/4/8/11/15 frames. A kind other than `cut` is allowed only at a ROLES boundary (hook/show/proof/offer/cta) or with a bound SFX. `slide` covers push, and a whip is `slide` plus a bound whoosh. `emit` always writes `data-trans-in/out` on both adjacent scenes, with `cut` as the default.
- **SFX binding.** `sfx[].bind` is optional and names a transition id or text id. `timeline check` requires `sfx.at` to equal the bound anchor, and QA checks that the onset falls within `onsetGuard` (`rules.mjs:57`).
- **GFX.** Each entry in `gfx[]` is `{id, layer, from, to, zone, copy_source?}`. Shopping/DPA prices are bound to the feed SKU field and styled with `badge.price`.
- **Readability.** Contrast is measured on the 95th-percentile worst background luminance under each text box at its settled frame, with plates and strokes counted as background. The floor is 4.5:1, or 3:1 for type at the large step of the scale. The type floor reads `min_font_ratio` from the zones table, replacing the hard-coded `W*0.03` at `render.mjs:548`.
- **Motion specs.**
  - Enters use cubic-out. Scene moves use cubic in-out. Back overshoot is for `pop` only.
  - Stagger is 3 frames with at most 5 items. The hook is settled by 1.0 s.
  - End card: logo at 15 frames, offer rise at +3 frames, CTA pop at +6 frames with its SFX bound. One pulse is allowed, no earlier than 1 s before the end.
  - Animate only opacity, transform and clip-path.
- **Format rollout order:** static-compose, shopping/DPA, carousel (1 px seam), VO (ASR checked against the locked `script.sha256`), b-roll (shot list from timeline gaps), then ingest + grade.

## Risk Assessment

These are the risks the council named. All three perspectives addressed them, and the mitigation is in each row.

| Risk | Mitigation |
|---|---|
| Stale premises. Round 1 gap lists included two items already fixed by 1343e47 and f2ed82a. | Fact sheet first. No contract work starts until each gap has a file:line citation at HEAD and a failing fixture (`it.fails`/expectedFailure). |
| Gates that review never reads count as dead tests. | Review-reads-QA-by-hash must merge before contrast, transition or type-floor gates merge. Those gates can be built in parallel. |
| Gates passing on flat synthetic media. | Golden runs use structured lavfi media (testsrc2, gradients, geq) plus a variance-floor check on the fixture itself. Each gate has its own FAIL/PASS twins. |
| A schema naming motions the renderer cannot play. | The transition enum is tied to `runtime.js:11`. A new kind lands with its runtime branch in the same PR. |
| Silent `dip` default (`runtime.js:63-64`). | `emit` always writes trans-in/out. An undeclared blend window fails `qa-video`. |
| Client data leaking into the repo. | Look values stay private in the run dir. Committed fixtures are an anonymous sample kit, enforced by `fixture-hygiene.test.ts`. |
| CI spend and nondeterminism. | Kie is stubbed at HTTP (`scripts/check-mcp-surface.mjs`). Fonts are the committed OFL Geist only. A small corpus of real model frames is generated once and replayed. |
| Credit loss on resume or re-run. | Hash-equal re-runs with a PASS record are no-ops. `BLOCKED_SPEND` (exit 3) fires on lip sync without a preproduction packet. |
| Protocol drift across the three `kie.mjs` copies. | A parity test diffs request bodies until the bundle-from-`src/` step lands, then the test is deleted. |
| Unverified render-path changes. | Changes to `render.mjs` and `runtime.js` merge only on green CI, including render-health and golden runs. Local runs do not count. |

## Quality Strategy

**Test shape (Craftsman).**
- **Every gate ships a FAIL/PASS twin** inside `npm run verify`. This covers contrast, declared vs undeclared blend, safe zone, type floor, carousel seam, SFX drift, loudness, caption vs locked script and price match. Twins are 160x288 lavfi clips of 3 s or less, built in `beforeAll` and modelled on `qa-video-exempt.test.ts:92`. Extract the shared helper `fixtures/lavfi.ts` when the second twin lands.
- **Test files**, all under `src/__tests__/`:
  - `format-registry`
  - `run-manifest`
  - `qa-report`
  - `review-reads-qa`
  - `emit-transitions`
  - `transition-parity`
  - `contrast-gate`
  - `sfx-bind`
  - `type-floor`
  - `handoff-receipt`
  - `kie-parity`
  - `plugin-package`
  - `golden-run` (`describe.each` over registry formats: plan through handoff, stub Kie, zero ledger spend, every manifest hash verifies, plus one Kie-fail path)
- **Python tests.** Extend `scripts/test_validate_review_gates.py` with:
  - `test_qa_fail_blocks_approval`
  - `test_missing_qa_report_blocks_approval`
  - `test_qa_sha_mismatch_blocks_approval`
- **Evals.** Every spend-path skill gets at least one stubbed eval: matrix brief, missing-asset blocker (exit 3), and lip sync without a packet (`BLOCKED_SPEND`).
- **Gate wiring.** Append to `verify`, cheapest first: `test:contracts`, then `test:golden`, then `check:plugin`. CI keeps running only `pnpm run verify`.
- **Coverage.** Thresholds apply only to `src/brief.ts`, `src/ledger.ts` and the new registry, manifest and qa modules. There is no global number.
- **Render tests FAIL, never skip.** The per-test timeout stays at 30 s and is raised per file only for golden runs, if measured runtime needs it.

**Merge plan.**

| Step | Deliverable | Gate to merge |
|---|---|---|
| 0 | Merge branch | verify + CI |
| 1 | Gap fixtures | committed as expected failures |
| 2 | Registry | verify |
| 3 | `mce.qa/1` and review edge | verify; step-1 fixture flips to pass |
| 4 | Run manifest, CLI, receipt and evals; packaging, resolver and ledger fields in parallel | verify |
| 5 | Timeline fields | verify + CI + lavfi twins |
| 6 | Look and contrast | verify + CI + contrast twins on Geist |
| 7 | Q5 formats | each needs a registry row, a golden stub run and twins |
| 8 | Kie client bundle | verify + MCP surface check |

## Tension Resolutions

| Tension | Agents | Resolution | Reasoning |
|---|---|---|---|
| Starting gap list: audit findings vs what HEAD actually contains | Architect, Craftsman | Withdraw the safe-zone, matrix-strip and qa-hash gaps. Start with a fact sheet where every gap has file:line plus a failing fixture. Merge the branch first. | 1343e47 and f2ed82a had already fixed two findings, but only on the branch. Claims need proof per the owner's rule. |
| Look values in the format registry vs a separate contract | Architect, Artisan | The registry declares look slots and gates. Values go in a private `mce.look/1`, bound into `mce.run/1` as a hash FileRef. | Different grain (per format vs per brand), owner, cadence and privacy. Putting the values in the registry would leak client data into the repo. |
| Transition vocabulary (dissolve/whip/match/wipe or push/whip vs renderer enum) | Architect, Artisan, Craftsman | Use `cut\|fade\|dip\|slide\|zoom` from `runtime.js:11`. Push is `slide`. Whip is `slide` plus a bound SFX. | A schema naming motions the renderer cannot play is a broken and untestable contract. |
| Golden runs as quality proof vs flat synthetic media | Craftsman, Artisan | Golden runs prove wiring on structured lavfi media with a variance floor. Gate quality is proven by FAIL/PASS twins at the contract layer. | Flat `color=gray` passes contrast and blend gates by default. Twins show each gate detects the defect. |
| Real model frames in CI vs zero spend | Artisan, Craftsman, Architect | Stub Kie at HTTP. Generate a small anonymous real-frame corpus once and replay it. Live Kie is a manual smoke only. | CI must stay deterministic and free while still exercising model-like frames. |
| Fonts in visual tests | Artisan, Craftsman | Use only the committed OFL Geist fixture. Client fonts come only from private kits in the run dir. | Licensing and determinism. |
| Separate transition exemption vs existing exemptions | Architect, Craftsman, Artisan | Derive parity windows from `transitions[]` into the existing `mce.qaexempt/1`. | One exemption mechanism means one code path to test. |
| Golden runs alongside the registry vs after the contracts | Craftsman, Architect | Golden runs land last, after the registry, qa, run and timeline schemas are stable. | Golden runs against a moving schema are churn. |
| Building visual gates early vs the review edge | Artisan, Craftsman, Architect | Build in parallel. Merge only after `mce.qa/1` reaches `validate_review_gates.py`. | A gate review never reads proves nothing. |
| Token system scope | Artisan, Craftsman | About 12 primitives, 6 semantics and 5 components. Cut any token no format slot reads. | Keep only what gates and formats use. No 200-token system. |

## Decision Log

| Decision | Options Considered | Chosen | Reasoning |
|---|---|---|---|
| Build order | Contracts first; golden runs alongside registry; fact-sheet first | Merge, fact sheet, registry, qa, run/receipt, timeline + look, golden runs | Each layer depends on the one below. Fixtures prove gaps before work starts. |
| Format source of truth | Hard-coded lists per module; `mce.formats/1` registry | Registry at `skills/metrix-ad-creative/references/formats.json` plus a consistency test | The current lists already drift (claymation). New formats become a registry row plus a fixture. |
| QA to review binding | stdout report; `mce.qa/1` file bound by hash | `qa-video --out` writes `mce.qa/1`; review requires `qa_report` role | Today review can pass a master that QA failed. |
| Run provenance | None; `mce.run/1` append-only manifest | `mce.run/1` with hash-chained stages, atomic writes, idempotent re-run | Prevents stale handoffs, makes resume safe on credits, traces every deliverable. |
| Handoff | Unused `03-handoff.md`; receipt | Load `03-handoff.md`; `mce.receipt/1` requires review PASS | Closes the last unbound stage. |
| Transition representation | Markup defaults; `transitions[]` timeline data | `transitions[]{id, at, kind, frames, why}` on a 0/4/8/11/15 frame scale; emit always writes trans-in/out | Removes the silent `dip` default and makes transitions checkable. |
| SFX sync | Free `at` timestamps; `sfx[].bind` | Optional `sfx[].bind` to a transition or text id; `at` must equal the anchor; onset guard in QA | Keeps sound on the cut it accents. Backward compatible. |
| Look | Registry columns; private `mce.look/1` | `mce.look/1` compiled to `--look-*` CSS vars, bound by hash | Privacy and cadence. One look drives every format. |
| Contrast gate | None; mean luminance; worst-pixel P95 | P95 worst background, 4.5:1 (3:1 large type), pure module reusing check-mode frames | Model frames vary per take. No extra render pass needed. |
| Type floor | Hard-coded `W*0.03`; zones table | `zone.min_font_ratio` | One source for placement rules. |
| Gate proof | Happy-path tests; FAIL/PASS twins | Lavfi twins per gate, shared `fixtures/lavfi.ts` | A gate is only trusted once it has been shown to fail on bad input. |
| CI determinism | Live Kie; stubbed HTTP + replay corpus | Stub plus a once-generated anonymous corpus; Geist font only | Zero spend, reproducible. |
| Non-Kie providers | Separate ledgers; one ledger via `run ingest` | `run ingest` with provider/run_id/file_sha256, then same QA and review | One provenance and spend trail. |
| Kie client duplication | Keep three copies; parity test; bundle from `src/` | Parity test now, bundle via `skill-copies.json` later | Removes protocol drift. |
| Plugin packaging | None; `.claude-plugin/plugin.json` + validate | Add the manifest and `plugin validate` in `check:plugin` | Skills ship as a validated plugin. |
| Error contract | Ad hoc; shared exit codes | 0 pass, 1 gate fail, 2 contract/tool, 3 blocked asset/spend | Orchestration and evals can branch on exit code. |
| Coverage policy | Global threshold; narrow thresholds | Narrow thresholds on brief, ledger and the new modules | Avoids gaming a global number. |
