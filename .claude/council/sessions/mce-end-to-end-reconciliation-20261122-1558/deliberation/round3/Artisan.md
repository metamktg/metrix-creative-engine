## Artisan Final Position — MCE end-to-end reconciliation (look, GFX, transitions, captions, SFX)

**Revised recommendation:** Build the order the council agreed: merge the branch with CI green, then the format registry and run spine, then make the visual layer a checked contract. The look is its own per-run contract, `mce.look/1`. It enters `mce.run/1` as a hash-bound FileRef. The registry names each format's look slots and visual gates. Transitions become strict timeline data, `transitions[]`, which `timeline emit` writes out as `data-trans-in/out`. Each visual gate is a pure module with generated FAIL/PASS lavfi twins inside `npm run verify`, and none of it merges before `mce.qa/1` feeds review.

**Concessions made:**
- **Order.** I accept Architect's order and Craftsman's fact-sheet-first rule. Step 1 is merging `engineering/jolly-hamilton-dwi3ej` with CI green, because 1343e47 and f2ed82a are not on origin/main. Next come the registry and run schemas. Look and contrast work can be built in parallel but merges only after `mce.qa/1` reaches `validate_review_gates.py`. A contrast gate that review never reads proves nothing.
- **Stale premise withdrawn.** The safe-zone mismatch is fixed. `render.mjs:42/547` imports and uses `zoneFor()`. My only remaining safe-zone point is the type floor: `render.mjs:548` still hard-codes `W * 0.03`, and it should read `min_font_ratio` from the zones table.
- **Fonts.** Licensed client faces stay out of CI. Every visual test uses the committed OFL Geist fixture (`src/__tests__/fixtures/fonts/Geist-Regular.ttf`). Client fonts come only from private kits in the run dir.
- **Zero-spend proof.** Golden runs stay deterministic and spend nothing. Real model frames come from a small corpus generated once and replayed. I am not asking for live Kie calls in CI.
- **Scope.** No 200-token system. The look carries only what the gates and formats use: about 12 primitives, 6 semantics and 5 components (Appendix A of round 1, trimmed). Any token that no format slot reads gets cut.
- **Vocabulary.** Transitions use the runtime's existing enum, `cut|fade|dip|slide|zoom` (`runtime.js:11`). I drop `push`/`whip` as kind names: `slide` covers push, and a whip is `slide` plus a bound SFX. No renderer changes for new kinds.
- **SFX binding.** In the plan schema `sfx.at` is already a ref (`timeline/schema.mjs:134`), so it can point at the same cut point as the transition. I adopt Architect's optional `sfx[].bind`, naming a transition id or text id. The check is that the bound target's anchor equals `sfx.at`. The field is optional, per the AGENTS rule.

**Non-negotiables:**
1. **Measured contrast on the worst pixel.** Every text box at its settled frame is measured against the 95th-percentile worst background luminance under the box, with plates and strokes counted as background. FAIL below 4.5:1, or below 3:1 for type at the large step of the scale. Model frames change every take, so readable captions and CTAs cannot depend on luck.
2. **No undeclared transitions.** The runtime defaults to `dip` (`runtime.js:63-64`), so `emit` must always write `data-trans-in/out`, with `cut` as the default. Any blend window not declared in `transitions[]` fails `qa-video`. Declared `fade`/`dip`/`slide`/`zoom` windows get exempted from the same data. Exemptions are derived into the existing `mce.qaexempt/1` windows (`qa-video.mjs:45-49`) so nobody hand-writes them.
3. **Durations on the house scale.** Durations are integer frames on the scale: 0 / 4 / 8 / 11 (settle, 0.35 s) / 15. A transition other than `cut` is allowed only at a ROLES boundary (hook, show, proof, offer, cta) or with a bound SFX.
4. **Textured test media.** Golden runs use structured lavfi media (testsrc2, gradients, geq noise), never flat colour behind text, plus a variance floor check on the fixture itself. A gate that passes on flat media has tested nothing.
5. **FAIL/PASS twins for every gate.** Each visual gate ships a generated known-bad and known-good pair in the pattern of `src/__tests__/qa-video-exempt.test.ts:92`, a testsrc2/testsrc blend over a frame window. No gate merges without its FAIL twin failing.
6. **One look, every format.** Video, static-compose, carousel cards, shopping overlays and end card all read one `look.json` through the same renderer. The static and the poster are the settled frame of the same composition, so the still and the video cannot disagree.
7. **Committed data stays anonymous.** The committed look fixture is an anonymous sample kit. Real brand kits are read only from the private run dir.

**Implementation notes:**

| Step | Artifact | Spec | FAIL / PASS twin |
|---|---|---|---|
| 1 | merge branch | CI green on origin/main | n/a |
| 2 | registry `formats[].look` | per format: required slots (`caption.house`, `cta.button`, `endcard.logo`, `badge.price`, `card.grid`) and gates (`contrast`, `transition_parity`, `seam`, `sfx_sync`, `price_match`) | registry test: a format naming an unknown gate fails |
| 2 | `mce.look/1` + `look compile` | pure function from brand kit to tokens, emitted as `--look-*` CSS custom properties through the `window.__MCE` channel. No raw hex/px in `assets/template/index.html:21-27`, which becomes `var(--look-*)` only | vitest: kit without ink/paper fails; sample kit compiles to a byte-stable hash |
| 3 | timeline `transitions[]` | `{id, at: ref(point), kind: cut\|fade\|dip\|slide\|zoom, frames: int on scale, why}`; `emit` writes trans-in/out on both adjacent scenes | `timeline check`: off-scale frames fail; non-cut kind with no role change and no bound SFX fails |
| 3 | `sfx[].bind` (optional) | transition or text id; `check` requires that `sfx.at` equals the anchor; onset within `onsetGuard` (`rules.mjs:57`) in qa | SFX drift twin: whoosh 5 f late fails, on-point passes |
| 4 | `contrast.mjs` (pure) | input: frame buffer, box, text colour, plate; output: ratio. Wired into `render.mjs --mode check`, reusing the frames and `__layout` boxes it already captures, so no extra render pass | white text on a bright geq gradient with no plate fails; same text with `surface.plate` (ink at 0.72) passes |
| 4 | type floor | `render.mjs:548` reads `zone.min_font_ratio` | caption at 0.025 W fails |
| 4 | transition parity | `qa-video --timeline` derives exempt windows from `transitions[]` | declared 10 f fade at 1.4-1.53 s passes; the same blend undeclared fails (`qa-video-exempt.test.ts:92` graph) |
| 5 | carousel seam | continuity element x/y matches across card edges within 1 px | 3 px offset fails, aligned passes |
| 5 | shopping | rendered price string equals feed SKU field, styled with `badge.price` | mismatched price fails |
| gate | review | `validate_review_gates.py` reads `mce.qa/1` including the visual gates; an absent or failed visual gate blocks handoff | review fixture with contrast FAIL is rejected |

Motion specs (from round 1 Appendix B) are unchanged. Enters use cubic out (`runtime.js:42`). Scene moves use cubic in-out. Back overshoot is for `pop` only. Stagger is 3 f with a maximum of 5 items. The hook is settled by 1.0 s. The end card runs logo 15 f, offer rise +3 f, CTA pop +6 f with its SFX bound to the pop, and one pulse no earlier than 1 s before the end. Animate only opacity, transform and clip-path.

Budget: contrast sampling reuses check-mode frames, and twins are 160x288 lavfi clips of 3 s or less, matching the existing exempt test, so the cost to `npm run verify` stays in seconds.
