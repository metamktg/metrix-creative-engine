#!/usr/bin/env bash
# Metrix Creative Engine - one-time setup. macOS / Linux.
#
#   bash sprint/setup.sh
#
# Installs the skills, makes the sprint folders, and proves the key works.
# Safe to re-run.
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

mkdir -p "$skills"
for s in "$repo"/skills/*; do
  rm -rf "$skills/$(basename "$s")"
  ln -s "$s" "$skills/$(basename "$s")"
done
echo "  skills: linked into $skills"

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
bash "$here/load.sh" || true

printf 'Ready.\n\n'
