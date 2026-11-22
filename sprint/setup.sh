#!/usr/bin/env bash
# Metrix Creative Engine - one-time setup. macOS / Linux.
#
#   bash sprint/setup.sh
#
# Installs the engine as a Claude Code plugin, makes the sprint folders, and
# proves the key works. Safe to re-run: every step is a no-op when its work is
# already done.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(dirname "$here")"
skills="$HOME/.claude/skills"

# Run from the repo, whatever directory the shell started in.
cd "$repo"

printf '\nMetrix Creative Engine setup\n\n'

for tool in git node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '  %s is not installed, or not on PATH.\n' "$tool"
    [ "$tool" = "node" ] && printf '  Install Node 20 or newer: https://nodejs.org\n'
    exit 1
  fi
done
printf '  git:  %s\n' "$(git --version)"
printf '  node: %s\n' "$(node --version)"

# Update itself, so one command is the whole thing. A failed pull is a note.
if git -C "$repo" pull --ff-only --quiet 2>/dev/null; then
  printf '  repo: up to date (%s)\n' "$(git -C "$repo" rev-parse --short HEAD)"
else
  printf '  repo: could not update, carrying on with what is checked out\n'
fi

key_from_setup=0
if [ -z "${KIE_AI_API_KEY:-}" ]; then
  echo "KIE_AI_API_KEY is not set in this terminal."
  echo "Paste your Kie key (not echoed, not logged, not stored by this script):"
  read -rs KIE_AI_API_KEY
  export KIE_AI_API_KEY
  key_from_setup=1
  # A script cannot change the shell that started it, so the key reaches this
  # run and what it starts, never the terminal. The start line below says so.
  echo "  set for this setup run only."
else
  echo "  key: already set in this terminal"
fi

# The engine, as one Claude Code plugin: the skills, the MCP server and the
# session hook, from GitHub, the way every user installs them. Not from this
# checkout: a plugin install copies its source folder, and this one holds
# sprint/briefs, sprint/refs and sprint/out, which are client material. Each
# command is a no-op when its work is already done.
if ! command -v claude >/dev/null 2>&1; then
  printf '  Claude Code is not installed: https://docs.claude.com/en/docs/claude-code/setup\n'
  exit 1
fi
plugin=metrix-creative-engine@metrix-creative-engine
for step in "marketplace add metamktg/metrix-creative-engine" "marketplace update metrix-creative-engine" "install $plugin" "update $plugin"; do
  # The words of $step are the command's arguments, so they are not quoted.
  # shellcheck disable=SC2086
  if ! out="$(claude plugin $step 2>&1)"; then
    printf '  plugin: "claude plugin %s" failed:\n%s\n' "$step" "$out"
    exit 1
  fi
done
echo "  plugin: $plugin installed and current"

# The old setup linked each skill into ~/.claude/skills, and those links load
# beside the plugin's copies, so each skill would be listed twice. A link
# that points into this checkout is this script's own and goes. Anything else
# may be someone's edited copy, so it is named and left alone.
kept=""
for s in "$repo"/skills/*; do
  dest="$skills/$(basename "$s")"
  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$s" ]; then
    rm "$dest"
  elif [ -e "$dest" ]; then
    kept="$kept $(basename "$s")"
  fi
done
if [ -n "$kept" ]; then
  printf '  skills: standalone copies in %s load beside the plugin'"'"'s:%s\n' "$skills" "$kept"
  printf '          Move them out of %s to load only the plugin'"'"'s.\n' "$skills"
fi

# Brand kits live in the assets folder: the plugin's assets folder option when
# it is set, else METRIX_ASSETS_DIR from the environment. The MCP server and
# the session hook use the same order, so the loader and the session never
# read two different folders. load.sh resolves it the same way and looks there
# before this checkout's own brand-kits folder.
configured="$(claude plugin configure "$plugin" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).inputs?.assets_dir||"")}catch{}})' || true)"
METRIX_ASSETS_DIR="${configured:-${METRIX_ASSETS_DIR:-}}"
export METRIX_ASSETS_DIR
if [ -n "$METRIX_ASSETS_DIR" ]; then echo "  assets: $METRIX_ASSETS_DIR"; fi

mkdir -p "$here/briefs" "$here/refs" "$here/out"
echo "  folders: sprint/briefs, sprint/refs, sprint/out"

printf '\nChecking your Kie balance...\n'
# set -e would kill the script here with no explanation, and a bad key is the
# most likely thing to go wrong on a new machine.
if ! node "$repo/skills/metrix-ad-creative/scripts/kie.mjs" credits; then
  printf '\nThe key did not work. Nothing else will until it does.\n'
  printf 'Get one at https://kie.ai/api-key, then re-run this script.\n\n'
  exit 1
fi

# Find and load the sprint files rather than asking for them to be dragged.
# When it finds no briefs, load.sh says where it looked and how to point it
# elsewhere, then exits non-zero. Setup carries on, so the start line still
# prints.
bash "$here/load.sh" "$@" || true

# The command to copy sits alone on its line: a note after it on the same line
# would be pasted with it and break it.
if [ "$key_from_setup" = "1" ]; then
  printf 'The key you pasted reached this setup run only. Before the start line, give\n'
  printf 'it to the terminal you start Claude Code in, without it landing in history.\n'
  printf 'Run this, then paste the key and press Enter:\n\n'
  printf '  read -rs KIE_AI_API_KEY && export KIE_AI_API_KEY\n\n'
  printf 'or add an export line to ~/.zshrc or ~/.bashrc, or set the key inside\n'
  printf 'Claude Code with /plugin configure.\n\n'
fi
# The same start GO.cmd makes on Windows: downloads land in sprint/out unless
# the plugin's runs folder option names another folder, and the settings file
# stops this checkout's own .mcp.json server, which the plugin already brings.
# Both last for that session only.
printf 'Ready. Start Claude Code with:\n\n'
printf '  cd %q && KIE_AI_DOWNLOAD_DIR="$PWD/sprint/out" claude --settings sprint/session-settings.json\n\n' "$repo"
printf 'then paste:  Read sprint/GO.txt and do exactly what it says.\n\n'
