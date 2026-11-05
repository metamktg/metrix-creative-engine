# Five mandatory presentation gates

Apply this contract to every finished creator-led UGC/video deliverable, including new versions and placement exports. All five gates must be PASS before approved client presentation. Generation success, a technical pass, a polished frame or a senior-sounding summary is not a substitute.

This is a local orchestration standard. It does not add provider API fields, spend authority or a server-enforced publication block.

## Prepare one current candidate

Finish the authorized edit, then create a local evidence bundle. Retain the exact master, approved brief, current spoken transcript, complete mixed voice, captions, edit decisions, source/rights map, delivery profile, approved registry snapshot, neutral blind packet and exact blind review copy. Prepare that packet/copy before reviews; the blind reviewer receives them only at the final gate.

Use relative local paths inside the run. The registry is an approved JSON snapshot with `approved_codes`, pinned to its authoritative source in the source map. Do not turn a regex extraction, code template or remembered prefix into an allowed-code list. IAP identifiers and technical media variables are separate.

The profile declares expected format/timing, placement/safe regions, sound/delivery requirements, and `sound_check_required_facts` for message, benefit, action and essential conditions. These facts are declared before the lay review. Where no material condition exists, state that explicitly instead of inventing one.

Include the brief-specific production criteria from `production-standard.md` in the profile and evidence: coherent narration/phrase consistency, audible subordinate music and its entrance, matching spoken/product beats, format-appropriate proof treatment, clean image handoffs, gaze/action continuity and readable holds. Bind any accepted treatment reference and its decision scope rather than imposing an inherited layout. No single numeric loudness threshold or final mix normalization certifies these judgments. Each final placement or captioned/clean export needs its own versioned record bound to its exact master; shared component evidence needs an explicit current-export binding.

Copy `templates/review-manifest.json` into the run, replace its paths and deliberately fill the production decisions. Use the preparation helper to hash the files and create five PENDING gates:

```text
python <skill>/scripts/prepare_review_record.py <run>/review-manifest.json --root <run> --out production-review.json
python <skill>/scripts/validate_review_gates.py <run>/production-review.json --root <run>
```

The helper never creates a review, marks a gate PASS or overwrites an existing review record. A new candidate needs a new version. Keep approval and rework history.

## Mandatory reviews

| Gate | Required review |
| --- | --- |
| `iap_variables` | Check actual approved registry membership and brief variables; matrix isolation/locks where applicable; actual encoded format, duration, frame rate, dimensions, ratio, codec, colour, audio, word/caption/CTA fidelity, safe regions, source provenance, rights, source ranges and speed/sync map. Compare each technical value with the bound brief/profile and keep measurement evidence. |
| `communications` | Judge the actual spoken and visible message: relevant hook and payoff, supported promise, understandable mechanism or evidence, concise progression, one intended action, accurate destination and essential conditions. No invented results, testimony, urgency or prelaunch CRO/retention improvement. |
| `sound_check` | The “12-Year-Old Sound Check”: an independent adult lay listener, or a declared audio-capable reviewer, hears the complete export once at 1x before reading the script. Capture unprompted answers: what is this, why does it matter, what should I do, and what conditions matter? Compare with the predeclared facts, then check captions and meaning muted at phone size. Do not recruit minors or equate one review with universal accessibility. |
| `editorial_peer` | A colleague who did not produce or edit the candidate watches and hears the full actual export at 1x, reviews the phone-size muted version, checks every cut, B-roll, transitions, mix, captions, CTA and final word/tail, and closes specific timecoded defects. Identify human and agent reviewers accurately. |
| `blind_review` | A separate fresh reviewer makes the final assessment from a neutral packet and the actual current review copy. Withhold authors, provider/model, cost, versions and prior verdicts. Use the same fixed clarity/delivery/proof/CTA rubric, lock the verdict after the other four gates complete and before unblinding, and report residual identity cues honestly. |

No weighted average can hide a failed mandatory check. Mark each required check as passed, failed or unperformed with evidence. The checks in `GATE_CHECKS` in the validator are the machine-readable checklist names.

### Listening and independence

ASR equality verifies recognized words; waveform measurements verify signal properties. Neither proves vocal naturalness, articulation, comprehension or human listening. An agent that only received text or frames cannot submit `full_audio_1x` or `full_av_1x` evidence.

Record reviewer kind as `human`, `audio_capable_agent`, `agent` or `automated`, together with actual capability and method. The listening, editorial and blind gates need a human or declared audio-capable agent with real full-media access. Do not rename an automated or text-only check to satisfy them.

Verify a review route's actual input handling before depending on it: confirm it receives the intended encoded video and audio rather than only an attachment name, transcript, sparse frames or a failed upload. Retain the tool receipt, access/method limits and any sampling gaps. Provider availability or an eloquent answer is not proof of media access. Do not convert a service error, partial review or capability probe into a full-media PASS.

