# MCP tools

What the server advertises, what each tool takes, and when to reach for it. `tools/list`,
`resources/list` and `prompts/list` are the authoritative inventories: `npm run check:mcp-surface`
drives the built bundle and fails when the advertised set differs from its expected list, so a count
copied into prose would go stale the first time a tool is added.

## What the server advertises

Kie publishes no MCP server and no MCP documentation, so there is nothing to
conform to: this server is measured against the MCP specification itself. It
negotiates protocol **2025-11-25**, the latest its SDK implements, and offers
all three server primitives.

| Primitive | What it carries |
| --- | --- |
| **Tools** | The ones documented below. `kie_download_result` is registered only when `KIE_AI_DOWNLOAD_DIR` is set. Every tool declares an `outputSchema` and returns `structuredContent` |
| **Resources** | The model catalog, format routing, production-review standard, UGC creative playbook and UGC preproduction guide, inlined at build time |
| **Prompts** | One per media format, plus brand intake and the optional MST |

**Structured output.** A tool that declares an `outputSchema` must return
`structuredContent`, and the SDK validates it against the schema before it
leaves the process. That is why `resultUrls` arrives as an array rather than as
prose inside a text block to be re-parsed, and why `timedOut` is a boolean: a
timeout and a failure are different outcomes, and telling them apart should not
require reading English. A human summary still ships in `content` for a client
that reads no schema.

**Progress.** Pass a `progressToken` in a call's `_meta` and the two waiting
tools emit `notifications/progress` on every read. MCP progress must not go
backwards and Kie populates its own `progress` field only for sora2, so the
number is elapsed seconds against the wait's own budget, which is monotonic by
construction. Kie's percentage and the task state go in the message, where a
varying fact belongs.

**Not yet adopted, deliberately.** The 2026-07-28 specification added a
[Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview) for
exactly this shape of work, and its own documentation names our case: a server
wrapping an API that already has job ids. It is not adopted here because a
server no client can drive is worse infrastructure, not better. This file does
not track which clients implement the extension; check the official client
support matrix before revisiting. Until then the hand-rolled create/get/wait
trio is the shape in use.

## Which one to use

```
Before any render, is the brief usable?        -> kie_validate_brief
Before creator lip sync, are the records current? -> kie_validate_ugc_preproduction
Creator lip sync from an approved full voice   -> kie_create_ugc_lipsync
One generation, want the result now            -> kie_run_task
Many generations, or one very long one         -> kie_create_task, then kie_wait_for_task
Checking on something started earlier          -> kie_get_task
A wait timed out and you want to resume        -> kie_wait_for_task
About to spend a lot                           -> kie_get_credits
Keeping the asset                              -> kie_download_result
"What did I render last night, is it still there?" -> kie_ledger
```

## `kie_validate_brief`

Checks a creative brief against the engine's input contract before anything is spent. Offline, free and
read-only; it never calls Kie and needs no key.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `brief` | object or JSON string | yes | The creative brief |

Returns `ok`, `errors` and `warnings` as structured content, plus a readable verdict. **Errors block a
render; warnings mean it will render worse.** The checks live in `src/brief.ts`.

- **Errors:** a schema violation, including an `asset_type` outside the mapped set, which stops rather
  than falling back to the nearest type. A motion type (`video`, `ugc`, `ai_ugc`, `motion_graphic`)
  with no `creative_specifications.duration_seconds`. A `brief_id` carrying an unresolved placeholder.
  `mode: "matrix"` with no `testing_framework.isolated_variable`. A `brand_assets` entry with neither a
  `url` nor a `path`.
- **Warnings:** empty `brand_assets`, which means the model invents a generic product. An asset with a
  local `path` and no `url`, which must be uploaded first. A matrix position on a brief that is not in
  matrix mode.
- **Normalised, reported as a warning:** IAP vocabulary such as a ratio suffix on the type
  (`static_4x5` reads as `static` at 4:5) and a mode of `MST_matrix_cell` or `general`, which read as
  `matrix` and `standard`. A brief IAP already validated needs rendering, not rejection.

There is no script equivalent. The brief gate exists only on the MCP server.

## `kie_validate_ugc_preproduction`

