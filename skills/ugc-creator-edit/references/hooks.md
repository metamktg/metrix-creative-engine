# Hooks

The opening must give the intended viewer a reason to continue. Its effect is
a hypothesis until campaign evidence measures it. The engine checks part of the
mechanical presentation: opening text timing (`check-storyboard`), the poster
frame and exact `copy_architecture.hook` where the brief puts it on screen. This
file covers the other half: what a hook is made of, how to write the spoken and
visual opening that carries it, and how to test and log hooks so the library
compounds instead of resetting every campaign. Editing and opening-text rules sit
in `docs/UGC_CREATIVE_PLAYBOOK.md`; where they overlap, the playbook governs.

## 1. A hook has three layers, written together

Specify **text on screen**, **the first thing we see** and **the first thing we
hear** together. Captions may faithfully repeat speech for accessibility; an
additional headline needs a distinct communication purpose and must not compete
with those captions. Create variants only when authorized. An exact locked
opening permits visual and delivery treatment, not substitute words.

| Layer | Owner | Rule |
| --- | --- | --- |
| Text on screen | The brief, set in post | One primary opening message: the brief's hook or a deliberately chosen headline. The assembly storyboard check fails a hook scene with no text, so no opening text is not an option today. No large headline plate stacked on full captions that say a competing hook. Readable early, never over the face |
| First thing we see | The still and the base prompt | Already in motion: mid-sentence, product already in hand, action under way at frame one. "No lead-in" removes the slow push-in the model gives by default. When the brief calls for direct address, the creator addresses the camera; do not replace the hook with random activity |
| First thing we hear | Line one of the delivery map | Starts on the point, no greeting; a verbal cold open ("okay, wait", a flat claim) carries energy without speed |

## 2. Twelve patterns

Formats, not scripts. The nearest codes below are historical references, not
authority to assign one. Use only a supplied code confirmed by the current IAP
registry; the upstream brief owns code selection. A pattern can be described in
plain words when no canonical code was provided.

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

Mid-sentence and in-action treatments are options when the message and source
permit them. They have no universal performance advantage established here.

**A time-bound, mistake or comparison hook spoken by a synthetic presenter is a
fabricated experience.** Those patterns belong to a real creator's or customer's
substantiated account, or to a demonstrator framing that reports no personal
result ("people tell us their [X] kept doing [thing]" needs evidence too). The
script check fails a fixed set of first-person phrasings for a synthetic presenter:
past or ongoing use, a purchase, a personal result, elapsed time, and the example
wording of the mistake, comparison, confession and time-bound rows above. A
paraphrase can pass the check, so keeping fabricated experience out of a synthetic
presenter's script remains a review decision.

## 3. Writing the spoken hook

- Earn the opening seconds with a line that contradicts what the viewer
  assumes, names their situation exactly, or promises a specific supported payoff.
- Earn attention in the opening seconds, then let the full thought land at a
  natural measured pace. A three-second attention window is not a maximum
  spoken-line length. Word-rate estimates never override exact copy.
- Keep supported specificity. Urgency, superlatives, numbers and comparison
  claims need evidence; provider pronunciation aliases stay separate from the
  canonical words. Avoid generic stock hooks unless the brief deliberately
  requires one.
- The brief may lock the exact opening (`spoken_opening_locked`). Then the
  hook work is delivery, not wording: intent, emphasis, pause, gaze.
- The body must pay off the premise. In a hook-only test preserve the fixed
  body and CTA; changing the on-ramp or later argument is another declared
  variable, not an isolated opening test.

For each authorized candidate record the exact words, audience tension,
supporting evidence, speaker credibility, first-frame/verbal relationship,
visual feasibility, promised payoff and a reasoned selection or rejection.
Scores, if used, are editorial judgments rather than predicted CTR or virality.
Store the selected treatment in the private preproduction record and link the
canonical script line. Route substantive copy changes to existing copy owners.

## 4. Testing hooks without paying for whole ads

Hold everything constant and change only the opening.

Reuse an accepted body when the comparison genuinely holds it fixed. Make only
the number of variants authorized, with durations determined by accepted natural
speech and source handles. Test treatment with text/frame preparation first;
generate a new performance only for a named gap inside the approved budget.

- Same identity still, same product reference, same look clause, same duration,
  same seed where one exists. Only the hook action and line change.
- Reject technical or brief failures before expansion; do not select a visual
  winner and represent taste as observed campaign performance.
- Judge muted, on a phone, before any media spend. Internal preference removes
  the broken; it does not pick the winner.
- Measure three-second retention and hook rate first; they move faster and need
  less volume than conversion. Do not call a winner on a day of data, and state
  hook choices as hypotheses until campaign evidence says otherwise.
- Inside a live matrix this is the row: the hook is the declared slot and
  `make-row.mjs` builds the cells; the timing never changes across cells.

## 5. The library is the asset

Log each authorized hook with its source, treatment, tested context, actual
campaign result when available and limitations. A few rounds do not establish a
universal best pattern; missing outcomes remain unmeasured.

```
Pattern         Line / first action                          3s-ret   Hook rate   Verdict
mid-sentence    "...so the setup's already done"     0.61     0.38        keep
problem         "doing this again at ten at night"   0.56     0.33        keep
direct-question "does your setup take all night"     0.47     0.27        drop
slow-push-in    presenter on screen, camera pushes   0.29     0.15        the default, beaten
```

(Illustrative placeholder numbers, not measurements.) Diagnose actual fatigue
and the failed variable before choosing a refresh. An accepted body may reduce
new production work, but cost and effectiveness depend on the authorized case.

## 6. Do not

- Render hooks inside a long clip while iterating.
- Accept the slow push-in; prompt "no lead-in" explicitly.
- Change more than the hook between variants.
- Let a synthetic presenter claim time, purchase or results.
- Discard the log.
- Call an effect viral or a hook proven without delivery evidence.
