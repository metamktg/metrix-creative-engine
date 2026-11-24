## Craftsman Final Position — MCE end-to-end reconciliation

**Revised recommendation:** Adopt the converged order: (0) merge `engineering/jolly-hamilton-dwi3ej` with verify and CI green; (1) fact sheet of open gaps, each with file:line and a fixture that fails today; (2) `mce.formats/1` registry; (3) `mce.qa/1` written to a file and read by review; (4) `mce.run/1` + `mce.receipt/1`; (5) post-production as strict timeline data (`transitions[]`, `gfx[]`, `sfx[].bind`) plus a hash-bound `mce.look/1`; (6) zero-spend golden runs per registry format. My contribution to that order is the test shape that holds every step: each new rule ships as a FAIL/PASS fixture pair at the contract layer, and the registry drives a parameterized matrix so a format cannot be declared without its fixture, gates and golden run. All of it runs inside the single `npm run verify` gate.

**Concessions made:**
1. **Golden runs prove wiring, not quality.** Artisan was right that flat synthetic media lets output gates pass without testing anything. My round 1 plan leaned on golden runs as the quality proof. I moved quality proof down a layer: each visual and audio gate gets generated known-bad and known-good lavfi twins at the contract layer, following the existing blend at `src/__tests__/qa-video-exempt.test.ts:92` (testsrc2 and testsrc crossfaded over frames 40-50). Golden runs use structured lavfi media (testsrc2, gradients, geq noise), never flat colour behind text, plus a variance-floor check on the fixture itself, so a fixture that is accidentally flat fails before any gate runs on it.
2. **Registry and run schemas before golden runs.** I had golden runs alongside the registry. Architect's order is right: a golden run against an unstable schema is churn. Golden runs land last, after the contracts they exercise.
3. **Transition vocabulary from the renderer, not from design.** Strict `transitions[]` uses the enum `runtime.js` implements: `cut|fade|dip|slide|zoom` (`skills/metrix-video-assembly/scripts/runtime.js:11`). A schema that names motions the renderer cannot play is a broken contract and an untestable one.
4. **One exemption mechanism.** Parity between declared transitions and allowed blend windows is derived into the existing `mce.qaexempt/1` windows (`qa-video.mjs:45-65`). No second exemption file, so there is one code path to test.
5. **Coverage thresholds stay narrow.** Thresholds only on `src/brief.ts`, `src/ledger.ts`, and the new registry/manifest/qa modules. No global number.

**Non-negotiables:**
1. **Every gate ships a FAIL/PASS twin.** No gate rule merges without a generated known-bad input that the gate FAILs and a known-good input it PASSes, both in `npm run verify`. This covers contrast, declared-vs-undeclared blend, safe zone, type floor, carousel seam, SFX drift, loudness, and caption vs locked script. A gate with only a happy-path test has not been shown to detect anything.
2. **Every open gap starts as a failing fixture.** The fact sheet entries I re-checked at HEAD 4344ad3, with the test each needs:
   - `scripts/validate_review_gates.py` has 0 references to QA (`grep -ci qa` = 0). Test: review FAILs when the `qa_report` role is missing, when `subject.sha256` differs from the master, or when the QA verdict is FAIL.
   - `src/prompts.ts` never loads `prompts/03-handoff.md` (no match). Test: handoff prompt resolves and the receipt lists every deliverable hash.
   - `runtime.js:63-64` defaults both transitions to `dip`. Test: `timeline emit` output has `data-trans-in`/`data-trans-out` on every scene; `cut` is the default.
   - `brief.ts:102` types `brand_assets` as an array, while `skills/metrix-ad-creative/SKILL.md:184` tells agents to read `brand_assets.missing`. Test: a fixture brief with a missing asset produces the blocker through the shape `brief.ts` actually accepts, and the skill text is checked against that shape.
   - Three `kie.mjs` copies (`skills/{kie-generate,kie-tasks,metrix-ad-creative}/scripts/kie.mjs`) and two protocol implementations. Test: until Q7 bundles from `src/`, a parity test runs one stubbed task through both and diffs the request bodies.
   - No `plugin.json` anywhere in the repo. Test: the plugin test lists all 16 skills, each with top-level SKILL.md and frontmatter name.
   - Evals exist only for metrix-video-assembly (4 cases). Test: every spend-path skill has at least one stubbed eval case (Q10: matrix brief, missing-asset blocker, lip sync without packet).
