# Prompt construction

How a brief becomes a generation prompt, and in what order the clauses go.

## Clause order

Image models weight the front of the prompt most heavily. Put the thing that
must not be wrong first.

```
1. Subject and action        what is in frame, doing what
2. Composition               shot type, angle, crop, where the subject sits
3. Environment               setting, background, props
4. Light                     quality, direction, time of day
5. Style                     medium, era, film stock, render style
6. Colour                    palette, grade
7. Technical                 lens, depth of field, resolution cues
8. Negative                  what to exclude (or the negative_prompt field)
```

The isolated variable's slot goes wherever it naturally belongs in that order,
but **in the same position for every cell in the row**. Moving the slot between
cells changes the weighting and is itself a variable.

## Brief field to prompt clause

| Brief field | Becomes | Note |
| --- | --- | --- |
| `visual_direction.imagery` | Subject and action (1) | The main content of the frame |
| `visual_direction.composition` | Composition (2) | Translate to shot language: "medium close-up, subject left third" |
| `visual_direction.style_guide` | Style (5) | Name a medium, not an adjective. "Editorial photography" beats "premium" |
| `visual_direction.color_palette` | Colour (6) | Name colours, not brand words. "Deep navy and warm cream" beats "on-brand" |
| `visual_direction.typography` | usually **nothing** | Typography applies to on-image text. If you are not rendering text, drop it. See the copy rule in SKILL.md |
| `visual_direction.avoid_list` | Negative (8) | See below |
| `creative_specifications.format` | model choice | static vs video vs carousel frame |
| `creative_specifications.dimensions` / `.placement` | aspect ratio parameter | Never a prompt clause. See `placement-specs.md` |
| `creative_specifications.duration` | duration parameter | Video only |
| `strategic_foundation.target_icp` | Subject, when the subject is a person | Describe observable traits only |
| `copy_architecture.*` | **nothing** | Ads Manager fields, not pixels |

## Two things that go wrong

**Brand adjectives do not render.** "Premium", "trustworthy", "aspirational",
"on-brand" produce nothing repeatable — the model has no shared referent for
them. Translate to something a camera could capture: "premium" becomes the
lighting, the surface, the styling. If the brief only gives you the adjective,
translate it once, write the translation down in the report, and reuse that
exact translation everywhere it recurs, and across a whole matrix if one is
running.

**Negations are unreliable.** "No text, no watermark, no people" often produces
text, watermarks and people, because many models have no true negation. Prefer
the `negative_prompt` field where the model has one — check
`model-routing.md`. Where it does not, state the positive: instead of "no
background clutter", write "plain seamless backdrop".

## Describing people

When the subject is an ICP, describe only what is observable and relevant to the
creative: apparent age range, clothing, setting, activity, expression. That is
what a casting brief contains.

Do not prompt for a specific real person, a lookalike of one, or a named public
figure. Beyond the legal exposure, Kie's upstream models refuse or silently
distort these, which corrupts a matrix cell in a way that is easy to miss.

## Locking a row, when a Matrix Sprint Test is running

Only applies inside a live test. Most briefs produce one asset and need none of
this.

Write the base once, keep it verbatim, substitute only the slot:

```
BASE:
  A woman in her late thirties at a kitchen counter, early morning,
  medium close-up from slightly above, subject in the left third,
  soft window light from camera right, editorial photography,
  deep navy and warm cream palette, 50mm, shallow depth of field

SLOT (isolated variable = HK_, the hook expressed visually):
  C1A  ...her expression tired, shoulders dropped        HK_Problem
  C1B  ...her expression mid-laugh, shoulders open       HK_Benefit
  C1C  ...caught mid-turn toward the camera, surprised   HK_Curiosity
```

Every word outside the slot is identical. That is what makes the row a test.

## Seeds

Where the model exposes a seed, fix it across the row: it removes sampling noise
as a confound. Where it does not, generate the row in one sitting and accept
that sampling variance exists — do not re-roll individual cells to taste, which
would select on the outcome you are supposed to be measuring.
