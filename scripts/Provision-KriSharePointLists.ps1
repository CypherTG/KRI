[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,

  [switch]$IncludeAttachmentLists = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-Module {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Module -ListAvailable -Name $Name)) {
    $root = Split-Path -Parent $PSScriptRoot
    if ($PSVersionTable.PSVersion.Major -lt 7 -and $Name -eq 'PnP.PowerShell') {
      $legacy = Join-Path $root '.psmodules\SharePointPnPPowerShellOnline'
      if (Test-Path -LiteralPath $legacy) {
        $legacyManifest = Get-ChildItem -LiteralPath $legacy -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($legacyManifest) {
          Import-Module $legacyManifest -Force -ErrorAction Stop
          return
        }
      }
    }

    $local = Join-Path $root ".psmodules\$Name"
    $manifest = $null

    if (Test-Path -LiteralPath $local) {
      $manifest = Get-ChildItem -LiteralPath $local -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
      if ($manifest) {
        Import-Module $manifest -Force -ErrorAction Stop
        return
      }
    }

    if ($Name -eq 'PnP.PowerShell') {
      $legacy = Join-Path $root '.psmodules\SharePointPnPPowerShellOnline'
      if (Test-Path -LiteralPath $legacy) {
        $legacyManifest = Get-ChildItem -LiteralPath $legacy -Recurse -Filter '*.psd1' -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
        if ($legacyManifest) {
          Import-Module $legacyManifest -Force -ErrorAction Stop
          return
        }
      }
    }

    throw "Required module '$Name' is not installed or could not be loaded from .psmodules. Install PnP.PowerShell and rerun this script."
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

function Ensure-List {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Description,
    [switch]$EnableAttachments
  )

  $existing = Get-PnPList -Identity $Title -ErrorAction SilentlyContinue
  if (-not $existing) {
    if ($PSCmdlet.ShouldProcess($Title, 'Create SharePoint list')) {
      New-PnPList -Title $Title -Template GenericList -Description $Description | Out-Null
      Start-Sleep -Seconds 2
    }
  }

  if ($EnableAttachments) {
    try {
      Set-PnPList -Identity $Title -EnableAttachments $true | Out-Null
    } catch {
      Write-Warning "Could not enable attachments for ${Title}: $($_.Exception.Message)"
    }
  }
}

function Ensure-Field {
  param(
    [Parameter(Mandatory = $true)][string]$ListTitle,
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [Parameter(Mandatory = $true)][string]$InternalName,
    [Parameter(Mandatory = $true)][ValidateSet('Text','Note','Choice','MultiChoice','Boolean','DateTime','URL','User')][string]$Type,
    [string[]]$Choices = @(),
    [switch]$Required,
    [switch]$MultiChoice
  )

  $map = Get-FieldMap -ListTitle $ListTitle
  if ($map.ContainsKey($InternalName)) {
    return
  }

  switch ($Type) {
    'Text' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type Text -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'Note' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type Note -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'Choice' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type Choice -Choices $Choices -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'MultiChoice' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type Choice -Choices $Choices -AddToDefaultView:$false -Required:$Required -AddToDefaultView:$false -MultiSelect | Out-Null
    }
    'Boolean' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type Boolean -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'DateTime' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type DateTime -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'URL' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type URL -AddToDefaultView:$false -Required:$Required | Out-Null
    }
    'User' {
      Add-PnPField -List $ListTitle -DisplayName $DisplayName -InternalName $InternalName -Type User -AddToDefaultView:$false -Required:$Required | Out-Null
    }
  }
}

function Ensure-DefaultView {
  param(
    [Parameter(Mandatory = $true)][string]$ListTitle,
    [Parameter(Mandatory = $true)][string[]]$Fields
  )

  $fieldMap = Get-FieldMap -ListTitle $ListTitle
  $viewFields = @('Title')
  foreach ($field in $Fields) {
    if ($field -and $fieldMap.ContainsKey($field) -and $viewFields -notcontains $field) {
      $viewFields += $field
    }
  }

  $defaultView = Get-PnPView -List $ListTitle | Where-Object { $_.DefaultView } | Select-Object -First 1
  if (-not $defaultView) {
    Write-Warning "No default view found for $ListTitle. Skipping view update."
    return
  }

  Set-PnPView -List $ListTitle -Identity $defaultView.Title -Fields $viewFields | Out-Null
}

