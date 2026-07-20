[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,

  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [string]$WorksheetName = 'KRI-2025',

  [string[]]$ListsToPurge = @(
    'KRI_StageHistory',
    'KRI_Communications',
    'KRI_Engagements',
    'KRI_Automations',
    'KRI_Clients',
    'KRI_Users'
  ),

  [switch]$PurgeAll,

  [switch]$CreateStageHistory = $true,

  [string]$BusinessArmMapPath = '',

  [string]$UnmappedContactsReportPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Module {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Module -ListAvailable -Name $Name)) {
    $localModulePath = Join-Path (Split-Path -Parent $PSScriptRoot) ".psmodules\$Name"
    if (Test-Path -LiteralPath $localModulePath) {
      try {
        $manifest = Get-ChildItem -LiteralPath $localModulePath -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($manifest) {
          Import-Module $manifest -Force -ErrorAction Stop
        } else {
          Import-Module $localModulePath -Force -ErrorAction Stop
        }
        return
      } catch {
        if ($Name -eq 'PnP.PowerShell') {
          $legacyModulePath = Join-Path (Split-Path -Parent $PSScriptRoot) '.psmodules\SharePointPnPPowerShellOnline'
          if (Test-Path -LiteralPath $legacyModulePath) {
            $legacyManifest = Get-ChildItem -LiteralPath $legacyModulePath -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty FullName
            if ($legacyManifest) {
              Import-Module $legacyManifest -Force -ErrorAction Stop
            } else {
              Import-Module $legacyModulePath -Force -ErrorAction Stop
            }
            return
          }
        }
        throw
      }
    }

    if ($Name -eq 'PnP.PowerShell') {
      $legacyModulePath = Join-Path (Split-Path -Parent $PSScriptRoot) '.psmodules\SharePointPnPPowerShellOnline'
      if (Test-Path -LiteralPath $legacyModulePath) {
        $legacyManifest = Get-ChildItem -LiteralPath $legacyModulePath -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($legacyManifest) {
          Import-Module $legacyManifest -Force
        } else {
          Import-Module $legacyModulePath -Force
        }
        return
      }
    }

    throw "Required module '$Name' is not installed. Install it first, or place it in .psmodules, then rerun this script."
  }
}

function Get-CellValue {
  param(
    [Parameter(Mandatory = $true)]
    $Row,

    [Parameter(Mandatory = $true)]
    [string[]]$Names
  )

  foreach ($name in $Names) {
    $prop = $Row.PSObject.Properties[$name]
    if ($null -ne $prop) {
      $value = $prop.Value
      if ($null -ne $value -and "$value".Trim() -ne '') {
        return "$value".Trim()
      }
    }
  }

  return ''
}

function Join-NonEmpty {
  param(
    [string[]]$Parts,
    [string]$Separator = ' | '
  )

  return (($Parts | Where-Object { $_ -and $_.Trim() -ne '' }) -join $Separator)
}

function Normalize-Stage {
  param([string]$Value)

  $safeValue = if ($null -eq $Value) { '' } else { "$Value".Trim() }
  switch -Regex ($safeValue) {
    '^knowledge$' { return 'Knowledge' }
    '^rapport$' { return 'Rapport' }
    '^intimacy$' { return 'Intimacy' }
    default { return '' }
  }
}

function Get-FieldMap {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ListTitle
  )

  $fields = Get-PnPField -List $ListTitle
  $map = @{}
  foreach ($field in $fields) {
    $map[$field.InternalName] = $field.TypeAsString
  }
  return $map
}

function Ensure-ClientImportFields {
  param([Parameter(Mandatory = $true)][string]$ListTitle)

  $fields = Get-FieldMap -ListTitle $ListTitle
  if (-not $fields.ContainsKey('SourceRecordId')) {
    Add-PnPField -List $ListTitle -DisplayName 'Source Record ID' -InternalName 'SourceRecordId' -Type Text -AddToDefaultView:$false | Out-Null
  }
  if (-not $fields.ContainsKey('SourcePhoneNumber')) {
    Add-PnPField -List $ListTitle -DisplayName 'Source Phone Number' -InternalName 'SourcePhoneNumber' -Type Text -AddToDefaultView:$false | Out-Null
  }
}

