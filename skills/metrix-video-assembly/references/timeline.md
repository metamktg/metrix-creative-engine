# timeline.json and its inputs

One timing truth per ad. Three frozen file formats and one stamp.

Status: frozen contract (wave 0). The planner and emitters (`timeline.mjs`) and the readers'
checks are built against it in later waves; until they land, nothing writes these files and the
"Written by" and "Read by" columns below are the contract those builds must meet.

| Format | File | Clock | Written by | Read by |
| --- | --- | --- | --- | --- |
| `mce.phrasemap/1` | `<run>/phrases.json` | voice master | `phrase-map.mjs` (whisperX only after it qualifies against hand labels) | `timeline.mjs plan` |
| `mce.cutplan/1` | `<run>/cut.json` | references, not times | a person or an agent, by hand | `timeline.mjs plan` |
| `mce.timeline/1` | `<run>/timeline.json` | ad | `timeline.mjs plan --phrases phrases.json --cut cut.json`, nothing else | every emitter; check-storyboard and qa-video for cut times |
| `derived_from` | inside each emitted `storyboard_{ratio}_{cap,clean}.json` | – | `timeline.mjs emit` | check-storyboard, render.mjs |

Validators live in `scripts/timeline/schema.mjs` (no dependencies): `validatePhraseMap`,
`validateCutPlan`, `validatePlanInputs` (the pair, cross-checked), `validateTimeline`,
`validateDerivedFrom`, and `validate` (dispatch on `schema`). Each returns a list of error strings;
an empty list is a pass. A file with an unknown field fails: add the field here and in the
validator first. The field tables below are tested against the validator's field list, and every
example on this page is tested to validate, so the page and the code cannot drift apart.

A storyboard written by hand, with no `timeline.json` beside it, stays valid. Once a timeline
exists, the storyboard is an output: edit `cut.json` and re-plan, never the storyboard.

## Conventions

- **Times** are seconds. The phrase map is on the voice master's clock; the timeline is on the
  ad's clock (0 is the first frame). The cut plan holds no ad times at all, only references.
- **Rounding.** Every time a timeline writes is rounded with `roundTime(x, dp)` from schema.mjs:
  Python's `round()`, ties to even on the exact binary value. `edit.time_dp` (3) applies to times,
  `edit.duration_dp` (2) to `duration`, 4 to segment `offset`. Plan arithmetic runs on unrounded
  values and rounds only on write. `Math.round(x * 1000) / 1000` is wrong here: it turns 11.0575
  into 11.058 where Python, and the v19 builder, wrote 11.057.
- **Serialization.** `serialize(value)` = `JSON.stringify(value, null, 2) + "\n"`, UTF-8, LF.
  Every `sha256` on this page is the lowercase hex sha256 of a file's bytes as written that way.
- **TM hash.** `tm_sha256` = `tmSha256(tm)` = sha256 of `JSON.stringify(JSON.parse(text))`, the
  canonical compact form of the TM block. Pass the object, or the text read out of the
  composition: whitespace and number spelling (`5.0`, `5`) do not change it; key order and values do.
- **Ids** that references name (phrases, points, clips, shots, scenes, constraints, caption groups,
  sfx) match `^[A-Za-z][A-Za-z0-9_]*$`. Segment ids may also join phrases with `+` (`B+C`).
  No `-` or `+` in other ids, so `point.tap+0.07` is never ambiguous.
