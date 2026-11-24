## Architect Response to Craftsman

**Their position:** Make every handoff a typed, versioned `mce.run/1` artifact and prove the chain with one zero-spend golden run per format-registry entry (brief fixture -> plan -> stubbed Kie -> render -> qa-video -> review gates -> handoff receipt), starting from what the repo already has fixed rather than from the audit's list.

**My response:** Modify

**Reasoning:** Craftsman is right on the facts and I withdraw two Round 1 claims. I checked: `1343e47` ("Render check takes safe-zone bands from the placement table") is committed, and `render.mjs --mode check` now resolves `format.placement` through `zoneFor`. `f2ed82a` ("Brief gate keeps and checks the matrix row that make-row reads") is on the branch, and `src/brief.ts:109-110` declares `matrix_naming_convention` and `cells`, with `:162-183` checking mode, convention presence, unresolved naming keys and duplicate cell names. A third claim was also overstated. `qa-video.mjs:420-428` already puts `sha256` of the video and of the timeline in its report. What it lacks is a `schema` id and a file output: it only prints to stdout. My error was taking audit findings (1) and (3) as current state without checking `git log`. Two findings were fixed in the 20 minutes between the audit and Round 1. That is exactly the class of mistake a hash-bound run manifest exists to prevent, so the main argument gets stronger, not weaker. The seams that are still open, which I re-verified at HEAD `4344ad3`, are these:

1. `scripts/validate_review_gates.py` has no reference to qa-video output, so review can pass a FAIL from QA.
2. `src/` never loads `prompts/03-handoff.md`, and no `mce.run` exists anywhere.
3. Format knowledge still disagrees. `claymation` is in `ASSET_TYPES` (`brief.ts:23-31`) but not in `MOTION_TYPES` (`:36`), and `src/prompts.ts:71` hard-codes the production-review list as `ugc|ai_ugc|video`.
4. Three copies of `kie.mjs` exist next to `src/client.ts`.
5. There is no plugin manifest.

So I take Craftsman's sequencing. The council plan should open with a fact sheet re-derived from HEAD, with each line citing a commit or a file:line, and every work item has to point at a line on that sheet. I keep my structural position. The registry (`src/formats.ts`, bundled into the .mjs CLIs) and the `mce.run/1` schema have to exist before Craftsman's golden runs can assert anything, because a contract test with no contract only pins today's drift. The brief->plan test Craftsman lists ("cells survive validateBrief and reach make-row") becomes a regression guard for `f2ed82a`, not a fix.

**Corrected fact sheet (supersedes Round 1 risks list items on brief stripping and safe zone):**

| Claim | Round 1 | Verified at 4344ad3 | Evidence |
|---|---|---|---|
| brief.ts strips cells / matrix_naming_convention | open | FIXED | f2ed82a; src/brief.ts:109-110, 162-183 |
| render.mjs 20% vs zones 35% | open | FIXED | 1343e47; render.mjs uses zoneFor/checkBoxes |
| qa-video has no input hashes | open | PARTLY WRONG: has video + timeline sha256, lacks schema id and file output | qa-video.mjs:420-428 |
| review gates never read qa-video | open | OPEN | no qa reference in scripts/validate_review_gates.py |
| 03-handoff.md never loaded / no run manifest | open | OPEN | no `03-handoff` or `mce.run` in src/ |
| format knowledge drift | open | OPEN | brief.ts:23-36 (claymation), prompts.ts:71 |
| two+ Kie protocol implementations | open | OPEN (3 kie.mjs copies + src/client.ts) | skills/{kie-generate,kie-tasks,metrix-ad-creative}/scripts/kie.mjs |
| skills not packaged as plugin | open | OPEN | no plugin.json / .claude-plugin |

**Compromise proposed:** Craftsman owns the golden-run harness and the fact sheet as its first artifact. Architect delivers `mce.formats/1` and `mce.run/1` zod schemas first, then a `schema: "mce.qa/1"` stamp plus `--out` on qa-video, so the qa->review test can be written against a real contract.
