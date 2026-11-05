# Setup

Three short steps: the key, the skills, a check. No build, no MCP server, no Node
install beyond what Claude Code already needs.

## 1. Put your Kie key in the environment

Get one at <https://kie.ai/api-key> and make sure the account has credits.

**Windows (permanent, all future terminals):**

```
setx KIE_AI_API_KEY "your-key-here"
```

Close and reopen the terminal afterwards. `setx` does not affect the window you
typed it in.

**macOS / Linux:** add to `~/.zshrc` or `~/.bashrc`:

```bash
export KIE_AI_API_KEY="your-key-here"
```

**Claude Code on the web:** set `KIE_AI_API_KEY` as an environment variable on
the Claude Code environment, where the environment's other secrets live. It
cannot live in the repo.

Optional: `KIE_AI_DOWNLOAD_DIR` sets a default folder for downloaded results.

## 2. Install the skills

**Windows:**

```
git clone https://github.com/metamktg/metrix-creative-engine.git
mkdir "%USERPROFILE%\.claude\skills" 2>nul
xcopy /E /I /Y metrix-creative-engine\skills "%USERPROFILE%\.claude\skills"
```

**macOS / Linux:**

```bash
git clone https://github.com/metamktg/metrix-creative-engine.git
mkdir -p ~/.claude/skills
ln -s "$(pwd)/metrix-creative-engine/skills/"* ~/.claude/skills/
```

The symlink form updates itself on `git pull`. The Windows copy does not, so
re-run the `xcopy` after pulling.

**Claude Code on the web:** nothing to install. Open a session on this repo and
the skills in `skills/` are picked up from the checkout.

## 3. Check it works

One command proves the whole chain and tells you pass or fail:

```
node scripts/smoke-live.mjs
```

It reads your balance, generates one 4:5 static, downloads it, and says which
step failed if any does. Costs a few credits.

### Or step by step

In Claude Code:

```
how many Kie credits do I have?
```

Then something cheap:

```
generate a 4:5 photo of a red bicycle against a white wall
```

A result URL means the whole chain works. That is one image, a few credits.

## If you prefer the MCP server

Optional. Generating works fully through the script. The server adds typed tool
results the model reads instead of parsing, live progress while a task runs, a
free offline brief check (`kie_validate_brief`, which the script does not have),
the guarded creator lip-sync tools, the model catalog and routing documents as
resources, and the render workflow as selectable prompts. It needs a build step,
which is why it is not the default.

```
cd metrix-creative-engine
corepack enable
pnpm install
pnpm run build
claude mcp add kie-ai --scope user --env KIE_AI_API_KEY=your-key -- node <absolute-path>/dist/index.js
```

Skills prefer MCP tools when `/mcp` lists `kie-ai`, and fall back to the script
otherwise. Either way they work.

To check the server end to end without spending a credit, run
`pnpm run check:mcp-surface` after a build. It drives the built bundle over a
real stdio MCP session against a stubbed Kie and asserts the handshake, the
advertised capabilities, every tool's output schema, the resources, the prompts
and the progress notifications. The expected tool, resource and prompt lists are
in that script.

## Optional: open an edit in Kdenlive (Windows)

`scripts/open-video-editor.ps1 [project]` opens a project in a portable Kdenlive kept at
`.tools/kdenlive-26.08.2/` (git-ignored, no system installer). `scripts/video-editor-install.json`
records the version, the download URL and the sha256 to verify the download against. The launcher
stops with a message when the editor is not there. Nothing else in the repository depends on it.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "KIE_AI_API_KEY is not set" | Key missing from the environment. On Windows, reopen the terminal after `setx` |
| Skill not listed by `/skills` | Not copied into `.claude/skills`, or Claude Code needs a restart |
| "Kie error … code 401" | Key wrong or revoked. Check <https://kie.ai/api-key> |
| "Kie error … code 402" | Out of credits |
| "Kie error … code 429" | Request limit exceeded. Pace the batch and retry |
| "Kie error … code 422" | The model rejected `input`. Check `docs/MODEL_CATALOG.md` |
| Exit code 2, "still running" | Not a failure. Poll the same taskId; never re-create |
| Video looks hung | Video takes minutes. Use `start` + `poll`, raise `--timeout` |

## What the script does

`scripts/kie.mjs`, bundled inside the three generating skills (`kie-generate`,
`kie-tasks` and `metrix-ad-creative`). The copies are byte-identical.

```
node scripts/kie.mjs credits
node scripts/kie.mjs ledger                       # what ran, and what is still downloadable
node scripts/kie.mjs upload <file> [--path DIR] [--receipt FILE]
node scripts/kie.mjs run   <model> '<input-json>' [--timeout N] [--out DIR] [--name ID]
node scripts/kie.mjs run   <model> --input-file spec.json
node scripts/kie.mjs start <model> '<input-json>'
node scripts/kie.mjs poll  <taskId> [--timeout N] [--out DIR] [--name ID]
node scripts/kie.mjs ugc-check <packet.json> [--observed-duration SECONDS]
node scripts/kie.mjs ugc-start <packet.json>
```

`ledger` and `ugc-check` need no API key, deliberately: they read local files, and
the ledger is the path back to an asset whose result URL has expired.

`--input-file` avoids shell quoting, which is the likeliest way a first run fails
on Windows. `upload --receipt FILE` writes the source hash, the returned URL and its expiry
to that path, because Kie deletes uploaded files after 3 days and the packet
binds to that evidence.
`ugc-check` and `ugc-start` are the script's side of the creator lip-sync guard:
the same offline packet check and one guarded submission as
`kie_validate_ugc_preproduction` and `kie_create_ugc_lipsync`. The shared logic is
`scripts/ugc-preflight.mjs`, also byte-identical across those three skills.

Result URLs on stdout, progress on stderr. No dependencies beyond Node.

## Where generated files go

`--out DIR` downloads results and `--name ID` names them; `--name` without `--out`
writes to `./out` and says so, rather than being dropped after the credits are
spent. The extension always comes off the delivered file, so a `--name` that
already ends in one does not produce `name.png.jpg`.

Both the remote URL and any filename it carries
are reduced to a single path segment, so a hostile name cannot write outside the
directory you chose.

Kie documents result URLs as expiring after about **24 hours**. A result URL is not
storage. Download anything you intend to keep or hand to a client.

## The task ledger

On by default. Every generation this server or the CLI starts appends one line
to `<KIE_AI_DOWNLOAD_DIR or ./out>/kie-ledger.jsonl`, and another when it
settles. The settle line carries the credits the task consumed when Kie reports
them, and a task with no recorded cost is unknown, not free.

It exists because Kie's result URLs expire after about 24 hours while the
`taskId` does not, so the id is the only durable handle on an asset you have
already paid for. Read it with `node kie.mjs ledger` (no API key required) or the
`kie_ledger` tool. To disable: `KIE_AI_LEDGER_PATH=off`.
