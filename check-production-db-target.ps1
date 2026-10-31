$ErrorActionPreference = 'Stop'
$canonicalOrigin = 'https://thevinyldrop.nl'
$envPath = Join-Path (Get-Location) '.env'

function Fail-Preflight {
    param([string[]]$Problems)
    Write-Host 'PRODUCTION TARGET CHECK FAILED — DO NOT RUN MIGRATIONS' -ForegroundColor Red
    foreach ($problem in $Problems) {
        Write-Host "- $problem"
    }
    exit 1
}

if (-not (Test-Path -LiteralPath $envPath)) {
    Fail-Preflight @('The .env file is missing from the current directory.')
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

function Get-EffectiveValue {
    param([string]$Name)
    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
    return [string]$vars[$Name]
}

function Get-DatabaseIdentity {
    param([string]$ConnectionString, [string]$Name, [string]$ExpectedRef)
    try {
        $uri = [System.Uri]$ConnectionString
        $hostName = $uri.DnsSafeHost.ToLowerInvariant()
        $userName = [System.Uri]::UnescapeDataString(($uri.UserInfo -split ':')[0])
        $directHost = "db.$ExpectedRef.supabase.co"
        $isDirect = ($hostName -eq $directHost)
        $isPooler = $hostName.EndsWith('.pooler.supabase.com') -and $userName -eq "postgres.$ExpectedRef"
        if (-not ($isDirect -or $isPooler)) {
            $script:problems += "$Name does not identify the confirmed production project."
            return $null
        }
        return $hostName
    }
    catch {
        $script:problems += "$Name is not a valid PostgreSQL connection URL."
        return $null
    }
}

$problems = @()

# This confirmation must be typed into the current PowerShell process; it cannot come from .env.
$expectedRef = [Environment]::GetEnvironmentVariable('TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF', 'Process')
$projectRef = Get-EffectiveValue 'PRODUCTION_DB_PROJECT_REF'
$dbHost = Get-EffectiveValue 'PRODUCTION_DB_HOST'
if ([string]::IsNullOrWhiteSpace($expectedRef) -or $expectedRef -notmatch '^[a-z0-9]{20}$') {
    $problems += 'Set process-only TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF to the exact 20-character production project ref before running this check.'
}
if ([string]::IsNullOrWhiteSpace($projectRef) -or $projectRef -ne $expectedRef) {
    $problems += 'PRODUCTION_DB_PROJECT_REF is missing or does not match the process-only confirmation value.'
}
if ([string]::IsNullOrWhiteSpace($dbHost)) {
    $problems += 'PRODUCTION_DB_HOST is missing.'
}

$nodeEnv = Get-EffectiveValue 'NODE_ENV'
if ($nodeEnv -cne 'production') {
    $problems += 'NODE_ENV must be exactly production.'
}

$appBaseUrl = Get-EffectiveValue 'APP_BASE_URL'
try {
    $appUri = [System.Uri]$appBaseUrl
    if ($appUri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/') -cne $canonicalOrigin) {
        $problems += "APP_BASE_URL must use the canonical origin $canonicalOrigin."
    }
}
catch {
    $problems += 'APP_BASE_URL is missing or is not a valid absolute URL.'
}

$allowedRedirects = Get-EffectiveValue 'ALLOWED_REDIRECT_URLS'
if ([string]::IsNullOrWhiteSpace($allowedRedirects)) {
    $problems += 'ALLOWED_REDIRECT_URLS is missing.'
}
else {
    foreach ($entry in ($allowedRedirects -split ',')) {
        try {
            $redirectUri = [System.Uri]$entry.Trim()
            if ($redirectUri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/') -cne $canonicalOrigin) {
                $problems += 'ALLOWED_REDIRECT_URLS contains an origin other than the canonical production origin.'
            }
        }
        catch {
            $problems += 'ALLOWED_REDIRECT_URLS contains an invalid absolute URL.'
        }
    }
}

$supabaseUrl = Get-EffectiveValue 'SUPABASE_URL'
try {
    $supabaseUri = [System.Uri]$supabaseUrl
    if ($supabaseUri.Scheme -cne 'https' -or $supabaseUri.DnsSafeHost.ToLowerInvariant() -cne "$expectedRef.supabase.co") {
        $problems += 'SUPABASE_URL does not match the confirmed production project.'
    }
}
catch {
    $problems += 'SUPABASE_URL is missing or invalid.'
}

$directUrl = Get-EffectiveValue 'DATABASE_DIRECT_URL'
if ([string]::IsNullOrWhiteSpace($directUrl)) {
    $problems += 'DATABASE_DIRECT_URL is required for a production migration preflight; DATABASE_URL fallback is deliberately not accepted.'
}
else {
    $directHost = Get-DatabaseIdentity -ConnectionString $directUrl -Name 'DATABASE_DIRECT_URL' -ExpectedRef $expectedRef
    if (-not [string]::IsNullOrWhiteSpace($directHost) -and $directHost -cne ([string]$dbHost).ToLowerInvariant()) {
        $problems += 'DATABASE_DIRECT_URL host does not exactly match PRODUCTION_DB_HOST.'
    }
}

$appDbUrl = Get-EffectiveValue 'DATABASE_URL'
if ([string]::IsNullOrWhiteSpace($appDbUrl)) {
    $problems += 'DATABASE_URL is missing.'
}
else {
    $null = Get-DatabaseIdentity -ConnectionString $appDbUrl -Name 'DATABASE_URL' -ExpectedRef $expectedRef
}

if ($problems.Count -gt 0) {
    Fail-Preflight $problems
}

Write-Host 'PRODUCTION TARGET CHECK PASSED' -ForegroundColor Green
Write-Host "Production project reference: $expectedRef"
Write-Host "Migration database host: $dbHost"
Write-Host "Canonical application origin: $canonicalOrigin"
Write-Host 'The effective environment and .env were checked. No database connection was opened and no setting or data was changed.'
