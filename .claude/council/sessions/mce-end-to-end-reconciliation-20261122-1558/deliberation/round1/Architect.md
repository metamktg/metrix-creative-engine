# Architect Position — MCE end-to-end reconciliation (brief JSON to launch-ready creative, every format, CI green)

**Core recommendation:** Build the data spine before any new format: a `mce.formats/1` registry (one row per asset_type) and a `mce.run/1` append-only manifest where every stage writes a schema-stamped, hash-bound report, so review can only pass what QA passed and handoff can only ship what review signed. Then express post-production (VO, music bed, SFX, GFX layers, transitions, cuts, captions) entirely as fields in `mce.timeline/2`, so every editorial decision is checkable by a script in CI rather than living only in composition HTML.

**Key argument:**
The engine already has strong stage-local contracts (16 `mce.*/N` schema ids across timeline, cutplan, phrasemap, zones, eyestate, asrcheck) but no contract *between* stages, which is exactly where every one of the audit's broken handoffs sits. The shape of the data tells you the fix: (1) the brief is stripped at the door because `briefSchema` is a plain `z.object` and declares neither `testing_framework.cells` nor `matrix_naming_convention`, which `make-row.mjs:33-34` hard-requires; (2) `qa-video.mjs:428` prints its report to stdout with no `schema` id and no input hashes, so `validate_review_gates.py` (which binds artifacts by sha256 only) has nothing to bind; (3) format knowledge is keyed by `asset_type` in at least four code places (`ASSET_TYPES`/`MOTION_TYPES` in `src/brief.ts`, `FORMAT_MODULES` plus the hard-coded `requiresProductionReview` list in `src/prompts.ts:85`, storyboard `kind`, the zone table) and they already disagree (claymation is in `ASSET_TYPES` but not in `MOTION_TYPES`; carousel has a storyboard kind nothing renders). One registry row per format, read by brief, prompts, storyboard check, render, QA and review, removes drift by construction; one run manifest that each stage appends to (inputs by path+sha256, outputs by path+sha256+schema, verdict) turns "proof on every technical claim" into a mechanical property. Post-production completes the picture: the timeline schema already models clips, shots, scenes, cut points, caption groups, `audio.voice`, `audio.sfx[]` and `audio.music.sections[]`, and `audio-graph.mjs` already sidechain-ducks music under voice, but there is no field for transitions or GFX layers (zero matches for `transition`/`gfx`/`overlay` in `timeline/schema.mjs`), so those agency-quality details are unverifiable today. Adding optional `transitions[]` (bound to cut point ids) and `gfx[]` (layer, from/to refs, zone id, copy source) to `mce.timeline/2` lets `timeline check`, `render --mode check` and `qa-video` assert them the same way they already assert captions. Every addition is an optional field or a new schema id, so nothing existing breaks.

**Risks if ignored:**
- Structural/data: new formats (static-compose, shopping/DPA, carousel, VO, b-roll, ingest) each re-encode format rules in another place, raising the six-place drift; a shopping price or carousel card count retyped instead of bound to the brief/feed by field path is a launch-blocking factual error the gates cannot see.
- Integrity/performance: without hash-bound stage reports, a stale or failed QA artifact can satisfy review (proven gap: review never reads QA), and re-runs cannot be skipped safely, so every retry re-spends Kie credits on generations that already settled (the ledger holds the taskId, but no stage knows which output it fed).
- Integration/migration: two Kie protocol implementations (`src/client.ts`+`src/protocol.ts` vs `skills/metrix-ad-creative/scripts/kie.mjs`, 374 lines) and non-Kie outputs (Higgsfield, Canva, direct Gemini/Veo, vendored `media-use` routing to HeyGen) mean spend and provenance live outside one ledger; the MST scan receives no receipt, so downstream cannot prove only the isolated slot changed.

**Dependencies on other domains:**
- Craftsman: test design for the registry-consistency test (every registry row resolves to an existing prompt module, zone ids, QA and review gates), golden fixture briefs per format, and stubbed spend-path evals (Q10); owns keeping `npm run verify` the single gate.
- Skeptic: failure modes of the run manifest (partial writes, hash of a file mutated after its stage, concurrent runs on one `out/` dir) and of feed-bound shopping renders.
- Advocate/Artisan (creative quality lens): the per-format quality bar that becomes registry `qa`/`review` gate lists, transition and GFX vocabulary (what `kind` values are allowed), caption style rules per placement.
- Operator: CI runtime budget (Chrome render test cannot be skipped), plugin packaging and `plugin validate` in CI (Q9), and the environment variables that replace the `X:/Metrix/...` Windows defaults.
- Owner / Metrix IAP: the versioned upstream brief JSON schema (Q3); until it exists we mirror field names exactly.

