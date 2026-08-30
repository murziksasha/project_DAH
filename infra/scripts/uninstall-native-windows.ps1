# Uninstall DAH native Windows stack.
# ASCII-only source (PowerShell 5.1 on Windows often misreads UTF-8 without BOM).
#
# Default: stop processes, unregister Scheduled Task, remove DAH firewall rules,
#          remove NSSM/pm2 wrappers if present. Does NOT touch PostgreSQL, Node.js,
#          nginx install dir, or the repo folder.
#
# Full wipe (irreversible):
#   powershell -File infra\scripts\uninstall-native-windows.ps1 -FullWipe -ConfirmYes
#   npm run uninstall:native:win -- -FullWipe -ConfirmYes
#
# Options:
#   -SkipOsPackages   with -FullWipe: keep PostgreSQL + Node.js
#   -SkipDeleteRepo   with -FullWipe: keep DAH_ROOT folder
#   -SkipDocker       do not docker compose stop
#   -NoElevate        do not re-launch as Administrator
param(
  [string]$DahRoot = "",
  [int]$WebPort = 0,
  [switch]$FullWipe,
  [switch]$ConfirmYes,
  [switch]$SkipOsPackages,
  [switch]$SkipDeleteRepo,
  [switch]$SkipDocker,
  [switch]$NoElevate
)

$ErrorActionPreference = "Continue"
$TaskName = "DAH-Native-Stack"
$script:HadWarning = $false
$script:TempLog = Join-Path $env:TEMP "dah-uninstall.log"

function Write-Log([string]$Message) {
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$ts] $Message"
  Write-Host $line
  try {
    Add-Content -LiteralPath $script:TempLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
  } catch { }
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-Admin {
  if ($NoElevate) { return }
  if (Test-IsAdmin) { return }
  Write-Host "Re-launching elevated (Administrator) for task/firewall/services..."
  $argList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-NoElevate"
  )
  if ($DahRoot) { $argList += @("-DahRoot", $DahRoot) }
  if ($WebPort -gt 0) { $argList += @("-WebPort", "$WebPort") }
  if ($FullWipe) { $argList += "-FullWipe" }
  if ($ConfirmYes) { $argList += "-ConfirmYes" }
  if ($SkipOsPackages) { $argList += "-SkipOsPackages" }
  if ($SkipDeleteRepo) { $argList += "-SkipDeleteRepo" }
  if ($SkipDocker) { $argList += "-SkipDocker" }
  $p = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -Wait -PassThru
  if ($null -eq $p) { exit 1 }
  exit $p.ExitCode
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

function Test-SafeToDelete([string]$Path) {
  if (-not $Path) { return $false }
  try {
    $full = [IO.Path]::GetFullPath($Path)
  } catch {
    return $false
  }
  $full = $full.TrimEnd('\')
  $blocked = @(
    "C:",
    "C:\Windows",
    "C:\Windows\System32",
    "C:\Program Files",
    "C:\Program Files (x86)",
    [string]$env:SystemRoot,
    [string]$env:USERPROFILE,
    [string]$env:ProgramData,
    [string]$env:windir
  )
  foreach ($b in $blocked) {
    if (-not $b) { continue }
    if ($full -eq $b.TrimEnd('\')) { return $false }
  }
  $parts = $full.Split('\') | Where-Object { $_ -ne "" }
  if ($parts.Count -lt 2) { return $false }
  return $true
}

function Remove-TreeSafe([string]$Path, [string]$Label) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    Write-Log "${Label}: not present ($Path)"
    return
  }
  if (-not (Test-SafeToDelete $Path)) {
    Write-Log "${Label}: REFUSED to delete unsafe path $Path"
    $script:HadWarning = $true
    return
  }
  Write-Log "${Label}: removing $Path"
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Log "${Label}: remove failed: $($_.Exception.Message)"
    $script:HadWarning = $true
  }
}

function Get-UninstallEntries([string]$NamePattern) {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $out = @()
  foreach ($p in $paths) {
    $items = Get-ItemProperty -Path $p -ErrorAction SilentlyContinue
    foreach ($e in $items) {
      if ($e.DisplayName -and ($e.DisplayName -match $NamePattern)) {
        $out += $e
      }
    }
  }
  return $out
}

function Invoke-UninstallEntry($Entry, [string]$Label) {
  $name = [string]$Entry.DisplayName
  Write-Log "${Label}: uninstalling $name"
  $guid = [string]$Entry.PSChildName
  if ($guid -match '^\{[0-9A-Fa-f-]{36}\}$') {
    $p = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/x", $guid, "/qn", "/norestart") -Wait -PassThru
    Write-Log "${Label}: msiexec exit=$($p.ExitCode) ($name)"
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 1605 -and $p.ExitCode -ne 3010) {
      $script:HadWarning = $true
    }
    return
  }
  $us = [string]$Entry.UninstallString
  if (-not $us) {
    Write-Log "${Label}: no UninstallString for $name"
    $script:HadWarning = $true
    return
  }
  if ($us -match '(?i)MsiExec\.exe\s+/[IX](\{[0-9A-Fa-f-]+\})') {
    $msiGuid = $Matches[1]
    $p = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/x", $msiGuid, "/qn", "/norestart") -Wait -PassThru
    Write-Log "${Label}: msiexec exit=$($p.ExitCode) ($name)"
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 1605 -and $p.ExitCode -ne 3010) {
      $script:HadWarning = $true
    }
    return
  }
  if ($us -match '(?i)uninstall-postgresql') {
    $exe = $us.Trim().Trim('"')
    if ($exe -match '^"([^"]+)"') { $exe = $Matches[1] }
    elseif ($exe -match '^(\S+\.exe)') { $exe = $Matches[1] }
    if (Test-Path -LiteralPath $exe) {
      Write-Log "${Label}: $exe --mode unattended"
      $p = Start-Process -FilePath $exe -ArgumentList @("--mode", "unattended") -Wait -PassThru
      Write-Log "${Label}: unattended exit=$($p.ExitCode)"
      return
    }
  }
  Write-Log "${Label}: running UninstallString (quiet flags): $us"
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $us, "/S", "/quiet", "/qn", "/norestart") -Wait -PassThru -WindowStyle Hidden
  Write-Log "${Label}: uninstall exit=$($p.ExitCode) ($name)"
}

