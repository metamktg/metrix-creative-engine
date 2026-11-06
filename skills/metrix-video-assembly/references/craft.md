# Craft

The story, reading and sound rules for a paid social video. Adapted from the
`brag` launch-video skill (MIT, Shunit Haviv Hakimi, github.com/latent-spaces/brag),
whose rules were written for a launch video posted with the sound on. Here they
are rewritten for an ad that is mostly watched muted, in a feed, by someone who
did not ask to see it.

## Contents

1. The shape
2. The hook
3. What to show, in order of preference
4. Reading time
5. Grounding: what may be invented and what may not
6. Make it move
7. Tone
8. Transitions
9. Sound
10. The poster

## 1. The shape

```
Hook (0 to ~2s) -> Show (1 to 3 beats) -> Proof (optional) -> CTA end card (>= 1.5s)
```

A starting shape, not a template. A 6 second bumper is hook plus CTA. A 15
second ad has room for two show beats and a proof line. Over 20 seconds needs a
reason in the plan; extra seconds add spend, not signal, and a hook test is
decided in the opening.

| Length | Scenes | Typical split |
| --- | --- | --- |
| 6s | 2 to 3 | hook 2, show 2, CTA 2 |
| 10s | 3 to 4 | hook 2, show 3 to 4, CTA 2 to 2.5 |
| 15s | 4 to 5 | hook 2, show 3 + 3, proof 2.5, CTA 2.5 to 3 |
| 20 to 30s | 5 to 7 | add show beats, not longer holds |

## 2. The hook

The first second decides whether anyone keeps watching, and it decides it with
the sound off. So:

- The hook line is on screen and readable by 1.0s. A hook that fades in from
  nothing loses that second; set it with `data-enter="none"` or a fast slam
  (0.2 to 0.3s).
- The hook is `copy_architecture.hook`, verbatim. The brief tested or chose it;
  rewording it here changes the variable.
- Something moves in the first second as well: the product, a hand, a push-in.
  A static first second reads as a static ad that happens to be a video.
- Frame 0 is the thumbnail and the first impression. Plan it as a still.

## 3. What to show, in order of preference

1. **The product in use.** Entry, key action, result: the print unboxed and
   hung, the app screen tapped and the answer appearing. The product doing its
   job beats the product describing its job.
2. **The real product, beautifully.** The kit's own photography or the
   client's footage, given motion (`data-ken` push-in, a parallax layer).
3. **A real UI element or product detail**, recreated faithfully from the
   source: the card, the label, the screen.
4. **The concept animated**, grounded in the actual idea.
5. **Type alone**, when the copy is the idea. Large, few words, held.

Never abstract filler: colour washes, particles, generic shapes, stock
"technology" motion. Any frame should be one you could run as a static.

When a stat card or a headline block appears, it frames the product; it does
not replace it. One per ad.

## 4. Reading time

Pace comes from motion and cuts, never from pulling text before it is read.

- A short label (3 words or fewer): 0.8s settled.
- A line: 0.3s per word, at least 1.2s settled.
- The CTA: at least 1.5s settled.

"Settled" means fully entered and not yet leaving. A line may slam in fast and
then hold; fast-in plus a real hold reads as punchy and legible. Fast-in then
gone reads as nothing.

Two failures to design out:

- **Too much copy for the scene.** A 3s scene carries two short reads, not five.
  Cut copy or split the scene; never speed it up.
- **Sequential lines on a fast beat.** At 110+ BPM beats land about 0.5s apart,
  too fast for readable lines. Reveal text on every other beat, or bring the
  set in quickly and hold it. Non-text accents (a glow, a tick) may hit every beat.

Type size: at least 3% of frame width (32px on a 1080 frame) for anything read,
larger for the hook. A feed thumbnail is small.

## 5. Grounding: what may be invented and what may not

The line is between what the ad *asserts* and how it *says* it.

**Must be sourced.** Names, numbers, prices, offers, capabilities, ratings,
quotes, anything presented as a fact about the product or the brand. It comes
from the brief's `copy_architecture` or the kit's verified fields, and the
storyboard names which (`"source": "copy_architecture.proof"`). Re-cased or
split across lines is fine; reworded is not.

**Free to invent** (`"source": "framing"`). Connective craft that asserts
nothing: "Wait for it.", "Here's the part you'll like." It may not contain a
number, a price, a percentage or a superlative; the check enforces that,
because a framing line that slips in "loved by thousands" is an unsourced claim
wearing a costume.

When a line you want is not sourced, the fix is to quote what the brief or kit
does say. If the claim you need is not in either, that is a brief gap; say so.

## 6. Make it move

