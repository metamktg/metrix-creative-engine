---
name: kie-generate
description: Generate images, video, music, speech or upscales through the Kie.ai API. Use whenever asked to create, generate, make or render an image, photo, video, clip, song, music bed, voiceover or audio, or to edit, restyle, animate or upscale an existing asset, and a Kie.ai MCP server is connected. Covers model choice, prompt construction and parameter mapping. For batches of many generations use kie-tasks; for rendering a Metrix IAP creative brief use metrix-ad-creative.
---

# kie-generate

One generation, done properly: pick the model, write the prompt, set the
parameters, verify the result.

## How to actually run a generation

Two paths. **Check which you have before doing anything else.**

**1. The bundled script (default, no install).** Every skill ships
`scripts/kie.mjs`. It needs nothing but Node, which Claude Code already runs on,
and `KIE_AI_API_KEY` in the environment. Works on Windows, macOS and Linux.

```
node scripts/kie.mjs credits
node scripts/kie.mjs run "google/nano-banana" '{"prompt":"...","aspect_ratio":"4:5"}'
node scripts/kie.mjs run "veo-3-1" '{"prompt":"..."}' --timeout 900 --out ./out
node scripts/kie.mjs start "kling/v2-1-master-image-to-video" '{...}'   # prints taskId, returns at once
node scripts/kie.mjs poll <taskId> --timeout 900
```

It prints result URLs on stdout and progress on stderr, so `$(node scripts/kie.mjs run ...)`
captures just the URLs. `--out DIR` downloads them. Exit 2 means the wait timed
out and the task is still running: poll the same taskId, never re-create.

On Windows the path is `scripts\kie.mjs`. Use the skill's own directory, which
in an installed skill is under `.claude/skills/<skill>/`.

**2. MCP tools, if `/mcp` lists `kie-ai`.** `kie_run_task`, `kie_create_task`,
`kie_get_task`, `kie_wait_for_task`, `kie_get_credits`, `kie_download_result`.
Same API, typed arguments. Prefer these when present; they are not required.

Never tell the user to install anything before generating. If the key is
missing the script says so and names where to get one.

## Process

1. **Work out what is actually wanted**: still or motion, from nothing or from
   an existing asset, and where it will be used. Placement decides aspect ratio,
   and aspect ratio decides which models are even eligible.
2. **Pick the model** from `references/models.md`. State which you chose and
   why in one line.
3. **Write the prompt** using the clause order in `references/prompting.md`.
4. **Set parameters, do not describe them.** Aspect ratio, resolution, duration
   and seed are fields. "9:16" in the prompt text does nothing.
5. **Generate.** `kie_run_task` for a single image. For video use
   `kie_create_task` then `kie_wait_for_task`, or raise `timeoutSeconds` well
   past the 300s default — video routinely outruns it.
6. **Check the result.** Read `state` before reporting anything. A `taskId` is
   not an asset.
7. **Report** the result URL, the model and the exact prompt used, and say that
   URLs expire in about 14 days. Download if a directory is configured.

## Rules that prevent the common failures

**Copy the model id exactly.** Some carry a vendor prefix and some do not —
`google/nano-banana` has one, `nano-banana-2` and `z-image` do not. A wrong id
is a validation error, not a fallback.

**Check the parameter names per model.** The aspect-ratio field is
`aspect_ratio` on most models, `image_size` on Seedream v4 and Ideogram, and
`ratio` on `wan/2-7-text-to-video`. The wrong key is silently ignored and you
get the default ratio, which is the failure mode that wastes a whole batch
before anyone notices.

**Edit and image-to-video models need a URL, not a path.** A local file must be
uploaded first — see the upload section of `references/models.md`. Never pass a
filesystem path as an image input.

**Verify before declaring success.** Look at what came back. Models drop
elements, miscount objects, and mangle text. If the ask was specific, check that
specific thing.

**Never substitute a model silently.** If the user named one, use it. If it does
not exist — Sora and Midjourney are not on Kie at all — say so and offer the
nearest real option rather than quietly generating with something else.

## Cost awareness

Video and music cost several times what images cost, and the docs publish only
rough bands. For anything beyond a couple of generations, call `kie_get_credits`
first and say what the run will roughly consume. Each task reports its real cost
back as `creditsConsumed` — quote it in the report.

Cheapest useful iteration loop: generate stills until the composition is right,
then animate the approved still. It costs a fraction of iterating in video, and
you get to reject a bad frame before paying for motion.

## When a generation fails

Read `failMsg` before retrying. Re-running an unchanged request that failed
validation fails identically.

- Validation error — a parameter is wrong for that model. Re-check the table.
- Content refusal — rewrite the prompt, and say that you did and why. Never
  quietly soften a prompt and present the result as what was asked for.
- Insufficient credits — stop and report.
- Timeout — not a failure. Resume with `kie_wait_for_task` on the same `taskId`.

## References

- `references/models.md` — model ids, parameters, routing, and uploading a local
  file.
- `references/prompting.md` — clause order and per-family prompt craft.