---

## Appendix A — Context Briefing (codebase-context)

### Tech Stack
- **Runtime/Language:** Node >=20 (CI Node 22), TypeScript ~5.9.3, ESM; Python 3.12 for review/retention/client-library gates.
- **Server:** `@modelcontextprotocol/sdk` ^1.21.1, `zod` ^3.25.76; bundled by esbuild ^0.27.3 to `dist/index.js` (bin `kie-ai-mcp-server`).
- **Test:** vitest ^4.1.10 (includes real headless Chrome render-health test), Python unittest.
- **Media:** ffmpeg/ffprobe, headless Chrome via CDP (`render.mjs` + `runtime.js`), whisper.cpp v1.9.5 + pinned ggml models, MediaPipe venv, `hyperframes` 0.9.19 (devDependency) vs 0.8.186 in `tools/manifest.json` (`cli_permitted: false`).
- **Database:** none. Persistence is files: JSONL ledger (`src/ledger.ts`), JSON stage reports, gitignored `out/` and `renders/`.
- **Auth:** Kie `Authorization: Bearer` (proxy-injected in cloud); optional Gemini `x-goog-api-key`, ElevenLabs `xi-api-key`.
- **Hosting:** local stdio MCP server; CI on GitHub Actions ubuntu-latest.

### Directory Structure (annotated)
```
src/                    MCP server: index, config, tools, prompts, resources, client+protocol (Kie), schemas, ledger, brief
  __tests__/            vitest suites incl. render-health (real Chrome)
prompts/                00-core 01-brand-intake 02-render-bridge 03-handoff(never imported) 04-self-validation 05-mst 06-production-review 07-ugc-creative-direction
  formats/              carousel claymation motion-graphic static ugc video
skills/                 15 skill folders + VENDORED.json
  own (6)               metrix-ad-creative, metrix-video-assembly, ugc-creator-edit, kie-generate, kie-tasks, brand-kit-builder
  vendored (9)          figma, hyperframes, hyperframes-cli, hyperframes-registry, media-use, remotion-to-hyperframes, reverse-any-video, slideshow, style-sampling
  metrix-video-assembly/scripts/  render.mjs runtime.js timeline.mjs timeline/{schema,plan,check,emit,rules} qa-video audio-graph compose-bed beats captions/ phrase-map phrase-align asr-check make-srt make-row check-storyboard placement-zones render-checks media/
scripts/                sync-copies, check-mcp-surface, validate_review_gates.py, prepare_review_record.py, check_script.py, retain_drafts.py, client_library.py
tools/manifest.json     pinned binaries/models
docs/                   playbooks, standards (generated), audits/
```
Note for the council: the brief said "16 skills"; the tree has 15 skill folders. `reverse-any-video` and `style-sampling` are vendored (per `skills/VENDORED.json`), not own.

### Architectural Patterns
- **Pipeline:** file-in/file-out stage CLIs, each validating its own schema and emitting JSON to stdout or a named file; no orchestrator.
- **Contracts:** stage-local schema ids (`mce.timeline/1|2`, `mce.cutplan/1`, `mce.phrasemap/1`, `mce.zones/1`, `mce.eyestate/1`, `mce.asrcheck/1`, `mce.captioncues/1`, `mce.qaexempt/1`, `mce.tools/1|2`); inputs bound by `{path, sha256, schema}` inside the timeline (good precedent).
- **Gates over parsers:** `validateBrief` blocks, never repairs; review gates hash-bind evidence.
- **Single source of truth:** `scripts/skill-copies.json` byte copies; generated standard doc.

