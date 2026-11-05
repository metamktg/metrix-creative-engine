# Draft retention and rebuild policy

Keep the latest **three successful revision render sets per creative project or
deliverable**, plus the current set and every pinned set. Use a separate index
for each independent creative or variant family. A set includes its declared
master, placement exports and disposable review derivatives. Publish a set as
`successful` only after every declared render member is complete and verified;
this is render completion, not a presentation-review PASS. Failed and in-progress
sets never advance the retention window and this utility never deletes them.

Always preserve raw and generated source clips, reusable performances and
B-roll, source references and provenance, voice/music/ambience/effects stems,
rights evidence, recipes and edit decisions, transcripts/captions, generation
and cost ledgers, review records and everything needed to rebuild. Preserve
sources even when their latest rendered use is older than three revisions.
Historical review records survive cleanup; a removed reviewed export remains
identified by its recorded hash and is not described as still available.
Pin a revision when the exact historical render must remain available.

Only a file explicitly indexed with `disposable: true`, an allowed derived kind,
and membership in an older successful set can be deleted. Allowed kinds are
`revision_render`, `review_preview`, `contact_sheet` and `temporary_encode`.
Everything else is preserved. A source clip is never a disposable render simply
because it is an MP4. This utility never infers eligibility from extensions,
directory names, age, glob patterns or unindexed files, never scans media
directories, and never recursively deletes a directory.

## Index contract

Store `retention-index.json` alongside the project or run. Use schema version 1
with these exact fields; unexpected fields and duplicate JSON keys fail closed:

- `protectedPaths`: explicit root-relative files or directories to keep.
- `currentRevisionId`: a known revision ID, or `null` before any current set.
- `pinnedRevisionIds`: known revision IDs that must survive beyond the window.
- `revisions`: append-only revision records with a unique `id`, `status`,
  `references`, `artifacts`, and `completedAt` for successful sets.

Each artifact declares `path`, `kind`, `disposable` and `references`. All paths
use forward slashes relative to the supplied root. Record raw/generated sources
with kinds such as `raw_source` and `generated_source`; use `source_reference`,
`voice_stem`, `music_stem`, `recipe`, `ledger` and `evidence` for rebuild assets.
Use `disposable: false` for those assets. Unknown kinds are protected even if
incorrectly marked disposable.

Expand every dependency from recipes, source maps and review bundles into
`references` or `protectedPaths`, including referenced older render files.
References protect globally across all revisions, regardless of the referencing
revision's age or status. The utility cannot infer dependencies hidden inside
arbitrary JSON, scripts or binary project files. Build and review a complete
index before cleanup; do not manufacture one from a filename glob.
Missing declared dependencies or permanent artifacts block cleanup because
recoverability cannot be established. Broad protected directory guards may be
declared before those directories exist.

`completedAt` is an actual timezone-aware ISO 8601 completion time. Successful
times must be distinct; uncertain ordering blocks cleanup. Every successful set
declares at least one `revision_render`. Missing render members of retained
successful sets block cleanup. Already removed older disposable files are
reported as missing and left alone. Retention is a minimum: current, pinned,
shared and referenced files can keep more than three sets.

For additional protection, path components `.retention`, `source`, `sources`,
`raw`, `generated`, `references`, `voice`, `voices`, `music`, `stems`, `recipes`,
`ledgers` and `evidence` are never deletion candidates. Keep the index and
retention audits permanently. Path validation rejects traversal, absolute/UNC
paths, Windows device/stream aliases, symlinks and junctions/reparse points.
Candidates must be individual regular files with one hardlink. Case-insensitive
comparison protects Windows path aliases on every platform.

See [the neutral index example](../examples/draft-retention/retention-index.json).
Replace its paths and timestamps with verified project facts. It is not a
production inventory or permission to delete similarly named media.

## Dry run, review, apply

Python 3.10+ and its standard library are sufficient. Finish or pause rendering
and any process that changes this project before planning and applying:

```text
python scripts/retain_drafts.py --root <project> --index retention-index.json --plan <project>/.retention/cleanup-plan.json
```

The command writes only a new JSON plan, prints the candidate count and bytes,
and does not modify media. Omit `--plan` to print the full dry-run plan without
writing anything. Review its exact candidate list, retained IDs, protected
outputs, missing paths, index hash and file fingerprints. Confirm all source,
recipe and evidence dependencies are represented and all candidates are
reproducible disposable outputs.

Within the user's authorized cleanup scope, apply that exact reviewed plan:

```text
python scripts/retain_drafts.py --root <project> --index retention-index.json --apply <project>/.retention/cleanup-plan.json --report <project>/.retention/cleanup-audit.jsonl
```

The utility recomputes the whole plan before deleting anything, takes an
exclusive cooperative cleanup lock, checks again, and rechecks each file's
hash/stat and the index before its individual unlink. Changed plans, roots,
indexes or candidates stop cleanup. Plans and reports use exclusive creation;
choose new evidence filenames for another run. Keep the append-only index,
plan and durable JSONL deletion audit after success or partial failure.
Never re-label unknown files merely to make a plan pass.

Stop on exit 2, inspect the surviving files and audit, and create a fresh plan.
An error during unlinking can leave a partial cleanup; the audit records each
deletion intent and completed deletion, and the utility never expands the
candidate set to compensate. An interrupted process may leave a cleanup lock;
verify that no cleanup/render process is running before removing that exact
lock manually. The lock coordinates this utility only. Portable path checks
cannot make Windows unlink operations immune to hostile concurrent filesystem
swaps, so apply requires a quiescent project directory.

## Validation

```text
python -B -m unittest discover -s scripts -p test_retain_drafts.py -v
```

Tests use synthetic temporary files only and exercise retention, current/pins,
source/dependency protection, unsafe paths, links, stale plans, incomplete sets,
exclusive evidence creation and whole-plan preflight. No provider calls, paid
generations or production media deletions are part of these tests.
