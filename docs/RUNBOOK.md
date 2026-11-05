# Creative runbook

One prompt per media format. Give it a brief, it gives you a named asset.

## UGC and video production review

`kie_render_ugc`, `kie_render_ai_ugc` and `kie_render_video` load the short
mandatory production-review and creative-direction modules. Read the complete
shared standard on demand from the bundled
`kie://production-review-standard` resource, or
[`UGC_PRODUCTION_STANDARD.md`](UGC_PRODUCTION_STANDARD.md), before finishing.
It defines music selection and rights, speech-first mixing, deliberate cuts,
native pacing, documented B-roll speed changes and motion-source quality.

The current private brief and its production reference decide the creative
treatment, audience, offer, voice, model changes and source reuse. A technique
that worked in one edit is not a compulsory overlay, full-screen, transition or
music recipe for every brand. Preserve accepted source files; replacing a
presenter creates new identity/performance acceptance while suitable independent
B-roll and real UI remain reusable inventory.

Before approved client presentation, all five gates must pass against the
current master and review context: `iap_variables`, `communications`,
`sound_check` (the "12-Year-Old Sound Check"), `editorial_peer` and
`blind_review`. Their evidence must describe actual checks and reviewer roles;
an automated technical pass cannot claim human listening. Failed, pending,
unavailable or stale evidence blocks presentation. Clearly labeled internal
previews and independent preparation may continue within existing authority.

Use the standard's local validation command and release-record schema. The
validator is an agent-side eligibility check, not a provider backend control.
Reusable SOPs, fixtures and reports use anonymous neutral IDs and avoid
client-, industry- or niche-specific examples. The approved private brief
remains authoritative for actual creative content and product evidence.

Run `npm run verify` after changes: it includes engine tests, the rebuilt MCP
surface and production-review record tests. These tests do not create perceptual
acceptance for an actual video. Existing server processes need their normal
client reload/restart to load the rebuilt bundle; do not stop another session's
active server without coordinating its work.

## Before any run, twice

1. **Check the brief.** `kie_validate_brief` (MCP only; the script has no brief
   command), or ask for it in words. Free, offline, and it refuses an
   unrenderable brief before a credit is spent.
2. **Inventory the brand kit and accepted sources.** Reuse appropriate local
   B-roll/UI in assembly. Upload only the references a missing generation
   actually consumes, through the existing skill's `scripts/kie.mjs upload`
   command; record the returned URL and asset role. Existing reference material
   must reach the generator in the correct input role rather than being replaced
   with an invented product.

## The table

| Format | `asset_type` | Prompt | Must supply | Also reads | Produces |
| --- | --- | --- | --- | --- | --- |
| Single image | `static` | `kie_render_static` | ◆ brief, ▲ placement | ■ product refs, ◇ on-image text | 1 image |
| Carousel | `carousel` | `kie_render_carousel` | ◆ brief, ▲ card structure | ■ product refs | 3–5 images, one system |
| Video | `video` | `kie_render_video` | ◆ brief, ▲ duration | ■ approved still ✦, ■ product refs | source shots, then assembled required exports |
| UGC | `ugc` | `kie_render_ugc` | ◆ brief, ▲ duration | ■ product refs | sources, then the finished edit and required layouts |
| AI-UGC ✱ | `ai_ugc` | `kie_render_ai_ugc` | ◆ brief, ▲ duration, ▲ script or audio | ■ avatar ref | accepted presenter sources, then finished edit |
| Motion graphic | `motion_graphic` | `kie_render_motion_graphic` | ◆ brief, ▲ duration | ■ logo, ■ type spec | frames, or 1 clip |
| Claymation | `claymation` | `kie_render_claymation` | ◆ brief, ▲ ratio | ■ real props or set refs | 1 image or clip |
| – | Brand kit setup | `kie_brand_intake` | ◆ brief | ■ any client asset | uploaded URLs |
| – | Sprint test ✧ | `kie_mst_sprint` | ◆ brief set, ▲ isolated variable | ■ product refs | one matrix |

### Legend

| | |
| --- | --- |
| ◆ | **The brief**, as JSON. Everything else is optional detail on top of it |
| ▲ | **Required by the brief**, the render is blocked without it |
| ■ | **Reference material**, uploaded URLs, not local paths |
| ◇ | A switch inside the format that changes which models are eligible |
| ✦ | Strongly preferred: approve a still first, then animate it. A bad composition costs image credits to reject, not video credits |
| ✱ | Avatar model parameters are **unverified**. Fetch the model page before the first run |
| ✧ | **Optional.** A Matrix Sprint Test is a sprint you choose to run, not a stage every brief passes through |

**Ratio comes from placement, never from the prompt text.** Feed `4:5`, feed
plus right column `1:1`, Stories and Reels `9:16`, in-stream `16:9`.

**An `asset_type` not in this table stops.** It is not routed to the nearest
neighbour: a static rendered for a brief that asked for motion looks finished,
passes a casual review, and fails the thing the brief was testing.

## The prompts

Every prompt in the table is an MCP prompt. `src/prompts.ts` assembles it from the core rules, the render
bridge, that format's module in `prompts/formats/` and the final pass; [`prompts/README.md`](../prompts/README.md)
shows the order. In a client without the MCP server, read those files in the same order and apply them to
the brief. The format modules are the one statement of each format's workflow, so this file keeps no second
copy of them.