Things that appear one by one, a simulated tap, a swipe, a counter running up
to a sourced number, a product turning: these make the ad feel alive. Plan them
in the storyboard explicitly ("three prints slide in one by one, card sound on
the first and last"), because an unplanned sequence becomes a slide.

Generated clips carry one action each (`prompts/formats/video.md`). The
composition carries the sequence.

## 7. Tone

Take tone from the brief's `voice` and its `TN_` code, refined by the kit's
brand voice. Presets are defaults, not limits.

| Brief tone | Preset | Scenes per 15s | Type | Transitions | Sound |
| --- | --- | --- | --- | --- | --- |
| `TN_Playful` | playful | 4 to 5 | mixed case, comfortable weight | dip, pop entrances | moderate: 3 to 5 cues |
| `TN_Rational` | feature | 4 to 5 | title case, medium, clean | slide, wipe | light, consistent per beat |
| `TN_Emotional` | polished | 3 to 4, long holds | light to medium, generous tracking | slow dip (0.6 to 0.8s) | minimal, 2 to 3 soft cues |
| `TN_Aspirational` | cinematic | 3 to 5 | large, full-bleed | zoom, slow dip | 2 to 3 big moments |
| `TN_Assertive` | punchy | 5 to 7, some under 2s | heavy, caps allowed | hard cut, slam | dense, on the beat |
| freeform "deadpan" | deadpan | 3 | sparse, lots of space | slow dip or cut | one quiet bed, 1 to 2 dry cues |

Humour comes from the product's own truth, never from trying to be funny.

## 8. Transitions

`data-trans-in` / `data-trans-out` on each scene: `cut`, `dip` (default), `fade`,
`slide`, `zoom`. Entrances: 0.2 to 0.45s. A plain crossfade between two busy
layouts makes a muddy double exposure; `dip` takes the old scene out before the
new one arrives. Check every cut in the stills (the renderer captures both
sides of each one).

## 9. Sound

Most impressions are muted, so sound never carries the message. For the
listeners, it makes the ad feel finished.

**Mix.** Let the voice, message and approved delivery profile determine the
balance. The renderer provides gain settings, voiceover ducking and a default
-14 LUFS target; these are starting settings, not perceptual acceptance. Set
`audio.lufs`/the QA target from the profile, or preserve an accepted mix with
the renderer's supported no-normalization option. Verify intended music is
audible at ordinary and low levels without overwhelming complete words.
Inspect the selected passage for competing vocals and make its fade/source
offset avoid a transient against the opening word. Listen on phone,
headphones and mono. Do not prescribe one gain or fade duration for every ad.
For creator-led work, apply the UGC finishing and review standard.

**Effects follow motion.** Match the gesture: card sounds for cards, a click for
a tap, a soft impact for a reveal. Fire at the start of the motion (0 to 0.1s
before the first visible frame); a success sound fires when the thing is fully
visible. In a staggered sequence, accent the first and last, not every item.
Fewer cues, better timed. Over a voiced ad the voice wins: no effect starts in
the 0.25 s before a phrase onset, where a slide or whoosh reads as a breath or a
clipped word (`check-storyboard.mjs <storyboard> --brief <brief> --phrases <phrase-map output>`
fails it; grounding is strict, so the brief goes with it).
Move the effect, or drop it.

| Moment | File in `assets/sfx/` |
| --- | --- |
| Major reveal, hard cut | `impact/impactSoft_medium_001.ogg`, `impact/impactSoft_medium_004.ogg` |
| Weightier reveal | `impact/impactSoft_heavy_003.ogg`, `impact/impactWood_medium_001.ogg` |
| CTA or logo payoff | `impact/impactBell_heavy_000.ogg` (once, quiet) |
| Soft accent, label pop | `interface/bong_001.ogg`, `interface/drop_001.ogg`, `interface/drop_002.ogg` |
| Simulated tap | `interface/click_002.ogg`, `interface/click_003.ogg`, `ui/click2.ogg` |
| Hover, very soft | `ui/rollover2.ogg` |
| Card or item sliding in (silent ads, or clear of speech) | `casino/card-slide-1.ogg` |
| Counter or stack | `casino/chips-stack-1.ogg` |
| Typed text | `keyboard/keypress-001..006.wav`, a different file per keystroke |

All CC0; see `assets/sfx/LICENSE.md`.

**Beats.** `scripts/beats.mjs` estimates a beat grid and the strong accents of
any track. Use them to bias, never to dictate:

- A major moment or small accent may use a strong cue when it serves the
  thought and motion. No minimum cue count or universal timing tolerance
  governs the edit.
- Readable text keeps its reading floor even if that means ignoring the grid.
- Listen before locking: the estimate can miss on syncopated or ambient tracks.

## 10. The poster

Frame 0 is what every feed shows before playback and what every thumbnail
grabber takes. Set `poster_at` to the strongest settled frame: usually the hook
fully on screen with the product visible, sometimes the CTA card. The renderer
draws that moment as frame 0 (it lasts one frame, invisible in playback) and
writes it as `<name>.jpg`, which is also the custom thumbnail to upload in Ads
Manager.
