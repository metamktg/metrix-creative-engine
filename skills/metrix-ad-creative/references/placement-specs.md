# Placement to parameters

Aspect ratio is a **parameter**, never a prompt clause. Writing "9:16" in the
prompt text does not make a vertical image; the model's ratio field does.

## Ratios by placement

| Placement | Ratio | Typical pixels |
| --- | --- | --- |
| Feed (Facebook, Instagram) | 4:5 | 1080 x 1350 |
| Feed, square variant | 1:1 | 1080 x 1080 |
| Stories, Reels | 9:16 | 1080 x 1920 |
| In-stream video | 16:9 | 1920 x 1080 |
| Carousel card | 1:1 | 1080 x 1080 |
| Right column | 1:1 | 1080 x 1080 |

4:5 is the usual feed default because it occupies more vertical screen than 1:1
without being cropped. 1:1 is the safe choice when one asset must serve feed and
carousel both.

These ratios are stable. Exact pixel minimums, file size caps and maximum video
durations are not, Meta revises them. Check the current spec sheet at
<https://www.facebook.com/business/ads-guide> before a launch; do not treat the
pixel column above as authoritative on the day.

## Safe zones

Stories and Reels overlay UI on the creative: the profile row at the top, the
caption, CTA and action buttons at the bottom. Keep anything that must be read,
a logo, a product, on-image text, a face, a CTA, inside the middle band.

The numbers live in one table, `references/placement-zones.json` (copied to
`metrix-video-assembly/references/`, read by `scripts/placement-zones.mjs`).
Each row carries the Meta page it was read from and the retrieval date. As
retrieved 2026-11-06:

| Placement | Ratio | Keep clear | Source |
| --- | --- | --- | --- |
| Instagram Reels, Instagram Stories, Facebook Stories | 9:16 | top 14%, bottom 35%, sides 6% each | Meta ads guide spec pages (primary) |
| Facebook Reels | 9:16 | top 14%, bottom 35%, sides 6% each | third party only; WARN, never FAIL |
| Feed (Facebook, Instagram), carousel, in-stream | 4:5, 1:1, 9:16, 16:9 | 5% every edge | house rule; Meta publishes no feed safe zone |

At 1080 x 1920 the 9:16 band is 269 px top, 672 px bottom, 65 px each side
(computed). The bottom band is the one that bites: a caption or CTA below 65%
of the frame height sits under Meta's UI on Reels and Stories.

`render.mjs --mode check` does not read the table yet. It still applies the
legacy rows (9:16: 14% top, 20% foot, 6% sides; every other ratio 5%), which
is looser at the bottom. Compose to the table, not to what the check accepts.

Generation models do not respect safe zones and cannot be reliably told to.
Compose for it instead: prompt the subject as centred, and treat the outer bands
as headroom. Check the rendered asset against the zones before upload. A logo
sitting under the profile row is a re-render, not a fix.

## One asset, several placements

Generating once at 1:1 and letting Meta crop to 9:16 loses the top and bottom of
the frame, which is where composition usually lives. Two options:

1. Generate per ratio. In a matrix this means the ratio is locked per row and
   each row is its own test. Cleanest.
2. Generate once at 9:16 with a centred subject and headroom, then compose 4:5
   and 1:1 deliberately: for video in `metrix-video-assembly`, for a static by
   repositioning proof and type for that canvas. A plain post crop is not an
   option, because it can remove the subject, proof or readable text.

Never mix: a matrix row whose cells are different ratios is not a test of the
isolated variable, it is a test of the ratio.

## Duration

Take it from `creative_specifications.duration_seconds`. Where the brief does not state
one, most Kie video models offer a small fixed set of lengths rather than an
arbitrary number, check `model-routing.md` for the model's allowed values
and pick the shortest that carries the idea. Longer costs more credits and
rarely improves a hook test, which is decided in the first seconds.
