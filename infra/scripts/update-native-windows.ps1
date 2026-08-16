# One-shot update on Windows native host (no Docker, no systemd):
#   stop stack -> install -> prisma generate -> build -> migrate -> start stack
#
# Does NOT run git pull — update the tree yourself first (git pull / copy / rsync),
# then: npm run update:native:win
#
# Stack is stopped BEFORE generate/build so Windows can replace
# node_modules\.prisma\client\query_engine-windows.dll.node (avoids EPERM rename).
#
# Usage (from repo root):
#   npm run update:native:win
#   powershell -ExecutionPolicy Bypass -File infra/scripts/update-native-windows.ps1
#
# Env / switches (any of these skip a step):
#   -SkipInstall / SKIP_INSTALL=1
#   -SkipGenerate / SKIP_GENERATE=1
#   -SkipBuild / SKIP_BUILD=1
#   -SkipMigrate / SKIP_MIGRATE=1
#   -SkipRestart / SKIP_RESTART=1   # skip both early stop and final start
#   -SkipPreBackup / SKIP_PRE_BACKUP=1
#   -SkipStop / SKIP_STOP=1         # do not stop before generate (risk EPERM)
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [switch]$SkipInstall,
  [switch]$SkipGenerate,
  [switch]$SkipBuild,
  [switch]$SkipMigrate,
  [switch]$SkipRestart,
  [switch]$SkipPreBackup,
  [switch]$SkipStop
)

$ErrorActionPreference = "Stop"

function EnvFlag([string]$Name) {
  $v = [System.Environment]::GetEnvironmentVariable($Name)
  if (-not $v) { return $false }
  return ($v -eq "1" -or $v -eq "true" -or $v -eq "TRUE" -or $v -eq "yes")
}

if (EnvFlag "SKIP_INSTALL") { $SkipInstall = $true }
if (EnvFlag "SKIP_GENERATE") { $SkipGenerate = $true }
if (EnvFlag "SKIP_BUILD") { $SkipBuild = $true }
if (EnvFlag "SKIP_MIGRATE") { $SkipMigrate = $true }
if (EnvFlag "SKIP_RESTART") { $SkipRestart = $true }
if (EnvFlag "SKIP_PRE_BACKUP") { $SkipPreBackup = $true }
if (EnvFlag "SKIP_STOP") { $SkipStop = $true }

$stopPs1 = Join-Path $PSScriptRoot "stop-dah-windows-stack.ps1"
$startPs1 = Join-Path $PSScriptRoot "start-dah-windows-stack.ps1"

