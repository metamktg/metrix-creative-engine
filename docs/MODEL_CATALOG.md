# Model catalog

Read from the OpenAPI specs `docs.kie.ai` embeds in each page (append `.md` to
any docs URL to get one). **Retrieved 2026-09-14.** Kie adds and renames models
often — when a call fails with a validation error, check the model's live page
before assuming this file is right.

Every id below is quoted verbatim from a spec. Ids marked **[enum]** are pinned
by the spec's `model` enum; **[example]** means the spec left `model` a free
string and this is the value its own example used.

Nothing here was verified against a live API call. Treat the first run of any
new model as a test.

## Four gotchas that will cost you a run

1. **Some ids have no vendor prefix.** `google/nano-banana` is prefixed;
   `nano-banana-pro`, `nano-banana-2` and `z-image` are not. Copy the id exactly.
2. **The aspect-ratio field is not always `aspect_ratio`.** Seedream v3/v4 use
   `image_size` with named sizes (`portrait_4_3`), `wan/2-7-text-to-video` uses
   `ratio`, Ideogram uses `image_size`. Using the wrong key means your ratio is
   silently ignored and you get the default.
3. **The image-input field varies**: `image_urls`, `image_input`, `input_urls`,
   `image_url` (singular) and `first_frame_url` all appear. Per model, below.
4. **Sora and Midjourney are not available.** See "Not available" at the end.

---

## Images

### Recommended defaults for ad creative

| Job | Model | Why |
| --- | --- | --- |
| General text to image | `google/nano-banana` [enum] | Broad, fast, 11 aspect ratios including 4:5 and 9:16 |
| Highest quality / 4K | `nano-banana-2` [enum] | 4K, 14 reference images, biggest prompt budget |
| Edit an existing image | `google/nano-banana-edit` [enum] | Straightforward URL-in, instruction-based |
| Product / photoreal | `bytedance/seedream-v4-text-to-image` [enum] | Strong on product realism |
| Design with legible text | `ideogram/v3-text-to-image` [enum] | Best documented text rendering of the set |

### Nano Banana family

**`google/nano-banana`** [enum] — text to image.

| Field | Type | Required | Values |
| --- | --- | --- | --- |
| `prompt` | string | yes | max 5000 chars |
| `aspect_ratio` | string | no | `1:1` `9:16` `16:9` `3:4` `4:3` `3:2` `2:3` `5:4` `4:5` `21:9` `auto`. Default `1:1` |
| `output_format` | string | no | `png` `jpeg`. Default `png` |
| `nsfw_checker` | boolean | no | `false` disables Kie's content filter |

`image_size` also appears but the docs say it is replaced by `aspect_ratio`. Use
`aspect_ratio`.

**`google/nano-banana-edit`** [enum] — image edit. Required `prompt` (max 5000)
and `image_urls` (array of URLs, **max 10**, jpeg/png/webp, 10MB each). Optional
`aspect_ratio` (same 11 values), `output_format`.

**`nano-banana-pro`** [enum] — note: **no `google/` prefix.** Required `prompt`
(max 10000). Optional `image_input` (array, max 8, 30MB each), `aspect_ratio`
(11 values incl. `4:5`, `auto`), `resolution` (`1K` `2K` `4K`, default `1K`),
`output_format` (`png` `jpg`).

**`nano-banana-2`** [enum] — **no prefix.** Required `prompt` (max 20000).
Optional `image_input` (array, **max 14**, 30MB), `aspect_ratio` (15 values,
default **`auto`**), `resolution` (`1K` `2K` `4K`), `output_format` (`png` `jpg`,
default **`jpg`**).

**`nano-banana-2-lite`** [enum] — **`aspect_ratio` is required here.** Uses
`image_urls` (max 10), not `image_input`.

### Seedream

