---
name: metrix-produce
description: Produce finished ad assets from an approved Metrix creative brief, end to end. Finds and checks the brief, reads its declared format, then runs the engine's skills in order (brand kit when one is missing, render, assembly, UGC finishing, review) and reports one row per brief. Use when handed an approved brief or creative_briefs.json and asked to make the ads, produce the creative, or run the sprint. For a one-off generation use kie-generate; for batch job control use kie-tasks.
---

# metrix-produce

The entry point of the creative engine. An approved brief comes in; finished,
reviewed assets come out, in the runs folder. This skill decides the order and
hands each step to the skill that owns it. It does not restate their rules:
when a step names a skill, load that skill and follow it.

## Before anything else

**A brief is required, and it must be approved.** Approval comes from the user
or the brief's owner, never from this skill. With no brief, stop and ask for
one. Do not write one in order to have something to render.

**Know the two folders.** In Bash:

```
echo "runs=${KIE_AI_DOWNLOAD_DIR:-./out}" "assets=${METRIX_ASSETS_DIR:-not set}"
```

- **Runs folder** · where every generated file, receipt, render spec and the
  task ledger go. The plugin's runs folder option sets `KIE_AI_DOWNLOAD_DIR`
  for the session; without it the default is `./out` in the folder Claude Code
  started in. The MCP server states the same folder in its handshake.
- **Assets folder** · where the user keeps brand kits
  (`brand-kits/<account>/brand-kit.json`), product references, approved briefs
  and accepted media. The plugin's assets folder option sets
  `METRIX_ASSETS_DIR`. When it is not set, ask where the inputs are rather than
  searching the disk.

Client material stays in these two folders. Never copy a brief, brand kit,
product photo or receipt into the engine's own folder or any repository.

**Know which tools you have.** If `/mcp` lists the engine's `kie-ai` server,
use its tools (`kie_validate_brief`, `kie_get_credits`, `kie_run_task` and the
rest). Otherwise use the script that `kie-generate`, `kie-tasks` and
`metrix-ad-creative` each carry in their own `scripts/kie.mjs`; this skill has
none. It needs only Node and the key. Each skill below says how to use either
path.

**Skills this one calls.** `brand-kit-builder`, `metrix-ad-creative`,
`metrix-video-assembly`, `ugc-creator-edit` and, for batches, `kie-tasks`. In a
plugin install they are listed as `metrix-creative-engine:<name>`. If one that a
brief needs is not installed, say which and stop that brief. Do not imitate a
missing skill from memory.

## The order

Work through every brief in the file. The count is whatever the file holds.

1. **Find the brief.** Use the path the user gave. Otherwise look in the assets
   folder for `creative_briefs.json`, or a `.json` whose items carry
   `brief_metadata`. Never sweep Downloads, Desktop or Documents for inputs.

2. **Check each brief before any spend.** Run `kie_validate_brief` (free and
   offline). Errors block that brief; say which field and why. Warnings are
   renderable and go in the report. Without the MCP server, check by hand what
   the gate checks: a mapped `asset_type`, a `duration_seconds` for every motion
   type, `placement`, `composition` and `imagery` present.

3. **Read the declared format.** `brief_metadata.asset_type` decides the route,
   and `brief_metadata.mode` decides whether matrix discipline applies
   (`matrix` only; `standard` is the default). Route with the table below and
   [format routing](references/format-routing.md). A ratio suffix such as
   `static_4x5` is that type at that ratio. An unmapped type in the same medium
   renders the nearest type and says so. **Across the still and motion boundary,
   stop** and propose the nearest mapped type as a question.

4. **Make sure the product can reach the model.** If the brief carries no
   `brand_assets` and the account has no brand kit in the assets folder, run
   `brand-kit-builder` first and write its kit to
   `<assets folder>/brand-kits/<account>/`. If the brief lists references under
   `brand_assets.missing`, stop that brief and ask for them. A generated stand-in
   product presented as the client's is the one failure no later step catches.

5. **Check credits and state the spend.** `kie_get_credits`, or the script's
   `credits` command run from a generating skill's directory. Give the balance and
   the estimated spend in one line. Stop if it will not cover the run. A batch
   (more than one brief, or any matrix) renders one representative asset per
   format first and waits for a yes, unless the user already authorized the
   whole run in this conversation. Available balance is not authorization.

6. **Produce, per brief, in the route's order:**

   | `asset_type` | Order of skills |
   | --- | --- |
   | `static`, `carousel` | `metrix-ad-creative`: its full process, including QA and the confidence gate |
   | `claymation` | as `static`; with `duration_seconds` set, as `video` |
   | `video`, `motion_graphic` | `metrix-ad-creative` generates the layers (approved stills, one-action clips, beds), then `metrix-video-assembly` assembles, typesets, mixes and renders the finished ad and runs its QA |
   | `ugc` | `ugc-creator-edit` leads: it binds the job, plans reuse before generation and authorizes spend. Gaps are generated through `metrix-ad-creative`. Captions and finishing go through `metrix-video-assembly`. The five presentation gates run last, in `ugc-creator-edit` |
   | `ai_ugc` | as `ugc`, and before any lip sync: the script check, casting, then `kie_validate_ugc_preproduction` and the guarded `kie_create_ugc_lipsync` (without the MCP server: `kie.mjs ugc-check`, then `ugc-start`) |

   More than a handful of generations at once goes through `kie-tasks`, which
   paces the batch and resumes timed-out waits. Download every result to the
   runs folder as it lands, under its descriptive name (MST names only inside a
   live Matrix Sprint Test): result URLs expire in about a day.

7. **Review the finished file, not the plan.** Look at every still and watch
   every video before calling it done. Stills pass the `metrix-ad-creative` QA
   and confidence gate. Creator-led video passes the five gates in
   `ugc-creator-edit`. A gate that could not run is pending, never passed.

## Report

One row per brief: `brief_id`, `asset_type`, the skills that ran, the files
written (path under the runs folder), each QA or gate verdict with its reason,
and credits spent. Then the run's credits before and after, every brief that
stopped and the exact reason, and anything a model failed to obey. A cell that
silently drifted is worse than one that failed: say which is which.

## What this skill will not do

- Approve a brief, invent one, or fill a field a brief left out.
- Change the format a brief declared, or cross the still and motion boundary.
- Spend beyond the authorization the user gave, or publish anything.
- Copy client material out of the runs and assets folders.

## References

- `references/format-routing.md` · the brief's `asset_type` to eligible models
  and required parameters, and the unmapped-type rules. A byte copy of the file
  in `metrix-ad-creative`, so its paths are written from that skill and from
  the repository root. From this skill's folder they are
  `../metrix-ad-creative/scripts/kie.mjs`,
  `../metrix-ad-creative/references/model-routing.md`,
  `../ugc-creator-edit/references/lip-sync-routing.md`,
  `../../prompts/formats/<asset_type>.md` and `../../docs/MODEL_CATALOG.md`,
  which exist when this skill came with the plugin or a checkout of the
  repository.
