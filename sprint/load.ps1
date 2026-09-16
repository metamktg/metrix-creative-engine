# Find the sprint files and put them where they belong. No dragging.
#
#   .\sprint\load.ps1                 looks in Downloads, Desktop, Documents
#   .\sprint\load.ps1 C:\some\folder  looks there instead
#
# Briefs are identified by CONTENT, not by filename: a .json is a briefs file
# only if it actually parses and carries brief_metadata. A file named
# "briefs.json" that is something else is not copied, and a file named
# "export (3).json" that is the real thing is.
#
# Images are only taken from a folder that also produced a briefs file, or from
# a folder you name explicitly. Sweeping every image out of Downloads would put
# someone's screenshots into the render as product references.

param(
  [string]$Source = "",
  # Point at one briefs file when more than one is lying around.
  [string]$Briefs = ""
)

$ErrorActionPreference = "Stop"
$sprint = $PSScriptRoot
$briefsDir = Join-Path $sprint "briefs"
$refsDir = Join-Path $sprint "refs"
New-Item -ItemType Directory -Force -Path $briefsDir, $refsDir | Out-Null
# A load is a load, not an append: without this, every run piles more images on
# top of the last run's.
Get-ChildItem -LiteralPath $refsDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

if ($Source) {
  $roots = @($Source)
} else {
  $roots = @("Downloads", "Desktop", "Documents") | ForEach-Object { Join-Path $env:USERPROFILE $_ }
}

function Test-IsBriefs($path) {
  try {
    $raw = Get-Content -Raw -LiteralPath $path -ErrorAction Stop
    if ($raw.Length -gt 20MB) { return $false }
    $o = $raw | ConvertFrom-Json -ErrorAction Stop
  } catch { return $false }
  # Either an array of briefs, or an object wrapping one.
  $items = if ($o -is [array]) { $o } elseif ($o.creative_briefs) { $o.creative_briefs } elseif ($o.briefs) { $o.briefs } else { @($o) }
  foreach ($i in $items) { if ($i.PSObject.Properties.Name -contains "brief_metadata") { return $true } }
  return $false
}

Write-Host ""
Write-Host "Looking for your sprint files..." -ForegroundColor Cyan

if ($Briefs) {
  if (-not (Test-Path -LiteralPath $Briefs)) { Write-Host "  No file at $Briefs" -ForegroundColor Red; exit 1 }
  if (-not (Test-IsBriefs $Briefs)) { Write-Host "  $Briefs does not look like a briefs file (no brief_metadata)." -ForegroundColor Red; exit 1 }
  $found = @(Get-Item -LiteralPath $Briefs)
} else {
$found = @()
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -LiteralPath $root -Filter *.json -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | ForEach-Object {
      if (Test-IsBriefs $_.FullName) { $found += $_ }
    }
}
}

if ($found.Count -eq 0) {
  Write-Host "  No briefs file found." -ForegroundColor Yellow
  Write-Host "  Looked in: $($roots -join ', ')"
  Write-Host "  If it is somewhere else, run:  .\sprint\load.ps1 C:\path\to\that\folder"
  Start-Process explorer.exe $sprint
  exit 1
}

$brief = $found[0]
Copy-Item -LiteralPath $brief.FullName -Destination $briefsDir -Force
Write-Host ("  briefs: " + $brief.Name + "  (from " + $brief.DirectoryName + ")") -ForegroundColor Green
if ($found.Count -gt 1) {
  Write-Host ("  note: " + ($found.Count - 1) + " other briefs file(s) found. Took the newest. Others:") -ForegroundColor Yellow
  $found | Select-Object -Skip 1 | ForEach-Object { Write-Host ("        " + $_.FullName) }
  Write-Host '  To use a different one:  .\sprint\load.ps1 -Briefs "C:\path\to\that.json"' -ForegroundColor Yellow
}

# Images. "From the folder the briefs came from" was not a safeguard at all when
# that folder is Downloads: it swept 1,381 files, every image the machine had
# ever downloaded, into a set that a model reads as product references. A
# reference folder is one somebody made on purpose. Downloads, Desktop and
# Documents are junk drawers and are never it.
$imgExt = @(".jpg", ".jpeg", ".png", ".webp")
$generic = @("Downloads", "Desktop", "Documents") | ForEach-Object { Join-Path $env:USERPROFILE $_ }
$imgSource = if ($Source) { $Source } else { $brief.DirectoryName }