function Invoke-StopStack {
  param([string]$Root, [int]$Port)
  if (-not (Test-Path -LiteralPath $stopPs1)) {
    Write-Host "    WARN: missing stop script $stopPs1"
    return
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopPs1 `
    -DahRoot $Root -WebPort $Port -ForcePorts
  Start-Sleep -Seconds 2
  # Drop stale Prisma engine temp files left after failed generate
  $prismaDir = Join-Path $Root "node_modules\.prisma\client"
  if (Test-Path -LiteralPath $prismaDir) {
    Get-ChildItem -LiteralPath $prismaDir -Filter "query_engine-windows.dll.node.tmp*" -ErrorAction SilentlyContinue |
      ForEach-Object {
        try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch { }
      }
  }
}

if (-not $DahRoot) {
  if ($env:DAH_ROOT) { $DahRoot = $env:DAH_ROOT }
  else { $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
}
$DahRoot = (Resolve-Path -LiteralPath $DahRoot).Path
Set-Location -LiteralPath $DahRoot

function Write-Step([string]$Message) {
  Write-Host "==> $Message"
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
  if (-not (Test-Path -LiteralPath $EnvPath)) { return $map }
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

function Find-PgDump {
  $cmd = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $roots = @(
    "${env:ProgramFiles}\PostgreSQL",
    "${env:ProgramFiles(x86)}\PostgreSQL"
  )
  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $found = Get-ChildItem -Path $root -Filter "pg_dump.exe" -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

function Invoke-PreUpdateDump {
  param([hashtable]$EnvMap, [string]$Root)
  $pgDump = Find-PgDump
  if (-not $pgDump) {
    Write-Host "    WARN: pg_dump not found - skip pre-update DB dump (install PostgreSQL client tools)"
    return
  }
  if (-not (Test-PortOpen "127.0.0.1" 5432)) {
    Write-Host "    WARN: Postgres :5432 down - skip pre-update dump"
    return
  }

  $user = $EnvMap["POSTGRES_USER"]
  $db = $EnvMap["POSTGRES_DB"]
  $pass = $EnvMap["POSTGRES_PASSWORD"]
  # Note: $Host is a read-only automatic variable in PowerShell — never use it as a name
  $pgHost = "127.0.0.1"
  $port = "5432"

  $url = $EnvMap["DATABASE_URL"]
  if ($url -and $url -match '^postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+):?(\d+)?/([^?]+)') {
    if (-not $user) { $user = $Matches[1] }
    if (-not $pass) { $pass = [Uri]::UnescapeDataString($Matches[2]) }
    $pgHost = $Matches[3]
    if ($Matches[4]) { $port = $Matches[4] }
    if (-not $db) { $db = $Matches[5] }
  }
  if (-not $user) { $user = "dah" }
  if (-not $db) { $db = "dah" }

  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $outDir = Join-Path $Root "backups\pre-update\$ts"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $sqlPath = Join-Path $outDir "database.sql"
  $gzPath = Join-Path $outDir "database.sql.gz"

  Write-Host "    pg_dump -> $sqlPath"
  $prevPass = $env:PGPASSWORD
  try {
    if ($pass) { $env:PGPASSWORD = $pass }
    & $pgDump -h $pgHost -p $port -U $user -d $db -F p -f $sqlPath
    if ($LASTEXITCODE -ne 0) {
      Write-Host "    WARN: pg_dump exit $LASTEXITCODE - continue update"
      return
    }
    # Compress if .NET gzip available
    try {
      $in = [System.IO.File]::OpenRead($sqlPath)
      $out = [System.IO.File]::Create($gzPath)
      $gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionMode]::Compress)
      $in.CopyTo($gz)
      $gz.Close(); $out.Close(); $in.Close()
      Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
      Write-Host "    pre-update dump: $gzPath"
    } catch {
      Write-Host "    pre-update dump (uncompressed): $sqlPath"
    }
  } finally {
    if ($null -ne $prevPass) { $env:PGPASSWORD = $prevPass }
    else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  }
}

Write-Step "DAH native Windows update in $DahRoot"

$envPath = Join-Path $DahRoot ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing $envPath - copy .env.example and set 127.0.0.1 URLs"
}
$envMap = Get-EnvMap $envPath

if ($WebPort -le 0) {
  if ($envMap["WEB_PORT"]) {
    $wp = 0
    if ([int]::TryParse($envMap["WEB_PORT"], [ref]$wp) -and $wp -gt 0) { $WebPort = $wp }
  }
  if ($WebPort -le 0) { $WebPort = 3000 }
}

# Preflight
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw "Node.js not found (need >= 20)" }
$nodeVer = & node -v
Write-Host "    Node $nodeVer"
if (-not (Test-PortOpen "127.0.0.1" 5432)) {
  throw "PostgreSQL not listening on 127.0.0.1:5432 - start the service first"
}
$drive = (Get-Item -LiteralPath $DahRoot).PSDrive.Name
try {
  $freeGB = [math]::Round((Get-PSDrive $drive).Free / 1GB, 2)
  Write-Host "    Free disk ${drive}: $freeGB GB"
  if ($freeGB -lt 1) {
    Write-Host "    WARN: less than 1 GB free - build may fail"
  }
} catch { }

if (-not $SkipPreBackup) {
  Write-Step "pre-update database dump"
  Invoke-PreUpdateDump -EnvMap $envMap -Root $DahRoot
} else {
  Write-Step "skip pre-update dump"
}

Write-Step "git pull skipped (update code manually before this script)"

# Stop API/worker (and free ports) so prisma can replace query_engine-windows.dll.node
if (-not $SkipRestart -and -not $SkipStop) {
  Write-Step "stop stack (required before prisma generate on Windows)"
  Invoke-StopStack -Root $DahRoot -Port $WebPort
} elseif ($SkipStop) {
  Write-Step "skip early stop (EPERM on prisma generate is likely if API is running)"
}

if (-not $SkipInstall) {
  Write-Step "npm install"
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} else {
  Write-Step "skip npm install"
}

if (-not $SkipGenerate) {
  Write-Step "prisma generate (db:generate)"
  npm run db:generate -w @dah/api
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    prisma generate failed — often EPERM if node still holds query_engine DLL"
    Write-Host "    retry after forced stop..."
    if (-not $SkipStop) {
      Invoke-StopStack -Root $DahRoot -Port $WebPort
      Start-Sleep -Seconds 2
      npm run db:generate -w @dah/api
    }
    if ($LASTEXITCODE -ne 0) {
      throw @"
db:generate failed (often EPERM on Windows when API/worker still run).
  1) npm run stop:native:win
  2) Close other node terminals using this repo
  3) npm run db:generate -w @dah/api
  4) npm run update:native:win  (or continue build/migrate/start)
"@
    }
  }
} else {
  Write-Step "skip prisma generate"
}

if (-not $SkipBuild) {
  Write-Step "npm run build"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} else {
  Write-Step "skip build"
}

$apiMain = Join-Path $DahRoot "apps\api\dist\src\main.js"
if (-not (Test-Path -LiteralPath $apiMain)) {
  throw "API build missing: $apiMain"
}

if (-not $SkipMigrate) {
  Write-Step "db:migrate"
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw "db:migrate failed" }
} else {
  Write-Step "skip migrate"
}

if (-not $SkipRestart) {
  Write-Step "start stack"
  if (-not (Test-Path -LiteralPath $startPs1)) {
    throw "Missing start script: $startPs1"
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startPs1 -DahRoot $DahRoot -WebPort $WebPort
} else {
  Write-Step "skip start - start manually: npm run start:native:win"
}

Write-Step "health smoke"
$healthOk = $false
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/health" -TimeoutSec 3
    if ($h.status -eq "ok" -or $h.status -eq "degraded") {
      Write-Host "    API health: $($h.status)"
      $healthOk = $true
      break
    }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $healthOk) {
  Write-Host "    WARN: API health failed (is stack up? check logs\native-windows\)"
}

try {
  $code = (Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec 5).StatusCode
  Write-Host "    web :$WebPort -> HTTP $code"
} catch {
  Write-Host "    web :$WebPort -> FAIL (nginx missing or down - API may still work on :3001)"
}

Write-Step "done"
Write-Host "    status: npm run status:native:win"
Write-Host "    docs:   docs\NATIVE-HOST-WINDOWS.md  docs\KEENDNS-WINDOWS.md"
exit 0
