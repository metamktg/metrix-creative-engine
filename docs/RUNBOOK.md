# Creative runbook

One prompt per media format. Give it a brief, it gives you a named asset.

## Before any run, twice

1. **Check the brief.** `kie_validate_brief`, or ask for it in words. Free,
   offline, and it refuses an unrenderable brief before a credit is spent.
2. **Upload the brand kit.** `node scripts/kie.mjs upload ./product.png` per
   file, and put the returned URL in the brief. Skip this and the model invents
   a plausible generic product: right category, wrong brand, unusable.

## The table

| Format | `asset_type` | Prompt | Must supply | Also reads | Produces |
| --- | --- | --- | --- | --- | --- |
| Single image | `static` | `kie_render_static` | ◆ brief, ▲ placement | ■ product refs, ◇ on-image text | 1 image |
| Carousel | `carousel` | `kie_render_carousel` | ◆ brief, ▲ card structure | ■ product refs | 3–5 images, one system |
| Video | `video` | `kie_render_video` | ◆ brief, ▲ duration | ■ approved still ✦, ■ product refs | 1 clip |
| UGC | `ugc` | `kie_render_ugc` | ◆ brief, ▲ duration | ■ product refs | 1 clip, 9:16 |
| AI-UGC ✱ | `ai_ugc` | `kie_render_ugc` | ◆ brief, ▲ duration, ▲ script or audio | ■ avatar ref | 1 talking-head clip |
| Motion graphic | `motion_graphic` | `kie_render_motion_graphic` | ◆ brief, ▲ duration | ■ logo, ■ type spec | frames, or 1 clip |
| Claymation | `claymation` | `kie_render_claymation` | ◆ brief, ▲ ratio | ■ real props or set refs | 1 image or clip |
| — | Brand kit setup | `kie_brand_intake` | ◆ brief | ■ any client asset | uploaded URLs |
| — | Sprint test ✧ | `kie_mst_sprint` | ◆ brief set, ▲ isolated variable | ■ product refs | one matrix |

### Legend

| | |
| --- | --- |
| ◆ | **The brief**, as JSON. Everything else is optional detail on top of it |
| ▲ | **Required by the brief** — the render is blocked without it |
| ■ | **Reference material** — uploaded URLs, not local paths |
| ◇ | A switch inside the format that changes which models are eligible |
| ✦ | Strongly preferred: approve a still first, then animate it. A bad composition costs image credits to reject, not video credits |
| ✱ | Avatar model parameters are **unverified**. Fetch the model page before the first run |
| ✧ | **Optional.** A Matrix Sprint Test is a sprint you choose to run, not a stage every brief passes through |

**Ratio comes from placement, never from the prompt text.** Feed `4:5`, feed
plus right column `1:1`, Stories and Reels `9:16`, in-stream `16:9`.

**An `asset_type` not in this table stops.** It is not routed to the nearest
neighbour: a static rendered for a brief that asked for motion looks finished,
passes a casual review, and fails the thing the brief was testing.

---

## The prompts

Each is self-contained. Paste one, attach or name the brief, run it.

### Static

```
Render the static in this brief.

1. Validate the brief first and stop on any error.
2. Upload every brand asset that has a local path; use the returned URLs.
3. Ratio comes from the placement, as a model parameter, never as prompt text.
   Only the Nano Banana family offers 4:5 natively. Never crop to reach a ratio.
4. If the brief requires text rendered into the image, restrict yourself to the
   text-capable models; otherwise use the general static set.
5. One clear subject, large in frame, simple ground, strong value contrast.
   Reserve and name any clear area where a logo will be composited.
6. State which model you chose and why before spending anything.
7. After the render, run the final pass: shown the asset alone, would a
   strategist recognise the concept this brief describes? If it is merely
   competent and generic, revise. Then name the file after the brief id.
```

### Carousel

```
Render the carousel in this brief.

1. Validate the brief first and stop on any error.
2. Upload every brand asset that has a local path; use the returned URLs.
3. Write ONE base prompt, then one short card clause per card. Do not write a
   separate prompt per card.
4. Lock across every card: model, ratio 1:1, resolution, seed where exposed,
   the light and palette clauses verbatim, the product references in the same
   order, and one environment family.
5. Card one does the stopping. The rest reward the swipe. Take the sequence
   from the brief's copy architecture.
6. Before delivering, look at the cards together: if they do not visibly belong
   to one system, the format has lost its advantage. Revise rather than ship.
7. Final pass, then name the files after the brief id, numbered in sequence.
```

