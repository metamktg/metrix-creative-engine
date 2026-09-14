# metrix-creative-engine

Generate ad creative through [Kie.ai](https://kie.ai) from inside Claude Code.

Two halves:

- **An MCP server** over the Kie.ai API, so Claude can create generations, poll
  them, and download results as tool calls.
- **Skills** that know how to drive it — how to prompt each model family, and
  how to turn a Metrix IAP creative brief into launch-ready Meta ad assets
  without breaking the test the brief was designed around.

## Quick start

```bash
git clone https://github.com/metamktg/metrix-creative-engine.git
cd metrix-creative-engine
pnpm install && pnpm run build

cp .env.example .env        # add your key from https://kie.ai/api-key
set -a && source .env && set +a

mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/"* ~/.claude/skills/
claude
```

Then, in Claude Code:

```
generate a 4:5 product shot of a matte black water bottle on a concrete ledge
```

Full walkthrough, including the global MCP registration you want if you plan to
generate from inside `metrix-iap`: **[`docs/SETUP.md`](docs/SETUP.md)**.

## Skills

| Skill | Use it for |
| --- | --- |
| `kie-generate` | Any one-off generation: image, image edit, video, music, speech, upscale. Picks the model, writes the prompt, returns the asset. |
| `kie-tasks` | Long or batched work: fire many generations, poll them, resume after a timeout, download results, check credits. |
| `metrix-ad-creative` | A Metrix IAP brief in, Meta-ready assets out. Matrix-mode variable isolation, MST naming, pre-upload QA. |

Each skill is self-contained — its model tables live in its own `references/`,
so symlinking one skill on its own still works.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/SETUP.md`](docs/SETUP.md) | Install, key, MCP wiring, skill install, smoke test, troubleshooting table |
| [`docs/MODEL_CATALOG.md`](docs/MODEL_CATALOG.md) | Every model this was built against: exact ids, parameters, and what is unverified |
| [`docs/PROMPTING.md`](docs/PROMPTING.md) | How to write prompts per model family, with worked examples |
| [`docs/MCP_TOOLS.md`](docs/MCP_TOOLS.md) | The six MCP tools, their arguments, and when to reach for each |

## How it fits with Metrix IAP

`metrix-iap` analyses performance and produces strategy and briefs. It stops at
the brief. This repo starts there.

```
metrix-strategy-map  ->  metrix-brief-builder  ->  creative_briefs.json
                                                          |
                                                          v
                                              metrix-ad-creative  (here)
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

Six tools over Kie's job API:

| Tool | Does |
| --- | --- |
| `kie_run_task` | Create a generation and poll it to completion. The usual one. |
| `kie_create_task` | Create and return a `taskId` immediately, without waiting. |
| `kie_get_task` | Read one task's state. |
| `kie_wait_for_task` | Poll an existing task until it settles. |
| `kie_get_credits` | Remaining credit balance. |
| `kie_download_result` | Save a result URL to disk. Registered only when `KIE_AI_DOWNLOAD_DIR` is set. |

`model` and `input` pass through unchanged rather than being validated against
per-model schemas. Kie routes every model through one endpoint and documents
that each model's parameters differ, so a schema invented here would reject
valid calls the day Kie adds a field. `docs/MODEL_CATALOG.md` carries the
parameters instead, where being out of date is visible rather than fatal.

## Things that will bite you

- **A created task is not a finished task.** `createTask` returns a `taskId`;
  the asset exists only once the task reports `success`.
- **A timeout is not a failure.** The job keeps running on Kie's side. You get
  the `taskId` back to resume on.
- **HTTP 200 can still be an error.** Kie puts its own `code` in the response
  body. The server checks both.
- **Results expire after about 14 days.** Download anything you intend to keep.
- **20 new generations per 10 seconds.** A large matrix has to be paced;
  `kie-tasks` does that.
- **Credits are real money.** Check the balance before a batch, not after.

## Development

```bash
pnpm run verify   # typecheck, 62 tests, build
```

`src/protocol.ts` is pure and carries most of the logic — envelope handling,
task states, `resultJson` parsing, poll backoff, filename safety — so it is
testable without a network or a key. `src/client.ts` is the I/O shell with an
injectable `fetch`. `src/tools.ts` is the MCP binding.

## Licence

Private. Copyright Meta Marketing Agency.