function Test-UserFieldType {
  param([string]$TypeAsString)
  return $TypeAsString -in @('User', 'UserMulti', 'Person', 'PersonMulti')
}

function Test-MultiChoiceFieldType {
  param([string]$TypeAsString)
  return $TypeAsString -in @('MultiChoice', 'ChoiceMulti')
}

function Test-UrlFieldType {
  param([string]$TypeAsString)
  return $TypeAsString -eq 'URL'
}

function Test-TextLikeFieldType {
  param([string]$TypeAsString)
  return $TypeAsString -in @('Text', 'Note', 'Choice', 'MultiChoice', 'Calculated', 'Number', 'Currency', 'DateTime', 'Boolean')
}

function Format-SourceRowSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    $Row
  )

  $parts = @()
  foreach ($prop in $Row.PSObject.Properties) {
    $value = $prop.Value
    if ($null -ne $value -and "$value".Trim() -ne '') {
      $parts += "$($prop.Name): $($value.ToString().Trim())"
    } else {
      $parts += "$($prop.Name):"
    }
  }

  return ($parts -join "`r`n")
}

function Resolve-SocialUrl {
  param(
    [string]$FieldName,
    [string]$Value
  )

  $safeValue = if ($null -eq $Value) { '' } else { "$Value".Trim() }
  if (-not $safeValue) {
    return ''
  }

  if ($safeValue -match '^https?://') {
    return $safeValue
  }

  switch -Regex ($FieldName) {
    'LinkedIn' {
      if ($safeValue -match 'linkedin\.com') {
        return "https://$safeValue"
      }
    }
    'Instagram' {
      $handle = $safeValue.TrimStart('@')
      if ($handle) {
        return "https://instagram.com/$handle"
      }
    }
  }

  return ''
}

function Remove-ListItems {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ListTitle
  )

  $items = @((Get-PnPListItem -List $ListTitle -PageSize 2000))
  if (-not $items) {
    Write-Host "No items to remove from $ListTitle"
    return
  }

  Write-Host "Purging $($items.Count) items from $ListTitle"
  foreach ($item in $items) {
    Remove-PnPListItem -List $ListTitle -Identity $item.Id -Force
  }
}

function Read-BusinessArmMap {
  param([string]$Path)

  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return @{}
  }

  $json = Get-Content -LiteralPath $Path -Raw
  $data = $json | ConvertFrom-Json
  $map = @{}

  foreach ($entry in $data.PSObject.Properties) {
    $key = "$($entry.Name)".Trim().ToLowerInvariant()
    if ($entry.Value -is [System.Array]) {
      $map[$key] = @($entry.Value | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    } else {
      $map[$key] = @("$($entry.Value)".Trim()) | Where-Object { $_ }
    }
  }

  return $map
}

function Resolve-BusinessArms {
  param(
    [string]$CompanyName,
    [hashtable]$ArmMap
  )

  $key = "$CompanyName".Trim().ToLowerInvariant()
  if ($key -and $ArmMap.ContainsKey($key)) {
    return @($ArmMap[$key])
  }

  return @()
}

function Resolve-NameParts {
  param(
    [string]$FirstName,
    [string]$LastName
  )

  $safeFirst = if ($null -eq $FirstName) { '' } else { "$FirstName".Trim() }
  $safeLast = if ($null -eq $LastName) { '' } else { "$LastName".Trim() }

  if ($safeLast) {
    return @{
      FirstName = $safeFirst
      LastName  = $safeLast
    }
  }

  if (-not $safeFirst) {
    return @{
      FirstName = ''
      LastName  = ''
    }
  }

  $parts = $safeFirst -split '\s+'
  if ($parts.Count -gt 1) {
    $resolvedFirst = ($parts[0..($parts.Count - 2)] -join ' ').Trim()
    $resolvedLast = $parts[-1].Trim()
    return @{
      FirstName = $resolvedFirst
      LastName  = $resolvedLast
    }
  }

  return @{
    FirstName = $safeFirst
    LastName  = $safeFirst
  }
}

