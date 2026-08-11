# Restart DAH native Windows stack: stop then start.
# Usage: npm run restart:native:win
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0
)

$ErrorActionPreference = "Stop"

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$stopPs1 = Join-Path $PSScriptRoot "stop-dah-windows-stack.ps1"
$startPs1 = Join-Path $PSScriptRoot "start-dah-windows-stack.ps1"

$stopArgs = @{ DahRoot = $DahRoot }
$startArgs = @{ DahRoot = $DahRoot }
if ($WebPort -gt 0) {
  $stopArgs.WebPort = $WebPort
  $startArgs.WebPort = $WebPort
}

& $stopPs1 @stopArgs
Start-Sleep -Seconds 2
& $startPs1 @startArgs
exit $LASTEXITCODE
