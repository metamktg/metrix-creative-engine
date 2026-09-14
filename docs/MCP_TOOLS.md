# MCP tools

Six tools over Kie's job API. Reference for what each takes and when to reach
for it.

## Which one to use

```
One generation, want the result now            -> kie_run_task
Many generations, or one very long one         -> kie_create_task, then kie_wait_for_task
Checking on something started earlier          -> kie_get_task
A wait timed out and you want to resume        -> kie_wait_for_task
About to spend a lot                           -> kie_get_credits
Keeping the asset                              -> kie_download_result
```

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
`kie_wait_for_task`. Video models routinely exceed the 300s default — raise
`timeoutSeconds`, or split into create-then-wait.

## `kie_create_task`

Create and return the `taskId` immediately.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `model` | string | yes | Model id |
| `input` | object | yes | Model-specific parameters |
| `callBackUrl` | string (URL) | no | Webhook Kie calls on completion |

Use it to fan out a batch — fire every cell of a matrix, then wait on them —
rather than serialising a long queue behind one blocking call.

Mind the rate limit: **20 new generation requests per 10 seconds.** Past that
Kie answers 429 and the tool reports it.

## `kie_get_task`

One read of a task's current state. No waiting.

| Argument | Type | Required |
| --- | --- | --- |
| `taskId` | string | yes |

`state` is one of `waiting`, `queuing`, `generating`, `success`, `fail`. Result
URLs appear only on `success`. On `fail`, `failCode` and `failMsg` say why.

An unrecognised state reads as `unknown` and keeps its raw value in `rawState` —
it is deliberately **not** treated as finished, so a future Kie state cannot be
mistaken for a completed job.

## `kie_wait_for_task`

Poll an existing task until it settles or the timeout passes.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `taskId` | string | yes | From `kie_create_task` |
| `timeoutSeconds` | integer 5–1800 | no | Default 300 |

Polling backs off from 2s toward a 15s ceiling. That pacing is this server's own
conservative default, not a documented Kie figure — Kie documents a limit on new
generations, not on status reads.

## `kie_get_credits`

No arguments. Returns the remaining balance.

Call it **before** a batch. A matrix that runs out of credits halfway leaves a
partial row, and a partial row is not a test — you cannot attribute a result
when some cells never rendered.

## `kie_download_result`

Save a result URL to disk.

| Argument | Type | Required | Meaning |
| --- | --- | --- | --- |
| `url` | string (URL) | yes | A result URL from a completed task |
| `filename` | string | no | Name to save under. Sanitized |

**Registered only when `KIE_AI_DOWNLOAD_DIR` is set.** Without it the tool does
not exist and you get URLs only.

The directory is fixed by configuration. Both the URL and any filename you pass
are reduced to a single path segment, so neither can write outside it —
`../../escape.png` lands as `escape.png` inside the configured directory.

For Metrix work, pass the MST name as `filename` so the asset is already named
for `metrix-mst-creative-scan`.

## Errors

Failures come back as tool errors with the reason readable, not as protocol
faults, so the model can correct the call itself.

| You see | Means |
| --- | --- |
| `KIE_AI_API_KEY is missing, wrong, or revoked` | Key problem. Check <https://kie.ai/api-key> |
| `Rate limited` | Over 20 new generations per 10s. Pace the batch |
| `Validation error` | The model rejected `input`. Check its parameters in `MODEL_CATALOG.md` |
| `Not found` | No task with that id |
| `Could not reach Kie.ai` | Network or timeout, before any reply |
| `returned a non-JSON response` | Usually a proxy or gateway page, not Kie |

Kie reports its own `code` in the response body, so an HTTP 200 can still be a
failure. The server checks both and tells you which one failed.

## Configuration

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `KIE_AI_API_KEY` | yes | — | Sent as a bearer token. Never logged, never in a URL |
| `KIE_AI_DOWNLOAD_DIR` | no | unset | Enables `kie_download_result` and fixes its directory |
| `KIE_AI_DEFAULT_WAIT_SECONDS` | no | 300 | Default timeout for waiting tools |
| `KIE_AI_REQUEST_TIMEOUT_MS` | no | 60000 | Per-HTTP-request timeout |
| `KIE_AI_BASE_URL` | no | `https://api.kie.ai` | Override for a proxy or test stub |
