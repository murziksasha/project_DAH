# Start DAH native stack on Windows (no Docker, no systemd).
# Invoked at startup/logon by Scheduled Task "DAH-Native-Stack", or manually:
#   powershell -ExecutionPolicy Bypass -File infra/scripts/start-dah-windows-stack.ps1
param(
  [string]$DahRoot = "",
  [int]$PostgresWaitSec = 120,
  [int]$WebPort = 3000,
  [string]$NginxExe = "",
  [string]$MinioExe = "",
  [string]$MinioDataDir = "",
  [switch]$SkipMinio,
  [switch]$SkipNginx,
  [switch]$SkipWorker
)

$ErrorActionPreference = "Stop"

if (-not $DahRoot) {
  $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$LogDir = Join-Path $DahRoot "logs\native-windows"
$RunDir = Join-Path $DahRoot "logs\native-windows\run"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

function Write-Log([string]$Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] $Message"
  Add-Content -LiteralPath (Join-Path $LogDir "stack.log") -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-PortOpen([string]$HostName, [int]$Port) {
  try {
    $c = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    return [bool]$c.TcpTestSucceeded
  } catch {
    return $false
  }
}

function Get-EnvMap([string]$EnvPath) {
  $map = @{}
  Get-Content -LiteralPath $EnvPath -Encoding UTF8 | ForEach-Object {
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

function Test-PidAlive([string]$PidFile) {
  if (-not (Test-Path -LiteralPath $PidFile)) { return $false }
  $raw = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $raw) { return $false }
  $procId = 0
  if (-not [int]::TryParse($raw.Trim(), [ref]$procId)) { return $false }
  try {
    $null = Get-Process -Id $procId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Start-DetachedPowerShell {
  param(
    [string]$Name,
    [string]$CommandText
  )
  $pidFile = Join-Path $RunDir "$Name.pid"
  if (Test-PidAlive $pidFile) {
    Write-Log "$Name already running (pid file)"
    return
  }

  $outLog = Join-Path $LogDir "$Name.out.log"
  $errLog = Join-Path $LogDir "$Name.err.log"
  $launcher = Join-Path $RunDir "launch-$Name.ps1"
  # Launcher keeps process tree alive and appends a started marker
  $launcherBody = @"
`$ErrorActionPreference = 'Continue'
`$logOut = '$($outLog.Replace("'", "''"))'
`$logErr = '$($errLog.Replace("'", "''"))'
try {
  $CommandText
} catch {
  Add-Content -LiteralPath `$logErr -Value `$_.Exception.Message -Encoding UTF8
  exit 1
}
"@
  Set-Content -LiteralPath $launcher -Value $launcherBody -Encoding UTF8

  $p = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $launcher
    ) `
    -WorkingDirectory $DahRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $p.Id -Encoding ascii
  Write-Log "Started $Name wrapper pid=$($p.Id) (logs: $Name.*.log)"
}

# --- main ---
Write-Log "=== DAH Windows stack start (root=$DahRoot) ==="

$envPath = Join-Path $DahRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Log "ERROR: missing $envPath"
  exit 1
}
$envMap = Get-EnvMap $envPath

$node = $null
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $node = $nodeCmd.Source }
if (-not $node) {
  foreach ($c in @(
      "$env:ProgramFiles\nodejs\node.exe",
      "${env:ProgramFiles(x86)}\nodejs\node.exe",
      "$env:LOCALAPPDATA\Programs\node\node.exe"
    )) {
    if (Test-Path -LiteralPath $c) { $node = $c; break }
  }
}
if (-not $node) {
  Write-Log "ERROR: node.exe not found in PATH"
  exit 1
}

$apiMain = Join-Path $DahRoot "apps\api\dist\src\main.js"
$workerMain = Join-Path $DahRoot "apps\api\dist\src\worker.js"
$runWithEnv = Join-Path $PSScriptRoot "run-with-env.ps1"

if (-not (Test-Path -LiteralPath $apiMain)) {
  Write-Log "ERROR: API not built ($apiMain). Run: npm run build"
  exit 1
}

# Wait for PostgreSQL
Write-Log "Waiting for PostgreSQL on 127.0.0.1:5432 (up to ${PostgresWaitSec}s)..."
$deadline = (Get-Date).AddSeconds($PostgresWaitSec)
$pgOk = $false
while ((Get-Date) -lt $deadline) {
  if (Test-PortOpen "127.0.0.1" 5432) { $pgOk = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $pgOk) {
  Write-Log "ERROR: PostgreSQL not reachable on 127.0.0.1:5432."
  exit 1
}
Write-Log "PostgreSQL port open"

# MinIO
if (-not $SkipMinio) {
  if (-not $MinioDataDir) {
    $MinioDataDir = Join-Path $DahRoot "minio-data"
  }
  New-Item -ItemType Directory -Force -Path $MinioDataDir | Out-Null

  if (-not $MinioExe) {
    $candidates = @(
      (Join-Path $DahRoot "tools\minio.exe")
    )
    $mc = Get-Command minio.exe -ErrorAction SilentlyContinue
    if ($mc) { $candidates += $mc.Source }
    foreach ($c in $candidates) {
      if ($c -and (Test-Path -LiteralPath $c)) { $MinioExe = $c; break }
    }
  }

  if (Test-PortOpen "127.0.0.1" 9000) {
    Write-Log "MinIO already listening on :9000"
  } elseif (-not $MinioExe -or -not (Test-Path -LiteralPath $MinioExe)) {
    Write-Log "WARNING: minio.exe not found — skip. Put tools\minio.exe or re-run install with -DownloadMinio"
  } else {
    $access = $envMap["S3_ACCESS_KEY"]
    if (-not $access) { $access = $envMap["MINIO_ROOT_USER"] }
    if (-not $access) { $access = "dah_minio" }
    $secret = $envMap["S3_SECRET_KEY"]
    if (-not $secret) { $secret = $envMap["MINIO_ROOT_PASSWORD"] }
    if (-not $secret) { $secret = "dah_minio_secret_change_me" }

    $minioExeEsc = $MinioExe.Replace("'", "''")
    $dataEsc = $MinioDataDir.Replace("'", "''")
    $accessEsc = $access.Replace("'", "''")
    $secretEsc = $secret.Replace("'", "''")
    $cmd = @"
`$env:MINIO_ROOT_USER = '$accessEsc'
`$env:MINIO_ROOT_PASSWORD = '$secretEsc'
& '$minioExeEsc' server '$dataEsc' --address ':9000' --console-address ':9001'
"@
    Start-DetachedPowerShell -Name "minio" -CommandText $cmd

    $mDeadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $mDeadline) {
      if (Test-PortOpen "127.0.0.1" 9000) { break }
      Start-Sleep -Seconds 1
    }
    if (Test-PortOpen "127.0.0.1" 9000) { Write-Log "MinIO is up on :9000" }
    else { Write-Log "WARNING: MinIO :9000 not open — see logs\minio.err.log" }
  }
}

# API (load .env via run-with-env.ps1)
if (Test-PortOpen "127.0.0.1" 3001) {
  Write-Log "API already listening on :3001"
} else {
  $runEsc = $runWithEnv.Replace("'", "''")
  $rootEsc = $DahRoot.Replace("'", "''")
  $nodeEsc = $node.Replace("'", "''")
  $apiEsc = $apiMain.Replace("'", "''")
  $cmd = @"
& '$runEsc' -DahRoot '$rootEsc' -- '$nodeEsc' '$apiEsc'
"@
  Start-DetachedPowerShell -Name "api" -CommandText $cmd

  $aDeadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $aDeadline) {
    if (Test-PortOpen "127.0.0.1" 3001) { break }
    Start-Sleep -Seconds 1
  }
  if (Test-PortOpen "127.0.0.1" 3001) { Write-Log "API is up on :3001" }
  else { Write-Log "WARNING: API :3001 not open — see logs\api.err.log" }
}

# Worker
if (-not $SkipWorker) {
  if (-not (Test-Path -LiteralPath $workerMain)) {
    Write-Log "WARNING: worker missing ($workerMain)"
  } else {
    $wPid = Join-Path $RunDir "worker.pid"
    if (Test-PidAlive $wPid) {
      Write-Log "Worker already running"
    } else {
      $runEsc = $runWithEnv.Replace("'", "''")
      $rootEsc = $DahRoot.Replace("'", "''")
      $nodeEsc = $node.Replace("'", "''")
      $wEsc = $workerMain.Replace("'", "''")
      $cmd = @"
& '$runEsc' -DahRoot '$rootEsc' -- '$nodeEsc' '$wEsc'
"@
      Start-DetachedPowerShell -Name "worker" -CommandText $cmd
    }
  }
}

# Nginx
if (-not $SkipNginx) {
  if (-not $NginxExe) { $NginxExe = $env:DAH_NGINX_EXE }
  if (-not $NginxExe) {
    foreach ($c in @("C:\nginx\nginx.exe", "C:\tools\nginx\nginx.exe")) {
      if (Test-Path -LiteralPath $c) { $NginxExe = $c; break }
    }
  }
  $conf = Join-Path $DahRoot "infra\nginx\dah-windows.conf"
  if ($NginxExe -and (Test-Path -LiteralPath $NginxExe) -and (Test-Path -LiteralPath $conf)) {
    if (Test-PortOpen "127.0.0.1" $WebPort) {
      Write-Log "Port $WebPort already in use — skip nginx"
    } else {
      $nginxDir = Split-Path -Parent $NginxExe
      $ngxEsc = $NginxExe.Replace("'", "''")
      $confEsc = $conf.Replace("'", "''")
      $prefixEsc = ($nginxDir + "\").Replace("'", "''")
      $cmd = @"
Set-Location '$($nginxDir.Replace("'", "''"))'
& '$ngxEsc' -c '$confEsc' -p '$prefixEsc'
"@
      Start-DetachedPowerShell -Name "nginx" -CommandText $cmd
      Write-Log "nginx start requested"
    }
  } else {
    Write-Log "nginx skipped (install C:\nginx or -NginxExe; conf: infra\nginx\dah-windows.conf)"
  }
}

Write-Log "=== stack start finished ==="
Write-Log "Health: http://127.0.0.1:3001/api/health"
Write-Log "Web:    http://127.0.0.1:$WebPort/"
