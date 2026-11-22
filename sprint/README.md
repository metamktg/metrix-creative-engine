# Run a sprint

## Windows

**Double-click `GO.cmd`** in the folder above this one. That is all of it: it
updates itself, installs anything missing (Claude Code, then the engine as a
Claude Code plugin), finds your briefs and reference images, and starts Claude
Code.

Then paste one line into Claude Code:

```
Read sprint/GO.txt and do exactly what it says.
```

Options, when you need them:

```
GO.cmd -Briefs "C:\path\to\that.json"     pick one of several briefs files
GO.cmd -Source "C:\path\to\images"        take references from this folder
```

`sprint\WINDOWS-START-HERE.txt` lists every failure this replaced and why a
double-clicked file is immune to it.

## macOS / Linux

```
bash sprint/setup.sh
```

Same behaviour, except that it prints the line that starts Claude Code rather
than starting it. `--briefs <file>` and a folder argument do the same two jobs.

## What gets installed

The engine installs as one Claude Code plugin, from GitHub: its skills, its
MCP server and a session hook. `claude plugin list` shows it as
`metrix-creative-engine@metrix-creative-engine`. Each re-run picks up a new
version and is otherwise a no-op.

The setup used to copy each skill into `~/.claude/skills` instead. Copies left
there load beside the plugin's, so each skill is listed twice. The Windows
setup names them and prints the command that moves them aside; the macOS and
Linux setup removes the links it made itself and names anything else.

The session GO.cmd starts writes downloads to `sprint/out/` and leaves out the
`kie-ai` server in this checkout's `.mcp.json`, which the plugin already
brings. Neither setting outlasts the session. If you have set a runs folder in
the plugin's options, the plugin writes there instead, and the session start
names that folder.

## Where the files go

```
sprint/briefs/     the .json from Metrix, found automatically
sprint/refs/       reference images
sprint/out/        everything the run produces
```

Both `briefs/` and `refs/` are emptied at the start of every load, so a stale
file from a previous run, or from another client, can never sit beside the real
one.

Reference images are never swept from Downloads, Desktop or Documents. Point
`-Source` at a real folder, or let it pull the brand kit's own verified asset
URLs, which is what happens by default. The kit is looked for in the assets
folder's `brand-kits/` (`METRIX_ASSETS_DIR`, or the plugin's assets folder
option), then in this checkout's git-ignored `brand-kits/`. It is used only when
that folder holds exactly one kit.

## Afterwards

```
node skills/metrix-ad-creative/scripts/kie.mjs ledger
```

Every asset should already be in `sprint/out/`. Anything showing only a URL
expires about 24 hours after it was made.
