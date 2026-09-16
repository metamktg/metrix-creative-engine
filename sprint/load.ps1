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

# Images, from the folder the briefs came from only.
$imgExt = @(".jpg", ".jpeg", ".png", ".webp")
$images = Get-ChildItem -LiteralPath $brief.DirectoryName -File -ErrorAction SilentlyContinue |
  Where-Object { $imgExt -contains $_.Extension.ToLower() }

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
} else {
  Write-Host "  refs:   no images beside the briefs file." -ForegroundColor Yellow
  Write-Host "          Put them in one folder with the briefs and run this again,"
  Write-Host "          or run:  .\sprint\load.ps1 C:\path\to\your\images"
}

Write-Host ""
Write-Host "Loaded. Start Claude Code here and paste the contents of GO.txt." -ForegroundColor Cyan
Write-Host ""
