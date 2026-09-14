# Setup

Pick the environment you will actually use. The difference is not cosmetic: a
server running in the cloud cannot write files to your PC, and one running on
your PC cannot be reached from a browser session.

| You work in | Follow |
| --- | --- |
| Claude Code on the web (browser) | [Part A](#part-a--claude-code-on-the-web) |
| Claude Code on Windows (desktop app or terminal) | [Part B](#part-b--claude-code-on-windows) |

Both need a Kie.ai API key from <https://kie.ai/api-key>, with credits on the
account. Generations cost credits; `kie_get_credits` reports the balance.

---

# Part A — Claude Code on the web

The repo builds itself here. `.claude/hooks/session-start.sh` runs
`pnpm install && pnpm run build` when a web session starts, so `dist/index.js`
exists before the MCP server is launched. You do not run anything by hand.

**The one thing you must set: the API key**, as an environment variable on the
Claude Code environment (the same place other secrets for the environment live),
named `KIE_AI_API_KEY`. It cannot live in the repo. If it is missing the session
still starts and the hook prints a warning, but every Kie tool call returns 401.

Optionally also set `KIE_AI_DOWNLOAD_DIR` (for example `./out`) to enable
`kie_download_result`. Files land inside the container, so download them from
the session or commit them if you want to keep them; the container is discarded
when the session ends.

Then open a session on this repo and check `/mcp` lists `kie-ai` as connected.
The skills in `skills/` are picked up from the repo automatically.

**Caveat worth knowing.** The hook only takes effect for sessions started from a
branch that contains it. Once it is on `main`, every future session has it.

---

# Part B — Claude Code on Windows

## 1. Prerequisites

Open Command Prompt and check:

```
node -v
```

If that errors, install Node.js LTS from <https://nodejs.org> and reopen the
terminal. Then enable pnpm, which ships with Node:

```
corepack enable
```

## 2. Get the repo

```
cd /d %USERPROFILE%
git clone https://github.com/metamktg/metrix-creative-engine.git
cd metrix-creative-engine
```

## 3. Build

```
pnpm install
pnpm run build
```

This creates `dist\index.js`. Nothing works until it exists, because the MCP
config points straight at it. Verify the whole thing:

```
pnpm run verify
```

Typecheck, 62 tests, build. All three should pass.

## 4. Register the MCP server

Use an absolute path, and pick a real folder for generated files:

```
claude mcp add kie-ai --scope user --env KIE_AI_API_KEY=your-key-here --env KIE_AI_DOWNLOAD_DIR=%USERPROFILE%\kie-out -- node %USERPROFILE%\metrix-creative-engine\dist\index.js
```

`--scope user` makes it available in every project, which is what you want if
you plan to generate creative while working inside `metrix-iap`.

Check it with `/mcp` inside Claude Code. You want `kie-ai` listed as connected.

## 5. Install the skills

Windows has no easy symlink, so copy them:

```
mkdir "%USERPROFILE%\.claude\skills" 2>nul
xcopy /E /I /Y skills "%USERPROFILE%\.claude\skills"
```

Check with `/skills`. You should see `kie-generate`, `kie-tasks` and
`metrix-ad-creative`.

Re-run that `xcopy` after any `git pull`, since copies do not update themselves.

## 6. Smoke test

In Claude Code, ask for something cheap before trusting it with a matrix:

```
generate a 4:5 photo of a red bicycle against a white wall
```

A result URL means the whole chain works.

---

# Troubleshooting

| Symptom | Cause |
| --- | --- |
| Skill not listed by `/skills` | Not copied into `.claude/skills`, or Claude Code needs a restart |
| `kie-ai` not listed by `/mcp` | Server not registered, or the path in the config is wrong |
| "KIE_AI_API_KEY is not set" | Key missing from the environment (web) or the `claude mcp add` command (Windows) |
| `Cannot find module ...dist\index.js` | `pnpm run build` was never run, or the path is wrong |
| "Unauthorized" | Key is wrong or revoked. Check <https://kie.ai/api-key> |
| "Rate limited" | Kie allows 20 new generations per 10 seconds. Pace the batch |
| "Validation error" | The model rejected `input`. Check `docs/MODEL_CATALOG.md` |
| Insufficient credits | Run `kie_get_credits` and top up |

## Where generated files go

`KIE_AI_DOWNLOAD_DIR` fixes the one directory `kie_download_result` may write
to, and both the result URL and any filename passed are reduced to a single path
segment, so neither can escape it. When the variable is unset the download tool
is not registered at all and you get URLs only.

Kie deletes generated media after about 14 days. Treat a result URL as
temporary: download anything you intend to keep or hand to a client.
