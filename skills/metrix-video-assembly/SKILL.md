---
name: metrix-video-assembly
description: Assemble finished video and motion-graphic ads from a Metrix creative brief. Plans a storyboard (hook, show, proof, CTA), sets exact type, sequences approved clips and genuine product material, mixes sound, bakes the poster as frame 0 and renders the required placement ratio. Use when video, motion_graphic or ugc needs text, captions, a logo, multiple shots, finishing or a placement-specific composition; for requests to assemble, cut, caption or finish an ad; and whenever the creative workflow hands media to post-production.
---

# metrix-video-assembly

The post-production stage of the creative engine. `metrix-brief-builder` writes
the brief, `metrix-ad-creative` generates stills and clips through Kie.ai, and
this skill turns them into the ad that runs: sequenced, typeset, scored, and
rendered at the brief's ratio.

Generation and assembly have different responsibilities. Set exact copy,
branding, captions and evidence in post rather than trusting generated type.
Model duration and ratio capabilities change; inspect the selected live model
instead of assuming a fixed clip limit or that no generator supports a ratio.
Compose every requested placement deliberately, including 4:5, without cropping
away proof or readable text. `prompts/formats/video.md` and `motion-graphic.md`
hand this finishing work to assembly.

For creator-led work, read the [production standard](../ugc-creator-edit/references/production-standard.md)
and [review gates](../ugc-creator-edit/references/review-gates.md). Their dialogue-led mix, meaningful cuts, source/identity
rules and exact-export reviews govern UGC finishing. This skill's renderer
defaults are implementation settings, not universal creative requirements.

Method credit: the story, reading and audio craft is adapted from `brag`
(MIT, github.com/latent-spaces/brag), rewritten for paid social: sound off,
safe zones, verbatim brief copy, matrix tests.

## How it works

Three files make one ad, in a run folder of your choosing:

```
<run>/
  plan.md            the angle in prose: why this hook, what is shown, what the sound does
  storyboard.json    the contract: scenes, every on-screen line with its timing and source, audio, poster
  composition/       index.html (how it looks) + media/ + fonts/; runtime.js is copied in for you
  <name>.mp4         the ad; <name>.jpg beside it is the poster, identical to frame 0
  work/stills/       review frames and contact.png
```

The storyboard is what the checks read. The composition is HTML drawn by the
skill's runtime, where every property is a function of time, so any frame
renders the same way twice. The scripts need Node 22+, ffmpeg and an installed
Chrome or Edge. Nothing to install.

```
node scripts/check-storyboard.mjs <run>/storyboard.json --brief brief.json --kit brand-kit.json
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json --mode check
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json --mode stills
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json [--draft]
node scripts/beats.mjs <track> --window 30 --out <run>/work/cues.json
node scripts/qa-video.mjs <run>/<name>.mp4 --storyboard <run>/storyboard.json --poster <run>/<name>.jpg
node scripts/make-row.mjs --base <base-run> --brief brief.json --out <row-dir>     (MST rows only)
node scripts/make-srt.mjs <run>/storyboard.json --out <run>/captions.srt
node scripts/phrase-map.mjs <voice.wav> --script script.txt --out <run>/work/phrases.json [--srt captions.srt]
```

`scripts/` is relative to this skill's directory. Keep run folders out of the
skill directory and off a full system drive.

## Process

At media selection and delivery, consult the current private client library and
[library workflow](references/client-library.md). Respect source windows and
current decisions, then synchronize authorized source/recipe/review records and
approved exports to their separately configured destinations.

### 1. Read the brief and the kit

From the brief: `asset_type`, `creative_specifications` (dimensions, duration,
placement), `copy_architecture` (hook, cta, headlines, proof), `visual_direction`
(palette, typography, avoid list), `brand_assets`, `testing_framework`. From the
brand kit: palette hex values, font families, logo files and their placement
rules, verified claims, product imagery.

A product-led brief with product references under `brand_assets.missing` is
blocked. Say what is missing and stop; do not show a stand-in product.

Write down the copy you are allowed to put on screen before planning anything.
It is the brief's `copy_architecture`, the kit's verified lines, and nothing
else that asserts a fact (see grounding, below).

