# SOP: brand kit to visual handoff

Four artifacts per account, in this order. Each one is the input to the next.

```
  audit-brand.mjs  ->  brand-kit.json  ->  PROMPTS.md  ->  <Brand>-Brand-Kit.pdf
   (automated)        (human confirms)   (human writes)   (render-kit.mjs verifies)
```

| # | Artifact | Who | Gate before moving on |
| --- | --- | --- | --- |
| 1 | `brand-kit.draft.json` | script | Reached the site, named the platform |
| 2 | `brand-kit.json` | person | Every field VERIFIED, INFERRED or ABSENT |
| 3 | `PROMPTS.md` | person | The one non-negotiable product rule is written |
| 4 | `<Brand>-Brand-Kit.pdf` | both | `render-kit.mjs` exits 0 |

## Step 1. Audit

```bash
node skills/brand-kit-builder/scripts/audit-brand.mjs https://client.com --out drafts/client
```

Fingerprints the platform, pulls the catalogue, finds and measures the logos,
censuses the palette and type, discovers the repeated claims, detects the review
platform. See `SKILL.md` for what each step is doing and why.

Expect 429s. A rate limit is not an absent endpoint.

## Step 2. Confirm the kit

The draft is evidence, not a kit. Work its `human_required` list and write
`brand-kits/<account>/brand-kit.json`. Every field carries VERIFIED, INFERRED or
ABSENT. `brand_assets` plugs into the brief contract `kie_validate_brief` checks.

Two things only a person can do here, and they are the two that decide whether the
renders are any good:

**Read the mockup grammar off the actual photographs.** Download several products'
full image sets, md5 them, and note which files repeat: those are the brand's own
size guides and material shots, to be composited rather than generated. Then write
each repeating scene as a recipe: surface, frame, props, light direction, camera
height, palette.

**Name the one non-negotiable.** The single thing that makes an asset this brand's
rather than a good generic one. For an art-print seller it was a legible street
nameplate painted inside the print. Every brand has one. If you cannot name it,
you have not looked hard enough yet, and the renders will come back plausible and
wrong.

## Step 3. Write the prompts

`brand-kits/<account>/PROMPTS.md`, one per media format, each self-contained.
Start from `docs/RUNBOOK.md` and make every line specific to this brand: which
scene, which model constraint, which claim, which words.

State the formats this brand does **not** route, and why. A refusal with a reason
is a better answer than a render that contradicts the brand's own claim.

## Step 4. Build the visual kit

**The layout is per brand, and a template would be wrong.** An art brand's kit is a
light editorial sheet in its own serif; a martech brand's is a dark technical one.
A single house style would produce a kit that is off-brand for every client but the
one it was drawn for, which defeats the object of a brand kit.

What is fixed is the **content**, in this order:

1. Logo lockups on their real grounds, with clear space and the nevers
2. Palette with hex, role, and the rule that governs it
3. Type scale, with the pairing rule
4. Product truth: catalogue, sizes, price band, materials
5. Approved claims with frequencies, and the forbidden list
6. Scene grammar, with the brand's real photography
7. Format routing table
8. The execution prompts

Build it as one HTML file with `section.page` per page, A4 landscape
(297x210mm). **Inline the fonts and images as data URIs** so the file renders
identically anywhere, offline, forever. Fetch webfonts once and base64 them; do the
same for the logo and a handful of real product shots.

Then:

```bash
node skills/brand-kit-builder/scripts/render-kit.mjs kit.html \
  --out "<Brand>-Brand-Kit.pdf" --fonts "Heading Family,Body Family"
```

It refuses to call a kit clean unless the fonts really loaded, nothing overflows
its print area, nothing is clipped inside a box, and the page numbering matches the
document.

**The built HTML does not go in the repository.** Inlining the fonts and imagery
takes it past 3 MB, which bloats history and produces diffs nobody can read. The
kit's SOURCE OF TRUTH is `brand-kit.json` plus `PROMPTS.md`, both small and both
reviewable; the HTML and the PDF are deliverables built from them and sent to the
client. Rebuild rather than store.

## Why those four checks, specifically

Each one shipped a broken artifact before it existed.

- **Fonts.** `document.fonts.check()` looks like the right question and is not: it
  asks whether text can be rendered, and a fallback always exists, so it returns
  true for a family that never loaded. The harness enumerates loaded FontFace
  entries instead. The first version used `check()` and passed a font called
  "Nonexistent Face".
- **Overflow.** The PDF writer crops past 210mm in silence.
- **Clipping.** A page can measure clean while its content is cut off inside it,
  because any box with `overflow:hidden` clips its own children without the page
  growing. Found by a test that doubled the prompt type size and still passed.
- **Numbering.** Reading the first "N / M" on the page meant a kit whose second
  page still said "02 / 04" passed, because page one said "01 / 05". Read them all.

The pattern worth keeping: **a check that cannot fail is worse than no check**,
because it manufactures confidence. Before trusting a new one, break the input on
purpose and confirm it goes red.

## What stays with a person

The script reaches a public page. It cannot read a channel behind a login, judge
whether a scene is on brand, or tell a real testimonial from a plausible one.

Social proof is the field most likely to be fabricated, because a process that
knows what a testimonial sounds like will write one. If no rating resolves, the kit
says NOT_ESTABLISHED, records what was attempted, and the engine renders no proof.
Being short a proof point costs a weaker ad. Inventing one costs the client.
