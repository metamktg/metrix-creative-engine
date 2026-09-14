# Format: Single-Image Static

## Premise

One frame has to do the whole job at thumbnail size, with no sound, no motion
and no second card. What matters most is legibility at a glance.

## Defaults

- **Ratio:** 4:5 for feed, 1:1 when one asset must serve feed and right column.
  Only models that offer 4:5 natively are eligible for 4:5; check the routing
  table rather than cropping.
- **Resolution:** 2K or better for anything the client sees full size.
- **Composition:** one clear subject, large in frame, simple ground, strong
  value contrast between subject and background.
- **Space:** if a logo will be composited, reserve and name the clear area.

## Two kinds of static

**Product-led.** The product is the subject.
- Product references are mandatory. Without them this is a blocker.
- Prompt the scene, surface and light. Let the references carry the product.
- The label must face the camera if the brief relies on it being read.

**Lifestyle or ICP-led.** A person or moment is the subject; the product is
present or implied.
- Describe the person by observable traits from `icp_profiles`.
- If the product appears, it still comes from references.

## On-image text

Out of scope by default (see core rule 2). If the format's premise is text
overlay, route to the model the routing table lists for text rendering, keep the
text to a few words, make the text the isolated variable, and check every
character before calling it done.

## QA checks to add

- [ ] Product matches the reference: shape, label, colour, proportions
- [ ] Dominant colours match the hex values in the Brand Translation Sheet
- [ ] Subject still reads when the image is viewed at about 20% size
- [ ] Hands, reflections and small text zoomed and checked
- [ ] Object counts match the prompt where a count matters
- [ ] Logo clear space is actually clear

## Common failure

A beautiful image with a small subject. It wins in review at full size and
loses in the feed. Check at thumbnail size before approving.
