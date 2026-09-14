# Format: Claymation and Stop-Motion

## Premise

A handmade, tactile look: modelling clay, visible fingerprints, felt, paper
craft, miniature sets. It earns attention in feed because it does not look like
the ads around it, and it reads as charming rather than corporate.

**This is a style, not a model.** No Kie model is a claymation model. The look
comes from the prompt, applied to the same image and video models used for every
other format. That means any eligible model can do it, and the routing table
does not constrain you.

## Defaults

- **Ratio and duration:** as the placement requires. Nothing format-specific.
- **Model:** for stills, a model with strong material rendering. For motion,
  image-to-video from an approved still is strongly preferred, because the look
  is fragile and you want to lock it before paying for motion.
- **Reference images:** if the client has real models, props or a built set,
  those references are worth more than any amount of prompt language.

## Prompting the look

Name the material, the making, and the imperfection. Imperfection is what
separates claymation from a plastic 3D render:

```
stop-motion claymation, modelling clay with visible fingerprints and tool marks,
slightly uneven surfaces, handmade miniature set, shallow depth of field,
practical tabletop lighting with soft shadows, subtle seams where parts join
```

For paper or felt variants, swap the material and keep the structure: name the
material, the construction, the imperfection, the lighting.

**For motion**, add the frame rate feel, because that is what makes it read as
stop-motion rather than smooth CG:

```
stop-motion animation at roughly 12 frames per second, slight jitter between
frames, small inconsistencies in position, practical lighting
```

## What breaks the look

- **Smooth motion.** Perfect interpolation reads as 3D animation. Ask for the
  jitter explicitly.
- **Perfect surfaces.** No fingerprints, no tool marks, no seams, and it becomes
  a plastic render.
- **Photoreal lighting.** Studio-perfect light fights the handmade premise. Ask
  for practical, tabletop, slightly imperfect light.

## Product truth

The tension specific to this format: the product must remain recognisable while
everything around it is stylised.

Decide explicitly, and record the decision in the render spec:

- **Product rendered in clay too.** Charming, cohesive, and it is no longer a
  photograph of the product. Fine for awareness; check whether the brief's claim
  depends on the real product being shown.
- **Real product in a clay world.** Product from references, environment
  stylised. Preserves product truth and is the safer default for anything
  performance-led.

Never let the model reinterpret the product's shape, label or colour in clay by
accident. If it is going in the clay world, that is a decision someone made.

## QA checks to add

- [ ] The look reads as handmade, not as smooth 3D
- [ ] Imperfections are present: fingerprints, tool marks, seams
- [ ] Product decision matches what the render spec recorded
- [ ] If the real product is used, it matches the reference exactly
- [ ] Brand colours survive the material treatment, or the deviation is stated
- [ ] In motion, the frame-rate feel is present and consistent

## Common failure

Clean, smooth, glossy output that is a 3D render wearing the word claymation.
The fix is always more imperfection in the prompt, not more style words.
