# Post-update / post-start smoke checks for Windows native host.
# Usage: npm run smoke:native:win
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [int]$TimeoutSec = 15
)

$ErrorActionPreference = "Continue"
$failed = 0

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-EnvMap([string]$EnvPath) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $EnvPath)) { return $map }
  Get-Content -LiteralPath $EnvPath -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object {
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
    $map[$name] = $val
  }
  return $map
}

function Test-PortOpen([string]$HostName, [int]$Port) {
  try {
    $c = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    return [bool]$c.TcpTestSucceeded
  } catch {
    return $false
  }
}

$envMap = Get-EnvMap (Join-Path $DahRoot ".env")
if ($WebPort -le 0) {
  if ($envMap["WEB_PORT"]) {
    $wp = 0
    if ([int]::TryParse($envMap["WEB_PORT"], [ref]$wp) -and $wp -gt 0) { $WebPort = $wp }
  }
  if ($WebPort -le 0) { $WebPort = 3000 }
}

Write-Host "DAH native smoke"
Write-Host "  root=$DahRoot webPort=$WebPort"
Write-Host ""

function Assert-Port([string]$Label, [int]$Port, [switch]$Required) {
  $ok = Test-PortOpen "127.0.0.1" $Port
  if ($ok) {
    Write-Host "  OK   $Label :$Port"
  } else {
    if ($Required) {
      Write-Host "  FAIL $Label :$Port"
      $script:failed++
    } else {
      Write-Host "  WARN $Label :$Port (optional)"
    }
  }
}

Assert-Port "PostgreSQL" 5432 -Required
Assert-Port "API" 3001 -Required
Assert-Port "MinIO" 9000
Assert-Port "Web" $WebPort

Write-Host ""
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -TimeoutSec $TimeoutSec
  if ($h.status -eq "ok" -or $h.status -eq "degraded") {
    Write-Host "  OK   GET /api/health -> $($h.status)"
  } else {
    Write-Host "  FAIL GET /api/health -> $($h.status)"
    $failed++
  }
} catch {
  Write-Host "  FAIL GET /api/health: $($_.Exception.Message)"
  $failed++
}

try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec $TimeoutSec
  if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) {
    Write-Host "  OK   GET / (web) -> HTTP $($r.StatusCode)"
  } else {
    Write-Host "  FAIL GET / (web) -> HTTP $($r.StatusCode)"
    $failed++
  }
} catch {
  Write-Host "  WARN GET / (web): $($_.Exception.Message) (API-only host is OK)"
}

try {
  $apiViaProxy = Invoke-RestMethod -Uri "http://127.0.0.1:$WebPort/api/health" -TimeoutSec $TimeoutSec
  if ($apiViaProxy.status -eq "ok" -or $apiViaProxy.status -eq "degraded") {
    Write-Host "  OK   GET :$WebPort/api/health (nginx proxy)"
  } else {
    Write-Host "  WARN proxy health status=$($apiViaProxy.status)"
  }
} catch {
  Write-Host "  WARN GET :$WebPort/api/health (no nginx proxy?): $($_.Exception.Message)"
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "SMOKE FAILED ($failed required checks)"
  exit 1
}
Write-Host "SMOKE OK"
exit 0
