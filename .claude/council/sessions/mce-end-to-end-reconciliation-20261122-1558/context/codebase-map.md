# Codebase map: metrix-creative-engine (MCE)

## Shape
- TypeScript (ESM, Node >=20, pnpm 10) MCP server + a library of Claude skills + Python/Node scripts. Purpose: take an approved Metrix IAP brief (`creative_briefs.json`) and produce ad creative via Kie.ai (generation), then finish with HyperFrames/ffmpeg/whisper (assembly, captions, QA).
- Build: `node build.mjs` (esbuild) -> `dist/index.js` (bin `kie-ai-mcp-server`). A rebuilt bundle does NOT reach a running MCP server (restart needed).
- Deps: @modelcontextprotocol/sdk, zod 3; dev: esbuild, vitest 4, typescript 5.9, hyperframes 0.9.19.
- Layout: `src/` (server, ~8k lines incl tests), `skills/` (portable skills), `prompts/` (00-07 stage prompts + `formats/{ugc,video,static,carousel,claymation,motion-graphic}.md`), `docs/` (MCP_TOOLS, MODEL_CATALOG, PROMPTING, RUNBOOK, SETUP, UGC_CREATIVE_PLAYBOOK, UGC_PRODUCTION_STANDARD (generated), WORKFLOW_RECONCILIATION, draft-retention, audits/), `scripts/` (checks, Python review/retention/client-library), `tools/manifest.json` (pinned binaries/models, yt-dlp.conf), `sprint/` (setup/load scripts, briefs, refs), `examples/`, `brand-kits/` (anonymous/sample), `GO.cmd`.
- Gitignored: `out/`, `renders/`, `.env*`, dist, node_modules. Client data must never be committed.