| Model id | Required input |
| --- | --- |
| `bytedance/seedream-v4-text-to-image` [enum] | `prompt` |
| `bytedance/seedream-v4-edit` [enum] | `prompt`, `image_urls` (max 10, 30MB) |
| `seedream/4.5-text-to-image` [enum] | `prompt` (max 3000), `aspect_ratio`, `quality` |
| `seedream/4.5-edit` [enum] | + `image_urls` (max 14) |
| `seedream/5-pro-text-to-image` [enum] | `prompt` (3–5000), `aspect_ratio`, `quality` |
| `seedream/5-pro-image-to-image` [enum] | + `image_urls` (max 10) |
| `seedream/5-lite-text-to-image` [enum] | `prompt` (3–3000), `aspect_ratio`, `quality` |

**The sizing field changes between generations.** v3/v4 take `image_size` with
named values (`square`, `square_hd`, `portrait_4_3`, `portrait_3_2`,
`portrait_16_9`, `landscape_4_3`, `landscape_3_2`, `landscape_16_9`,
`landscape_21_9`; default `square_hd`) plus `image_resolution` (`1K` `2K` `4K`)
and `max_images` (1–6). 4.5 and 5.x take `aspect_ratio` (`1:1` `4:3` `3:4`
`16:9` `9:16` `2:3` `3:2` `21:9`) plus `quality`: on 4.5 `basic`=2K /
`high`=4K; on 5-pro `basic`=1K / `high`=2K; on 5-lite `basic|high|ultra` =
2K/3K/4K.

Note neither offers 4:5, the usual Meta feed ratio. Use a Nano Banana model when
you need 4:5 natively rather than cropping.

### Flux

`flux-2/pro-text-to-image`, `flux-2/flex-text-to-image` [enum] — required
`prompt` (3–5000), `aspect_ratio` (`1:1` `4:3` `3:4` `16:9` `9:16` `3:2` `2:3`),
`resolution` (`1K` `2K`).

`flux-2/pro-image-to-image`, `flux-2/flex-image-to-image` [enum] — same, plus
required `input_urls` (1–8 images, 10MB each); `aspect_ratio` gains `auto`.

`flux1-kontext` [enum] — generate or edit. **English prompts only.** Optional
`input_image` (single URL, edit mode), `aspect_ratio` (`21:9` `16:9` `4:3` `1:1`
`3:4` `9:16`, default `16:9`), `output_format`, `prompt_upsampling`,
`safety_tolerance` (0–6, default 2; edit mode allows 0–2 only).

### Ideogram — the text-rendering option

`ideogram/v3-text-to-image` [enum] — required `prompt`. Optional `style` (`AUTO`
`GENERAL` `REALISTIC` `DESIGN`), `rendering_speed` (`TURBO` `BALANCED`
`QUALITY`), `negative_prompt`, `seed`, `image_size`, `num_images` (**a string**:
`"1"`–`"4"`).

`ideogram/v3-edit` [enum] requires `prompt`, `image_url` **and** `mask_url` —
true inpainting; the mask must match the image dimensions. `ideogram/v3-remix`
takes `prompt` + `image_url` + `strength` (0.01–1). `ideogram/character` takes
`reference_image_urls` for a consistent character, though the docs note only the
first image is used.

Ideogram is the family to reach for when on-image text has to be legible. It is
also one of the few with a real `negative_prompt`.

### Other image models

- `google/imagen4`, `google/imagen4-fast`, `google/imagen4-ultra` [enum] —
  `prompt`, `negative_prompt`, `aspect_ratio` (`1:1` `16:9` `9:16` `3:4` `4:3`
  `auto`). Note `seed` is a **string** on imagen4 and ultra, an **integer** on
  fast, and fast defaults to `16:9` where the others default to `1:1`.
- `z-image` [enum] — **no prefix.** `prompt` (max 1000) and `aspect_ratio`
  (`1:1` `4:3` `3:4` `16:9` `9:16`) both required. No image input. Cheap and fast.
- `qwen/text-to-image`, `qwen/image-edit`, `qwen/image-to-image`,
  `qwen3/text-to-image`, `qwen3/image-to-image`, `qwen3/pro-text-to-image`,
  `qwen3/pro-image-to-image` [enum] — all expose `negative_prompt` and `seed`.
