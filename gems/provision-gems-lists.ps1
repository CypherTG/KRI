param(
  [string]$SiteUrl = "https://netorgft13110820.sharepoint.com/sites/KONSTRUCTUM"
)

$ErrorActionPreference = "Stop"
$DQ = [char]34  # double-quote character

# ── Helpers ──

function Get-Digest($url) {
  $resp = Invoke-RestMethod -Uri "$url/_api/contextinfo" -Method POST -UseDefaultCredentials -Headers @{
    Accept   = "application/json;odata=nometadata"
    "Content-Type" = "application/json;odata=nometadata"
    "odata-version" = ""
  }
  return $resp.FormDigestValue
}

function List-Exists($url, $title) {
  try {
    $filter = [System.Uri]::EscapeDataString("Title eq '$title'")
    $resp = Invoke-RestMethod -Uri "$url/_api/web/lists?`$select=Id,Title&`$filter=$filter&`$top=1" -Method GET -UseDefaultCredentials -Headers @{
      Accept         = "application/json;odata=nometadata"
      "odata-version" = ""
    }
    return ($resp.value | Measure-Object).Count -gt 0
  } catch {
    return $false
  }
}

function Create-List($url, $digest, $title, $description) {
  $body = @{ Title = $title; Description = $description; BaseTemplate = 100 } | ConvertTo-Json
  Invoke-RestMethod -Uri "$url/_api/web/lists" -Method POST -UseDefaultCredentials -Headers @{
    Accept         = "application/json;odata=nometadata"
    "Content-Type" = "application/json;odata=nometadata"
    "X-RequestDigest" = $digest
    "odata-version" = ""
  } -Body $body | Out-Null
}

function Add-Field($url, $digest, $listTitle, $schemaXml) {
  $body = @{ parameters = @{ SchemaXml = $schemaXml; Options = 0 } } | ConvertTo-Json -Depth 4
  try {
    Invoke-RestMethod -Uri "$url/_api/web/lists/getbytitle('$([System.Uri]::EscapeDataString($listTitle))')/fields/CreateFieldAsXml" -Method POST -UseDefaultCredentials -Headers @{
      Accept         = "application/json;odata=nometadata"
      "Content-Type" = "application/json;odata=nometadata"
      "X-RequestDigest" = $digest
      "odata-version" = ""
    } -Body $body | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Get-FieldNames($url, $listTitle) {
  try {
    $resp = Invoke-RestMethod -Uri "$url/_api/web/lists/getbytitle('$([System.Uri]::EscapeDataString($listTitle))')/fields?`$select=InternalName&`$filter=Hidden eq false&`$top=500" -Method GET -UseDefaultCredentials -Headers @{
      Accept         = "application/json;odata=nometadata"
      "odata-version" = ""
    }
    return @($resp.value | ForEach-Object { $_.InternalName })
  } catch {
    return @()
  }
}

function Extract-FieldName($xml) {
  $tag = "Name="
  $idx = $xml.IndexOf($tag)
  if ($idx -lt 0) { return "" }
  $after = $xml.Substring($idx + $tag.Length)
  if ($after.Length -lt 2) { return "" }
  if ($after[0] -ne $DQ) { return "" }
  $after = $after.Substring(1)
  $end = $after.IndexOf($DQ)
  if ($end -le 0) { return "" }
  return $after.Substring(0, $end)
}

# ── Field XML builders ──

function FX($name, $displayName, $required, $typeStr) {
  $r = if ($required) { "TRUE" } else { "FALSE" }
  $safeName = [System.Security.SecurityElement]::Escape($name)
  $safeDisp = [System.Security.SecurityElement]::Escape($displayName)
  return "<Field Type=$DQ$typeStr$DQ DisplayName=$DQ$safeDisp$DQ Name=$DQ$safeName$DQ StaticName=$DQ$safeName$DQ Required=$DQ$r$DQ />"
}

function FX-Text($n, $d, $r) { FX $n $d $r "Text" }
function FX-Date($n, $d, $r) { FX $n $d $r "DateTime" -replace '/>', ' Format="DateOnly" />' }
function FX-Bool($n, $d, $r) { FX $n $d $r "Boolean" }
function FX-Note($n, $d, $r) {
  $r2 = if ($r) { "TRUE" } else { "FALSE" }
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=$DQ$Note$DQ DisplayName=$DQ$sd$DQ Name=$DQ$sn$DQ StaticName=$DQ$sn$DQ Required=$DQ$r2$DQ NumLines=$DQ$6$DQ RichText=$DQ$FALSE$DQ AppendOnly=$DQ$FALSE$DQ />"
}

# ── Actual field XML functions ──

function F-Text($n,$d,$r,$max=255) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=${DQ}Text${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ} MaxLength=${DQ}${max}${DQ} />"
}

function F-Note($n,$d,$r) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=${DQ}Note${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ} NumLines=${DQ}6${DQ} RichText=${DQ}FALSE${DQ} AppendOnly=${DQ}FALSE${DQ} />"
}

