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
node scripts/timeline.mjs plan --phrases <run>/phrases.json --cut <run>/cut.json          (voice-cut ads)
node scripts/timeline.mjs check <run>/timeline.json
node scripts/timeline.mjs emit <run>/timeline.json --all
node scripts/check-storyboard.mjs <run>/storyboard.json --brief brief.json --kit brand-kit.json [--script <locked script>] [--phrases phrases.json]
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json --mode check
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json --mode stills [--times 1.2,0.4]
node scripts/render.mjs <run>/composition --storyboard <run>/storyboard.json [--draft] [--timeouts '{"evaluate":5000}']
node scripts/beats.mjs <track> --window 30 --out <run>/work/cues.json
node scripts/qa-video.mjs <run>/<name>.mp4 --storyboard <run>/storyboard.json [--timeline <run>/timeline.json] [--exempt exemptions.json] --poster <run>/<name>.jpg
node scripts/asr-check.mjs --script <locked.txt> --aliases <client asr-aliases.json> raw=<take.wav> polish=<polished.wav> master=<ad.mp4>
node scripts/media/eye-state.mjs <clip> --scores <clip>.eyes.json --range <src_in>-<src_out> [--cut t]
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

When the ad is cut from a voice take, do not write the storyboard by hand. Write
the cut plan (`cut.json`, references and constraints, no times) against the
phrase map, then run `timeline.mjs` (`references/timeline.md`):

```
node scripts/timeline.mjs plan --phrases <run>/phrases.json --cut <run>/cut.json     writes <run>/timeline.json
node scripts/timeline.mjs check <run>/timeline.json                                    exit 0 PASS or WARN, 1 FAIL, 2 input error
node scripts/timeline.mjs emit <run>/timeline.json --all [--dir <folder>]
```

`emit --all` writes every storyboard (`storyboard_{ratio}_{cap|clean}.json`, each
stamped with `derived_from`), `captions.srt`, `transcript.txt`, `stills-times.json`
and `edge-times.json`, plus `cues.json`, `tm.json`, `voice-graph.txt` and `edl.json`
when the timeline has a bed, a TM block, voice segments and readable plan inputs.
All of them come from `timeline.json`; do not hand-edit them. Change `cut.json`,
re-plan, re-check, re-emit. Caption text is the script's words, never the ASR
spelling: the recogniser only supplies the times.

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
node scripts/check-storyboard.mjs <run>/storyboard.json --brief <brief> --kit <kit> \
  [--script <locked script>] [--packet <preproduction packet>] [--phrases <run>/work/phrases.json]
```

It fails on: a hook not on screen by 1.0s; any line held under its reading
floor; a CTA that is not the brief's CTA verbatim or is held under 1.5s; a line
whose `source` field does not contain it; a `framing` line that asserts
something (digits, money, percentages, superlatives, guarantees); gaps in the
timeline; a duration or ratio that disagrees with the brief; a poster that is
not on settled copy. Fix the storyboard, not the check. A WARN is for you to
judge and mention.

Grounding is strict:

- **No `--brief`, no pass.** Without it every line that is not `framing` or `kit.`
  fails, and without `--kit` every `kit.` line fails. `--allow-ungrounded` turns
  those into WARN for a deliberate unchecked run; the JSON report then lists the
  override and every unchecked rule under `overrides`, and stderr says so. Report
  the override; never call such a run checked.
- **Voiced captions ground in the brief or the locked script.** A
  `source: "voiceover"` line must appear in the brief's `copy_architecture` or in
  the file given with `--script` (or the packet's `script.path` with `--packet`),
  and that file's sha256 must equal `audio.voiceover.script_sha256` (and the
  packet's `script.sha256` and `voice.accepted_bindings.script_sha256` with
  `--packet`). `audio.voiceover.script` is author text: it grounds nothing, and
  with a locked script it must say the same words. A locked script is plain text
  or JSON with `lines[].text`, `spoken_script`, `script` or `text`.
- **A voiced claim needs its field.** A voiced line with a digit, money, `#1`, a
  superlative or a guarantee needs `claim_source`: a brief or kit field, not a
  forbidden or avoid list, that contains the line.
