---
name: metrix-ad-creative
description: Render Metrix IAP creative briefs into actual ad assets through Kie.ai. Use when turning creative_briefs.json, a strategic map, or an MST matrix plan into generated images or video ready for Meta Ads Manager, including matrix-mode variable isolation, MST naming, and pre-upload QA. Trigger on "generate the creative", "render this brief", "build the matrix assets", "make the ads from the brief", or when a brief exists and the next step is producing the asset.
---

# metrix-ad-creative

Bridges `metrix-brief-builder` (which produces briefs) and Kie.ai (which
produces pixels). The brief is the specification; this skill is the execution.

## How to actually run a generation

Two paths. **Check which you have before doing anything else.**

**1. The bundled script (default, no install).** Every skill ships
`scripts/kie.mjs`. It needs nothing but Node, which Claude Code already runs on,
and `KIE_AI_API_KEY` in the environment. Works on Windows, macOS and Linux.

```
node scripts/kie.mjs credits
node scripts/kie.mjs ledger                                # what ran, and what is still downloadable
node scripts/kie.mjs run "nano-banana-2" '{"prompt":"...","aspect_ratio":"4:5"}'
node scripts/kie.mjs run "veo-3-1" '{"prompt":"..."}' --timeout 900 --out ./out --name my-concept-id
node scripts/kie.mjs start "kling/v2-1-master-image-to-video" '{...}'   # prints taskId, returns at once
node scripts/kie.mjs poll <taskId> --timeout 900
```

It prints result URLs on stdout and progress on stderr, so `$(node scripts/kie.mjs run ...)`
captures just the URLs. `--out DIR` downloads them, and `--name ID` files each one
under a name you choose instead of whatever the CDN called it (an asset named for
its concept is the point; `--name` on its own writes to `./out`). Exit 2 means the wait timed
out and the task is still running: poll the same taskId, never re-create.

On Windows the path is `scripts\kie.mjs`. Use the skill's own directory, which
in an installed skill is under `.claude/skills/<skill>/`.

**2. MCP tools, if `/mcp` lists `kie-ai`.** `kie_run_task`, `kie_create_task`,
`kie_get_task`, `kie_wait_for_task`, `kie_get_credits`, `kie_download_result`.
Same API, typed arguments. Prefer these when present; they are not required.

Never tell the user to install anything before generating. If the key is
missing the script says so and names where to get one.

## Prerequisite

A brief must exist. If one does not, run `metrix-brief-builder` first. Do not
invent a brief in order to have something to render.

## The rule that governs everything here

**Render what the brief specifies, in the medium it declares, and name it for
what it is.**

That is the whole default. Most creative is not a test. It is an asset built
from a brief to run, and the job is fidelity to that brief: the format it
declares, the visual direction it sets, the product it names, the brand it
belongs to.

**Name assets descriptively.** The filename is what a strategist reads in a
folder six weeks later, so it carries the creative concept, not a coordinate:

```
bottle-hero-concrete-ledge-4x5
busy-parents-morning-kitchen-9x16
```

A grid position means nothing outside a running test, and reading one back tells
you nothing about what the creative was.

## When a Matrix Sprint Test is running

A Matrix Sprint Test is an **optional** sprint you run deliberately to validate a
hypothesis. It is not a stage of the loop and most accounts will not have one in
flight. `prompts/05-mst.md` covers when to run one and how to build it.

If, and only if, the brief carries `brief_metadata.mode: "matrix"` with a live
matrix, one extra discipline applies on top of everything above:

**The test isolates one variable, so the prompt must isolate the same one.** If
the row tests hook (`HK_`), then across every cell the prompt is byte-identical
except the clause expressing the hook. A different lighting word, a reordered
sentence, a re-roll on another seed: each is a second uncontrolled variable, and
the result stops attributing to anything.

Build such prompts as **base plus one slot**:

