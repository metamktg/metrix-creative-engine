# Hooks

Almost all performance variance in short-form sits in the first three seconds,
and the first second is judged with the sound off. The engine already enforces
the mechanical half: the hook line is on screen by 1.0 s (`check-storyboard`),
frame 0 is the poster, and the hook is `copy_architecture.hook` verbatim. This
file covers the other half: what a hook is made of, how to write the spoken and
visual opening that carries it, and how to test and log hooks so the library
compounds instead of resetting every campaign. Editing and opening-text rules sit
in `docs/UGC_CREATIVE_PLAYBOOK.md`; where they overlap, the playbook governs.

## 1. A hook has three layers, written together

Every hook version is specified as **text on screen**, **the first thing we
see** and **the first thing we hear**. The three can disagree, and when they do
the weakest one wins. They must also not duplicate: a caption that repeats the
spoken line that describes the visual is one hook doing one job three times. Give
each layer different work, and write hook variants as a set (one per audience
segment and motivation) so the test covers different reasons to stop, not one
reason three ways.

| Layer | Owner | Rule |
| --- | --- | --- |
| Text on screen | The brief, set in post | One primary opening message: the brief's hook, a deliberately chosen headline, or none. No large headline plate stacked on full captions that say a competing hook. Readable early, never over the face |
| First thing we see | The still and the base prompt | Already in motion: mid-sentence, product already in hand, action under way at frame one. "No lead-in" removes the slow push-in the model gives by default. When the brief calls for direct address, the creator addresses the camera; do not replace the hook with random activity |
| First thing we hear | Line one of the delivery map | Starts on the point, no greeting; a verbal cold open ("okay, wait", a flat claim) carries energy without speed |

## 2. Twelve patterns

Formats, not scripts. Map each to the copywriting-core `HK_` code so the brief
and the test records share a vocabulary.

| Pattern | Opening | Why it works | Nearest `HK_` code |
| --- | --- | --- | --- |
| Mid-sentence | Already talking, no greeting | No dead frames, feels overheard | HK_Story |
| Problem stated | "My [X] kept doing [specific thing]" | Recognition | HK_Problem |
| Result first | Shows the outcome, then "here's how" | Payoff promised at once | HK_Benefit |
| Contrarian | "Everyone says [X]. That's wrong" | Curiosity, mild conflict | HK_Shock |
| Mistake | "I was doing this completely wrong" | Self-deprecation disarms (real people only) | HK_Curiosity |
| Specific number | "Forty dollars and ten minutes" | Concreteness is credible; sourced numbers only | HK_Stat |
| Direct question | "Does anyone else's [X] do this?" | Invites identification | HK_Question |
| Warning | "Don't buy [category] until you check this" | Loss aversion | HK_Shock |
| Comparison | "I tried three. One worked" | Implies effort and honesty; only with real comparison evidence | HK_Benefit |
| Confession | "I didn't think this would work" | Scepticism first is persuasive | HK_Story |
| In-action | Already doing the thing, no setup | Motion holds the eye | HK_Story |
| Time-bound | "Three weeks in, here's what happened" | Implies real use. **Real people only** | HK_Story |

Mid-sentence and in-action are the two most reliable and the most under-used,
because the model's default is an establishing shot with a lead-in.

**A time-bound, mistake or comparison hook spoken by a synthetic presenter is a
fabricated experience.** Those patterns belong to a real creator's or customer's
substantiated account, or to a demonstrator framing that reports no personal
result ("people tell us their [X] kept doing [thing]" needs evidence too). The
script check fails first-person experience claims for a synthetic presenter
whatever the pattern.

## 3. Writing the spoken hook

- Earn the first two seconds with a line that contradicts what the viewer
  assumes, names their situation exactly, or promises a specific supported payoff.
- Keep it under about twelve words so it is said inside three seconds at
  conversational pace.
- No urgency words, no superlatives, no digits (write numbers as words), no
  stock hooks ("POV:", "stop scrolling").
- The brief may lock the exact opening (`spoken_opening_locked`). Then the
  hook work is delivery, not wording: intent, emphasis, pause, gaze.
- Seconds three to fifteen must extend the hook's premise. Every hook test
  rewrites the on-ramp, not only the opening line.

## 4. Testing hooks without paying for whole ads

Hold everything constant and change only the opening.

```
one accepted body      (full quality, the constant)
six to eight hooks     (standalone 4 s drafts, cheapest model that holds the identity)
= six to eight testable creatives for a fraction of six full renders
```

- Same identity still, same product reference, same look clause, same duration,
  same seed where one exists. Only the hook action and line change.
- Draft the variants; enhance only the two best and cut each onto the same body.
- Judge muted, on a phone, before any media spend. Internal preference removes
  the broken; it does not pick the winner.
- Measure three-second retention and hook rate first; they move faster and need
  less volume than conversion. Do not call a winner on a day of data, and state
  hook choices as hypotheses until campaign evidence says otherwise.
- Inside a live matrix this is the row: the hook is the declared slot and
  `make-row.mjs` builds the cells; the timing never changes across cells.

## 5. The library is the asset

Log every hook with its result, in the run's records and in the account's
hook log. After three rounds the log says which patterns work for this product,
which is reusable across every later campaign.

```
Pattern         Line / first action                          3s-ret   Hook rate   Verdict
mid-sentence    "...so the setup's already done"     0.61     0.38        keep
problem         "doing this again at ten at night"   0.56     0.33        keep
direct-question "does your setup take all night"     0.47     0.27        drop
slow-push-in    presenter on screen, camera pushes   0.29     0.15        the default, beaten
```

(Illustrative placeholder numbers, not measurements.) Fatigue shows up as hook
fatigue first. Fresh hooks on a proven body are the cheapest way to extend a
creative's life, far cheaper than a new concept. The order to refresh: hook, then
presenter, then format, then concept.

## 6. Do not

- Render hooks inside a long clip while iterating.
- Accept the slow push-in; prompt "no lead-in" explicitly.
- Change more than the hook between variants.
- Let a synthetic presenter claim time, purchase or results.
- Discard the log.
- Call an effect viral or a hook proven without delivery evidence.
