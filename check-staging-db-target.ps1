$ErrorActionPreference = 'Stop'
$expectedRef = 'xuhzhdjmgvqzjxijmksu'
$envPath = Join-Path (Get-Location) '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Host 'CONTROLE NIET GESLAAGD — GEEN MIGRATIE UITVOEREN' -ForegroundColor Red
    Write-Host 'Het bestand .env ontbreekt in de huidige map.'
    return
}

$vars = @{}
foreach ($line in (Get-Content -LiteralPath $envPath)) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if ((($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or (($value.StartsWith("'")) -and ($value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $vars[$key] = $value
    }
}

$problems = @()

# Existing PowerShell process variables take precedence over values loaded from .env.
$projectRef = [Environment]::GetEnvironmentVariable('STAGING_DB_PROJECT_REF', 'Process')
if ([string]::IsNullOrWhiteSpace($projectRef)) { $projectRef = $vars['STAGING_DB_PROJECT_REF'] }
$stagingHost = [Environment]::GetEnvironmentVariable('STAGING_DB_HOST', 'Process')
if ([string]::IsNullOrWhiteSpace($stagingHost)) { $stagingHost = $vars['STAGING_DB_HOST'] }
if ($projectRef -ne $expectedRef) {
    $problems += 'De effectieve STAGING_DB_PROJECT_REF ontbreekt of wijkt af van het goedgekeurde stagingproject.'
}
if ([string]::IsNullOrWhiteSpace($stagingHost)) {
    $problems += 'De effectieve STAGING_DB_HOST ontbreekt.'
}

# Match drizzle.config.ts: process environment first, DATABASE_DIRECT_URL before DATABASE_URL.
$selectedName = 'DATABASE_DIRECT_URL'
$selectedUrl = [Environment]::GetEnvironmentVariable('DATABASE_DIRECT_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($selectedUrl)) { $selectedUrl = $vars['DATABASE_DIRECT_URL'] }
if ([string]::IsNullOrWhiteSpace($selectedUrl)) {
    $selectedName = 'DATABASE_URL'
    $selectedUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
    if ([string]::IsNullOrWhiteSpace($selectedUrl)) { $selectedUrl = $vars['DATABASE_URL'] }
}
if ([string]::IsNullOrWhiteSpace($selectedUrl)) {
    $problems += 'DATABASE_DIRECT_URL en DATABASE_URL ontbreken beide in de effectieve omgeving en .env.'
}

$dbHostName = $null
if (-not [string]::IsNullOrWhiteSpace($selectedUrl)) {
    try {
        $uri = [System.Uri]$selectedUrl
        $dbHostName = $uri.DnsSafeHost.ToLowerInvariant()
        $dbUserName = [System.Uri]::UnescapeDataString(($uri.UserInfo -split ':')[0])
        $correctProject = ($dbHostName -eq "db.$expectedRef.supabase.co") -or (
            $dbHostName.EndsWith('.pooler.supabase.com') -and $dbUserName -eq "postgres.$expectedRef"
        )
        if (-not $correctProject) {
            $problems += 'De geselecteerde databaseverbinding verwijst niet aantoonbaar naar het goedgekeurde stagingproject.'
        }
        if ($dbHostName -ne ([string]$stagingHost).ToLowerInvariant()) {
            $problems += 'De host van de geselecteerde databaseverbinding komt niet exact overeen met STAGING_DB_HOST.'
        }
    }
    catch {
        $problems += 'De geselecteerde databaseverbinding heeft geen herkenbaar URL-formaat.'
    }
}

if ($problems.Count -gt 0) {
    Write-Host 'CONTROLE NIET GESLAAGD — GEEN MIGRATIE UITVOEREN' -ForegroundColor Red
    foreach ($problem in $problems) {
        Write-Host "- $problem"
    }
    return
}

Write-Host 'CONTROLE GESLAAGD' -ForegroundColor Green
Write-Host "Actieve Drizzle-configuratie: $selectedName"
Write-Host "Databasehost: $dbHostName"
Write-Host 'Projectreferentie en host komen overeen. Alleen de effectieve configuratie en .env zijn gelezen; geen databaseverbinding geopend en niets gewijzigd.'