function Stop-NamedService([string]$Name) {
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return $false }
  Write-Log "service: stopping $Name (status=$($svc.Status))"
  try {
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    }
  } catch { }
  $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($nssm) {
    & nssm.exe stop $Name 2>$null | Out-Null
    & nssm.exe remove $Name confirm 2>$null | Out-Null
    Write-Log "service: nssm remove $Name"
  }
  & sc.exe stop $Name | Out-Null
  Start-Sleep -Milliseconds 400
  & sc.exe delete $Name | Out-Null
  Write-Log "service: sc delete $Name"
  return $true
}

Request-Admin

if (-not $DahRoot) {
  if ($env:DAH_ROOT) { $DahRoot = $env:DAH_ROOT }
  else { $DahRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
}
$DahRoot = (Resolve-Path -LiteralPath $DahRoot).Path

$statePath = Join-Path $DahRoot "logs\native-windows\install-state.json"
$state = $null
if (Test-Path -LiteralPath $statePath) {
  try { $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $state = $null }
}
if ($state -and $state.taskName) { $TaskName = [string]$state.taskName }

$envMap = Get-EnvMap (Join-Path $DahRoot ".env")
if ($WebPort -le 0) {
  if ($state -and $state.webPort) {
    $wp = 0
    if ([int]::TryParse([string]$state.webPort, [ref]$wp) -and $wp -gt 0) { $WebPort = $wp }
  }
  if ($WebPort -le 0 -and $envMap["WEB_PORT"]) {
    $wp = 0
    if ([int]::TryParse($envMap["WEB_PORT"], [ref]$wp) -and $wp -gt 0) { $WebPort = $wp }
  }
  if ($WebPort -le 0) { $WebPort = 3000 }
}

$nginxExe = ""
if ($state -and $state.nginxExe) { $nginxExe = [string]$state.nginxExe }
if (-not $nginxExe -and $env:DAH_NGINX_EXE) { $nginxExe = $env:DAH_NGINX_EXE }
if (-not $nginxExe) {
  foreach ($c in @("C:\nginx\nginx.exe", "C:\tools\nginx\nginx.exe")) {
    if (Test-Path -LiteralPath $c) { $nginxExe = $c; break }
  }
}

Write-Log "=== DAH Windows native uninstall ==="
Write-Log "    DAH_ROOT=$DahRoot"
Write-Log "    WEB_PORT=$WebPort"
Write-Log "    TASK=$TaskName"
Write-Log "    Admin=$(Test-IsAdmin) FullWipe=$FullWipe"
Write-Log "    log=$script:TempLog"

if ($FullWipe -and -not $ConfirmYes) {
  Write-Host ""
  Write-Host "FULL WIPE will remove:"
  Write-Host "  - DAH stack processes, task $TaskName, firewall rules"
  if (-not $SkipOsPackages) {
    Write-Host "  - PostgreSQL Windows product + C:\Program Files\PostgreSQL (if leftover)"
    Write-Host "  - Node.js Windows product"
    if ($nginxExe) { Write-Host "  - nginx prefix of $nginxExe" }
  }
  Write-Host "  - minio-data, tools\minio.exe, logs\native-windows, dah-windows.conf"
  if (-not $SkipDeleteRepo) { Write-Host "  - folder $DahRoot (delayed rmdir after this script exits)" }
  Write-Host ""
  $ans = Read-Host "Type YES to continue"
  if ($ans -ne "YES") {
    Write-Log "Aborted (confirmation was not YES)"
    exit 1
  }
}

# --- 1. Stop stack (reuse existing killer) ---
$stopPs1 = Join-Path $PSScriptRoot "stop-dah-windows-stack.ps1"
if (Test-Path -LiteralPath $stopPs1) {
  Write-Log "==> stop-dah-windows-stack.ps1 -ForcePorts -KillRepoNode"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopPs1 `
    -DahRoot $DahRoot -WebPort $WebPort -ForcePorts -KillRepoNode -AllowPartial
  if ($LASTEXITCODE -ne 0) {
    Write-Log "stop: exit $LASTEXITCODE (continuing uninstall)"
    $script:HadWarning = $true
  }
} else {
  Write-Log "stop: missing $stopPs1"
  $script:HadWarning = $true
}

# --- 2. Scheduled task ---
Write-Log "==> Unregister scheduled task $TaskName"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Log "task: unregistered $TaskName"
} else {
  Write-Log "task: $TaskName not found"
}

# --- 3. Firewall ---
Write-Log "==> Firewall rules"
$fwNames = @("DAH Web $WebPort", "DAH API 3001")
if ($WebPort -ne 3000) { $fwNames += "DAH Web 3000" }
foreach ($n in $fwNames) {
  $rules = @(Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue)
  if ($rules.Count -gt 0) {
    $rules | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Log "firewall: removed $n"
  } else {
    Write-Log "firewall: $n not found"
  }
}

# --- 4. NSSM / Windows services from docs ---
Write-Log "==> Optional DAH Windows services (NSSM)"
$foundSvc = $false
foreach ($svcName in @("DAH-API", "DAH-Worker", "DAH-MinIO", "DAH-Nginx")) {
  if (Stop-NamedService $svcName) { $foundSvc = $true }
}
if (-not $foundSvc) { Write-Log "service: no DAH-* services" }

# --- 5. pm2 ---
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
  Write-Log "==> pm2 apps dah-api / dah-worker"
  & pm2 delete dah-api 2>$null | Out-Null
  & pm2 delete dah-worker 2>$null | Out-Null
  & pm2 save 2>$null | Out-Null
  Write-Log "pm2: deleted dah-api/dah-worker (if they existed)"
} else {
  Write-Log "pm2: not installed"
}

# --- 6. Docker leftover infra (do not uninstall Docker Desktop) ---
if (-not $SkipDocker) {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  $composeFile = Join-Path $DahRoot "docker-compose.yml"
  if ($docker -and (Test-Path -LiteralPath $composeFile)) {
    Write-Log "==> docker compose stop postgres minio redis"
    Push-Location $DahRoot
    try {
      & docker compose stop postgres minio redis 2>$null | Out-Null
    } catch {
      Write-Log "docker: stop failed (ignored)"
    }
    Pop-Location
  } else {
    Write-Log "docker: skipped (no docker or no compose file)"
  }
}

# --- 7. Full wipe ---
if ($FullWipe) {
  Write-Log "==> FullWipe data under repo"
  $minioData = Join-Path $DahRoot "minio-data"
  Remove-TreeSafe $minioData "minio-data"
  Remove-TreeSafe (Join-Path $DahRoot "tools\minio.exe") "minio.exe"
  Remove-TreeSafe (Join-Path $DahRoot "infra\nginx\dah-windows.conf") "nginx-conf"
  Remove-TreeSafe (Join-Path $DahRoot "logs\native-windows") "logs"

  if (-not $SkipOsPackages) {
    Write-Log "==> PostgreSQL Windows product"
    Get-Service -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "postgresql*" } |
      ForEach-Object {
        Write-Log "postgres-svc: stop $($_.Name)"
        try { Stop-Service -Name $_.Name -Force -ErrorAction SilentlyContinue } catch { }
        try { Set-Service -Name $_.Name -StartupType Disabled -ErrorAction SilentlyContinue } catch { }
      }
    Get-Process -Name "postgres" -ErrorAction SilentlyContinue | ForEach-Object {
      try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    $pgEntries = @(Get-UninstallEntries "(?i)PostgreSQL")
    if ($pgEntries.Count -eq 0) {
      Write-Log "postgres: no uninstall registry entry (remove via Apps & Features if still installed)"
    } else {
      foreach ($e in $pgEntries) { Invoke-UninstallEntry $e "postgres" }
    }
    Start-Sleep -Seconds 2
    Remove-TreeSafe "C:\Program Files\PostgreSQL" "postgres-leftover"

    Write-Log "==> Node.js Windows product"
    Write-Log "node: if this script was started via npm, node.exe may be in use; Apps & Features if msiexec fails"
    $nodeEntries = @(Get-UninstallEntries "(?i)^Node\.js")
    if ($nodeEntries.Count -eq 0) {
      Write-Log "node: no uninstall registry entry (remove via Apps & Features if still installed)"
    } else {
      foreach ($e in $nodeEntries) { Invoke-UninstallEntry $e "node" }
    }

    if ($nginxExe -and (Test-Path -LiteralPath $nginxExe)) {
      $prefix = Split-Path -Parent $nginxExe
      Write-Log "==> nginx prefix $prefix"
      Get-Process -Name "nginx" -ErrorAction SilentlyContinue | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { }
      }
      Remove-TreeSafe $prefix "nginx"
    } else {
      Write-Log "nginx: no known prefix"
    }
  } else {
    Write-Log "OS packages skipped (-SkipOsPackages)"
  }

  if (-not $SkipDeleteRepo) {
    Write-Log "==> Schedule delayed rmdir of $DahRoot"
    if (-not (Test-SafeToDelete $DahRoot)) {
      Write-Log "repo: REFUSED delayed delete of $DahRoot"
      $script:HadWarning = $true
    } else {
      $wipeCmd = Join-Path $env:TEMP "dah-wipe-repo.cmd"
      $wipeLog = Join-Path $env:TEMP "dah-wipe-repo.log"
      $rootEsc = $DahRoot
      $cmd = @"
@echo off
set LOG=$wipeLog
echo start %DATE% %TIME% repo=$rootEsc> "%LOG%"
set /a N=0
:loop
set /a N+=1
timeout /t 8 /nobreak >nul
if exist "$rootEsc" (
  rmdir /s /q "$rootEsc" >> "%LOG%" 2>&1
)
if exist "$rootEsc" (
  echo retry %N% still exists>> "%LOG%"
  if %N% LSS 8 goto loop
  echo FAILED still exists $rootEsc>> "%LOG%"
  exit /b 1
)
echo done %DATE% %TIME%>> "%LOG%"
exit /b 0
"@
      Set-Content -LiteralPath $wipeCmd -Value $cmd -Encoding ASCII
      Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $wipeCmd) -WindowStyle Hidden
      Write-Log "repo: helper $wipeCmd (log $wipeLog)"
      Write-Log "repo: close IDE / Explorer windows on $DahRoot so rmdir can finish"
    }
  } else {
    Write-Log "repo folder kept (-SkipDeleteRepo)"
  }
}

# --- 8. Checklist ---
Write-Host ""
Write-Log "==> Checklist"
$taskLeft = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Write-Log ("    task {0}: {1}" -f $TaskName, $(if ($taskLeft) { "STILL PRESENT" } else { "gone" }))
if ($taskLeft) { $script:HadWarning = $true }

foreach ($port in @($WebPort, 3001, 9000, 9001)) {
  $listening = $false
  try {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($c) { $listening = $true }
  } catch { }
  Write-Log ("    port {0}: {1}" -f $port, $(if ($listening) { "STILL LISTENING" } else { "free" }))
}

$pgSvc = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "postgresql*" })
if ($pgSvc.Count -gt 0) {
  $names = ($pgSvc | ForEach-Object { $_.Name + "=" + $_.Status }) -join ", "
  Write-Log "    postgres services: $names"
} else {
  Write-Log "    postgres services: none"
}

Write-Host ""
Write-Log "Docs: docs\NATIVE-HOST-WINDOWS.md"
if (-not $FullWipe) {
  Write-Log "Stack only. For machine wipe: npm run uninstall:native:win -- -FullWipe -ConfirmYes"
}
if ($FullWipe -and -not $SkipDeleteRepo) {
  Write-Log "If $DahRoot is still there after ~1 min, close handles and see $env:TEMP\dah-wipe-repo.log"
}
Write-Log "KeenDNS / router port-forward is NOT removed - do that on the Keenetic UI if needed."

if ($script:HadWarning) {
  Write-Log "=== uninstall finished with warnings (see $script:TempLog) ==="
  exit 0
}
Write-Log "=== uninstall finished ==="
exit 0
