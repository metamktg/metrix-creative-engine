# Metrix Creative Engine - one-time setup. Windows PowerShell.
#
#   powershell -ExecutionPolicy Bypass -File sprint\setup.ps1
#
# Installs the engine as a Claude Code plugin, makes the sprint folders, and
# proves the key works. Safe to re-run: every step is a no-op when its work is
# already done, so a re-run after a git pull only picks up a new version.

# Passed straight through to load.ps1. It lives here because setup.ps1 is the
# only entry point that updates itself first, so it is the only one that can be
# relied on to be the current version.
param(
  [string]$Briefs = "",
  [string]$Source = "",
  # Set when this run is already a restart, so the restart can happen at most
  # once and a broken pull can never spin.
  [switch]$Restarted
)

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
# Under GO.cmd (MCE_GO_PULLED is set) GO.cmd has pulled already. A second pull
# here could replace GO.cmd while cmd.exe waits on the line that started this
# script, and cmd.exe would read on in the new file at the old byte offset.
# So there this only checks, with a fetch, which changes no file.
try {
  if ($env:MCE_GO_PULLED) {
    $ErrorActionPreference = "Continue"
    git -C $repo fetch --quiet 2>&1 | Out-Null
    $fetched = $LASTEXITCODE -eq 0
    $behind = git -C $repo rev-list --count 'HEAD..@{u}' 2>&1
    $counted = $LASTEXITCODE -eq 0
    $ErrorActionPreference = "Stop"
    $now = git -C $repo rev-parse HEAD
    if ($fetched -and $counted -and "$behind" -eq "0") {
      Write-Host ("  repo: up to date (" + $now.Substring(0, 7) + ")") -ForegroundColor Green
    } else {
      Write-Host "  repo: could not update, carrying on with what is checked out" -ForegroundColor Yellow
    }
  } else {
    $before = git -C $repo rev-parse HEAD
    git -C $repo pull --ff-only --quiet 2>&1 | Out-Null
    $after = git -C $repo rev-parse HEAD
    if ($before -ne $after) {
      Write-Host ("  repo: updated to " + $after.Substring(0, 7)) -ForegroundColor Green
      if (-not $Restarted) {
        # PowerShell parsed THIS file before the pull replaced it, so the code now
        # running is the old version and cannot use what was just fetched. That is
        # how a fix lands on disk and still does not take effect, which looks from
        # the outside like the fix not working. Restart into the new file, once.
        Write-Host "  repo: restarting with the updated script" -ForegroundColor Cyan
        $again = @("-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Restarted")
        if ($Briefs) { $again += @("-Briefs", $Briefs) }
        if ($Source) { $again += @("-Source", $Source) }
        & powershell @again
        exit $LASTEXITCODE
      }
    } else {
      Write-Host ("  repo: up to date (" + $after.Substring(0, 7) + ")") -ForegroundColor Green
    }
  }
} catch {
  Write-Host "  repo: could not update, carrying on with what is checked out" -ForegroundColor Yellow
}

# 1. The key -------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($env:KIE_AI_API_KEY)) {
  Write-Host "KIE_AI_API_KEY is not set in this terminal." -ForegroundColor Yellow
  Write-Host "Paste your Kie key. It is not echoed or logged, and it is saved to your Windows user environment:"
  $secure = Read-Host -AsSecureString
  $env:KIE_AI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  # Persist for future terminals. Remove this line if you would rather set it
  # per-session.
  setx KIE_AI_API_KEY $env:KIE_AI_API_KEY | Out-Null
  # setx changes no running process. GO.cmd reads the saved key back for the
  # session it starts; a terminal that was already open does not have it.
  Write-Host "  saved. GO.cmd hands it to the session it starts. To start Claude Code yourself, open a new terminal first." -ForegroundColor Green
} else {
  Write-Host "  key: already set in this terminal" -ForegroundColor Green
}

# 2. The engine, as one Claude Code plugin --------------------------------
# The skills, the MCP server and the session hook install together, from
# GitHub, the way every user installs them. Not from this checkout: a plugin
# install copies its source folder, and this one holds sprint\briefs,
# sprint\refs and sprint\out, which are client material. Each command is a
# no-op when its work is already done.
$claude = Get-Command claude.exe, claude.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $claude) {
  Write-Host "  Claude Code is not installed, or not on PATH. GO.cmd installs it." -ForegroundColor Red
  exit 1
}
$plugin = "metrix-creative-engine@metrix-creative-engine"
$steps = @(
  @("plugin", "marketplace", "add", "metamktg/metrix-creative-engine"),
  @("plugin", "marketplace", "update", "metrix-creative-engine"),
  @("plugin", "install", $plugin),
  @("plugin", "update", $plugin)
)
foreach ($step in $steps) {
  # A native command's stderr is progress, not a PowerShell error.
  $ErrorActionPreference = "Continue"
  $out = & $claude.Source @step 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($code -ne 0) {
    Write-Host ("  plugin: 'claude " + ($step -join " ") + "' failed (exit " + $code + "):") -ForegroundColor Red
    $out | ForEach-Object { Write-Host ("    " + $_) }
    exit 1
  }
}
Write-Host "  plugin: $plugin installed and current" -ForegroundColor Green

# The old setup copied each skill into ~/.claude/skills. Those copies load
# beside the plugin's, so every skill would be listed twice. They are not
# moved here, because one may be someone's edited copy: this names them and
# prints the command that moves them aside.
$old = @(Get-ChildItem -Path (Join-Path $repo "skills") -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $skills $_.Name) } | ForEach-Object { $_.Name })
if ($old.Count -gt 0) {
  $backup = Join-Path $env:USERPROFILE (".claude\skills-before-plugin-" + (Get-Date -Format "yyyyMMdd"))
  Write-Host ("  skills: " + $old.Count + " standalone copies in " + $skills + " load beside the plugin's:") -ForegroundColor Yellow
  Write-Host ("          " + ($old -join ", "))
  Write-Host "          To load only the plugin's, move them aside with:"
  Write-Host ("          `$to = '" + $backup + "'; New-Item -ItemType Directory -Force `$to | Out-Null; foreach (`$n in '" + ($old -join "','") + "') { Move-Item -LiteralPath (Join-Path '" + $skills + "' `$n) -Destination `$to }")
}

# Brand kits live in the assets folder: the plugin's assets folder option when
# it is set, else METRIX_ASSETS_DIR from the environment. The MCP server and
# the session hook use the same order, so the loader and the session never
# read two different folders. load.ps1 looks there before this checkout's own
# brand-kits folder.
$ErrorActionPreference = "Continue"
$configured = (& $claude.Source plugin configure $plugin --json 2>$null) -join "`n"
$ErrorActionPreference = "Stop"
try { $assetsDir = ($configured | ConvertFrom-Json).inputs.assets_dir } catch { $assetsDir = "" }
if ($assetsDir) { $env:METRIX_ASSETS_DIR = $assetsDir }
if ($env:METRIX_ASSETS_DIR) { Write-Host "  assets: $env:METRIX_ASSETS_DIR" -ForegroundColor Green }

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
$loadArgs = @{}
if ($Briefs) { $loadArgs["Briefs"] = $Briefs }
if ($Source) { $loadArgs["Source"] = $Source }
& (Join-Path $PSScriptRoot "load.ps1") @loadArgs
Write-Host "Ready." -ForegroundColor Cyan
Write-Host ""
