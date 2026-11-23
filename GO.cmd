@echo off
setlocal DisableDelayedExpansion
set "MCE_GO_TOP=1"
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
REM
REM  It updates itself too. cmd.exe reads a batch file a line at a time
REM  from a byte offset, so if a pull replaces this file mid-run, it reads
REM  on in the new file at the old offset. So the pull shares one line
REM  with a jump to the new file's top, which never returns. The GO.cmd
REM  main shipped first resumes at byte 1558, the next line. It jumps to
REM  the top too, and does nothing in a run that began here (MCE_GO_TOP
REM  is set). check-plugin guards the offset and the one-line form.
REM  Padding: holds the next line at byte 1558. --
REM ===================================================================
if not defined MCE_GO_TOP setlocal DisableDelayedExpansion & set "MCE_GO_PULLED=1" & "%~f0" %*

cd /d "%~dp0"

REM --- Update first, so everything below is the newest version ---------
REM Why the pull and the jump share a line: see the header. A failed pull
REM (offline, local edits) never stops the run: the checked-out version
REM still works, and setup says it could not update.
where git >nul 2>&1 || (
  echo.
  echo   git is not installed.  https://git-scm.com/download/win
  echo   Install it, then double-click this file again.
  pause & exit /b 1
)
if not defined MCE_GO_PULLED set "MCE_GO_PULLED=1" & git pull --ff-only --quiet 2>nul & "%~f0" %*

echo.
echo   Metrix Creative Engine
echo.

REM --- Prerequisites, by name, before anything depends on them ----------
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

REM --- Set up: the engine installs as a Claude Code plugin ---------------
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0sprint\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo   Setup did not finish. Nothing was started.
  pause & exit /b 1
)

REM --- The key ------------------------------------------------------------
REM When setup asked for the key it saved it with setx, which changes no
REM running process, this window included. Read it back from where setx
REM put it, so the session below has it on the first run, not the second.
REM findstr, not find: Git's Unix find can come first on PATH.
if not defined KIE_AI_API_KEY for /f "tokens=2,*" %%A in ('reg query HKCU\Environment /v KIE_AI_API_KEY 2^>nul ^| findstr /c:"REG_"') do set "KIE_AI_API_KEY=%%B"

REM --- Start the session ------------------------------------------------
REM Downloads land in sprint\out, unless the plugin's runs folder option
REM names another folder. Either way the session start names the folder,
REM and GO.txt sends everything there. The settings file stops this
REM checkout's own .mcp.json server, which the plugin already brings, so the
REM session neither asks about it nor runs it twice. Both last for this
REM session only; nothing is saved. call expands percent signs twice, so
REM its line leaves both paths to call's own expansion (the doubled percent
REM signs): a percent sign or a caret in a folder name survives.
set "KIE_AI_DOWNLOAD_DIR=%~dp0sprint\out"
set "MCE_SETTINGS=%~dp0sprint\session-settings.json"
echo.
echo   Starting Claude Code. When it is ready, paste this one line:
echo.
echo       Read sprint/GO.txt and do exactly what it says.
echo.
call "%%CLAUDE%%" --settings "%%MCE_SETTINGS%%"