3. **Review reads QA by hash before any new gate merges.** Contrast, transition and type-floor gates can be built in parallel but merge only after `mce.qa/1` reaches review. A gate review never reads is a dead test.
4. **Registry consistency test.** The brief enum, `FORMAT_MODULES`, `requiresProductionReview`, storyboard kinds, zones and QA/review gate lists derive from `mce.formats/1`. A vitest test fails on any drift and fails when a registry entry lacks `src/__tests__/fixtures/runs/<format>/`. It extends the existing `single-definition.test.ts` pattern so no format literal lives outside the registry.
5. **Deterministic, zero-spend CI.** Kie is stubbed at HTTP (the existing stub in `scripts/check-mcp-surface.mjs`). Fonts are the committed OFL Geist fixture (`src/__tests__/fixtures/fonts/Geist-Regular.ttf`), never licensed faces. Real model frames come from a small corpus generated once, committed only if anonymous (enforced by `fixture-hygiene.test.ts`), and replayed. Render tests FAIL, never skip.
6. **render.mjs / runtime.js changes merge only on green CI** (Q1), including render-health and the golden runs, not local runs.

**Implementation notes:**

Test files, all under `src/__tests__/` per the existing convention (skill CLIs are spawned from there; no `skills/*/tests/`):

```
format-registry.test.ts      Unit      every format has one entry, prompt file, zones row, fixture dir; no stray format literals
run-manifest.test.ts         Unit      append by hash; reject hash mismatch; reject out-of-order stage; idempotent re-run; non-Kie provenance via run ingest
qa-report.test.ts            Contract  qa-video --out writes mce.qa/1; subject.sha256 equals the file under QA
review-reads-qa.test.ts      Contract  spawns validate_review_gates.py: missing qa_report / sha mismatch / FAIL verdict -> exit nonzero
emit-transitions.test.ts     Contract  every emitted scene carries data-trans-in/out; transitions[] kinds within runtime enum; frames on 0/4/8/11/15 scale
transition-parity.test.ts    Contract  twin A: undeclared blend -> FAIL; twin B: same blend declared in transitions[] -> derived qaexempt -> PASS
contrast-gate.test.ts        Unit+Contract  pure module (vitest) + twins: Geist text over testsrc2 high-variance -> FAIL; with plate -> PASS
sfx-bind.test.ts             Unit      sfx[].bind target anchor equals sfx.at (timeline/schema.mjs:134); drift twin FAILs
type-floor.test.ts           Unit      render check reads min_font_ratio from zones, replacing render.mjs:548 W*0.03
handoff-receipt.test.ts      Contract  03-handoff loaded; receipt requires review PASS; lists every deliverable sha256
kie-parity.test.ts           Contract  stubbed task through src/client.ts and kie.mjs; request bodies equal (deleted once Q7 bundles)
plugin-package.test.ts       Unit      plugin.json lists 16 skills; vendored pins byte-identical; generic skills route brief work to metrix-ad-creative
golden-run.test.ts           E2E       describe.each(registry formats): plan..handoff, stub Kie, zero ledger spend, every manifest hash verifies, one Kie-fail path
fixtures/lavfi.ts            Helper    shared twin generator (graph strings, TAGS, sha); variance-floor assert on every generated fixture
```

Python: extend `scripts/test_validate_review_gates.py` with `test_qa_fail_blocks_approval`, `test_missing_qa_report_blocks_approval`, `test_qa_sha_mismatch_blocks_approval`.

Gate wiring: append to `verify` in cheapest-first order, `test:contracts` then `test:golden` then `check:plugin` (plugin validate plus stubbed evals). The existing `verify` chain in `package.json:19` stays the single entry point; CI keeps running only `pnpm run verify`.

Shared helper first: the lavfi graph in `qa-video-exempt.test.ts:92` is the first instance; contrast, parity and carousel twins are the second and third. Per the rule of three, extract `fixtures/lavfi.ts` when the second twin lands, not later, so every gate builds twins the same way.

Budget: twins are 160x288, 3 s, generated once per file in `beforeAll` (the existing pattern). Contrast reuses check-mode frames instead of a second render. Golden runs run in parallel under the existing 30 s per-test timeout, raised per-file only for golden runs if measured runtime needs it.