### Data Model
| Entity | Where | Key fields | Relationships |
|---|---|---|---|
| Brief | `src/brief.ts` briefSchema | brief_metadata{brief_id, asset_type, confidence, mode}, creative_specifications, visual_direction, copy_architecture, brand_assets[], testing_framework{isolated_variable, matrix_position}, qa_requirements | 1 brief -> 1 format row; matrix brief -> N cells (fields stripped today) |
| LedgerEntry | `src/ledger.ts` | ts, taskId, model, event created/settled, resultUrls, name, param, credits | many per task; no link to brief_id or run |
| Storyboard | check-storyboard input | schema_version 2, format{ratio, placement}, scenes[].text[] | derives timeline (`derived_from` hash) |
| Timeline | `mce.timeline/2` | clips, shots, scenes, points(cut/event), captions.groups, audio{voice, sfx[], music{sections}}, inputs{phrasemap, cutplan by sha256} | consumes cutplan/phrasemap; feeds emit/render/qa |
| Zone | `mce.zones/1` | ratio, placements[], top/bottom/side, enforcement | referenced by storyboard placement and (in working tree) render check |
| QA report | qa-video stdout | no schema id, no input hashes | should feed review; does not |
| Review record | validate_review_gates.py | artifacts{role: sha256}, bundle_sha256, evidence[], checks | binds files, not QA verdicts |
| Receipt / handoff | prompts/03-handoff.md | (none written) | MST scan expects it |

```
Brief ──1:1──> FormatRow ──> Storyboard ──derived_from──> Timeline ──> Render ──> QA ──X──> Review ──X──> Receipt
  │                                  ▲                       ▲
  └─cells(stripped)──X──> make-row    └──── Ledger(taskId) ───┘   (no brief/run link)
X = missing edge
```

### Conventions
1. Schema ids `mce.<noun>/<int>` with literal check, e.g. `schema: lit(TIMELINE)` in `timeline/schema.mjs`.
2. Hash binding `{path, sha256, schema}` for derived inputs, e.g. `inputs.cutplan` in the timeline.
3. snake_case JSON fields, camelCase TS identifiers (`brief_metadata` vs `validateBrief`).
4. Canonical-copy discipline: edit the first path in `skill-copies.json`, run `npm run sync:copies`.
5. Verdicts as `PASS|WARN|FAIL` with reasons arrays (render check, zone check, storyboard check).

### Infrastructure Constraints
- One gate: `npm run verify`; CI must not skip the Chrome render test.
- Rebuilt `dist/` does not reach a running MCP server; a bundled `kie.mjs` (Q7) inherits this.
- Windows defaults `X:/Metrix/...` in `media/eye_state.py:179`, `media/eye-state.mjs:211`, `asr-check.mjs` — must resolve from env (`MCE_*`) or `tools/manifest.json`, never a drive letter.
- Working tree carries an uncommitted `render.mjs` change that routes `--mode check` through `placement-zones.mjs` `zoneFor`/`checkBoxes` (closes deepen finding 1, 20% vs 35%); it is not yet committed or CI-proven.
- Client data only in gitignored `out/`, `renders/`.

### Integration Points
| Service | Purpose | Auth |
|---|---|---|
| Kie.ai Market API (`api.kie.ai`, upload `kieai.redpandaai.co`) | image/video/TTS/music generation | Bearer, proxy-injected |
| Gemini / Veo direct | fallback generation, TTS | `x-goog-api-key` |
| ElevenLabs | TTS fallback | `xi-api-key` |
| HeyGen (via vendored media-use) | music/SFX/stock/voice catalog | HeyGen sign-in, outside ledger |
| Higgsfield, Canva, Figma, Flashloop MCPs | optional finishing | harness OAuth, not repo deps |
| Metrix IAP (upstream) | `creative_briefs.json` | file handoff |
| metrix-mst-creative-scan (downstream) | row manifest + receipt | file handoff |

### Warnings / Tech Debt
- `brand_assets` is an array; five docs gate on `brand_assets.missing` (object) — the blocker is unexpressible.
- `qa-video` output is unaddressable by hash or schema.
- `kie_create_task` bypasses the UGC preproduction guard.
- HyperFrames 0.9.19 vs 0.8.186 pin disagreement.
- `metrix-video-assembly/SKILL.md` is 607 lines; stage knowledge belongs in CLIs and registry, prose should point at them.

---

## Appendix B — Contract design (api-design applied to stage CLIs and files)

The "API" here is a set of file contracts and one CLI. No new MCP tools are required for the spine; one optional MCP tool (`kie_run_status`) may read the manifest later.

### B1. Format registry — `skills/metrix-ad-creative/references/formats.json` (canonical; copies via skill-copies.json; `src/` imports it at build)

