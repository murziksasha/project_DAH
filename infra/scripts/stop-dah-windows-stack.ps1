# Stop DAH native stack on Windows (processes started by start-dah-windows-stack.ps1).
# Does NOT stop PostgreSQL Windows service.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra/scripts/stop-dah-windows-stack.ps1
#   npm run stop:native:win
#
# By default: force free ports + kill repo-scoped node (needed for prisma generate / EPERM).
# Soft mode (pid files only): -SoftStop
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [switch]$SkipMinio,
  [switch]$SkipNginx,
  [switch]$ForcePorts,
  [switch]$KillRepoNode,
  [switch]$SoftStop,
  [switch]$AllowPartial
)

$ErrorActionPreference = "Continue"
$script:AccessDenied = $false
$script:KillFailures = 0

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$DahRoot = (Resolve-Path -LiteralPath $DahRoot).Path
$LogDir = Join-Path $DahRoot "logs\native-windows"
$RunDir = Join-Path $DahRoot "logs\native-windows\run"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Default aggressive stop (update/generate safe). SoftStop disables force flags.
if (-not $SoftStop) {
  if (-not $PSBoundParameters.ContainsKey("ForcePorts")) { $ForcePorts = $true }
  if (-not $PSBoundParameters.ContainsKey("KillRepoNode")) { $KillRepoNode = $true }
}

function Write-Log([string]$Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] $Message"
  Add-Content -LiteralPath (Join-Path $LogDir "stack.log") -Value $line -Encoding UTF8
  Write-Host $line
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

function Invoke-TaskKill([int]$ProcId, [string]$Context) {
  if ($ProcId -le 4) { return $true }
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = & taskkill.exe /PID $ProcId /T /F 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  $text = (($out | ForEach-Object { "$_" }) -join " ").Trim()

  if ($code -eq 0 -or $text -match '(?i)not found') {
    return $true
  }

  $script:KillFailures++
  # Match EN + common localized "Access is denied" / error 5 without non-ASCII in source
  if ($text -match '(?i)Access is denied' -or $code -eq 5 -or $text -match '(?i)denied') {
    $script:AccessDenied = $true
    Write-Log "${Context}: Access denied killing pid=$ProcId (run PowerShell as Administrator)"
  } else {
    Write-Log "${Context}: taskkill pid=$ProcId failed (exit $code): $text"
  }
  return $false
}

function Test-PortListening([int]$Port) {
  if ($Port -le 0) { return @() }
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } catch {
    $conns = $null
  }
  if (-not $conns) { return @() }
  return @($conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 })
}

