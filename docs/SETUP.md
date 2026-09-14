# Setup

Three things have to be true before a skill can generate anything: the server is
built, your key is in the environment, and Claude Code can see both.

## 1. Get a Kie.ai API key

Create one at <https://kie.ai/api-key> and top up credits. Generations cost
credits; `kie_get_credits` reports the balance.

## 2. Build the server

```bash
git clone https://github.com/metamktg/metrix-creative-engine.git
cd metrix-creative-engine
pnpm install
pnpm run build
```

`pnpm run build` produces `dist/index.js`, a single bundled file. Nothing works
until this exists — the MCP config points straight at it.

Verify before wiring anything up:

```bash
pnpm run verify   # typecheck + 62 tests + build
```

## 3. Put the key in your environment

```bash
cp .env.example .env   # then edit .env
```

`.env` is gitignored. Export it in the shell you launch Claude Code from:

```bash
set -a && source .env && set +a
claude
```

The `.mcp.json` in this repo reads `${KIE_AI_API_KEY}` from that environment
rather than storing it, so the key is never committed.

## 4. Connect the MCP server

**Option A, this project only (simplest).** `.mcp.json` is already committed
here. Launch `claude` from the repo root and approve the server when prompted.
Confirm with `/mcp` — you want `kie-ai` listed as connected.

**Option B, available everywhere.** Register it globally, with an absolute path:

```bash
claude mcp add kie-ai --scope user \
  --env KIE_AI_API_KEY="$KIE_AI_API_KEY" \
  --env KIE_AI_DOWNLOAD_DIR="$HOME/kie-out" \
  -- node /absolute/path/to/metrix-creative-engine/dist/index.js
```

Use option B if you want to generate creative from inside `metrix-iap` or any
other project, which is the usual case for brief-to-asset work.

## 5. Install the skills

The skills live in `skills/`. Claude Code reads skills from `.claude/skills/`,
so link or copy them.

**Personal, available in every project:**

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/"* ~/.claude/skills/
```

Symlinks mean `git pull` updates the skills in place. Copy instead of linking if
you would rather pin a version.

**One project only:**

```bash
mkdir -p /path/to/project/.claude/skills
cp -r skills/* /path/to/project/.claude/skills/
```

Confirm with `/skills` in Claude Code. You should see the `kie-*` skills listed.

## 6. Smoke test

In Claude Code:

```
/kie-image a photo of a red bicycle against a white wall
```

If that returns a URL, the whole chain works. If it fails, work down this list:

| Symptom | Cause |
| --- | --- |
| Skill not listed by `/skills` | Skills not linked into `.claude/skills/`, or Claude Code needs a restart |
| `kie-ai` not listed by `/mcp` | `.mcp.json` not approved, or you launched `claude` from another directory |
| "KIE_AI_API_KEY is not set" | The key was not exported into the shell that launched Claude Code |
| `Cannot find module .../dist/index.js` | `pnpm run build` was never run, or the path in the config is wrong |
| "Unauthorized" | Key is wrong or revoked. Check it at <https://kie.ai/api-key> |
| "Rate limited" | Kie allows 20 new generations per 10 seconds. Batch more slowly |
| Insufficient credits | Run `kie_get_credits` and top up |

## Where generated files go

`KIE_AI_DOWNLOAD_DIR` fixes the one directory `kie_download_result` may write
to, and both the result URL and any filename you pass are reduced to a single
path segment, so neither can escape it. When the variable is unset the download
tool is not registered at all and you get URLs only.

Kie deletes generated media after about 14 days. Treat a result URL as
temporary: download anything you intend to keep or hand to a client.