```
BASE (locked, identical across the row)
  subject, composition, style guide, colour palette, lighting, camera,
  format, avoid list
SLOT (the isolated variable, the only thing that changes)
  the clause carrying HK_ / FW_ / TN_ / ST_ / AW_ / HP_ / PR_ / CTA_
```

If the isolated variable cannot be expressed as a single substitutable clause,
say so and stop. That is a brief problem, not a prompting problem.

Inside a live MST, and only there, assets also carry the MST naming convention,
because `metrix-mst-creative-scan` parses it to attribute results. Everywhere
else, descriptive names.

## Render the hook and the CTA into the image

A Meta ad creative carries its hook in the pixels. That is what stops the
scroll, and an asset without one is a product photo that happens to be running
as an ad.

**Render from `copy_architecture`:**

| Field | In the frame? |
| --- | --- |
| `hook` | **Yes**, quoted verbatim. This is the creative |
| `cta` | **Yes**, quoted verbatim, rendered as specified |
| `headline` | Yes, where the brief places it in frame |
| `primary_text` | No. Ads Manager field |
| `description` | No. Ads Manager field |

Primary Text and Description stay out because they are genuinely testable
without a re-render. The hook is not: it is composed into the image and it
carries the concept.

Two consequences:

1. **The model must be able to set type.** Route through
   `references/model-routing.md`. Sending a text-bearing creative to a model
   chosen only for its aspect ratio produces garbled words in every cell.
2. **Check every character** in the output against the brief. One wrong letter
   makes the asset unusable.

*Until 2026-09-16 this section said the opposite, and step 4 below told you to
build the prompt "never from `copy_architecture`". Between them they deleted the
hook and the CTA from every asset the engine produced.*

## Lock the subject as a file, not as a sentence

Where one product, person or scene appears in every asset of a set, render it
ONCE, approve it, and pass that file into every subsequent render as a reference
input.

Kie's image models mostly expose no seed. An identical prompt returns a
different picture each time, so a "locked base prompt" locks the words and lets
the subject drift. In a matrix that makes the product a bigger variable than the
one under test, and the result cannot be attributed to anything.

One extra render. It is the difference between a sprint you can read and one you
cannot.

## Process

1. **Read the brief.** Take `creative_briefs.json`, or a single brief object.
   Identify per brief: `brief_metadata.asset_type`, `brief_metadata.mode`
   (`matrix` or `general`), `testing_framework.matrix_position`,
   `testing_framework.isolated_variable`, `creative_specifications`,
   `visual_direction`, and `brand_assets` where present (product references,
   logo method, style references). A product-led brief listing product
   references under `brand_assets.missing` is blocked until they are supplied.

2. **Check credits before a batch.** `node scripts/kie.mjs credits`, or the
   `kie_get_credits` tool where MCP is connected. A matrix row is
   several generations and a full matrix is many; running out halfway leaves a
   partial row, which is an unusable test. Report the balance and stop if it
   will not cover the run.

3. **Upload the brand kit's references, if the brief carries any.** Product
   photos, logos and style references in `brand_assets` are local files; every
   reference-capable model takes a URL. Run `node scripts/kie.mjs upload <file>`
   per file and pass the URLs into the model's image-input field, whose name
   varies per model. See "Brand kit to generation" in
   `references/format-routing.md`.

   Do this immediately before generating, not at the start of a batch: the URLs
   expire in about a day, so the last cells of a long matrix would fail on dead
   links.

   Skipping this is the failure that looks like success. The model invents a
   generic product of the right category with the wrong label and no branding,
   the render looks finished, and it passes a casual review while being unusable
   for anything performance-led.

4. **Build the prompt** from `visual_direction` (composition, style guide,
   colour palette, typography, imagery) plus the subject, **and the on-image
   text from `copy_architecture`**: the hook and the CTA quoted verbatim, set
   with the brief's typography. Read `references/prompt-construction.md` for the
   clause order and the field-to-clause table. Use the order; do not let the
   table flatten your art direction into a list.

