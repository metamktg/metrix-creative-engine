#!/usr/bin/env bash
# Find the sprint files and put them where they belong. See load.ps1 for why
# briefs are identified by content and images only come from the briefs' folder.
#
#   bash sprint/load.sh                 looks in ~/Downloads, ~/Desktop, ~/Documents
#   bash sprint/load.sh /some/folder    looks there instead
set -euo pipefail

sprint="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$sprint/briefs" "$sprint/refs"

if [ $# -gt 0 ]; then roots=("$1"); else roots=("$HOME/Downloads" "$HOME/Desktop" "$HOME/Documents"); fi

is_briefs() {
  node -e '
    const fs = require("fs");
    try {
      const raw = fs.readFileSync(process.argv[1], "utf8");
      if (raw.length > 20e6) process.exit(1);
      const o = JSON.parse(raw);
      const items = Array.isArray(o) ? o : (o.creative_briefs || o.briefs || [o]);
      process.exit(items.some((i) => i && typeof i === "object" && "brief_metadata" in i) ? 0 : 1);
    } catch { process.exit(1); }
  ' "$1" 2>/dev/null
}

printf '\nLooking for your sprint files...\n'

brief=""
for root in "${roots[@]}"; do
  [ -d "$root" ] || continue
  while IFS= read -r f; do
    if is_briefs "$f"; then brief="$f"; break 2; fi
  done < <(ls -t "$root"/*.json 2>/dev/null || true)
done

if [ -z "$brief" ]; then
  printf '  No briefs file found.\n'
  printf '  Looked in: %s\n' "${roots[*]}"
  printf '  If it is elsewhere:  bash sprint/load.sh /path/to/that/folder\n\n'
  exit 1
fi

cp -f "$brief" "$sprint/briefs/"
printf '  briefs: %s\n' "$(basename "$brief")"

srcdir="$(dirname "$brief")"
n=0
for f in "$srcdir"/*.jpg "$srcdir"/*.jpeg "$srcdir"/*.png "$srcdir"/*.webp; do
  [ -f "$f" ] || continue
  cp -f "$f" "$sprint/refs/"; n=$((n+1))
  printf '        %s\n' "$(basename "$f")"
done
if [ "$n" -gt 0 ]; then printf '  refs:   %d image(s) from %s\n' "$n" "$srcdir"
else printf '  refs:   no images beside the briefs file.\n'; fi

printf '\nLoaded. Start Claude Code here and paste the contents of GO.txt.\n\n'
