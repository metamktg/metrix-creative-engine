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

if [ -z "${KIE_AI_API_KEY:-}" ]; then
  echo "KIE_AI_API_KEY is not set in this terminal."
  echo "Paste your Kie key (not echoed, not logged, not stored by this script):"
  read -rs KIE_AI_API_KEY
  export KIE_AI_API_KEY
  echo "  set for this terminal. Add it to your shell profile to persist it."
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

# Brand kits live in the assets folder: METRIX_ASSETS_DIR when the
# environment sets it, else the plugin's assets folder option. load.sh looks
# there before this checkout's own brand-kits folder.
if [ -z "${METRIX_ASSETS_DIR:-}" ]; then
  METRIX_ASSETS_DIR="$(claude plugin configure "$plugin" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{process.stdout.write(JSON.parse(s).inputs?.assets_dir||"")}catch{}})' || true)"
fi
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
# load.sh opens the folder itself when it finds nothing.
bash "$here/load.sh" "$@" || true

# The same start GO.cmd makes on Windows: downloads land in sprint/out, and the
# settings file stops this checkout's own .mcp.json server, which the plugin
# already brings. Both last for that session only.
printf 'Ready. Start Claude Code with:\n\n'
printf '  cd %q && KIE_AI_DOWNLOAD_DIR="$PWD/sprint/out" claude --settings sprint/session-settings.json\n\n' "$repo"
printf 'then paste:  Read sprint/GO.txt and do exactly what it says.\n\n'
