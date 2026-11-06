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
- **Use the speaker's natural register.** Contractions often help, but formal
  wording or exact approved copy can be appropriate. No filler quota makes a
  performance conversational.
- **Start on the point.** No greeting, no self-introduction, no "in this video".
  The first words are the hook.
- **Short sentences, one idea each.** Long clauses lose the listener and the
  lip sync.
- **Plan how numbers are pronounced.** Authorized new spoken copy can spell
  them as spoken words. Preserve exact canonical locked wording and keep any
  synthesis alias in the documented pronunciation/voice settings contract.
- **Specific over vague.** "Took about ten seconds" beats "works really well".
  Test: could this sentence sit in a competitor's script with the name swapped?
  If yes, it says nothing.
- **One brand mention is usually enough.** Two at most.
- **Use a reservation only when relevant and supported.** A limitation is a
  factual claim, not a mandatory realism device. Never invent a downside.
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
disclosure label does not cure a fabricated experience claim. For a synthetic
identity the check fails a fixed set of first-person experience phrasings (use,
purchase, personal result, elapsed time, and the mistake, comparison and
confession openers in `hooks.md`). Other wording can pass it, so the rest is a
review decision.

## 3. Length is a budget decision

Use the existing 2.4 words-per-second default only as a labeled planning estimate
until an actual complete read exists. Pace varies by speaker, content and
pauses. Declare the duration mode
before writing, from the latest instruction: **exact** (the read lands within
about 1.5 s of the target), **maximum** (a ceiling, never a slot to fill), or an
approved **range**. Cut setup and repeated explanation before extending, and
never speed the speech to fit. The mode governs this script check only. The
assembly storyboard check compares the brief's `duration_seconds` with the
storyboard and fails a difference above 0.5 s, so a brief whose number is a
ceiling must be updated to the cut's real length before assembly.

| Duration | Words at 2.4 wps | Fits |
| --- | --- | --- |
| 8 s | about 19 | one claim or a hook |
| 12 s | about 29 | hook plus one point |
| 15 s | about 36 | problem, then solution |
| 20 s | about 48 | three tight beats |
| 30 s | about 72 | a full short ad |

Pauses are part of the length. Record intended pauses in the delivery map, then
replace provisional timing with the measured accepted audio and purposeful
reading holds. Do not pad with dead air or report an estimate as a measured read.

Only face beats need dependent lip sync. A line carried by B-roll can use the
same accepted voice without new speaking motion. Plan coverage from the thought,
actual supported duration and usable source; ten seconds is a review warning,
not a universal point where sync or attention fails.

## 4. The shape

```
0 to 3 s    HOOK        the specific problem or claim, mid-thought, no warm-up
3 to 6 s    STAKES      why it matters to this person
6 to 12 s   SUBSTANCE   what it does, in plain words, shown while said
12 to 16 s  PROOF       a specific, a demonstration, a sourced number as words
16 to 18 s  ACTION      one thing to do, casually
```