### 2. Plan the angle, then the storyboard

Read `references/craft.md` before this step. It holds the shape, the order of
what to show, the reading floor, tone, transitions and sound.

Write `plan.md` first, short: the angle in one paragraph, the hook and why it
stops the scroll with the sound off, the 2 to 3 things shown, the proof, the
CTA, the tone, the audio arc. Then write `storyboard.json` to the format in
`references/storyboard.md`.

The default shape for a feed ad:

```
Hook (0 to ~2s) -> Show (the product doing its job, 1 to 3 beats) -> Proof (optional) -> CTA end card (>= 1.5s held)
```

Decide the hook before anything else. It is the brief's `copy_architecture.hook`,
verbatim, readable by the end of the first second, because the first second
decides the result and it decides it muted. Frame 0 is the thumbnail, so design
it to read as a still.

### 3. Check the storyboard

```
node scripts/check-storyboard.mjs <run>/storyboard.json --brief <brief> --kit <kit>
```

It fails on: a hook not on screen by 1.0s; any line held under its reading
floor; a CTA that is not the brief's CTA verbatim or is held under 1.5s; a line
whose `source` field does not contain it; a `framing` line that asserts
something (digits, money, percentages, superlatives, guarantees); gaps in the
timeline; a duration or ratio that disagrees with the brief; a poster that is
not on settled copy. Fix the storyboard, not the check. A WARN is for you to
judge and mention.

### 4. Gather media

- **Clips and stills.** Generate through `metrix-ad-creative`: still first, one
  action per clip, one model locked across the ad, no type in any generated
  layer (prompt the empty space where type will land). Name each for its scene.
- **Real product imagery** from the brand kit beats a generated stand-in.
  Download it into `composition/media/`. Showing the actual product is the
  strongest material there is.
- **Fonts.** Download the kit's font files into `composition/fonts/` and load
  them with `@font-face`. A remote font can fail mid-render and change face
  between frames. The renderer warns on any font that did not load; treat that
  as a fail.
- **Logo.** Build the mark the way the kit says the brand builds it. Where the
  kit supplies the wordmark as artwork, place the file and never retype it:
  spacing and tracking do not survive typing. Where the kit's own construction
  sets the name in type beside an icon (Metrix: icon plus "metrix" in Inter
  800), set it exactly that way. Honour the kit's clear-space rules either way.
- **Music.** Three sources, in this order of preference when no client track is
  supplied:
  1. A client-supplied licensed track.
  2. An original bed scored to this ad's cuts: write a cue sheet (tempo, grid
     start, one section per scene with a chord and an energy level) and run
     `node scripts/compose-bed.mjs <run>/media/bed.wav <cue-sheet.json>`. It is
     synthesised from scratch, so it carries no licence question; record
     `"licence": "original, composed by compose-bed.mjs"`. Pick the tempo and
     grid start for any purposeful music accents (`grid_start + k * 60/bpm`);
     the script reports section alignment. Dialogue, proof readability and the
     brief determine cuts and energy. Do not move every cut onto a beat, force
     the opening to a fixed energy or make the CTA louder by default. Fade or
     offset the bed when its first transient competes with the opening word.
  3. `ai-music-api/generate` with `instrumental: true` through Kie
     (`metrix-ad-creative/references/model-routing.md`), only once its
     commercial terms are confirmed.
  Never a track whose licence you cannot name. Run `beats.mjs` on it.
- **Sound effects.** `assets/sfx/` holds a small CC0 set chosen for low
  harshness; `references/craft.md` maps moments to files.
- **Voiceover**, only when the brief asks: preserve the accepted performance or
  use the selected currently verified provider/voice route. A remembered model
  ID is not current capability evidence. Check phrase consistency and possible
  competing vocal layers before the final mix. Every voiced line also appears
  on screen as a caption (`source: "voiceover"`).

Uploaded and result URLs on Kie expire in 1 to 3 days. Download what you use.

### 5. Build the composition

