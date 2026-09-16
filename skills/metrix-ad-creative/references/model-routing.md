# Model routing for ad creative

Read from the specs at `docs.kie.ai`, **2026-09-14**. Verify against the live
page on a validation error. Full catalog: `docs/MODEL_CATALOG.md` in the
metrix-creative-engine repo.

## The ratio problem, first

Meta's feed default is **4:5**. Most models do not offer it.

| Model | Offers 4:5 |
| --- | --- |
| `google/nano-banana` | yes |
| `nano-banana-2`, `nano-banana-pro` | yes |
| `bytedance/seedream-v4-*` | no |
| `flux-2/*` | no |
| `z-image` | no |
| `ideogram/*` | no |
| `veo-3-1` (video) | no, 16:9 and 9:16 only |

So for feed statics, **`nano-banana-2`** unless you have a reason otherwise.
Everything else means generating 1:1 or 9:16 and cropping, which costs you
composition at the exact edges where the subject usually sits.

### The text-and-ratio bind, and how it is resolved

A Meta ad creative carries a hook and a CTA in the frame (core rule 1) AND has
to be 4:5. Until 2026-09-16 this table sent text to `ideogram/v3-text-to-image`,
which does not offer 4:5 (see the row above), so every text-bearing feed static
had to break one of the two. Assets came back either at the wrong ratio or with
garbled words, and the cause looked like model weakness rather than routing.

`nano-banana-2` does both, and carries the budget a real brief needs:

| | `google/nano-banana` | `nano-banana-pro` | `nano-banana-2` |
| --- | --- | --- | --- |
| Native 4:5 | yes | yes | yes |
| Prompt budget | small | 10,000 | **20,000** |
| Reference images | 10 | 8 | **14** |
| Resolution | 1K | to 4K | to 4K |

A brief with product references, a palette, a hook line and a CTA needs the
room. Default to `nano-banana-2`. Drop to `google/nano-banana` only for cheap
iteration where neither text nor 4K matters.

**`aspect_ratio` defaults to `auto` on `nano-banana-2`. Set it explicitly every
time** or the ratio you get is whatever the model inferred.

For video there is no 4:5 anywhere. Generate 9:16 for Reels and Stories, 16:9
for in-stream, and treat feed video as a crop from 9:16.

## Routing by asset type

| `asset_type` in the brief | Model | Why |
| --- | --- | --- |
| Static, feed (default) | `nano-banana-2` | Native 4:5, 20k prompt, 14 refs, 4K. No `google/` prefix |
| Static with on-image text | `nano-banana-2` | Sets type AND holds 4:5. This is the normal case, not an exception |
| Static, cheap iteration | `google/nano-banana` | 1K, small prompt budget. Not for delivery |
| Static, text where ratio is free | `ideogram/v3-text-to-image` | Strong text and a real `negative_prompt`, but **no 4:5**: only when the placement is 1:1 or 9:16 |
| Product-led static | `bytedance/seedream-v4-text-to-image` | Product realism; no 4:5 |
| Carousel | `nano-banana-2` at `1:1` | One model across all cards, or they will not sit together |
| UGC / AI-UGC still | `nano-banana-2` | Caption bars are on-image text |
| Video from a still | `kling/v2-1-master-image-to-video` | Approve the frame, then animate |
| Video, top quality | `veo-3-1` | 1080p/4K with native audio |
| Video, cheap iteration | `bytedance/v1-lite-text-to-video` | |
| Music bed | `ai-music-api/generate`, `instrumental: true` | |
| Voiceover | `elevenlabs/text-to-speech-multilingual-v2` | |
| Final upscale | `topaz/image-upscale` | After approval only |

**Not on Kie: Sora, Midjourney.** If a brief names one, say so and route to the
nearest real option rather than substituting silently.

## Inside a Matrix Sprint Test, lock the model

This applies only while a test is running. Outside one, pick the best model for
each asset.

Different models have different houses of style. Switching mid-matrix is the
largest uncontrolled variable available to you, and it will dominate whatever
the row was supposed to be testing. Pick once, before the first cell.

Lock alongside it: the aspect ratio, the resolution, and the seed where the
model exposes one.

## Parameters that matter for ad work

**`google/nano-banana`**

```jsonc
{ "model": "google/nano-banana",
  "input": { "prompt": "<base + slot>", "aspect_ratio": "4:5", "output_format": "png" }}
```

`aspect_ratio`: `1:1` `9:16` `16:9` `3:4` `4:3` `3:2` `2:3` `5:4` `4:5` `21:9`
`auto`.

**`nano-banana-2`** — no prefix. `resolution` `1K`/`2K`/`4K`,
`output_format` defaults to `jpg`. Use `2K` or better for anything a client
sees at full size.

**`bytedance/seedream-v4-text-to-image`** — sizing is **`image_size`**, not
`aspect_ratio`: `portrait_4_3`, `landscape_16_9`, `square_hd` and so on. Passing
`aspect_ratio` here is silently ignored and you get `square_hd`. This is the
single easiest way to render a whole matrix at the wrong ratio.

**`ideogram/v3-text-to-image`** — `negative_prompt` is real here, so the brief's
avoid list can go in properly rather than being phrased positively.

**`veo-3-1`** — `aspect_ratio` `16:9` / `9:16` / `Auto` (capital A);
`resolution` `720p`/`1080p`/`4k`; `duration` integer `4`/`6`/`8`.

**`kling/v2-1-master-image-to-video`** — takes the approved still. On the v2.1
family `duration` is the **string** `"5"` or `"10"`, not a number.

## Uploading an approved still

To animate a still you generated, the video model needs a URL. A Kie result URL
works directly for about 24 hours, so pass it straight through if the animation
follows the still the same day, and re-upload it if it does not.

For a local file (a client asset, a shot photograph), upload first:

```bash
curl -X POST https://kieai.redpandaai.co/api/file-stream-upload \
  -H "Authorization: Bearer $KIE_AI_API_KEY" \
  -F "file=@./asset.png" -F "uploadPath=images/user-uploads"
```

Take `downloadUrl` from the response. Kie's docs give the host as both
`kieai.redpandaai.co` and `api.kie.ai`; the example uses the first and a live
probe agreed, so if one 404s try the other. The expiry is settled: uploaded
files are deleted after 3 days. Upload late rather than early anyway.

## Cost planning

No per-model price table is published. Rough bands: images 10–50 credits, video
100–500. A single static is small; a 3x3 image matrix is of the order of a few
hundred credits;
the same in video is thousands.

Call `kie_get_credits` before the run and report the real `creditsConsumed` per
task afterwards. A matrix that runs out halfway is not a cheap partial result —
it is an unusable test, because the cells that never rendered cannot be
compared against the ones that did.


## One model per batch

Core rule 3. Inside a matrix, a carousel set, or any group that will be compared,
the model id, aspect ratio, resolution and seed are chosen once, before the first
render, and do not change for the whole group.

**Never run two models concurrently against one brief or one matrix.** Model
identity is the largest uncontrolled variable available to you. A row rendered
half on `nano-banana-2` and half on `google/nano-banana` produces a difference
that looks like a creative result and is actually a model artefact, and the
sprint is void without anyone noticing.

Where this is stated, every time:

1. The **render spec**, before spend: the model id and the locked parameters.
2. The **handoff**, beside every asset: the model that produced it.
3. The **filename record** in the report.

If a model has to change mid-batch (it is withdrawn, it refuses the brief), the
whole group is re-rendered on the new model as a new version. Patching the
remaining cells is not an option.