A starting shape, not a three-second complete-hook limit. A long exact opener
can earn attention early and finish naturally later. The brief's `copy_architecture` decides the words that are
locked (hook, CTA, any `spoken_opening_locked`); the map decides how they are
said. Aim for two things the audience must understand, decided before writing: with
five messages the viewer takes none. The check warns on any other count and
treats that as guidance, not a required number. Remove a second hook metaphor late in the
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
      "intent": "clarify the supported steps without claiming personal experience",
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
| `locked`, `lock_source` | The brief fixed these exact words, and where | Complete approved `spoken_script` covers exact lines. An explicit `lock_source` must equal the whole named source field, never a substring. The text checker accepts the canonical copy, or the declared pronunciation alias applied to it, plus whitespace normalization. The preproduction guard compares canonical copy only, so keep each line canonical and put the synthesis alias in `pronunciation_map` |
| `intent` | The thought behind the line, in plain words | Required; "sell it" is not an intent |
| `emotion` | `calm`, `warm`, `curious`, `wry`, `surprised`, `reassuring`, `matter_of_fact`, `concerned`, `pleased`, `deadpan` | One per line; affect that matches the words, never frantic or fixed |
| `intensity` | 1 understated, 2 clear, 3 strong | Sustained intensity is a review warning, not proof of a failed natural performance |
| `energy` | 0 to 4, intended pace and lift | Select for the thought; a composed neutral baseline is valid |
| `emphasis` | The one word or short phrase that carries the line | Must appear in `text`; at most one per line; selective, not every benefit |
| `breath_opportunity` | A thought-group end where a breath is comfortable | A phrasing note. It never asks for a breath sound to be added |
| `pause_after` | Silence in seconds after the line | 0 up to about 3; a negative or non-finite value fails, above 3 warns |
| `gaze` | `lens`, `product`, `work`, `away_then_back` | Follow the thought and task; comfortable sustained direct address can be appropriate |
| `gesture` | `none`, `hold_product`, `turn_product`, `glance_to_screen`, `nod`, `hands_rest`, `small_laugh`, `push_hair` | At most one feasible action per line; no required friction, laugh or hair-touch beat |
| `on_camera` | Whether the face carries this line | Off-camera lines are the same recording event: same voice, same room |
| `cutaway_after` | What the picture cuts to | Plan it here, not in the edit |

The guarded approved-voice preflight additionally requires nonempty
`viewer_thought`, `emotion_entry`, `emotion_exit` and `observable_behavior` on
every line. Retain `intent` as the action toward the viewer, rather than creating
a competing intention field. Describe one credible cue and an optional change
in feeling; neutral/unchanged affect is valid. These are planned direction,
separate from delivered observation and review evidence. `check_script.py`
alone checks the legacy delivery-map shape; the separate preflight enforces
this complete production handoff. A line needing visible proof can set
`proof_required: true` and link its source/limits through the packet.

A run that also keeps the playbook's creative profile
(`examples/ugc-production/creative-profile.example.json`) holds one copy of the
line direction: `script.json`. The profile's `copy.line_direction` then carries
the file path and hash instead of a second set of values. Field map when a
profile entry is needed: `line_id` is `id`, `spoken_text` is `text`,
`selective_emphasis` is `emphasis`, `pause_and_breath_opportunities` is
`pause_after` plus `breath_opportunity`, `gaze_gesture_and_posture` is `gaze`
plus `gesture`, and `intent` and `emotion` carry over unchanged.

### Direction rules the map enforces

- **Let energy follow the argument.** A neutral or calm explanation can remain
  steady. Change intensity only for a real turn in thought; do not decorate
  every line with enthusiasm or a forced dry aside.
- **Lip-synced lines meet the lens.** A speaking line that will be lip-synced looks
  at the camera with the head level; looking down at a laptop, phone or product
  while talking was rejected after lip-sync spend in a recorded run, and a work
  prop in a speaking still can render a brand logo. Gaze at the product or the
  work belongs to non-speaking B-roll.
- **State the eye state; do not choreograph blinks.** Name the steady state in
  positive words: "her eyes stay open and on the camera the whole time with only
  quick normal blinks; her head stays level with small natural movement". That
  wording was the repair that worked after a take with no eye direction closed its
  eyes five times; "natural blinks" alone did not. Never script blink timing,
  winks or eye movements: a requested wink rendered as a both-eye blink. Even an
  accepted take closes its eyes mid-line, so inspect a 0.04 s eye sheet of every
  speaking span before paying for lip sync and plan cuts around closures.
- **Mood reads rested.** Direct "bright alert eyes, rested and energetic". Never
  "tired", "late night", "exhausted" or a yawn anywhere in the direction, even as
  the situation the line describes: a presenter generated from that wording read
  as tired and was dropped before use.
- **Expression matches the line.** A neutral explanation is "calm, sincere,
  matter-of-fact; her mouth moves only as much as speaking needs and closes
  between phrases; no smiling while she talks". "Warm, relaxed, friendly, small
  smile between phrases" produced a grin that shipped and was replaced. A knowing
  look after a line works as "closes her lips into a slow, knowing half-smile".
