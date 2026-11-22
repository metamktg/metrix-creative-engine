# Engine, environment and workflow audit · 2026-11-21

Lane: Metrix engineering. Subject: whether this repo can take a Metrix IAP
`creative_briefs.json` and produce every creative type it names, end to end,
in a cloud session, with variable integrity and clean stage handoffs.

Evidence key: **proven** (seen in code or run here), **inferred** (follows
from code, not executed), **unknown** (named slot, not yet checked).

## TLDR

1. The cloud environment is now buildable in about 2.5 min with every tool the engine
   calls: Node/pnpm build, Chrome, ffmpeg, whisper.cpp v1.9.5, the four pinned
   models (sha256 equal to `tools/manifest.json`), a MediaPipe venv and the
   full Google Fonts library. Proven by running the script below in this container.
2. `npm run verify` is red, here and on `main` CI for the last two merges
   (#17, #18): the real-browser render test captures the previous source
   frame. The fix in #18 did not hold. This blocks every video format.
3. The brief contract stops at seven asset types. Shopping/catalog, slideshow
   and stand-alone b-roll or voiceover have no type, no route and no gate.
4. Five handoffs are broken: brief-to-MST cells, review gates not reading QA
   output, a handoff prompt that is never loaded, two sources of truth for
   safe zones, and two HyperFrames versions.

## 1. Cloud environment

### Setup script (tested here, exit 0; about 2.5 min on a fresh container)

The script is the one proposed in this session. It is idempotent, runs from
the directory that holds the checkout, and skips the repo steps when the
checkout is absent. It installs:

- pnpm deps and the MCP bundle (`dist/index.js`), so `.mcp.json` connects.
- The full Google Fonts library (OFL, Apache and UFL folders, 2,884
  families after install) plus Noto Color Emoji, into
  `/usr/local/share/fonts/google`. Every category is present: grotesk and
  geometric sans, condensed display, editorial serif, fat face, script,
  handwriting and marker, mono. Chrome only renders fonts installed on the
  machine; without them statics and captions fall back to DejaVu and
  `render.mjs` health fails on unloaded fonts. Proven: 20 current ad trend
  faces (Anton, Bebas Neue, Archivo Black, Playfair Display, Instrument
  Serif, Space Grotesk, Unbounded, Bricolage Grotesque, Permanent Marker and
  others) resolve by name and render in headless Chrome. Licensed commercial
  faces (Helvetica Now, Proxima Nova, a client's brand font) are not in it;
  those come from the client's brand kit files.
- whisper.cpp v1.9.5 built from source (`whisper-cli`), the pin in
  `tools/manifest.json`. This is the engine's preferred ASR path in
  `asr-check.mjs` (DTW word times). Ubuntu's ffmpeg 6.1 has no `whisper`
  filter, so the fallback path cannot run here (proven: `ffmpeg -filters`).
- Models at the manifest's pinned revisions: `ggml-base.en`, `ggml-small.en`,
  `ggml-silero-v6.2.0` (VAD), MediaPipe `face_landmarker.task`. All four
  sha256 values equal the manifest (proven).
- `/opt/metrix/venv312` (Python 3.12, mediapipe 1.2.3, opencv 5.1.0) for the
  eye-state gate (`media/eye_state.py`).

Not installed, by decision: whisperX and torch (about 4 GB; the engine only
names `whisperx` in a schema enum and never calls it), Remotion (no licence
record), yt-dlp (no capture code exists).

### Variables (non-secret)

- `KIE_AI_DOWNLOAD_DIR=./out`
- `MCE_WHISPER_CLI=/opt/metrix/tools/whisper-cpp/build/bin/whisper-cli`
- `MCE_WHISPER_CLI_MODEL=/opt/metrix/models/ggml-small.en.bin`
- `MCE_WHISPER_VAD=/opt/metrix/models/ggml-silero-v6.2.0.bin`
- `METRIX_WHISPER_MODEL=/opt/metrix/models/ggml-base.en.bin`
- `MCE_PY312=/opt/metrix/venv312/bin/python`
- `MCE_FACE_MODEL=/opt/metrix/models/face_landmarker.task`
- `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`
- `KIE_AI_API_KEY=proxy-injected`: a placeholder so the MCP server and
  `kie.mjs` start; the real key is injected by the proxy (next section).

### Secrets (network secrets, injected by the proxy, never in the repo)

- Kie key for `api.kie.ai` and for `kieai.redpandaai.co` (file upload host),
  `Authorization: Bearer`. Required for any generation.
- Optional, when the direct Google route is wanted: Gemini key for
  `generativelanguage.googleapis.com`, header `x-goog-api-key` (Gemini script,
  Gemini TTS voiceover, Veo b-roll outside Kie).
- Optional: ElevenLabs key for `api.elevenlabs.io`, header `xi-api-key`.

### Network

Limited, package registries on, plus: `api.kie.ai`, `kieai.redpandaai.co`,
`static.aiquickdraw.com`, `tempfile.aiquickdraw.com`, `file.aiquickdraw.com`,
`generativelanguage.googleapis.com`, `api.elevenlabs.io`, `huggingface.co`,
`us.aws.cdn.hf.co`, `github.com`,
`codeload.github.com`, `storage.googleapis.com`, `cdn.jsdelivr.net`,
`fonts.googleapis.com`, `fonts.gstatic.com`.

Unknown: Kie result URLs rotate across hosts. The two `*.aiquickdraw.com`
hosts beyond `static` are inferred. The first result download that is refused
names its host; add it then.

## 2. Gate status

- `npm run verify` here: red, two tests failing in the real-browser render suite (proven).
- The failures are in `src/__tests__/render-health.test.ts`: a still shows
  source frame 0 where frame 1 was asked (30 fps WebM), and a seek returns
  frame 5 for 37. Reruns: 2 of 2 failed, 1 of 2 failed (flaky, not fixed).
- Main CI: runs for #17 and #18 concluded `failure`; #16 was the last green.

Consequence: any video, UGC, AI UGC, motion or reel render can ship a stale
frame on Linux. This is the first thing to fix, before any new format.

## 3. Broken or missing handoffs (proven unless marked)

1. **Brief to MST cells.** `make-row.mjs` reads
   `testing_framework.cells` and `matrix_naming_convention`; `src/brief.ts`
   declares neither, and zod strips unknown keys, so a brief that passed
   `kie_validate_brief` loses them (inferred from zod default behaviour).
2. **QA to review.** `scripts/validate_review_gates.py` never reads
   `qa-video`, storyboard or timeline output; it binds files by hash only.
   A render that failed QA can pass review.
3. **Handoff stage.** `prompts/03-handoff.md` is not imported by
   `src/prompts.ts`. No MCP prompt carries handoff and no script writes the
   receipt or the upload manifest the MST scan expects.
4. **Safe zones.** `render.mjs --mode check` still uses legacy constants,
   while `check-storyboard` uses `references/placement-zones.json`.
5. **HyperFrames version.** `package.json` pins 0.9.19; `tools/manifest.json`
   records 0.8.186 with `cli_permitted: false`.
6. **`brand_assets` blocker.** Five docs gate on `brand_assets.missing`; the
   schema types `brand_assets` as an array, so the blocker cannot be checked.
7. **Review coverage.** `src/prompts.ts:85` attaches the production review
   only for ugc, ai_ugc and video. Motion graphic, claymation, static and
   carousel have no scripted gate.
8. **MST prompt.** `kie_mst_sprint` omits the render bridge and the format
   modules, so an MST run is prompted without its format's rules.
9. **Raw task bypass.** `kie_create_task` skips the UGC preproduction guard
   (documented in `AGENTS.md`, still open).

## 4. Media types: state, best practice, build

Each entry: what exists, how the best teams run it, what to build here.

### MST (matrix sprint)
- Exists: isolation rule, `matrix` mode, video rows via `make-row.mjs`.
- Best practice: the brief owns the cell list; one locked base prompt or
  composition plus one slot; names generated, never typed; a row manifest
  hashing every cell so the scan can prove only the slot changed.
- Build: add `cells` and `matrix_naming_convention` to the schema (optional
  fields); one `mst` CLI that fans a row out for any format, writes names and
  a row manifest, and hands that manifest to `metrix-mst-creative-scan`.

### Static batch
- Exists: prompt module, `kie.mjs start/poll`, manual checklist.
- Best practice: generate the scene without type, then set headline, offer
  and CTA in HTML/CSS with brand fonts and render to PNG. Text stays exact,
  editable and on-brand; the model never spells copy. Scripted QA for size,
  safe zone, contrast and text-from-brief.
- Build: a `static-compose` route reusing the Chrome renderer and
  `placement-zones.json`, plus `qa-image` (dimensions, zone, copy grounding).

### Carousel
- Exists: prompt module and a `kind: carousel` storyboard value nothing renders.
- Best practice: one card system (grid, type scale, continuity element across
  the seam), card count and per-card job declared in the brief, every card
  rendered from one template so only content varies.
- Build: `cards[]` in the brief, the static-compose route looped per card,
  a seam check and a set-level QA.

### Shopping, catalog, DPA, collection
- Exists: nothing. No type, route or gate.
- Best practice: template-driven overlays on feed images (price, offer,
  badge, frame) generated from the catalog feed, not per-image generation;
  feed fields bound by SKU so price and title are never retyped.
- Build: new `shopping` type, a feed reader (CSV or Meta catalog export), the
  static-compose template per SKU, and a feed-integrity check that every
  rendered price equals the feed.

### Motion graphics
- Exists: bed generation, assembly, `qa-video`.
- Build: attach the production review gate, and default to HyperFrames or
  the CDP renderer for type and transitions; models only for backgrounds.

### Reels and Stories 9:16
- Exists: the full chain except handoff.
- Best practice: hook in the first second with sound off, captions inside
  the 14/35/6 safe zone, one idea per shot, loudness to platform target.
- Build: fix the stale-frame test, move `render.mjs` onto
  `placement-zones.json`, and make review consume QA.

### AI UGC
- Exists: script lock, packet v2 presenter acceptance, guarded lip sync,
  assembly, five gates.
- Best practice: script and voice approved before any video spend; one
  locked presenter identity; b-roll covers every cut in the talking head.
- Build: route the raw task tools through the guard, or mark them
  admin-only; add the b-roll lane below.

### Human creator UGC and post-production
- Exists: library, casting, the five gates, captions, mix, cut, scene detect.
- Missing: footage ingest (proxy, transcript, selects) and an engine-owned
  grade step (only a BT.709 tag check today).
- Best practice: ingest makes proxies and a word-level transcript first, the
  edit is cut from the transcript, then picture lock, then grade and mix.
- Build: `ingest` (probe, proxy, whisper-cli transcript, selects list) feeding
  `timeline.mjs`, and a LUT-based grade step with a before/after still.

### Voiceover and script
- Exists: script check, sha256 lock, phrase map, ASR check. TTS is only a
  model routed through generic `kie.mjs`.
- Build: a `vo` route (Gemini TTS or ElevenLabs via Kie, direct Gemini as the
  fallback) that writes the audio, its script hash and an ASR check in one
  step, so a voice is never used without proof it says the locked script.

### B-roll
- Exists: prose only.
- Best practice: generate b-roll from a shot list derived from the script
  gaps, short clips with one action each, model chosen per shot (Veo for
  realism and native audio, Kling or Seedance for motion control, image
  model plus motion for product shots), cheapest model that clears the shot.
- Build: a `broll` route reading timeline gaps and writing a shot list,
  with per-shot model choice, a cost quote before spend and the same
  receipt as other renders.

### Claymation and slideshow
- Claymation: a style, not a format. Treat it as a style option on static,
  video and motion, and add it to the motion duration check.
- Slideshow: the vendored skill builds presenter decks, not ads. Do not add
  a type unless a brief asks for one.

## 5. Tools and fallbacks

- **Generation**: Kie is the single spend path with a ledger and receipts.
  Direct Gemini and Veo are fallbacks only when Kie lacks the model or is
  down; they should write the same ledger line so spend stays in one place.
- **Desktop and browser tools** (Canva, Higgsfield, CapCut, After Effects):
  useful for one-off finishing, but they produce files without receipts.
  Bring their output back through `qa-video` or the image QA before review,
  so the gate is the same whichever tool made the file.
- **Higgsfield, Flashloop, Canva, Figma MCPs** are connected to this account
  but not referenced by engine code (doc only). Wire them as named fallbacks
  in model routing only where a brief type needs them.
- **kie-ai MCP** failed to connect in this session because `dist/` did not
  exist at session start; the setup script builds it before Claude starts.

## 6. Order of work

1. Fix the stale-frame render bug until verify and main CI are green.
2. Close handoffs 1, 2 and 3 (schema fields, QA into review, handoff prompt
   and receipt).
3. Static-compose route, then carousel and shopping on top of it.
4. VO route, b-roll route, ingest and grade.
5. Reconcile safe zones and the HyperFrames pin.
