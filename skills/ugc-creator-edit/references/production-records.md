# UGC production records and budget checks

These are agent-maintained sidecar conventions. They do not add fields to the engine's Zod schemas, Kie requests or Higgsfield parameters, and they do not automatically enforce a provider-side limit.

## Records

Keep `brand_translation.json`, `render_spec.json`, `assets/` and `validation_report.json` where the engine already expects them. Add `ugc-production.json` to the run's output directory with the following groups. Keep credentials and secret-bearing URLs out of shared reports.

| Group | Minimum useful contents |
| --- | --- |
| `run` | Run ID, brief ID/source/hash, source repository revision, output directory, mode, declared deliverable IDs and type (master, variant, placement export) |
| `authorization` | User instruction reference, agreed scope, ceilings by provider/account/unit, approved provider/model roles, comparison locks, paid repair limit, required human reviews |
| `budget_buckets` | Provider/account/unit, authorized ceiling, known settled spend, settled costs still unreported and their held upper bounds, outstanding commitments, remaining finishing and repair reserves |
| `assets` | Asset ID, file/hash, provider/task ID when generated, role, source/output ranges, usable duration, speed, rights evidence, acoustic profile, acceptance evidence and reuse destinations |
| `shots` | Shot ID, deliverables served, purpose, gap/reuse decision, exact references, action/framing, trim handles, duration, acceptance criteria, paid repair count |
| `reviews` | Component, exact file/hash, reviewer/evidence, status (pending, accepted, rejected), scope/limits of acceptance, defect and dependent work affected |
| `delivery` | Final files and recipe/stem paths, validation evidence, remaining defects/checks, unique accepted deliverables, exports, source inventory, cost reconciliation |

Use null plus an explanation for unknown cost, duration or acceptance evidence. Never turn unknown into zero, success or approved.

Append job events to `ugc-jobs.jsonl` so a crashed run can recover accepted IDs without erasing earlier records. Use one record per transition, carrying a stable `request_id`, shot/deliverable IDs, provider/account/unit, exact settings or their file/hash, quote source/time/upper bound, reservation, job ID, observed status, actual cost and its source, downloaded file/hash, repair number and relevant review references. Suggested event labels: `reserved`, `submitted`, `submission_unknown`, `settled`, `downloaded`, `reviewed`, `released`.

Reconcile costs by unique provider/account/job ID, not by summing every event. Provider job status and human acceptance are distinct: a successful render can be rejected.

For Kie, keep `kie-ledger.jsonl` as the existing recovery record. Do not rewrite it with these additional event labels. Store sidecar cost facts from returned task records, including nullable `creditsConsumed`; the engine's current ledger does not retain that field.

## Pre-submission budget check

Apply separately to each provider/account/unit bucket:

`S + P + Q + F + R <= B`

- `B`: finite authorized ceiling, not the whole account balance.
- `S`: settled actual charges plus conservative held amounts for settled work whose cost is still unreported.
- `P`: outstanding commitments, including unknown submissions. Hold each once.
- `Q`: conservative quoted cost for the candidate request, including quantity. Use an upper bound for a range.
- `F`: remaining cost reserved to complete the approved deliverables after this candidate, excluding settled/outstanding/candidate work.
- `R`: remaining uncommitted repair allowance after this candidate. When spending from a reserve, move that allocation into `Q`; do not count it twice.

Use an explicit zero reserve only when no further paid finishing/repair capacity is needed or the authorized plan deliberately provides none. Do not invent a universal percentage. A plan that can fund raw footage but cannot fund required finishing is not affordable.

Check current available provider balance too. Account for commitments not yet reflected in that balance; do not assume every submitted job has already been billed. Avoid attributing another run's account activity to this one. Serialize reservation and submission, or use an existing genuinely shared reservation mechanism. These files alone are not an atomic budget service.

After reserving `Q`, move it into outstanding commitments and submit once. A known failure before submission can release it. An ambiguous transport failure cannot. Once settled cost is known, replace the held amount with the actual charge, including charges on failed/rejected generations. Do not release reservations simply because a wait timed out.

When no exact preflight exists, use a current authoritative rate with exact parameters and a conservative ceiling. If no bound can be established, mark the paid path blocked while continuing preparation, recovery or editing that does not depend on it. Do not burn credits to discover the price.

## Worked decisions (illustrative credits, not provider prices)