## Gate / CI
- `npm run verify` is THE gate, in order: check:copies, check:production-standard, typecheck, test (vitest), build, check:mcp-surface (drives built bundle over stdio against stubbed Kie), test:production-review, test:retention, test:client-library (Python unittest).
- `.github/workflows/ci.yml`: ubuntu-latest, pnpm, Node 22, Python 3.12, apt ffmpeg, google-chrome headless (apparmor userns sysctl lifted; never --no-sandbox), `pnpm install --frozen-lockfile`, `pnpm run verify`, then asserts every `skills/*/` has top-level SKILL.md (zip uploads reject nested).
- Audit `docs/audits/2026-11-21-engine-environment-and-workflow-audit.md`: verify was RED on main (render-health test captured previous source frame; fix in #18 did not hold; latest commit ca2758e "Capture clip frames from a canvas" targets this). Also lists: brief contract stops at 7 asset types (shopping/catalog, slideshow, standalone b-roll/voiceover have no type/route/gate); five broken handoffs (brief->MST cells, review gates not reading QA output, handoff prompt never loaded, two safe-zone sources of truth, two HyperFrames versions). Read it before proposing changes.
- Do not copy test/tool counts into prose; scripts are the inventory.

## Key modules (src/)
- `index.ts` server entry; `config.ts` env (KIE_AI_API_KEY, KIE_AI_DOWNLOAD_DIR, KIE_AI_BASE_URL, KIE_AI_REQUEST_TIMEOUT_MS, KIE_AI_DEFAULT_WAIT_SECONDS).
- `tools.ts` registers MCP tools (kie_create_task, kie_get_task, kie_wait_for_task, kie_run_task, kie_download_result, kie_get_credits, kie_ledger, kie_validate_brief, kie_validate_ugc_preproduction, kie_create_ugc_lipsync; plus render prompts). `input` for models is deliberately a pass-through object (no invented per-model schemas).
- `client.ts` Kie.ai HTTP client (createTask / recordInfo / credit; polling). `protocol.ts` pure wire-shape helpers (TASK_STATES, summarizeTask, RESULT_RETENTION_NOTE). `schemas.ts` zod outputSchemas (must match structuredContent exactly or SDK rejects at call time). `ledger.ts` append-only JSONL task ledger (never fails a render; result URLs expire ~24h, taskId is the only durable handle). `brief.ts` brief validation (ASSET_TYPES, formatVerdict, validateBrief). `prompts.ts` MCP prompts (kie_render_ugc / _ai_ugc / _video). `resources.ts` MCP resources (kie://ugc-creative-playbook, kie://production-review-standard, kie://ugc-preproduction).
- `src/__tests__/` vitest: render-health (real headless Chrome; FAILs not skips in CI), protocol, timeline-schema/check/v19, caption-cues, ugc-preflight, grounding-strict, eye-state, placement-zones, client, ledger, brief, qa-video-*, media-scdet, asr-check, make-row, tools-check, etc.

## Skills (skills/, each installable alone, needs top-level SKILL.md)
- Own: `metrix-ad-creative` (brief -> assets; scripts kie.mjs, ugc-preflight.mjs, client_library.py; references incl preproduction-director), `ugc-creator-edit` (UGC finishing/review; references production-standard.md, review-gates.md, client-library.md; scripts build_standard_doc.py), `metrix-video-assembly` (post-production: scripts render.mjs, timeline.mjs/timeline/, qa-video.mjs, audio-graph.mjs, compose-bed.mjs, beats.mjs, captions/, phrase-align/map, asr-check, make-srt, check-storyboard, placement-zones, render-checks, media/, hyperframes/), `brand-kit-builder`, `kie-generate`, `kie-tasks`, `style-sampling`, `reverse-any-video`.
- Vendored (byte-for-byte, do not edit; `skills/VENDORED.json`, HeyGen hyperframes v0.9.19 Apache-2.0): figma, hyperframes, hyperframes-cli, hyperframes-registry, media-use, remotion-to-hyperframes, slideshow (verify list in file).
- Pipeline intent: brief -> storyboard (check-storyboard) -> raw Kie generations -> post-production (timeline, captions/cutscaps, audio graph/SFX/music bed, transitions, GFX) -> render -> QA (qa-video) -> review gates (prompts/06, review-gates.md) -> client library sync/delivery.

## Single-source-of-truth rules (critical)
- Any file in >1 place has one canonical copy, first in `scripts/skill-copies.json`. Edit canonical, run `npm run sync:copies`; NEVER edit a copy. Canonical examples: docs/UGC_CREATIVE_PLAYBOOK.md, prompts/07-ugc-creative-direction.md, docs/PROMPTING.md -> skill reference copies.
- `docs/UGC_PRODUCTION_STANDARD.md` is GENERATED by `skills/ugc-creator-edit/scripts/build_standard_doc.py` from production-standard.md + review-gates.md; regenerate, never edit. Then sync:copies.
- Installed skill folders: `node scripts/sync-copies.mjs --installed <dir> --write`.
- `docs/WORKFLOW_RECONCILIATION.md` is the ownership table.

## Data models / contracts
- Brief schema: `src/brief.ts` (+ prompts/ and skills/metrix-ad-creative references); asset types list in ASSET_TYPES (seven). Task record: `protocol.ts` TaskRecord / `schemas.ts` taskRecordShape (resultJson, param stay unknown). Ledger JSONL: `ledger.ts`. Timeline schema: skills/metrix-video-assembly/scripts/timeline/. Review records: scripts/prepare_review_record.py, validate_review_gates.py, check_script.py. Client library: scripts/client_library.py (copies in skills). Draft retention: scripts/retain_drafts.py (plan -> review -> apply exact plan; docs/draft-retention.md).
- Backend, brief schema and tool contracts change only when a task needs a field; call it out; new output fields optional.

## External boundaries
- Kie.ai Market API (/api/v1/jobs/createTask, recordInfo, /chat/credit) - costs credits; raw task tools are unguarded. Guarded UGC lipsync: kie_validate_ugc_preproduction then kie_create_ugc_lipsync (validates local bindings only, not listening/approval).
- Local tooling per `tools/manifest.json`: ffmpeg/ffprobe, headless Chrome (HyperFrames render), whisper.cpp + pinned models, MediaPipe venv, yt-dlp, Google Fonts.
- Session MCPs (Higgsfield, Canva, Figma, Flashloop, Drive, GitHub) exist in the harness but are not repo dependencies.

## Reviewer must-knows
- AGENTS.md rules: no spend/publishing authority added by workflow docs; client profiles/copy/receipts stay in gitignored out/ or renders/ or external private dir; shared examples/fixtures anonymous; read prompts/07 and relevant playbook stage before UGC/video; review via prompts/06 + production standard; send providers only shot-specific instructions.
- Never hand-edit copies or generated docs; run verify fully before calling done; don't spend Kie credits or call live APIs in review.
- CI cannot skip the browser render test; `.claude/council/` is untracked (council session output, do not commit).
- Commit trailers: Co-Authored-By + Claude-Session lines per session reminder.