Checks a local version-1 UGC preproduction packet without spending: exact source hashes, locked copy,
presenter, voice and scene acceptance records, proof roles, and the current request, capability and
budget bindings. Read-only; no credits and no provider call.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `packetPath` | string | yes | The private packet file |
| `observedDurationSeconds` | positive number | no | The duration a returned voice or clip actually measured. A difference from the planned duration is reported, because it needs a replan, not a silent trim |

Returns `ok`, `errors` and `warnings`. It does not certify listening, performance or release. The packet
format, bindings and failure modes are in `skills/metrix-ad-creative/references/preproduction-director.md`,
served as `kie://ugc-preproduction`. The script equivalent is `node kie.mjs ugc-check <packet>
[--observed-duration N]`.

## `kie_create_ugc_lipsync`

Submits approved-full-voice creator lip sync through Kie after the same checks pass. It loads the exact
model and input from the packet, revalidates hashes and acceptance, creates an exclusive durable
submission receipt, then makes one provider call.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `packetPath` | string | yes | The private packet file |

Returns `taskId`, `model`, `receiptPath` and `warnings`. The receipt is `<packet>.submission.json`. A
submitted or uncertain receipt blocks a second call: recover the recorded task with `kie_wait_for_task`
instead of cloning the packet, renaming the receipt, or switching to `kie_create_task`. Raw task tools
stay raw and do not apply this guard. Per-packet exclusion is not provider idempotency, not an
account-wide spending limit, and not a media-quality guarantee. The script equivalent is `node kie.mjs
ugc-start <packet>`, which needs `KIE_AI_API_KEY`.

## `kie_run_task`

Create a generation and poll it to completion. The default choice.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `model` | string | yes | Model id, exactly as `MODEL_CATALOG.md` spells it |
| `input` | object | yes | Model-specific parameters, passed through unchanged |
| `timeoutSeconds` | integer 5–1800 | no | Default 300, or `KIE_AI_DEFAULT_WAIT_SECONDS` |

Returns a summary plus the full task record as JSON. On success the record
carries `resultUrls`.

**A timeout is not a failure.** If the deadline passes the task is still running
on Kie's side; you get the last record read and the `taskId`. Resume with
`kie_wait_for_task`. Video models routinely exceed the 300s default, raise
`timeoutSeconds`, or split into create-then-wait.

## `kie_create_task`

Create and return the `taskId` immediately.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `model` | string | yes | Model id |
| `input` | object | yes | Model-specific parameters |
| `callBackUrl` | string (URL) | no | Webhook Kie calls on completion |

Use it to fan out a batch, fire every cell of a matrix, then wait on them,
rather than serialising a long queue behind one blocking call.

Pace a batch. Kie answers 429 when a request limit is exceeded, but publishes no
figure for it. Ramp up rather than firing a whole matrix at once, and treat a
429 as the signal.

## `kie_get_task`

One read of a task's current state. No waiting.

| Argument | Type | Required |
| --- | --- | --- |
| `taskId` | string | yes |

`state` is one of `waiting`, `queuing`, `generating`, `success`, `fail`. Result
URLs appear only on `success`. On `fail`, `failCode` and `failMsg` say why.

The record carries every field the `recordInfo` spec lists as required. Three
are worth naming:

- **`param`** is the JSON string of the request that created the task, parsed.
  It is the only server-side record of the prompt and parameters behind an
  asset, so provenance survives a lost local note.
- **`frameUrls`** holds `firstFrameUrl` / `lastFrameUrl`, which Seedance 2
  returns beside `resultUrls` when `return_last_frame` is on. Kept separate
  because a frame is not the asset.
- **`creditsConsumed`** is what the task actually cost. The docs publish only
  ranges (images roughly 10-50, video roughly 100-500); this is the number.
  The ledger records it as `credits` on the settled event, and `kie_ledger`
  returns it per task with a total. A settled task with no recorded `credits`
  is unknown, not free.

An unrecognised state reads as `unknown` and keeps its raw value in `rawState`,
it is deliberately **not** treated as finished, so a future Kie state cannot be
mistaken for a completed job.

## `kie_wait_for_task`

