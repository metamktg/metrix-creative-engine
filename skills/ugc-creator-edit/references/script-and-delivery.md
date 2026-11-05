# Script and delivery map

The commonest failure in AI UGC is not the picture. The picture says "a person at
a kitchen table" and the words say "marketing department", and the voice reads
them like a studio announcer who is not in that room. Reviewers describe it as
"too AI produced": delivery that does not match the person's posture, distance
from the microphone or the room they are in. The fix starts at the script,
before any voice or motion is bought.

This file is the checkable core of the creative direction in
`docs/UGC_CREATIVE_PLAYBOOK.md` (also served as `kie://ugc-creative-playbook`).
The playbook holds the negative sheet and the voice, shot and editor blocks; this
file holds the script format and the machine check. Where they overlap the
playbook governs. `scripts/check_script.py` fails the mistakes below that a
reader skips.

## 1. Write for the mouth, not the page

- **Read every line aloud.** If you would not say it to one person across a
  table, rewrite it.
- **Contractions are not optional.** "It's", "here's", "doesn't", "you'll".
  Their absence is the fastest way to sound like a press release read out.
- **Start on the point.** No greeting, no self-introduction, no "in this video".
  The first words are the hook.
- **Short sentences, one idea each.** Long clauses lose the listener and the
  lip sync.
- **Write numbers as spoken words in the script.** "Forty dollars", not "$40".
  The written form belongs on screen and in `pronunciation_map`.
- **Specific over vague.** "Took about ten seconds" beats "works really well".
  Test: could this sentence sit in a competitor's script with the name swapped?
  If yes, it says nothing.
- **One brand mention is usually enough.** Two at most.
- **Include a reservation** where the brief allows one. "It's not cheap", "it
  won't work on varnished wood". A script with no downside reads as an advert,
  and a named limitation is a substantiated statement.
- **Avoid marketing words**: innovative, premium, utilise, in order to,
  additionally, limited time only, life-changing. The check warns on them.
- **Exact means exact.** A tone repair never replaces a locked verb, qualifier,
  offer, destination or condition. If locked copy conflicts with product truth,
  surface that conflict before production; do not rewrite the promise.

## 2. What the presenter can say

A generated person has no experience, so they cannot report any. Decide the
presenter's identity in the casting brief (`casting.md`) and write to it.

| Identity | Can say | Cannot say |
| --- | --- | --- |
| `disclosed_demonstrator` | How it works, what it does, supported claims, "here's what this does" | "I've been using this for three months", "I bought this", "it worked for me", any personal result |
| `disclosed_ai_presenter` | Same as above | Personal experience of any kind |
| `real_creator` | Their own genuine, substantiated experience, with permission | Anything they did not actually experience or that the product cannot support |
| `real_customer` | Their genuine experience, with permission, as they said it | Anything beyond what they actually said |

Write a synthetic presenter's script as a demonstration, not a testimony. A
disclosure label does not cure a fabricated experience claim. The check fails any
first-person experience pattern when the identity is a synthetic one.

## 3. Length is a budget decision

Natural conversational pace is about 2.3 to 2.6 words a second. Plan at 2.4 and
time the read; everyone overestimates what fits. Declare the duration mode
before writing, from the latest instruction: **exact** (the read lands within
about 1.5 s of the target), **maximum** (a ceiling, never a slot to fill), or an
approved **range**. Cut setup and repeated explanation before extending, and
never speed the speech to fit.

| Duration | Words at 2.4 wps | Fits |
| --- | --- | --- |
| 8 s | about 19 | one claim or a hook |
| 12 s | about 29 | hook plus one point |
| 15 s | about 36 | problem, then solution |
| 20 s | about 48 | three tight beats |
| 30 s | about 72 | a full short ad |

Pauses are part of the length. A 45-word script read in about 19 s and met a
25 to 35 s range only with deliberate thought pauses and a short end hold, which
was the right fix. Record pauses in the delivery map so the estimate includes them.

Only face beats pay for lip sync. A line carried by B-roll uses the same voice at
a fraction of the cost, and a talking face held longer than about 8 to 10 s per
beat is where sync drifts and attention leaves. Plan the cutaway while writing.

## 4. The shape

```
0 to 3 s    HOOK        the specific problem or claim, mid-thought, no warm-up
3 to 6 s    STAKES      why it matters to this person
6 to 12 s   SUBSTANCE   what it does, in plain words, shown while said
12 to 16 s  PROOF       a specific, a demonstration, a sourced number as words
16 to 18 s  ACTION      one thing to do, casually
```

