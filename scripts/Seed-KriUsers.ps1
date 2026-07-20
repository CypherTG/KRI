[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,

  [string]$UsersListTitle = 'KRI_Users',

  [switch]$OverwriteExisting,

  [string]$ReportPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Module {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Module -ListAvailable -Name $Name)) {
    $root = Split-Path -Parent $PSScriptRoot
    $local = Join-Path $root ".psmodules\$Name"
    if (Test-Path -LiteralPath $local) {
      try {
        $manifest = Get-ChildItem -LiteralPath $local -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($manifest) {
          Import-Module $manifest -Force -ErrorAction Stop
        } else {
          Import-Module $local -Force -ErrorAction Stop
        }
        return
      } catch {
        $legacy = Join-Path $root '.psmodules\SharePointPnPPowerShellOnline'
        if ($Name -eq 'PnP.PowerShell' -and (Test-Path -LiteralPath $legacy)) {
          $legacyManifest = Get-ChildItem -LiteralPath $legacy -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
          if ($legacyManifest) {
            Import-Module $legacyManifest -Force -ErrorAction Stop
          } else {
            Import-Module $legacy -Force -ErrorAction Stop
          }
          return
        }
        throw
      }
    }

    if ($Name -eq 'PnP.PowerShell') {
      $legacy = Join-Path (Split-Path -Parent $PSScriptRoot) '.psmodules\SharePointPnPPowerShellOnline'
      if (Test-Path -LiteralPath $legacy) {
        $legacyManifest = Get-ChildItem -LiteralPath $legacy -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($legacyManifest) {
          Import-Module $legacyManifest -Force
        } else {
          Import-Module $legacy -Force
        }
        return
      }
    }

    throw "Module '$Name' not available."
  }
}

function Get-FieldMap {
  param([Parameter(Mandatory = $true)][string]$ListTitle)

  $fields = Get-PnPField -List $ListTitle
  $map = @{}
  foreach ($field in $fields) {
    $map[$field.InternalName] = $field.TypeAsString
  }
  return $map
}

function Normalize-Text {
  param($Value)
  if ($null -eq $Value) { return '' }
  return "$Value".Trim()
}

function Normalize-Family {
  param(
    [string]$DisplayName,
    [string]$Email,
    [string]$LoginName,
    [string]$Title,
    [string]$Department
  )

  $haystack = @(
    Normalize-Text $DisplayName
    Normalize-Text $Email
    Normalize-Text $LoginName
    Normalize-Text $Title
    Normalize-Text $Department
  ) -join ' '

  $haystack = $haystack.ToLowerInvariant()
  if ($haystack -match 'konstructum') { return 'Konstructum' }
  if ($haystack -match 'pmt7|pmt 7|integrated') { return 'PMT7 Integrated' }
  if ($haystack -match 'interkonstruct|inter construct|interkonstr') { return 'Interkonstruct' }
  return ''
}

function Is-SystemUser {
  param($User)

  $login = Normalize-Text $User.LoginName
  $email = Normalize-Text $User.Email
  $title = Normalize-Text $User.Title

  if (-not $title) { return $true }
  if ($login -match 'sharepoint|system|app@sharepoint|spo-grid-all-users') { return $true }
  if ($login -match '#ext#') { return $true }
  if ($email -match 'no-reply|noreply|sharepoint|system') { return $true }
  return $false
}

function Format-JoinDate {
  param($User)

  if ($User.Created -and $User.Created -is [datetime]) {
    return $User.Created.ToString('o')
  }
  return (Get-Date).ToString('o')
}

function Get-ExistingKeys {
  param([string]$ListTitle)

  $items = Get-PnPListItem -List $ListTitle -PageSize 2000
  $keys = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($item in $items) {
    $email = Normalize-Text $item.FieldValues['UserAccount']
    if (-not $email -and $item.FieldValues['UserAccount']) {
      $email = Normalize-Text $item.FieldValues['UserAccount'].Email
    }
    if (-not $email) {
      $email = Normalize-Text $item.FieldValues['Title']
    }
    if ($email) { [void]$keys.Add($email.ToLowerInvariant()) }
  }
  return $keys
}

