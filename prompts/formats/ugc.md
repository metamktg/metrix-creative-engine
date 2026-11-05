# Format: UGC and AI-UGC

## Premise

The asset should look captured by a real person on a phone, not produced by a
studio. The value is native feel. Over-polishing removes the reason for choosing
the format.

## Translating "UGC look" into prompt language

"UGC style" renders inconsistently. Use camera terms instead:

- Phone camera, handheld, front-facing or selfie framing
- Natural mixed light: window light, a lamp, overhead kitchen light
- Real home settings with lived-in detail
- Slightly imperfect framing, off-centre and mid-moment
- Everyday clothing and natural expression, not model poses

Write the translation into the Brand Translation Sheet once and reuse it for the
whole matrix, so "UGC feel" is not a hidden variable between cells.

## People

- Describe the person only by observable traits from `icp_profiles`: apparent
  age range, clothing, setting, activity, expression.
- No real people, public figures or lookalikes.
- Keep the same person description in the locked base across a row. A different
  face per cell is an uncontrolled variable.
- Cast before generating: persona brief, product match, identity-still spec and
  voice are in `skills/ugc-creator-edit/references/casting.md`. Reuse B-roll and
  graphics, never the actor, and treat the presenter as a demonstrator.

## Product in hand

- Product references are required.
- Hands holding products are where artefacts concentrate. Zoom in on fingers,
  grip and the label on every render.
- One hand action per shot. No on-camera eating, drinking or applying; end on a
  hold-and-show. Keep the label readable and the hero detail uncovered.
- Across clips, consistency comes only from repeating the accepted still file and
  the same wardrobe, setting and light sentences verbatim.

## Script, hook and delivery

Before any voice or motion spend, write the script for the mouth with a per-line
delivery map and run `skills/ugc-creator-edit/scripts/check_script.py`. Rules and
format: `skills/ugc-creator-edit/references/script-and-delivery.md` and
`hooks.md`. Plan at about 2.4 words a second under the brief's duration mode
(exact, maximum or range); never speed speech to fit. A synthetic presenter
demonstrates and never reports experience. Direction is not spoken text, and no
breaths or imperfections are inserted. The negative sheet and the voice, shot
and editor blocks are in `kie://ugc-creative-playbook`.

## Honesty and disclosure

- A generated person must not be presented as a real customer describing real
  results. Frame AI-UGC as demonstration or scenario, not testimonial.
- Any testimonial wording belongs to `copywriting-meta-ads` and must come from
  real customer evidence.
- Check the current Meta disclosure requirements for AI-generated people, and
  the client's own policy, before launch. Flag this in the handoff every time
  AI-UGC is delivered.

## Caption bars

A burned-in caption bar is normal for this format, not an exception: core rule 1
puts the brief's hook and CTA in the pixels.

The craft note still stands, and it is a production choice rather than a rule:
**composite the caption in post where you can.** Generated text drifts across
frames, and a caption is the one element a reader is certain to read closely.
Generate it only when the caption's treatment is itself under test, and then
check every character of every frame.

## Talking-head video

Treat it as a video asset (`formats/video.md`) with extra checks: mouth
movement against the voiceover, and eye-line consistency. Voiceover is generated
separately from the routing table's speech model, not asked of the video model.

Choose the route by input and record it, the live price and a fallback in
`render_spec.json` before the first paid call: a one-take avatar (accepted still
plus accepted dry voice), a two-step silent base clip then a video-to-video
lip-sync pass, or a native-audio model for short beats. Accept the still, then
the full dry voice by listening, then one representative motion proof, then the
full take. Face beats only get lip sync. Routes, dated observations and the
outage protocol: `skills/ugc-creator-edit/references/lip-sync-routing.md`.

## QA checks to add

`kie_render_ugc` and `kie_render_ai_ugc` load the short
`06-production-review.md` and `07-ugc-creative-direction.md` modules. Read the
complete shared contract on demand through `kie://production-review-standard`
or `docs/UGC_PRODUCTION_STANDARD.md`. Use its performance, soundtrack, UI timing,
transition, recovery and five-gate evidence requirements on the actual export.
The checklist below is additive and cannot certify an unheard or unwatched cut.

- [ ] Reads as phone-captured, not studio
- [ ] Hands and grip are anatomically correct
- [ ] Product label matches the reference
- [ ] Same person description across every cell in the row
- [ ] Disclosure requirement flagged in the handoff
- [ ] `check_script.py` passes on the delivery map before voice spend
- [ ] Full dry voice accepted by human listening before any lip-sync spend
- [ ] Rendered take transcribed and compared with the script (`--transcript`)
- [ ] Last two seconds of every clip inspected for drift and intruding objects
