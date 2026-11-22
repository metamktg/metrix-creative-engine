@echo off
setlocal enabledelayedexpansion
REM ===================================================================
REM  Metrix Creative Engine - the whole thing, one file.
REM
REM  DOUBLE-CLICK THIS FILE. Nothing to type, no folder to be in.
REM
REM  A .cmd runs identically from Explorer, Command Prompt and PowerShell,
REM  which is why this exists: every failure on 2026-09-16 was a shell or a
REM  working directory, not the work. Specifically -
REM    * a new terminal opens in the user profile, so "git pull" and
REM      "sprint\setup.ps1" both fail and neither error says why
REM    * PowerShell's execution policy blocks npm.ps1 and claude.ps1, so
REM      every npm and claude call dies with a security error
REM    * $HOME does not expand in cmd.exe, so a path built from it silently
REM      points somewhere else
REM  This file is immune to all three by construction.
REM ===================================================================

cd /d "%~dp0"

echo.
echo   Metrix Creative Engine
echo.

REM --- Prerequisites, by name, before anything depends on them ----------
where git >nul 2>&1 || (
  echo   git is not installed.  https://git-scm.com/download/win
  echo   Install it, then double-click this file again.
  pause & exit /b 1
)
where node >nul 2>&1 || (
  echo   Node is not installed.  https://nodejs.org
  echo   Install it, then double-click this file again.
  pause & exit /b 1
)

REM --- Claude Code first: the setup installs the engine through it ------
REM claude.exe is the native install and claude.cmd the npm one. Either
REM works. Never the claude.ps1 that the execution policy blocks.
set "CLAUDE="
for %%C in (claude.exe claude.cmd) do if not defined CLAUDE for /f "delims=" %%P in ('where %%C 2^>nul') do if not defined CLAUDE set "CLAUDE=%%P"
if not defined CLAUDE (
  echo.
  echo   Installing Claude Code, one moment...
  REM npm.cmd, not npm: the .ps1 wrapper is what the execution policy refuses.
  call npm.cmd install -g @anthropic-ai/claude-code || (
    echo   Install failed. Run this and send me what it says:
    echo       npm.cmd install -g @anthropic-ai/claude-code
    pause & exit /b 1
  )
  for /f "delims=" %%P in ('where claude.cmd 2^>nul') do if not defined CLAUDE set "CLAUDE=%%P"
)
if not defined CLAUDE (
  echo   Claude Code is installed but this window cannot see it yet.
  echo   Close this window and double-click GO.cmd again.
  pause & exit /b 1
)

REM --- Update, then set up: the engine installs as a Claude Code plugin --
git pull --ff-only --quiet 2>nul
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0sprint\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo   Setup did not finish. Nothing was started.
  pause & exit /b 1
)

REM --- Start the session ------------------------------------------------
REM Downloads land in sprint\out, the folder GO.txt names, for the plugin's
REM MCP server as well as the script. The settings file stops this
REM checkout's own .mcp.json server, which the plugin already brings, so the
REM session neither asks about it nor runs it twice. Both last for this
REM session only; nothing is saved.
set "KIE_AI_DOWNLOAD_DIR=%~dp0sprint\out"
echo.
echo   Starting Claude Code. When it is ready, paste this one line:
echo.
echo       Read sprint/GO.txt and do exactly what it says.
echo.
call "%CLAUDE%" --settings "%~dp0sprint\session-settings.json"
