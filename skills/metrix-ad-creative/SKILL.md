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
node scripts/kie.mjs run "google/nano-banana" '{"prompt":"...","aspect_ratio":"4:5"}'
node scripts/kie.mjs run "veo-3-1" '{"prompt":"..."}' --timeout 900 --out ./out
node scripts/kie.mjs start "kling/v2-1-master-image-to-video" '{...}'   # prints taskId, returns at once
node scripts/kie.mjs poll <taskId> --timeout 900
```

It prints result URLs on stdout and progress on stderr, so `$(node scripts/kie.mjs run ...)`
captures just the URLs. `--out DIR` downloads them. Exit 2 means the wait timed
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

**A Matrix Sprint Test isolates one variable. The prompt must isolate the same
one.**

If a matrix row tests hook (`HK_`), then across every cell in that row the
generation prompt must be byte-identical except for the clause expressing the
hook. Any other drift — a different lighting word, a reordered sentence, a
re-roll on a different seed — is a second uncontrolled variable, and the test no
longer attributes its result to anything.

So build prompts as **base + one slot**, never as freehand text per cell:

```
BASE (locked, identical across the row)
  subject, composition, style guide, colour palette, lighting, camera,
  format, avoid list
SLOT (the isolated variable, the only thing that changes)
  the clause carrying HK_ / FW_ / TN_ / ST_ / AW_ / HP_ / PR_ / CTA_
```

Write the base once. Substitute the slot per cell. If you cannot express the
isolated variable as a single substitutable clause, say so and stop — that is a
brief problem, not a prompting problem.

## Do not render ad copy into the image

Primary Text, Headline and Description are **Ads Manager fields**, not pixels.
Baking them into the creative breaks the method in two ways:

1. Copy can no longer be tested independently of visual. A hook baked into the
   image means every copy test is also a creative re-render.
2. `copywriting-meta-ads` outputs those fields as paste-ready plain text. An
   image carrying its own headline contradicts them the moment either changes.

**The exception**, and it is narrow: a format whose whole premise is on-image
text (a text-overlay static, a meme format, a UGC caption bar). Then the
on-image text IS the isolated variable for that row, and every other variable is
locked. Say explicitly in the output that you took the exception and why.

## Process

1. **Read the brief.** Take `creative_briefs.json`, or a single brief object.
   Identify per brief: `brief_metadata.asset_type`, `brief_metadata.mode`
   (`matrix` or `general`), `testing_framework.matrix_position`,
   `testing_framework.isolated_variable`, `creative_specifications`, and
   `visual_direction`.

2. **Check credits before a batch.** Call `kie_get_credits`. A matrix row is
   several generations and a full matrix is many; running out halfway leaves a
   partial row, which is an unusable test. Report the balance and stop if it
   will not cover the run.

3. **Build the base prompt** from `visual_direction` only — composition, style
   guide, colour palette, typography, imagery — plus the subject. Never from
   `copy_architecture`. Read `references/prompt-construction.md` for the clause
   order that works and the translation table from brief field to prompt clause.

4. **Apply the avoid list.** `visual_direction.avoid_list` becomes negative
   phrasing in the prompt, or a `negative_prompt` field where the model has one.
   Check `references/model-routing.md` for whether the chosen model supports one; if
   it does not, phrase the avoidance positively (say what to show, not what to
   omit) because most image models handle negations poorly.

5. **Map specs to parameters.** `creative_specifications.dimensions` and
   `.placement` decide aspect ratio; `.duration` decides video length. The
   mapping table is in `references/placement-specs.md`. Never guess an aspect
   ratio from the prompt text.

6. **Pick the model from what the brief's `asset_type` allows.** The format is
   declared by the brief, not chosen here: route through
   `references/format-routing.md`, pick within the eligible set, and state why.
   An `asset_type` with no route is a stop, never a fallback to the nearest one.
   Lock the model for the whole matrix — switching mid-matrix is the largest
   uncontrolled variable available.

7. **Generate.** One `kie_run_task` per cell. For a row, hold the base constant
   and vary only the slot. If a cell fails, re-run **that cell only**; do not
   regenerate the row, because a re-roll changes the cells that already
   succeeded.

8. **Name every output with the MST convention**, exactly as
   `testing_framework.matrix_naming_convention` states:

   `{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}`

   for example `C1A_CN_ICP_BusyParents_CN_Design_UGC_FW_PAS_HK_Problem_ST_TOFU_001`.
   Pass it as `filename` to `kie_download_result`. This is what lets
   `metrix-mst-creative-scan` validate the set before launch — an asset with a
   wrong name is an asset that cannot be scanned, and therefore cannot be
   attributed.

9. **QA before handing over.** Walk `qa_requirements` and the avoid list against
   what was actually generated — look at the image, do not assume the prompt was
   obeyed. Then hand to `metrix-mst-creative-scan` for the matrix-level check
   (row/column/diagonal consistency). Flag any cell where the model ignored a
   locked element; that cell is not usable as a test.

10. **Report** as the output contract below.

## Output contract

Per brief rendered:

- `brief_id` and `matrix_position`
- the model used, and the **exact base prompt** (once per row, not per cell)
- the slot text per cell, so the isolation is auditable
- result URL and the local path under its MST name
- QA verdict per `qa_requirements` item: PASS / FAIL with the reason
- anything the model failed to obey

Per run: credits before and after, and any cell that needs regenerating.

State plainly when something did not work. A cell that silently drifted is worse
than a cell that failed, because it still looks like a valid test.

## General mode

Outside `matrix` mode the isolation rule relaxes: you are scaling a proven
pattern, not testing one. Keep the brief's visual direction and avoid list, and
keep the naming convention, but prompt variation between assets is allowed and
useful. Say in the report that you were in general mode, so nobody reads the
variation as a broken test.

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
