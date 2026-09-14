# Stage 1: Brand Intake

Brand consistency does not come from telling a model to be "on brand". It comes
from turning the brand into specific inputs once, writing them down, and
reusing them word for word. This stage produces those inputs.

## Inputs

- The brief: `{{brief_json}}`
- The client library: `{{client_library_json}}`
- Brand kit files: `{{brand_kit_files}}` (guidelines, logo, product photography)
- Website context: `{{website_url_or_capture}}`

Any of the last three may be missing. Missing is not fatal; unacknowledged is.

## Step 1: Inventory

List every asset you were given. For each one record:

| Asset | Type | Source | Used as | Status |
| --- | --- | --- | --- | --- |
| `bottle_front.png` | Product photo | Brand kit | Reference input | Present |
| `logo.svg` | Logo | Brand kit | Composite in post | Present |
| Brand guidelines PDF | Guidelines | Brand kit | Constraints | Present, colour pages only |
| Lifestyle photography | Style reference | None | n/a | Missing |

"Used as" is one of: **reference input** (goes into the model), **constraint**
(shapes the prompt or QA), **context** (informs judgment only), **composite in
post** (added after generation).

## Step 2: Separate hard locks from soft direction

**Hard locks.** Wrong means the asset cannot ship.
- Product appearance: shape, packaging, label, colourway
- Logo
- Exact brand colours
- Mandatory claims, disclaimers, prohibited imagery
- Anything on the brief's avoid list

**Soft direction.** Wrong means the asset is weaker.
- Mood, tone, photographic style, pacing
- Brand adjectives

Hard locks get verified in QA, item by item. Soft direction gets translated in
Step 3.

## Step 3: Build the Brand Translation Sheet

This is the artifact that makes consistency repeatable. Write it once per client
per campaign and reuse it verbatim across every asset and every matrix cell.

```json
{
  "client_id": "",
  "design_system_code": "DS_...",
  "colours": [
    { "hex": "#0B1F3A", "prompt_words": "deep navy", "role": "dominant" }
  ],
  "adjective_translations": [
    { "brand_word": "premium", "renders_as": "soft directional light, matte stone surface, generous negative space, single hero object" }
  ],
  "photographic_style": "editorial photography, 50mm, shallow depth of field, natural window light",
  "from_winning_patterns": [
    { "pattern": "", "evidence": "", "renders_as": "" }
  ],
  "from_failed_patterns": [
    { "pattern": "", "avoid_as": "" }
  ],
  "typography": "only if on-image text is in scope; otherwise omit",
  "open_questions": []
}
```

How to fill it:

- **Colours.** Keep the hex for QA. Give the model named colour words, because
  models follow "deep navy" far more reliably than a hex code.
- **Adjectives.** "Premium", "trustworthy", "clean" render nothing repeatable.
  Translate each into something a camera could capture: light, surface,
  styling, framing. Record the translation so every asset uses the same one.
- **Winning patterns.** Pull from the client library. Translate each into visual
  terms and carry the evidence grade so the handoff can label it.
- **Failed patterns.** These become avoid-list entries.
- **Design system codes.** If the brief names one, the matching entry in
  `design_systems` overrides generic brand-kit guidance.

## Step 4: Product imagery

Decide the product path before writing any prompt.

**Product photography exists.** Use it as a reference input.
- Choose the model from the routing table for one that accepts image inputs.
  The field name and the maximum image count vary by model; check them.
- Pick the fewest references that fully describe the product: usually a clean
  front view, one angle, and a label detail if the label matters.
- Tell the model what to preserve and what to change: "Keep the product exactly
  as in the reference images: shape, label, colour, proportions. Place it in the
  scene described below."
- Local files need a public URL first. Use the upload flow in the routing
  reference, and upload close to generation time because upload URLs expire.
- In a matrix, the reference set belongs to the locked base: the same images in
  the same order for every cell in the row.

**No product photography.**
- For a product-led format, this is a blocker. Ask for photography and say what
  angles you need.
- For a scene where the product is secondary, you may generate the scene with a
  clear product area to composite a real pack shot into later. Say that you did.
- Never generate a lookalike of the client's product and present it as theirs.

## Step 5: Logo

Default: **do not have the model draw the logo.** Generation models redraw logos
with small, confident errors in letterforms and proportions.

- Generate the creative without the logo.
- Reserve clear space in the composition and state where, for example "upper
  right, clear of the Stories top band".
- Composite the real logo file in post.

If the user wants the logo rendered in-model, pass it as a reference, verify it
letter by letter against the source file, and flag it in the handoff as a higher
fidelity risk.

## Step 6: Website context

Use the website for facts and visual reference, not for strategy.

- Extract only what you can observe: product names, variants, offers and claims
  as they appear, and the style of the site's own photography.
- Record the date you captured it. Sites change.
- A claim that is on the website but not in the brief is not approved for the
  creative. Flag it as a possible addition rather than using it.
- The website never overrides the brief or the client library.

## Step 7: Conflicts and gaps

List each one with its resolution:

| Issue | Sources | Resolution |
| --- | --- | --- |
| Guidelines say warm tones; `DS_02` specifies cool grey | Brand kit vs client library | Client library wins (rank 3 over 4) |
| No lifestyle references | n/a | Production choice from `photographic_style`; labelled in handoff |
| Brief asks for 4:5 video | Brief vs platform | Blocker: no video model offers 4:5. Proposing 9:16 with a centred crop |

Anything marked blocker stops generation until the user answers.

## Output of this stage

1. The inventory table
2. The Brand Translation Sheet
3. The conflicts table, with blockers on top
4. The product path and logo approach, in one line each

These feed directly into the render spec in `02-render-bridge.md`.