### Video

```
Render the video in this brief.

1. Validate the brief first and stop on any error. Motion needs a duration.
2. Upload every brand asset that has a local path; use the returned URLs.
3. Default workflow, still first: generate the opening frame as a static under
   the static rules, get it approved, then animate it with an image-to-video
   model. Go straight to text-to-video only for cheap exploration or if the
   brief says so.
4. The opening frame is the thumbnail and the first two seconds decide the
   result, with sound off. Build outward from that frame.
5. Ratio from placement, duration from the brief, both as model parameters.
6. State the model and why. Raise the wait timeout well above the default:
   video routinely runs past five minutes.
7. Final pass, then name the file after the brief id.
```

### UGC

```
Render the UGC asset in this brief.

1. Validate the brief first and stop on any error. Motion needs a duration.
2. Upload every brand asset that has a local path; use the returned URLs.
3. Do not write "UGC style". Write camera terms: phone camera, handheld,
   selfie or front-facing framing, natural mixed light from a window or a lamp,
   a real lived-in room, slightly off-centre framing caught mid-moment,
   everyday clothing, natural expression.
4. 9:16. Resist polish: over-production removes the only reason to choose this
   format.
5. Write the look into the brief's translation once and reuse it, so "UGC feel"
   never becomes a hidden variable between assets.
6. Final pass, then name the file after the brief id.

For a talking head (asset_type ai_ugc): the avatar models' parameters are
UNVERIFIED. Fetch the model's page on docs.kie.ai and confirm every field
before the first run, and treat that run as a test.
```

### Motion graphic

```
Render the motion graphic in this brief.

1. Validate the brief first and stop on any error. Motion needs a duration.
2. Decide the route before spending, and say which you chose:
   Route A, generate designed frames as statics where type and geometry are
   controllable, then animate in post. Slower, and correct.
   Route B, generative video end to end. Fast, and it warps type, wobbles
   geometry and drifts logos.
   If the idea depends on legible type, a mark holding its shape, or a number
   staying the same number, take Route A.
3. Upload the logo and any brand assets; use the returned URLs.
4. 6 to 15 seconds, sound off, the first second doing the work.
5. Final pass, then name the file after the brief id.
```

### Claymation

```
Render the claymation asset in this brief.

1. Validate the brief first and stop on any error.
2. This is a STYLE, not a model. No model is a claymation model, so the routing
   table does not constrain you: any eligible image or video model can do it,
   and the look comes entirely from the prompt.
3. Prompt the material: modelling clay, visible fingerprints, felt, paper craft,
   a miniature built set, practical light.
4. If the client has real props, models or a built set, upload them as
   references. Nothing else gets you the handmade read this reliably.
5. For motion, lock the look in an approved still first and animate from it.
   The style is fragile and video credits are the expensive way to discover it
   did not hold.
6. Final pass, then name the file after the brief id.
```

### Brand kit intake

```
Set up the brand kit for this client before any render.

1. Establish what exists: product photography per angle, logo and wordmark,
   brand colours as hex, type, and any real props, models or set.
2. Upload each file and record the returned URL against its role.
3. Name what is missing plainly. A missing product reference is not a small
   gap: without it every render invents a plausible generic product, and the
   result looks finished while being unusable.
4. Write the URLs back into the brief's brand assets block so every later
   render reads them from one place.
```

### Matrix sprint test (optional)

```
Build and render the Matrix Sprint Test described in these briefs.

1. This is optional. If the account was not running a sprint test, stop and say
   so rather than imposing a matrix on ordinary work.
2. Validate every brief. Matrix mode requires one isolated variable per cell.
3. Prove the isolation before spending: take any two cells in a row and diff
   them. Exactly one thing may differ. If more differs, or nothing does, the
   row measures nothing and the matrix is not ready.
4. Lock the model, ratio, resolution and seed across the whole matrix.
   Switching model mid-matrix is the largest uncontrolled variable available.
5. Name every asset for its descriptive variable, never for its coordinate. A
   cell reference is an index, not a name.
6. Final pass twice: does each asset express its brief, and placed beside its
   siblings, is the difference visible and attributable to the variable rather
   than to noise?
```
