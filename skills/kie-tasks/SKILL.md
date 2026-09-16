---
name: kie-tasks
description: Manage Kie.ai generation jobs at scale - fire a batch, poll it, resume a wait that timed out, download results, and check credits. Use when generating many assets at once, when a generation is slow or long-running, when picking up a taskId from earlier, or when asked about Kie credits, job status, or a stuck or failed generation. For a single one-off generation use kie-generate instead.
---

# kie-tasks

Job control for Kie.ai. `kie-generate` makes one thing; this makes many, or
recovers one that did not finish.

## How to actually run a generation

Two paths. **Check which you have before doing anything else.**

**1. The bundled script (default, no install).** Every skill ships
`scripts/kie.mjs`. It needs nothing but Node, which Claude Code already runs on,
and `KIE_AI_API_KEY` in the environment. Works on Windows, macOS and Linux.

```
node scripts/kie.mjs credits
node scripts/kie.mjs run "google/nano-banana" '{"prompt":"...","aspect_ratio":"4:5"}'
node scripts/kie.mjs run "veo-3-1" '{"prompt":"..."}' --timeout 900 --out ./out --name my-concept-id
node scripts/kie.mjs start "kling/v2-1-master-image-to-video" '{...}'   # prints taskId, returns at once
node scripts/kie.mjs poll <taskId> --timeout 900
```

It prints result URLs on stdout and progress on stderr, so `$(node scripts/kie.mjs run ...)`
captures just the URLs. `--out DIR` downloads them, and `--name ID` files each one
under a name you choose instead of whatever the CDN called it (an asset named for
its concept is the point; `--name` on its own writes to `./out`). Exit 2 means the wait timed
out and the task is still running: poll the same taskId, never re-create.

On Windows the path is `scripts\kie.mjs`. Use the skill's own directory, which
in an installed skill is under `.claude/skills/<skill>/`.

**2. MCP tools, if `/mcp` lists `kie-ai`.** `kie_run_task`, `kie_create_task`,
`kie_get_task`, `kie_wait_for_task`, `kie_get_credits`, `kie_ledger`, `kie_download_result`.
Same API, typed arguments. Prefer these when present; they are not required.

Never tell the user to install anything before generating. If the key is
missing the script says so and names where to get one.

## Check credits before spending them

Call `kie_get_credits` first for any batch. Video and music cost meaningfully
more per job than images. A batch that dies halfway through is worse than one
that never started, because you now hold a partial set and have to work out
which items are missing.

State the balance, the batch size, and whether it will cover the run. If it will
not, say so and stop rather than starting and hoping.

## Batching

**Kie publishes no rate-limit figure**, only that 429 means a request limit was
exceeded. An earlier version of this file said 20 per 10 seconds; that number is
not in the docs. Ramp a batch up rather than firing it all at once. Kie returns
429 and those creations are lost, not queued.

For a batch of N:

1. `kie_create_task` per item, in waves of at most 15, pausing between waves.
   Fifteen rather than twenty leaves headroom for anything else sharing the key.
2. Collect every `taskId` alongside what it was for. **Write the mapping down in
   the reply before waiting on anything** — if the session is interrupted mid
   batch, that list is the only way to recover jobs already paid for.
3. `kie_wait_for_task` per id.
4. `kie_download_result` per success, if a download directory is configured.

Do not run a batch as a chain of `kie_run_task` calls. Each blocks until its job
finishes, so twenty images take twenty sequential generation times instead of
roughly one.

## When a wait times out

A timeout is not a failure. The job is still running on Kie's side; only your
wait ended. `kie_wait_for_task` on the same `taskId` resumes it.

Never re-create the task. That pays twice and, in a matrix, silently replaces a
cell with a different render.

Video generations routinely outrun the 300s default. Either raise
`timeoutSeconds`, or create-then-wait so a long job never blocks the batch.

## When a task fails

`state: "fail"` carries `failCode` and `failMsg`. Read them before acting.

| Looks like | Do |
| --- | --- |
| Invalid or rejected parameters | Fix `input` against the model's parameters. Re-running unchanged fails identically |
| Content policy refusal | Rewrite the prompt. Report that you did and why, do not quietly soften it and pretend it worked |
| Insufficient credits | Stop the batch. Report what completed and what did not |
| Server error | Retry once. Twice is a pattern, not a blip — report it |

Never report a batch as complete when part of it failed. List the failures with
their reasons and what each needs.

## Resuming from a taskId

Given an id from an earlier session, `kie_get_task` reads its current state in
one call. Result URLs expire after about 24 hours, so an id from last week
is likely still good; an id from last month is likely not.

## Downloading

`kie_download_result` exists only when `KIE_AI_DOWNLOAD_DIR` is set. Without it,
report the URLs and say they expire in about 24 hours.

Pass a meaningful `filename`. For Metrix work that is the MST name, so the asset
lands ready for `metrix-mst-creative-scan`. The directory is fixed by
configuration and the filename is sanitized to a single path segment, so a name
cannot redirect the write.

## Reporting a batch

Always give:

- a row per item: what it was, `taskId`, final state, result URL or local path
- the failures, with reason and remedy
- credits before and after
- anything still running, with its `taskId` so it can be resumed

A `taskId` is not an asset. Do not describe a job as done until a task record
says `success`.


## Recovering a batch after its URLs expire

Kie's result URLs expire in about 24 hours. The `taskId` does not: re-polling it
re-issues a URL. Every task this toolchain starts is appended to a local ledger
for exactly that reason.

```
node scripts/kie.mjs ledger          # every task, newest first, with the window left
```

or the `kie_ledger` tool, with `onlyRecoverable: true` to see just what is still
downloadable. It needs no API key, because the morning you need the ledger is
not the morning to discover you cannot read it.

A task whose window has closed is not lost. Take its id:

```
node scripts/kie.mjs poll <taskId> --out ./out
```

The ledger also counts distinct models. Two model ids in one batch means the
comparison that batch was rendered for is void, and this is where you see it.
