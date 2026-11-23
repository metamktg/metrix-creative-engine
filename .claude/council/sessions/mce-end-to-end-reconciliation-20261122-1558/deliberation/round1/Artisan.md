## Artisan Position — MCE end-to-end reconciliation (visual system, GFX, transitions, captions)

**Core recommendation:** Make the *look* a compiled, checked contract, the way placement zones already are. One `mce.look/1` file per run (compiled from the brand kit: colour, type, caption style, motion and transition tokens) feeds the single Chrome renderer for every format (video, static-compose, carousel, shopping, motion graphic), and the render and QA gates measure the result (contrast, type floor, safe zone, transition-vs-timeline parity) instead of trusting the HTML author.

**Key argument:**
The engine already proves the pattern works: `placement-zones.json` is one table with provenance, `render.mjs` now reads it through `zoneFor()` (`skills/metrix-video-assembly/scripts/render.mjs:547`), and the render check fails a box inside the overlay bands. Everything else visual is still hand-authored and unchecked. The composition template hard-codes its palette and fonts (`assets/template/index.html:21-27`: `--bg #f4efe6`, `--ink #101010`, `--accent #8a5a2b`, `@font-face` commented out), and no script reads `brand-kit.json` into CSS (grep for `var(--` across assembly and ad-creative scripts: zero hits). There is no contrast check anywhere in render, render-checks or qa-video, so white captions with a 45% shadow (`.on-image`, template line 37) over a bright Kie frame pass every gate. Transitions live outside the timeline: the runtime supports `cut|fade|dip|slide|zoom` per scene and defaults to `dip` (`runtime.js:11,63-64`), but the timeline schema only knows points of kind `cut|event` (`timeline/schema.mjs:109`), so `timeline emit` cannot produce a transition, the template dips between every scene by default, and `qa-video` `transitions.at_cuts` assumes hard cuts and would flag a `fade` crossfade as double exposure (`qa-video.mjs:32-34`). SFX carry `at` and `why` (`schema.mjs:134`) but are not bound to the transition or text slam they accent. Top-tier agency finish is not more effects; it is a small vocabulary used with intent and verified frame by frame: hard cuts on beat by default, a motivated transition only at a role change (hook to show, proof to offer), every whoosh tied to the transition it sells, captions in one house style with a plate or stroke that clears contrast on the worst pixel under them, and the same type scale and tokens on the static, the carousel card and the end card. Putting this into the format registry (Q4) and the run spine (Q2) means every format reads the same look and every gate proves it.

**Risks if ignored:**
- Visual drift across formats: each static, carousel card, SKU overlay and video end card gets its own one-off CSS, so the same campaign ships three type scales and two reds, and carousel seams do not line up.
- Unreadable captions and CTAs ship green: no gate measures text contrast against the generated background, and model frames vary per take, so legibility is luck. The only type check is a size floor (`W * 0.03`, `render.mjs:548`, duplicating `min_font_ratio` in the zones table).
- Transition and SFX choices stay unreviewable: they are authored in HTML attributes the timeline does not know, so `timeline check` cannot hold them to beats or roles, QA cannot tell an intended crossfade from a bad blend, and whooshes drift off their cuts.

**Dependencies on other domains:**
- Architect: format registry (Q4) carries per-format `look` requirements (which tokens, which gates); run spine (Q2) records `look.json` by sha256 like other stage inputs; timeline schema gains an optional `transitions[]` (new field optional, per AGENTS rule).
- Craftsman: vitest fixtures for the contrast check (known-bad white-on-white frame must FAIL, plated caption must PASS), a transition parity test, and a brand-kit compiler unit test; all inside `npm run verify`, no spend.
- Advocate: caption readability standard (chars per line, CPS already in `captionRules`) and sound-off comprehension of the first second.
- Skeptic/Operator: font licensing path for client brand fonts (only Google Fonts are installed; licensed faces come from kit files), and render-time budget for the extra contrast sampling.
- Owner/Guardian (fact, not policy debate): `brand-kits/eastcoastartstudio/` is git-tracked (`git ls-files` lists four files) and names a real account, while the map describes brand-kits as anonymous/sample; the `look` compiler should read kits from the private run dir, with an anonymous sample kit as the committed fixture.

---

## Appendix A — Proposed `mce.look/1` (compiled tokens)

Primitive -> semantic -> component. Compiled by a pure `look compile <brand-kit.json>` step; written into the run dir; injected into the composition as CSS custom properties by `render.mjs` (same channel as `window.__MCE`).

| Layer | Token | Source | Example |
|---|---|---|---|
| Primitive | `color.ink`, `color.paper`, `color.accent` | brand-kit colours / logo `artwork_colour` | `#101010`, `#f0f0f0` |
| Primitive | `font.display`, `font.body` + files/hashes | brand kit fonts or named Google family | resolved and health-checked |
| Primitive | `type.scale` | fractions of frame width, ratio-aware | hook 0.084, line 0.050, cta 0.054, caption 0.046, floor = zones `min_font_ratio` |
| Semantic | `text.on-image`, `text.on-paper`, `surface.plate` | derived | plate = ink at 0.72 alpha |
| Component | `caption.house` | fill, stroke or plate, active-word highlight, max_lines 2 | one style per run |
| Component | `cta.button`, `endcard.logo` | logo role (primary/reverse) by ground luminance | reverse logo over imagery |
| Motion | duration and easing scale (Appendix B) | fixed house scale | |