function Resolve-PhoneNumber {
  param(
    [Parameter(Mandatory = $true)]
    $Row
  )

  $candidate = Get-CellValue -Row $Row -Names @('Phone Number', 'Phone', 'Mobile', 'Telephone', 'Tel')
  if ($candidate) {
    return $candidate
  }

  $recordId = Get-CellValue -Row $Row -Names @('Record ID', 'RecordID')
  if (-not $recordId) {
    return ''
  }

  $digits = ($recordId -replace '[^\d+]', '').Trim()
  if ($digits -match '^\+?\d{10,15}$') {
    return $digits
  }

  if ($recordId -match '^\d{10,15}$') {
    return $recordId
  }

  return ''
}

function Build-ClientValues {
  param(
    [Parameter(Mandatory = $true)]
    $Row,

    [Parameter(Mandatory = $true)]
    [hashtable]$FieldMap,

    [hashtable]$BusinessArmMap = @{}
  )

  $recordId = Get-CellValue -Row $Row -Names @('Record ID', 'RecordID')
  $firstName = Get-CellValue -Row $Row -Names @('First Name', 'FirstName')
  $lastName = Get-CellValue -Row $Row -Names @('Last Name', 'LastName')
  $resolvedName = Resolve-NameParts -FirstName $firstName -LastName $lastName
  $firstName = $resolvedName.FirstName
  $lastName = $resolvedName.LastName
  $companyName = Get-CellValue -Row $Row -Names @('Company Name', 'CompanyName')
  $jobTitle = Get-CellValue -Row $Row -Names @('Job Title', 'JobTitle')
  $email = Get-CellValue -Row $Row -Names @('Email')
  $gender = Get-CellValue -Row $Row -Names @('Gender')
  $kri = Normalize-Stage (Get-CellValue -Row $Row -Names @('KRI'))
  $projectName = Get-CellValue -Row $Row -Names @('Project Name', 'ProjectName')
  $primaryContact = Get-CellValue -Row $Row -Names @('KRI Primary Contact', 'KRIPrimaryContact')
  $secondaryContact = Get-CellValue -Row $Row -Names @('KRI Secondary Contact', 'KRISecondaryContact')
  $phone = Resolve-PhoneNumber -Row $Row
  $instagram = Get-CellValue -Row $Row -Names @('Instagram account', 'Instagram Account', 'InstagramHandle')
  $linkedin = Get-CellValue -Row $Row -Names @('LinkedIn URL', 'LinkedIn Url', 'LinkedInProfile')
  $businessArms = Resolve-BusinessArms -CompanyName $companyName -ArmMap $BusinessArmMap
  $sourceSnapshot = Format-SourceRowSnapshot -Row $Row
  $notesParts = @()

  $title = Join-NonEmpty -Parts @(
    (Join-NonEmpty -Parts @($firstName, $lastName) -Separator ' '),
    $companyName,
    $(if ($recordId) { "Record $recordId" } else { '' })
  ) -Separator ' - '

  if (-not $title) {
    $title = 'Imported Registry Contact'
  }

  $values = [ordered]@{
    Title         = $title
  }

  if ($fieldMap.ContainsKey('DateRegistered')) {
    $values.DateRegistered = (Get-Date).ToString('o')
  }
  if ($fieldMap.ContainsKey('IsActive')) {
    $values.IsActive = $true
  }

  if ($fieldMap.ContainsKey('FirstName') -and $firstName) { $values.FirstName = $firstName }
  if ($fieldMap.ContainsKey('LastName') -and $lastName) { $values.LastName = $lastName }
  if ($fieldMap.ContainsKey('CompanyName') -and $companyName) { $values.CompanyName = $companyName }
  if ($fieldMap.ContainsKey('JobTitle') -and $jobTitle) { $values.JobTitle = $jobTitle }
  if ($fieldMap.ContainsKey('Email') -and $email) { $values.Email = $email }
  if ($fieldMap.ContainsKey('Gender') -and $gender) { $values.Gender = $gender }
  if ($fieldMap.ContainsKey('KRIStage') -and $kri) { $values.KRIStage = $kri }
  if ($fieldMap.ContainsKey('ProjectName') -and $projectName) { $values.ProjectName = $projectName }
  if ($fieldMap.ContainsKey('Phone') -and $phone) { $values.Phone = $phone }
  if ($fieldMap.ContainsKey('SourceRecordId') -and $recordId) { $values.SourceRecordId = $recordId }
  if ($fieldMap.ContainsKey('SourcePhoneNumber') -and $phone) { $values.SourcePhoneNumber = $phone }
  if ($fieldMap.ContainsKey('LinkedInURL') -and $linkedin) {
    if (Test-TextLikeFieldType $fieldMap['LinkedInURL']) {
      $values.LinkedInURL = $linkedin
    } elseif (Test-UrlFieldType $fieldMap['LinkedInURL']) {
      $linkedInUrl = Resolve-SocialUrl -FieldName 'LinkedInURL' -Value $linkedin
      if ($linkedInUrl) {
        $values.LinkedInURL = $linkedInUrl
      } else {
        $notesParts += "LinkedInURL (unmapped): $linkedin"
      }
    }
  }
  if ($fieldMap.ContainsKey('InstagramHandle') -and $instagram) {
    if (Test-TextLikeFieldType $fieldMap['InstagramHandle']) {
      $values.InstagramHandle = $instagram
    } elseif (Test-UrlFieldType $fieldMap['InstagramHandle']) {
      $instagramUrl = Resolve-SocialUrl -FieldName 'InstagramHandle' -Value $instagram
      if ($instagramUrl) {
        $values.InstagramHandle = $instagramUrl
      } else {
        $notesParts += "InstagramHandle (unmapped): $instagram"
      }
    }
  }

  $businessArmList = @($businessArms) | Where-Object { $_ -and "$_".Trim() -ne '' }
  if ($fieldMap.ContainsKey('BusinessArm') -and (@($businessArmList).Count -gt 0)) {
    if (Test-MultiChoiceFieldType $fieldMap['BusinessArm']) {
      $values.BusinessArm = @($businessArmList)
    } else {
      $values.BusinessArm = ($businessArmList -join '; ')
    }
  }

  if ($sourceSnapshot) { $notesParts += "Source Snapshot:`r`n$sourceSnapshot" }
  if ($recordId) { $notesParts += "Source Record ID: $recordId" }
  if ($primaryContact) { $notesParts += "Primary Contact: $primaryContact" }
  if ($secondaryContact) { $notesParts += "Secondary Contact: $secondaryContact" }

  if ($fieldMap.ContainsKey('KCCContactPerson') -and $primaryContact) {
    if (Test-TextLikeFieldType $fieldMap['KCCContactPerson']) {
      $values.KCCContactPerson = $primaryContact
    } elseif (Test-UserFieldType $fieldMap['KCCContactPerson']) {
      if ($primaryContact -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        $values.KCCContactPerson = $primaryContact
      } else {
        $notesParts += "KCCContactPerson (unmapped): $primaryContact"
      }
    } elseif (Test-UrlFieldType $fieldMap['KCCContactPerson']) {
      if ($primaryContact -match '^https?://') {
        $values.KCCContactPerson = $primaryContact
      } else {
        $notesParts += "KCCContactPerson (unmapped): $primaryContact"
      }
    } else {
      $notesParts += "KCCContactPerson (unmapped): $primaryContact"
    }
  }

  if ($fieldMap.ContainsKey('KRISecondaryContact') -and $secondaryContact) {
    if (Test-TextLikeFieldType $fieldMap['KRISecondaryContact']) {
      $values.KRISecondaryContact = $secondaryContact
    } elseif (Test-UserFieldType $fieldMap['KRISecondaryContact']) {
      if ($secondaryContact -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        $values.KRISecondaryContact = $secondaryContact
      } else {
        $notesParts += "KRISecondaryContact (unmapped): $secondaryContact"
      }
    } elseif (Test-UrlFieldType $fieldMap['KRISecondaryContact']) {
      if ($secondaryContact -match '^https?://') {
        $values.KRISecondaryContact = $secondaryContact
      } else {
        $notesParts += "KRISecondaryContact (unmapped): $secondaryContact"
      }
    } else {
      $notesParts += "KRISecondaryContact (unmapped): $secondaryContact"
    }
  }

  if ($fieldMap.ContainsKey('Notes')) {
    $existingNotes = Get-CellValue -Row $Row -Names @('Notes')
    $recordPhone = Get-CellValue -Row $Row -Names @('Phone Number', 'Phone', 'Mobile', 'Telephone', 'Tel')
    if (-not $recordPhone -and $phone) {
      $notesParts += "Phone Source: Record ID / fallback imported as phone"
    }
    $notes = Join-NonEmpty -Parts @($existingNotes, (Join-NonEmpty -Parts $notesParts -Separator ' | ')) -Separator ' | '
    if ($notes) { $values.Notes = $notes }
  }

  return $values
}

