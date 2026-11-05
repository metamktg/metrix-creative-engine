# storyboard.json

The contract between the plan, the composition and the checks. Times are
absolute seconds on the ad's timeline. Paths are relative to the storyboard's
folder unless absolute.

```json
{
  "name": "skyline-print-gift-hook-4x5",
  "brief_id": "VID-001",
  "format": { "ratio": "4:5", "width": 1080, "height": 1350, "fps": 30 },
  "duration": 12,
  "tone": "polished",
  "poster_at": 1.2,
  "scenes": [
    {
      "id": "s1", "role": "hook", "start": 0, "end": 2.5,
      "visual": "Framed print of the street on a living-room wall, slow push-in",
      "text": [
        { "id": "hook", "copy": "Your favorite places, on your wall.", "source": "copy_architecture.hook",
          "in": 0, "out": 2.5, "enter": "none" }
      ]
    },
    {
      "id": "s2", "role": "show", "start": 2.5, "end": 6.5,
      "visual": "Three prints slide in one by one; card sound on the first and last",
      "text": [
        { "id": "show1", "copy": "Pick your street.", "source": "copy_architecture.product_solution",
          "in": 2.7, "out": 6.5, "enter": "rise", "dur": 0.35 }
      ]
    },
    {
      "id": "s3", "role": "cta", "start": 6.5, "end": 12,
      "visual": "Reverse wordmark on the brand dark, CTA button",
      "text": [
        { "id": "cta", "copy": "Shop Prints", "source": "copy_architecture.cta",
          "in": 6.8, "out": 12, "enter": "pop", "dur": 0.35 }
      ]
    }
  ],
  "audio": {
    "music": { "file": "media/bed.mp3", "start": 0, "volume": 0.32, "fade_in": 0.2, "fade_out": 0.8,
               "licence": "client-supplied, licence ref LIC-2026-03" },
    "sfx": [
      { "file": "C:/.../assets/sfx/impact/impactSoft_medium_001.ogg", "at": 2.5, "volume": 0.6 },
      { "file": "C:/.../assets/sfx/interface/drop_001.ogg", "at": 6.8, "volume": 0.55 }
    ],
    "voiceover": null,
    "lufs": -14
  },
  "slot": null
}
```

## Fields

| Field | Meaning |
| --- | --- |
| `name` | Output file stem. Descriptive outside an MST; the MST convention inside one |
| `format.ratio` | `9:16`, `4:5`, `1:1` or `16:9`. Width and height must match it |
| `duration` | Seconds. Must equal the last scene's `end`, and the brief's `duration` when it states one |
| `poster_at` | The moment drawn as frame 0 and written as the poster. Must sit on settled copy |
| `scenes[].role` | `hook` (first scene), `show`, `proof`, `offer`, `cta` (last scene) |
| `scenes[].visual` | What is on screen, in words, and which media file carries it |
| `text[].copy` | Exactly what the composition shows (case may differ through CSS) |
| `text[].source` | A dotted path into the brief (`copy_architecture.hook`), `kit.` plus a path into the brand kit (`kit.identity.positioning_line`), `framing` for connective craft that asserts nothing, or `voiceover` for a caption of a voiced line |
| `text[].label` | `true` for a fixed label that is read once and stays put: a disclosure, a legal line, a source credit, the brand name beside its mark. Labels still need their reading floor, but they do not count against scene density or the stagger rule. Lines sourced from `kit.disclosure` or `kit.identity` are labels automatically |
| `text[].in` / `out` | When the line starts entering and when it is gone |
| `text[].enter` / `dur` | Entrance (`none`, `fade`, `rise`, `slam`, `pop`, `type`, `wipe`) and its length. Settled time is `out - (in + dur)`, or `out - in` for `none` |
| `audio.music` | Bed file, offset into the track (`start`), volume (max 0.5), fades, and the licence it runs under |
| `audio.sfx[]` | Effect file, the time it fires, volume |
| `audio.voiceover` | `{ "file", "at", "volume" }` or null. Requires caption lines |
| `audio.lufs` | Loudness target, default -14 |
| `audio.silence_reason` | Required if there is no music bed |
| `slot` | Inside an MST only: `{ "scene": "s1" }`, the one scene that varies across the row |

The composition mirrors this: each scene is a `section` with the same
`data-scene`, `data-start` and `data-end`; each text item an element with the
same `data-text`, `data-in`, `data-out`, `data-enter` and `data-dur`. The
layout check fails any line whose on-screen text differs from `copy`.

## Creator performance and proof handoff

For creator-led production the current preproduction packet binds canonical
`script.json`, actual accepted full-voice timing, cast/voice/scene and proof
sources before dependent lip sync. Keep this storyboard as the sole composition
timeline. Link scene/shot IDs, exact script lines, accepted audio ranges and
proof sources in `ugc-production.json`; do not maintain a second editable
timeline or add undocumented role values to this contract.

Existing scene roles remain `hook`, `show`, `proof`, `offer`, `cta`. Creator
delivery, UI demonstration, B-roll bridge and feature illustration describe the
source/presentation within that scene, not new role enums. Record initial state,
actual captured action, final state, deliberate change and cut reason where
useful. A screenshot moving inside a composition is still an illustration; it
does not prove a click or uncaptured interface behavior.

Build caption and scene times from the accepted measured read, preserving one
canonical narration master. Returned provider duration changes require a new
coverage/handle/caption/reading-hold plan. Passing the storyboard checker proves
only its encoded timing/text rules; it cannot assess delivered emotion, actual
UI behavior, listening or the five final review gates. Preserve project-specific
creator/UI geometry in the private bound reference, without a global card or
motion template.