- `gpt-image/1.5-text-to-image`, `gpt-image-2-text-to-image` and the
  `gpt-image-2-5-flare` / `-sunburst` pairs [enum] — gpt-image-2 supports
  `background: transparent`, but only at 1K.
- `grok-imagine/text-to-image`, `grok-imagine-image-2-0/text-to-image` [enum].
- `recraft/remove-background` [enum] — required `image` (max 5MB).
- `recraft/crisp-upscale`, `topaz/image-upscale` [enum] — see Upscaling.

---

## Video

Video is slow and costs several times what an image does. Use
`kie_create_task` + `kie_wait_for_task` rather than blocking, and raise
`timeoutSeconds` well past the 300s default.

### Recommended defaults

| Job | Model | Why |
| --- | --- | --- |
| Text to video, top quality | `veo-3-1` [example] | 1080p/4K, native audio, first-and-last-frame control |
| Animate an approved still | `kling/v2-1-master-image-to-video` [enum] | Strong image-to-video motion |
| Cheap iteration | `bytedance/v1-lite-text-to-video` [enum] | Lowest cost of the set |
| Long-form, up to 30s | `bytedance/seedance-2-5` [enum] | Longest documented duration |

### Veo

**`veo-3-1`** [example] — required `prompt`. Optional:

| Field | Values |
| --- | --- |
| `image_urls` | 1 image: the video unfolds around it. 2 images: first and last frame |
| `generation_type` | `TEXT_2_VIDEO` `FIRST_AND_LAST_FRAMES_2_VIDEO` `REFERENCE_2_VIDEO` (1–3 images) |
| `aspect_ratio` | `16:9` `9:16` `Auto` (**capital A**). Default `16:9` |
| `resolution` | `720p` `1080p` `4k`. Default `720p` |
| `duration` | integer `4` `6` `8`. Default `8`. Reference mode supports 8 only |

Docs note 4K costs roughly 2x. **No 4:5 or 1:1** — for feed placements generate
9:16 or 16:9 and crop, or use a model that offers the ratio.

Companions: `veo/extend`, `veo/get-1080p-video`, `veo/get-4k-video` [example].
1080p videos cannot be extended.

### Kling

| Model id [enum] | Notes |
| --- | --- |
| `kling/v2-1-standard` | `prompt` (5000), `image_url`; `duration` `"5"`/`"10"`, `cfg_scale` 0–1, `negative_prompt` |
| `kling/v2-1-pro` | + `tail_image_url` (last frame) |
| `kling/v2-1-master-text-to-video` | |
| `kling/v2-1-master-image-to-video` | |
| `kling/v2-5-turbo-text-to-video-pro` | `prompt` (2500), `aspect_ratio` `16:9` `9:16` `1:1` |
| `kling-2.6/text-to-video` | `sound` and `duration` required; `duration` is a **string** |
| `kling-2.6/image-to-video` | `image_urls` max 1, jpeg/png only |
| `kling-3.0/video` | `multi_prompt` for up to 5 shots; `mode` `std` `pro` `4K` |
| `kling-3.0-omni/text-to-video` | `duration` int 3–15, `resolution` up to `4k` |
| `kling-3.0-omni/image-to-video` | Single first frame, or exactly 2 for first+last |

`duration` is a string on 2.x (`"5"`) and an integer on 3.0. Check per model.

### Seedance / Bytedance

`bytedance/v1-pro-text-to-video`, `v1-lite-text-to-video` [enum] — `prompt` (max
10000); `aspect_ratio` (pro adds `21:9`, lite adds `9:21`), `resolution` (`480p`
`720p` `1080p`), `duration` (`"5"` `"10"`), `camera_fixed`, `seed`.

`bytedance/v1-pro-image-to-video`, `v1-lite-image-to-video`,
`v1-pro-fast-image-to-video` [enum] — `prompt` + `image_url`, no `aspect_ratio`
(the image sets it).

