# The four formats

Per `brief_metadata.asset_type`. Each has a failure mode that is specific to it.

## Static

One image. Feed default is **4:5**, which among the models means the Nano Banana
family (`google/nano-banana`, or `nano-banana-2` for 2K/4K). Seedream, Flux,
Ideogram and Z-Image have no 4:5.

```
node scripts/kie.mjs run "google/nano-banana" \
  '{"prompt":"<base + slot>","aspect_ratio":"4:5","output_format":"png"}'
```

Failure mode: reaching for a model that cannot do 4:5 and cropping a 1:1 down,
which eats the top and bottom of the frame where the composition usually sits.

## Carousel

Three to ten cards at **1:1**, and they must read as **one set**. This is the
format people get wrong, because each card gets prompted freshly and the deck
ends up looking like five different ads.

Lock across every card: the model, the aspect ratio, the lighting clause, the
palette clause, the style clause, the seed where the model exposes one. Vary
**only the card's subject or beat**.

```
BASE (identical on every card)
  editorial product photography, soft overcast daylight from the left,
  muted grey and deep green palette, 85mm, shallow depth of field,
  plain seamless concrete backdrop

CARD SLOT
  1  the bottle upright, three-quarter view        <- hook card
  2  the lid detached beside it, top-down
  3  the bottle held in one hand, mid-pour
```

Generate them in one sitting. Card 1 carries the hook and is the only one most
people see, so if credits are tight, spend them there.

Failure mode: re-rolling card 3 until you like it. You have now selected card 3
on a different basis from cards 1 and 2, and the set no longer holds together.

## Video

**Generate the still first, approve it, then animate it.** Iterating in video
costs several times more per attempt and gives less control over composition.
Approve a frame you would ship, then hand it to an image-to-video model.

```
# 1. the frame
node scripts/kie.mjs run "google/nano-banana" '{"prompt":"...","aspect_ratio":"9:16"}'

# 2. animate it (result URLs stay valid ~14 days, so pass one straight through)
node scripts/kie.mjs start "kling/v2-1-master-image-to-video" \
  '{"prompt":"slow push in, she looks up and smiles","image_url":"<url from step 1>"}'
node scripts/kie.mjs poll <taskId> --timeout 900
```

Text-to-video direct when there is no frame to anchor: `veo-3-1` for quality
(1080p/4K, native audio, `duration` 4/6/8, **16:9 or 9:16 only**),
`bytedance/v1-lite-text-to-video` for cheap iteration.

Use `start` + `poll`, not `run`, and raise the timeout. Video routinely exceeds
five minutes and a blocking call will look hung.

Failure mode: prompting a multi-beat story into five seconds. One action per
clip, and front-load the arresting moment. A paid-social hook is decided in the
first second or two, so do not build to it.

## UGC and AI-UGC

UGC works because it does **not** look produced. The prompt vocabulary is the
opposite of the static one: no editorial lighting, no 85mm, no seamless backdrop.

Prompt for the artefacts of a real phone: front-facing camera, handheld with
slight motion, available indoor light, slightly off-centre framing, a real
domestic background with clutter in it, no colour grade.

```
'{"prompt":"a woman in her thirties filming herself at arm'\''s length in a
  kitchen, front-facing phone camera, handheld, available window light,
  slightly off-centre framing, lived-in background, no colour grade,
  candid expression mid-sentence","aspect_ratio":"9:16"}'
```

The tell that kills it is polish. If the result looks lit, it reads as an ad and
the format's entire advantage is gone. Check for that specifically before
approving, because models drift toward attractive lighting by default.

**AI-UGC (talking head).** Kie has avatar and lip-sync models whose ids are
confirmed but whose parameters this repo has not verified: `kling/ai-avatar-pro`,
`kling/ai-avatar-standard`, `omnihuman-1-5`, `infinitalk/from-audio`,
`volcengine/video-to-video-lip-sync`. Fetch the model's page (append `.md` to its
docs.kie.ai URL) before the first use rather than guessing the input shape.

Pair with a voiceover from `elevenlabs/text-to-speech-multilingual-v2` when the
model takes an audio input.

Failure mode: putting the script on screen as text. In UGC the words are spoken;
the Ads Manager copy fields carry the written version.

## All four

Whatever the format, the matrix rule from SKILL.md still governs: within a row,
one clause changes and everything else is byte-identical. Format is a property of
the row, never a variable inside it. A row that mixes a static and a video is not
a test of anything.
