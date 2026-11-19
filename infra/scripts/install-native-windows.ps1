# Install DAH as a Windows auto-start stack (no Docker, no Linux systemd).
# ASCII-only source (PowerShell 5.1 on Windows often misreads UTF-8 without BOM).
#
# Prerequisites (install once):
#   - Node.js >= 20
#   - PostgreSQL listening on 127.0.0.1:5432 (user/db from .env)
#   - .env with localhost URLs (see docs/NATIVE-HOST-WINDOWS.md)
#   - Optional: minio.exe (script can download to tools\minio.exe)
#   - Optional: nginx for Windows - static UI + /api proxy
#
# Usage (Administrator recommended for firewall + tasks):
#   cd C:\miy_dim
#   powershell -ExecutionPolicy Bypass -File infra\scripts\install-native-windows.ps1
#   npm run install:native:win
#   npx dah-native install
#
# Options:
#   -SkipBuild -SkipMigrate -DownloadMinio -Unregister -WebPort 3000
#   -NginxExe C:\nginx\nginx.exe -MinioExe C:\miy_dim\tools\minio.exe
#   -EnableTls -TlsCertPath ... -TlsKeyPath ... -Domain example.keenetic.pro
#   (TLS is opt-in; default nginx conf stays HTTP-only on WEB_PORT)
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [string]$NginxExe = "",
  [string]$MinioExe = "",
  [string]$MinioDataDir = "",
  [switch]$SkipBuild,
  [switch]$SkipMigrate,
  [switch]$DownloadMinio,
  [switch]$SkipFirewall,
  [switch]$Unregister,
  [switch]$NoElevate,
  [switch]$EnableTls,
  [string]$TlsCertPath = "",
  [string]$TlsKeyPath = "",
  [string]$Domain = ""
)

$ErrorActionPreference = "Stop"
$TaskName = "DAH-Native-Stack"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-Admin {
  if ($NoElevate) { return }
  if (Test-IsAdmin) { return }
  Write-Host "Re-launching elevated (Administrator) for scheduled task + firewall..."
  $argList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-NoElevate"
  )
  if ($DahRoot) { $argList += @("-DahRoot", $DahRoot) }
  if ($WebPort -gt 0) { $argList += @("-WebPort", "$WebPort") }
  if ($NginxExe) { $argList += @("-NginxExe", $NginxExe) }
  if ($MinioExe) { $argList += @("-MinioExe", $MinioExe) }
  if ($MinioDataDir) { $argList += @("-MinioDataDir", $MinioDataDir) }
  if ($SkipBuild) { $argList += "-SkipBuild" }
  if ($SkipMigrate) { $argList += "-SkipMigrate" }
  if ($DownloadMinio) { $argList += "-DownloadMinio" }
  if ($SkipFirewall) { $argList += "-SkipFirewall" }
  if ($Unregister) { $argList += "-Unregister" }
  if ($EnableTls) { $argList += "-EnableTls" }
  if ($TlsCertPath) { $argList += @("-TlsCertPath", $TlsCertPath) }
  if ($TlsKeyPath) { $argList += @("-TlsKeyPath", $TlsKeyPath) }
  if ($Domain) { $argList += @("-Domain", $Domain) }
  $p = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -Wait -PassThru
  if ($null -eq $p) { exit 1 }
  exit $p.ExitCode
}

if (-not $DahRoot) {
  if ($env:DAH_ROOT) { $DahRoot = $env:DAH_ROOT }
  else { $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
}
$DahRoot = (Resolve-Path -LiteralPath $DahRoot).Path

if ($WebPort -le 0) {
  if ($env:WEB_PORT) { $WebPort = [int]$env:WEB_PORT } else { $WebPort = 3000 }
}
if (-not $NginxExe -and $env:DAH_NGINX_EXE) { $NginxExe = $env:DAH_NGINX_EXE }

Request-Admin

Write-Host "==> DAH Windows native install"
Write-Host "    DAH_ROOT=$DahRoot"
Write-Host "    WEB_PORT=$WebPort"
Write-Host "    Admin=$(Test-IsAdmin)"

if ($Unregister) {
  Write-Host "==> Unregister scheduled task $TaskName"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName "DAH Web $WebPort" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName "DAH API 3001" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  Write-Host "Done. (Processes may still be running.)"
  Write-Host "Prefer: npm run uninstall:native:win   (stop + unregister + firewall)"
  Write-Host "Full wipe: npm run uninstall:native:win -- -FullWipe -ConfirmYes"
  exit 0
}

# --- checks ---
$envFile = Join-Path $DahRoot ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
  Write-Error "Missing $envFile - copy .env.example and set 127.0.0.1 URLs (not postgres/minio hostnames)."
}

