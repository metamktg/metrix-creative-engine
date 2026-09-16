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

# Run from the repo, whatever directory the window opened in. Every failure of
# this setup so far has been the same one: a fresh terminal starts in the user
# profile, and a command written as "sprint\setup.ps1" or "git pull" only works
# from inside the repo. The script knows where it lives, so it goes there.
Set-Location $repo

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

# Update itself. Otherwise "git pull" is a second command to remember, run from
# a directory that has to be right, which is the thing this script exists to
# remove. A failed pull (offline, local edits) is a note, never a stop: the
# checked-out version still works.
try {
  git -C $repo pull --ff-only --quiet 2>&1 | Out-Null
  Write-Host ("  repo: up to date (" + (git -C $repo rev-parse --short HEAD) + ")") -ForegroundColor Green
} catch {
  Write-Host "  repo: could not update, carrying on with what is checked out" -ForegroundColor Yellow
}

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

# 5. Find the sprint files and load them ---------------------------------
# Dragging files between folders is not the operator's job when the machine can
# identify them. load.ps1 opens the folder itself if it finds nothing.
& (Join-Path $PSScriptRoot "load.ps1")
Write-Host "Ready." -ForegroundColor Cyan
Write-Host ""