function Get-ExistingClientItem {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ListTitle,

    [Parameter(Mandatory = $true)]
    [hashtable]$FieldMap,

    [string]$RecordId,

    [string]$Title
  )

  $items = Get-PnPListItem -List $ListTitle -PageSize 5000
  if (-not $items) {
    return $null
  }

  if ($FieldMap.ContainsKey('SourceRecordId') -and $RecordId) {
    $match = $items | Where-Object { "$($_['SourceRecordId'])".Trim() -eq $RecordId.Trim() } | Select-Object -First 1
    if ($match) {
      return $match
    }
  }

  if ($Title) {
    $match = $items | Where-Object { "$($_['Title'])".Trim().ToLowerInvariant() -eq $Title.Trim().ToLowerInvariant() } | Select-Object -First 1
    if ($match) {
      return $match
    }
  }

  return $null
}

function Build-StageHistoryValues {
  param(
    [Parameter(Mandatory = $true)]
    $Row,

    [Parameter(Mandatory = $true)]
    [string]$ClientItemId,

    [Parameter(Mandatory = $true)]
    [hashtable]$FieldMap,

    [string]$CurrentUserLogin = ''
  )

  $recordId = Get-CellValue -Row $Row -Names @('Record ID', 'RecordID')
  $companyName = Get-CellValue -Row $Row -Names @('Company Name', 'CompanyName')
  $kri = Normalize-Stage (Get-CellValue -Row $Row -Names @('KRI'))
  if (-not $kri) {
    return $null
  }

  $values = [ordered]@{}
  if ($FieldMap.ContainsKey('Title')) {
    $values.Title = Join-NonEmpty -Parts @(
      'Imported registry stage',
      $companyName,
      $(if ($recordId) { "Record $recordId" } else { '' })
    ) -Separator ' - '
  }

  if ($FieldMap.ContainsKey('ClientID')) { $values.ClientID = $ClientItemId }
  if ($FieldMap.ContainsKey('PreviousStage')) { $values.PreviousStage = '' }
  if ($FieldMap.ContainsKey('NewStage')) { $values.NewStage = $kri }
  if ($FieldMap.ContainsKey('ChangedDate')) { $values.ChangedDate = (Get-Date).ToString('o') }
  if ($FieldMap.ContainsKey('ChangedBy') -and $CurrentUserLogin) { $values.ChangedBy = $CurrentUserLogin }
  if ($FieldMap.ContainsKey('Notes')) {
    $values.Notes = Join-NonEmpty -Parts @(
      "Imported from $WorksheetName",
      $(if ($recordId) { "Source Record ID: $recordId" } else { '' }),
      $(if ($companyName) { "Company: $companyName" } else { '' })
    ) -Separator ' | '
  }

  return $values
}

