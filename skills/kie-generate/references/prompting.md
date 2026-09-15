# Prompting

How to write prompts per model family. Model ids and their parameters are in
[`MODEL_CATALOG.md`](MODEL_CATALOG.md); this is about what to put in the prompt
string once you have picked one.

## The general shape

Generation models weight the front of a prompt most heavily. Lead with what must
not be wrong.

```
subject and action -> composition -> environment -> light -> style -> colour -> technical
```

Four habits that separate a usable prompt from a lucky one:

**Name a medium, not a mood.** "Editorial photography, 50mm, shallow depth of
field" is reproducible. "Premium", "aspirational", "clean" are not — the model
has no shared referent, so you get a different interpretation every run. If a
brief hands you the adjective, translate it once and reuse that exact
translation everywhere.

**Use parameters for what parameters control.** Aspect ratio, resolution,
duration and seed are fields. Writing "9:16 vertical" in the prompt text does
not produce a vertical image; the ratio parameter does.

**Say what to show, not what to omit.** Many image models have no true negation,
so "no text, no watermark" reliably produces text and watermarks. Use the
model's `negative_prompt` field where it has one. Where it does not, phrase it
positively: "plain seamless backdrop" instead of "no background clutter".

**Change one thing at a time.** When a result is close but wrong, edit the one
clause responsible and re-run. Rewriting the whole prompt means you learn
nothing about which change helped — and in a Matrix Sprint Test it invalidates
the cell outright.

## Image generation

Specify, roughly in this order: subject, shot type and angle, setting, lighting,
style/medium, colour, lens and depth of field.

```
A matte black insulated water bottle standing on a weathered concrete ledge,
three-quarter product shot at eye level, soft overcast daylight from the left,
editorial product photography, muted grey and deep green palette,
85mm, shallow depth of field, subject sharp against a soft background
```

Things worth knowing:

- **Text in images is unreliable** across every model, though some are markedly
  better than others. For ad creative, prefer a clean image plus Ads Manager
  copy fields. When on-image text is genuinely the point, keep it to a few
  words, expect to re-roll, and check every character before shipping.
- **Hands, faces at distance, and reflections** are where artefacts hide. Zoom in
  before approving.
- **Counts drift.** "Three bottles" often yields two or four. If a count
  matters, verify it rather than trusting the prompt.

## Image editing

Edit models take one or more **input image URLs** plus an instruction. Two rules:

**The image must be reachable over HTTPS.** A local file path is not an input.
If you have a local file, it needs a public URL first — see the upload section
of `MODEL_CATALOG.md` for whether Kie offers an endpoint for this.

**Describe the change, not the whole scene.** "Change the background to a plain
warm grey studio backdrop, keep the product and its lighting unchanged" works.
Re-describing everything invites the model to regenerate parts you wanted kept.
Name explicitly what must be preserved — edit models drift on unmentioned
elements.

## Video

Video prompts carry everything an image prompt does, plus motion and time.

```
Slow push-in on a woman in her thirties at a sunlit kitchen counter,
she looks up from her phone and smiles,
handheld documentary feel, warm morning light,
shallow depth of field, 5 seconds
```

- **Say what moves.** Separate subject motion ("she turns toward camera") from
  camera motion ("slow dolly in"). Left implicit, you get an near-static shot or
  unwanted drift.
- **One action per clip.** Multi-beat instructions ("she picks it up, walks
  over, then opens the door") exceed what a few seconds can hold, and the model
  compresses or drops beats unpredictably.
- **Budget for the hook.** A paid-social hook is decided in the first second or
  two. Front-load the arresting moment; do not build to it.
- **Duration is a parameter with fixed options**, not free text. Check the
  model's allowed values.
- **Expect long waits and higher credit costs** than images. Use
  `kie_create_task` plus `kie_wait_for_task` rather than blocking, and raise
  `timeoutSeconds` past the 300s default.

### Image to video

Where a model accepts a starting image, it controls composition, subject and
style far more reliably than words do. The prompt then only has to carry motion.
For ad creative this is usually the better path: generate the frame, approve it,
then animate it — you get to reject a bad composition before paying for video.

## Music and speech

Music models want **genre, instrumentation, tempo, mood and structure**, plus
lyrics where supported.

```
Upbeat indie folk, acoustic guitar and handclaps, 120 bpm,
warm and optimistic, building to a full chorus, 30 seconds, instrumental
```

For ad beds, ask for instrumental unless vocals are the point — vocals compete
with voiceover and on-screen copy.

Speech models want the **text** plus a voice id and delivery notes. Punctuation
does real work: commas and full stops set the pacing far more reliably than
adjectives like "slowly".

## Upscaling

Upscalers take an image URL and a scale factor. They sharpen what is there; they
do not add information. An upscale will not fix a bad composition, a mangled
hand, or garbled text — regenerate instead. Use it as the last step before
delivery, once the asset is approved.

## Prompting inside a Matrix Sprint Test

An MST is an optional sprint you run to answer a specific question, not a stage
everything passes through. Most generation has no matrix and none of this
applies. When one is running, prompt discipline stops being a preference.

A matrix row isolates one variable. The prompt must isolate the same one: every
cell in the row is **byte-identical except one clause**. Any other drift is a
second uncontrolled variable and the row stops measuring anything.

Build base-plus-slot, never freehand per cell:

```
BASE (locked across the row)
  A woman in her late thirties at a kitchen counter, early morning,
  medium close-up from slightly above, subject in the left third,
  soft window light from camera right, editorial photography,
  deep navy and warm cream palette, 50mm, shallow depth of field

SLOT (isolated variable = HK_)
  C1A  ...her expression tired, shoulders dropped     HK_Problem
  C1B  ...her expression mid-laugh, shoulders open    HK_Benefit
  C1C  ...caught mid-turn toward camera, surprised    HK_Curiosity
```

Also lock, for the whole matrix: the model, the aspect ratio, and the seed where
the model exposes one. Switching model mid-matrix is the largest uncontrolled
variable available to you.

If a cell fails, regenerate **that cell only**. Re-running the row replaces
cells that already succeeded with different renders.

`metrix-ad-creative` does all of this from a brief. Use it rather than hand
assembling a matrix.
