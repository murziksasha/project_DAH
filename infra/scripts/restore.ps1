# Restore DAH from backup directory (Windows native / Docker hybrid).
# Usage:
#   .\infra\scripts\restore.ps1 -BackupDir backups\manual\20260815_120000
#   .\infra\scripts\restore.ps1 -BackupDir backups\weekly\2026-W33 -NativeOnly
# Expects: database.sql.gz and optional files\ (MinIO mirror).

param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,
  [switch]$NativeOnly,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Backup = if ([System.IO.Path]::IsPathRooted($BackupDir)) {
  $BackupDir
} else {
  Join-Path $Root $BackupDir
}
$Backup = (Resolve-Path $Backup).Path
$Dump = Join-Path $Backup 'database.sql.gz'
$FilesDir = Join-Path $Backup 'files'

if (-not (Test-Path $Dump)) {
  throw "ERROR: $Dump not found"
}

$PostgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'dah' }
$PostgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'dah' }
$PostgresHost = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { '127.0.0.1' }
$PostgresPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '5432' }
$S3Access = if ($env:S3_ACCESS_KEY) { $env:S3_ACCESS_KEY } else { 'dah_minio' }
$S3Secret = if ($env:S3_SECRET_KEY) { $env:S3_SECRET_KEY } else { 'dah_minio_secret_change_me' }
$S3Bucket = if ($env:S3_BUCKET) { $env:S3_BUCKET } else { 'dah-files' }
$S3Endpoint = if ($env:S3_ENDPOINT) { $env:S3_ENDPOINT } else { 'http://127.0.0.1:9000' }

Write-Host "==> Restore from $Backup"
if ($DryRun) {
  Write-Host "DryRun: would restore DB dump + files (if present)"
  if (Test-Path $FilesDir) { Write-Host "DryRun: files dir present" }
  exit 0
}

# Load .env if present for DATABASE_URL / secrets
$EnvFile = Join-Path $Root '.env'
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $k, $v = $_.Split('=', 2)
    if (-not [string]::IsNullOrWhiteSpace($k) -and -not (Test-Path "env:$k")) {
      Set-Item -Path "env:$k" -Value $v.Trim().Trim('"').Trim("'")
    }
  }
}

if ($NativeOnly -or -not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "==> Restoring database via local psql (gunzip | psql)"
  $pgPass = $env:POSTGRES_PASSWORD
  if ($env:DATABASE_URL -match 'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)') {
    $PostgresUser = $Matches[1]
    $pgPass = [uri]::UnescapeDataString($Matches[2])
    $PostgresHost = $Matches[3]
    if ($Matches[4]) { $PostgresPort = $Matches[4] }
    $PostgresDb = $Matches[5]
  }
  $env:PGPASSWORD = $pgPass
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) { throw 'psql not found on PATH' }

  # Prefer gzip from Git/MSYS or .NET decompress
  $gzip = Get-Command gzip -ErrorAction SilentlyContinue
  if ($gzip) {
    & gzip -dc $Dump | & psql -h $PostgresHost -p $PostgresPort -U $PostgresUser -d $PostgresDb --single-transaction
  } else {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $in = [System.IO.File]::OpenRead($Dump)
    $gz = New-Object System.IO.Compression.GzipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
    $tmp = Join-Path $env:TEMP ("dah-restore-" + [guid]::NewGuid().ToString() + '.sql')
    try {
      $out = [System.IO.File]::Create($tmp)
      $gz.CopyTo($out)
      $out.Close()
      & psql -h $PostgresHost -p $PostgresPort -U $PostgresUser -d $PostgresDb --single-transaction -f $tmp
      if ($LASTEXITCODE -ne 0) { throw "psql exited $LASTEXITCODE" }
    } finally {
      $gz.Dispose(); $in.Dispose()
      if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    }
  }
} else {
  Write-Host "==> Restoring database via docker compose postgres"
  $compose = Join-Path $Root 'docker-compose.yml'
  $gunzip = Get-Command gzip -ErrorAction SilentlyContinue
  if ($gunzip) {
    & gzip -dc $Dump | docker compose -f $compose exec -T postgres psql -U $PostgresUser -d $PostgresDb --single-transaction
  } else {
    throw 'gzip not found; install Git for Windows or use -NativeOnly with .NET decompress path'
  }
  if ($LASTEXITCODE -ne 0) { throw "docker psql restore failed: $LASTEXITCODE" }
}

if (Test-Path $FilesDir) {
  Write-Host "==> Restoring MinIO files from $FilesDir"
  $mc = Get-Command mc -ErrorAction SilentlyContinue
  if ($mc) {
    $alias = "dah_restore_$([guid]::NewGuid().ToString('N').Substring(0,8))"
    & mc alias set $alias $S3Endpoint $S3Access $S3Secret | Out-Null
    & mc mirror --overwrite $FilesDir "$alias/$S3Bucket"
    & mc alias remove $alias | Out-Null
  } elseif (-not $NativeOnly) {
    docker compose -f (Join-Path $Root 'docker-compose.yml') run --rm `
      -v "${FilesDir}:/backup" `
      --entrypoint sh minio-init -c `
      "mc alias set local http://minio:9000 $S3Access $S3Secret; mc mirror --overwrite /backup local/$S3Bucket"
  } else {
    Write-Warning 'mc not found — skipped MinIO restore. Install MinIO client or restore files manually.'
  }
}

Write-Host '==> Restore complete'
Write-Host 'Smoke: curl /api/health and login as admin'
