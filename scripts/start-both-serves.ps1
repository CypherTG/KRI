$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$kairos = Join-Path $root 'kri-platform'
$gems = Join-Path $root 'gems'
$logDir = Join-Path $root 'temp\serve-logs'
$kairosPort = 4321
$gemsPort = 4322

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Get-PortListenerPids {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $pids = New-Object System.Collections.Generic.List[int]

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop |
      Where-Object { $_.State -eq 'Listen' -or $_.State -eq 'Bound' }
    foreach ($connection in $connections) {
      if ($connection.OwningProcess -gt 0) {
        [void]$pids.Add([int]$connection.OwningProcess)
      }
    }
  } catch {
    # Fall back to netstat below on older hosts or restricted shells.
  }

  $netstatLines = & netstat -ano -p tcp 2>$null | Select-String -SimpleMatch ":$Port"
  foreach ($line in $netstatLines) {
    $text = $line.Line.Trim()
    if ($text -match 'LISTENING\s+(\d+)\s*$') {
      [void]$pids.Add([int]$Matches[1])
    }
  }

  $pids | Sort-Object -Unique
}

function Stop-ProjectServeProcesses {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectDir,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $escapedProject = [regex]::Escape($ProjectDir)
  $candidates = Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $escapedProject -and
      $_.CommandLine -match '(gulp|spfx|serve|node_modules)' -and
      $_.ProcessId -ne $PID
    }

  foreach ($process in $candidates) {
    Write-Host "Stopping stale $Name serve process (PID $($process.ProcessId))"
    try {
      & taskkill /PID $process.ProcessId /T /F | Out-Null
    } catch {
      try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      } catch {
        Write-Host "Could not stop stale $Name process PID $($process.ProcessId)"
      }
    }
  }
}