function Provision-Companies {
  Ensure-List -Title 'KRI_Companies' -Description 'Canonical company registry for KRI.'
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Company Key' -InternalName 'CompanyKey' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Company Name' -InternalName 'CompanyName' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Canonical Name' -InternalName 'CanonicalName' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Description' -InternalName 'Description' -Type Note
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Status' -InternalName 'Status' -Type Choice -Choices @('Active','Inactive','Archived') -Required
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Contact Count' -InternalName 'ContactCount' -Type Text
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Latest Activity' -InternalName 'LatestActivity' -Type DateTime
  Ensure-Field -ListTitle 'KRI_Companies' -DisplayName 'Acumen Summary' -InternalName 'AcumenSummary' -Type Note
  Ensure-DefaultView -ListTitle 'KRI_Companies' -Fields @(
    'CompanyKey',
    'CompanyName',
    'CanonicalName',
    'Status',
    'ContactCount',
    'LatestActivity',
    'AcumenSummary'
  )
}

function Provision-LookupList {
  param([Parameter(Mandatory = $true)][ValidateSet('KRI_Projects','KRI_JobTitles')][string]$ListTitle)

  Ensure-List -Title $ListTitle -Description "Lookup registry for $ListTitle." 
  $prefix = if ($ListTitle -eq 'KRI_Projects') { 'Project' } else { 'Job Title' }
  $compactPrefix = $prefix -replace '\s+', ''
  $keyFieldName = if ($ListTitle -eq 'KRI_Projects') { 'ProjectKey' } else { 'JobTitleKey' }
  $nameFieldName = if ($ListTitle -eq 'KRI_Projects') { 'ProjectName' } else { 'JobTitleName' }
  Ensure-Field -ListTitle $ListTitle -DisplayName "$prefix Key" -InternalName "${compactPrefix}Key" -Type Text -Required
  Ensure-Field -ListTitle $ListTitle -DisplayName "$prefix Name" -InternalName "${compactPrefix}Name" -Type Text -Required
  Ensure-Field -ListTitle $ListTitle -DisplayName 'Status' -InternalName 'Status' -Type Choice -Choices @('Active','Inactive') -Required
  Ensure-Field -ListTitle $ListTitle -DisplayName 'Sort Order' -InternalName 'SortOrder' -Type Text
  Ensure-DefaultView -ListTitle $ListTitle -Fields @($keyFieldName, $nameFieldName, 'Status', 'SortOrder')
}

function Provision-CompanyAcumen {
  Ensure-List -Title 'KRI_CompanyAcumen' -Description 'Company-level acumen uploads and reference files.' -EnableAttachments
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'Company Key' -InternalName 'CompanyKey' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'Company Name' -InternalName 'CompanyName' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'File Name' -InternalName 'FileName' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'File URL' -InternalName 'FileUrl' -Type URL
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'Notes' -InternalName 'Notes' -Type Note
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'Uploaded By' -InternalName 'UploadedBy' -Type Text
  Ensure-Field -ListTitle 'KRI_CompanyAcumen' -DisplayName 'Uploaded At' -InternalName 'UploadedAt' -Type DateTime
  Ensure-DefaultView -ListTitle 'KRI_CompanyAcumen' -Fields @(
    'CompanyKey',
    'CompanyName',
    'FileName',
    'FileUrl',
    'UploadedBy',
    'UploadedAt'
  )
}

