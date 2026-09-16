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

param([string]$Source = "")

$ErrorActionPreference = "Stop"
$sprint = $PSScriptRoot
$briefsDir = Join-Path $sprint "briefs"
$refsDir = Join-Path $sprint "refs"
New-Item -ItemType Directory -Force -Path $briefsDir, $refsDir | Out-Null

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

$found = @()
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -LiteralPath $root -Filter *.json -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | ForEach-Object {
      if (Test-IsBriefs $_.FullName) { $found += $_ }
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
}

# Images, from the folder the briefs came from only.
$imgExt = @(".jpg", ".jpeg", ".png", ".webp")
$images = Get-ChildItem -LiteralPath $brief.DirectoryName -File -ErrorAction SilentlyContinue |
  Where-Object { $imgExt -contains $_.Extension.ToLower() }

if ($images) {
  $images | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $refsDir -Force }
  Write-Host ("  refs:   " + $images.Count + " image(s) from " + $brief.DirectoryName) -ForegroundColor Green
  $images | ForEach-Object { Write-Host ("        " + $_.Name) }
} else {
  Write-Host "  refs:   no images beside the briefs file." -ForegroundColor Yellow
  Write-Host "          Put them in one folder with the briefs and run this again,"
  Write-Host "          or run:  .\sprint\load.ps1 C:\path\to\your\images"
}

Write-Host ""
Write-Host "Loaded. Start Claude Code here and paste the contents of GO.txt." -ForegroundColor Cyan
Write-Host ""