Poll an existing task until it settles or the timeout passes.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `taskId` | string | yes | From `kie_create_task` |
| `timeoutSeconds` | integer 5–1800 | no | Default 300 |

Polling backs off from 2s toward a 15s ceiling. That pacing is this server's own
conservative default, not a documented Kie figure, Kie documents a limit on new
generations, not on status reads.

## `kie_get_credits`

No arguments. Returns the remaining balance.

Call it **before** a batch. A matrix that runs out of credits halfway leaves a
partial row, and a partial row is not a test, you cannot attribute a result
when some cells never rendered.

## `kie_download_result`

Save a result URL to disk.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `url` | string (URL) | yes | A result URL from a completed task |
| `filename` | string | no | Name to save under. Sanitized |

**Registered only when `KIE_AI_DOWNLOAD_DIR` is set.** Without it the tool does
not exist and you get URLs only. Download the same day: Kie documents result
URLs as expiring after about 24 hours.

The directory is fixed by configuration. Both the URL and any filename you pass
are reduced to a single path segment, so neither can write outside it,
`../../escape.png` lands as `escape.png` inside the configured directory.

For Metrix work, pass the creative concept id as `filename` so the asset arrives
already named for what it is, rather than for whatever the CDN called it.

## `kie_ledger`

Reads the local append-only task ledger. No network call, no credit, no key
needed on the CLI equivalent.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `onlyRecoverable` | boolean | no | Only tasks whose result window is still open |
| `model` | string | no | Only tasks rendered on this model id |

### Why it exists

Kie documents result URLs as expiring after about 24 hours. The `taskId` does
not expire: `recordInfo` re-issues a URL for any task you can still name. So the
id is the asset's real handle, and until this existed nothing persisted one. A
batch rendered in the evening and read the next morning had URLs that were dead
and ids that lived only in a conversation window. The credits were spent and the
assets were unreachable, which is not a failure any log shows.

Every `kie_create_task`, `kie_run_task` and settled `kie_wait_for_task` appends a
line. A ledger write that fails is logged to stderr and swallowed: losing the
record of a task is bad, losing the task is worse.

### What it tells you

`recoverable` is the field that matters, and `minutesLeft` is how long that stays
true. A task past its window is **not lost**, re-poll the id with `kie_get_task`
and Kie issues a fresh URL.

The report also counts distinct models. Core rule 3 locks one model per batch, so
two model ids in one batch's ledger means the comparison is void, and the ledger
is where that becomes visible after the fact.

### Where the file lives

`<KIE_AI_DOWNLOAD_DIR or ./out>/kie-ledger.jsonl`, overridable with
`KIE_AI_LEDGER_PATH`, or `off` to disable. JSONL rather than JSON so a process
killed mid-append leaves every earlier line readable; append-only so a batch that
dies does not take the record of its own successes with it.

The CLI equivalent is `node kie.mjs ledger`, and it deliberately does **not**
require `KIE_AI_API_KEY`: the ledger is the recovery path, and gating it behind a
credential is exactly backwards on the morning you need it.

## Errors

Failures come back as tool errors with the reason readable, not as protocol
faults, so the model can correct the call itself.

Kie puts its own `code` in the response body, so the table below is that code,
not the HTTP status. It is transcribed from the `code` enum in
<https://docs.kie.ai/market/common/get-task-detail>.

| Code | Means |
| --- | --- |
| 401 | Key is missing, wrong or revoked. Check <https://kie.ai/api-key> |
| 402 | Insufficient credits. Check `kie_get_credits` and top up |
| 404 | No task with that id |
| 408 | Upstream produced no result for over 10 minutes |
| 422 | The model rejected `input`. Check its parameters in `MODEL_CATALOG.md` |
| 429 | Request limit exceeded. Pace the batch and retry |
| 455 | Kie is under maintenance |
| 500 | Kie server error |
| 501 | The generation itself failed, not the request. Read `failMsg` |
| 505 | That feature is currently disabled on Kie |

Two more come from this server rather than from Kie:

| You see | Means |
| --- | --- |
| `Could not reach Kie.ai` | Network or timeout, before any reply |
| `returned a non-JSON response` | Usually a proxy or gateway page, not Kie |