function Provision-Biodata {
  Ensure-List -Title 'KRI_Biodata' -Description 'Detailed client biodata registry for future enrichment.' -EnableAttachments
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Contact Id' -InternalName 'contact_id' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Full Name' -InternalName 'full_name' -Type Text -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Preferred Name' -InternalName 'preferred_name' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Salutation' -InternalName 'salutation' -Type Choice -Choices @('Mr','Mrs','Ms','Dr','Prof','Engr','Barrister','Hon','Chief','Alhaji','Alhaja')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Gender' -InternalName 'gender' -Type Choice -Choices @('Male','Female','Prefer not to say')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Date of Birth' -InternalName 'date_of_birth' -Type DateTime
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Profile Photo URL' -InternalName 'profile_photo_url' -Type URL
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Record Status' -InternalName 'record_status' -Type Choice -Choices @('Active','Inactive','Archived') -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Record Owner' -InternalName 'record_owner' -Type User -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Nationality' -InternalName 'nationality' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Birth Country' -InternalName 'birth_country' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Birth State' -InternalName 'birth_state' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Hometown' -InternalName 'hometown' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Ethnicity' -InternalName 'ethnicity' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Religion' -InternalName 'religion' -Type Choice -Choices @('Christianity','Islam','Traditional','Other','Prefer not to say')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Languages Spoken' -InternalName 'languages_spoken' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Education' -InternalName 'education' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Certifications' -InternalName 'certifications' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Work History' -InternalName 'work_history' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Board Positions' -InternalName 'board_positions' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Preferred Channels' -InternalName 'preferred_channels' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Preferred Contact Time' -InternalName 'preferred_contact_time' -Type Choice -Choices @('Morning','Midday','Afternoon','Evening','Flexible')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Preferred Meeting Format' -InternalName 'preferred_meeting_format' -Type Choice -Choices @('In-Person','Video','Phone','Flexible')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Communication Formality' -InternalName 'communication_formality' -Type Choice -Choices @('Formal','Semi-Formal','Casual')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Gatekeeper Name' -InternalName 'gatekeeper_name' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Gatekeeper Phone' -InternalName 'gatekeeper_phone' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Comms Notes' -InternalName 'comms_notes' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Personal Interests' -InternalName 'personal_interests' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Motivators' -InternalName 'motivators' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Decision Making Style' -InternalName 'decision_making_style' -Type Choice -Choices @('Consultative','Autonomous','Consensus','Data-first')
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Referral Source' -InternalName 'referral_source' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Known Associates' -InternalName 'known_associates' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Sensitivity Flags' -InternalName 'sensitivity_flags' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Account Notes' -InternalName 'account_notes' -Type Note
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Consent Email' -InternalName 'consent_email' -Type Boolean -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Consent SMS' -InternalName 'consent_sms' -Type Boolean -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Consent Date' -InternalName 'consent_date' -Type DateTime
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Data Source' -InternalName 'data_source' -Type Text
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Created Date' -InternalName 'created_date' -Type DateTime -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Last Modified Date' -InternalName 'last_modified_date' -Type DateTime -Required
  Ensure-Field -ListTitle 'KRI_Biodata' -DisplayName 'Deletion Requested' -InternalName 'deletion_requested' -Type Boolean -Required
  Ensure-DefaultView -ListTitle 'KRI_Biodata' -Fields @(
    'contact_id',
    'full_name',
    'preferred_name',
    'salutation',
    'gender',
    'date_of_birth',
    'profile_photo_url',
    'record_status',
    'record_owner',
    'nationality',
    'birth_country',
    'birth_state',
    'hometown',
    'ethnicity',
    'religion',
    'languages_spoken',
    'created_date',
    'last_modified_date'
  )
}

Ensure-Module -Name 'PnP.PowerShell'
try {
  Connect-PnPOnline -Url $SiteUrl -Interactive
} catch {
  Connect-PnPOnline -Url $SiteUrl -UseWebLogin
}

Provision-Companies
Provision-LookupList -ListTitle 'KRI_Projects'
Provision-LookupList -ListTitle 'KRI_JobTitles'
Provision-CompanyAcumen
Provision-Biodata

Write-Host 'KRI list provisioning completed.'