Rules: no raw hex or px in components; the min type floor reads `min_font_ratio` from the zones table instead of the `0.03` literal in `render.mjs:548`.

## Appendix B — Motion Design Specification (motion-design skill)

### Step 1: Motion opportunities in an ad
- State: text enter/settle/exit (hook, label, CTA), caption cue change, price/offer reveal.
- Navigation: scene-to-scene transition (cut, dip, push/slide, zoom/whip).
- Feedback/attention: CTA pulse in the last second, product callout, count-up of a number.
- Data: carousel card-to-card continuity element; shopping price badge.

### Step 2: Motion principles (frame-based at 30 fps, the timeline clock)
| Property | Value | Usage |
|---|---|---|
| Duration micro | 4 f (0.133 s) | caption cue in/out, active-word highlight |
| Duration short | 8 f (0.267 s) | pop, label, badge |
| Duration medium | 0.35 s (= `settleDefault`, `rules.mjs`/`runtime.js:37`) | hook rise/slam, dip, push |
| Duration long | 15 f (0.5 s) | end card resolve; ceiling for any single move |
| Ease enter | cubic out `1-(1-p)^3` (`runtime.js:42`) | all enters |
| Ease scene | cubic in-out (`runtime.js:43`) | scene exits, dips |
| Ease overshoot | back, c1 1.70158 (`runtime.js:44`) | `pop` only, CTA and badges |
| Stagger | 3 f (0.1 s), max 5 items | multi-line hook, bullet proofs |
| Distance | rise 0.6 em, slide 6% frame | as in runtime today |

`data-dur` must be one of the scale values (timeline check enforces; free numbers become a WARN then FAIL).

### Step 3: Specs
**Hook text (first second, sound off)** — Trigger: t=0 or first cut. Property: opacity + translateY / scale. From -> To: `rise` 0.6em->0 or `slam` scale 1.35->1. Duration: medium. Easing: enter. Must be settled by 1.0 s (existing `line_unread` craft check).
**Caption cue** — Trigger: phrase start from phrase map. Property: opacity; active word colour. Duration: micro. Easing: enter. Exit fade micro (`exit_fade` rule).
**Scene transition** — Trigger: timeline `transitions[]` entry. `cut` (default, 0 frames, snapped to beat or phrase edge); `dip` medium, only at a ROLES boundary (`hook|show|proof|offer|cta`, `schema.mjs:54`); `push`/`whip` medium, only with a bound SFX; crossfade `fade` allowed only when declared, and QA exempts exactly that window.
**SFX accent** — bound by `transition_id` or `text_id`; onset lands within the existing `onsetGuard` lead (`rules.mjs:57`) of the visual event, volume <= 0.6, under the sidechain duck of the bed (`audio-graph.mjs:30`).
**CTA end card** — logo resolve long + CTA `pop` short at +3 f; one pulse (scale 1->1.04->1, medium) no earlier than 1 s before end.

### Step 4: Choreography (end card)
1. Background settles at 0 ms (cut, beat-snapped).
2. Logo fades in at 0 ms (500 ms, ease-out).
3. Offer line rises at 100 ms (350 ms, ease-out).
4. CTA pops at 200 ms (267 ms, back).
5. SFX tick on the CTA pop onset.
Exit: none (hold to end; poster frame taken from the settled state).

### Step 5: Reduced-motion alternatives (ad equivalent)
| Animation | Full motion | Reduced / static deliverable |
|---|---|---|
| Hook slam/rise | scale/translate | settled frame is the poster and the static-compose variant |
| Scene push/whip | transform | hard cut |
| Caption cue | fade + word highlight | `clean` mode (already `modes: cap|clean`) plus SRT |
| CTA pulse | scale | static CTA |
Every animated element must be legible at its settled frame; the static and carousel routes render that settled state from the same composition, so the still and the video can never disagree.

### Step 6: Performance
- Animate only opacity, transform and clip-path (runtime already does: `runtime.js:87-121`); no width/height/top/left.
- Frame-accurate seek is deterministic (`window.__seek`), so the cost is render time, not dropped frames; contrast sampling reuses the frames and `__layout` boxes `check` already captures.

## Appendix C — Gates to add (all no-spend, inside `npm run verify`)
1. `contrast` in `render.mjs --mode check`: for each text box at its settled time, compute WCAG contrast between text colour and the 95th-percentile worst background luminance under the box; FAIL below 4.5:1 (3:1 when type >= large threshold of the type scale). Plates/strokes count as background.
2. `transition parity` in `qa-video --timeline`: every declared transition window is exempt from `transitions.at_cuts`; every undeclared blend still fails.
3. `look parity`: rendered computed styles of text items use only `--look-*` tokens (runtime reads `getComputedStyle`, compares against `look.json`).
4. Carousel seam check: continuity element x/y matches across card edges within 1 px; card grid from one template.
5. Shopping: rendered price text equals feed field by SKU (Architect's feed reader), styled by `cta`/`badge` tokens.
