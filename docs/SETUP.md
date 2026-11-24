# Setup

The engine installs as one Claude Code plugin: its skills, its MCP server and a
session hook, together. Take that route unless you have a reason not to. Nothing
needs building.

You need:

- Claude Code.
- Node.js 20 or newer on your PATH. The MCP server and the session hook run on it.
- Git, for the marketplace install.
- A Kie.ai key from <https://kie.ai/api-key>, on an account with credits.

## 1. Install the plugin

```
claude plugin marketplace add metamktg/metrix-creative-engine
claude plugin install metrix-creative-engine@metrix-creative-engine
```

The plugin has three options. Set them inside Claude Code with
`/plugin configure metrix-creative-engine@metrix-creative-engine`, or set the
two folders when you install:

```
claude plugin install metrix-creative-engine@metrix-creative-engine --config runs_dir=<folder> --config assets_dir=<folder>
```

| Option | Key | What it holds | When left empty |
| --- | --- | --- | --- |
| Kie.ai API key | `kie_api_key` | Your key, stored as a secret | `KIE_AI_API_KEY` from the environment |
| Runs folder | `runs_dir` | Generated files, receipts, render specs and the task ledger | `KIE_AI_DOWNLOAD_DIR`, else `./out` in the folder Claude Code started in |
| Assets folder | `assets_dir` | Brand kits (`brand-kits/<account>/`), product references, approved briefs and accepted media | `METRIX_ASSETS_DIR`, else the folder you work in |

Keep the key out of `--config`: a command line lands in your shell history. Use
the `/plugin configure` dialog, or put the key in the environment (step 2).

Restart Claude Code after installing or changing an option. Each session then
opens with one line that names the runs folder, the assets folder and where the
key came from, or says it is missing. The MCP server states both folders in its
handshake too.

The session hook also hands the options to the session's shell, so the bundled
script sees the same key and folders as the MCP tools. To do that it writes
them, the key included, in plain text to the session's environment file under
Claude Code's config folder (`session-env/<session id>/`), and that file can
outlast the session. Commands Claude runs in that shell can read the key, as
they can any key in your environment. If you would rather no copy of the key is
written, leave the key option empty and put the key in your environment
(step 2): the hook then writes only the folders.

Client material belongs in the runs and assets folders. Never put a brief, a
brand kit, a product photo or a receipt in this repository: it is public, and a
plugin install copies it to every user.

**Use it.** Hand Claude Code an approved brief, for example
`produce the creative from briefs/creative_briefs.json`. The entry skill,
`metrix-creative-engine:metrix-produce`, checks the brief, reads its declared
format and runs the other skills in order.

**Update:**

```
claude plugin marketplace update metrix-creative-engine
claude plugin update metrix-creative-engine@metrix-creative-engine
```

Then restart. An update arrives when the plugin's version rises.

**Remove:** `claude plugin uninstall metrix-creative-engine@metrix-creative-engine`.

**Coming from the old copies.** Earlier setups copied or linked each skill into
`~/.claude/skills`. A copy left there loads beside the plugin's own, so the same
skill is listed twice (`kie-generate` and `metrix-creative-engine:kie-generate`).
Move those folders out once the plugin is installed.

## 2. Or put your key in the environment

The plugin reads `KIE_AI_API_KEY` when its own key option is empty, and so does
the bundled script.

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

Optional: `KIE_AI_DOWNLOAD_DIR` sets the runs folder when the plugin's option is
empty, and `METRIX_ASSETS_DIR` the assets folder.

## 3. Check it works

From a clone of this repository, one command proves the whole chain and tells
you pass or fail:

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

## Other ways to install

### Unzip into your skills folder

Download the repository as a zip, or clone it, and put it at
`~/.claude/skills/metrix-creative-engine/`, so that
`~/.claude/skills/metrix-creative-engine/.claude-plugin/plugin.json` exists.
GitHub names the zip's top folder after the branch (`metrix-creative-engine-main`),
so rename it. The next session loads it as the plugin
`metrix-creative-engine@skills-dir`, with the same skills, MCP server and hook.
Set its options with `/plugin configure metrix-creative-engine@skills-dir`. To
update, replace the folder with a newer copy.

### One skill on its own

