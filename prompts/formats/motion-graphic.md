# Format: Motion Graphic

## Premise

Designed elements move: type, shapes, product cut-outs, data, UI. The idea is
carried by composition and timing rather than by a filmed subject. On Meta it
usually runs 6 to 15 seconds, sound off, with the first second doing the work.

## Read this before routing here

**Generative video is weak at exactly what this format is made of.** Legible
type, clean geometry, a logo that holds its shape, a number that stays the same
number frame to frame. Text warps, shapes wobble, marks drift.

So there are two routes, and choosing the wrong one wastes the budget:

**Route A, designed frames plus animation in post.** Generate the frames as
statics, where type and geometry are controllable, then animate in After
Effects, Canva or similar. Slower, and the result is correct.

**Route B, generated motion.** Prompt an abstract or textural motion bed with no
type in it, then composite type over it in post. The generated layer carries
atmosphere; the design layer carries the message.

**Route B is the default.** Route A when the brief's idea *is* the typography or
the data.

What is not a route: prompting a video model for "motion graphic with the
headline animating in". It will produce warped pseudo-text, and the brief's
message will not survive.

## Defaults

- **Ratio:** `9:16` for Reels and Stories, `1:1` or `4:5` for feed.
- **Duration:** the shortest that carries the idea. Longer costs more and rarely
  improves a hook test.
- **Motion:** one continuous idea, not a sequence of beats. Say what moves, in
  what direction, at what pace.
- **Ground:** a plain or textural background composites far better than a busy
  one. Ask for negative space where type will land, and name where.

## Prompting the motion bed

Describe material and movement, not graphic design:

```
slow drifting gradient field, deep navy to warm cream, soft volumetric haze,
gentle left-to-right parallax, clean empty space in the upper third,
no text, no logos, no geometric overlays
```

Then in the render spec, state the composite plan: what type lands where, in
which face, and what clear space the generated layer must hold.

## On-image text

Core rule 1 puts the brief's hook and CTA in the frame, and for a motion graphic
type is usually the whole point. Even so, **prefer composited type** on this
format specifically: it is legible, brand-correct, editable, and it holds still
across frames where generated type drifts.

Generate type only when the type's *treatment* is the thing being tested, and
then check every character.

## QA checks to add

- [ ] No warped pseudo-text anywhere in the generated layer
- [ ] Clear space the composite needs is actually clear, for the whole duration
- [ ] Brand colours match the hex values in the Brand Translation Sheet
- [ ] The first frame reads as a deliberate opening, not a fade from nothing
- [ ] Motion is legible at thumbnail size and with sound off
- [ ] Loop point is clean if the asset is intended to loop

## Common failure

A beautiful motion bed that leaves nowhere for the message. Decide where type
goes before generating, and prompt the empty space in.
