$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$kairosWeb = Join-Path $root 'kairos-web'
$gemsWeb = Join-Path $root 'gems-web'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Launching KAIROS Web (4321) and GEMS Web (4322)         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$kairosWeb'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$gemsWeb'; npm run dev"

Write-Host ""
Write-Host "  KAIROS Web : http://localhost:4321" -ForegroundColor Green
Write-Host "  GEMS Web   : http://localhost:4322" -ForegroundColor Green
Write-Host ""