Copy one folder from `skills/` into `~/.claude/skills/` (every project) or
`.claude/skills/` (one project):

```
xcopy /E /I /Y metrix-creative-engine\skills\kie-generate "%USERPROFILE%\.claude\skills\kie-generate"   REM Windows
ln -s "$(pwd)/metrix-creative-engine/skills/kie-generate" ~/.claude/skills/                           # macOS / Linux
```

The three generating skills (`kie-generate`, `kie-tasks`, `metrix-ad-creative`)
carry `scripts/kie.mjs` and need only `KIE_AI_API_KEY`. The symlink form updates
itself on `git pull`; a copy does not. Do not install a skill both ways: it loads
twice.

### The MCP server alone

For Claude Desktop or any other MCP client. The server is the committed
`server/index.js`, a single file with every dependency inside it, so a clone is
enough. It adds typed tool results the model reads instead of parsing, live
progress while a task runs, a free offline brief check (`kie_validate_brief`,
which the script does not have), the guarded creator lip-sync tools, the model
catalog and routing documents as resources, and the render workflow as
selectable prompts. Without the skills it has no workflow of its own.

Claude Code:

```
claude mcp add kie-ai --scope user --env KIE_AI_API_KEY=your-key -- node <absolute-path>/server/index.js
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kie-ai": {
      "command": "node",
      "args": ["<absolute-path>/server/index.js"],
      "env": {
        "KIE_AI_API_KEY": "your-key",
        "KIE_AI_DOWNLOAD_DIR": "<absolute-path-to-your-runs-folder>",
        "METRIX_ASSETS_DIR": "<absolute-path-to-your-assets-folder>"
      }
    }
  }
}
```

Every variable the server reads is in
[`MCP_TOOLS.md`](MCP_TOOLS.md#configuration). Skills prefer MCP tools when
`/mcp` lists `kie-ai`, and fall back to the script otherwise.

To check the server end to end without spending a credit, run `pnpm install`
then `pnpm run check:mcp-surface` in a clone. It drives the committed bundle over
a real stdio MCP session against a stubbed Kie and asserts the handshake, the
advertised capabilities, every tool's output schema, the resources, the prompts
and the progress notifications. The expected tool, resource and prompt lists are
in that script.

### Claude Code on the web

Nothing to install. A session on this repository reads `AGENTS.md`, which sends
production to `skills/metrix-produce/SKILL.md`, and `.mcp.json` starts the MCP
server from the committed bundle with the environment's `KIE_AI_API_KEY`. The
session hook installs the development dependencies so `npm run verify` can run.

## Optional: open an edit in Kdenlive (Windows)

`scripts/open-video-editor.ps1 [project]` opens a project in a portable Kdenlive kept at
`.tools/kdenlive-26.08.2/` (git-ignored, no system installer). `scripts/video-editor-install.json`
records the version, the download URL and the sha256 to verify the download against. The launcher
stops with a message when the editor is not there. Nothing else in the repository depends on it.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "KIE_AI_API_KEY is not set" | Key missing from the environment. On Windows, reopen the terminal after `setx` |
| `plugin:metrix-creative-engine:kie-ai` failed to connect (`/mcp`, `claude mcp list`) | No key: set the plugin's key option or `KIE_AI_API_KEY`, then restart Claude Code |
| Skill not listed by `/skills` | Not installed: `claude plugin list` should show `metrix-creative-engine`. Restart Claude Code after installing |
| Every skill listed twice | Old copies in `~/.claude/skills` beside the plugin. Move them out |
| "node" not found as a session starts | Node.js is not on PATH. Install Node 20 or newer |
| An update did not arrive | Run `claude plugin marketplace update metrix-creative-engine` first. `claude plugin update` moves only when the version rises |
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
to `kie-ledger.jsonl` in the runs folder (the plugin's option, else
`KIE_AI_DOWNLOAD_DIR`, else `./out`), and another when it settles. The settle line carries the credits the task consumed when Kie reports
them, and a task with no recorded cost is unknown, not free.

It exists because Kie's result URLs expire after about 24 hours while the
`taskId` does not, so the id is the only durable handle on an asset you have
already paid for. Read it with `node kie.mjs ledger` (no API key required) or the
`kie_ledger` tool. To disable: `KIE_AI_LEDGER_PATH=off`.
