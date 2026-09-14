# Format routing

**The brief's `asset_type` decides the render. It is not a suggestion and not a
preference to be weighed against what a model is good at.**

Brief and asset are separate functions: the brief declares what medium the idea
was designed for, and the render must execute in that medium. A brief written
for a carousel is not satisfied by a beautiful static, because the idea was
built to unfold across cards. This table is the handoff contract between them.

Model facts are dated (**2026-09-14**, from the specs at docs.kie.ai). Craft for
each format lives in `prompts/formats/<asset_type>.md`. This file is the
mechanical mapping only.

## The routing table

| `asset_type` | Format module | Eligible models | Required parameters |
| --- | --- | --- | --- |
| `static` | `static.md` | `google/nano-banana`, `nano-banana-2`, `nano-banana-pro`, `bytedance/seedream-v4-text-to-image`, `seedream/5-pro-text-to-image`, `flux-2/pro-text-to-image`, `google/imagen4-ultra`, `gpt-image-2-text-to-image`, `z-image` | ratio; resolution where offered |
| `static` with on-image text | `static.md` | `ideogram/v3-text-to-image`, `nano-banana-2`, `gpt-image-2-text-to-image` | ratio; `negative_prompt` where offered |
| `carousel` | `carousel.md` | one model from `static`, locked across every card | ratio `1:1`; seed where offered |
| `video` | `video.md` | `veo-3-1`, `kling-3.0/video`, `kling/v2-5-turbo-text-to-video-pro`, `bytedance/seedance-2-5`, `bytedance/v1-pro-text-to-video`, `minimax-h3/text-to-video`, `wan/2-7-text-to-video`, `hailuo/02-text-to-video-pro`, `runway` | ratio; `duration` |
| `video` from an approved still | `video.md` | `kling/v2-1-master-image-to-video`, `kling-3.0-omni/image-to-video`, `bytedance/v1-pro-image-to-video`, `hailuo/2-3-image-to-video-pro`, `minimax-h3/image-to-video`, `wan/2-7-image-to-video`, `veo-3-1` (`image_urls`) | image input; `duration` |
| `ugc` | `ugc.md` | any `video` model, prompted for phone-camera characteristics | ratio `9:16`; `duration` |
| `ai_ugc` (talking head) | `ugc.md` | `kling/ai-avatar-pro`, `kling/ai-avatar-standard`, `omnihuman-1-5`, `infinitalk/from-audio`, `volcengine/video-to-video-lip-sync` | **parameters unverified: fetch the model page before first use** |
| `motion_graphic` | `motion-graphic.md` | `wan/2-7-text-to-video`, `bytedance/seedance-2-5`, `kling-3.0/video`, plus a static model for designed frames | ratio; `duration` |
| `claymation` | `claymation.md` | any `static` or `video` model; the look is prompted, not a separate model | ratio; `duration` for motion |
| anything else | **none** | **stop** | — |

## Unmapped asset types

If the brief's `asset_type` is not in this table, **stop and say so.** Do not
route it to the nearest neighbour.

Core rule 9 forbids silent substitution, and the reason is specific here:
rendering a static for a brief that asked for motion produces an asset that
looks finished, passes a casual review, and fails the thing the brief was
testing. A visible stop costs a message. A silent substitution costs a test
cycle and the spend behind it.

Say which type the brief asked for, that there is no route for it, and propose
the nearest mapped type as a **question**, not a default.

## Choosing within the eligible set

The set is eligible; the choice is yours to make and to state.

1. **Hard constraints first.** Ratio eliminates models outright: only the Nano
   Banana family offers 4:5, and no video model does. Image inputs eliminate
   text-only models. Duration ceilings eliminate models for long clips.
2. **Then the brief's demand.** On-image text pushes toward Ideogram. Product
   fidelity from references pushes toward models taking many reference images
   (`nano-banana-2` at 14, `seedream/4.5-edit` at 14). Native audio pushes
   toward `veo-3-1` or the Seedance family.
3. **Then cost**, once quality is satisfied, not before.

Record the choice and the reason in the render spec's `model.why`. In matrix
mode the model is locked for the whole matrix: switching mid-matrix is the
largest uncontrolled variable available to you.

## Ratio by placement

| Placement | Ratio |
| --- | --- |
| Feed | `4:5` |
| Feed, one asset also serving carousel or right column | `1:1` |
| Stories, Reels | `9:16` |
| In-stream video | `16:9` |

Ratio is always a parameter, never prompt text. The field name varies: most
models use `aspect_ratio`; Seedream v3/v4 use `image_size` with named sizes
(`portrait_4_3`); `wan/2-7-text-to-video` uses `ratio`; Ideogram and Qwen use
`image_size`. The wrong key is silently ignored and you get the default, which
is how a whole matrix renders at the wrong ratio without anyone noticing.

## Not available on Kie

`sora`, `sora-2`, `midjourney`, `mmaudio`. If a brief names one, say so and
route to an eligible model as a stated substitution, per rule 9.

## Full parameter detail

`references/model-routing.md` for per-model parameters, and
`docs/MODEL_CATALOG.md` in this repo for the complete catalog with the known
docs bugs. When a call fails validation, read the model's live page: append
`.md` to its docs.kie.ai URL for the raw spec.