An HTTP 200 can still be a failure. The server checks the status and the code and
tells you which one failed.

## Resources

Reference the client can read directly, inlined into the bundle at build time so
they resolve wherever the server is launched from.

| URI | What it is |
| --- | --- |
| `kie://model-catalog` | Every model id read from Kie's embedded OpenAPI specs, with the per-model aspect-ratio and image-input field names, the known docs bugs, and what is not on the platform |
| `kie://format-routing` | The handoff contract: which model set each brief `asset_type` routes to, the required parameters per format, and the rule that an unmapped type stops rather than falling back |
| `kie://production-review-standard` | Evergreen finishing, anonymous review evidence and the five mandatory UGC/video presentation gates |
| `kie://ugc-creative-playbook` | The detailed UGC/video creative and feedback standard, read on demand rather than injected in full into generation prompts |
| `kie://ugc-preproduction` | The packet format, exact dependency bindings, guarded submit and recovery rules for creator lip sync, and an anonymous incomplete packet template. Read before preparing a packet; never a claim that anything was accepted |

The model and routing documents are dated reference, not current model truth. Kie renames models often; each document
says when it was read. A validation error on a model id means check the live
page, not that the call was malformed.

## Prompts

The render workflow, assembled in the order it has to be applied.

| Prompt | What it loads |
| --- | --- |
| `kie_render_static`, `_carousel`, `_video`, `_ugc`, `_ai_ugc`, `_motion_graphic`, `_claymation` | The core rules, the render bridge, that format's module and the final pass |
| `kie_brand_intake` | Establishing and uploading the product references a render needs. Run it BEFORE generating |
| `kie_mst_sprint` | Building a Matrix Sprint Test. Optional, and not a stage every run passes through |

Each takes an optional `brief` argument, the brief as JSON, which is carried
into the message.

`kie_render_ugc`, `kie_render_ai_ugc` and `kie_render_video` also load the short
`06-production-review.md` and `07-ugc-creative-direction.md` modules after the format module. `ai_ugc`
shares the UGC format module. Other formats, brand intake and MST load neither. The complete finishing
contract stays available as `kie://production-review-standard`, and the detailed direction as
`kie://ugc-creative-playbook`; neither complete manual is appended to render prompts. The server's
initialization instructions route creator work to the matching prompt even before a caller selects it,
and to the two UGC preproduction tools for lip sync. These are production instructions and local
evidence checks, not provider parameters or a backend release lock.

Some prompts name files under `skills/` or `scripts/` that only a checkout contains. A client connected
to the server alone cannot read those paths. The resources above are what an MCP-only client can read,
and `references/model-routing.md`, `placement-specs.md` and `prompt-construction.md` are not among them.

After changing these Markdown modules or resources, run `npm run verify` to
rebuild and check the actual MCP surface. A server process already running keeps
its loaded bundle until its client reloads/restarts it; a changed source file
does not update an existing process automatically. Do not interrupt another
active production session merely to refresh its tools.

There is one prompt per format and no general "render anything" prompt, on
purpose: the format is the brief's to declare and the engine's to obey, so the
medium is never chosen at render time.

`kie_brand_intake` exists because a model renders a plausible generic product when nothing carries the
client's real reference to it. A file is only useful to whoever remembers to open it; a prompt is
selectable.

## Configuration

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `KIE_AI_API_KEY` | yes | – | Sent as a bearer token. Never logged, never in a URL |
| `KIE_AI_DOWNLOAD_DIR` | no | unset | Enables `kie_download_result` and fixes its directory |
| `KIE_AI_DEFAULT_WAIT_SECONDS` | no | 300 | Default timeout for waiting tools |
| `KIE_AI_REQUEST_TIMEOUT_MS` | no | 60000 | Per-HTTP-request timeout |
| `KIE_AI_BASE_URL` | no | `https://api.kie.ai` | Override for a proxy or test stub |
| `KIE_AI_LEDGER_PATH` | no | `<download dir or ./out>/kie-ledger.jsonl` | Where the task ledger lives, or `off` to disable it |

The server does not upload files. The script's `upload` command tries `KIE_AI_UPLOAD_BASE_URL` first when it is set, then Kie's two default upload hosts.