- **No friction beat is required.** Preserve genuine behavior when useful;
  do not script a stumble, hair touch or fake recording error as proof of humanity.
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
| Text-only speech operation | Canonical words or documented synthesis aliases; omit unsupported direction fields. Actual listening determines suitability |
| Operation with documented direction/tags | Translate intent, affect and emphasis only into supported controls. Verify tags are not spoken; settings are voice/model-specific |
| Native-audio video operation | Exact speech and supported identity/performance controls under a separately qualified route. It cannot inherit standalone full-voice acceptance or bypass an approved-audio requirement |

Voice choice is part of casting (`casting.md`): audition only relevant candidates
when selection is unresolved, listen, choose by actual presenter/scene fit, then
keep that voice and those settings for retakes. Never substitute an old audition
for the accepted dry read. Filters, de-essing, denoising and level automation are
for a diagnosed defect only, compared with the dry audio at matched loudness.
After any change to the voice chain, run speech recognition against the locked
script (`metrix-video-assembly/scripts/phrase-map.mjs <voice> --script <script>`):
a de-esser added for polish turned "Spend" into "Send" in a recorded run, and only
the script check caught it. Recognition agreement is not a listening pass.

## 7. The recording perspective is declared once

Decide, before the voice is generated, where the microphone is: a phone propped
at arm's length on a desk, a close-mic podcast setup, a laptop in a kitchen.
Write it into `render_spec.json` as `recording_perspective` with distance, room
and processing. The voice, the identity still and the performance prompt must
agree with it. Off-camera narration keeps the same perspective; a picture change
is not a new recording event.

Any acoustic placement applied in post (room impulse, band limiting, room tone)
is a repair that someone listens to before it ships. Added noise sources (hiss,
hum, generated room tone) are the manufactured realism section 5 rejects unless
that listening pass accepts them, and never sit before an automatic gain stage:
gain that lifts the pauses raises the noise between phrases, which was heard as a
breath in a recorded run. Nothing but the voice starts in the 0.25 s before a
phrase onset (`check-storyboard.mjs <run>/storyboard.json --brief <run>/brief.json
--phrases <phrases.json>`). A phone-in-a-kitchen chain
built and delivered without a listening pass is exactly what the standard
forbids, and an unheard mix is never reported as reviewed.

## 8. Run the check

```
python skills/ugc-creator-edit/scripts/check_script.py <run>/script.json --brief <run>/brief.json [--kit brand-kit.json] [--transcript heard.txt]
python skills/ugc-creator-edit/scripts/check_script.py <run>/script.json --print-spoken
```

The report is JSON: `verdict` (`PASS` or `FAIL`), `fails`, `warns`, `results` (one `rule`, `verdict`
and `detail` each), `estimate_seconds`, `words`, `scope` (always `text_and_structure_only`) and
`listening_acceptance` (always `not_assessed`). `--print-spoken` prints the spoken text with pause
marks and exits 0, which is the exact string to give a voice route. The exit code is 1 on any FAIL and 0
otherwise; a WARN never fails the run.

Exit 1 on structural, source-lock or claim FAIL results: malformed fields,
direction/tags inside spoken text, synthetic personal-experience patterns,
changed locked or full approved script, missing emphasis text, unknown enum
values, kit-forbidden claims and required transcript mismatch. Case and
punctuation are retained for source-lock checks. A line may equal the approved copy
or the copy with the declared pronunciation aliases applied, then whitespace is
normalized; the guard accepts the canonical form only. Transcript comparison is
separate ASR evidence, not clearance to modify canonical copy.

Style and planning heuristics produce WARN results: greetings or stock hooks,
digits, unusual estimated rate, sustained intensity, estimated duration fit,
message-count convention, no contractions/reservation, long face beats, constant
lens gaze, marketing/stage-noise words and repeated brand mentions. Review the
actual brief and performance instead of silently rewriting exact copy to make
a heuristic green. Warnings alone do not authorize unsupported claims.

The check reads words and structure. It cannot hear a take. Human listening of
the full dry voice before dependent lip sync stays mandatory. Bind exact script,
identity, voice/settings, scene and accepted audio through the preproduction
packet; structural PASS does not establish perceptual acceptance.