- **Music names its licence.** `audio.music.file` without `audio.music.licence` fails.
- **Delivery.** `delivery.captions` is `"cap"` (voiceover captions burned in) or
  `"clean"` (none burned). A CLEAN storyboard passes sound off only through
  `delivery.srt`: a caption file whose words equal the voiced script in order
  (the locked script, else the brief's `copy_architecture.script` or
  `spoken_script`), with cues inside the ad that do not overlap, and with
  `--phrases` a cue over every phrase. Without `--phrases` the timing is a WARN.
  Without a `delivery` block the original rule holds: a voiceover needs burned captions.
- **Emitted storyboards stay emitted.** A storyboard with `derived_from` must
  match its `timeline.json` (sha256 of the bytes, `mce.timeline/1`, and
  `tm_sha256` of the timeline's `tm`), and a storyboard with a `timeline.json`
  beside it must carry the stamp. Re-emit; do not hand-edit.
- **`schema_version: 2`** requires `format.placement`, resolved through the
  placement-zone table (below); an unknown placement fails.

### 4. Gather media

- **Clips and stills.** Generate through `metrix-ad-creative`: still first, one
  action per clip, one model locked across the ad, no type in any generated
  layer (prompt the empty space where type will land). Name each for its scene.
  For AI UGC, no motion or lip-sync job is submitted until the run's version 2
  preproduction packet passes `kie_validate_ugc_preproduction` with
  `presenter.acceptance` recorded by someone other than `prepared_by` (see
  `kie://ugc-preproduction`).
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
  on screen as a caption (`source: "voiceover"`) in a CAP deliverable, or in the
  `delivery.srt` caption file of a CLEAN one. Lock the accepted script: write its
  sha256 into `audio.voiceover.script_sha256` and pass the file with `--script`.
- **Script check after every audio stage.** Each stage that touches the voice
  (the raw take, each processing pass, the mix, every rendered master) is
  checked against the locked script:

  ```
  node scripts/asr-check.mjs --script <locked.txt> --aliases <client asr-aliases.json> \
    raw=<take.wav> polish=<polished.wav> master=<ad.mp4> ...
  ```

  Aliases for a brand word the recogniser always mishears come only from the
  per-client file (`mce.asraliases/1`, each alias with a `why`); `--alias` on the
  command line is refused. The report gives `first_failing_stage`, the first
  stage whose words differ from the script, and each stage's added and removed
  differences. Exit 0 every stage MATCH, 1 a MISMATCH or a failed transcript,
  2 bad input or no recogniser. ASR agreement is not a listening pass.

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
render.mjs ... --mode check     safe zones, overflow, minimum type size, per readable line; craft checks
render.mjs ... --mode stills    each scene settled, both sides of every cut, the poster; contact.png
render.mjs ... --mode stills --times 1.2,0.4    exact ad-clock times instead, in the order given
```

Both modes also print two page reports, health and parity, and exit 1 on a FAIL
in either. A render checks the same two before it draws a single frame and
refuses to start on a FAIL:

- **Health.** A broken image, a font that did not load, a video with
  `readyState` under 1 or a NaN duration, a page running a `runtime.js` that
  differs from the skill's, or a page settle default that differs from
  `timeline/rules.mjs`. Clip seeks are checked as the frames are drawn: a seek
  that gave up after the fallback wait, or one that presented a different source
  frame from the one the timeline maps to, FAILs the run after encoding (exit 1).
- **Parity.** The authored DOM must match the storyboard: each text item's
  `data-in`, `data-out` and `data-dur`, its `data-exit`, its copy, and each
  scene's `data-start` and `data-end` where the composition has them. An entrance
  of `none` against any other FAILs, because one settles at once and the other
  after its `dur`; two different moving entrances only WARN.

The craft checks (`line_unread`, `dead_stretch`, `type_floor`) and their
thresholds are in `references/craft.md`, section 4.

render.mjs copies the skill's `runtime.js` into the folder it is given, and
only that folder. A composition whose `index.html` uses `<base href>` to borrow
another folder's `runtime.js` runs that copy, so render the folder that owns the
runtime first, or the health check FAILs on a stale runtime. A past run's CLEAN
composition borrowed `../composition/runtime.js` this way.

For presenter clips, run the eye-state gate on every kept range before the
render (`media/eye-state.mjs`, under "Media checks" below). A FAIL is a closed
or closing eye at a range edge or next to a cut: move the edge. Look at the eye
sheet as well; the gate does not replace it.

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

Every browser call has a budget: 30 s for launch, page load and readiness, 20 s
for each in-page evaluate, 10 s for each capture, and the whole run 30 s plus
2 s per seek (one seek a frame for a render). Override any of them, in
milliseconds, with `--timeouts '{"evaluate":5000}'` (JSON or a file path; keys
`load`, `evaluate`, `capture`, `perFrame`, `seekFallback`, `readyVideo`). On a
timeout render.mjs kills the browser's whole process tree and the encoder and
exits 3. Exit 0 is a pass, WARNs included; 1 a FAIL or an error; 2 bad usage or
a refused backend. `--backend` takes `mce-cdp` only: `hyperframes` is refused
until the five gates are observed passing on it, and `remotion` because there is
no licence record.

One ad per ratio the brief's placements need. Render each from the same
composition with a storyboard per ratio; check each one, since a layout that
clears 4:5 can still sit under the Reels overlay at 9:16.

### 8. Validate, then report

```
node scripts/qa-video.mjs <name>.mp4 --storyboard <run>/storyboard.json --timeline <run>/timeline.json \
  [--exempt exemptions.json] --poster <name>.jpg [--lufs <approved>]
```

Pass `--timeline` whenever the ad has one. Deliberate holds (shots with no
source clip: an app screen, an end card) come only from it, so without it every
hold FAILs the freeze check; it also supplies the shot list for the short-shot
gate and adds the stricter blend check at each timeline cut. Do not lower a
threshold to pass a hold; pass the timeline. A double-exposure hit is
adjudicated from stills before any exemption is written (`references/craft.md`,
section 8). An exemption file (`mce.qaexempt/1`) binds to the sha256 of the exact
file under QA; each entry names the check, a time window, a reason, a reviewer
and a still with its sha256. An exempted check reports EXEMPT, never PASS, and
keeps its raw measurement. Only `black_frames`, `freeze`, `short_shot`,
`transitions` and `transitions.at_cuts` can be exempted; `audio.length`,
loudness, format, poster and colour cannot. Exit 0 PASS or EXEMPT, 1 FAIL, 2 bad
input.

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
--row` over the result. The row check covers isolation only; check each cell on
its own as well, with `check-storyboard.mjs <cell>/storyboard.json --brief
brief.json`, because grounding needs the brief. A cell is self-contained: it renders and moves without
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

## HyperFrames layer (captions, motion, finishing)

HyperFrames v0.9.19 (Apache-2.0) is pinned in the engine's `package.json`, and its
nine official skills ship beside this one: `hyperframes` (read it first: the render
contract and work loop), `hyperframes-cli`, `hyperframes-registry` (about 450
caption, transition, overlay and kinetic-type blocks), `media-use` (grades, looks,
transcripts, audio placement), `reverse-any-video`, `remotion-to-hyperframes`,
`style-sampling`, `slideshow` and `figma`. Their sources are pinned in
`skills/VENDORED.json`; refresh them only by bumping that pin.

They build on this skill rather than replace it. The engine stays the source of
truth for words and timing; HyperFrames draws on top of it:

```
node scripts/phrase-map.mjs <voice.wav> --script script.txt --out <run>/work/phrases.json
npx hyperframes add caption-highlight            (in the HyperFrames project; any caption-* block)
node scripts/hyperframes/captions-from-phrases.mjs <run>/work/phrases.json \
     --component compositions/components/caption-highlight.html \
     --out compositions/captions.html --width 1080 --height 1920 [--offset <voice at>]
npx hyperframes check                            (its readability, layout and audio gate)
npx hyperframes render --output <name>.mp4
node scripts/qa-video.mjs <name>.mp4 --ratio 9:16 --duration <s>     (this engine's gate, unchanged)
```

The adapter refuses a phrase map whose script check did not match, groups words
inside each phrase so a caption never runs across a pause, closes the blank frame
registry blocks leave between groups, holds the closing line to the end and, on
vertical video, lifts captions to 36 % of the height so they clear the platform's
bottom overlay. Both gates must pass: `hyperframes check` and `qa-video.mjs`.

Operating rules:
- Set `HYPERFRAMES_NO_TELEMETRY=1` (and run `npx hyperframes telemetry disable`
  once per machine). Use only the local, free routes in `media-use`; its paid
  generation and cloud render routes need a quote and owner approval like any spend.
- Point `TEMP`/`TMP` at a drive with room before rendering; the CLI refuses under
  about 1 GB free.
- Its own transcription needs whisper.cpp. Use this engine's `phrase-map.mjs`
  words instead; they are the ones that passed the script check.
- `reverse-any-video` and `style-sampling` are for internal analysis of reference
  ads: measure pacing, cuts and caption density. Never republish or reuse the
  footage.
- `remotion-to-hyperframes` is only for porting work the owner already licenses.

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

## Media checks (`scripts/media/`)

Every ffmpeg and ffprobe call in these modules goes through `media/probe.mjs`;
`MCE_FFMPEG` and `MCE_FFPROBE` override the binaries. Errors carry a code
(`ENOFFMPEG`, `ENOFFPROBE`, `UNREADABLE`, `BADARG`, `FFMPEG`, `SHEET_MISMATCH`, ...).

```
node scripts/media/scdet.mjs <video>... [--threshold 10] [--min-shot 0.75] [--allow 15.4-18.1]... [--json]
node scripts/media/stage.mjs <src> <dst> [--fps 30]        |   node scripts/media/stage.mjs --check <file> [--fps 30]
node scripts/media/eye-sheet.mjs <clip> --out sheet.png --font F.ttf (--from a --to b | --range a-b... --edges N) \
  [--cols 8] [--tile-width 180] [--scores scores.json]
<py312> -I scripts/media/eye_state.py <clip> --out <clip>.eyes.json [--width 540]
node scripts/media/eye-state.mjs <clip> (--scores <clip>.eyes.json | --out <clip>.eyes.json) --range <src_in>-<src_out>... \
  [--cut t]... [--no-face warn] [--json]
```

- **`scdet.mjs`**: cuts from ffmpeg scdet (threshold 10), then two gates. Short
  shot: any interval between cuts under 0.75 s fails, first and last shot
  included (`--min-shot` or `MCE_MIN_SHOT` to change it). Freeze and drops:
  freezedetect (noise 0.001, 0.1 s) fails any freeze outside an `--allow` range,
  and the decoded frame count must equal round(duration x fps) with no pts step
  over 1.5 frames. A deliberate hold is an `--allow` range taken from the plan,
  never a looser threshold. scdet can miss a soft cut such as a punch-in, so the
  storyboard's or timeline's cut list is the truth and scdet the cross-check.
  Exit 0 PASS, 1 FAIL, 2 unreadable or no ffmpeg.
- **`stage.mjs`**: re-encodes a source clip with a keyframe every second
  (`-c:v libx264 -crf 18 -g <fps> -keyint_min <fps>`, audio copied, fps defaults to
  the source's rounded rate), then proves it: first keyframe on the first frame,
  no keyframe interval over one second of frames, decoded frame count equal to
  the source. Sparse GOPs as the cause of seek freezes in renders is inferred,
  not proven; staging removes the condition. `--check` verifies an existing file.
- **`eye-sheet.mjs`**: a contact sheet of every decoded source frame in a range,
  or the first and last N frames of each `--range` with `--edges N`, each tile
  stamped with its index and source time, plus `<sheet>.json` (`mce.eyesheet/1`).
  No fps filter is applied, and the call fails if ffmpeg drew other frames than
  ffprobe planned. It is the human review record for blinks and eye state at
  kept-range edges and cuts; it detects nothing itself. `--scores` attaches
  per-frame scores (for example MediaPipe blendshapes) within half a frame.
- **`eye-state.mjs`** (eye-state gate, presenter clips): score each clip once with
  `eye_state.py` (MediaPipe Face Landmarker blink blendshapes on every decoded
  frame, no fps filter; `mce.eyestate/1`). It runs in the Python 3.12 venv that
  holds MediaPipe: `MCE_PY312`, else the `venv312` entry of `INSTALLED.json`
  (on this machine `X:/Metrix/venv312/Scripts/python.exe`). `--out` without
  `--scores` scores the clip itself when that venv is found; `--scores` refuses a
  record made from a different file. Then judge the kept source ranges
  (`--range`, the timeline shot's `src_in`-`src_out`) and any cut inside them
  (`--cut`, source seconds). A closure is a run where the weaker eye's blink
  score reaches 0.3 with at least one frame at 0.4 (`--open`, `--close`). FAIL:
  a closure in the first or last 0.12 s of a range (3 frames at 25 fps, 4 at 30;
  `--edge-frames` to set it) or that close to a cut, or a frame of the range with
  no score. WARN: a closure mid-range; look at it on the eye sheet. No face at an
  edge FAILs unless `--no-face warn` (a shot where the face legitimately leaves);
  mid-range it WARNs. Exit 0 PASS or WARN, 1 FAIL, 2 error. The eye sheet stays
  the human record; the gate does not replace looking at it.
- **`asr.mjs`** (library, used by `phrase-map.mjs`): `islands()` is silencedetect
  (-40 dB, 0.15 s) and gives the cut points; `words()` runs ffmpeg's whisper
  filter and needs a model file; `filters()` reports whether this ffmpeg build has
  whisper, silencedetect, scdet and freezedetect.
- **`probe.mjs`** (library): `probe(file)` returns duration, video size, frame
  rate, frame count, pixel format and audio rate and channels; `framePts(file)`
  lists every decoded frame time.

## Placement zones

`scripts/placement-zones.mjs` reads `references/placement-zones.json`
(`mce.zones/1`; the canonical copy is in `metrix-ad-creative/references`, edit it
there). `zoneFor({ ratio, placement })` returns the overlay bands for a placement:
Instagram Reels, Instagram Stories and Facebook Stories at 9:16 are 14 % top, 35 %
bottom, 6 % sides from Meta's own page (enforced); Facebook Reels is a third-party
row that only warns; feed is a 5 % house margin. Names are matched loosely
(`"Instagram Reels"`, `instagram-reels`, `reels`). No placement falls back to the
legacy row with a warning; an unknown placement, or one that does not run at the
ratio, throws. `checkBoxes(items, zone, minPx)` checks normalised boxes against
the bands and the type floor. `check-storyboard.mjs` resolves `format.placement`
through it. At the time of writing the render check still uses its own legacy values;
treat its zone verdict as legacy until the renderer reads this table.

## Timeline contracts

`scripts/timeline/schema.mjs` holds the frozen formats `mce.phrasemap/1` (voice
clock), `mce.cutplan/1` (authored) and `mce.timeline/1` (ad clock), and the
`derived_from` stamp; `references/timeline.md` is the prose. Each `validate*`
function returns a list of errors, empty for a pass, and unknown fields fail.
`serialize()` is the one byte form every sha256 is taken over, `tmSha256()` the
hash of a TM block, `roundTime()` rounds the way Python does. `check-storyboard.mjs`
uses `validateDerivedFrom` and `tmSha256` to hold an emitted storyboard to its timeline;
it does not validate the timeline itself, which is `timeline.mjs check`'s job.
`scripts/timeline.mjs` is the one writer of `timeline.json` and every file emitted
from it (step 2).

## What this skill will not do

- Invent a claim, a number, a testimonial or a rating. Connective framing is
  free; assertions come from the brief or the kit, with their evidence.
- Write the copy. The hook, CTA and headline come from the brief;
  `copywriting-meta-ads` writes them when they are missing.
- Put generated type in the frame. Type is set by the composition.
- Use music it cannot name a licence for.
- Call a render done without looking at its stills.