function Write-Report {
  param([string]$Path, [object[]]$Rows)

  if (-not $Path -or $Rows.Count -eq 0) { return }
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $Rows | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding UTF8
}

Ensure-Module -Name 'PnP.PowerShell'
Ensure-Module -Name 'ImportExcel'

try {
  Connect-PnPOnline -Url $SiteUrl -Interactive
} catch {
  Connect-PnPOnline -Url $SiteUrl -UseWebLogin
}

$fieldMap = Get-FieldMap -ListTitle $UsersListTitle
$existingKeys = Get-ExistingKeys -ListTitle $UsersListTitle
$siteUsers = Get-PnPUser
$created = 0
$updated = 0
$skipped = New-Object System.Collections.Generic.List[object]

foreach ($user in $siteUsers) {
  if (Is-SystemUser $user) { continue }

  $family = Normalize-Family -DisplayName $user.Title -Email $user.Email -LoginName $user.LoginName -Title $user.Title -Department $user.Department
  if (-not $family) {
    $skipped.Add([pscustomobject]@{
      Title = $user.Title
      Email = $user.Email
      LoginName = $user.LoginName
      Reason = 'Could not infer family'
    }) | Out-Null
    continue
  }

  $key = (Normalize-Text $user.Email).ToLowerInvariant()
  if (-not $key) {
    $key = (Normalize-Text $user.LoginName).ToLowerInvariant()
  }
  if (-not $key) {
    $key = (Normalize-Text $user.Title).ToLowerInvariant()
  }

  $payload = [ordered]@{
    Title = Normalize-Text $user.Title
  }

  if ($fieldMap.ContainsKey('UserAccount')) {
    if ($fieldMap['UserAccount'] -match 'User|Person') {
      $payload.UserAccount = $user
    } else {
      $payload.UserAccount = $user.Email
    }
  }

  if ($fieldMap.ContainsKey('Department')) { $payload.Department = $family }
  if ($fieldMap.ContainsKey('JobTitle') -and (Normalize-Text $user.JobTitle)) { $payload.JobTitle = Normalize-Text $user.JobTitle }
  if ($fieldMap.ContainsKey('TargetClients')) { $payload.TargetClients = 0 }
  if ($fieldMap.ContainsKey('TargetDeals')) { $payload.TargetDeals = 0 }
  if ($fieldMap.ContainsKey('IsActive')) { $payload.IsActive = $true }
  if ($fieldMap.ContainsKey('JoinDate')) { $payload.JoinDate = Format-JoinDate $user }
  if ($fieldMap.ContainsKey('ProfilePhoto')) { $payload.ProfilePhoto = '' }

  if ($existingKeys.Contains($key) -and -not $OverwriteExisting) {
    $skipped.Add([pscustomobject]@{
      Title = $user.Title
      Email = $user.Email
      LoginName = $user.LoginName
      Reason = 'Already exists'
    }) | Out-Null
    continue
  }

  if ($existingKeys.Contains($key) -and $OverwriteExisting) {
    $existing = Get-PnPListItem -List $UsersListTitle -PageSize 1 | Where-Object {
      Normalize-Text $_.FieldValues['Title'] -eq Normalize-Text $user.Title
    } | Select-Object -First 1
    if ($existing) {
      Set-PnPListItem -List $UsersListTitle -Identity $existing.Id -Values $payload | Out-Null
      $updated++
      continue
    }
  }

  Add-PnPListItem -List $UsersListTitle -Values $payload | Out-Null
  $created++
  [void]$existingKeys.Add($key)
}

if ($ReportPath) {
  Write-Report -Path $ReportPath -Rows $skipped.ToArray()
}

Write-Host "Seeded $created user(s) into $UsersListTitle."
Write-Host "Updated $updated user(s)."
Write-Host "Skipped $($skipped.Count) user(s)."
