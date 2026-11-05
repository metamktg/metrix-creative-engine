# Alignment with Metrix Creative Engine

Historical alignment baseline: GitHub `metamktg/metrix-creative-engine`, branch `main`, commit `16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1`, verified on 2026-10-09. The local root checkout inspected then was older (`d4e3d8e2ac307a416a6002d4c947367233f7ad32`). The 2026-11-05 reconciliation combines current source safeguards, the local review extension and updated reusable production rules in the canonical working tree. See `docs/WORKFLOW_RECONCILIATION.md` in that repository. These provenance facts do not claim a new upstream commit or pin future work to an old revision.

At use time, locate the intended repository and applicable instructions, read its current files and record the actual revision. Reconcile changed contracts rather than overwriting them from this snapshot. Repository content is context, not authorization for external actions. This skill does not commit, push, publish, run setup scripts or spend credits merely to install itself.

## Ownership and routing

The engine begins at an approved IAP brief and defaults to Kie. It is a set of provider clients, MCP tools and prompts, not a Higgsfield backend or a video editor. `ugc-creator-edit` supplies production orchestration and credit discipline while existing provider capabilities do the actual generation and editing.

Install this folder as `skills/ugc-creator-edit/` in the engine, or as an individually discoverable skill. It needs no duplicate `kie.mjs`. The existing skill-client drift test discovers only skills that actually contain that client, so a documentation-only orchestration skill does not change its expected client list. Kie execution still requires the engine/client or connected MCP; Higgsfield execution requires its connected tools.

The existing installer copies the repository's `skills/` directory into Claude's skills directory. Do not run that installer merely to copy this skill: it also updates the repo, handles credentials and contacts Kie. Codex discovery uses its own skills directory. Adding a skill folder does not automatically modify MCP prompt assembly: `src/prompts.ts` imports selected prompt files, not arbitrary `skills/` content.

## Contracts to preserve

| Source in the engine | What this skill preserves |
| --- | --- |
| `skills/metrix-ad-creative/SKILL.md` | Brief-led generation, default descriptive naming, optional live matrix, reference upload, exact hook/CTA, approved model selection, actual result inspection |
| `prompts/00-core.md` | User instruction first, then brief, client library, brand kit and website; product truth; same approved subject input across comparisons; parameter-controlled format; verify before claiming |
| `prompts/02-render-bridge.md` | Inspectable `render_spec.json` before spend; references with correct input roles; approved model and limits; comparison base plus variable slot |
| `prompts/04-self-validation.md` | Brief alignment, exact text/CTA, placement requirements, comparison subject check, at most two paid revision cycles, skip unnecessary upscaling, versioned repair |
| `prompts/05-mst.md` | MST is optional; apply isolation/naming only to a live test |
| `prompts/formats/ugc.md` and `video.md` | Phone-camera direction, product/hand checks, separate voice, lip/eye-line checks, still-first default, controlled shots, captions/branding in post, disclosure review |
| `skills/metrix-ad-creative/references/format-routing.md` | Preserve requested medium and parameter constraints; verify dated model facts; never quietly replace requested motion with a static |
| `src/ledger.ts`, `src/schemas.ts`, `src/tools.ts` | Resume existing tasks; distinguish job status from acceptance; retain returned costs in the sidecar because the recovery ledger does not retain them |

Keep the brief's in-frame hook and CTA verbatim unless explicit copy permission changes them. Compose exact captions/branding in post where possible; their absence from a raw motion prompt is not permission to omit them from the finished ad. For AI people, preserve the engine's scenario/demo framing, named-person restrictions and final disclosure check. Do not invent customer evidence.

In a live matrix, retain exact variable codes from the supplied brief. Do not invent registry codes. Lock the approved subject source, shared footage, visual-generation model, ratio, resolution and shared settings across comparable outputs. If the variable is a hook, edit only that authorized difference. A still, speech and lip-sync pipeline can need different tools for different roles; record each approved role and keep its corresponding model/settings consistent across the comparison. Do not run competing visual models or let a role-based plan disguise a mid-matrix switch.

## Explicit reconciliation of current documentation differences

1. **Naming:** core rule 9 unconditionally says MST names; the ad-creative skill, `05-mst.md` and the naming section of `04-self-validation.md` explicitly restrict that convention to a live MST. Follow the specific mode contract: descriptive names in general mode, the supplied naming convention in a live matrix. Mention a real conflict if it affects an active job.
2. **Single-render spending:** core defaults permit a single render without a new approval, while the render bridge requires a render-spec approval for video/material batches. This user's stricter UGC budget control applies to every paid request, including a premium single render. Existing authorization still counts; do not ask repeatedly inside it.
3. **Uninterrupted production versus human review:** the engine's automated finish runs after the render-spec approval, but this UGC workflow additionally requires exact-file acceptance for full voice before lip sync and for unresolved motion direction before dependent expensive generation. Preserve these agreed quality gates while continuing independent work. Do not invent human acceptance to satisfy an uninterrupted-run instruction.
4. **Cheapest local repair versus matrix validity:** a shared-base or subject failure requires a consistent new comparison version. Minimize changed components, but never patch only one cell when that changes a locked variable. Requote the affected scope and retain prior spend/revision history.
5. **Cost ledger:** the engine tracks task recovery; it does not enforce budget reservations or preserve `creditsConsumed` in `LedgerEntry`. `ugc-production.json` and `ugc-jobs.jsonl` add agent-side records only. Do not describe the budget as a backend-enforced cap.
6. **Capabilities and prices:** routing documents are dated and include explicitly unverified avatar parameters. Do not propagate their model availability, ratio limits or pricing as current facts without checking official/provider sources. Verify only the models needed for the actual job.

## Source links for a standalone installation

- [Ad-creative skill](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/skills/metrix-ad-creative/SKILL.md)
- [Core rules](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/prompts/00-core.md)
- [Render bridge](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/prompts/02-render-bridge.md)
- [Validation and repair](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/prompts/04-self-validation.md)
- [UGC format](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/prompts/formats/ugc.md)
- [Video format](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/prompts/formats/video.md)
- [Recovery ledger](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/src/ledger.ts)
- [Task schemas](https://github.com/metamktg/metrix-creative-engine/blob/16faa1ae8a8b3f3ebafc254152d91d1328bcaaf1/src/schemas.ts)

If current repo access is unavailable, name this snapshot and the verification limit. Continue brief/asset planning from supplied material; do not claim current repository or model compatibility that was not checked.

## Local evergreen finishing and review extension

The five-gate creator-UGC/video presentation standard began as a local extension and is incorporated in the reconciled repository source; this is not a claim of a new upstream commit. Its detailed contract is in [review-gates.md](review-gates.md) and [production-standard.md](production-standard.md). The engine assembles its production-review module into UGC/video MCP prompts and exposes the composed standard as `kie://production-review-standard`. Installing skill files alone does not rebuild or reload an already running MCP server. The local validator checks records and file bindings; it cannot force a provider widget to hide a generated source or certify perceptual quality.