`bytedance/seedance-2` / `-fast` / `-mini` / `-2-5` / `seedance-1.5-pro` [enum] —
the richest reference support: `reference_image_urls`, `reference_video_urls`,
`reference_audio_urls`, `first_frame_url`, `last_frame_url`, `generate_audio`,
`aspect_ratio` (incl. `adaptive`), `resolution` up to `4k` on seedance-2.
`seedance-2-5` documents durations of 4–30 seconds.

### Others

- `hailuo/02-text-to-video-standard` / `-pro`, `hailuo/02-image-to-video-*`,
  `hailuo/2-3-image-to-video-*` [enum] — `duration` `"6"`/`"10"` as strings.
- `minimax-h3/text-to-video`, `/image-to-video`, `/reference-to-video` [enum] —
  `aspect_ratio` up to `21:9`, `duration` int 4–15.
- `wan/2-5-*`, `wan/2-6-*`, `wan/2-7-*`, `wan/3-0-video` [enum] — **`wan/2-7-text-to-video`
  uses `ratio`, not `aspect_ratio`.**
- `runway`, `runway/extend-ai-video`, `runway/gen4-aleph` [example] — Aleph is
  video-to-video. `duration` and `quality` are free strings here, not enums;
  10-second clips cannot be 1080p.
- `grok-imagine/text-to-video`, `/image-to-video`, `/extend`, `/upscale` [enum].
- Avatar / lip-sync: `kling/ai-avatar-pro`, `kling/ai-avatar-standard`,
  `omnihuman-1-5`, `infinitalk/from-audio`,
  `volcengine/video-to-video-lip-sync` [enum] — ids confirmed, parameters not
  extracted. Fetch the page before first use.

---

## Music and speech

### Suno

All Suno work goes through `createTask` with ids like **`ai-music-api/generate`**
[example].

The catch: **there is a second `model` field nested inside `input`**, separate
from the top-level one.

```jsonc
{
  "model": "ai-music-api/generate",
  "input": {
    "prompt": "...",
    "custom_mode": true,
    "instrumental": true,
    "model": "V6"          // <- the Suno version, inside input
  }
}
```

`input.model`: `V4` `V4_5` `V4_5PLUS` `V4_5ALL` `V5` `V5_5` `V6` `V6_MINI`
`V6_WILD`, default `V6`. The docs mark everything up to `V5_5` as discontinued.

Required: `prompt`, `custom_mode`, `instrumental`, `input.model`. Optional:
`style`, `title` (max 80), `negative_tags`, `vocal_gender` (`m`/`f`),
`style_weight`, `weirdness_constraint`, `audio_weight`, `duration` (10–360,
default 20 — only when `custom_mode` is true on V5_5 and later).

With `custom_mode: true` and `instrumental: false`, `prompt` is used **verbatim
as lyrics**, and `style` and `title` become required. For an ad bed you almost
always want `instrumental: true`.

Others: `ai-music-api/extend`, `/generate-lyrics`, `/cover-generate`,
`/add-instrumental`, `/add-vocals`, `/mashup`, `/replace-section` [enum],
`/convert-to-wav-format`, `/separate-vocals`, `/create-music-video`.

### Speech

`elevenlabs/text-to-speech-multilingual-v2` [enum] — required `text` (max 5000)
**and `voice`**. `elevenlabs/text-to-speech-turbo-2-5` [enum] — `voice` optional.

`voice` is a 67-value enum of ElevenLabs voice ids, default
`EkK5I93UQWFDigLMpZcX` ("James - Husky, Engaging and Bold"). Preview any of them
at `https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3`.

Optional: `stability` (0–1, default 0.5), `similarity_boost` (0–1, default
0.75), `style` (0–1), `speed` (0.7–1.2), `language_code`.

`elevenlabs/text-to-dialogue-v3` [enum] takes a `dialogue` array of
`{text, voice}` for multi-speaker, 5000 characters total across all entries.
`elevenlabs/audio-isolation` [enum] strips background noise from `audio_url`.