- **Tolerances.** Equalities between written values hold to 1e-6; equalities between values
  that were each rounded to 3 decimals (a segment's out length against its source length) hold
  to 1.5e-3.

## mce.phrasemap/1

Where each phrase and word sits in the accepted voice master. Phrase edges come from silencedetect
(sample-accurate; edits cut on them). Word times only place words in phrases and feed caption
groups; they never set a cut. Splits are measured points inside a phrase (an energy dip) where a
caption may break.

### Example

```json
{
  "schema": "mce.phrasemap/1",
  "clock": "voice",
  "voice": {
    "path": "media/voice_master.wav",
    "sha256": "3f0a9c1e5b7d2468ace013579bdf2468ace013579bdf2468ace013579bdf2468",
    "duration": 5,
    "sample_rate": 48000,
    "channels": 1
  },
  "edges": { "method": "silencedetect", "noise": "-40dB", "min_gap": 0.15 },
  "words_source": { "method": "whisper-cli-dtw", "model": "ggml-base.en.bin", "qualified_against": null },
  "phrases": [
    {
      "id": "P1",
      "start": 0.5,
      "end": 1.7,
      "text": "Your desk, sorted.",
      "words": [
        { "text": "Your", "start": 0.5, "end": 0.74, "p": 0.97 },
        { "text": "desk,", "start": 0.78, "end": 1.12, "p": 0.95 },
        { "text": "sorted.", "start": 1.2, "end": 1.7, "p": 0.91 }
      ]
    },
    {
      "id": "P2",
      "start": 2.4,
      "end": 4.1,
      "text": "Pick a plan in one tap.",
      "words": [
        { "text": "Pick", "start": 2.4, "end": 2.62, "p": 0.98 },
        { "text": "a", "start": 2.66, "end": 2.72, "p": 0.88 },
        { "text": "plan", "start": 2.76, "end": 3.1, "p": 0.96 },
        { "text": "in", "start": 3.3, "end": 3.42, "p": 0.93 },
        { "text": "one", "start": 3.46, "end": 3.7, "p": 0.97 },
        { "text": "tap.", "start": 3.74, "end": 4.1, "p": 0.94 }
      ]
    }
  ],
  "splits": [{ "id": "p2_split", "phrase": "P2", "at": 3.2, "window": [3, 3.4], "method": "energy-dip" }],
  "script_check": {
    "verdict": "MATCH",
    "diffs": [],
    "note": "ASR agreement only; a human listening pass is still required"
  }
}
```

### Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"mce.phrasemap/1"` | Format tag |
| `clock` | `"voice"` | Times are on the voice master |
| `voice` | object | The accepted voice master the times refer to |
| `voice.path` | string | Path of the master, relative to the phrase map's folder or absolute |
| `voice.sha256` | hex or null | sha256 of the master's bytes; null only when it was not computed |
| `voice.duration` | number > 0 | ffprobe duration, seconds |
| `voice.sample_rate` | integer or null | Hz |
| `voice.channels` | integer or null | Channel count |
| `edges` | object | How phrase edges were found |
| `edges.method` | `silencedetect` or `manual` | `manual` means a person placed them; say so in the run record |
| `edges.noise` | string or null | silencedetect threshold, e.g. `-40dB` |
| `edges.min_gap` | number or null | Shortest silence that splits two phrases, seconds |
| `words_source` | object | Where the word times came from |
| `words_source.method` | `ffmpeg-whisper`, `whisper-cli-dtw`, `whisperx`, `words-file` or `none` | `none` means phrases carry no words |
| `words_source.model` | string or null | Model file name, e.g. `ggml-base.en.bin` |
| `words_source.qualified_against` | string or null | Required for `whisperx`: the hand-label measurement it passed. whisperX replaces nothing until that exists |
| `phrases` | array, at least 1 | In voice order, not overlapping |
| `phrases[].id` | id | Stable name (`P1`, or a letter); the cut plan uses it |
| `phrases[].start` | number | Speech onset, voice seconds |
| `phrases[].end` | number | Speech end, voice seconds; after `start`, within `voice.duration` |
| `phrases[].text` | string | What was said (the script line when it matched, else ASR) |
| `phrases[].words` | array | Words in order |
| `phrases[].words[].text` | string | One word with its punctuation |
| `phrases[].words[].start` | number | Word start, voice seconds |
| `phrases[].words[].end` | number | Word end, voice seconds; ASR ends run late, never cut on them |
| `phrases[].words[].p` | number 0 to 1, null, or absent | Token probability (whisper-cli `-ojf`) |
| `splits` | array | Measured break points inside phrases |
| `splits[].id` | id | Name a caption group refers to |
| `splits[].phrase` | id | The phrase it sits in; `at` is strictly inside it |
| `splits[].at` | number | Voice seconds |
| `splits[].window` | `[lo, hi]` | Search window the measurement ran in; `at` lies inside it |
| `splits[].method` | `energy-dip` or `manual` | `energy-dip`: lowest 60 ms RMS in the window |
| `script_check` | object or null | phrase-map `--script` result, or null when no script was given |
| `script_check.verdict` | `MATCH` or `MISMATCH` | Every script word heard in order, or not |
| `script_check.diffs` | array | Missing and extra words |
| `script_check.diffs[].type` | `missing` or `extra` | Which side the word is on |
| `script_check.diffs[].word` | string | The normalized word |
| `script_check.diffs[].index` | integer | Word index in the script (missing) or the heard text (extra) |
| `script_check.note` | string | Reminder that ASR agreement is not a listening pass |

`fromPhraseMapResult(result, opts)` wraps what `phrase-map.mjs --out` writes today
(`{ input, duration, silencedetect, phrases, script_check }`) in this shape; `opts` supplies the
facts phrase-map does not record (`sha256`, `sample_rate`, `channels`, `words_method`, `model`,
`splits`).

## mce.cutplan/1

The authored edit. It never holds an ad time: every moment is a reference that the planner
resolves, so moving one phrase or one clip moves everything tied to it. Run-specific rules (a card
that must be readable for 1.0 s, a smile held 0.8 s) are `constraints` rows, not code.

### Example

```json
{
  "schema": "mce.cutplan/1",
  "name": "desk-plan-demo",
  "phrasemap": {
    "path": "phrases.json",
    "sha256": "1ace895f1da8970bb09756110b4bd967190b7f856989e57e71e3b9df504bf8cf"
  },
  "fps": 30,
  "grid": { "bpm": 120, "div": 4, "origin": 0 },
  "edit": {
    "pre": 0.04,
    "post": 0.08,
    "lead": 0.06,
    "tail": 1.4,
    "prefer_full_beat_cost": 0.04,
    "time_dp": 3,
    "duration_dp": 2
  },
  "rules": { "min_shot": 0.75 },
  "segments": [
    { "id": "S1", "phrases": ["P1"], "place": { "mode": "start", "at": 0 }, "snap": "none" },
    { "id": "S2", "phrases": ["P2"], "place": { "mode": "gap" }, "snap": "full_beat_pref" }
  ],
  "points": [
    { "id": "toApp", "kind": "cut", "from": "clip.face@1.4", "snap": "up" },
    { "id": "tap", "kind": "event", "from": "phrase.P2.start+1.1", "snap": "up" },
    { "id": "card", "kind": "cut", "from": null, "snap": "up" }
  ],
  "clips": [
    {
      "id": "face",
      "file": "media/face.mp4",
      "duration": 5,
      "fps": 25,
      "clock": "voice",
      "voice_base": 0.2,
      "events": {  },
      "reject": [{ "lo": 0, "hi": 0.2, "why": "silent lead-in" }],
      "residual": []
    }
  ],
  "shots": [
    {
      "id": "face",
      "source": "face",
      "label": "presenter to camera",
      "from": "start",
      "to": "point.toApp",
      "src_in": null
    },
    {
      "id": "app",
      "source": null,
      "label": "app screen (composition)",
      "from": "point.toApp",
      "to": "point.card",
      "src_in": null
    },
    {
      "id": "card",
      "source": null,
      "label": "end card (composition)",
      "from": "point.card",
      "to": "end",
      "src_in": null
    }
  ],
  "scenes": [
    {
      "id": "s1",
      "role": "hook",
      "from": "start",
      "to": "point.toApp",
      "visual": "Presenter to camera, face.mp4"
    },
    {
      "id": "s2",
      "role": "show",
      "from": "point.toApp",
      "to": "point.card",
      "visual": "The app: pick a plan, tap"
    },
    { "id": "s3", "role": "cta", "from": "point.card", "to": "end", "visual": "End card with the CTA" }
  ],
  "storyboard": {
    "brief_id": "VID-002",
    "tone": "native creator demo",
    "poster_at": "start+0.5",
    "lufs": -14,
    "ratios": [
      { "ratio": "9:16", "width": 1080, "height": 1920 },
      { "ratio": "4:5", "width": 1080, "height": 1350 }
    ],
    "modes": ["cap", "clean"]
  },
  "constraints": [
    {
      "id": "gap_P2",
      "kind": "min_gap",
      "a": "phrase.P1.end",
      "b": "phrase.P2.start",
      "s": 0.3,
      "why": "breath before the offer line"
    },
    {
      "id": "read_plan",
      "kind": "read_after",
      "a": "point.tap",
      "b": "point.card",
      "s": 0.6,
      "why": "the chosen plan is readable before the end card"
    },
    {
      "id": "hold_end",
      "kind": "hold_after",
      "a": "phrase.P2.end",
      "b": "point.card",
      "s": 0.5,
      "why": "the last word lands on the app, not the card"
    },
    {
      "id": "face_take",
      "kind": "max_src",
      "a": "shot.face",
      "b": null,
      "s": 4.8,
      "why": "the take's last frames are unusable"
    },
    {
      "id": "decay",
      "kind": "decay_after",
      "a": "phrase.P2.end",
      "b": "end",
      "s": 1,
      "why": "the line decays before the ad ends"
    }
  ],
  "captions": {
    "builder": "manual",
    "rules": {
      "energy": "conversational",
      "lead_in": 0.06,
      "linger": 0.25,
      "min_cue": 0.67,
      "per_word": 0.3,
      "max_chars_line": 42,
      "max_lines": 2,
      "max_cps": 20,
      "min_gap_frames": 2,
      "exit_fade": 0.12,
      "snap_to_shot": 0.5,
      "pause_break": 0.15
    },
    "groups": [
      {
        "id": "hook",
        "kind": "hook",
        "copy": "Clear desk, clear head.",
        "source": "copy_architecture.hook",
        "deliver": ["burn"],
        "phrases": [],
        "split": null,
        "from": "start",
        "to": "point.toApp",
        "not_before": null,
        "not_after": null,
        "lead_in": null,
        "cls": null,
        "enter": "none",
        "enter_dur": null
      },
      {
        "id": "c1",
        "kind": "voiceover",
        "copy": "Your desk, sorted.",
        "source": "voiceover",
        "deliver": ["srt"],
        "phrases": ["P1"],
        "split": null,
        "from": null,
        "to": null,
        "not_before": null,
        "not_after": null,
        "lead_in": null,
        "cls": null,
        "enter": "none",
        "enter_dur": null
      },
      {
        "id": "c2a",
        "kind": "voiceover",
        "copy": "Pick a plan",
        "source": "voiceover",
        "deliver": ["burn", "srt"],
        "phrases": ["P2"],
        "split": { "id": "p2_split", "side": "before" },
        "from": null,
        "to": null,
        "not_before": "point.toApp",
        "not_after": null,
        "lead_in": null,
        "cls": "ui",
        "enter": "none",
        "enter_dur": null
      },
      {
        "id": "c2b",
        "kind": "voiceover",
        "copy": "in one tap.",
        "source": "voiceover",
        "deliver": ["burn", "srt"],
        "phrases": ["P2"],
        "split": { "id": "p2_split", "side": "after" },
        "from": null,
        "to": null,
        "not_before": null,
        "not_after": "point.card",
        "lead_in": null,
        "cls": "ui",
        "enter": "none",
        "enter_dur": null
      },
      {
        "id": "cta",
        "kind": "cta",
        "copy": "Get the app",
        "source": "copy_architecture.cta",
        "deliver": ["burn"],
        "phrases": [],
        "split": null,
        "from": "point.card",
        "to": "end",
        "not_before": null,
        "not_after": null,
        "lead_in": null,
        "cls": null,
        "enter": "rise",
        "enter_dur": 0.3
      }
    ]
  },
  "audio": {
    "voice": { "file": "media/voice.wav", "chain": null },
    "sfx": [
      {
        "id": "tap",
        "file": "sfx/interface/click_002.ogg",
        "at": "point.tap-0.02",
        "volume": 0.45,
        "why": "tap on the plan"
      }
    ],
    "music": {
      "file": "media/bed.wav",
      "volume": 0.25,
      "fade_in": 0.05,
      "fade_out": 0.6,
      "licence": "original, compose-bed.mjs",
      "sections": [
        { "at": "start", "snap": "none", "energy": 0 },
        { "at": "point.toApp", "snap": "beat_up", "energy": 1 }
      ]
    }
  },
  "outputs": { "tm": { "toApp": "point.toApp", "tap": "point.tap", "card": "point.card", "end": "end" } }
}
```

### References

A reference is a string; an optional `+N` or `-N` suffix adds seconds after resolving.

| Reference | Resolves to (ad seconds) |
| --- | --- |
| `start`, `end` | 0, and the timeline `duration` |
| `point.<id>` | The named point |
| `phrase.<id>.start`, `phrase.<id>.end` | The phrase edge after its segment is placed |
| `segment.<id>.cut` | The segment's audio cut |
| `voice@<t>` | Voice time `t` through the offset of the segment whose source range contains `t` (an error if none does) |
| `clip.<id>@<t>` | Clip time `t`. A `voice` clip: `voice@(t + voice_base)`. An `own` clip: the shot showing it, `shot.from + (t - src_in)` |
| `shot.<id>.in`, `shot.<id>.out` | The shot's `from` and `to` |
| `shot.<id>` | Only as `a` of a `max_src` constraint: the shot's source out-point |

### Plan semantics (normative for `timeline.mjs plan`)

Grid unit `u = 60 / bpm / div` from `grid.origin`; a beat is `60 / bpm`. Snap modes: `none`;
`up` and `down` to the unit (with a 1e-9 guard, `ceil(t / u - 1e-9)`); `nearest`; `beat_up` to
the next full beat; `full_beat_pref`: the next full beat if it costs no more than
`edit.prefer_full_beat_cost` over `up`, else `up`.

1. **Segments**, in order. `p0` and `pl` are the first and last phrase; `lead = edit.lead`.
   - `start`: cut = `place.at`, onset = cut + lead.
   - `gap`: the one `min_gap` constraint with `a = phrase.<previous pl>.end` and `b = phrase.<p0>.start`
     places it: cut = snap(t(a) + s - lead), onset = cut + lead.
   - `sync`: onset = t(`point.<place.point>`) - (`place.voice_at` - p0.start), cut = onset - lead.
     The voice moment `voice_at` lands exactly on the point.
   - `after`: cut = snap(t(`point.<place.point>`)), onset = cut + lead.
   - offset = onset - p0.start; `src_in` = p0.start - pre; `src_out` = pl.end + post;
     `out_in` = src_in + offset; `out_out` = src_out + offset; speech is never retimed (speed 1).
   - `audio_cut` = cut. `picture_cut` = the shot boundary equal to it, else null (an audio cut
     inside a shot, such as a line that starts over a held card, is not a picture cut).
2. **duration** = round(pl.end + last offset + `edit.tail`, `duration_dp`).
3. **Points.** With `from`: snap(t(from)). Without: snap(max over the `read_after` and `hold_after`
   constraints whose `b` is this point of t(a) + s); such a point may only snap `none`, `up`,
   `full_beat_pref` or `beat_up`, so snapping never breaks the constraint that placed it.
4. Everything resolves lazily in dependency order; a cycle is a plan error that names the chain.
5. **Shots** tile the ad in order: the first `from` is `start`, each `from` is the previous `to`,
   the last `to` is `end`. A `voice` clip's source in-point is
   `out_in - offset - voice_base`, using the segment whose out range contains `out_in`, else the
   latest segment starting before it, else the first; an `own` clip's is `src_in`.
6. **Captions**, manual builder. `in` = t(`from`) when set, else
   max(t(`not_before`), raw start - lead_in) where raw start is the split (side `after`) or the
   first phrase start, and lead_in is the group's `lead_in` or `rules.lead_in`. `out` = t(`to`) when
   set, else min(the next voiceover group's unclamped in, max(raw end + `rules.linger`,
   in + max(`rules.min_cue`, `rules.per_word` x words)), t(`not_after`)) where raw end is the
   split (side `before`) or the last phrase end. A group's words are its phrases' words that start
   inside its split window. The `auto` builder (the cue builder) groups words itself under the
   same `rules`; overlay groups (`hook`, `cta`, `label`, `framing`) always take `from` and `to`.
