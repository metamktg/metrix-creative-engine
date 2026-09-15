# Stage 2: The Render Bridge

A brief says what to make and why. A generation call says exactly how. Most
creative that misses expectations misses in the gap between the two, because
the translation happened in someone's head and nobody could see it.

Close that gap with an inspectable object: the **render spec**. Build it before
any credits are spent. It is the contract between the brief, the platform and
the model, and it is what the user approves.

## Inputs

- The brief object
- The Brand Translation Sheet and conflict resolutions from Stage 1
- The format module for this `asset_type`
- `references/model-routing.md`, `references/placement-specs.md`,
  `references/prompt-construction.md`

## The render spec

One per brief. Most briefs are a single asset, so `matrix_row`,
`isolated_variable` and `slots` stay null and the spec carries one prompt. Only
inside a running Matrix Sprint Test does it become a base with a slot per cell.

```json
{
  "brief_id": "",
  "mode": "matrix | general",
  "matrix_row": "C1",
  "isolated_variable": "HK_",

  "platform": {
    "placement": "Instagram Reels",
    "aspect_ratio": "9:16",
    "resolution": "2K",
    "duration_seconds": null,
    "safe_zone": "keep subject, product and logo space out of top 14% and bottom 20%",
    "viewing_assumption": "sound off, thumb scroll, first 1 to 2 seconds decide"
  },

  "model": {
    "id": "",
    "why": "",
    "locked_for": "matrix"
  },

  "references": [
    { "role": "product", "source_file": "bottle_front.png", "url": "", "instruction": "preserve exactly" }
  ],

  "prompt": {
    "base": "",
    "slot_position": "after subject and action",
    "slots": [
      { "cell": "C1A", "code": "HK_Problem", "text": "" }
    ],
    "avoid": { "method": "negative_prompt | positive_phrasing", "text": "" }
  },

  "parameters": {},

  "logo": "composite in post, upper right",
  "mst_names": { "C1A": "" },
  "credit_estimate": "",
  "expected_limits": [],
  "qa_checks": []
}
```

`parameters` holds the exact `input` object that will go to the model, with the
model's own field names. Anyone holding the spec can reproduce the asset.

## Building it

1. **Platform first.** Placement decides ratio, ratio decides which models are
   eligible, and the model decides the parameter names. Work in that order.
2. **Model.** Route by `asset_type` using the routing table. If product
   references are in play, only models that accept image inputs are eligible.
   Lock the model across a matrix if one is running; outside a test you are free
   to pick the best model per asset.
3. **Base prompt.** Build it from `visual_direction` and the Brand Translation
   Sheet, in the clause order from `prompt-construction.md`: subject and action,
   composition, environment, light, style, colour, technical. Nothing from
   `copy_architecture`.
4. **Slot.** Express the isolated variable as one clause, in the same position
   for every cell.
5. **Avoid list.** Use the model's `negative_prompt` field if it has one.
   Otherwise phrase it positively: "plain seamless backdrop", not "no clutter".
6. **Expected limits.** Write down what this model will likely get wrong for
   this asset: hands on product, small label text, object counts, legibility at
   thumbnail size. This is how expectations get set before the render, not
   explained away after it.
7. **QA checks.** One check per hard lock from Stage 1, each `qa_requirements`
   item from the brief, and the platform checks below.

## What "platform-optimised" means

It means three concrete things. It does not mean adding words like
"scroll-stopping", "viral" or "Instagram-style" to a prompt. Those render
nothing.

**1. Correct parameters.** Ratio, resolution and duration set as fields, from
`placement-specs.md`.

**2. Composition that survives the placement.**
- Feed: the subject reads at thumbnail size. Large subject, simple ground,
  clear value contrast.
- Stories and Reels: the subject sits in the middle band, clear of the UI.
  Prompt for a centred subject with headroom, because models cannot be told to
  respect safe zones.
- One asset for several placements: generate at the tallest ratio with a
  centred subject and crop down, or generate per ratio. Never mix ratios within
  a matrix row.

**3. The attention window.** Translate the platform's attention pattern into
visual instructions:
- "Thumb-stopping" becomes a concrete choice: a face or product large in frame,
  a strong value contrast, or motion in the first second.
- "Sound off" means the visual carries the idea alone. Captions and supers are
  added in post, not generated.
- "Hook in the first seconds" means the arresting moment is the opening frame,
  not a reveal.

## Aligning with the user's expectations

**Before generating,** restate the spec in two or three plain lines: what they
will get, at what ratio, from which model, what is locked, what varies, the
likely limits, and the credit estimate. Wait for a yes before any batch that
spends materially: a matrix row, a carousel set, any video.

**That yes is the only interruption.** Once it is given the run goes through to
completion without stopping again: generate, validate against the confidence
gate, revise if it must, polish, name, report. See `04-self-validation.md`.
Stopping half way leaves a part-rendered set that still cost credits, and in a
matrix it leaves something that is not a test at all.

**After generating,** judge each output against the spec, not against memory
of the prompt. Record PASS or FAIL per `qa_checks` item, with the reason.

## Iterating

- Change one clause at a time and log what changed. Rewriting the whole prompt
  teaches nothing about which change helped.
- In a matrix, re-render only the failed cell with the identical base and slot.
  Re-running a row replaces cells that already passed.
- Do not re-roll cells to taste. Selecting the best-looking render per cell
  selects on the outcome the test is supposed to measure.
- If a cell fails because the base is wrong, the whole row is wrong. Say so,
  fix the base, and re-render the row as a new version.

## Self-check before spending credits

- [ ] Ratio, resolution and duration are parameters, with this model's field names
- [ ] Model accepts image inputs if references are used
- [ ] Every cell's prompt is identical except the slot
- [ ] No copy from `copy_architecture` in the prompt, or the exception is stated
- [ ] Avoid list mapped to the right method for this model
- [ ] Logo approach and clear space stated
- [ ] MST name ready for every cell
- [ ] Credits checked and estimate stated
