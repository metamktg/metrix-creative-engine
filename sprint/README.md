# Run a sprint

## Windows

**Double-click `GO.cmd`** in the folder above this one. That is all of it: it
updates itself, installs anything missing, finds your briefs and reference
images, and starts Claude Code.

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

Same behaviour. `--briefs <file>` and a folder argument do the same two jobs.

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
URLs, which is what happens by default.

## Afterwards

```
node skills/metrix-ad-creative/scripts/kie.mjs ledger
```

Every asset should already be in `sprint/out/`. Anything showing only a URL
expires about 24 hours after it was made.
