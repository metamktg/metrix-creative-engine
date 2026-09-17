#!/usr/bin/env bash
# Find the sprint files and put them where they belong. See load.ps1 for why
# briefs are identified by content and images only come from the briefs' folder.
#
#   bash sprint/load.sh                 looks in ~/Downloads, ~/Desktop, ~/Documents
#   bash sprint/load.sh /some/folder    looks there instead
set -euo pipefail

sprint="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$sprint/briefs" "$sprint/refs"
# A load is a load, not an append.
find "$sprint/refs" -maxdepth 1 -type f -delete 2>/dev/null || true
# briefs/ too: it was accumulating, and a stale file for another account sat
# beside the real one.
find "$sprint/briefs" -maxdepth 1 -type f -delete 2>/dev/null || true

# --briefs <file> names one exactly, for when more than one is lying around.
explicit=""
if [ "${1:-}" = "--briefs" ]; then explicit="${2:-}"; shift 2 || true; fi
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
if [ -n "$explicit" ]; then
  if [ ! -f "$explicit" ]; then printf '  No file at %s\n' "$explicit"; exit 1; fi
  if ! is_briefs "$explicit"; then printf '  %s does not look like a briefs file (no brief_metadata).\n' "$explicit"; exit 1; fi
  brief="$explicit"
fi
[ -n "$brief" ] || for root in "${roots[@]}"; do
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

srcdir="${IMG_SOURCE:-$(dirname "$brief")}"

# A general folder is never a reference set. Downloads held 1,381 images.
# Skip the local sweep rather than exiting: the brand-kit fallback below is a
# better answer than no references at all, and exiting here denied it.
skip_local=0
for junk in "$HOME/Downloads" "$HOME/Desktop" "$HOME/Documents"; do
  if [ "${srcdir%/}" = "${junk%/}" ]; then
    printf '  refs:   not taken from %s, it is a general folder, not a reference set.\n' "$srcdir"
    skip_local=1
  fi
done

# The model takes 14 references. More means the folder was not curated.
# `|| true`: ls exits non-zero when a glob matches nothing, and under
# `set -e` an assignment from a failing command substitution kills the script
# with no message at all - which is exactly how this read as "found no images"
# when it had in fact died before looking.
count=$(ls -1 "$srcdir"/*.jpg "$srcdir"/*.jpeg "$srcdir"/*.png "$srcdir"/*.webp 2>/dev/null | wc -l || true)
if [ "$count" -gt 14 ]; then
  printf '  refs:   %s images in %s, and the model takes 14. Not loaded.\n' "$count" "$srcdir"
  printf '          Put the product shots in a folder of their own and pass that folder.\n'
  skip_local=1
fi

n=0
if [ "$skip_local" = "0" ]; then
# Shorten the destination name: a browser download can carry a 200-character
# name, which on Windows blows the 260-character path limit. Same rule both
# sides so the two stay comparable.
for f in "$srcdir"/*.jpg "$srcdir"/*.jpeg "$srcdir"/*.png "$srcdir"/*.webp; do
  [ -f "$f" ] || continue
  n=$((n+1))
  base="$(basename "$f")"; ext="${base##*.}"; stem="${base%.*}"
  stub="$(printf '%s' "$stem" | tr -cd 'A-Za-z0-9._-' | cut -c1-32)"
  [ -n "$stub" ] || stub="image"
  dest="$(printf 'ref-%02d-%s.%s' "$n" "$stub" "$(printf '%s' "$ext" | tr 'A-Z' 'a-z')")"
  # One unreadable file must not take the whole load down: the others are fine.
  if cp -f "$f" "$sprint/refs/$dest" 2>/dev/null; then
    printf '        %s\n' "$dest"
  else
    n=$((n-1))
    printf '        SKIPPED %.60s...  (could not be read)\n' "$base"
  fi
done
fi
if [ "$n" -gt 0 ]; then printf '  refs:   %d image(s) from %s\n' "$n" "$srcdir"; fi

# Nothing local? Pull the brand kit's recorded asset URLs. A render without
# references invents the product.
if [ "$n" -eq 0 ]; then
  kit="$(find "$sprint/../brand-kits" -name brand-kit.json 2>/dev/null | head -2)"
  if [ "$(printf '%s\n' "$kit" | wc -l)" = "1" ] && [ -n "$kit" ]; then
    node -e '
      const fs=require("fs"), {execFileSync}=require("child_process");
      const kit=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const dir=process.argv[2];
      const assets=(kit.brand_assets||[]).filter(a=>a.url);
      if(!assets.length) process.exit(0);
      const brandName = kit.identity?.canonical_name || "an unnamed";
      console.log(`  refs:   no local images, pulling ${assets.length} from the ${brandName} brand kit`);
      assets.forEach((a,i)=>{
        const ext=(a.url.split("?")[0].match(/\.[a-z0-9]+$/i)||[".jpg"])[0];
        const role=String(a.role||"asset").replace(/[^A-Za-z0-9_-]/g,"");
        const dest=`${dir}/ref-${String(i+1).padStart(2,"0")}-${role}${ext}`;
        try { execFileSync("curl",["-sSfL","-m","40","-o",dest,a.url]); console.log(`        ${dest.split("/").pop()}   ${a.role}`); }
        catch { console.log(`        COULD NOT FETCH ${a.url}`); }
      });
    ' "$kit" "$sprint/refs"
  fi
fi

printf '\nLoaded. Start Claude Code here and paste the contents of GO.txt.\n\n'
