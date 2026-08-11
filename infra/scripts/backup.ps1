# Backup PostgreSQL + MinIO for DAH (Windows / PowerShell)
# Tries Docker first; falls back to native pg_dump + optional mc for pure Windows host.
#
# Usage:
#   powershell -File infra/scripts/backup.ps1
#   npm run backup:native
#   npm run backup:win
param(
    [string]$OutputDir = "",
    [string]$DahRoot = "",
    [switch]$SkipMinio,
    [switch]$DockerOnly,
    [switch]$NativeOnly
)

$ErrorActionPreference = "Stop"

if (-not $DahRoot) {
    $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
$Root = $DahRoot

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

function Find-PgDump {
    $cmd = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($root in @("${env:ProgramFiles}\PostgreSQL", "${env:ProgramFiles(x86)}\PostgreSQL")) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        $found = Get-ChildItem -Path $root -Filter "pg_dump.exe" -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Find-Mc {
    $cmd = Get-Command mc.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $c = Join-Path $Root "tools\mc.exe"
    if (Test-Path -LiteralPath $c) { return $c }
    return $null
}

function Compress-GzipFile([string]$Source, [string]$Dest) {
    $in = [System.IO.File]::OpenRead($Source)
    $out = [System.IO.File]::Create($Dest)
    $gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionMode]::Compress)
    try {
        $in.CopyTo($gz)
    } finally {
        $gz.Close(); $out.Close(); $in.Close()
    }
}

$envPath = Join-Path $Root ".env"
$envMap = Get-EnvMap $envPath

# Prefer .env over process env for credentials
$PgUser = if ($envMap["POSTGRES_USER"]) { $envMap["POSTGRES_USER"] } elseif ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "dah" }
$PgDb = if ($envMap["POSTGRES_DB"]) { $envMap["POSTGRES_DB"] } elseif ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "dah" }
$PgPass = if ($envMap["POSTGRES_PASSWORD"]) { $envMap["POSTGRES_PASSWORD"] } elseif ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "" }
$PgHost = "127.0.0.1"
$PgPort = "5432"
$S3Key = if ($envMap["S3_ACCESS_KEY"]) { $envMap["S3_ACCESS_KEY"] } elseif ($env:S3_ACCESS_KEY) { $env:S3_ACCESS_KEY } else { "dah_minio" }
$S3Secret = if ($envMap["S3_SECRET_KEY"]) { $envMap["S3_SECRET_KEY"] } elseif ($env:S3_SECRET_KEY) { $env:S3_SECRET_KEY } else { "dah_minio_secret_change_me" }
$S3Bucket = if ($envMap["S3_BUCKET"]) { $envMap["S3_BUCKET"] } elseif ($env:S3_BUCKET) { $env:S3_BUCKET } else { "dah-files" }
$S3Endpoint = if ($envMap["S3_ENDPOINT"]) { $envMap["S3_ENDPOINT"] } elseif ($env:S3_ENDPOINT) { $env:S3_ENDPOINT } else { "http://127.0.0.1:9000" }

$url = $envMap["DATABASE_URL"]
if (-not $url) { $url = $env:DATABASE_URL }
if ($url -and $url -match '^postgres(?:ql)?://([^:]+):([^@]*)@([^:/]+):?(\d+)?/([^?]+)') {
    $PgUser = $Matches[1]
    $PgPass = [Uri]::UnescapeDataString($Matches[2])
    $PgHost = $Matches[3]
    if ($Matches[4]) { $PgPort = $Matches[4] }
    $PgDb = $Matches[5]
}

