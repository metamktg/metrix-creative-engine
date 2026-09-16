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

# Open the folder rather than printing a path to be retyped.
if command -v open >/dev/null 2>&1; then open "$here"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$here" >/dev/null 2>&1 || true
fi

printf '\nReady.\n\n'
printf 'Drag your files into the sprint folder:\n'
printf '  briefs  <- the briefs .json\n'
printf '  refs    <- the reference images\n\n'
printf 'Then start Claude Code here and paste the contents of GO.txt.\n\n'
