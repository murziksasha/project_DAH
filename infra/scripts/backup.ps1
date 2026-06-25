# Backup PostgreSQL + MinIO for DAH (Windows / PowerShell)
param(
    [string]$OutputDir = "$PSScriptRoot\..\..\backups"
)

$Root = Resolve-Path "$PSScriptRoot\..\.."
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$RunDir = Join-Path $OutputDir $Timestamp
New-Item -ItemType Directory -Force -Path $RunDir | Out-Null

$PgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "dah" }
$PgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "dah" }
$S3Key = if ($env:S3_ACCESS_KEY) { $env:S3_ACCESS_KEY } else { "dah_minio" }
$S3Secret = if ($env:S3_SECRET_KEY) { $env:S3_SECRET_KEY } else { "dah_minio_secret_change_me" }
$S3Bucket = if ($env:S3_BUCKET) { $env:S3_BUCKET } else { "dah-files" }

Write-Host "==> DAH backup -> $RunDir"

Push-Location $Root
try {
    $pgRunning = docker compose ps postgres --status running 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> PostgreSQL dump"
        docker compose exec -T postgres pg_dump -U $PgUser $PgDb |
            Set-Content -Encoding utf8 (Join-Path $RunDir "database.sql")
    }

    $minioRunning = docker compose ps minio --status running 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> MinIO files mirror"
        $filesDir = Join-Path $RunDir "files"
        New-Item -ItemType Directory -Force -Path $filesDir | Out-Null
        docker compose run --rm --entrypoint sh minio-init -c @"
mc alias set local http://minio:9000 $S3Key $S3Secret
mc mirror --overwrite local/$S3Bucket /backup
"@ -v "${filesDir}:/backup"
    }

    @{ timestamp = $Timestamp; postgres_db = $PgDb; s3_bucket = $S3Bucket } |
        ConvertTo-Json | Set-Content (Join-Path $RunDir "manifest.json")

    Write-Host "==> Done: $RunDir"
}
finally {
    Pop-Location
}