A starting shape. The brief's `copy_architecture` decides the words that are
locked (hook, CTA, any `spoken_opening_locked`); the map decides how they are
said. Decide the two things the audience must understand before writing: with
five messages the viewer takes none. Remove a second hook metaphor late in the
ad, filler, and any destination borrowed from the production platform.

## 5. The delivery map

One record per spoken line. Every field exists because a run went wrong without
it. The file is `script.json` beside `render_spec.json`; the storyboard's
`audio.voiceover.script` quotes its text. `text` is the spoken words only.
Direction never goes in it.

```json
{
  "schema_version": 1,
  "brief_id": "REPLACE_WITH_BRIEF_ID",
  "presenter": { "identity": "disclosed_demonstrator", "register": "calm, practical, short sentences, talks to one person" },
  "duration_mode": "range",
  "target_duration_seconds": { "min": 20, "max": 30 },
  "words_per_second": 2.4,
  "pronunciation_map": { "$40": "forty dollars" },
  "key_messages": [
    "Pick the step you need and follow it.",
    "Less back and forth, more time getting it done."
  ],
  "lines": [
    {
      "id": "L1", "role": "hook", "locked": true, "lock_source": "copy_architecture.spoken_opening_locked",
      "text": "Here's the quickest way to get this done on the first try.",
      "intent": "a specific promise to one person, said as a tip, not a pitch",
      "emotion": "warm", "intensity": 1, "energy": 2,
      "emphasis": "quickest way",
      "breath_opportunity": false, "pause_after": 0.6,
      "gaze": "lens", "gesture": "none",
      "on_camera": true, "cutaway_after": null
    },
    {
      "id": "L2", "role": "substance",
      "text": "Open the app, pick the step you need, follow it, then check your work.",
      "intent": "walk them through it like a friend who has done it",
      "emotion": "matter_of_fact", "intensity": 1, "energy": 1,
      "emphasis": "check your work",
      "breath_opportunity": true, "pause_after": 0.3,
      "gaze": "work", "gesture": "glance_to_screen",
      "on_camera": false, "cutaway_after": "real capture of the step"
    }
  ]
}
```

| Field | Meaning | Rule |
| --- | --- | --- |
| `role` | `hook`, `stakes`, `substance`, `proof`, `reservation`, `action`, `bridge` | First line is `hook`, last is `action` |
| `locked`, `lock_source` | The brief fixed these exact words, and where | Text must match the brief verbatim after `pronunciation_map` |
| `intent` | The thought behind the line, in plain words | Required; "sell it" is not an intent |
| `emotion` | `calm`, `warm`, `curious`, `wry`, `surprised`, `reassuring`, `matter_of_fact`, `concerned`, `pleased`, `deadpan` | One per line; affect that matches the words, never frantic or fixed |
| `intensity` | 1 understated, 2 clear, 3 strong | Never 3 on every line |
| `energy` | 0 to 4, the pace and lift of the delivery | Flat baseline with one lift reads human; sustained high energy reads as an ad |
| `emphasis` | The one word or short phrase that carries the line | Must appear in `text`; at most one per line; selective, not every benefit |
| `breath_opportunity` | A thought-group end where a breath is comfortable | A phrasing note. It never asks for a breath sound to be added |
| `pause_after` | Silence in seconds after the line | 0 to 3 |
| `gaze` | `lens`, `product`, `work`, `away_then_back` | Mostly product or work, meet the lens briefly; a locked lens stare for the whole take reads staged |
| `gesture` | `none`, `hold_product`, `turn_product`, `glance_to_screen`, `nod`, `hands_rest`, `small_laugh`, `push_hair` | One per line, none on most lines; one human-friction beat per script at most |
| `on_camera` | Whether the face carries this line | Off-camera lines are the same recording event: same voice, same room |
| `cutaway_after` | What the picture cuts to | Plan it here, not in the edit |

A run that also keeps the playbook's creative profile
(`examples/ugc-production/creative-profile.example.json`) holds one copy of the
line direction: `script.json`. The profile's `copy.line_direction` then carries
the file path and hash instead of a second set of values. Field map when a
profile entry is needed: `line_id` is `id`, `spoken_text` is `text`,
`selective_emphasis` is `emphasis`, `pause_and_breath_opportunities` is
`pause_after` plus `breath_opportunity`, `gaze_gesture_and_posture` is `gaze`
plus `gesture`, and `intent` and `emotion` carry over unchanged.

### Direction rules the map enforces

- **Vary the energy; do not sustain it.** Give the take a flat, offhand baseline
  and let one moment carry a genuine reaction. A dry aside beats four enthusiastic
  lines. Deadpan is valid and under-used.
