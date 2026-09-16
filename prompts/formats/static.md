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

**In scope, and usually the most important thing in the frame.** A feed static
has about one second to stop a thumb, and the hook does that work.

- Take the hook and the CTA from `copy_architecture` and **quote them verbatim**
  in the prompt. A paraphrase renders as a paraphrase.
- Set them with `visual_direction.typography`: weight, case, spacing, placement.
- Route to a model that can set type at 4:5 (`nano-banana-2`, see
  `model-routing.md`). Never send text to a model picked for ratio alone.
- Keep the hook short enough to read at thumbnail size. If it will not fit in a
  glance, shorten the line, not the type.
- The CTA is rendered as the brief specifies it, button and all.
- **Read every character in the output.** A single wrong letter makes the asset
  unusable, and it is the most common failure of this format.

Leave out only what the brief marks as an Ads Manager field: Primary Text and
Description are tested without re-rendering, so they stay out of the pixels.

## QA checks to add

- [ ] Product matches the reference: shape, label, colour, proportions
- [ ] Dominant colours match the hex values in the Brand Translation Sheet
- [ ] Subject still reads when the image is viewed at about 20% size
- [ ] Hands, reflections and small text zoomed and checked
- [ ] Object counts match the prompt where a count matters
- [ ] Logo clear space is actually clear
- [ ] Hook text matches `copy_architecture` character for character
- [ ] CTA present, correctly worded, and legible at thumbnail size
- [ ] Aspect ratio is the one the placement needs, set as a parameter

## Common failure

A beautiful image with a small subject. It wins in review at full size and
loses in the feed. Check at thumbnail size before approving.
