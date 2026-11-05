# Casting the presenter

UGC works because the viewer thinks "this is someone like me". Casting decides
whether that recognition happens, and it is decided before a single credit is
spent on a still. A polished presenter demonstrating a mop, or a very young
presenter explaining a mid-career product, breaks the format no matter how good
the render is.

Two production rules govern this file:

- **Reuse means B-roll and graphics, never the actor.** A new creative gets a
  new presenter unless the brief names the same one. Old face, lip animation
  and voice acceptances do not transfer to a new performer.
- **A presenter is a demonstrator, not a customer.** Describe them only by
  observable traits from the brief's `icp_profiles`; no real people, public
  figures or lookalikes; the AI-disclosure requirement is flagged in every
  handoff.

Casting, geography, styling and voice choices are private run decisions. Keep
the completed persona in the run's records (the playbook's creative profile),
never in shared instructions. This file is the method, with placeholders.

## 1. The persona brief

Fill this before generating, from `audience.icp_profiles[].observable_traits`
and the brief's situation. Write it into `brand_translation.json` so every still,
voice and performance prompt reads the same person.

```
Age band           [from the ICP]
Presentation       ordinary, unpolished, approachable; natural skin texture
Wardrobe           [plain, everyday; no logos]
Setting            [an ordinary place the situation implies, with a few used objects]
Energy             [calm, a little tired, warm: match the line, not a mood board]
Speech register    plain, conversational, contractions, short sentences
Relationship       demonstrator explaining it, NOT a customer reporting results
Voice              [register that fits the person, the mic distance and the room]
Distinct from      the previous presenter in this account: different hair colour and
                   length, different top, different room, so no cross-identification
```

"Ordinary appearance" is a deliberate and effective instruction. The model's
prior pushes toward glossy; the negative framing ("not a model, not glamorous,
not studio") does as much work as the description. Avoid raising the voice's
pitch or brightness only because of who is speaking: fit it to the person, the
posture, the mic distance and the room.

## 2. Match the persona to the product and the audience

| Product or situation | Presenter that reads true |
| --- | --- |
| Education, training, career change | Looks like the learner: an adult with a job, at a real desk or table, working materials nearby |
| Household, cleaning | Someone who clearly does the cleaning; practical, unfussy |
| Skincare, beauty | Age-appropriate to the claim; visible real skin. A product for lines on a presenter with none is both unpersuasive and misleading |
| B2B software | A colleague: office-casual, slightly harried, a laptop that is actually open |
| Fitness | Realistically fit, not a model |
| Parenting | Visibly a parent; tired, warm, in a real home |
| Trade tools | Working hands, workwear, a real site |
| Food | Someone who cooks; a kitchen with use marks |

The mismatch is the common failure. When the brief gives a situation, the
situation casts the person, the place and the hour, and the voice has to belong
to that hour.

### The coherence test

Before any prompt: **why is this person, with this product, in this place,
filming right now?** Fix the location or the reason to film, not the lighting.
Keep location, packaging tier and speaking tone on one register: a premium
product is most believable as "I treated myself", filmed at home.

## 3. The identity still

One still, accepted by a person, then passed as a file into everything after it.
A locked prompt is not a locked face (core rule 4). The still is also the
lip-sync source, and the lip-sync inherits every fault in it, so the spec is
strict:

- Phone-camera medium close-up, 9:16, front-facing or near it, both eyes
  visible, **mouth closed, relaxed, no grin**.
- Soft natural light from one side; **no hard shadow across the lower face**,
  no glasses glare, no hands near the face.
- Natural skin texture, no beauty smoothing, slightly imperfect framing, headroom
  for a caption band, empty wall above.
- **No text, no logos, no readable screens, no other people.** A visible device
  logo or screen has cost a still before.
- Camera height, distance and headroom chosen for the brief; no awkward extreme
  close-up that clips eyes, chin or hands. Lead with a well-framed creator when
  the hook calls for direct address.
- `nano-banana-2`, 2K, `aspect_ratio` set explicitly (it defaults to `auto`).

Reject on the still, not on the motion: a still costs a few credits, a performance
costs hundreds. Age reads can drift younger; check against the persona age band
before accepting. Expression matches the words: reject frightened or wide-eyed
looks, fixed smiles and a speaking pose with no physical composure.

Across every later clip, consistency comes only from verbatim repetition: the
same accepted still as the file input, the same wardrobe, hair, setting and
light sentence, and one anchor line on every clip prompt ("the person, outfit,
product and setting stay exactly as in the first frame"). There is no memory
between calls, so a phrase that differs is a face that drifts.

Where a model exposes a seed, hold it and generate three or four reference
views (front, turned twenty degrees left and right, slight smile) so the
performance model has a face it can hold through motion. Where it does not, the
accepted still is the single reference and every later render takes it as a
file input.

## 4. The talking base clip, when the route needs one

For the two-step lip-sync route (`lip-sync-routing.md`), a silent talking base
clip is animated from the still and lip-synced afterwards. The base prompt
decides whether the mouth is visible and the eyes are where the script says. A
base clip whose eyes went down to a laptop hid the mouth and cost a repair
cycle. The converged base prompt:

```
She keeps her eyes on the camera the whole time. Seated, forearms resting on the
table, small natural head movement, small soft mouth movements as if talking,
small nods and natural blinks. Room, light and framing unchanged. No camera move.
```

Negative prompt, in the model's `negative_prompt` field and only where the model
page lists one: `looking down, looking away, hand gestures in front of face,
mouth covered, drinking, writing, standing up, walking, zoom, text, logos`. A
generic negative list cannot replace reviewing the output.

The map's `gaze` field overrides this per line only for the one-take avatar
route, where the performance model reads the audio. On the two-step route the
base clip holds the lens and gaze variation is cut in from B-roll.

## 5. Voice is part of the persona

Audition three voice candidates on the first two lines, by human listening, and
pick for fit to the persona, the situation and the recording perspective, not for
polish. Lower stability to reduce monotone; raise style a little for
personality; never the maximum-stability setting. These are starting points for
the run profile, confirmed by listening. Keep the chosen voice id and settings in
`render_spec.json` and reuse them for every retake. On the two-step route, pick
the candidate whose phrase lengths sit closest to the base clip's mouth movement,
because the mouth was animated before the voice.

A voice that is right for the person and wrong for the room still fails: a
dry, close-miked studio read on a presenter an arm's length from a phone on a
desk is what a listener hears as "too AI produced". Declare the recording
perspective first (`script-and-delivery.md`, section 7).

## 6. A roster, not one presenter

When the brief authorises variants, cast two to four presenters that differ on
age band, energy, setting and register, and run the same script across them.
Which presenter resonates is not predictable, and it is usually a larger
performance variable than the script. Each needs its own identity still, voice
audition and acceptance; nothing transfers between them.

| Slot | Example |
| --- | --- |
| A | practical, plain register, a domestic setting |
| B | quicker, informal, sentence fragments, a smaller space |
| C | measured, longer sentences, a home office |

Inside a live matrix the presenter is a locked base, not a variable, unless the
presenter is the declared slot.

## 7. Rights, disclosure and records

- A synthetic presenter has no name and no biography. Do not give them one.
- Keep a provenance record per presenter: model, prompt, references, seed if
  any, date, accepted still hash, voice id and settings.
- Flag the AI-disclosure requirement for the placement in every handoff, and
  carry the disclosure decision (burned in, platform toggle, caption) as an
  open decision until it is taken.
- A real customer's or creator's words may be used only with written permission
  and only as they said them; generated scenery around real testimony is the
  compliant path to the testimonial format.
