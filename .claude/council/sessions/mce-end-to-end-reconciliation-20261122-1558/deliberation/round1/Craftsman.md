## Craftsman Position — MCE end-to-end reconciliation

**Core recommendation:** Make every stage handoff a typed, versioned artifact (`mce.run/1` manifest entries, each with a zod schema in `src/` and a hash), then prove the whole chain in CI with one **zero-spend golden run per format registry entry**: brief fixture -> plan -> stubbed Kie generate (ffmpeg lavfi synthetic media) -> assemble/render -> qa-video -> review gates -> handoff receipt. The format registry drives a parameterized test matrix, so a format cannot be declared without its fixture, storyboard, render, QA and review assertions.

**Key argument:**
Today the repo is strong at the unit layer and weak exactly where the owner's concern lives: the seams. There are 40 vitest files in `src/__tests__/` covering stage CLIs in isolation (timeline-check, caption-cues, placement-zones, qa-video-*, make-row, render-health with real headless Chrome), plus Python unittest suites for the review scripts. Nothing exercises stage N's output as stage N+1's input. That is why the audit's five broken handoffs survived a green unit suite: `validate_review_gates.py` never reads qa-video output (grep for `qa` in it returns nothing), `prompts/03-handoff.md` is referenced only from `prompts/00-core.md` and `prompts/README.md`, never loaded by `src/prompts.ts`, and there is no receipt. The cheap fix is not more unit tests; it is contract tests at each seam (schema-validate the real output of stage N with stage N+1's input schema) and one integration "golden run" per format that is fast because it never spends: `client.ts` is already stubbed in `scripts/check-mcp-surface.mjs`, and `render-health.test.ts` already proves we can render synthetic boards in CI. Pit of success: add a format to the registry, and `formats.test.ts` iterates it and fails until `src/__tests__/fixtures/runs/<format>/` exists with an expected manifest. Proof check on the deepen findings before we plan against them: finding (1) is already fixed by commit 1343e47 (render.mjs now resolves bands via `zoneFor`/`checkBoxes`, and the two `placement-zones.json` files are byte-identical copies managed by `scripts/skill-copies.json`); finding (3) is half stale (`src/brief.ts` lines 109-110 now accept `matrix_naming_convention` and `cells` with cross-field validation). The plan should cite current code, not the audit snapshot, or we will rebuild things that exist.

**Risks if ignored:**
- Regression at the seams: each stage stays green while the run produces a creative that QA flagged but review approved (qa-video -> review gate gap), or a handoff with no receipt. Unit tests cannot catch this class.
- Pattern drift: format knowledge stays in six places; a new format (static-compose, DPA, carousel, VO, b-roll) gets added to prompts but not to render/QA/review, and nothing fails. The Q5 order adds six formats; without a registry-driven matrix that is six new silent gaps.
- Slow, flaky or expensive CI: if the e2e is built on live Kie or real model output, it either costs credits per push or gets skipped. A skipped render test already went red on main (#17/#18); the e2e must be deterministic or it will be ignored.

**Dependencies on other domains:**
- Architect: the `mce.run/1` manifest schema and the format registry shape (one `src/formats.ts` exported to both TS and the .mjs CLIs via the esbuild bundle, Q7) must be fixed before I can write contract tests; I need stage input/output schemas, not prose.
- Skeptic: edge-case enumeration for the stub (Kie `fail` state, expired result URL, missing brand asset, lip sync without packet) so the eval cases in Q10 are the real failure modes.
- Advocate/Artisan: the "agency quality" bar as machine-checkable assertions (LUFS target, caption safe-zone, hook-in-first-second, CTA verbatim, no double exposure) — the existing `evals/metrix-feed-4x5-product-journey/case.yaml` expected_outcome is a good template; it needs to become assertions qa-video emits as JSON.
- Operator: CI time budget; golden runs per format must fit alongside render-health (currently 30 s per-test timeout).

---

## Appendix A — Testing strategy (testing-strategy skill)

### Step 1: Existing infrastructure (audited)
- vitest 4, `include: src/**/*.test.ts`, node env, 30 s timeout, markdown inline loader (tests read real shipped prompts).
- Skill scripts are tested from `src/__tests__/` by spawning the .mjs CLIs — keep that convention (do not add `skills/*/tests/`; `sync-copies.mjs` already skips `evals`).
- Python unittest via `npm run test:*review*`, retention, client-library.
- CI: `pnpm run verify` + top-level SKILL.md assertion; ffmpeg + headless Chrome installed, render tests FAIL not skip.
- No coverage tool, no plugin validation, eval cases exist only for metrix-video-assembly and are not run by CI.

### Step 3: Pyramid

| Layer | Count (new) | Run time | Mock strategy |
|-------|-------------|----------|---------------|
| Unit | ~40-60 cases | < 5 s total | Pure: registry lookups, manifest hashing/append, brief field passthrough, gate rules |
| Contract (integration) | 1 per seam (~7 seams) | < 10 s | Real stage CLI on a fixture input; output parsed by the next stage's zod schema |
| Golden run (e2e) | 1 per registry format (start: video, ugc, static, carousel; add per Q5) | < 60 s each, parallel | Stub Kie HTTP (existing check-mcp-surface stub); synthetic clips/audio via ffmpeg lavfi; real render/QA/review |
| Live smoke | 1, manual only | minutes, spends | `scripts/smoke-live.mjs`, never in CI |

### Step 4: Test specifications

```
File: src/__tests__/format-registry.test.ts            Layer: Unit
describe('format registry')
  it('every ASSET_TYPES value has exactly one registry entry')
  it('every entry names a prompt file that exists under prompts/formats/')
  it('every entry has safe-zone rows resolvable by placement-zones zoneFor')
  it('every entry has a golden fixture dir src/__tests__/fixtures/runs/<format>/')
  it('no format literal (9:16, 4:5, 1080x1920) appears outside the registry')   # extends single-definition.test.ts pattern

File: src/__tests__/run-manifest.test.ts               Layer: Unit
describe('mce.run/1 manifest')
  it('append records stage, inputs-by-hash, outputs-by-hash, tool versions')
  it('rejects a stage whose declared input hash does not match the file on disk')
  it('refuses out-of-order stages (review before qa)')
  it('records non-Kie provenance (higgsfield/canva/manual) through the same ledger shape')  # Q6

File: src/__tests__/handoff-contracts.test.ts          Layer: Contract
describe('stage seams')
  it('brief -> plan: cells/matrix_naming_convention survive validateBrief and reach make-row')
  it('storyboard -> timeline plan: check-storyboard output parses as timeline input')
  it('timeline emit -> render: emitted composition renders with no missing asset refs')
  it('render -> qa-video: qa JSON parses with qaReportSchema')
  it('qa-video -> review: validate_review_gates.py FAILs when qa JSON has a FAIL row')   # closes finding 5
  it('review -> handoff: 03-handoff prompt is loaded and receipt lists every deliverable hash')  # closes finding 4
  it('captions/asr-check: locked script vs ASR proof mismatch blocks VO route')

File: src/__tests__/golden-run.test.ts                 Layer: E2E (deterministic)
describe.each(registryFormats)('golden run %s')
  it('runs plan..handoff with stubbed Kie and zero ledger spend')
  it('manifest has one entry per stage, all hashes verify')
  it('qa-video reports PASS for loudness, safe zone, frame-0 thumbnail, no black frames')
  it('review record references the qa report hash')
  it('FAILs end-to-end when the stub returns a Kie fail state (no silent partial deliverable)')

File: scripts/test_validate_review_gates.py (extend)   Layer: Unit (Python)
  test_qa_fail_row_blocks_approval / test_missing_qa_report_blocks_approval

File: src/__tests__/plugin-package.test.ts             Layer: Unit
  it('plugin.json lists all 16 skills; each has top-level SKILL.md and frontmatter name')
  it('vendored skills are byte-identical to VENDORED.json pins')
  it('generic skills (kie-generate, kie-tasks, media-use routing) point brief work to metrix-ad-creative')  # Q8
  it('every spend-path skill has >=1 eval case with a stubbed run')                     # Q10

Evals (Q10), run in CI against the stub:
  metrix-ad-creative/evals/matrix-brief, missing-asset-blocker, lipsync-without-packet
```

Edge cases to cover: brief with zero brand_assets; matrix cells with duplicate names; placement a ratio cannot run (exit 2 path already exists in render.mjs); expired result URL with taskId only; Windows `X:/` defaults absent on Linux (tool resolution must come from `tools/manifest.json`, test asserts no drive-letter default).

### Step 5: Coverage targets

| Category | Target | Rationale |
|----------|--------|-----------|
| brief.ts, run manifest, registry, gate logic | 90%+ branch | Business rules, cheap to test |
| Stage CLIs (timeline, captions, qa, audio-graph) | 80% line | Already well covered; add seam tests not more units |
| render.mjs / runtime.js | Covered by render-health + golden run | Browser code; behavioral not line coverage |
| Vendored HyperFrames skills | Skip | Byte-pinned, upstream-owned |

Add `@vitest/coverage-v8` with thresholds only on `src/brief.ts`, `src/ledger.ts`, the new manifest and registry modules — not a global number that invites test padding.

### Step 6: Quality gates
- Keep `npm run verify` as the single gate; append `test:contracts`, `test:golden`, `check:plugin` (plugin validate + eval run on stub) in that order so failures are cheapest-first.
- Merge rule from Q1: any diff touching `render.mjs`/`runtime.js` requires green render-health and golden runs in CI, not local only.
- Golden fixtures are synthetic and anonymous (fixture-hygiene.test.ts already enforces); client media stays in `out/`.

### Quality checks
- [x] Every business-logic unit (brief, manifest, registry, gates) has a spec
- [x] Every handoff seam has a contract test
- [x] One deterministic e2e per format on the happy path, plus a failure-path run
- [x] Mocks limited to Kie HTTP; render, QA and review run for real
- [x] Locations follow `src/__tests__/` and `scripts/test_*.py` conventions
- [x] Coverage targets scoped, not aspirational
