# Source of truth and regeneration

The reusable production contract is the versioned source in this checkout. The UGC skill, the assembly skill and the UGC and video MCP prompts share one finishing and review standard.

| Subject | Owner |
| --- | --- |
| Finishing and review rules | `skills/ugc-creator-edit/references/production-standard.md` and `review-gates.md` |
| Composed standard, served as `kie://production-review-standard` | `docs/UGC_PRODUCTION_STANDARD.md`, generated, never hand-edited |
| Preproduction packet and guarded lip sync | `skills/metrix-ad-creative/references/preproduction-director.md`, served as `kie://ugc-preproduction` |
| Creative direction | `docs/UGC_CREATIVE_PLAYBOOK.md`, with the short module in `prompts/07-ugc-creative-direction.md` |
| Private client source/feedback/repository continuity | `skills/ugc-creator-edit/references/client-library.md` and its `scripts/client_library.py`; client data stays outside git |
| Every byte copy of the above | `scripts/skill-copies.json`, checked by `npm run check:copies` |

Regenerate the composed standard, then refresh the copies:

```text
python skills/ugc-creator-edit/scripts/build_standard_doc.py --out docs/UGC_PRODUCTION_STANDARD.md
npm run sync:copies
```

A rebuilt bundle and a synchronized skill folder are separate from a running process. A running MCP server must be restarted to load changed prompts, and an installed skill copy must be synchronized from this checkout (`node scripts/sync-copies.mjs --installed <skills dir> --write`).

The review validators check contained paths, records, hashes, identities and required attestations. Measurements and detectors supplement listening and normal-speed review. They cannot establish naturalness or audience comprehension, so each final export needs a current exact-file review binding.

Client identity, scripts, offers, casting, exact music and project media belong in private briefs and libraries, never in this shared standard.
