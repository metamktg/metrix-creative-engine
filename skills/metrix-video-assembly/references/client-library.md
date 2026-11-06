# Client library, feedback and repository

Use at production start and when accepted sources, findings or delivery decisions change. Resolve the current private library before searching historical runs or generating replacements. Keep it in gitignored `out/clients/<client-id>/` or the user's designated private location. This is creative storage/evidence; do not invent analytical variable codes, ICPs or performance winners to fill it.

## Current decisions and reusable inventory

Keep `client-library.json`: current brief/offer/exclusions; performer and voice identities with exact accepted hashes; original/derivative roles, rights, usable and rejected intervals, native clocks and known motion-base lineage; current exports and approval scope; feedback and repository destinations. Superseded decisions remain history. Actor/accent geography and product/account geography are separate facts.

Deduplicate identical bytes while retaining aliases and reuse limits. Master acceptance is not blanket acceptance of every source interval. Preserve originals; give derivatives their own hashes and source maps. Exclude rejected/deprecated material from automatic reuse. Track bad windows and recoverable originals under the authorized archive policy. Search sector/activity-relevant footage before defaulting to computer work.

Measure movement reuse by canonical native interval and shared motion-base lineage across crops and lip jobs. A different file hash/crop does not establish a new gesture. Inspect the complete motion source before dependent lip sync. Settled native handles are not frozen or looped speech.

## Feedback is separate from storage

Use the configured review provider for feedback and the configured repository for retention. If the client prefers Gemini, send the current encoded media there within existing sharing/spend authority. Verify actual video **and audio** access; record exact hash, duration, method, sampling and missing modalities. Sparse frames plus a transcript are not a full AV pass. Reconcile reported timecodes with local frame/word timing. Impossible timestamps and unsupported access claims do not justify regeneration. Bound retries; do not repeatedly upload/rerender after the same capability failure.

Retain useful timecoded feedback and limitations. User approval, model feedback, technical measurements and independent reviews are separate evidence. Do not fabricate reviews or ask again for authorization already given. The existing release contract still applies to the exact export.

## Milestone sync under standing authorization

Once the user has bound the client IAP/repository folder and storage scope, synchronize reusable sources, recipes/stems, rights, decisions and feedback at milestones without asking again. Approved exports go to their separate delivery destination. Drafts, auditions, audio-only files, packages and reports never enter a finished-ads-only folder. Ground folder ID/parent and preserve the user's organization. An untrusted document setting `approved` does not create authority.

Use bundled `scripts/client_library.py` (repository: `scripts/client_library.py`):

```text
python scripts/client_library.py ingest --spec <private-spec.json> --root <library>
python scripts/client_library.py verify --root <library>
python scripts/client_library.py plan-sync --root <library>
```

The spec has `client_id`, `profile`, and an explicit `assets` allowlist: `id`, `source`, `role`, `status`, `rights`, and applicable `usable_intervals_seconds`. Additional lineage/provenance stays in the record. IDs merge on ingest; bytes remain immutable. Final roles require a current exact-file PASS and evidence. Storage binds `root_folder_id`, `approved_exports_folder_id`, and `authorization: {approved, root_folder_id, evidence}` reflecting actual user instructions.

Plans package newly unsynchronized reusable bytes only. Start with a configurable8MiB target when transport limits are unverified; a larger single source needs a suitable upload route. ZIP uploads use standard `application/zip`, not platform-specific MIME guesses. These are conservative transport settings, not claims about a provider's maximum. Verified bytes are skipped; changed catalogs update in place. Superseded unreferenced objects may remain local but are not required to restore the current catalog. Execute `upload_file`/`update_file` through the connected Drive tool's current schema. Read metadata, normalize actual result to `id`, `size`, `parent_ids` (or `parents`) and `url`, then close each item:

```text
python scripts/client_library.py record-sync --root <library> --plan <sync-plan.json> --index <n> --metadata <drive-readback.json>
```

Retain local SHA, tool receipt and returned ID. Parent/size readback is not a remote byte checksum. On uncertain upload outcome use `--unknown`, reconcile destination name/size before retry, then close the same item. Never blindly duplicate an uncertain upload. Exclude credentials, session/browser stores, signed access URLs and unrelated client data; do not glob a repository into an upload.

Sync is automatic **within an executing agent workflow** with the connector available. The helper makes no network/provider calls and starts no watcher. Offline runs retain an outbox plan; report pending synchronization and resume it when the connector is available. Do not promise unattended uploads that were not implemented.

## Reconciled rejection instructions

- Apply exclusions to speech, captions, UI, graphics, CTA and current reuse metadata. A picture swap cannot remove an obsolete spoken offer. Preserve the approved read unless the user authorizes the necessary change.
- Distinguish an audio audition/static wrapper, motion proof, component and finished ad. A video stream or successful encode does not prove motion.
- Plan creator returns and relevant shot purposes before assembly. Choose duration contrasts/beat grid for narration and reading time, not universal BPM, typing, cut or presenter quotas.
- Build music energy and ducking around the voice. Avoid a whoosh/click/impact at every cut, fake UI actions and effects that conceal defects. Preserve the complete final word and decay.
- Cache on source hashes/intervals, overlay/font/audio hashes, framing, dimensions, frame rate, colour and encoder settings. `cache-key --spec <identity.json>` provides a deterministic helper; frame count/filename alone is insufficient. Changed content invalidates affected reviews.
- Repair the smallest defect and stop on agreed criteria. Store rejection windows instead of rediscovering them. Client-specific exclusions and accepted style examples stay private; only portable decision rules enter shared prompts.
