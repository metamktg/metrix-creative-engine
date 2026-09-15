---
name: brand-kit-builder
description: Build a creative brand kit for an ad account from public sources alone, when no client assets were supplied. Audits the URL, the commerce platform, the public catalogue and the social channels, and emits a brand-kit.json plus render prompts that the creative engine consumes. Use before the first brief lands for a new account, or when an existing account renders generic assets because nothing carried its product to the model.
---

# Brand kit builder

A render is only as good as what reaches the model. An account with no brand kit
produces a plausible generic product: right category, wrong brand, unusable. This
builds the kit from what is publicly there.

## The governing discipline

**Every field carries its provenance, and the two words that matter are VERIFIED
and INFERRED.**

- VERIFIED means you fetched it and read it. Quote the source.
- INFERRED means you reasoned to it. Say what from.
- ABSENT is a finding, not a gap to fill. A missing favicon is reported, never
  generated. A brand with no icon mark never gets one invented.

The failure this exists to prevent is not missing data. It is **confident
invention**: a hex value nobody set, a testimonial nobody wrote, a tagline that
reads right and appears nowhere. A kit that says "no rating verified" is worth
more than one that says "4.8 stars" from nowhere, because the second one ships.

Two habits enforce it. Prefer a count to an impression: "228 of 249 descriptions"
beats "they usually say". And when a fact would be convenient, check it twice.

## Step 1: fingerprint the platform. It decides everything after.

```bash
curl -sSL -A "<browser UA>" https://example.com/ -o home.html
grep -ci "shopify\|squarespace\|wix\|webflow\|wp-content\|bigcommerce" home.html
```

Platform determines the extraction route, and the difference is enormous:

| Platform | The route in |
| --- | --- |
| **Shopify** | `/products.json?limit=250` and `/collections.json`. A complete machine-readable catalogue: titles, descriptions, images, variants, prices, tags. This is the single biggest lever available. |
| **WooCommerce** | `/wp-json/wc/store/products`, often open. |
| **Squarespace** | Append `?format=json` to any collection URL. |
| **Webflow / bespoke** | No structured route. Fall back to crawling and parsing. |

Expect **HTTP 429**. These endpoints rate limit. Back off and retry rather than
concluding the endpoint is absent; treating a 429 as a 404 silently halves the kit.

## Step 2: the asset hunt, in this order

1. **Logo.** Look inside `<header>` for `<img>`, then for `class*="logo"`, then
   `alt*="logo"`. Download at full width. Measure the **alpha bounding box**: many
   logo files bleed to the canvas edge, which breaks naive compositing and is worth
   reporting as a defect.
2. **Alt and reverse logos.** A second file named `reverse`, `white`, `light` or
   `dark` is common and is what makes the brand usable on a dark ad. Look for it
   explicitly; it is rarely linked in the page a human sees.
3. **Favicon and touch icons.** `link[rel*=icon]`, `apple-touch-icon`, and
   `/favicon.ico` directly. If all three are absent, say so.
4. **Real product imagery.** From the catalogue endpoint, not from a screenshot.
   Download several products' full image sets.
5. **Shared assets.** md5 the downloaded images. **Files that repeat across
   products are the brand's own infographics**: size guides, material detail,
   packaging, care cards. These are the highest-value assets in the audit, because
   they are the ones that must be composited rather than generated, and they are
   invisible to anyone who looks at one product.

## Step 3: derive the mockup grammar

Open the product images and read the repeating scenes. Most brands shoot the same
three or four setups on every product. Write each one down as a reproducible
recipe: surface, frame or vessel, props, light direction, camera height, palette.

This is the part no endpoint gives you and the part that makes generated assets
sit beside the brand's organic content instead of looking foreign. Look at the
images. Do not infer the scene from the product title.

## Step 4: colour and type from the CSS, not from a screenshot

Fetch the linked stylesheets and census the hex values by frequency. A screenshot
tells you what a JPEG compressor did; the CSS tells you what the brand set.

**A near-achromatic palette is a finding, not a failure.** For art, fashion and
food, white and near-black are often correct and the product supplies the colour.
Record that as the rule rather than hunting for an accent that was never chosen.

For type, take the declared `font-family`. If the wordmark's font cannot be
identified, say so and rule that the wordmark is **placed, never re-typeset**. A
lookalike serif is worse than no logo.

## Step 5: claims, counted

Extract every product description and count the recurring phrases. A claim in 91%
of descriptions is a brand claim. A claim in one is a one-off.

Then split the list in two:

- **Approved**, with its frequency as evidence.
- **Forbidden**, and be strict. Marketing claims the brand makes about itself but
  you could not verify go here, not in approved. So does the SEO keyword tail that
  ends most ecommerce descriptions: it is stuffing, and it must never reach an asset.

## Step 6: social proof, the part most likely to be fabricated

Testimonials and ratings are legitimately sourceable from public review platforms,
and the user is right that they should be. Detect the platform first: Judge.me,
Yotpo, Okendo, Loox, Stamped and Trustpilot all leave markers in the storefront
HTML. Then try, in order: the product page's JSON-LD `aggregateRating`, the review
widget's own markup, the platform's public store page, Trustpilot, Google.

**And if none of it resolves, the kit says NOT_ESTABLISHED and the engine renders
no proof.** This is the single highest-risk field in the whole document. A
fabricated review is a legal problem and an unrecoverable trust problem, and it is
exactly the field an eager process invents because it knows what one sounds like.
Record what you attempted and what failed, so the next pass starts where this one
stopped.

## Step 7: emit

Two files per account, in `brand-kits/<account>/`:

- **`brand-kit.json`** — the structured kit. Its `brand_assets` array plugs
  straight into the brief contract that `kie_validate_brief` checks.
- **`PROMPTS.md`** — the account's render prompts, carrying its scene grammar,
  its one non-negotiable product rule, and its copy rules.

`scripts/audit-brand.mjs` does the mechanical half: fetch, fingerprint, pull the
catalogue, find and measure the logos, census the palette, count the claims, and
write a draft kit with every field marked. It does not write the mockup grammar or
the creative rules, because those need someone to look at the pictures.

## What the tool cannot do, stated plainly

The script can reach a public page. It cannot read a channel behind a login, judge
whether a scene is on-brand, or tell a real testimonial from a plausible one. Its
output is a **draft with evidence attached**, and a person confirms the identity,
the grammar and the proof before a credit is spent against it.
