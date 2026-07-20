$ErrorActionPreference = 'Stop'

$root = 'C:\Aegis\KRI'
$statusPath = Join-Path $root '.dataverse-browser-auth-status.json'
$tokenPath = Join-Path $root '.dataverse-browser-auth-token.json'
$modulePath = Join-Path $root '.psmodules\Microsoft.PowerApps.Administration.PowerShell\2.0.217'

function Write-Status([hashtable]$payload) {
    $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

try {
    Write-Status @{
        state = 'starting'
        started_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        audience = 'https://konstructumcomdefault.crm11.dynamics.com/'
        application_id = 'a8f7a65c-f5ba-4859-b2d6-df772c264e9d'
    }

    $env:PSModulePath = "$root\.psmodules;$env:PSModulePath"
    Import-Module Microsoft.PowerApps.Administration.PowerShell -Force

    Add-PowerAppsAccount `
        -Audience 'https://konstructumcomdefault.crm11.dynamics.com/' `
        -ApplicationId 'a8f7a65c-f5ba-4859-b2d6-df772c264e9d' `
        -UseSystemBrowser $true

    $accessToken = Get-JwtToken 'https://konstructumcomdefault.crm11.dynamics.com/'
    if (-not $accessToken) {
        throw 'No Dataverse access token returned after authentication.'
    }

    $payload = [ordered]@{
        token_type = 'Bearer'
        audience = 'https://konstructumcomdefault.crm11.dynamics.com/'
        access_token = $accessToken
        acquired_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }

    $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $tokenPath -Encoding UTF8
    Write-Status @{
        state = 'complete'
        completed_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        token_path = $tokenPath
    }
}
catch {
    Write-Status @{
        state = 'failed'
        failed_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        error = $_.Exception.Message
    }
    throw
}
