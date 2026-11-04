$siteDir = Split-Path -Parent $PSScriptRoot
$nodeBin = Join-Path $siteDir '.local/node-v22.23.4-win-x64'
$nodeExe = Join-Path $nodeBin 'node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { throw "Isolated Node runtime missing: $nodeExe" }
$env:PATH = "$nodeBin;$env:PATH"