5. **Apply the avoid list.** `visual_direction.avoid_list` becomes negative
   phrasing in the prompt, or a `negative_prompt` field where the model has one.
   Check `references/model-routing.md` for whether the chosen model supports one; if
   it does not, phrase the avoidance positively (say what to show, not what to
   omit) because most image models handle negations poorly.

6. **Map specs to parameters.** `creative_specifications.dimensions` and
   `.placement` decide aspect ratio; `.duration` decides video length. The
   mapping table is in `references/placement-specs.md`. Never guess an aspect
   ratio from the prompt text.

7. **Pick the model from what the brief's `asset_type` allows.** The format is
   declared by the brief, not chosen here: route through
   `references/format-routing.md`, pick within the eligible set, and state why.
   An `asset_type` with no route is a stop, never a fallback to the nearest one.
   Lock the model for the whole matrix — switching mid-matrix is the largest
   uncontrolled variable available.

8. **Generate.** One `node scripts/kie.mjs run ...` per cell, or `kie_run_task` where MCP is connected. For a row, hold the base constant
   and vary only the slot. If a cell fails, re-run **that cell only**; do not
   regenerate the row, because a re-roll changes the cells that already
   succeeded.

9. **Name every output for what it is.** Default to a descriptive name built
   from the creative concept, so the file is readable on its own:
   `bottle-hero-concrete-ledge-4x5`. Pass it with `--name`.

   Only inside a live Matrix Sprint Test, use the MST convention instead,
   exactly as `testing_framework.matrix_naming_convention` states
   (`{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}`), because
   `metrix-mst-creative-scan` parses that form to attribute results and an asset
   it cannot parse cannot be attributed.

10. **QA before handing over.** Walk `qa_requirements` and the avoid list against
   what was actually generated — look at the image, do not assume the prompt was
   obeyed. If an MST is running, then hand to `metrix-mst-creative-scan` for the
   matrix-level check and flag any cell where the model ignored a locked
   element, since that cell is not usable as a test. Outside an MST there is no
   matrix to scan and this step is judging the asset against the brief.

11. **Run the confidence gate, then finish.** After the last render, and without
    stopping to ask: check the asset expresses what the brief specified. Inside
    a running MST, also check each cell against its siblings. Revise a failure
    (bounded, at most two cycles), polish only what passed, and name it via
    `--name`. The full rules are `prompts/04-self-validation.md`.

12. **Report** as the output contract below.

## Output contract

Per brief rendered:

- `brief_id`, and the creative concept the asset expresses
- the model used and the exact prompt
- result URL and the local path under its descriptive name
- QA verdict per `qa_requirements` item: PASS / FAIL with the reason
- whether the asset expresses what the brief specified, with revisions used
- anything the model failed to obey

Inside a running MST, additionally: the matrix position, the base prompt once
per row rather than per cell, the slot text per cell so the isolation is
auditable, and the comparative verdict per cell.

Per run: credits before and after, and any cell that needs regenerating.

State plainly when something did not work. A cell that silently drifted is worse
than a cell that failed, because it still looks like a valid test.

## A note on the two modes

Default work is not a test. Variation between assets is allowed and useful,
because you are building creative from a brief rather than measuring one
variable against another.

The isolation discipline exists only to protect a running Matrix Sprint Test,
and applying it where no test exists costs you range for nothing.

## What this skill will not do

- Invent a brief, an ICP, a pillar or a variable stack. Those come from
  `metrix-strategy-map` and `metrix-brief-builder`.
- Write ad copy. That is `copywriting-meta-ads`.
- Claim a generation succeeded without reading back the result state. A
  `taskId` is not an asset.

## References

- `references/prompt-construction.md` — brief field to prompt clause, and the
  clause order.
- `references/placement-specs.md` — Meta placement to aspect ratio and duration.
- `references/format-routing.md` — the brief's `asset_type` to eligible models
  and required parameters. The handoff contract; an unmapped type stops.
- `references/model-routing.md` — which model per asset type, the parameters
  that matter, and the 4:5 problem.