The sound-check listener is a dedicated first-exposure reviewer, distinct from production/editing, all other gate reviewers, and applicability/music reviewers recorded in the context. Editorial review cannot be self-review. Blind review uses another reviewer, distinct from contributors, every prior gate reviewer and the recorded applicability/music reviewers, with no inherited project conversation or earlier feedback. Use stable opaque IDs; identity comparisons ignore outer whitespace and letter case, while the original context remains hash-bound.

### Honest blind review and anonymity

Use a randomized neutral asset ID and a minimal de-identified objective/audience/offer packet. Keep the private mapping from its hashed review copy to the exact master. Do not include source paths, account details, creator reputation, model labels, price or earlier grades in the packet.

A fresh context means a new reviewer session with only that packet and media. Passing a same-history subagent the instruction “be blind” is not blinding. Lock the verdict before revealing the production history.

This contract records `process_blind`, not guaranteed identity blindness. Logos, domains, voices or category cues can remain in legitimate creative. Record the residual cues; stripping a filename is insufficient. If identity masking is needed, make a reviewed derivative, hash it separately and disclose which changes could affect judgment. Do not silently remove necessary offer facts or pretend the derivative is the exact delivery master.

Reusable procedures, templates, fixtures, shared learning and public summaries contain no client, brand, industry or niche case details. Private run evidence retains only the identity/context necessary to produce and judge that actual creative.

## Evidence contract

`production-review.json` has `schema_version: 1`, a neutral asset ID, `artifacts`, `contributors`, `iap`, `production` and exactly five `gates`.

- Required artifact roles: `master`, `brief`, `script`, `voice`, `captions`, `edl`, `sources`, `profile`, `registry`, `blind_packet`, `blind_copy`. Each has a contained relative path and SHA256.
- `contributors` declares actual producer/editor IDs. `iap` declares standard or matrix mode, exact registry codes, applicability decision/reason/reviewer and matrix-lock evidence where applicable. A standard brief with no IAP codes needs an explicit non-applicability decision; the technical and other gates still apply.
- `production` records music selection or a specifically justified editorial dry exception, selected B-roll acceptance and a source/output speed map. Read [production-standard.md](production-standard.md). A normal-speed export is not permission to hide misleading source retiming.
- The blind packet/copy are bound artifact roles before any review. The final gate must reference these exact hashes; swapping a newly hashed derivative cannot preserve an earlier verdict.
- A PASS gate records reviewer, current master SHA256, context `bundle_sha256`, timezone-aware completion time, hashed evidence, required checks and no open blocking defects.
- Evidence methods distinguish `artifact_check`, `text_review`, `frame_inspection`, `full_audio_1x`, `full_av_1x` and `muted_phone`. Required methods must describe what actually happened.
- Sound-check evidence also retains the first-exposure, unprimed listening declaration, four unprompted answers and comparison with the pinned facts.
- Blind evidence retains the exact packet/copy hashes, exclusions, residual-cue review, freshness declaration, locked verdict and any later unblinding time.

The context digest binds artifact role hashes **and** the contributors, IAP and production decisions. It excludes gate verdicts to avoid recursion. The validator exposes `bundle_hash(record)` for preparing the value; reviewers must bind their own verdict after checking the current files and context.

All applicable technical variables must appear in the bound profile/source/measurement evidence. The validator checks local files, registry membership, record completeness, speed-map arithmetic, hashes and reviewer attestations. It does not independently probe every media property or certify what a reviewer perceived. Never describe a structured-record PASS as proof of perceptual quality.

## Release, repair and re-review

Run the validator immediately before approved presentation and retain its output:

| Exit | State | Action |
| --- | --- | --- |
| 0 | READY | All five evidence-bound gates pass. Present only the exact checked candidate. |
| 1 | FAIL | A rejection, unsafe path, invalid record, unresolved defect or stale/tampered binding blocks release. |
| 2 | NOT_CHECKED | Required review/evidence is missing, pending or unavailable. Complete it before release. |

When both failures and missing checks exist, FAIL takes precedence. An incomplete check is never a positive quality verdict.

Record each defect against the actual export hash and timecode. Make the smallest correction that preserves the brief, rights and comparison validity. Reuse accepted sources before paid replacement. A new master or relevant context change makes prior approvals stale; reviewers must explicitly reaffirm or repeat the appropriate work against the new exact candidate. Component evidence may remain useful, but copying old verdicts onto a new hash is not re-review.

Keep unfinished candidates internal and labeled with their pending gates. A working preview is not approved client presentation. Continue other authorized work while a gate is pending; do not invent a colleague, a blind session or a human listening decision to unblock it. Do not retroactively label earlier work as having passed this new standard.

If the user temporarily defers a check for a particular run, record the exact instruction, affected gate/candidate, limits and condition for resuming. Preserve the gate as deferred/NOT REVIEWED with its missing evidence; the validator remains non-READY. This permits authorized independent internal progress, not a synthetic PASS or an evergreen removal of that check. Do not apply one run's exception to other briefs, exports or later sessions.