7. **Music sections** start at snap(t(at)); each ends where the next starts, the last at `end`.
   **sfx** `at` resolves directly.
8. **TM.** Each `outputs.tm` key is a dotted path into the TM object (`app.tap` nests), valued
   round(t(ref), 3), in the key order given.

### Constraints

Every constraint is checked after planning by the same rule, whatever its kind: t(b) - t(a) >= s
(to 1e-6), except `max_src`: the shot named by `a` must end at or before source second `s`.
The kind says what the row is for and, for three kinds, what the planner moves:

| Kind | Planner role | Typical row |
| --- | --- | --- |
| `min_gap` | Places a `gap` segment (when `a`/`b` are the adjacent phrase edges); otherwise a check. `s` may be 0 or negative for ordering checks | `phrase.A.end` to `phrase.B.start`, 0.30 |
| `read_after` | Places a point that has no `from` | `point.ok` to `point.cutHer`, 1.0: the card is readable before the cut |
| `hold_after` | Places a point that has no `from` | `phrase.H.end` to `point.endCard`, 0.80: the smile is held |
| `decay_after` | Check only | `phrase.I.end` to `end`, 1.2: the last word decays on the card |
| `max_src` | Check only | `shot.door`, 3.50: the clip is unusable after source 3.50 |

Generic checks need no rows: segments do not overlap, no shot shorter than `rules.min_shot`, no
shown frame maps into a clip `reject` window (mapping `floor(t_src x clip fps)`, the frame actually
decoded), shots tile the ad.

### Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"mce.cutplan/1"` | Format tag |
| `name` | string | Run name; the timeline and emitted files carry it |
| `phrasemap` | object or null | The phrase map this plan was written against; null for an ad with no voice |
| `phrasemap.path` | string | Relative to the cut plan's folder |
| `phrasemap.sha256` | hex | sha256 of that file; plan refuses a phrase map that no longer matches |
| `fps` | number | Output frame rate |
| `grid` | object | The edit grid |
| `grid.bpm` | number | Music tempo the cuts land on |
| `grid.div` | integer | Grid units per beat (8 = eighth-beat) |
| `grid.origin` | number | Ad time of grid line 0 |
| `edit` | object | Audio edit settings |
| `edit.pre` | number | Seconds kept before each segment's first phrase |
| `edit.post` | number | Seconds kept after each segment's last phrase |
| `edit.lead` | number | Audio cut to speech onset |
| `edit.tail` | number | Last phrase end to the end of the ad |
| `edit.prefer_full_beat_cost` | number | Most extra seconds `full_beat_pref` spends to land on a beat |
| `edit.time_dp` | integer | Decimals for times (3) |
| `edit.duration_dp` | integer | Decimals for `duration` (2) |
| `rules` | object | Generic check settings |
| `rules.min_shot` | number | Shortest shot allowed, seconds (owner rule 0.75) |
| `segments` | array, at least 1 | Audio segments in voice order |
| `segments[].id` | segment id | `A`, or phrases joined: `B+C` |
| `segments[].phrases` | ids | Consecutive phrases kept together with their natural pause |
| `segments[].place` | object | How the segment is placed (see Plan semantics) |
| `segments[].place.mode` | `start`, `gap`, `sync` or `after` | Placement rule |
| `segments[].place.at` | number | `start` only: the audio cut |
| `segments[].place.voice_at` | number | `sync` only: the voice moment that lands on the point |
| `segments[].place.point` | id | `sync` and `after`: the point |
| `segments[].snap` | snap mode | Snap for the computed cut (`gap`, `after`) |
| `points` | array | Named picture cuts and on-screen events |
| `points[].id` | id | Name used as `point.<id>` |
| `points[].kind` | `cut` or `event` | A picture cut, or something that happens inside a shot |
| `points[].from` | reference or null | Where it sits; null when constraints place it |
| `points[].snap` | snap mode | Grid snap applied after resolving |
| `clips` | array | Source video files |
| `clips[].id` | id | Name used by shots and `clip.<id>@t` |
| `clips[].file` | string | Path, relative to the cut plan's folder |
| `clips[].duration` | number | Clip length, seconds |
| `clips[].fps` | number | Clip frame rate (reject mapping uses it) |
| `clips[].clock` | `voice` or `own` | `voice`: lip-synced to the voice master; `own`: free-running |
| `clips[].voice_base` | number or null | `voice` clips: clip time = voice time - voice_base |
| `clips[].events` | object | Named clip moments, clip seconds (a door latch) |
| `clips[].events.<key>` | number | One event |
| `clips[].reject` | array | Clip windows that must never be shown |
| `clips[].reject[].lo` | number | Window start, clip seconds |
| `clips[].reject[].hi` | number | Window end, clip seconds (exclusive) |
| `clips[].reject[].why` | string | What is wrong there (eyes closed, a grin) |
| `clips[].residual` | array | Known flaws accepted and shown, recorded so review sees them |
| `clips[].residual[].lo` | number | Window start |
| `clips[].residual[].hi` | number | Window end |
| `clips[].residual[].why` | string | The flaw and why it is accepted |
| `shots` | array, at least 1 | The picture, in order, tiling the ad |
| `shots[].id` | id | Shot name |
| `shots[].source` | clip id or null | null for a composition-drawn shot (an app screen, an end card) |
| `shots[].label` | string | What is on screen, in words |
| `shots[].from` | reference | Shot start |
| `shots[].to` | reference | Shot end |
| `shots[].src_in` | number or null | `own` clips only: source second shown at `from` |
| `scenes` | array, at least 1 | Storyboard scenes, tiling the ad |
| `scenes[].id` | id | `s1`, `s2`, ... |
| `scenes[].role` | `hook`, `show`, `proof`, `offer` or `cta` | As in storyboard.md |
| `scenes[].from` | reference | Scene start; the first is `start` |
| `scenes[].to` | reference | Scene end; the last is `end` |
| `scenes[].visual` | string | The storyboard `visual` text |
| `storyboard` | object | Storyboard fields that are not timing |
| `storyboard.brief_id` | string or null | Brief id |
| `storyboard.tone` | string | Storyboard tone |
| `storyboard.poster_at` | reference | The poster moment |
| `storyboard.lufs` | number | Loudness target |
| `storyboard.ratios` | array | Deliverable canvases |
| `storyboard.ratios[].ratio` | `9:16`, `4:5`, `1:1` or `16:9` | Aspect ratio |
| `storyboard.ratios[].width` | integer | Pixels; must match the ratio |
| `storyboard.ratios[].height` | integer | Pixels |
| `storyboard.modes` | `cap`, `clean` | Burned captions, clean, or both |
| `constraints` | array | Run rules as data (see Constraints) |
| `constraints[].id` | id | Name a finding reports |
| `constraints[].kind` | constraint kind | `min_gap`, `max_src`, `hold_after`, `read_after`, `decay_after` |
| `constraints[].a` | reference | Earlier side (a shot for `max_src`) |
| `constraints[].b` | reference or null | Later side; null only for `max_src` |
| `constraints[].s` | number | Seconds |
| `constraints[].why` | string | The reason, in words a reviewer can check |
| `captions` | object | Caption plan |
| `captions.builder` | `auto` or `manual` | `auto`: the cue builder groups the words; `manual`: `groups` lists every voiceover group |
| `captions.rules` | object | Grouping and timing settings (all optional) |
| `captions.rules.energy` | `high`, `conversational` or `calm` | Words per group: 2 to 3, 3 to 5, 4 to 6 |
| `captions.rules.lead_in` | number | A group appears this long before its first word |
| `captions.rules.linger` | number | A group stays this long after its last word |
| `captions.rules.min_cue` | number | Shortest group, seconds (20 frames assumed 0.67 s at 30 fps) |
| `captions.rules.per_word` | number | Reading floor per word |
| `captions.rules.max_chars_line` | integer | Characters per line (42) |
| `captions.rules.max_lines` | integer, 1 or 2 | Lines per group |
| `captions.rules.max_cps` | number | Characters per second ceiling (20) |
| `captions.rules.min_gap_frames` | integer | Frames between two groups (2) |
| `captions.rules.exit_fade` | number | Exit fade, seconds (0.12) |
| `captions.rules.snap_to_shot` | number | Snap a group edge to a shot change within this many seconds (0.5) |
| `captions.rules.pause_break` | number | A pause this long ends a group (0.15) |
| `captions.groups` | array | Overlays, and every voiceover group when `manual` |
| `captions.groups[].id` | id | Storyboard `text[].id` |
| `captions.groups[].kind` | `voiceover`, `hook`, `cta`, `label` or `framing` | `voiceover` captions a spoken line; the rest are overlays |
| `captions.groups[].copy` | string | Exact on-screen text |
| `captions.groups[].source` | string | Storyboard `text[].source` (`voiceover`, `copy_architecture.cta`) |
| `captions.groups[].deliver` | `burn`, `srt` | Burned on CAP masters, written to the SRT, or both. Only voiceover goes to the SRT |
| `captions.groups[].phrases` | ids | Phrases a voiceover group captions |
| `captions.groups[].split` | object or null | Use one side of a phrase-map split |
| `captions.groups[].split.id` | id | The split |
| `captions.groups[].split.side` | `before` or `after` | Which side of it this group covers |
| `captions.groups[].from` | reference or null | Fixed in-time (required for overlays) |
| `captions.groups[].to` | reference or null | Fixed out-time (required for overlays) |
| `captions.groups[].not_before` | reference or null | Earliest in-time |
| `captions.groups[].not_after` | reference or null | Latest out-time (a scene end) |
| `captions.groups[].lead_in` | number or null | Overrides `rules.lead_in` for this group |
| `captions.groups[].cls` | string or null | Composition class (`ui low`) |
| `captions.groups[].enter` | storyboard entrance | `none`, `fade`, `rise`, `slam`, `pop`, `type`, `wipe` |
| `captions.groups[].enter_dur` | number or null | Entrance length |
| `audio` | object | Sound plan |
| `audio.voice` | object | The voice the composition plays |
| `audio.voice.file` | string | Processed voice file |
| `audio.voice.chain` | object or null | Processing settings, recorded (room IR, hum, hiss, ratio) |
| `audio.sfx` | array | Effects |
| `audio.sfx[].id` | id | Effect name |
| `audio.sfx[].file` | string | Effect file |
| `audio.sfx[].at` | reference | When it fires |
| `audio.sfx[].volume` | number, 0 to 1 | Gain |
| `audio.sfx[].why` | string | The picture event it marks |
| `audio.music` | object or null | Bed; null needs a storyboard `silence_reason` downstream |
| `audio.music.file` | string | Bed file |
| `audio.music.volume` | number, at most 0.5 | Bed gain |
| `audio.music.fade_in` | number | Seconds |
| `audio.music.fade_out` | number | Seconds |
| `audio.music.licence` | string | The licence it runs under |
| `audio.music.sections` | array | Energy sections for compose-bed |
| `audio.music.sections[].at` | reference | Section start |
| `audio.music.sections[].snap` | snap mode | Usually `beat_up` |
| `audio.music.sections[].energy` | integer | 0 upward |
| `audio.music.sections[].chord` | integers, optional | MIDI notes |
| `audio.music.sections[].root` | integer, optional | MIDI root |
| `outputs` | object | Extra outputs |
| `outputs.tm` | object or null | The TM block the composition reads; null when there is none |
| `outputs.tm.<key>` | reference | One TM value; dotted keys nest |