```ts
interface FormatsFile { schema: "mce.formats/1"; formats: FormatRow[] }
interface FormatRow {
  asset_type: string;                 // brief enum is GENERATED from this list
  aliases?: string[];                 // replaces RATIO_SUFFIX special-casing where needed
  medium: "image" | "image_set" | "video" | "audio";
  motion: boolean;                    // replaces MOTION_TYPES
  style_of?: string[];                // claymation: a style applicable to these media
  required_brief_fields: string[];    // dotted paths, e.g. "creative_specifications.duration_seconds", "cards", "feed"
  placements: string[];               // zone ids in mce.zones/1
  prompt: { module: string; review: boolean };     // replaces FORMAT_MODULES + requiresProductionReview
  plan: { storyboard_kind: string | null; shotlist: boolean };
  route: "compose_static" | "compose_set" | "assemble_video" | "vo" | "broll" | "ingest";
  qa: string[];                        // gate ids: "qa_video", "qa_image", "qa_set", "feed_integrity", "asr_lock"
  review: string[];                    // review gate ids from review-gates.md
  handoff: { receipt: true; mst_row: boolean };
}
```
Order of rows matches Q5: existing seven, then `static_compose` route under `static`, `shopping`, `carousel` via `compose_set`, `voiceover`, `broll`, ingest as a route not a type.

CI test (vitest, no network): every row resolves its prompt module file, every placement exists in `mce.zones/1`, every qa/review id has an implementation, `ASSET_TYPES === formats.map(asset_type)`.

### B2. Brief extensions (optional, upstream names, Q3)
```ts
testing_framework: { isolated_variable?, matrix_position?,
  cells?: Array<Record<string, string>>; matrix_naming_convention?: string }
cards?: Array<{ index: number; job: string; copy?: Record<string,string> }>;   // carousel
feed?: { path?: string; url?: string; format: "csv" | "meta_catalog"; sku_field: string; bind: Record<string,string> }; // shopping
script?: { text: string; sha256?: string; voice?: string };                    // VO/AI-UGC lock
brand_assets: Array<BrandAsset> | { items: BrandAsset[]; missing?: string[] }  // accept both; normalize to object
```
Cross-field rules: `mode=matrix` and route uses rows -> `cells` and `matrix_naming_convention` required; registry `required_brief_fields` checked generically. Use `.passthrough()` on `testing_framework` only after the fields are declared, so nothing upstream is silently dropped again.

### B3. Run manifest — `out/runs/<run_id>/run.json`
```ts
interface Run {
  schema: "mce.run/1";
  run_id: string;                      // `${brief_id}--${utc compact}`
  brief: FileRef;                      // normalized brief, hashed
  format: string;                      // registry asset_type
  registry_sha256: string;
  stages: StageRecord[];               // append-only; never rewritten
}
interface FileRef { role: string; path: string; sha256: string; schema?: string }
interface StageRecord {
  stage: "plan" | "generate" | "ingest" | "assemble" | "render" | "qa" | "review" | "handoff";
  seq: number; started_at: string; finished_at: string;
  tool: { name: string; version: string };      // CLI + package version or git sha
  inputs: FileRef[];                            // each MUST equal an output of an earlier stage or the brief
  outputs: FileRef[];
  ledger_task_ids?: string[];                   // generate/ingest
  verdict: "PASS" | "WARN" | "FAIL" | "BLOCKED";
  reasons: string[];
}
```
Invariants (each a test): a stage may run only if every input hash matches a prior output; `review` requires a `qa` record with `verdict=PASS|WARN` whose outputs include every artifact reviewed; `handoff` requires `review` PASS. Re-run of a stage with identical input hashes and a PASS record is a no-op (credit-safe resume). Writes are temp-file + rename.

### B4. CLI — `node skills/metrix-ad-creative/scripts/mce.mjs <cmd>`
| Command | Reads | Writes | Spend |
|---|---|---|---|
| `run init --brief <json>` | brief, registry | run.json, normalized brief | no |
| `run plan` | brief | storyboard (+ shotlist for b-roll, cue sheet for audio) | no |
| `run generate [--quote]` | plan | Kie tasks via bundled client; ledger lines with `run_id` | yes, quote first |
| `run ingest --file <f> --origin <o>` | any external file | ledger line `provider!=kie`, FileRef | no |
| `run assemble` | plan + generated/ingested refs | timeline, compositions, audio graph | no |
| `run render` | timeline/compositions | masters, stills | no |
| `run qa` | masters | `mce.qa/1` report file | no |
| `run review` | qa report + masters | review record via validate_review_gates.py | no |
| `run handoff` | review record | `mce.receipt/1`, MST `mce.row/1` when matrix | no |
| `run status` | run.json | stdout summary | no |

