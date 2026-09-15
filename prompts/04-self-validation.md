# Stage 4: Self-Validation and Finish

## Premise

Generation ends when a file lands. That is not the same as the asset being fit
to test. This stage runs after the last render, without stopping to ask, and
decides one thing: **can the isolated variable be identified from the asset?**

If it cannot, the cell measures nothing, however good the image looks. A
beautiful render that fails identity is worse than an ugly one that passes,
because it ships, spends budget and returns a result nobody can attribute.

## Uninterrupted

Approval happens once, at the render spec, before any credits are spent. After
that the run goes to completion: generate, validate, revise if it must, polish,
name, report. Do not pause mid-run for confirmation.

The exceptions are the ones that are not judgment calls: credits exhausted, a
blocked brief (product references listed under `brand_assets.missing`), or the
revision budget spent. Those stop and report.

## The confidence gate

The bar comes from `brief_metadata.confidence`.

**Always: does the asset express what the brief specified?** Shown the asset
alone, without the prompt, would a strategist recognise the creative concept the
brief describes? The declared format, the visual direction, the product, the
angle. If the render is merely competent and generic, it has not expressed the
brief, and a generic asset is the most expensive kind because it looks finished.

**Only inside a running Matrix Sprint Test, additionally: comparative
identity.** Most work has no matrix, and this test does not apply to it.
Placed beside its sibling cells in the row, is the difference visible, and is it
attributable to the variable rather than to noise?

If `C1A` (`HK_Problem`) and `C1B` (`HK_Benefit`) are hard to tell apart, the row
is dead regardless of how strong each cell is on its own. A test of a variable
that produced no visible variance is not a test.

Score PASS or FAIL against each test that applies, with the reason in one line.
Do not average them into a number that hides which one failed.

## Revising a failure

Revision is bounded: **at most two cycles per cell.** After that, stop and
report the cell as unresolved with what you tried. An unbounded revise loop
spends real credits chasing a brief that may itself be the problem.

Outside an MST, revision is straightforward: change the clause that failed and
re-render. Inside one, which part failed decides what may change, and this is
where a row is easiest to break:

**The slot failed** (the variable is not expressed, everything else is right).
Rewrite the slot clause only, keep the base byte-identical, re-render that cell
alone. The row stays valid because every other cell is untouched.

**The base failed** (the whole row has a problem: contrast too low, subject too
small, product wrong). The base is shared, so fixing it for one cell makes that
cell incomparable with the rest. **The entire row must be re-rendered as a new
version.** Say so in the report, give the credit cost, and re-render the row
rather than silently patching one cell.

**Never re-roll the same prompt hoping for a better draw.** Selecting the
best-looking render per cell selects on the outcome the test is supposed to
measure, and quietly destroys the comparison.

## Polish

Only after the gate passes. Polish is the last step on an approved asset.

```
node scripts/kie.mjs run "topaz/image-upscale" '{"image_url":"<url>","upscale_factor":"2"}'
node scripts/kie.mjs run "topaz/video-upscale" '{"video_url":"<url>","upscale_factor":"2"}'
```

`upscale_factor` is a **string**, not a number.

Upscaling sharpens what is there. It does not fix composition, hands, object
counts or garbled text. If one of those is wrong, that is a revision, not a
polish, and it goes back to the gate.

Skip polish when the asset is already at or above the delivery resolution.
Paying to upscale a 4K render wastes credits and changes nothing.

## Naming

The filename is how the asset is identified downstream, so it is not free-form.

**Default: a descriptive name** built from the creative concept, so the file is
readable on its own six weeks later: `bottle-hero-concrete-ledge-4x5`. A
coordinate is meaningless outside a live test and tells a reader nothing about
what the creative was.

**Inside a running MST: the convention**, exactly as
`testing_framework.matrix_naming_convention` states:

`{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}`

This already contains the creative concept codes. Do not shorten it to the bare
concept id: `metrix-mst-creative-scan` parses the full convention, and an asset
it cannot parse cannot be scanned, which means it cannot be attributed.

Set it at download either way:

```
node scripts/kie.mjs run <model> --input-file spec.json --out ./out \
  --name "C1A_CN_ICP_BusyParents_CN_Design_UGC_FW_PAS_HK_Problem_ST_TOFU_001"
```

A re-rendered version gets a new `UniqueID`, never the same name as the render
it replaced. Overwriting loses the evidence of what changed.

## Report

Per cell: PASS or FAIL on absolute identity, PASS or FAIL on comparative
identity, revisions used, whether polished, the final filename, and the credits
spent.

Inside an MST, per row: whether the row is valid as a test. A row with one
unresolved cell is not valid, and saying so is the whole point of this stage.

## Common failure

Declaring a run finished because every file downloaded. Files landing is the
plumbing working. This stage exists because the plumbing working and the test
being valid are different claims, and only one of them is worth spending a
media budget on.