function F-Choice($n,$d,$choices,$r,$multi=$false) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $t = if($multi){"MultiChoice"}else{"Choice"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  $cx = ($choices | ForEach-Object { "<CHOICE>$([System.Security.SecurityElement]::Escape($_))</CHOICE>" }) -join ""
  return "<Field Type=${DQ}${t}${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ}><CHOICES>${cx}</CHOICES></Field>"
}

function F-Bool($n,$d,$r) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=${DQ}Boolean${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ} />"
}

function F-Date($n,$d,$r) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=${DQ}DateTime${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ} Format=${DQ}DateOnly${DQ} />"
}

function F-Uri($n,$d,$r) {
  $r2 = if($r){"TRUE"}else{"FALSE"}
  $sn = [System.Security.SecurityElement]::Escape($n)
  $sd = [System.Security.SecurityElement]::Escape($d)
  return "<Field Type=${DQ}URL${DQ} DisplayName=${DQ}${sd}${DQ} Name=${DQ}${sn}${DQ} StaticName=${DQ}${sn}${DQ} Required=${DQ}${r2}${DQ} Format=${DQ}Hyperlink${DQ} />"
}

# ── Field Definitions ──

function Get-InteractionFields {
  @(
    (F-Text "ClientId" "Client ID" $true),
    (F-Text "ClientID" "Client ID" $true),
    (F-Text "ClientName" "Client Name" $true),
    (F-Text "CompanyKey" "Company Key" $false),
    (F-Text "CompanyName" "Company Name" $false),
    (F-Text "Agency" "Agency" $false),
    (F-Choice "BusinessArm" "Business Arm" @("INTERKONSTRUCT","KCC","PMT7") $false),
    (F-Choice "InteractionType" "Interaction Type" @("Meeting","Call","Email","Note") $true),
    (F-Choice "Category" "Category" @("Crown Jewel","Pearl","Coral","Ruby") $true),
    (F-Text "FinalClassification" "Final Classification" $false),
    (F-Text "InfluencePercent" "Influence Percent" $false),
    (F-Text "Points" "Points" $true),
    (F-Note "Notes" "Notes" $false),
    (F-Note "Justification" "Justification" $false),
    (F-Choice "ReviewStatus" "Review Status" @("Submitted","Pending Review","Validated","Rejected") $false),
    (F-Date "WeekStart" "Week Start" $false),
    (F-Text "ReportingMonth" "Reporting Month" $false),
    (F-Text "LoggedBy" "Logged By" $true),
    (F-Date "LoggedAt" "Logged At" $true),
    (F-Text "TargetUser" "Target User" $true),
    (F-Text "TargetUserId" "Target User Id" $false),
    (F-Text "KRIClassification" "KRI Classification" $false),
    (F-Bool "ExecutiveInvolvementRequested" "Executive Involvement Requested" $true),
    (F-Text "ExecutiveMonthlyPointsAtLog" "Executive Monthly Points At Log" $false),
    (F-Bool "FollowUpRequired" "Follow Up Required" $true),
    (F-Date "FollowUpDate" "Follow Up Date" $false),
    (F-Date "ScheduledDate" "Scheduled Date" $false)
  )
}

function Get-ComplianceFields {
  @(
    (F-Choice "EntityType" "Entity Type" @("Stakeholder","Agency") $true),
    (F-Text "EntityId" "Entity ID" $true),
    (F-Text "EntityName" "Entity Name" $false),
    (F-Choice "ComplianceType" "Compliance Type" @("Permit","License","Obligation","Certificate","Filing","Registration") $true),
    (F-Choice "Status" "Status" @("Active","Expired","Pending","Cancelled","ExpiringSoon","UnderReview") $true),
    (F-Date "IssueDate" "Issue Date" $false),
    (F-Date "ExpiryDate" "Expiry Date" $false),
    (F-Date "RenewalDate" "Renewal Date" $false),
    (F-Text "GoverningBody" "Governing Body" $false),
    (F-Text "ReferenceNumber" "Reference Number" $false),
    (F-Note "Description" "Description" $false),
    (F-Note "Notes" "Notes" $false),
    (F-Text "AssignedTo" "Assigned To" $false),
    (F-Note "DocumentsJson" "Documents JSON" $false),
    (F-Date "LastCheckedDate" "Last Checked Date" $false),
    (F-Bool "AlertSent" "Alert Sent" $false)
  )
}

function Get-ActionFields {
  @(
    (F-Choice "EntityType" "Entity Type" @("Stakeholder","Agency","Interaction","Compliance","System") $true),
    (F-Text "EntityId" "Entity ID" $true),
    (F-Text "EntityName" "Entity Name" $false),
    (F-Choice "ActionType" "Action Type" @("FollowUp","Task","Reminder","Approval","Review","Notification") $true),
    (F-Choice "Priority" "Priority" @("High","Medium","Low") $true),
    (F-Choice "Status" "Status" @("Open","InProgress","Completed","Cancelled","Deferred") $true),
    (F-Date "DueDate" "Due Date" $false),
    (F-Date "CompletedDate" "Completed Date" $false),
    (F-Text "AssignedTo" "Assigned To" $false),
    (F-Note "Description" "Description" $false),
    (F-Text "Source" "Source" $false),
    (F-Text "SourceId" "Source ID" $false),
    (F-Text "Outcome" "Outcome" $false),
    (F-Text "CreatedBy" "Created By" $true),
    (F-Date "CreatedAt" "Created At" $false)
  )
}

