# Stop DAH native stack on Windows (processes started by start-dah-windows-stack.ps1).
# Does NOT stop PostgreSQL Windows service.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra/scripts/stop-dah-windows-stack.ps1
#   npm run stop:native:win
#
# -ForcePorts also kills orphan listeners and repo-scoped node (API/worker) so
# prisma can replace query_engine-windows.dll.node without EPERM.
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [switch]$SkipMinio,
  [switch]$SkipNginx,
  [switch]$ForcePorts,
  [switch]$KillRepoNode
)

$ErrorActionPreference = "Continue"

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$DahRoot = (Resolve-Path -LiteralPath $DahRoot).Path
$LogDir = Join-Path $DahRoot "logs\native-windows"
$RunDir = Join-Path $DahRoot "logs\native-windows\run"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

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
    # Kill process tree (wrapper powershell + child node/minio/nginx)
    & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 400
  } catch {
    Write-Log "${Name}: pid $procId not running"
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ListenersOnPort([int]$Port, [string]$Label) {
  if ($Port -le 0) { return }
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } catch {
    $conns = $null
  }
  if (-not $conns) { return }
  $ids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $ids) {
    if ($procId -le 4) { continue }
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      Write-Log "${Label} port $Port still held by pid=$procId ($($p.ProcessName)) - killing"
      & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
    } catch {
      # already gone
    }
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
    # Also match nest/tsx running under this root
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
    & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
    $killed++
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
  # Prefer graceful nginx quit if we know the binary
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

if ($ForcePorts) {
  Stop-ListenersOnPort 3001 "API"
  if (-not $SkipMinio) {
    Stop-ListenersOnPort 9000 "MinIO"
    Stop-ListenersOnPort 9001 "MinIO-console"
  }
  if (-not $SkipNginx) {
    Stop-ListenersOnPort $WebPort "Web"
  }
  # Always free DLL locks when ForcePorts (update path)
  Stop-RepoNodeProcesses -Root $DahRoot
  Clear-PrismaEngineTemps -Root $DahRoot
} else {
  # Free API/worker ports if orphan (common after crash without pid cleanup)
  Stop-ListenersOnPort 3001 "API"
  if ($KillRepoNode) {
    Stop-RepoNodeProcesses -Root $DahRoot
    Clear-PrismaEngineTemps -Root $DahRoot
  }
}

Write-Log "=== stack stop finished ==="
exit 0
