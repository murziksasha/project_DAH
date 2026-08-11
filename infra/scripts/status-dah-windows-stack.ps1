# Status of DAH native Windows stack (ports, pids, health, backup marker, task).
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra/scripts/status-dah-windows-stack.ps1
#   npm run status:native:win
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0
)

$ErrorActionPreference = "Continue"

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$LogDir = Join-Path $DahRoot "logs\native-windows"
$RunDir = Join-Path $DahRoot "logs\native-windows\run"
$TaskName = "DAH-Native-Stack"

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

function Get-PidInfo([string]$Name) {
  $pidFile = Join-Path $RunDir "$Name.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return @{ name = $Name; pidFile = $false; alive = $false; pid = $null; process = $null }
  }
  $raw = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $procId = 0
  if (-not $raw -or -not [int]::TryParse($raw.Trim(), [ref]$procId)) {
    return @{ name = $Name; pidFile = $true; alive = $false; pid = $null; process = "invalid" }
  }
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    return @{ name = $Name; pidFile = $true; alive = $true; pid = $procId; process = $p.ProcessName }
  } catch {
    return @{ name = $Name; pidFile = $true; alive = $false; pid = $procId; process = "dead" }
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

Write-Host "DAH native Windows status"
Write-Host "  root: $DahRoot"
Write-Host ""

Write-Host "Ports (127.0.0.1):"
foreach ($item in @(
    @{ n = "PostgreSQL"; p = 5432 },
    @{ n = "MinIO"; p = 9000 },
    @{ n = "API"; p = 3001 },
    @{ n = "Web/nginx"; p = $WebPort }
  )) {
  $ok = Test-PortOpen "127.0.0.1" $item.p
  $mark = if ($ok) { "UP  " } else { "DOWN" }
  Write-Host ("  [{0}] {1,-12} :{2}" -f $mark, $item.n, $item.p)
}

Write-Host ""
Write-Host "PID files ($RunDir):"
foreach ($n in @("api", "worker", "minio", "nginx")) {
  $info = Get-PidInfo $n
  if (-not $info.pidFile) {
    Write-Host ("  {0,-8} (no pid file)" -f $n)
  } elseif ($info.alive) {
    Write-Host ("  {0,-8} pid={1} ({2}) ALIVE" -f $n, $info.pid, $info.process)
  } else {
    Write-Host ("  {0,-8} pid={1} STALE ({2})" -f $n, $info.pid, $info.process)
  }
}

Write-Host ""
Write-Host "API health:"
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -TimeoutSec 5
  Write-Host ("  status={0} service={1} ts={2}" -f $h.status, $h.service, $h.timestamp)
} catch {
  Write-Host "  FAIL: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Web:"
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec 5
  Write-Host ("  http://127.0.0.1:{0}/ -> HTTP {1}" -f $WebPort, $r.StatusCode)
} catch {
  Write-Host ("  http://127.0.0.1:{0}/ FAIL: {1}" -f $WebPort, $_.Exception.Message)
}

Write-Host ""
Write-Host "Backup marker:"
$markerCandidates = @(
  (Join-Path $DahRoot "backups\last-backup.json")
)
if ($envMap["BACKUP_STATUS_PATH"]) {
  $bp = $envMap["BACKUP_STATUS_PATH"]
  if (-not [System.IO.Path]::IsPathRooted($bp)) {
    $bp = Join-Path $DahRoot $bp
  }
  $markerCandidates = @($bp) + $markerCandidates
}
$foundMarker = $false
foreach ($m in $markerCandidates) {
  if (Test-Path -LiteralPath $m) {
    $foundMarker = $true
    try {
      $j = Get-Content -LiteralPath $m -Raw -Encoding UTF8 | ConvertFrom-Json
      $age = $null
      if ($j.finishedAt) {
        try {
          $fin = [DateTime]::Parse($j.finishedAt).ToUniversalTime()
          $age = [math]::Round(((Get-Date).ToUniversalTime() - $fin).TotalHours, 1)
        } catch { }
      }
      Write-Host "  $m"
      if ($j.finishedAt) { Write-Host "  finishedAt=$($j.finishedAt) ageHours=$age" }
      if ($j.timestamp) { Write-Host "  timestamp=$($j.timestamp)" }
      if ($j.runDir) { Write-Host "  runDir=$($j.runDir)" }
    } catch {
      Write-Host "  $m (unreadable)"
    }
    break
  }
}
if (-not $foundMarker) {
  Write-Host "  (none found - run backup.ps1 or wait for worker weekly)"
}

Write-Host ""
Write-Host "Scheduled task:"
try {
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $ti = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
  Write-Host ("  {0}: State={1}" -f $TaskName, $t.State)
  if ($ti) {
    Write-Host ("  LastResult={0} LastRun={1} NextRun={2}" -f $ti.LastTaskResult, $ti.LastRunTime, $ti.NextRunTime)
  }
} catch {
  Write-Host "  $TaskName not registered (run npm run install:native:win once)"
}

Write-Host ""
Write-Host "Logs: $LogDir"
exit 0