function Get-AuditLogFields {
  @(
    (F-Text "EntityType" "Entity Type" $true),
    (F-Text "EntityId" "Entity ID" $true),
    (F-Choice "Action" "Action" @("Created","Updated","Deleted","Viewed","Exported","Approved","Rejected") $true),
    (F-Text "FieldName" "Field Name" $false),
    (F-Note "OldValue" "Old Value" $false),
    (F-Note "NewValue" "New Value" $false),
    (F-Text "UserName" "User Name" $true),
    (F-Text "UserEmail" "User Email" $false),
    (F-Date "Timestamp" "Timestamp" $true),
    (F-Text "Source" "Source" $false),
    (F-Note "Details" "Details" $false)
  )
}

# ── Main ──

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  GEMS SharePoint List Provisioning" -ForegroundColor Cyan
Write-Host "  Site: $SiteUrl" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$digest = Get-Digest -url $SiteUrl
Write-Host "[OK] Request digest obtained" -ForegroundColor Green
Write-Host ""

$lists = @(
  @{ Title = "GEMS_Interactions"; Desc = "GEMS interaction intelligence, category scoring, and meeting notes."; Fn = "Get-InteractionFields" }
  @{ Title = "GEMS_Compliance";   Desc = "GEMS compliance records - permits, licences, obligations, and regulatory filings with expiry tracking."; Fn = "Get-ComplianceFields" }
  @{ Title = "GEMS_Actions";      Desc = "GEMS action items and follow-up tasks linked to stakeholders, agencies, interactions, and compliance records."; Fn = "Get-ActionFields" }
  @{ Title = "GEMS_AuditLog";     Desc = "GEMS universal audit trail - tracks all create, update, delete, view, and export events across GEMS entities."; Fn = "Get-AuditLogFields" }
)

$totalCreated = 0
$totalFieldsAdded = 0

foreach ($ld in $lists) {
  $title = $ld.Title
  $desc  = $ld.Desc
  $fields = & $ld.Fn

  Write-Host "-- $title --" -ForegroundColor Yellow

  $exists = List-Exists -url $SiteUrl -title $title
  if ($exists) {
    Write-Host "  List already exists - adding missing fields..." -ForegroundColor DarkGray
  } else {
    Write-Host "  Creating list..." -ForegroundColor White
    Create-List -url $SiteUrl -digest $digest -title $title -description $desc
    $totalCreated++

    $retries = 0
    while (-not (List-Exists -url $SiteUrl -title $title) -and $retries -lt 10) {
      $retries++
      Start-Sleep -Milliseconds 750
    }
    if ($retries -ge 10) {
      Write-Host "  [WARN] List may still be provisioning asynchronously..." -ForegroundColor DarkYellow
    } else {
      Write-Host "  [OK] List created" -ForegroundColor Green
    }
  }

  $digest = Get-Digest -url $SiteUrl

  $existingFields = Get-FieldNames -url $SiteUrl -listTitle $title
  $fieldsAdded = 0

  foreach ($schema in $fields) {
    $fieldName = Extract-FieldName -xml $schema
    if ([string]::IsNullOrEmpty($fieldName)) { continue }

    if ($existingFields -contains $fieldName) { continue }

    $ok = Add-Field -url $SiteUrl -digest $digest -listTitle $title -schemaXml $schema
    if ($ok) {
      $fieldsAdded++
      Write-Host "  + $fieldName" -ForegroundColor DarkGreen
    } else {
      Write-Host "  ! $fieldName (may already exist)" -ForegroundColor DarkYellow
    }
  }

  $totalFieldsAdded += $fieldsAdded
  if ($fieldsAdded -gt 0) {
    Write-Host "  $fieldsAdded field(s) added" -ForegroundColor Green
  } else {
    Write-Host "  All fields already present" -ForegroundColor DarkGray
  }
  Write-Host ""
}

Write-Host "============================================" -ForegroundColor Cyan
if ($totalCreated -gt 0) {
  Write-Host "  Created $totalCreated list(s)" -ForegroundColor Green
  foreach ($ld in $lists) { Write-Host "    - $($ld.Title)" -ForegroundColor Green }
}
if ($totalFieldsAdded -gt 0) {
  Write-Host "  $totalFieldsAdded field(s) added total" -ForegroundColor Green
}
if ($totalCreated -eq 0 -and $totalFieldsAdded -eq 0) {
  Write-Host "  All GEMS lists and fields already exist. No changes needed." -ForegroundColor DarkGray
}
Write-Host "============================================" -ForegroundColor Cyan