Start from `assets/template/index.html`. Scene and line times are copied from
the storyboard exactly; ids match (`data-scene="s2"`, `data-text="hook"`).
Brand palette and fonts go in the `:root` tokens. When the product shots are
mockups on a wall, sample the wall colour from the photo for the ground, so the
photo edge does not show as a seam; size and place each photo so no edge of it
lands inside the frame unless the edge is meant to be seen. Size type in `vw` so one file
serves 9:16, 4:5 and 1:1. The vocabulary (`data-enter`, `data-ken`, `data-clip`,
`data-count`, `Motion.on`) is documented at the top of `scripts/runtime.js`.

No CSS animations, transitions, timers or animation loops: they ignore seeking
and will render differently every time.

### 6. Look before rendering

```
render.mjs ... --mode check     safe zones, overflow, minimum type size, per readable line
render.mjs ... --mode stills    each scene settled, both sides of every cut, the poster; contact.png
```

For a scene cut from a recording or a generated clip (`data-clip`), the clip
plays from `data-offset` seconds into its source at the scene's start, so
`data-offset` picks the moment. Before setting it, step through the source
(`ffmpeg -ss <t> -i clip.mp4 -frames:v 1 f.png` at a few times) and note when
the action you want begins and ends. Then check stills at both ends of the
scene: the first shows the opening moment you chose, the last shows the action
landed, not cut off.

Open `work/stills/contact.png` and the individual stills and look at them. The
layout check does not judge contrast, crowding, or whether the product is the
hero; your eyes do. Fix collisions, low contrast, text over busy image areas
(add a scrim), muddy transitions. Re-run both until clean.

### 7. Render

`--draft` (15 fps, faster encode) while iterating, then the full render. The
renderer bakes the poster as frame 0, writes `<name>.jpg`, and mixes audio.
Its default loudness target is -14 LUFS with peaks limited to about -1.5 dBFS;
set `audio.lufs` from the approved delivery profile or use `--no-loudnorm` for
an already accepted mix. Report actual measurements. Neither normalization
nor automatic voiceover ducking proves audible music, coherent narration or
natural performance. Check the encoded mix through actual listening.

One ad per ratio the brief's placements need. Render each from the same
composition with a storyboard per ratio; check each one, since a layout that
clears 4:5 can still sit under the Reels overlay at 9:16.

### 8. Validate, then report

```
node scripts/qa-video.mjs <name>.mp4 --storyboard <run>/storyboard.json --poster <name>.jpg [--lufs <approved>]
```

It checks the file itself: ratio, duration, an audio stream that runs as long as the
picture, loudness within
1 LU of the target, silence when the storyboard has no audio, and `--effects-only`
for a mix with no music or voice. `--storyboard` supplies the ratio, duration,
loudness target (`audio.lufs`, default -14) and silent or effects-only mode the
renderer used, so the file is checked against the same facts it was built from.
An explicit `--ratio`, `--duration`, `--lufs`, `--silent` or `--effects-only`
always wins; the output lists where each value came from and notes any override.
Pass `--lufs` from the approved delivery profile when it differs from the
storyboard: a QA that only repeats the storyboard's own target cannot catch a
wrong target.
No music with present dialogue is still a voiced mix, not effects-only. It
also checks poster equal to frame 0,
BT.709 colour tags, and double exposures, a frame that is a mid blend of two
different shots. A double exposure is the muddy crossfade that makes an ad look
cheap; the fix is a `dip` transition, never a lower threshold.

Then run the five-row check from `prompts/04-self-validation.md` against the
rendered file, plus the format list in `prompts/formats/video.md` or
`motion-graphic.md`:

- Read every on-screen line in the stills and compare it to the brief
  character for character. The layout check reports the copy it found per line id.
- Look at the poster: is it a frame you would run as a static ad?
- Read the frames as a muted viewer: does the idea land with no sound?

Report per ad: the brief id, the concept, the file and poster paths, ratio,
duration, measured loudness, the media used and where each came from (Kie task,
kit URL, client file), every check verdict, and anything you could not verify.

## Naming

Name for the concept: `skyline-print-gift-hook-4x5.mp4`. Inside a live Matrix
Sprint Test only, use `testing_framework.matrix_naming_convention` exactly,
because `metrix-mst-creative-scan` parses it.

## Inside a Matrix Sprint Test

Only when the brief carries `brief_metadata.mode: "matrix"` with a live matrix.