function Write-UnmappedReport {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.Generic.List[object]]$Rows,

    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ($Rows.Count -eq 0) {
    return
  }

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $Rows | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding UTF8
  Write-Host "Wrote unresolved contact report to $Path"
}

Ensure-Module -Name 'PnP.PowerShell'
Ensure-Module -Name 'ImportExcel'

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
  throw "Workbook not found: $WorkbookPath"
}

try {
  Connect-PnPOnline -Url $SiteUrl -Interactive
} catch {
  Connect-PnPOnline -Url $SiteUrl -UseWebLogin
}

$businessArmMap = Read-BusinessArmMap -Path $BusinessArmMapPath
Ensure-ClientImportFields -ListTitle 'KRI_Clients'
$clientFieldMap = Get-FieldMap -ListTitle 'KRI_Clients'
$stageFieldMap = if ($CreateStageHistory) { Get-FieldMap -ListTitle 'KRI_StageHistory' } else { @{} }
$siteWeb = Get-PnPWeb
Get-PnPProperty -ClientObject $siteWeb -Property CurrentUser | Out-Null
$currentUserLogin = $siteWeb.CurrentUser.LoginName

if ($PurgeAll) {
  foreach ($listTitle in $ListsToPurge) {
    Remove-ListItems -ListTitle $listTitle
  }
}

