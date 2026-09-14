# Format: Video

## Premise

The first one to two seconds decide the result, usually with the sound off. The
opening frame is also the thumbnail. Build from the opening frame outward.

## Default workflow: still first

1. Generate the opening frame as a still, following the static format rules.
2. Get the still approved. A bad composition costs image credits to reject
   instead of video credits.
3. Animate the approved still with an image-to-video model from the routing
   table. The still carries composition, subject and style; the prompt now only
   has to carry motion.

Go straight to text-to-video only for cheap exploration, or when the brief says so.

## Ratio and length

- **Ratio:** 9:16 for Reels and Stories, 16:9 for in-stream. No video model
  offers 4:5, so feed video is a crop from a 9:16 render with a centred subject.
- **Duration:** a parameter with a fixed set of allowed values per model. Check
  the routing table, and take the shortest that carries the idea. A hook test is
  decided early; extra seconds add cost, not signal.

## Writing motion

- **Separate subject motion from camera motion.** "She lifts the bottle toward
  camera" and "slow push-in" are two clauses. If either is left implicit, you
  get a static shot or unwanted drift.
- **One action per clip.** Several beats in a few seconds get compressed or
  dropped. Generate a sequence as separate shots.
- **Front-load.** The arresting moment is the first frame, not a reveal at the
  end.

## Multi-shot sequences

- Generate each shot separately.
- Lock style across shots with the same reference frame or product references,
  the same light and palette clauses, and the same model.
- Assemble, caption and add the logo in post.

## Sound

- Assume sound off. The visual must carry the idea without audio.
- Captions and supers are added in post, never generated.
- Music beds come from the routing table's music model, instrumental unless
  vocals are the point. Voiceover comes from the speech model.

## Matrix mode

The isolated variable usually lives in the opening seconds. Keep the approved
still, the motion clause and the duration identical across the row, and vary
only the slot.

## Timing and cost

Video takes minutes, not seconds, and costs several times what an image does.
Create the task and wait on it rather than blocking, and state the credit
estimate before the batch.

## QA checks to add

- [ ] Opening frame works as a still and as the thumbnail
- [ ] Product label and shape stay stable across frames with no morphing
- [ ] Motion matches the prompt, with no unrequested drift
- [ ] Subject stays inside the safe zone for the whole clip
- [ ] Idea reads with sound off