$images = @()
if ($generic -contains $imgSource.TrimEnd('\')) {
  Write-Host "  refs:   not taken from $imgSource - it is a general folder, not a reference set." -ForegroundColor Yellow
  Write-Host "          Put the product images in their own folder and run:" -ForegroundColor Yellow
  Write-Host ('          ...\setup.ps1 -Source "C:\path\to\that\folder"') -ForegroundColor Yellow
} else {
  $images = Get-ChildItem -LiteralPath $imgSource -File -ErrorAction SilentlyContinue |
    Where-Object { $imgExt -contains $_.Extension.ToLower() }
}

# The model takes 14 reference images. More than that is not a richer brief, it
# is a folder that was not curated, and loading it silently wastes a batch.
$REF_LIMIT = 14
if ($images.Count -gt $REF_LIMIT) {
  Write-Host ("  refs:   " + $images.Count + " images in $imgSource, and the model takes " + $REF_LIMIT + ".") -ForegroundColor Red
  Write-Host "          That folder has not been curated. Nothing was loaded." -ForegroundColor Red
  Write-Host "          Put the product shots in a folder of their own and point -Source at it." -ForegroundColor Red
  $images = @()
}

if ($images) {
  # Shorten the destination name. A browser download can carry a 200-character
  # name, and Windows PowerShell 5 still fails at 260 characters for the WHOLE
  # path, with "Could not find a part of the path" - which reads like the folder
  # is missing rather than like the name is too long. The source name carries no
  # meaning to a render anyway; the index and a readable stub do.
  $i = 0
  $copied = @()
  $skipped = @()
  foreach ($img in $images) {
    $i++
    $stub = [IO.Path]::GetFileNameWithoutExtension($img.Name) -replace '[^A-Za-z0-9._-]', ''
    if ($stub.Length -gt 32) { $stub = $stub.Substring(0, 32) }
    if ([string]::IsNullOrWhiteSpace($stub)) { $stub = "image" }
    $dest = Join-Path $refsDir ("ref-{0:d2}-{1}{2}" -f $i, $stub, $img.Extension.ToLower())
    try {
      # Long paths bite on the SOURCE too, not only the destination: a file whose
      # NAME is 250 characters cannot be opened by Windows PowerShell 5 at all,
      # even though Get-ChildItem listed it. And one unreadable file must never
      # take the whole load down with it - the other references are fine, and
      # stopping here means none of them arrive.
      Copy-Item -LiteralPath $img.FullName -Destination $dest -Force -ErrorAction Stop
      $copied += (Split-Path -Leaf $dest)
    } catch {
      $why = if ($img.FullName.Length -ge 250) { "its name is " + $img.Name.Length + " characters, past what Windows can open" } else { $_.Exception.Message }
      $skipped += ("        SKIPPED " + $img.Name.Substring(0, [Math]::Min(60, $img.Name.Length)) + "...  (" + $why + ")")
    }
  }
  Write-Host ("  refs:   " + $copied.Count + " image(s) from " + $brief.DirectoryName) -ForegroundColor Green
  $copied | ForEach-Object { Write-Host ("        " + $_) }
  if ($skipped.Count -gt 0) {
    Write-Host ("  refs:   " + $skipped.Count + " skipped, named below. The rest loaded fine.") -ForegroundColor Yellow
    $skipped | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  }
} elseif ($images.Count -eq 0 -and -not ($generic -contains $imgSource.TrimEnd('\'))) {
  Write-Host "  refs:   no images in $imgSource." -ForegroundColor Yellow
  Write-Host "          Put them in one folder with the briefs and run this again,"
  Write-Host "          or run:  .\sprint\load.ps1 C:\path\to\your\images"
}

# Nothing local? The brand kit recorded real asset URLs during the site audit,
# and they were verified reachable when it was written. Downloading them beats
# asking someone to go and find product photography they may not have: a render
# without references invents the product, which is the most common way a batch
# is wasted.
if ($copied.Count -eq 0) {
  $kits = @(Get-ChildItem -Path (Join-Path (Split-Path -Parent $PSScriptRoot) "brand-kits") -Filter "brand-kit.json" -Recurse -ErrorAction SilentlyContinue)
  if ($kits.Count -eq 1) {
    $kit = Get-Content -Raw -LiteralPath $kits[0].FullName | ConvertFrom-Json
    $assets = @($kit.brand_assets | Where-Object { $_.url })
    if ($assets.Count -gt 0) {
      Write-Host ("  refs:   no local images, pulling " + $assets.Count + " from " + $kit.brand + "'s brand kit") -ForegroundColor Cyan
      $j = 0
      foreach ($a in $assets) {
        $j++
        $ext = [IO.Path]::GetExtension(($a.url -split '\?')[0]); if (-not $ext) { $ext = ".jpg" }
        $dest = Join-Path $refsDir ("ref-{0:d2}-{1}{2}" -f $j, ($a.role -replace '[^A-Za-z0-9_-]', ''), $ext)
        try {
          Invoke-WebRequest -Uri $a.url -OutFile $dest -UseBasicParsing -ErrorAction Stop
          Write-Host ("        " + (Split-Path -Leaf $dest) + "   " + $a.role)
        } catch {
          Write-Host ("        COULD NOT FETCH " + $a.url + " (" + $_.Exception.Message + ")") -ForegroundColor Yellow
        }
      }
    }
  }
}

Write-Host ""
Write-Host "Loaded. Start Claude Code here and paste the contents of GO.txt." -ForegroundColor Cyan
Write-Host ""
