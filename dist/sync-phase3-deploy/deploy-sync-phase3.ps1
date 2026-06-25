# Deploy Phase 3 sync API changes to the master server.
# Run this ON the master machine (172.16.10.124) from an elevated PowerShell prompt.
#
# Usage:
#   cd "C:\IBS APP"
#   .\scripts\deploy-sync-phase3.ps1
#
# Optional: copy from another folder first
#   .\scripts\deploy-sync-phase3.ps1 -SourceRoot "D:\staging\IBS APP"

param(
    [string]$SourceRoot = $PSScriptRoot + "\..",
    [string]$DestRoot = "C:\IBS APP",
    [string]$ServiceName = "CabinetPMSyncAPI",
    [int]$Port = 3090
)

$ErrorActionPreference = "Stop"
$SourceRoot = (Resolve-Path $SourceRoot).Path
$DestRoot = $DestRoot.TrimEnd('\')

$paths = @(
    "sync-server",
    "backend\services\sync-client.js",
    "backend\services\enhanced-merge-replication.js",
    "backend\services\sync-tables.js"
)

Write-Host "Phase 3 deploy: $SourceRoot -> $DestRoot"

foreach ($rel in $paths) {
    $src = Join-Path $SourceRoot $rel
    $dst = Join-Path $DestRoot $rel
    if (-not (Test-Path $src)) {
        throw "Missing source: $src"
    }
    if (Test-Path $src -PathType Container) {
        if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Force -Path $dst | Out-Null }
        robocopy $src $dst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $rel (exit $LASTEXITCODE)" }
    } else {
        $parent = Split-Path $dst -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Copy-Item -Force $src $dst
    }
    Write-Host "  copied $rel"
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Warning "Service '$ServiceName' not found. Start sync-server manually to verify."
} else {
    Restart-Service $ServiceName
    Start-Sleep -Seconds 3
    Write-Host "  restarted $ServiceName ($($svc.Status))"
}

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 15
Write-Host "Health: $($health.status) mongo=$($health.mongo) version=$($health.server_version)"

try {
    $probe = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/sync/registry-table/sys_ams_systems?skip=0&limit=1" -TimeoutSec 15
    Write-Host "Registry-table endpoint: OK (total=$($probe.total))"
} catch {
    throw "Registry-table endpoint failed: $($_.Exception.Message)"
}

Write-Host "Deploy complete."
