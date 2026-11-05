param([string]$Project)
$ErrorActionPreference = 'Stop'
$editorRoot = Split-Path -Parent $PSScriptRoot
$editorExe = Join-Path $editorRoot '.tools\kdenlive-26.08.2\kdenlive-26.08.2_standalone\bin\kdenlive.exe'
if (-not (Test-Path -LiteralPath $editorExe -PathType Leaf)) { throw 'Portable Kdenlive 26.08.2 is not installed in this repo.' }
if ($Project) {
    $projectPath = (Resolve-Path -LiteralPath $Project).Path
    & $editorExe $projectPath
} else {
    & $editorExe
}
