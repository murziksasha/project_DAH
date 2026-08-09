# Load repo-root .env into process env, then run a command.
# Usage (PowerShell 5.1 — do NOT pass bare "--"; it is parsed as a parameter name and fails with
# "Parameter name '' is ambiguous"):
#   powershell -File infra/scripts/run-with-env.ps1 -DahRoot C:\miy_dim node apps\api\dist\src\main.js
#   & .\infra\scripts\run-with-env.ps1 -DahRoot C:\miy_dim node apps\api\dist\src\main.js
param(
  [string]$DahRoot = "",
  [string]$EnvFile = "",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Command
)

$ErrorActionPreference = "Stop"

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not $EnvFile) {
  $EnvFile = Join-Path $DahRoot ".env"
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Write-Error "run-with-env: missing env file: $EnvFile"
}
if (-not $Command -or $Command.Count -eq 0) {
  Write-Error "run-with-env: pass a command after named args, e.g. ... node apps\api\dist\src\main.js"
}

# Strip a leading "--" if it already arrived in remaining args (rare / other shells)
if ($Command.Count -gt 0 -and $Command[0] -eq "--") {
  if ($Command.Count -lt 2) {
    Write-Error "run-with-env: empty command after --"
  }
  $Command = $Command[1..($Command.Count - 1)]
}
if (-not $Command -or $Command.Count -eq 0) {
  Write-Error "run-with-env: empty command"
}

Get-Content -LiteralPath $EnvFile -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $val = $line.Substring($eq + 1).Trim()
  if (
    ($val.StartsWith('"') -and $val.EndsWith('"')) -or
    ($val.StartsWith("'") -and $val.EndsWith("'"))
  ) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  [System.Environment]::SetEnvironmentVariable($name, $val, "Process")
}

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "production"
}

Set-Location -LiteralPath $DahRoot
$exe = $Command[0]
$argList = @()
if ($Command.Count -gt 1) {
  $argList = $Command[1..($Command.Count - 1)]
}

# Prefer call operator so npm.cmd / node work
& $exe @argList
exit $LASTEXITCODE
