# Setup

Two steps. No build, no MCP server, no Node install beyond what Claude Code
already needs.

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

Optional. It gives typed tool arguments instead of a shell call; it does not
unlock anything the script cannot do. It needs a build step, which is why it is
no longer the default.

```
cd metrix-creative-engine
corepack enable
pnpm install
pnpm run build
claude mcp add kie-ai --scope user --env KIE_AI_API_KEY=your-key -- node <absolute-path>/dist/index.js
```

Skills prefer MCP tools when `/mcp` lists `kie-ai`, and fall back to the script
otherwise. Either way they work.

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

`scripts/kie.mjs`, bundled inside every skill:

```
node scripts/kie.mjs credits
node scripts/kie.mjs run   <model> '<input-json>' [--timeout N] [--out DIR] [--name ID]
node scripts/kie.mjs start <model> '<input-json>'
node scripts/kie.mjs poll  <taskId> [--timeout N] [--out DIR] [--name ID]
```

Result URLs on stdout, progress on stderr. No dependencies beyond Node.

## Where generated files go

To check the server end to end without spending a credit, run
`pnpm run check:mcp-surface` after a build: it drives the built bundle over a
real stdio MCP session against a stubbed Kie and asserts the handshake, the
advertised capabilities, every tool's output schema, both resources, the prompts
and the progress notifications.

`--out DIR` downloads results and `--name ID` names them; `--name` without `--out`
writes to `./out` and says so, rather than being dropped after the credits are
spent. The extension always comes off the delivered file, so a `--name` that
already ends in one does not produce `name.png.jpg`.

Both the remote URL and any filename it carries
are reduced to a single path segment, so a hostile name cannot write outside the
directory you chose.

Kie documents result URLs as expiring after about **24 hours**. A result URL is not
storage. Download anything you intend to keep or hand to a client.
