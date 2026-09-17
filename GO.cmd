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

REM --- Update, then set up ----------------------------------------------
git pull --ff-only --quiet 2>nul
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0sprint\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo   Setup did not finish. Nothing was started.
  pause & exit /b 1
)

REM --- Claude Code: .cmd every time, never the .ps1 the policy blocks ---
where claude.cmd >nul 2>&1 || (
  echo.
  echo   Installing Claude Code, one moment...
  REM npm.cmd, not npm: the .ps1 wrapper is what the execution policy refuses.
  call npm.cmd install -g @anthropic-ai/claude-code || (
    echo   Install failed. Run this and send me what it says:
    echo       npm.cmd install -g @anthropic-ai/claude-code
    pause & exit /b 1
  )
)

echo.
echo   Starting Claude Code. When it is ready, paste this one line:
echo.
echo       Read sprint/GO.txt and do exactly what it says.
echo.
call claude.cmd