- **Gaze follows the thought.** Look at the product or the work while explaining,
  meet the lens on the promise and the action. Do not write blink instructions
  into short clips; they render as darting eyes.
- **One friction beat at most**: a small false start, pushing hair back, a quick
  "is this recording" glance. Never a fumble with the product, and never stacked
  with a camera move inside a short clip.
- **One grip or weight cue** when a product is in hand: "turns it in her hand,
  pauses when the light catches the label, shifts her grip". Never "rotates slowly
  to catch the light", which is the motorised-turntable recipe.
- **No manufactured humanity.** Direct the thought behind each line and let
  believable delivery follow. Do not insert stumbles, pasted breaths, random gain
  jitter, hiss or exaggerated expressions to simulate realism. Genuine breathing
  and variation the voice produces is kept; an added one is a defect. The check
  warns on stage noise ("um", "sigh", "exhale") in the text.
- **Extremes sync badly.** Whispers, shouts and heavy emotion produce worse lip
  sync than level delivery. Keep intensity 3 for one line, if any.
- **Reject** announcer projection, a forced pitch jump on the hook, identical
  clause attacks, unlimited-breath run-ons and chopped word tails
  (the playbook's delivery and phrasing rows).

## 6. From the map to the voice model

The map is provider-neutral. Translate it once per provider and keep the
translation in `render_spec.json` so a retake uses the same direction.

**Direction is not spoken text.** Put it in a field the provider documents for
direction (a style string, a prompt). Use an inline tag only where the model page
documents that tag as non-spoken syntax, and confirm from a transcript of the
result that nothing was read aloud. Never add a breath, sigh or filler tag: those
are the manufactured humanity the playbook rejects. Pauses are sentence breaks or
a documented pause tag.

| Provider route | How the map reaches it |
| --- | --- |
| ElevenLabs multilingual v2 on Kie | Text only. Starting points to set in the run profile and confirm by listening, not defaults: lower stability to reduce monotone, similarity near the default, a little style for personality, speed 1.0. Never a maximum-stability setting: that is the monotone robot tell |
| ElevenLabs v3 or text-to-dialogue on Kie | Documented emotion tags built from the line's `emotion`, one per line at most; emphasis as a short sentence of its own |
| Gemini TTS on Kie | A per-turn `style` string built from the presenter register plus the line's `intent` and `emotion`. This route produced an accepted voice on 2026-11-02 when both ElevenLabs routes timed out upstream |
| Native-audio video models | The line text in the model's dialogue syntax (see `lip-sync-routing.md`); emotion as one bold modifier ("warm voice"), never a paragraph of acting notes |

Voice choice is part of casting (`casting.md`): audition three candidates on the
first two lines, listen, pick by fit to the presenter and the room, then keep
that voice and those settings for every retake. Never substitute an old audition
for the accepted dry read. Filters, de-essing, denoising and level automation are
for a diagnosed defect only, compared with the dry audio at matched loudness.

## 7. The recording perspective is declared once

Decide, before the voice is generated, where the microphone is: a phone propped
at arm's length on a desk, a close-mic podcast setup, a laptop in a kitchen.
Write it into `render_spec.json` as `recording_perspective` with distance, room
and processing. The voice, the identity still and the performance prompt must
agree with it. Off-camera narration keeps the same perspective; a picture change
is not a new recording event.

Any acoustic placement applied in post (room impulse, band limiting, room tone)
is a repair that someone listens to before it ships. A phone-in-a-kitchen chain
built and delivered without a listening pass is exactly what the standard
forbids, and an unheard mix is never reported as reviewed.

## 8. Run the check

```
python skills/ugc-creator-edit/scripts/check_script.py <run>/script.json --brief <run>/brief.json [--kit brand-kit.json] [--transcript heard.txt]
```

Exit 1 on any FAIL: a greeting or meta opener, a stock hook phrase, digits or
currency symbols, direction or tags inside the spoken text, first-person
experience from a synthetic presenter, a locked line that drifted from the
brief, an emphasis word not in its line, every line at intensity 3, a duration
outside its mode, an unknown emotion, gaze or gesture value, a kit-forbidden
claim, a `key_messages` list that is not exactly two, and (with `--transcript`)
a hook, action or locked line not heard verbatim. WARN is for a reader: no
contractions, no reservation, a face beat over ten seconds, a lens stare on
every line, marketing words, stage-noise words, more than two brand mentions.

The check reads words and structure. It cannot hear a take. Human listening of
the full dry voice before any lip-sync spend stays mandatory.
