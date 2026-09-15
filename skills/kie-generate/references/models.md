# Models

Read from the specs at `docs.kie.ai`, **2026-09-14**. Kie changes these often —
on a validation error, check the model's live page (append `.md` to its docs URL
for the raw spec). The full catalog is `docs/MODEL_CATALOG.md` in the
metrix-creative-engine repo.

## Routing

| Want | Model | Notes |
| --- | --- | --- |
| Image, general | `google/nano-banana` | 11 ratios incl. `4:5` and `9:16`. Default choice |
| Image, 4K / max quality | `nano-banana-2` | No prefix. 4K, 14 ref images |
| Image, product realism | `bytedance/seedream-v4-text-to-image` | No 4:5 |
| Image with legible text | `ideogram/v3-text-to-image` | Best text rendering; real `negative_prompt` |
| Image, cheap and fast | `z-image` | No prefix. Only 5 ratios |
| Edit an image | `google/nano-banana-edit` | Up to 10 input URLs |
| Inpaint a region | `ideogram/v3-edit` | Needs a `mask_url` matching image dims |
| Video, best quality | `veo-3-1` | 1080p/4K, native audio. 16:9 / 9:16 only |
| Animate a still | `kling/v2-1-master-image-to-video` | |
| Video, cheap | `bytedance/v1-lite-text-to-video` | |
| Video, up to 30s | `bytedance/seedance-2-5` | |
| Music | `ai-music-api/generate` | Second `model` field nested in `input` |
| Speech | `elevenlabs/text-to-speech-multilingual-v2` | `voice` required |
| Upscale image | `topaz/image-upscale` | `upscale_factor` is a **string** |

**Not on Kie: Sora, Sora 2, Midjourney, Mmaudio.** Say so; do not substitute.

## Images

### `google/nano-banana`

```jsonc
{ "model": "google/nano-banana",
  "input": {
    "prompt": "...",               // required, max 5000
    "aspect_ratio": "4:5",         // 1:1 9:16 16:9 3:4 4:3 3:2 2:3 5:4 4:5 21:9 auto
    "output_format": "png"         // png | jpeg
  }}
```

### `google/nano-banana-edit`

Required `prompt` (5000) and `image_urls` (array, max 10, jpeg/png/webp, 10MB
each). Optional `aspect_ratio`, `output_format`.

### `nano-banana-2` — no `google/` prefix

Required `prompt` (max 20000). Optional `image_input` (array, max 14, 30MB),
`aspect_ratio` (15 values, default `auto`), `resolution` (`1K` `2K` `4K`),
`output_format` (`png` `jpg`, default `jpg`).

`nano-banana-pro` is the same shape with max 8 reference images and a 10000
prompt. `nano-banana-2-lite` **requires** `aspect_ratio` and uses `image_urls`.

### `bytedance/seedream-v4-text-to-image`

Required `prompt`. Sizing uses **`image_size`**, not `aspect_ratio`: `square`,
`square_hd`, `portrait_4_3`, `portrait_3_2`, `portrait_16_9`, `landscape_4_3`,
`landscape_3_2`, `landscape_16_9`, `landscape_21_9` (default `square_hd`), plus
`image_resolution` (`1K` `2K` `4K`) and `max_images` (1–6).

`bytedance/seedream-v4-edit` adds required `image_urls` (max 10, 30MB).

The `seedream/4.5-*` and `seedream/5-*` generations switch to `aspect_ratio`
plus a `quality` field. No Seedream offers 4:5.

### `ideogram/v3-text-to-image`

Required `prompt`. Optional `style` (`AUTO` `GENERAL` `REALISTIC` `DESIGN`),
`rendering_speed` (`TURBO` `BALANCED` `QUALITY`), `negative_prompt`, `seed`,
`image_size`, `num_images` (**string**: `"1"`–`"4"`).

### `z-image` — no prefix

`prompt` (max 1000) **and** `aspect_ratio` (`1:1` `4:3` `3:4` `16:9` `9:16`)
both required.

### `flux-2/pro-text-to-image`

Required `prompt` (3–5000), `aspect_ratio` (`1:1` `4:3` `3:4` `16:9` `9:16`
`3:2` `2:3`), `resolution` (`1K` `2K`). The `-image-to-image` variant adds
required `input_urls` (1–8).

## Video

Use `kie_create_task` + `kie_wait_for_task`, or a large `timeoutSeconds`.

### `veo-3-1`

```jsonc
{ "model": "veo-3-1",
  "input": {
    "prompt": "...",               // required
    "aspect_ratio": "9:16",        // 16:9 | 9:16 | Auto  (capital A)
    "resolution": "1080p",         // 720p | 1080p | 4k
    "duration": 8,                 // integer: 4 | 6 | 8
    "image_urls": ["https://..."]  // 1 = anchor; 2 = first and last frame
  }}
```

