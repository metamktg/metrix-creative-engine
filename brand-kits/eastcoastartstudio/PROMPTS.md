# EastCoastArtStudio: render prompts

Paired with `brand-kit.json`. Every scene below was reverse-engineered from the
brand's own photography, not invented. Reproducing their grammar is what makes a
generated asset sit beside their organic content without looking foreign.

## The one rule that outranks everything

**A real, legible street nameplate appears inside the artwork.** Green NYC-style
blade for American streets, white or cream plate for European ones. It is not a
decoration on the scene, it is painted into the print itself. An asset without it
is not this brand's product, however good it looks.

Second rule: **the room is achromatic and warm, the print is the only saturated
thing in frame.** If the sofa competes with the art, the frame has failed.

## Scene grammar, verified from their own mockups

Each product carries the same four shots in the same order. Match them.

| Scene | When to use | The recipe |
| --- | --- | --- |
| **A. Catalogue** | Proof, size, detail | Print in a thin light-oak frame, flat to camera, centred on pure white, soft contact shadow below. Nothing else in frame. |
| **B. Floor lean** | The default hero | Black frame leaning against a pale warm-grey wall, light oak floorboards, a fiddle-leaf fig in a white ceramic pot at right, out-of-focus foliage entering at left. Natural side light, soft shadow pooling left. |
| **C. Gift flat-lay** | Gifting angles | Unframed print resting on a round woven rattan tray, on cream textured linen, a dark walnut surface edge across the top of frame. Shot from directly above, warm daylight. |
| **D. Interior** | Aspiration, scale | Framed print on a white panelled wall, rattan armchair with cream cushions and a knitted throw, a cream floor pouffe, a plant at the edge. Wide, eye level, airy. |

Shared assets that already exist and should be composited rather than generated:
the **frame-detail** photograph (stacked corners in walnut, white, black, oak) and
the **size guide** (ratio diagrams over a warm living room). Both are in
`brand_assets`. Generating a replacement for either invents specifications.

---

## Static

```
Render the static for this EastCoastArtStudio brief.

1. Validate the brief. Stop on any error.
2. Upload the brand assets and pass the artwork reference to the model. Without a
   real product reference this brand cannot be rendered: the product IS a specific
   painting of a specific named street, and a model with no reference will invent a
   generic poster with unreadable lettering.
3. Pick the scene from the table: A for proof, B for the default hero, C for
   gifting, D for scale. The brief's angle decides it.
4. The street nameplate must be legible. If the brief names a street, that text is
   on the sign, spelled correctly. Route to a text-capable model and check the
   spelling in the output before accepting it.
5. Achromatic room, saturated print. Warm neutrals only: linen, rattan, oak,
   cream, white, near-black.
6. 4:5 for feed. Ratio is a model parameter, never prompt text.
7. Reserve clear space if the wordmark will be composited. It is a PNG with zero
   padding, so the layout supplies the margin, not the file.
8. Final pass: would a strategist recognise this as EastCoastArtStudio rather than
   as generic wall art? If the sign is unreadable or the room is colourful, revise.
   Then name the file after the brief id.
```

## Carousel

```
Render the carousel for this EastCoastArtStudio brief.

1. Validate the brief. Stop on any error. Upload the brand assets.
2. Lock across every card: model, 1:1, resolution, seed, and the same print. The
   cards are one product seen four ways, never four different prints.
3. Card order follows their own sequence, which already works:
   Card 1 scene B, the floor lean, to stop the scroll.
   Card 2 scene A, flat on white, so the buyer sees the art itself.
   Card 3 scene D, the interior, for scale.
   Card 4 the frame-detail or size-guide asset, composited not generated.
4. The nameplate spelling is identical on every card. A city misspelled on card 3
   undoes the other three.
5. Final pass, then name the files after the brief id, numbered in sequence.
```

## Video

```
Render the video for this EastCoastArtStudio brief.

1. Validate the brief. Stop on any error. Motion needs a duration. Upload assets.
2. Still first. Generate scene B as a static, approve it, then animate from it.
   This brand is unusually unforgiving of text-to-video: the nameplate lettering
   warps, and a warped street name is an unusable asset.
3. Motion is ambient, not dramatic. Slow push in on the frame, or light moving
   across the wall, 4 to 6 seconds. The print does not move, ripple or parallax.
4. First frame is the thumbnail. It carries the print and the legible sign.
5. Sound off. Any message is on-screen or in the copy, never in a voiceover.
6. Raise the timeout well above the default. Final pass, then name the file.
```

## UGC

```
Render the UGC asset for this EastCoastArtStudio brief.

1. Validate the brief. Stop on any error. Motion needs a duration. Upload assets.
2. The believable scenario for this product is unboxing or hanging, filmed at
   home. Phone camera, handheld, natural window light, a real lived-in room,
   slightly off-centre framing, everyday clothing.
3. The print must stay recognisable through the handheld motion. Keep it large in
   frame and avoid fast pans across the artwork.
4. Do not stage a gallery. The value of this format for this brand is that the
   art arrives in an ordinary room, which is where the buyer's wall is.
5. 9:16. Resist polish.
6. Final pass, then name the file after the brief id.
```

## Motion graphic

```
Render the motion graphic for this EastCoastArtStudio brief.

1. Validate the brief. Stop on any error. Motion needs a duration.
2. Take Route A. This brand's motion work is type over photography, and generative
   video cannot hold the wordmark or a price. Generate the frames as statics,
   animate in post.
3. Headlines are set in Playfair Display 400, body copy in Poppins. The wordmark
   is still placed as the supplied PNG, never re-typeset: Playfair resembles it
   closely, which makes a hand-set lookalike tempting and still wrong.
4. 6 to 15 seconds, sound off, the first second carrying the print.
5. Final pass, then name the file after the brief id.
```

## Claymation

```
Not routed for this brand without an explicit client decision.

A handmade clay treatment contradicts the single claim the whole catalogue rests
on: museum-grade archival printing. If a brief asks for it, say so and ask before
spending. That is a stop, not a refusal.
```

## Copy rules for any asset

- Say **EastCoastArtStudio**, one word, singular. The plural appears in their own
  data and is wrong on an asset.
- Approved claims only: museum-grade 200gsm fine art paper, pigmented archival
  inks, framed and unframed, free shipping, custom destinations on request.
- **No rating, no review count, no testimonial.** None is verified for this brand.
- Never lift the SEO keyword tail from a product description. It is stuffing.
- Lead with the place, because the buyer is buying a place. "Berry Street,
  Williamsburg" beats "premium wall art".
- Headline in Playfair Display 400, body in Poppins. Never body copy in Playfair:
  the hairlines vanish at ad sizes and on a phone.