function Wait-PortFree {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  for ($attempt = 0; $attempt -lt 15; $attempt += 1) {
    if (@(Get-PortListenerPids -Port $Port).Count -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Port $Port is still in use after cleanup."
}

function Assert-PortFree {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $listenerPids = @(Get-PortListenerPids -Port $Port)
  if ($listenerPids.Count -gt 0) {
    $details = $listenerPids | ForEach-Object {
      $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
      if ($process) {
        "$_ ($($process.ProcessName))"
      } else {
        "$_"
      }
    }
    throw "$Name cannot start because port $Port is still occupied by: $($details -join ', ')"
  }
}

function Stop-PortListener {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $listenerPids = @(Get-PortListenerPids -Port $Port)
  foreach ($processId in $listenerPids) {
    Write-Host "Stopping stale listener on port $Port (PID $processId)"
    try {
      & taskkill /PID $processId /T /F | Out-Null
    } catch {
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch {
        Write-Host "Could not stop PID $processId on port $Port"
      }
    }
  }

  if ($listenerPids.Count -gt 0) {
    Wait-PortFree -Port $Port
  }
}

function Invoke-TrustedCert {
  param(
    [Parameter(Mandatory = $true)][string]$WorkDir,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Path $WorkDir)) {
    throw "Missing project folder: $WorkDir"
  }

  $gulpCmd = Join-Path $WorkDir 'node_modules\.bin\gulp.cmd'
  if (-not (Test-Path $gulpCmd)) {
    throw "Missing gulp executable: $gulpCmd"
  }

  Write-Host "Trusting dev cert for $Name ..."
  Push-Location $WorkDir
  try {
    & $gulpCmd trust-dev-cert
  } finally {
    Pop-Location
  }
}

function Remove-GeneratedArtifacts {
  param(
    [Parameter(Mandatory = $true)][string]$WorkDir,
    [Parameter(Mandatory = $true)][string]$Name
  )

  foreach ($folderName in @('dist', 'temp')) {
    $target = Join-Path $WorkDir $folderName
    if (Test-Path -LiteralPath $target) {
      Write-Host "Cleaning $Name $folderName ..."
      Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-SpfxJob {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$WorkDir
  )

  $gulpCmd = Join-Path $WorkDir 'node_modules\.bin\gulp.cmd'
  if (-not (Test-Path $gulpCmd)) {
    throw "Missing gulp executable: $gulpCmd"
  }

  Start-Job -Name $Name -ScriptBlock {
    param($projectDir, $gulpPath, $jobName)
    Set-Location -LiteralPath $projectDir
    & $gulpPath serve --nobrowser 2>&1 | ForEach-Object {
      [pscustomobject]@{
        Name = $jobName
        Text = ($_ | Out-String).TrimEnd()
      }
    }
  } -ArgumentList $WorkDir, $gulpCmd, $Name
}

Stop-ProjectServeProcesses -ProjectDir $kairos -Name 'KAIROS'
Stop-ProjectServeProcesses -ProjectDir $gems -Name 'GEMS'
Stop-PortListener -Port $kairosPort
Stop-PortListener -Port $gemsPort
Assert-PortFree -Port $kairosPort -Name 'KAIROS'
Assert-PortFree -Port $gemsPort -Name 'GEMS'

Remove-GeneratedArtifacts -WorkDir $kairos -Name 'KAIROS'
Remove-GeneratedArtifacts -WorkDir $gems -Name 'GEMS'

Invoke-TrustedCert -WorkDir $kairos -Name 'KAIROS'
Invoke-TrustedCert -WorkDir $gems -Name 'GEMS'

Assert-PortFree -Port $kairosPort -Name 'KAIROS'
$kairosJob = Start-SpfxJob -Name 'KAIROS' -WorkDir $kairos
Start-Sleep -Seconds 2

Assert-PortFree -Port $gemsPort -Name 'GEMS'
$gemsJob = Start-SpfxJob -Name 'GEMS' -WorkDir $gems

$jobs = @($kairosJob, $gemsJob)

$ready = @{
  KAIROS = $false
  GEMS = $false
}

Write-Host ''
Write-Host "Serving KAIROS on $kairosPort and GEMS on $gemsPort..."
Write-Host 'Watching build output below. Wait for both "Server started" and "webpack" ready messages.'
Write-Host ''

$kairosManifest = Join-Path $kairos 'temp\manifests.js'
$gemsManifest = Join-Path $gems 'temp\manifests.js'

while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -gt 0) {
  foreach ($job in $jobs) {
    $items = Receive-Job -Job $job -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      $text = if ($item -is [string]) { $item } else { $item.Text }
      if ([string]::IsNullOrWhiteSpace($text)) {
        continue
      }

      Write-Host "[$($job.Name)] $text"

      if ($job.Name -eq 'KAIROS' -and ($text -match "Finished subtask '(webpack|reload)'" -or (Test-Path $kairosManifest))) {
        if (Test-Path $kairosManifest) {
          $ready['KAIROS'] = $true
        }
      }
      if ($job.Name -eq 'GEMS' -and ($text -match "Finished subtask '(webpack|reload)'" -or (Test-Path $gemsManifest))) {
        if (Test-Path $gemsManifest) {
          $ready['GEMS'] = $true
        }
      }
    }
  }

  foreach ($job in $jobs | Where-Object { $_.State -ne 'Running' -and -not $ready[$_.Name] }) {
    throw "$($job.Name) serve stopped before becoming ready. Review the log above for the underlying gulp error."
  }

  if ($ready.KAIROS -and $ready.GEMS) {
    Write-Host ''
    Write-Host 'Both KAIROS and GEMS manifests and bundles are compiled and ready.'
    break
  }

  Start-Sleep -Seconds 1
}

$kairosWorkbench = 'https://netorgft13110820.sharepoint.com/sites/KONSTRUCTUM/_layouts/15/workbench.aspx?loadSPFX=true&debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fmanifests.js'
$gemsWorkbench = 'https://netorgft13110820.sharepoint.com/sites/KONSTRUCTUM/_layouts/15/workbench.aspx?loadSPFX=true&debugManifestsFile=https%3A%2F%2Flocalhost%3A4322%2Ftemp%2Fmanifests.js'

Write-Host ''
Write-Host 'Opening SharePoint workbench tabs:'
Write-Host $kairosWorkbench
Write-Host $gemsWorkbench
Start-Process $kairosWorkbench
Start-Process $gemsWorkbench
Write-Host ''
Write-Host 'Keep this terminal open. Use Ctrl+C to stop both jobs.'

while ($true) {
  foreach ($job in $jobs) {
    $items = Receive-Job -Job $job -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      $text = if ($item -is [string]) { $item } else { $item.Text }
      if ([string]::IsNullOrWhiteSpace($text)) {
        continue
      }
      Write-Host "[$($job.Name)] $text"
    }
  }
  Start-Sleep -Seconds 2
}