if (-not $OutputDir) {
    if ($envMap["BACKUP_DIR"]) {
        $bd = $envMap["BACKUP_DIR"]
        if (-not [System.IO.Path]::IsPathRooted($bd)) { $bd = Join-Path $Root $bd }
        $OutputDir = $bd
    } else {
        $OutputDir = Join-Path $Root "backups"
    }
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RunDir = Join-Path $OutputDir $Timestamp
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

Write-Host "==> DAH backup -> $RunDir"

$didPostgres = $false
$didMinio = $false
$mode = "none"

Push-Location $Root
try {
    $dockerOk = $false
    if (-not $NativeOnly) {
        $null = Get-Command docker -ErrorAction SilentlyContinue
        if ($?) {
            try {
                $pgRunning = docker compose ps postgres --status running 2>$null
                if ($LASTEXITCODE -eq 0 -and $pgRunning) { $dockerOk = $true }
            } catch {
                $dockerOk = $false
            }
        }
    }

    if ($dockerOk -and -not $NativeOnly) {
        $mode = "docker"
        Write-Host "==> PostgreSQL dump (Docker)"
        $sqlPath = Join-Path $RunDir "database.sql"
        docker compose exec -T postgres pg_dump -U $PgUser $PgDb |
            Set-Content -Encoding utf8 $sqlPath
        if (Test-Path -LiteralPath $sqlPath) {
            try {
                Compress-GzipFile $sqlPath (Join-Path $RunDir "database.sql.gz")
                Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Host "    (left uncompressed database.sql)"
            }
            $didPostgres = $true
        }

        if (-not $SkipMinio) {
            try {
                $minioRunning = docker compose ps minio --status running 2>$null
                if ($LASTEXITCODE -eq 0 -and $minioRunning) {
                    Write-Host "==> MinIO files mirror (Docker)"
                    $filesDir = Join-Path $RunDir "files"
                    New-Item -ItemType Directory -Force -Path $filesDir | Out-Null
                    docker compose run --rm --entrypoint sh minio-init -c @"
mc alias set local http://minio:9000 $S3Key $S3Secret
mc mirror --overwrite local/$S3Bucket /backup
"@ -v "${filesDir}:/backup"
                    $didMinio = $true
                }
            } catch {
                Write-Host "    WARN: MinIO docker mirror failed: $($_.Exception.Message)"
            }
        }
    }

    if (-not $didPostgres -and -not $DockerOnly) {
        $mode = "native"
        $pgDump = Find-PgDump
        if (-not $pgDump) {
            throw "pg_dump.exe not found. Install PostgreSQL client tools or use Docker infra."
        }
        Write-Host "==> PostgreSQL dump (native: $pgDump)"
        $sqlPath = Join-Path $RunDir "database.sql"
        $prevPass = $env:PGPASSWORD
        try {
            if ($PgPass) { $env:PGPASSWORD = $PgPass }
            & $pgDump -h $PgHost -p $PgPort -U $PgUser -d $PgDb -F p -f $sqlPath
            if ($LASTEXITCODE -ne 0) {
                throw "pg_dump failed with exit $LASTEXITCODE"
            }
            try {
                Compress-GzipFile $sqlPath (Join-Path $RunDir "database.sql.gz")
                Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
                Write-Host "    database.sql.gz"
            } catch {
                Write-Host "    database.sql (gzip failed)"
            }
            $didPostgres = $true
        } finally {
            if ($null -ne $prevPass) { $env:PGPASSWORD = $prevPass }
            else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
        }
    }

    if (-not $didMinio -and -not $SkipMinio -and -not $DockerOnly) {
        $mc = Find-Mc
        if (-not $mc) {
            Write-Host "==> MinIO: skip (mc.exe not found - optional: tools\mc.exe or PATH)"
        } else {
            Write-Host "==> MinIO files mirror (native mc -> $S3Endpoint)"
            $filesDir = Join-Path $RunDir "files"
            New-Item -ItemType Directory -Force -Path $filesDir | Out-Null
            $alias = "dahbackup$Timestamp"
            try {
                & $mc alias set $alias $S3Endpoint $S3Key $S3Secret --api S3v4 2>$null
                & $mc mirror --overwrite "$alias/$S3Bucket" $filesDir
                if ($LASTEXITCODE -eq 0) { $didMinio = $true }
                else { Write-Host "    WARN: mc mirror exit $LASTEXITCODE" }
            } catch {
                Write-Host "    WARN: mc mirror failed: $($_.Exception.Message)"
            } finally {
                & $mc alias remove $alias 2>$null | Out-Null
            }
        }
    }

    if (-not $didPostgres) {
        throw "Backup failed: no PostgreSQL dump produced"
    }

    $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    @{
        timestamp   = $Timestamp
        postgres_db = $PgDb
        s3_bucket   = $S3Bucket
        mode        = $mode
        minio       = $didMinio
        finishedAt  = $finishedAt
    } | ConvertTo-Json | Set-Content (Join-Path $RunDir "manifest.json") -Encoding UTF8

    # Marker for API health /admin/ops (BACKUP_STATUS_PATH)
    $markerPath = Join-Path $OutputDir "last-backup.json"
    if ($envMap["BACKUP_STATUS_PATH"]) {
        $bp = $envMap["BACKUP_STATUS_PATH"]
        if (-not [System.IO.Path]::IsPathRooted($bp)) { $bp = Join-Path $Root $bp }
        $markerPath = $bp
        $markerDir = Split-Path -Parent $markerPath
        if ($markerDir) { New-Item -ItemType Directory -Force -Path $markerDir | Out-Null }
    }

    @{ finishedAt = $finishedAt; runDir = $RunDir; timestamp = $Timestamp; mode = $mode } |
        ConvertTo-Json | Set-Content $markerPath -Encoding UTF8

    Write-Host "==> Done: $RunDir (mode=$mode minio=$didMinio)"
    Write-Host "    marker: $markerPath"
}
finally {
    Pop-Location
}