$rows = Import-Excel -Path $WorkbookPath -WorksheetName $WorksheetName
if (-not $rows) {
  throw "No data rows were found in worksheet '$WorksheetName'."
}

$unmapped = [System.Collections.Generic.List[object]]::new()
$createdClients = 0
$createdStages = 0

foreach ($row in $rows) {
  $recordId = Get-CellValue -Row $row -Names @('Record ID', 'RecordID')
  $clientValues = Build-ClientValues -Row $row -FieldMap $clientFieldMap -BusinessArmMap $businessArmMap
  $existingClient = Get-ExistingClientItem -ListTitle 'KRI_Clients' -FieldMap $clientFieldMap -RecordId $recordId -Title $clientValues.Title
  if ($existingClient) {
    Set-PnPListItem -List 'KRI_Clients' -Identity $existingClient.Id -Values $clientValues | Out-Null
  } else {
    $clientItem = Add-PnPListItem -List 'KRI_Clients' -Values $clientValues
    $createdClients++
    if ($clientItem) {
      $existingClient = $clientItem
    }
  }

  if ($CreateStageHistory) {
    $clientItemId = "$($existingClient.Id)"
    $stageValues = Build-StageHistoryValues -Row $row -ClientItemId $clientItemId -FieldMap $stageFieldMap -CurrentUserLogin $currentUserLogin
    if ($stageValues) {
      Add-PnPListItem -List 'KRI_StageHistory' -Values $stageValues | Out-Null
      $createdStages++
    }
  }

  $primaryContact = Get-CellValue -Row $row -Names @('KRI Primary Contact', 'KRIPrimaryContact')
  $secondaryContact = Get-CellValue -Row $row -Names @('KRI Secondary Contact', 'KRISecondaryContact')
  if ($primaryContact -or $secondaryContact) {
    $unmapped.Add([pscustomobject]@{
      RecordId        = $recordId
      CompanyName     = Get-CellValue -Row $row -Names @('Company Name', 'CompanyName')
      PrimaryContact   = $primaryContact
      SecondaryContact = $secondaryContact
      KRIStage        = Normalize-Stage (Get-CellValue -Row $row -Names @('KRI'))
    }) | Out-Null
  }
}

if ($UnmappedContactsReportPath) {
  Write-UnmappedReport -Rows $unmapped -Path $UnmappedContactsReportPath
}

Write-Host "Imported $createdClients client item(s)."
if ($CreateStageHistory) {
  Write-Host "Created $createdStages initial stage history item(s)."
}
