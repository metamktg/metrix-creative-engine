# Metrix Creative Engine - one-time setup. Windows PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File sprint\setup.ps1
#
# Installs the skills, makes the sprint folders, and proves the key works.
# Safe to re-run: it overwrites the skills with the current version, which is
# what you want after a git pull.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$skills = Join-Path $env:USERPROFILE ".claude\skills"

Write-Host ""
Write-Host "Metrix Creative Engine setup" -ForegroundColor Cyan
Write-Host ""

# 0. Prerequisites -------------------------------------------------------
# Checked by name rather than assumed. A missing node shows up three steps
# later as an unreadable error about a script path, which is how someone ends
# up debugging the wrong thing.
foreach ($tool in @("git", "node")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Host "  $tool is not installed, or not on PATH." -ForegroundColor Red
    if ($tool -eq "node") { Write-Host "  Install Node 20 or newer: https://nodejs.org" }
    else { Write-Host "  Install Git: https://git-scm.com/download/win" }
    Write-Host "  Then close this window, open a new one, and run this again."
    exit 1
  }
}
Write-Host ("  git:  " + (git --version)) -ForegroundColor Green
Write-Host ("  node: " + (node --version)) -ForegroundColor Green

# 1. The key -------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($env:KIE_AI_API_KEY)) {
  Write-Host "KIE_AI_API_KEY is not set in this terminal." -ForegroundColor Yellow
  Write-Host "Paste your Kie key (it is not echoed, not logged, and not stored by this script):"
  $secure = Read-Host -AsSecureString
  $env:KIE_AI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  # Persist for future terminals. Remove this line if you would rather set it
  # per-session.
  setx KIE_AI_API_KEY $env:KIE_AI_API_KEY | Out-Null
  Write-Host "  saved. New terminals will have it; this one already does." -ForegroundColor Green
} else {
  Write-Host "  key: already set in this terminal" -ForegroundColor Green
}

# 2. Skills --------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $skills | Out-Null
Copy-Item -Path (Join-Path $repo "skills\*") -Destination $skills -Recurse -Force
Write-Host "  skills: installed to $skills" -ForegroundColor Green

# 3. Folders -------------------------------------------------------------
foreach ($d in @("briefs", "refs", "out")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot $d) | Out-Null
}
Write-Host "  folders: sprint\briefs, sprint\refs, sprint\out" -ForegroundColor Green

# 4. Prove the key reaches Kie -------------------------------------------
Write-Host ""
Write-Host "Checking your Kie balance..."
& node (Join-Path $repo "skills\metrix-ad-creative\scripts\kie.mjs") credits
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "The key did not work. Nothing else will until it does." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Ready." -ForegroundColor Cyan
Write-Host "  1. Drop the briefs .json into  sprint\briefs\"
Write-Host "  2. Drop the reference images into  sprint\refs\"
Write-Host "  3. Start Claude Code in this folder and paste the contents of sprint\GO.txt"
Write-Host ""