## mce.timeline/1

The planned ad, on the ad clock. Only `timeline.mjs plan` writes it. Two sections are shaped for
their consumers: `captions.groups` is what the cue builder fills and every caption emitter reads
(burned text, SRT, the storyboard's caption lines), and `shots` is what the reject, eye-sheet,
short-shot and stricter-at-cuts checks read. Neither is re-derived anywhere else.

### Example

```json
{
  "schema": "mce.timeline/1",
  "name": "desk-plan-demo",
  "clock": "ad",
  "fps": 30,
  "duration": 4.66,
  "grid": { "bpm": 120, "div": 4, "unit": 0.125, "origin": 0 },
  "inputs": {
    "phrasemap": {
      "path": "phrases.json",
      "sha256": "1ace895f1da8970bb09756110b4bd967190b7f856989e57e71e3b9df504bf8cf",
      "schema": "mce.phrasemap/1"
    },
    "cutplan": {
      "path": "cut.json",
      "sha256": "4e4d3a96241286a7a2ad1ffc4e981798f1fcf58ecc24adf04522c163bd4171f5",
      "schema": "mce.cutplan/1"
    }
  },
  "segments": [
    {
      "id": "S1",
      "phrases": ["P1"],
      "src_in": 0.46,
      "src_out": 1.78,
      "out_in": 0.02,
      "out_out": 1.34,
      "offset": -0.44,
      "speed": 1,
      "audio_cut": 0,
      "picture_cut": 0
    },
    {
      "id": "S2",
      "phrases": ["P2"],
      "src_in": 2.36,
      "src_out": 4.18,
      "out_in": 1.52,
      "out_out": 3.34,
      "offset": -0.84,
      "speed": 1,
      "audio_cut": 1.5,
      "picture_cut": null
    }
  ],
  "phrases": [
    {
      "id": "P1",
      "segment": "S1",
      "text": "Your desk, sorted.",
      "src_start": 0.5,
      "src_end": 1.7,
      "start": 0.06,
      "end": 1.26,
      "words": [
        { "text": "Your", "start": 0.06, "end": 0.3 },
        { "text": "desk,", "start": 0.34, "end": 0.68 },
        { "text": "sorted.", "start": 0.76, "end": 1.26 }
      ]
    },
    {
      "id": "P2",
      "segment": "S2",
      "text": "Pick a plan in one tap.",
      "src_start": 2.4,
      "src_end": 4.1,
      "start": 1.56,
      "end": 3.26,
      "words": [
        { "text": "Pick", "start": 1.56, "end": 1.78 },
        { "text": "a", "start": 1.82, "end": 1.88 },
        { "text": "plan", "start": 1.92, "end": 2.26 },
        { "text": "in", "start": 2.46, "end": 2.58 },
        { "text": "one", "start": 2.62, "end": 2.86 },
        { "text": "tap.", "start": 2.9, "end": 3.26 }
      ]
    }
  ],
  "points": [
    { "id": "toApp", "kind": "cut", "t": 1.25 },
    { "id": "tap", "kind": "event", "t": 2.75 },
    { "id": "card", "kind": "cut", "t": 3.875 }
  ],
  "shots": [
    {
      "id": "face",
      "source": "face",
      "file": "media/face.mp4",
      "label": "presenter to camera",
      "out_in": 0,
      "out_out": 1.25,
      "src_in": 0.24,
      "src_out": 1.49,
      "src_fps": 25,
      "src_duration": 5,
      "reject": [{ "lo": 0, "hi": 0.2, "why": "silent lead-in" }],
      "residual": []
    },
    {
      "id": "app",
      "source": null,
      "file": null,
      "label": "app screen (composition)",
      "out_in": 1.25,
      "out_out": 3.875,
      "src_in": null,
      "src_out": null,
      "src_fps": null,
      "src_duration": null,
      "reject": [],
      "residual": []
    },
    {
      "id": "card",
      "source": null,
      "file": null,
      "label": "end card (composition)",
      "out_in": 3.875,
      "out_out": 4.66,
      "src_in": null,
      "src_out": null,
      "src_fps": null,
      "src_duration": null,
      "reject": [],
      "residual": []
    }
  ],
  "scenes": [
    { "id": "s1", "role": "hook", "start": 0, "end": 1.25, "visual": "Presenter to camera, face.mp4" },
    { "id": "s2", "role": "show", "start": 1.25, "end": 3.875, "visual": "The app: pick a plan, tap" },
    { "id": "s3", "role": "cta", "start": 3.875, "end": 4.66, "visual": "End card with the CTA" }
  ],
  "storyboard": {
    "brief_id": "VID-002",
    "tone": "native creator demo",
    "poster_at": 0.5,
    "lufs": -14,
    "ratios": [
      { "ratio": "9:16", "width": 1080, "height": 1920 },
      { "ratio": "4:5", "width": 1080, "height": 1350 }
    ],
    "modes": ["cap", "clean"]
  },
  "captions": {
    "builder": "manual",
    "rules": {
      "energy": "conversational",
      "lead_in": 0.06,
      "linger": 0.25,
      "min_cue": 0.67,
      "per_word": 0.3,
      "max_chars_line": 42,
      "max_lines": 2,
      "max_cps": 20,
      "min_gap_frames": 2,
      "exit_fade": 0.12,
      "snap_to_shot": 0.5,
      "pause_break": 0.15
    },
    "groups": [
      {
        "id": "hook",
        "kind": "hook",
        "source": "copy_architecture.hook",
        "deliver": ["burn"],
        "start": 0,
        "end": 1.25,
        "text": "Clear desk, clear head.",
        "lines": ["Clear desk,", "clear head."],
        "words": [
          { "text": "Clear", "start": null, "end": null, "line": 0 },
          { "text": "desk,", "start": null, "end": null, "line": 0 },
          { "text": "clear", "start": null, "end": null, "line": 1 },
          { "text": "head.", "start": null, "end": null, "line": 1 }
        ],
        "phrases": [],
        "cls": null,
        "enter": "none",
        "enter_dur": null,
        "exit_fade": null
      },
      {
        "id": "c1",
        "kind": "voiceover",
        "source": "voiceover",
        "deliver": ["srt"],
        "start": 0,
        "end": 1.5,
        "text": "Your desk, sorted.",
        "lines": ["Your desk, sorted."],
        "words": [
          { "text": "Your", "start": 0.06, "end": 0.3, "line": 0 },
          { "text": "desk,", "start": 0.34, "end": 0.68, "line": 0 },
          { "text": "sorted.", "start": 0.76, "end": 1.26, "line": 0 }
        ],
        "phrases": ["P1"],
        "cls": null,
        "enter": "none",
        "enter_dur": null,
        "exit_fade": null
      },
      {
        "id": "c2a",
        "kind": "voiceover",
        "source": "voiceover",
        "deliver": ["burn", "srt"],
        "start": 1.5,
        "end": 2.3,
        "text": "Pick a plan",
        "lines": ["Pick a plan"],
        "words": [
          { "text": "Pick", "start": 1.56, "end": 1.78, "line": 0 },
          { "text": "a", "start": 1.82, "end": 1.88, "line": 0 },
          { "text": "plan", "start": 1.92, "end": 2.26, "line": 0 }
        ],
        "phrases": ["P2"],
        "cls": "ui",
        "enter": "none",
        "enter_dur": null,
        "exit_fade": 0.12
      },
      {
        "id": "c2b",
        "kind": "voiceover",
        "source": "voiceover",
        "deliver": ["burn", "srt"],
        "start": 2.3,
        "end": 3.51,
        "text": "in one tap.",
        "lines": ["in one tap."],
        "words": [
          { "text": "in", "start": 2.46, "end": 2.58, "line": 0 },
          { "text": "one", "start": 2.62, "end": 2.86, "line": 0 },
          { "text": "tap.", "start": 2.9, "end": 3.26, "line": 0 }
        ],
        "phrases": ["P2"],
        "cls": "ui",
        "enter": "none",
        "enter_dur": null,
        "exit_fade": 0.12
      },
      {
        "id": "cta",
        "kind": "cta",
        "source": "copy_architecture.cta",
        "deliver": ["burn"],
        "start": 3.875,
        "end": 4.66,
        "text": "Get the app",
        "lines": ["Get the app"],
        "words": [
          { "text": "Get", "start": null, "end": null, "line": 0 },
          { "text": "the", "start": null, "end": null, "line": 0 },
          { "text": "app", "start": null, "end": null, "line": 0 }
        ],
        "phrases": [],
        "cls": null,
        "enter": "rise",
        "enter_dur": 0.3,
        "exit_fade": null
      }
    ]
  },
  "audio": {
    "voice": { "file": "media/voice.wav", "chain": null },
    "sfx": [
      {
        "id": "tap",
        "file": "sfx/interface/click_002.ogg",
        "at": 2.73,
        "volume": 0.45,
        "why": "tap on the plan"
      }
    ],
    "music": {
      "file": "media/bed.wav",
      "volume": 0.25,
      "fade_in": 0.05,
      "fade_out": 0.6,
      "licence": "original, compose-bed.mjs",
      "sections": [{ "from": 0, "to": 1.5, "energy": 0 }, { "from": 1.5, "to": 4.66, "energy": 1 }]
    }
  },
  "tm": { "toApp": 1.25, "tap": 2.75, "card": 3.875, "end": 4.66 }
}
```

### Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | `"mce.timeline/1"` | Format tag |
| `name` | string | From the cut plan |
| `clock` | `"ad"` | Times are on the ad |
| `fps` | number | Output frame rate |
| `duration` | number | Ad length; shots and scenes end here |
| `grid` | object | The grid the plan used |
| `grid.bpm` | number | Tempo |
| `grid.div` | integer | Units per beat |
| `grid.unit` | number | Must equal 60 / bpm / div |
| `grid.origin` | number | Ad time of grid line 0 |
| `inputs` | object | What was planned from |
| `inputs.phrasemap` | object or null | null for an ad with no voice |
| `inputs.phrasemap.path` | string | Relative to the timeline's folder |
| `inputs.phrasemap.sha256` | hex | sha256 of the phrase map's bytes |
| `inputs.phrasemap.schema` | `"mce.phrasemap/1"` | Its format |
| `inputs.cutplan` | object | The cut plan |
| `inputs.cutplan.path` | string | Relative to the timeline's folder |
| `inputs.cutplan.sha256` | hex | sha256 of the cut plan's bytes |
| `inputs.cutplan.schema` | `"mce.cutplan/1"` | Its format |
| `segments` | array | The voice edit (the EDL) |
| `segments[].id` | segment id | From the cut plan |
| `segments[].phrases` | ids | Its phrases |
| `segments[].src_in` | number | Voice master in-point |
| `segments[].src_out` | number | Voice master out-point |
| `segments[].out_in` | number | Ad time the segment starts; never before the previous segment's `out_out` |
| `segments[].out_out` | number | Ad time it ends; `out_out - out_in` equals `src_out - src_in` |
| `segments[].offset` | number | ad = voice + offset inside this segment (4 decimals) |
| `segments[].speed` | `1` | Speech is never retimed |
| `segments[].audio_cut` | number | Where the audio edit sits (onset - `edit.lead`) |
| `segments[].picture_cut` | number or null | The shot boundary at the audio cut, or null when the audio cut falls inside a shot |
| `phrases` | array | Every planned phrase, in order, on the ad clock |
| `phrases[].id` | id | Phrase id |
| `phrases[].segment` | segment id | Its segment |
| `phrases[].text` | string | From the phrase map |
| `phrases[].src_start` | number | Voice master start |
| `phrases[].src_end` | number | Voice master end |
| `phrases[].start` | number | Ad start = src_start + offset |
| `phrases[].end` | number | Ad end |
| `phrases[].words` | array | Words on the ad clock (the cue builder's input) |
| `phrases[].words[].text` | string | Word |
| `phrases[].words[].start` | number | Ad seconds |
| `phrases[].words[].end` | number | Ad seconds |
| `points` | array | Every named point, resolved |
| `points[].id` | id | From the cut plan |
| `points[].kind` | `cut` or `event` | From the cut plan |
| `points[].t` | number | Ad seconds |
| `shots` | array, at least 1 | The picture, tiling 0 to `duration` with no gap or overlap |
| `shots[].id` | id | Shot id |
| `shots[].source` | clip id or null | null for a composition-drawn shot |
| `shots[].file` | string or null | The clip file; null with `source` |
| `shots[].label` | string | What is on screen |
| `shots[].out_in` | number | Ad start |
| `shots[].out_out` | number | Ad end |
| `shots[].src_in` | number or null | Clip second shown at `out_in` |
| `shots[].src_out` | number or null | Clip second at `out_out`; within `src_duration`, length equal to the shot's |
| `shots[].src_fps` | number or null | Clip frame rate; a shown frame at ad t decodes clip frame floor((t - out_in + src_in) x src_fps) |
| `shots[].src_duration` | number or null | Clip length |
| `shots[].reject` | array | The clip's reject windows, clip seconds, copied so checks need no cut plan |
| `shots[].reject[].lo` | number | Start |
| `shots[].reject[].hi` | number | End (exclusive) |
| `shots[].reject[].why` | string | Reason |
| `shots[].residual` | array | Accepted flaws, clip seconds |
| `shots[].residual[].lo` | number | Start |
| `shots[].residual[].hi` | number | End |
| `shots[].residual[].why` | string | Reason |
| `scenes` | array, at least 1 | Storyboard scenes, tiling 0 to `duration` |
| `scenes[].id` | id | Scene id |
| `scenes[].role` | role | As in storyboard.md |
| `scenes[].start` | number | Ad start |
| `scenes[].end` | number | Ad end |
| `scenes[].visual` | string | Storyboard `visual` |
| `storyboard` | object | Non-timing storyboard fields, resolved |
| `storyboard.brief_id` | string or null | Brief id |
| `storyboard.tone` | string | Tone |
| `storyboard.poster_at` | number | Poster moment, ad seconds |
| `storyboard.lufs` | number | Loudness target |
| `storyboard.ratios` | array | Canvases to emit |
| `storyboard.ratios[].ratio` | ratio | `9:16`, `4:5`, `1:1`, `16:9` |
| `storyboard.ratios[].width` | integer | Pixels |
| `storyboard.ratios[].height` | integer | Pixels |
| `storyboard.modes` | `cap`, `clean` | Caption modes to emit |
| `captions` | object | Every caption group, overlays included |
| `captions.builder` | `auto` or `manual` | Who grouped the words |
| `captions.rules` | object | The settings used (same fields as the cut plan's) |
| `captions.rules.energy` | grouping energy | As in the cut plan |
| `captions.rules.lead_in` | number | As in the cut plan |
| `captions.rules.linger` | number | As in the cut plan |
| `captions.rules.min_cue` | number | As in the cut plan |
| `captions.rules.per_word` | number | As in the cut plan |
| `captions.rules.max_chars_line` | integer | As in the cut plan |
| `captions.rules.max_lines` | integer | As in the cut plan |
| `captions.rules.max_cps` | number | As in the cut plan |
| `captions.rules.min_gap_frames` | integer | As in the cut plan |
| `captions.rules.exit_fade` | number | As in the cut plan |
| `captions.rules.snap_to_shot` | number | As in the cut plan |
| `captions.rules.pause_break` | number | As in the cut plan |
| `captions.groups` | array | One entry per on-screen group or SRT cue. Burned voiceover groups never overlap (one group visible at a time); SRT groups never overlap |
| `captions.groups[].id` | id | Storyboard `text[].id` |
| `captions.groups[].kind` | caption kind | `voiceover`, `hook`, `cta`, `label` (storyboard `label: true`), `framing` |
| `captions.groups[].source` | string | Storyboard `text[].source` |
| `captions.groups[].deliver` | `burn`, `srt` | Where it goes; CLEAN masters drop `burn` voiceover groups only |
| `captions.groups[].start` | number | Group appears (storyboard `in`, SRT start) |
| `captions.groups[].end` | number | Group is gone (storyboard `out`, SRT end) |
| `captions.groups[].text` | string | The words joined by single spaces; the exact copy |
| `captions.groups[].lines` | 1 or 2 strings | The line breaks: each line is its words joined by spaces |
| `captions.groups[].words` | array, at least 1 | Words in order |
| `captions.groups[].words[].text` | string | Word |
| `captions.groups[].words[].start` | number or null | Ad seconds; required for voiceover |
| `captions.groups[].words[].end` | number or null | Ad seconds; required for voiceover |
| `captions.groups[].words[].line` | 0 or 1 | The line this word is on; starts at 0, never goes back |
| `captions.groups[].phrases` | ids | Phrases a voiceover group captions |
| `captions.groups[].cls` | string or null | Composition class |
| `captions.groups[].enter` | storyboard entrance | Entrance |
| `captions.groups[].enter_dur` | number or null | Entrance length |
| `captions.groups[].exit_fade` | number or null | Exit fade before `end` (the cue builder sets 0.12); hidden after `end` |
| `audio` | object | Sound, resolved |
| `audio.voice` | object | As in the cut plan |
| `audio.voice.file` | string | Voice file |
| `audio.voice.chain` | object or null | Processing settings |
| `audio.sfx` | array | Effects |
| `audio.sfx[].id` | id | Effect name |
| `audio.sfx[].file` | string | File |
| `audio.sfx[].at` | number | Ad seconds |
| `audio.sfx[].volume` | number | Gain |
| `audio.sfx[].why` | string | The event it marks |
| `audio.music` | object or null | Bed |
| `audio.music.file` | string | File |
| `audio.music.volume` | number | Gain |
| `audio.music.fade_in` | number | Seconds |
| `audio.music.fade_out` | number | Seconds |
| `audio.music.licence` | string | Licence |
| `audio.music.sections` | array | compose-bed sections (cues.json) |
| `audio.music.sections[].from` | number | Ad seconds |
| `audio.music.sections[].to` | number | Ad seconds |
| `audio.music.sections[].energy` | integer | Energy step |
| `audio.music.sections[].chord` | integers, optional | MIDI notes |
| `audio.music.sections[].root` | integer, optional | MIDI root |
| `tm` | object or null | The TM block exactly as the composition reads it; its `tmSha256` is stamped into `derived_from.tm_sha256` |

## derived_from

The stamp every emitted storyboard carries, as a top-level `derived_from` key. Readers must
enforce it: check-storyboard FAILs a storyboard whose `sha256` no longer matches the timeline
file, and a storyboard without the stamp when a `timeline.json` sits beside it; render.mjs FAILs
when the composition's TM hashes differently from `tm_sha256`. The example stamps the timeline example above
(`sha256` of its `serialize()` bytes, `tm_sha256` of its `tm`).

### Example

```json
{
  "derived_from": {
    "path": "timeline.json",
    "sha256": "da825c7990c82a0c80ed4874035cba3c183b24c0f80c4df9c0e14026ccf94f15",
    "schema": "mce.timeline/1",
    "tm_sha256": "a0020850a054a0faf1cd209f44f53b9e5c5ef3c887840137f2595f35cff46191"
  }
}
```

### Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `path` | string | The timeline, relative to the storyboard's folder |
| `sha256` | hex | sha256 of the timeline file's bytes |
| `schema` | `"mce.timeline/1"` | Format of that file |
| `tm_sha256` | hex or null | `tmSha256` of the timeline's `tm`; null when the timeline has no TM |