- Ceiling 100; settled 30; pending 20; candidate 25; remaining finish 15; repair 10. Total 100: budget fits, subject to all other gates.
- Same run with a 30-credit candidate totals 105: do not submit. Seek a cheaper valid route or a changed authorization.
- A 20-credit submission times out. Keep 20 pending and recover its ID/status. A replacement is not free headroom.
- A 10-credit repair is funded from a previously reserved repair allowance of 15. Candidate is 10 and remaining repair reserve is 5, not 15.
- A candidate fits the ceiling but would leave no funds for an already-required paid lip-sync step. It fails the completion plan until that step is reserved.
- Two providers each report 50 credits. They are separate buckets, never a combined 100-credit balance.

## Metrics and counting

Report actual and provisional costs separately. A spend figure with pending or unknown charges is not final.

- **Credits per accepted finished creative:** all known run generation spend, including rejected work, proofs and repairs, divided by unique authorized final masters/variants accepted for use. Report by provider; zero accepted finals means `not yet available`, with spend and count shown separately. Unknown charges make this provisional.
- **Accepted raw-footage yield:** unique reviewed usable source seconds divided by unique generated source seconds. Count overlapping reused ranges once; separate raw acceptability from final use. This diagnoses generation quality and is not a substitute for completed ads.
- **Credits tied to rejected generations:** actual charged cost for jobs with no accepted usable output; count each job once. State partial-use costs separately unless a transparent allocation is supplied.
- **Reuse:** identify which accepted sources served which deliverables. Reuse incurs zero new generation credits but may still incur edit/render cost.
- **Variants and exports:** only count an approved, materially distinct creative as a creative variant. Aspect-ratio exports, duplicate encodes, proofs and source clips are separate counts. Do not lengthen ads or add unrequested variants to improve a metric.
- **Cross-run reuse:** show incremental current-run spend and inherited source provenance. If reporting all-in economics, use a declared allocation for historical costs and never count the entire shared source cost against every derivative.

Do not treat a quoted estimate, an account balance delta affected by other work, or an assistant's historical statement as verified job-level spend. Do not convert credits to currency without a current rate applicable to that account.

## Finishing and presentation evidence

Add `music_plan`, `speed_map`, `shot_acceptance` and `defect_log` to the existing run records as described in [production-standard.md](production-standard.md). Keep recoverable voice/music/ambience/SFX stems, actual source/output ranges, rights restrictions and the final listening evidence. A deliberate dry mix requires a specific editorial reason and reviewer acceptance; silence is not an implicit music decision.

Use the separate `production-review.json` record in [review-gates.md](review-gates.md) for the five mandatory presentation gates. It binds exact local artifact hashes and distinct reviewer evidence. These are orchestration sidecars, not provider parameters, backend spending enforcement or proof that a human listened. Changed exports and changed component hashes make old approvals stale. Keep client-specific evidence private; use neutral IDs in shared summaries and review packets.

## Decision scope and production continuity

For each reusable choice, record whether it is engine-wide, brand/project or this run. Bind the accepted treatment reference by source/hash when one exists. A local layout, exact music offset, gain correction, performer, offer or temporary review exception must not become a universal engine default.

Keep brief-specific editorial criteria in the bound profile and timecoded review evidence: narration coherence and phrase-level consistency, any competing-voice diagnosis, intended music audibility/entrance, spoken/product synchronization, deliberate UI/composite treatment, clean transitions, gaze/action continuity and reading holds. Record actual measurement/listening methods and unresolved limitations. These criteria do not add model API inputs or automatically certify perception.

A presenter replacement creates new identity/performance acceptance, not a new license to regenerate every library asset. Retain accepted product and non-identifying B-roll originals with exact hashes and rights. Give derivatives their own paths and map their source ranges. Old faces, lips, distinctive identity cues, voice and acceptance need explicit reuse/continuity decisions. Describe whether a UI source is a generic feature illustration or evidence of the exact demonstrated interaction; the two are not interchangeable.

Before authorized cleanup, record a recovery plan, archive destination/manifest, critical-source hashes, retained editable/stem/rights/job records, free-space check, verification result and restore/resume entry point. Do not delete source material after a failed or partial archive. Mark unreadable paths and unresolved relinking honestly. Temporary run-specific review deferrals retain exact authority, affected gate/export, limits and resume condition; their missing checks remain NOT REVIEWED.
