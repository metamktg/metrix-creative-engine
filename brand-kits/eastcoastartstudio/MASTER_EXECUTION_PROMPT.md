# Master execution prompt: ECAS MST Sprint 1, 16 creatives

Paste the block below into a Claude Code session that has the `metrix-ad-creative`
skill installed and `KIE_AI_API_KEY` set. Attach or name the three inputs:
`creative_briefs.json`, `brand-kit.json`, and the brand kit PDF.

---

```
Generate all 16 EastCoastArtStudio MST Sprint 1 creatives from the attached
briefs, using the attached brand kit as the source of truth for the brand.

## Read these first, in this order

1. brand-kit.json. Section `conflicts_to_resolve` overrides the briefs on two
   points, and section `client_account_rules` overrides everything.
2. creative_briefs.json, all 16.
3. prompts/formats/static.md and prompts/04-self-validation.md from the engine.

## Three corrections to apply to every brief before rendering

These are established, not suggestions. Applying the briefs verbatim produces
16 assets that are wrong in the same way.

1. THE PRODUCT IS NOT A MAP. The briefs and the client library say "street/city
   map prints". The live catalogue is 1 map in 250: the product is a painted city
   scene with a REAL, LEGIBLE STREET NAMEPLATE inside the artwork. Render that.
   A map is a failed asset even if it is beautiful.

2. DO NOT RENDER "3,000+ CITIES". It appears in copy_architecture.product_solution
   and in PR_DataStat. The brand's own site claims 200+ and 149 were counted.
   Use "Made to order, real wood frame, real matte paper" and drop the count.

3. asset_type reads "static_4x5" and mode reads "MST_matrix_cell". The engine
   now normalizes both automatically (`static` at 4:5, `matrix`) and says so in
   the verdict's warnings. Nothing for you to do. Do not treat any OTHER
   unmapped value as safe to substitute.

## Hard account rules, from the client

- Offer: 25% off appears on a Row D final line only, in small type. NEVER in a
  hook or a headline, any row. A documented $40.54 per add-to-cart resulted when
  this was broken. This is the most expensive rule in the account.
- CTA: "SHOP NOW" on a solid black button.
- Emoji: none, any row.
- Banned phrase, account-wide: "Read why".
- Social proof: there is none. Ship [VERIFIED COUNT] as a placeholder where a
  count would go, marked NEEDS-VALIDATION. Never invent a number, a rating or a
  testimonial.

## Before spending a credit

1. Run kie_validate_brief on all 16. Fix what it blocks. It is free.
2. Check the credit balance and confirm it covers 16 renders plus a revision
   budget of roughly 30%.
3. Upload the brand assets from brand_assets and use the returned URLs. Without a
   product reference the model invents a generic poster. This is the single most
   common cause of a wasted batch.
4. PROVE THE MATRIX ISOLATES SOMETHING. Take any two cells in the same row and
   diff their briefs. Exactly one variable may differ. If more differs, or
   nothing does, STOP AND REPORT: the row measures nothing and the sprint cannot
   attribute a result. Do not render a matrix that cannot be read.

## The creative is the job

The briefs came from IAP and passed its QA. Do not re-adjudicate them. Spend
your attention on designing the best Meta ad creative each brief can produce,
then check the render against the brief. That check is the five rows in
`04-self-validation.md`: format type, overlay text, CTA, aspect ratio, Meta ad
creative passed.

**Render the hook and the CTA into the frame.** Take them from
`copy_architecture`, quote them verbatim in the prompt, and set them with the
brief's typography. For this account the CTA is "SHOP NOW" on a solid black
button. An asset with no hook in the pixels is a product photo, and until
2026-09-16 this engine was configured to produce exactly that.

Read every character of rendered text in the output before accepting an asset.

## Rendering

Work cell by cell, C1A through C4D. For each:

- Route through kie_render_static on **`nano-banana-2`**: it is the only model
  in the routing table that holds 4:5 AND sets legible type AND takes the 14
  references and 20k prompt this brief needs. Set `aspect_ratio` explicitly to
  `4:5`; its default is `auto`.
- Lock across the whole matrix: model, 4:5, resolution, and seed where exposed.
  **One model for the entire sprint, never two running at once.** Switching
  model mid-matrix is the largest uncontrolled variable available to you, and it
  invalidates the sprint. State the model id in the render spec before spend and
  beside every asset in the report.
- Scene comes from the brief's design system:
  CN_Design_SinglePrintLifestyle -> scene A, print flat on white, oak frame.
  CN_Design_RoomContext          -> scene D, framed on a panelled wall, rattan chair.
  CN_Design_CityDetail           -> scene B, black frame floor lean, plant right.
  CN_Design_MultiPrintGallery    -> several framed prints as a wall arrangement.
- The nameplate must be legible and correctly spelled. Read it in the output
  before accepting the asset. A misspelled street is unusable.
- Achromatic room, saturated print. Warm neutrals only.
- Name each file for its concept and its isolated variable, never for its
  coordinate alone. The naming convention in the briefs contains a literal
  ellipsis: replace it, do not render it.

## After each render, the final pass

Shown the asset alone, without the brief: would a strategist recognise the
concept the brief describes, and is the isolated variable visible? If the render
is merely competent and generic, revise it. A generic asset is the most expensive
kind because it looks finished and tests nothing.

Then, placed beside its siblings in the row: is the difference visible, and
attributable to the variable rather than to noise? If not, say so on that cell.

## Report

One table: cell, model, credits, pass or revised, and the one-line reason.
Then: total credits spent, any cell you could not make pass, and any brief whose
isolation you could not prove. Do not round a failure up to a pass.
```

---

## Why this prompt is shaped this way

Three of the four blocking problems in this package are invisible to a renderer
reading a brief in isolation, and each one produces 16 identically wrong assets:
the product is misdescribed, the proof claim overclaims against the brand's own
site, and the vocabulary does not route. A per-cell prompt cannot catch any of
them, so they are hoisted to the top and stated as corrections rather than
context.

The isolation check is a hard stop rather than a warning because it is the only
one that cannot be fixed after the spend. A wrong product can be re-rendered. A
row where two cells differ by three variables produces numbers that look like a
result and mean nothing, and the sprint is only discovered to be void after the
budget is gone.
