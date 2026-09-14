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
durations are not — Meta revises them. Check the current spec sheet at
<https://www.facebook.com/business/ads-guide> before a launch; do not treat the
pixel column above as authoritative on the day.

## Safe zones

Stories and Reels overlay UI on the creative. Keep anything that must be read —
a logo, a product, on-image text, a face — inside the middle band:

- top: leave roughly the first 14% clear
- bottom: leave roughly the last 20% clear

Generation models do not respect safe zones and cannot be reliably told to.
Compose for it instead: prompt the subject as centred, and treat the outer bands
as headroom. Check the rendered asset against the zones before upload. A logo
sitting under the profile row is a re-render, not a fix.

## One asset, several placements

Generating once at 1:1 and letting Meta crop to 9:16 loses the top and bottom of
the frame, which is where composition usually lives. Two options:

1. Generate per ratio. In a matrix this means the ratio is locked per row and
   each row is its own test. Cleanest.
2. Generate at 9:16 and crop down to 4:5 and 1:1 in post. Safe only if the
   subject is centred with headroom.

Never mix: a matrix row whose cells are different ratios is not a test of the
isolated variable, it is a test of the ratio.

## Duration

Take it from `creative_specifications.duration`. Where the brief does not state
one, most Kie video models offer a small fixed set of lengths rather than an
arbitrary number — check `docs/MODEL_CATALOG.md` for the model's allowed values
and pick the shortest that carries the idea. Longer costs more credits and
rarely improves a hook test, which is decided in the first seconds.