$envText = Get-Content -LiteralPath $envFile -Raw
if ($envText -match "DATABASE_URL=.*@(postgres|minio)[:/]") {
  Write-Warning "DATABASE_URL looks like Docker hostname. Use 127.0.0.1 for Windows native."
}
if ($envText -match "S3_ENDPOINT=http://minio") {
  Write-Warning "S3_ENDPOINT uses host 'minio'. Use http://127.0.0.1:9000 for Windows native."
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "Node.js not found. Install Node >= 20 and re-open PowerShell."
}
$nodeVer = & node -v
Write-Host "    Node $nodeVer"

# PostgreSQL
$pg = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
if (-not $pg.TcpTestSucceeded) {
  Write-Error @"
PostgreSQL is not listening on 127.0.0.1:5432.

Install PostgreSQL for Windows (no Docker in this path), create DB/user from .env, start the service:
  services.msc -> postgresql-x64-... -> Start

Then re-run this script.
"@
}

# MinIO binary
$toolsDir = Join-Path $DahRoot "tools"
$defaultMinio = Join-Path $toolsDir "minio.exe"
if (-not $MinioExe) {
  if (Test-Path -LiteralPath $defaultMinio) { $MinioExe = $defaultMinio }
  else {
    $m = Get-Command minio.exe -ErrorAction SilentlyContinue
    if ($m) { $MinioExe = $m.Source }
  }
}
if ($DownloadMinio -or -not $MinioExe -or -not (Test-Path -LiteralPath $MinioExe)) {
  if (-not $DownloadMinio -and -not (Test-Path -LiteralPath $defaultMinio)) {
    Write-Host "==> minio.exe not found - downloading to tools\minio.exe"
    $DownloadMinio = $true
  }
}
if ($DownloadMinio) {
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  $url = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
  Write-Host "==> Download MinIO: $url"
  Invoke-WebRequest -Uri $url -OutFile $defaultMinio -UseBasicParsing
  $MinioExe = $defaultMinio
  Write-Host "    Saved $MinioExe"
}
if (-not $MinioExe -or -not (Test-Path -LiteralPath $MinioExe)) {
  Write-Warning "minio.exe still missing - stack will start API without object storage until you add tools\minio.exe"
}

if (-not $MinioDataDir) {
  $MinioDataDir = Join-Path $DahRoot "minio-data"
}
New-Item -ItemType Directory -Force -Path $MinioDataDir | Out-Null