Also `google/gemini-2-5-pro-tts`, `google/gemini-3-1-flash-tts` [enum].

---

## Upscaling

- `topaz/image-upscale` [enum] — `image_url`, `upscale_factor` as a **string**:
  `"1"` `"2"` `"4"`.
- `topaz/video-upscale` [enum] — `video_url` (mp4/mov/mkv, max 50MB), same
  `upscale_factor`.
- `recraft/crisp-upscale` [enum] — `image`.

Upscalers sharpen what exists. They do not fix composition, hands or garbled
text — regenerate for those. Use as the final step on an approved asset.

---

## Uploading a local file

Edit and image-to-video models need a **URL**, not a local path. Kie has an
upload API for exactly this.

Three endpoints, all authenticated with the same bearer token. Note the path has
**no `/v1/`**:

| Endpoint | Body | Notes |
| --- | --- | --- |
| `POST /api/file-url-upload` | JSON `{fileUrl, uploadPath, fileName?}` | Pulls from a URL. 30s download timeout, recommended under 100MB |
| `POST /api/file-stream-upload` | multipart `file`, `uploadPath`, `fileName?` | Large files |
| `POST /api/file-base64-upload` | JSON `{base64Data, uploadPath, fileName?}` | Accepts a raw base64 string or a `data:` URL. Recommended under 10MB |

Take **`downloadUrl`** from the response — it is the one URL field present in
both documented response shapes.

**Three things here are contradictory in Kie's own docs, so verify before you
depend on them:**

- **Host.** Every prose example uses `https://kieai.redpandaai.co`; the OpenAPI
  `servers` block says `https://api.kie.ai`.
- **Response shape.** The spec returns `{fileName, filePath, downloadUrl,
  fileSize, mimeType, uploadedAt}`; the prose example returns `{fileId,
  originalName, uploadPath, fileUrl, downloadUrl, uploadTime, expiresAt}`.
- **Expiry.** Stated as both 24 hours and 3 days on the same page.

Because uploaded URLs expire, upload as late as possible — right before the
generation that consumes the URL, not at the start of a long batch.

The MCP server does **not** wrap these endpoints. Upload with `curl` when you
need it.

---

## Not available

Do not offer these; they are not on the platform.

- **Sora 2 / Sora 2 Pro.** Referenced indirectly (`recordInfo`'s `progress`
  field mentions sora2), but every Sora docs page 404s and it is absent from the
  sitemap. Search engines surface plausible-looking ids for it — they are not
  from a live page and must not be used.
- **Midjourney.** No occurrence anywhere in the docs.
- **Mmaudio.** No occurrence anywhere in the docs.

## Known docs bugs

Flagged so a failure here is recognised rather than debugged from scratch:

1. `market/qwen2/text-to-image` declares the model id `qwen2/image-edit`, same
   as the edit page. The real text-to-image id is unknown.
2. `market/kling/v25-turbo-image-to-video-pro` declares
   `kling/v2-1-master-image-to-video`, colliding with the V2.1 Master page. The
   expected `kling/v2-5-turbo-image-to-video-pro` appears nowhere in the docs.
3. Grok Imagine 2.0: the page titled "Image to Image" declares
   `grok-imagine-image-2-0/image-edit`, and the one titled "Image Edit" declares
   `.../segment-edit`. Trust the ids, not the titles.
4. `bytedance/seedance-2-fast` has a field key with a **trailing space**:
   `"reference_video_urls "`.
5. `veo-3-1`'s `enable_translation` has `default: false` in the schema and
   "Default value is true" in its description.

## Costs

There is no per-model price table in the docs. The only published figures are
approximate: images roughly 10–50 credits, video roughly 100–500.

The real number comes back per task as **`creditsConsumed`** on the task record.
Read it there. Check `kie_get_credits` before a batch.

## Retention

Generated media is deleted after about **14 days**; logs and metadata after two
months. A result URL is not storage.