function Stop-PidFile([string]$Name) {
  $pidFile = Join-Path $RunDir "$Name.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Log "${Name}: no pid file"
    return
  }
  $raw = (Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $procId = 0
  if (-not $raw -or -not [int]::TryParse($raw.Trim(), [ref]$procId)) {
    Write-Log "${Name}: invalid pid file - removing"
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    return
  }
  try {
    $p = Get-Process -Id $procId -ErrorAction Stop
    Write-Log "${Name}: stopping pid=$procId ($($p.ProcessName))"
    $null = Invoke-TaskKill -ProcId $procId -Context $Name
    Start-Sleep -Milliseconds 400
  } catch {
    Write-Log "${Name}: pid $procId not running"
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ListenersOnPort([int]$Port, [string]$Label) {
  if ($Port -le 0) { return }
  $ids = Test-PortListening $Port
  foreach ($procId in $ids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      Write-Log "${Label} port $Port still held by pid=$procId ($($p.ProcessName)) - killing"
    } catch {
      Write-Log "${Label} port $Port held by pid=$procId - killing"
    }
    $null = Invoke-TaskKill -ProcId $procId -Context $Label
  }
}

function Stop-RepoNodeProcesses([string]$Root) {
  # Kill node processes that load this install (API/worker/orphans). Needed because
  # Start-Process children can survive wrapper death and keep query_engine DLL locked.
  $rootNorm = $Root.TrimEnd('\', '/')
  $rootFwd = $rootNorm.Replace('\', '/')
  $rootBack = $rootNorm.Replace('/', '\')
  $markers = @(
    ($rootBack + '\apps\api\dist\src\main.js'),
    ($rootBack + '\apps\api\dist\src\worker.js'),
    ($rootFwd + '/apps/api/dist/src/main.js'),
    ($rootFwd + '/apps/api/dist/src/worker.js'),
    ($rootBack + '\node_modules\.prisma\'),
    ($rootFwd + '/node_modules/.prisma/'),
    ($rootBack + '\apps\api\dist\'),
    ($rootFwd + '/apps/api/dist/')
  )

  $killed = 0
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  } catch {
    $procs = @()
  }
  foreach ($proc in $procs) {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }
    $hit = $false
    foreach ($m in $markers) {
      if ($cmd.IndexOf($m, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $hit = $true
        break
      }
    }
    if (-not $hit) {
      if (
        ($cmd.IndexOf($rootBack, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
         $cmd.IndexOf($rootFwd, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -and
        ($cmd -match '(?i)(nest\.js|nest start|tsx|ts-node|jest)')
      ) {
        $hit = $true
      }
    }
    if (-not $hit) { continue }
    $procId = [int]$proc.ProcessId
    if ($procId -le 4) { continue }
    Write-Log "repo-node: killing pid=$procId"
    if (Invoke-TaskKill -ProcId $procId -Context "repo-node") {
      $killed++
    }
  }
  if ($killed -gt 0) {
    Write-Log "repo-node: killed $killed process(es)"
    Start-Sleep -Milliseconds 800
  } else {
    Write-Log "repo-node: no matching node processes"
  }
}

function Clear-PrismaEngineTemps([string]$Root) {
  $prismaDir = Join-Path $Root "node_modules\.prisma\client"
  if (-not (Test-Path -LiteralPath $prismaDir)) { return }
  Get-ChildItem -LiteralPath $prismaDir -Filter "query_engine-windows.dll.node.tmp*" -ErrorAction SilentlyContinue |
    ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch { }
    }
  Get-ChildItem -LiteralPath $prismaDir -Filter "query_engine-windows.dll.node.bak_*" -ErrorAction SilentlyContinue |
    ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch { }
    }
}

if ($WebPort -le 0) {
  $envMap = Get-EnvMap (Join-Path $DahRoot ".env")
  if ($envMap["WEB_PORT"]) {
    $wp = 0
    if ([int]::TryParse($envMap["WEB_PORT"], [ref]$wp) -and $wp -gt 0) { $WebPort = $wp }
  }
  if ($WebPort -le 0) { $WebPort = 3000 }
}

Write-Log "=== DAH Windows stack stop (root=$DahRoot) ==="

# Order: app first, then minio, then nginx
Stop-PidFile "api"
Stop-PidFile "worker"
if (-not $SkipMinio) { Stop-PidFile "minio" }
if (-not $SkipNginx) {
  $nginxExe = $env:DAH_NGINX_EXE
  if (-not $nginxExe) {
    foreach ($c in @("C:\nginx\nginx.exe", "C:\tools\nginx\nginx.exe")) {
      if (Test-Path -LiteralPath $c) { $nginxExe = $c; break }
    }
  }
  if ($nginxExe -and (Test-Path -LiteralPath $nginxExe)) {
    $conf = Join-Path $DahRoot "infra\nginx\dah-windows.conf"
    $prefix = (Split-Path -Parent $nginxExe) + "\"
    try {
      & $nginxExe -s quit -c $conf -p $prefix 2>$null
      Write-Log "nginx: sent quit"
      Start-Sleep -Milliseconds 500
    } catch {
      Write-Log "nginx: quit failed (will force pid if needed)"
    }
  }
  Stop-PidFile "nginx"
}

if (-not $SoftStop) {
  # Free API port (orphans after crash without pid file)
  Stop-ListenersOnPort 3001 "API"

  if ($ForcePorts) {
    if (-not $SkipMinio) {
      Stop-ListenersOnPort 9000 "MinIO"
      Stop-ListenersOnPort 9001 "MinIO-console"
    }
    if (-not $SkipNginx) {
      Stop-ListenersOnPort $WebPort "Web"
    }
  }

  if ($KillRepoNode -or $ForcePorts) {
    Stop-RepoNodeProcesses -Root $DahRoot
    Clear-PrismaEngineTemps -Root $DahRoot
    # Second pass if first kill failed on elevated children
    Start-Sleep -Milliseconds 500
    Stop-ListenersOnPort 3001 "API"
    Stop-RepoNodeProcesses -Root $DahRoot
  }

  Start-Sleep -Milliseconds 600
  $apiHolders = Test-PortListening 3001
  if ($apiHolders.Count -gt 0) {
    $ids = ($apiHolders -join ", ")
    Write-Log "ERROR: API port 3001 still LISTENING (pid=$ids) - prisma generate will EPERM"
    if ($script:AccessDenied) {
      Write-Log "HINT: process runs elevated. Open PowerShell as Administrator:"
      Write-Log "  cd $DahRoot"
      Write-Log "  npm run stop:native:win"
      Write-Log "  taskkill /PID $ids /T /F"
    } else {
      Write-Log "HINT: taskkill /PID $ids /T /F   (or taskkill /IM node.exe /F if safe)"
    }
    if (-not $AllowPartial) {
      Write-Log "=== stack stop FAILED (API still running) ==="
      exit 1
    }
    Write-Log "=== stack stop finished with warnings (-AllowPartial) ==="
    exit 0
  }

  if ($script:AccessDenied -or $script:KillFailures -gt 0) {
    Write-Log "WARN: some kills failed, but API port 3001 is free"
  }
}

Write-Log "=== stack stop finished ==="
exit 0