# npm build
Push-Location $DahRoot
try {
  if (-not $SkipBuild) {
    Write-Host "==> npm install (if needed) + build"
    if (-not (Test-Path -LiteralPath (Join-Path $DahRoot "node_modules"))) {
      npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
  } else {
    Write-Host "==> skip build"
  }

  $apiMain = Join-Path $DahRoot "apps\api\dist\src\main.js"
  $webOut = Join-Path $DahRoot "apps\web\out"
  if (-not (Test-Path -LiteralPath $apiMain)) {
    throw "API build missing: $apiMain"
  }
  if (-not (Test-Path -LiteralPath $webOut)) {
    Write-Warning "Web export missing ($webOut). UI via nginx will 404 until npm run build -w @dah/web"
  }

  if (-not $SkipMigrate) {
    Write-Host "==> db:migrate"
    npm run db:migrate
    if ($LASTEXITCODE -ne 0) { throw "db:migrate failed" }
  } else {
    Write-Host "==> skip migrate"
  }
} finally {
  Pop-Location
}

# nginx config from template (UTF-8 no BOM — PS 5.1 Set-Content -Encoding UTF8 adds BOM
# and nginx fails: unknown directive "п»ї#")
function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $enc = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

if (-not $NginxExe) {
  foreach ($c in @("C:\nginx\nginx.exe", "C:\tools\nginx\nginx.exe")) {
    if (Test-Path -LiteralPath $c) { $NginxExe = $c; break }
  }
}
if ($NginxExe) {
  Write-Host "    nginx: $NginxExe"
  $env:DAH_NGINX_EXE = $NginxExe
} else {
  Write-Host "    nginx: not found - install nginx for Windows or set -NginxExe (API-only still works)"
}

$tpl = Join-Path $DahRoot "infra\nginx\dah-windows.conf.in"
$confOut = Join-Path $DahRoot "infra\nginx\dah-windows.conf"
$rootPosix = ($DahRoot -replace "\\", "/")
# Absolute mime.types: relative includes resolve next to dah-windows.conf, not nginx -p
$mimePosix = "C:/nginx/conf/mime.types"
if ($NginxExe -and (Test-Path -LiteralPath $NginxExe)) {
  $ngxHome = Split-Path -Parent $NginxExe
  $mimeCandidate = Join-Path $ngxHome "conf\mime.types"
  if (Test-Path -LiteralPath $mimeCandidate) {
    $mimePosix = ($mimeCandidate -replace "\\", "/")
  }
}
# TLS: opt-in only (DAH_ENABLE_TLS=1 or -EnableTls). Default HTTP-only.
if (-not $EnableTls -and $env:DAH_ENABLE_TLS -eq "1") { $EnableTls = $true }
if (-not $TlsCertPath) {
  $TlsCertPath = Join-Path $DahRoot "infra\certs\fullchain.pem"
}
if (-not $TlsKeyPath) {
  $TlsKeyPath = Join-Path $DahRoot "infra\certs\privkey.pem"
}
if (-not $Domain) {
  # may be filled from .env DOMAIN later when rendering
  $Domain = "_"
}

if (Test-Path -LiteralPath $tpl) {
  $conf = Get-Content -LiteralPath $tpl -Raw -Encoding UTF8
  if ($conf.Length -gt 0 -and [int][char]$conf[0] -eq 0xFEFF) {
    $conf = $conf.Substring(1)
  }
  $conf = $conf.Replace("@@DAH_ROOT@@", $rootPosix)
  $conf = $conf.Replace("@@WEB_PORT@@", "$WebPort")
  $conf = $conf.Replace("@@MIMETYPES@@", $mimePosix)

  $tlsBlock = ""
  if ($EnableTls) {
    if (-not (Test-Path -LiteralPath $TlsCertPath) -or -not (Test-Path -LiteralPath $TlsKeyPath)) {
      Write-Warning "EnableTls set but cert/key missing:`n  $TlsCertPath`n  $TlsKeyPath`n  Rendering HTTP-only. See docs/KEENDNS-WINDOWS.md"
    } else {
      $certPosix = ($TlsCertPath -replace "\\", "/")
      $keyPosix = ($TlsKeyPath -replace "\\", "/")
      $serverName = if ($Domain -and $Domain -ne "_") { $Domain } else { "_" }
      # Read DOMAIN from .env if still default
      if ($serverName -eq "_") {
        $envTxt = Get-Content -LiteralPath $envFile -Raw -ErrorAction SilentlyContinue
        if ($envTxt -match '(?m)^DOMAIN=(.+)$') {
          $serverName = $Matches[1].Trim().Trim('"').Trim("'")
        }
      }
      $tlsBlock = @"

    # TLS server (opt-in via -EnableTls). Forward Keenetic 443 -> this host :443
    server {
        listen       443 ssl;
        server_name  $serverName;
        root         $rootPosix/apps/web/out;
        index        index.html;
        client_max_body_size 100m;

        ssl_certificate     $certPosix;
        ssl_certificate_key $keyPosix;
        ssl_protocols       TLSv1.2 TLSv1.3;

        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;

        location /api/ {
            proxy_pass http://127.0.0.1:3001/api/;
            proxy_http_version 1.1;
            proxy_set_header Host `$host;
            proxy_set_header X-Real-IP `$remote_addr;
            proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_read_timeout 120s;
        }

        location /_next/static/ {
            expires 30d;
            add_header Cache-Control "public, immutable";
            try_files `$uri =404;
        }

        location = /sw.js {
            add_header Cache-Control "no-cache";
            try_files `$uri =404;
        }

        location / {
            try_files `$uri `$uri/ `$uri/index.html /index.html;
        }
    }
"@
      Write-Host "==> TLS server block enabled (443) cert=$TlsCertPath"
    }
  }
  $conf = $conf.Replace("@@TLS_SERVER_BLOCK@@", $tlsBlock)
  if (-not $conf.EndsWith("`n")) { $conf = $conf + "`n" }
  Write-Utf8NoBom -Path $confOut -Content $conf
  Write-Host "==> Wrote $confOut (UTF-8 no BOM, mime=$mimePosix, tls=$EnableTls)"
} else {
  Write-Warning "Template missing: $tpl"
}

# Scheduled task
$stackPs1 = Join-Path $DahRoot "infra\scripts\start-dah-windows-stack.ps1"
$argParts = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$stackPs1`"",
  "-DahRoot", "`"$DahRoot`"",
  "-WebPort", "$WebPort"
)
if ($MinioExe) { $argParts += @("-MinioExe", "`"$MinioExe`"") }
if ($MinioDataDir) { $argParts += @("-MinioDataDir", "`"$MinioDataDir`"") }
if ($NginxExe) { $argParts += @("-NginxExe", "`"$NginxExe`"") }
$argString = $argParts -join " "

Write-Host "==> Register scheduled task: $TaskName (At startup + At logon)"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString -WorkingDirectory $DahRoot
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
# Delay so PostgreSQL Windows service can bind
$triggerStartup.Delay = "PT60S"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
$userId = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest

# ASCII description only (UTF-8 without BOM breaks PS 5.1 parse of this file)
$taskDescription = "DAH native stack: MinIO, API, Worker, optional nginx"

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($triggerStartup, $triggerLogon) `
  -Settings $settings `
  -Principal $principal `
  -Description $taskDescription `
  -Force | Out-Null

Write-Host "    Task registered as $userId (interactive). Log in after boot so processes keep the user session."

# Firewall
if (-not $SkipFirewall -and (Test-IsAdmin)) {
  Write-Host "==> Firewall rules (inbound $WebPort, 3001 optional for debug)"
  $rules = @(
    @{ Name = "DAH Web $WebPort"; Port = $WebPort },
    @{ Name = "DAH API 3001"; Port = 3001 }
  )
  foreach ($r in $rules) {
    Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port -Profile Private,Domain | Out-Null
  }
  Write-Host "    Tip: do not expose 5432/9000 to the internet."
}

# State file for uninstall / docs
$state = @{
  installedAt = (Get-Date).ToString("o")
  dahRoot     = $DahRoot
  webPort     = $WebPort
  minioExe    = $MinioExe
  nginxExe    = $NginxExe
  taskName    = $TaskName
}
$stateDir = Join-Path $DahRoot "logs\native-windows"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir "install-state.json") -Encoding UTF8

# Start now
Write-Host "==> Starting stack now..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stackPs1 `
  -DahRoot $DahRoot -WebPort $WebPort `
  -MinioExe $MinioExe -MinioDataDir $MinioDataDir `
  -NginxExe $NginxExe

Write-Host ""
Write-Host "==> Done."
Write-Host "    Health:  http://127.0.0.1:3001/api/health"
Write-Host "    Web:     http://127.0.0.1:$WebPort/   (if nginx configured)"
Write-Host "    Logs:    $DahRoot\logs\native-windows\"
Write-Host "    Task:    taskschd.msc -> $TaskName"
Write-Host "    Remove:  npm run uninstall:native:win"
Write-Host "    Wipe:    npm run uninstall:native:win -- -FullWipe -ConfirmYes"
Write-Host ""
Write-Host "PostgreSQL must be set to Automatic start (services.msc)."
Write-Host "Docs: docs\NATIVE-HOST-WINDOWS.md"
