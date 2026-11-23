# metrix-creative-engine

Generate ad creative through [Kie.ai](https://kie.ai) from inside Claude Code.

**Skills** that know how to prompt each model family, turn a Metrix IAP creative
brief into launch-ready Meta ad assets across static, carousel, video and UGC
without breaking the test the brief was designed around, and finish and review
creator-led video.

The three generating skills (`kie-generate`, `kie-tasks`, `metrix-ad-creative`)
each carry `scripts/kie.mjs`, a zero-dependency Node client for the Kie.ai API,
so generating needs nothing but an API key. That path is complete on its own and
needs no build.

An **MCP server** adds what a CLI cannot: typed tool results the model reads
instead of parsing, live progress while a generation runs, a free brief check
before any spend, the model catalog and routing table as resources the client
reads at the moment it needs them, and the render workflow as selectable
prompts. Its source is `src/`; `server/index.js` is the committed single-file
bundle that clients run, so it needs no build either. See
[`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md).

The repository installs as one **Claude Code plugin**: the skills, the MCP
server and a session hook together. One entry skill, `metrix-produce`, takes an
approved brief, reads its declared format and runs the other skills in order.

Repository sessions follow [`AGENTS.md`](AGENTS.md), which also says how to work
in this repository: the verification gate and the copy discipline.

## Quick start

You need Claude Code, Node.js 20 or newer on your PATH (the MCP server and the
hook run on it), Git, and a Kie.ai key with credits from
<https://kie.ai/api-key>.

Two commands, on any system:

```
claude plugin marketplace add metamktg/metrix-creative-engine
claude plugin install metrix-creative-engine@metrix-creative-engine
```

Running a sprint on Windows? Clone the repository and double-click `GO.cmd`
instead: it installs Claude Code if it is missing, then the plugin, and starts
the sprint session. See [`sprint/README.md`](sprint/README.md).

Then give it your key and, if you like, the two folders it works in: run
`/plugin configure metrix-creative-engine@metrix-creative-engine` inside Claude
Code. Or set `KIE_AI_API_KEY` in your environment and leave the key option
empty.

| Option | What it is | When left empty |
| --- | --- | --- |
| Kie.ai API key | your key, stored as a secret; the session hook also writes a plain copy for the session's shell (see [`docs/SETUP.md`](docs/SETUP.md)) | `KIE_AI_API_KEY` from the environment |
| Runs folder | where generated files, receipts and the task ledger go | `KIE_AI_DOWNLOAD_DIR`, else `./out` in the folder Claude Code started in |
| Assets folder | where your brand kits, product references, approved briefs and accepted media live | `METRIX_ASSETS_DIR`, else the folder you work in |

Restart Claude Code, then hand it an approved brief:

```
produce the creative from briefs/creative_briefs.json
```

Each session starts by stating the runs folder, the assets folder and whether
a key is set. Keep client material in those two folders: never in this
repository, which is public.

Other ways in, each in [`docs/SETUP.md`](docs/SETUP.md): unzip the repository
into your skills folder, install one skill on its own, run the MCP server alone
in Claude Desktop or another MCP client, or work in a Claude Code on the web
session on this repository.

## Skills

| Skill | Use it for |
| --- | --- |
| `metrix-produce` | The entry point. An approved brief in, finished and reviewed assets out: it checks the brief, reads its declared format and runs the skills below in order. |
| `kie-generate` | Any one-off generation: image, image edit, video, music, speech, upscale. Picks the model, writes the prompt, returns the asset. |
| `kie-tasks` | Long or batched work: fire many generations, poll them, resume after a timeout, download results, check credits. |
| `metrix-ad-creative` | A Metrix IAP brief in, Meta-ready assets out. Matrix-mode variable isolation, MST naming, pre-upload QA. |
| `ugc-creator-edit` | Creator-led UGC edits from an approved brief: script and delivery map, casting, hooks, lip-sync routing, spend control and the five presentation gates. |
| `metrix-video-assembly` | Finished video from approved clips: storyboard, exact type, captions, sound mix, poster frame, placement ratio and the finished-file QA. |
| `brand-kit-builder` | A brand kit from public sources when no client assets were supplied, before the first brief lands. |

The plugin also carries nine HyperFrames skills, which `metrix-video-assembly`
uses for captions, motion and finishing: `hyperframes`, `hyperframes-cli`,
`hyperframes-registry`, `media-use`, `figma`, `remotion-to-hyperframes`,
`reverse-any-video`, `slideshow` and `style-sampling`. They are copied byte for
byte from [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) at
the tag pinned in [`skills/VENDORED.json`](skills/VENDORED.json), under that
project's Apache-2.0 licence, which each folder carries. Do not edit them here.
If you already have HyperFrames skills installed, they are listed twice.

Each skill carries its own references, so installing one skill on its own still
works. Three also point at the repository's `prompts/` files for the fuller
rules, which a standalone install does not have: `metrix-ad-creative`,
`metrix-video-assembly` and `ugc-creator-edit`. `metrix-produce` depends on the
others by design: it calls them, and stops a brief when one it needs is
missing. Files that appear in more than one skill are byte copies of one
canonical file, listed in
[`scripts/skill-copies.json`](scripts/skill-copies.json) and checked by
`npm run check:copies`.

## UGC and video production

Creator-led and video work follows one finishing and review standard, shared by
the skills and the MCP prompts.

- Read the short [creative direction](prompts/07-ugc-creative-direction.md)
  before planning or spend, and only the relevant stage of the
  [creative playbook](docs/UGC_CREATIVE_PLAYBOOK.md) at planning and review.
- Finish and review against the
  [production standard](docs/UGC_PRODUCTION_STANDARD.md). It is generated from the
  UGC skill's references; never edit it by hand.
- Before dependent creator lip sync, validate a private preproduction packet
  and submit through the guarded path. See the
  [preproduction director](skills/metrix-ad-creative/references/preproduction-director.md).
- [`docs/WORKFLOW_RECONCILIATION.md`](docs/WORKFLOW_RECONCILIATION.md) maps each
  rule to the file that owns it.

The MCP render prompts for UGC, AI-UGC and video carry only the short modules.
The complete standard, playbook and preproduction guide are resources the
client reads on demand. Client profiles, scripts and receipts stay in the
gitignored `out/` and `renders/` folders or a private run directory.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/SETUP.md`](docs/SETUP.md) | Install, key, MCP wiring, skill install, smoke test, troubleshooting table |
| [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) | Every MCP tool, resource and prompt: arguments, results, and when to reach for each |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Which prompt to run for which format, the legend, and the review checks |
| [`docs/MODEL_CATALOG.md`](docs/MODEL_CATALOG.md) | Every model this was built against: exact ids, parameters, and what is unverified |
| [`docs/PROMPTING.md`](docs/PROMPTING.md) | How to write prompts per model family, with worked examples |
| [`docs/UGC_CREATIVE_PLAYBOOK.md`](docs/UGC_CREATIVE_PLAYBOOK.md) | The detailed UGC and video creative direction |
| [`docs/UGC_PRODUCTION_STANDARD.md`](docs/UGC_PRODUCTION_STANDARD.md) | The composed finishing and review standard (generated) |
| [`docs/WORKFLOW_RECONCILIATION.md`](docs/WORKFLOW_RECONCILIATION.md) | Which file owns which production rule, and how to regenerate |
| [`docs/draft-retention.md`](docs/draft-retention.md) | The draft retention policy and the reviewed-plan cleanup utility |
| [`prompts/README.md`](prompts/README.md) | How the MCP prompts are assembled from the files in `prompts/` |

## How it fits with Metrix IAP

`metrix-iap` analyses performance and produces strategy and briefs. It stops at
the brief. This repo starts there.

```
metrix-strategy-map  ->  metrix-brief-builder  ->  creative_briefs.json
                                                          |
                                                          v
                                                metrix-produce  (here)
                                   routes each brief by its declared format to
                       metrix-ad-creative, metrix-video-assembly, ugc-creator-edit
                                                          |
                                                          v
                                            generated assets, MST-named
                                                          |
                                                          v
                                            metrix-mst-creative-scan
                                                          |
                                                          v
                                                       launch
```

The one rule that makes this work: **a matrix row varies exactly one clause of
one prompt.** Everything else is locked, byte for byte. If the visual drifts
between cells alongside the variable you meant to test, the row measures
nothing. `metrix-ad-creative` builds prompts as base-plus-slot for that reason.

## What the MCP server gives Claude

| Tool | Does |
| --- | --- |
| `kie_validate_brief` | Check a brief against the input contract before any spend. Offline and free. |
| `kie_validate_ugc_preproduction` | Check a creator lip-sync packet: hashes, locked copy, acceptance records, bindings. Offline and free. |
| `kie_create_ugc_lipsync` | Submit approved-voice creator lip sync once, behind the packet check and a durable receipt. |
| `kie_run_task` | Create a generation and poll it to completion. The usual one. |
| `kie_create_task` | Create and return a `taskId` immediately, without waiting. |
| `kie_get_task` | Read one task's state. |
| `kie_wait_for_task` | Poll an existing task until it settles. |
| `kie_get_credits` | Remaining credit balance. |
| `kie_ledger` | The local task ledger: what was rendered, what each cost, which results are still recoverable. |
| `kie_download_result` | Save a result URL to disk. Registered only when `KIE_AI_DOWNLOAD_DIR` is set. |

`model` and `input` pass through the generic task tools unchanged rather than
being validated against per-model schemas. Kie routes every model through one
endpoint and documents that each model's parameters differ, so a schema invented
here would reject valid calls the day Kie adds a field. `docs/MODEL_CATALOG.md`
carries the parameters instead, where being out of date is visible rather than
fatal.

## Things that will bite you

- **A created task is not a finished task.** `createTask` returns a `taskId`;
  the asset exists only once the task reports `success`.
- **A timeout is not a failure.** The job keeps running on Kie's side. You get
  the `taskId` back to resume on.
- **HTTP 200 can still be an error.** Kie puts its own `code` in the response
  body. The server checks both.
- **Results expire after about 24 hours.** Kie's own Best Practices block says
  "Download results immediately: Generated content URLs typically expire after
  24 hours" (https://docs.kie.ai/market/common/get-task-detail). Save anything you intend to keep, the
  same day.
- **Pace a large matrix.** Kie answers 429 when a request limit is exceeded, and
  publishes no figure for that limit. Ramp a batch up rather than firing it all
  at once; `kie-tasks` does that.
- **Credits are real money.** Check the balance before a batch, not after.

## Development

```bash
npm run verify
```

`verify` is the gate, and it runs, in order: the byte-copy check, the plugin
check, the generated standard-document drift check, the type check, the vitest
suite, the committed-bundle freshness check, the MCP surface check against the
committed bundle, the Python review-record tests and the retention and client
library tests. A change is not done until all of it passes. CI also validates the
plugin with a pinned `claude plugin validate`.

A plugin install runs no build, so `server/index.js` is committed. After any
change under `src/`, run `pnpm run build` and commit `server/` with it; verify
fails while the two differ. To ship a change to installed copies, raise the
version in `package.json`, `.claude-plugin/plugin.json` and `src/version.ts`
together: `claude plugin update` moves only when the version does.

`src/protocol.ts` is pure and carries most of the logic: envelope handling, task
states, `resultJson` parsing, poll backoff, filename safety. It is testable
without a network or a key. `src/client.ts` is the I/O shell with an injectable
`fetch`. `src/tools.ts` is the MCP binding. The rest: `brief.ts` is the brief
gate, `ledger.ts` the task ledger, `prompts.ts` and `resources.ts` assemble the
prompts and resources, `schemas.ts` holds the output shapes, `config.ts` reads
the environment, `instructions.ts` writes the handshake text and `version.ts`
holds the release version.

Edit a canonical file, never a copy, then run `npm run sync:copies`. The
working rules for this repository are in [`AGENTS.md`](AGENTS.md).

## Licence

Private. Copyright Meta Marketing Agency.