The isolated variable lives in one scene, usually the hook. Build and check
one base ad first (the control cell), with `"slot": {"scene": "s1"}` in its
storyboard. Then generate the row from it:

```
node scripts/make-row.mjs --base <base-run> --brief brief.json --out <row-dir> [--field hook] [--text-id hook]
```

For each `testing_framework.cells[]` entry it copies the composition and every
audio file the storyboard names (music, voiceover and each effect, from a
storyboard-relative, absolute or `../` path) into the cell under `_row_audio/`,
puts the cell's copy into the slot line in both the storyboard and the HTML,
names the cell by `matrix_naming_convention`, and runs `check-storyboard.mjs
--row` over the result. A cell is self-contained: it renders and moves without
the base run. A missing audio input stops the script before any cell is made. Render each cell, run `qa-video.mjs` on each, and keep the poster
time identical across the row.

The row check fails if anything outside the slot differs, or if any timing
differs inside it. A longer hook gets the same clock as a shorter one; if it cannot meet the
reading floor in that clock, the cell is a brief problem, not an edit.

## Caption file

```
node scripts/make-srt.mjs <run>/storyboard.json --out <run>/captions.srt
```

Exports the storyboard's spoken-caption lines (`source: "voiceover"`) as SRT, each
cue running from the line's `in` to its `out`. It sorts cues, clamps one that runs
into the next and says so, and fails on a cue with no length, a negative time, no
text or a time past the storyboard's duration. It reads times from the storyboard
only: it does not hear the take, so caption timing against the actual voice is
still a listening check. `--source` names another source value and `--all` exports
every text item for review.

## Phrase map and script check

```
node scripts/phrase-map.mjs <voice.wav> --script script.txt [--alias "heard=meant"] --out <run>/work/phrases.json [--srt captions.srt]
```

Run it on the accepted dry voice (a room-processed voice merges phrases, because
its tails sit above the silence threshold). Phrase edges come from ffmpeg
silencedetect (-40dB, gaps of 0.15 s or more) and are the cut points; Whisper
words (ffmpeg's whisper filter, model from `--model` or `METRIX_WHISPER_MODEL`,
needs ffmpeg 8.1 or later for `max_len`) only say which words fall in which
phrase. With `--script` every script word must be heard in order or it exits 1,
naming the word. Run it again after every change to the voice chain. `--alias`
maps a brand name the recogniser always mishears. Pass the output to
`check-storyboard.mjs --phrases` so no effect lands just before a phrase. A
recogniser match is not a listening pass.

## Caption cues from word times

```
node scripts/captions/cues.mjs --phrases <run>/work/phrases.json --script script.txt --energy conversational \
  [--fps 30] [--cuts 3.438,5.234] [--offset <voiceover.at>] [--alias "heard=meant"] --out <run>/work/cues.json --srt cues.srt
```

Groups the locked script into caption cues on the ad clock: 2 to 3 words for high energy, 3 to
5 conversational, 4 to 6 calm, breaking at a sentence end, a pause of 150 ms or more, or the word
limit (HyperFrames rules). Cue text is always the script's words, matched to heard words by
position; a word-count mismatch after `--alias` is an error. Timing follows Netflix: 42
characters a line, 2 lines, 20 characters a second, a 2-frame gap, a 20-frame minimum cue, in
and out snapped to a shot change within 0.5 s. Each cue fades over its last 0.12 s and is hidden
at its end. The lint fails overlaps, short cues, fast cues, long lines and anything visible after
its end, and exits 1. A fast speaker can fail 20 characters a second with verbatim text; that is
a decision for a human, not something the builder hides. `--whisper-cli` reads whisper-cli JSON
(`-ml 1`) and `--words` a plain `[{text,start,end}]` list.

## What this skill will not do

- Invent a claim, a number, a testimonial or a rating. Connective framing is
  free; assertions come from the brief or the kit, with their evidence.
- Write the copy. The hook, CTA and headline come from the brief;
  `copywriting-meta-ads` writes them when they are missing.
- Put generated type in the frame. Type is set by the composition.
- Use music it cannot name a licence for.
- Call a render done without looking at its stills.