`generation_type`: `TEXT_2_VIDEO`, `FIRST_AND_LAST_FRAMES_2_VIDEO`,
`REFERENCE_2_VIDEO` (1–3 images, 8s only). 4K costs roughly double. **No 4:5 or
1:1** — crop from 9:16 for feed.

### Kling

`kling/v2-1-standard` and `kling/v2-1-pro`: `prompt` (5000) + `image_url`;
`duration` is the **string** `"5"` or `"10"`; `cfg_scale` 0–1; `negative_prompt`.
Pro adds `tail_image_url` for a last frame.

`kling/v2-1-master-text-to-video`, `kling/v2-1-master-image-to-video`.

`kling-2.6/*` require `sound` and `duration`. `kling-3.0-omni/*` take an
**integer** `duration` (3–15) and `resolution` up to `4k`.

### Bytedance

`bytedance/v1-pro-text-to-video`, `v1-lite-text-to-video`: `prompt` (10000),
`aspect_ratio`, `resolution` (`480p` `720p` `1080p`), `duration` (`"5"` `"10"`
as strings), `camera_fixed`, `seed`.

The `-image-to-video` variants take `image_url` and drop `aspect_ratio` — the
image sets it.

`bytedance/seedance-2-5` documents 4–30 second durations and takes
`reference_image_urls`, `first_frame_url`, `last_frame_url`, `generate_audio`.

### Others

`hailuo/02-*` (`duration` `"6"`/`"10"` as strings), `minimax-h3/*`, `wan/2-5-*`
through `wan/3-0-video` (**`wan/2-7-text-to-video` uses `ratio`, not
`aspect_ratio`**), `runway` (`duration` and `quality` are free strings; 10s
cannot be 1080p), `grok-imagine/text-to-video`.

## Music

```jsonc
{ "model": "ai-music-api/generate",
  "input": {
    "prompt": "upbeat indie folk, acoustic guitar, 120bpm, warm",
    "custom_mode": true,
    "instrumental": true,
    "model": "V6",                 // <- Suno version, nested inside input
    "style": "indie folk",
    "title": "Morning Bed",
    "duration": 30                 // 10-360, custom_mode only, V5_5+
  }}
```

`input.model`: `V6` (default), `V6_MINI`, `V6_WILD`. Everything up to `V5_5` is
marked discontinued.

With `custom_mode: true` and `instrumental: false`, `prompt` is used **verbatim
as lyrics** and `style` + `title` become required. For an ad bed use
`instrumental: true` — vocals fight voiceover and on-screen copy.

## Speech

```jsonc
{ "model": "elevenlabs/text-to-speech-multilingual-v2",
  "input": {
    "text": "...",                          // required, max 5000
    "voice": "EkK5I93UQWFDigLMpZcX",        // required on this model
    "stability": 0.5, "similarity_boost": 0.75, "speed": 1.0
  }}
```

67 voice ids available. Preview one at
`https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3`.
`elevenlabs/text-to-speech-turbo-2-5` makes `voice` optional.
`elevenlabs/text-to-dialogue-v3` takes a `dialogue` array of `{text, voice}`,
5000 characters total.

## Upscaling

`topaz/image-upscale`: `image_url` + `upscale_factor` as a **string** (`"1"`
`"2"` `"4"`). `topaz/video-upscale`: `video_url` (max 50MB). Upscalers sharpen
what is there; they do not fix composition, hands or text.

## Uploading a local file

Edit and image-to-video models need a URL. The MCP server does not wrap Kie's
upload endpoints, so use curl:

```bash
curl -X POST https://kieai.redpandaai.co/api/file-stream-upload \
  -H "Authorization: Bearer $KIE_AI_API_KEY" \
  -F "file=@./frame.png" -F "uploadPath=images/user-uploads"
```

Take **`downloadUrl`** from the response. Also available:
`/api/file-url-upload` (JSON `{fileUrl, uploadPath}`) and
`/api/file-base64-upload` (JSON `{base64Data, uploadPath}`).

Two caveats from Kie's own docs, which contradict themselves: the host is given
as both `kieai.redpandaai.co` (all prose examples) and `api.kie.ai` (the spec),
and used to give two expiries. The expiry is settled: uploaded files are deleted
after **3 days**. If one host 404s, try the other.
Upload immediately before the generation that consumes the URL, not at the start
of a long batch.

## Costs and retention

No per-model price table exists. Published bands: images roughly 10–50 credits,
video roughly 100–500. The real figure comes back per task as
`creditsConsumed`.

Result URLs expire after about **24 hours** (Kie's own Best Practices block).
Download anything worth
keeping.