Exit codes: 0 PASS/WARN, 1 FAIL (gate), 2 input/contract error, 3 BLOCKED (missing asset, missing packet, unapproved spend). Stub mode (`KIE_AI_BASE_URL` pointing at the existing check-mcp-surface stub) covers Q10 evals in CI.

### B5. QA report — `mce.qa/1` (qa-video, new qa-image, qa-set write a file, not only stdout)
```ts
interface QaReport { schema: "mce.qa/1"; subject: FileRef; inputs: FileRef[];   // timeline, storyboard, zones
  checks: Array<{ id: string; verdict: "PASS"|"WARN"|"FAIL"; reasons: string[] }>;
  verdict: "PASS"|"WARN"|"FAIL"; exemptions?: FileRef }
```
`validate_review_gates.py` adds artifact role `qa_report`; FAIL if absent, if `subject.sha256` differs from the master under review, or if `verdict=FAIL`.

### B6. Ledger additions (optional fields; `src/ledger.ts`)
`provider?: "kie" | "gemini" | "veo" | "elevenlabs" | "higgsfield" | "canva" | "heygen" | "desktop"` (absent means kie), `run_id?`, `brief_id?`, `file_sha256?` for ingested outputs. Non-Kie outputs get a synthetic `taskId` `ext:<sha256[:16]>`. Vendored media-use stays byte-identical; the router skill states that any media-use acquisition enters through `run ingest`.

### B7. Post-production in `mce.timeline/2` (optional, additive)
```ts
transitions?: Array<{ id; at: PointRef /* a cut point id */; kind: "cut"|"dissolve"|"dip"|"whip"|"match"|"wipe"; dur: number; why: string }>;
gfx?: Array<{ id; layer: "lower_third"|"price_badge"|"logo_bug"|"end_card"|"cta"|"sticker"|"progress";
  from: Ref; to: Ref; zone: string /* mce.zones/1 id */; copy_source?: string /* brief or feed path */; enter?: string; why: string }>;
audio.duck?: { under: "voice"; depth_db: number; attack_ms: number; release_ms: number }; // makes audio-graph's sidechain values declarative
grade?: { lut: FileRef; before_after: FileRef[] };
```
Checks: `timeline check` rejects a transition on a non-cut point or longer than the adjacent min_shot; every `gfx` box is zone-checked by `render --mode check`; every `copy_source` resolves to a value equal to on-screen text (same rule captions already follow); `qa-video` measures LUFS vs `storyboard.lufs`, true peak, and voice intelligibility under the bed.

### B8. Handoff receipt — `mce.receipt/1`
`{ schema, run_id, brief: FileRef, format, deliverables: FileRef[] (per ratio/mode), qa: FileRef, review: FileRef, ledger: { task_ids: string[], credits_total?: number }, mst?: { row: FileRef } }`. `prompts/03-handoff.md` is imported in `src/prompts.ts` and attached to every format prompt as the last section.

### Error contract (shared by all CLIs)
| Code | Exit | When |
|---|---|---|
| CONTRACT_SCHEMA | 2 | input file schema id missing or wrong |
| CONTRACT_HASH | 2 | input sha256 does not match the producing stage's output |
| GATE_FAIL | 1 | any check FAIL |
| BLOCKED_ASSET | 3 | required brief field or brand asset missing |
| BLOCKED_SPEND | 3 | generate without quote, lip sync without packet |
| TOOL_MISSING | 2 | resolver cannot find ffmpeg/chrome/whisper from env or manifest |

### Sequencing (fits Q1 parallelism)
1. Commit the working-tree safe-zone change only with verify + CI green.
2. In parallel (no render.mjs/runtime.js contact): registry + generated brief enum + prompts read registry; brief optional fields; `mce.qa/1` file output + review reads it; ledger optional fields; tool resolver; plugin.json + CI `plugin validate`.
3. Run spine CLI over existing stages (video first, then static).
4. Timeline B7 fields and checks (touches render check: gated by CI).
5. New routes in Q5 order, each a registry row plus a golden fixture brief that runs end to end in stub mode in CI.
