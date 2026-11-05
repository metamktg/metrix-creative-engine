# Provider operations

Use the provider already selected by the user or approved render plan. For an unspecified Metrix engine job, use its Kie path. A Higgsfield request stays on Higgsfield unless a switch is authorized. Model names and credit units are provider-specific even when the underlying model family is similar.

This reference retains the 2026-10-09 routing baseline with capability wording reconciled on 2026-11-05. Inspect current tool schemas and model constraints again before calling them. No generation is authorized merely because a tool is available.

## Higgsfield

1. Discover the available tools; confirm the intended workspace/project from the existing context. Do not silently change workspace, create speculative projects or upload unrelated assets.
2. Read balance, then inspect `models_search`/`models_get` for eligible models and supported duration, resolution, references and lip-sync inputs. Defaults are not evidence of best value. Preserve an approved voice and its exact identifiers; use the provider's actual voice-selection flow when selection is missing.
3. For images use `estimate_image_cost`; for video use `estimate_video_cost`. Their `params` mirror the respective generation request. Quotes using HTTPS image references may import them into the media library. For price-only work, omit references when supported; reuse confirmed media IDs/prepared parameters to avoid repeated uploads. A successful quote does not prove input readiness.
4. The current `generate_audio` schema can expose both speech and music engines; eligible engines, fields and quoting behavior are operation-specific. Use `get_cost: true` without submission only where the live schema documents it. Do not infer SFX support from generic audio support or copy speech inputs into music generation. Preserve the user-selected engine/voice rather than reverting to a provider default. An already accepted performance remains preferable to a new paid audition when it meets the brief.
5. Store the quote, exact normalized settings and reservation. Read missing-input checks and adjustments; resolve them before spending. Requote if cost-affecting settings change. Submit exactly once with the approved inputs and save returned IDs immediately.
6. Use `jobs_wait` with the supported wait limit (15 seconds when inspected) to resume submitted jobs. A transport timeout may leave submission unknown: retain its reservation and recover status before deciding whether another request is needed.
7. Ordinary generation tools already display an updating widget; do not open duplicate widgets to refresh it. Explicit review previews and batch/preset flows have their own display rules. Save accepted files and provenance promptly.

Named presets require their own resolved instructions. A generic UGC request does not select an expensive multi-stage preset, AI influencer batch or ad-multiplier workflow. Do not send a catalog ID as a model ID. Every paid preset, edit, upscale or batch remains subject to the run budget, and editing costs may be separate from generation credits.

## Kie through Metrix Creative Engine

Use the existing `kie-ai` MCP tools when connected, otherwise the engine's existing `skills/metrix-ad-creative/scripts/kie.mjs` (or its installed copy). This skill deliberately does not ship a fourth client. If neither the engine/client nor MCP exists, report that capability gap; do not claim this wrapper implements the provider.

Read the engine's dated format/model routing and verify any unsupported or unverified model details against the current official model documentation. Never copy Higgsfield model IDs or parameters into a Kie request. Keep video ratio, duration and resolution as actual supported fields.

| Need | Existing path |
| --- | --- |
| Balance | `kie_get_credits` or client `credits` |
| Existing IDs/results | `kie_ledger`, existing `kie-ledger.jsonl`, or client `ledger` |
| Submit one job | `kie_create_task` or client `start` (or a supported create-and-wait path) |
| Resume | `kie_get_task` / `kie_wait_for_task`, or client `poll` on the original task ID |
| Upload reference | Existing client `upload`; inspect supported upload tools if using MCP |
| Keep output | `kie_download_result` when configured, or the client's supported output/download path |

The inspected server exposes balance and returned task costs, not an authoritative pre-submission quote or budget-reservation API. Get a current official price/rate for the exact settings, label it as an estimate when appropriate and reserve its conservative upper bound. Do not invent `kie_estimate_cost` or pass budget sidecar fields as model inputs.

Returned task data can contain nullable `creditsConsumed`. Persist it separately because `src/ledger.ts` stores recovery events without this cost field. Unknown is not zero. A timeout is not a failed job; resume it. The client documents exit 2 for a wait timeout, so check IDs/status instead of calling create again.

Provider result links can expire. Keep the task ID, download on success and recover/re-poll that task before paying to regenerate. Verify current reference expiry rules and refresh the same source when required; expired transport URLs do not justify a new creative generation.

Use a separately available editor for composition, captions and stems. A Kie render or this engine's MCP server is not evidence that a complete editing application is available. If finishing capability is missing, resolve that before spending on an unfinished production pipeline.
