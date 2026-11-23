## Artisan Response to Craftsman

**Their position:** Every stage handoff becomes a typed, hashed `mce.run/1` artifact, proven in CI by one deterministic zero-spend golden run per format-registry entry (stubbed Kie, ffmpeg lavfi synthetic media, real render/QA/review), with contract tests at each seam and live Kie kept to a manual smoke.

**My response:** Modify

**Reasoning:** I accept the golden-run spine and its determinism rule; my visual gates should ride on it, not on live Kie. But "synthetic" must not mean flat colour, and the golden run is the wrong layer to prove that a visual gate catches defects. Split it in two. (1) **Golden runs prove the plumbing and the happy path**: they feed `lavfi` *structured* sources instead of `color=c=gray` (which is what `render-health.test.ts:297`, `qa-options.test.ts:95` and `audio-length.test.ts:43` use today), so the contrast, seam and transition gates run against frames that vary in luminance and detail and cannot pass by default. `testsrc2`, `gradients`, `mandelbrot` and a `geq` bright patch are byte-deterministic for a pinned ffmpeg; `eye-state.test.ts:192` already uses `testsrc2`. (2) **Adversarial gate fixtures prove each gate fails when it should**, as small unit/contract cases. They are lavfi filter graphs written in the test, not hand-painted media, and the repo already does this: `qa-video-exempt.test.ts:92` builds a real double exposure as `testsrc2 [a]; testsrc [b]; blend=all_expr=...` over frames 40 to 50. The same pattern gives: white caption over a `geq` patch near white (must FAIL contrast), the same caption on the `surface.plate` token (must PASS); a declared crossfade window built with `xfade` (must PASS `transitions.at_cuts` only inside the timeline's `transitions[]` window, and FAIL when moved one shot later); two carousel cards rendered from one template with the continuity element shifted 2 px (must FAIL the seam check); an SFX onset placed `onsetGuard + 1` frame after its bound cut (must FAIL drift). Each pair is a FAIL/PASS twin, so a gate that passes trivially is itself a red test. That answers "cannot tell an intended blend from a bad one": the blend detector already tells a blend from a fade or dip by fit (`qa-video.mjs` header, `f ~ a*A + b*B + c`); what tells *intended* from *bad* is the timeline declaring the window, and that is a pure data assertion, no pixels needed. On fonts and budget, I concede: licensed client faces never enter CI. The committed kit uses the OFL face already in the repo (`src/__tests__/fixtures/fonts/Geist-Regular.ttf`, with its licence file, already loaded by `render-health.test.ts:268`) plus a named installed Google family, which exercises the real `@font-face` load path and the existing `unloaded_fonts` FAIL; a client's licensed font is proven at run time by that same check in the private run dir, not in CI. Render cost stays inside Craftsman's budget because contrast sampling reuses the settled-time frames and `__layout` boxes `--mode check` already captures (no extra Chrome launches), golden frames are small (the existing tests render 160x288 to 400x500), and the adversarial twins are mostly ffmpeg plus a pure contrast function on decoded pixels, with one shared Chrome render per format for look parity. My non-negotiable: every visual gate ships with its failing twin in `npm run verify`, and no golden fixture uses a single flat colour behind text.

---

### Proposed split (for Craftsman's Appendix A pyramid)

| Layer | Visual content | Media source | Chrome |
|---|---|---|---|
| Unit | `contrastRatio`, worst-percentile luminance under a box, `look compile` token output, transition-window exemption logic, SFX-to-event drift | arrays / tiny PNGs from lavfi | no |
| Contract | qa-video `--timeline` with declared `transitions[]` vs undeclared blend (`xfade` / `blend` graphs) | lavfi graph in test | no |
| Contract | render `--mode check` contrast FAIL/PASS twins; carousel seam twins | composition fixture + lavfi `geq`/`gradients` background | one render per twin set |
| Golden | full run per format with structured synthetic Kie media; asserts contrast, seam, transition, SFX rows present and PASS | stub Kie returns lavfi `testsrc2`/`gradients` clips, sine/anoisesrc audio | one per format (existing budget) |

### Fixture rules
- No `color=c=<flat>` behind any text box in a golden fixture (a fixture-hygiene test can grep for it).
- Every visual gate has a `*-fails` and `*-passes` twin; the test asserts the verdicts differ.
- Fonts in CI: OFL only (Geist fixture + one installed Google family). Licensed faces: run dir only, proven by `unloaded_fonts`.
- Committed brand kit is an anonymous sample; real kits are read from the private run dir.
- Pin the ffmpeg version in CI so lavfi generator output, and therefore golden hashes, stay stable.
