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

$vars = @{}
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in (Get-Content -LiteralPath $envPath)) {
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*

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
        if ($uri.Scheme -notin @('postgres', 'postgresql')) {
            throw 'Unsupported database URL scheme.'
        }

        $hostName = $uri.DnsSafeHost.ToLowerInvariant()
        $userInfoParts = $uri.UserInfo -split ':', 2
        if ($userInfoParts.Count -ne 2) {
            throw 'Database URL is missing user credentials.'
        }

        $userName = [System.Uri]::UnescapeDataString($userInfoParts[0])
        $password = [System.Uri]::UnescapeDataString($userInfoParts[1])
        $directHost = "db.$ExpectedRef.supabase.co"
        $isDirect = ($hostName -eq $directHost -and $userName -eq 'postgres')
        $isSessionPooler = (
            $hostName.EndsWith('.pooler.supabase.com') -and
            $userName -eq "postgres.$ExpectedRef" -and
            $uri.Port -eq 5432
        )

        if (-not ($isDirect -or $isSessionPooler)) {
            $script:problems += "$Name does not identify the confirmed production project using a direct or Session Pooler endpoint on port 5432."
            return $null
        }
        if ([string]::IsNullOrWhiteSpace($password) -or $password -match '^\[YOUR-PASSWORD\]$') {
            $script:problems += "$Name is missing the real database password; the placeholder is not accepted."
            return $null
        }

        return $hostName
    }
    catch {
        $script:problems += "$Name is not a valid PostgreSQL connection URL with the expected credentials."
        return $null
    }
}

$problems = @()

# This confirmation must be typed into the current PowerShell process; it cannot come from .env.
$expectedRef = [Environment]::GetEnvironmentVariable('TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF', 'Process')
$projectRef = Get-EffectiveValue 'PRODUCTION_DB_PROJECT_REF'
$dbHost = Get-EffectiveValue 'PRODUCTION_DB_HOST'
if ($expectedRef -eq 'xuhzhdjmgvqzjxijmksu') {
    $problems += 'The confirmed project ref is the known staging project; production migrations are forbidden against staging.'
}
if ([string]::IsNullOrWhiteSpace($expectedRef) -or $expectedRef -notmatch '^[a-z0-9]{20}$') {
    $problems += 'Set process-only TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF to the exact 20-character production project ref before running this check.'
}
if ([string]::IsNullOrWhiteSpace($projectRef) -or $projectRef -ne $expectedRef) {
    $problems += 'PRODUCTION_DB_PROJECT_REF is missing or does not match the process-only confirmation value.'
}
if ([string]::IsNullOrWhiteSpace($dbHost)) {
    $problems += 'PRODUCTION_DB_HOST is missing; set it to the exact host in the production Session Pooler connection string.'
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

$migrationUrl = Get-EffectiveValue 'DATABASE_DIRECT_URL'
if ([string]::IsNullOrWhiteSpace($migrationUrl)) {
    $problems += 'DATABASE_DIRECT_URL is required for the Drizzle migration preflight; DATABASE_URL fallback is deliberately not accepted.'
}
else {
    $migrationHost = Get-DatabaseIdentity -ConnectionString $migrationUrl -Name 'DATABASE_DIRECT_URL' -ExpectedRef $expectedRef
    if (-not [string]::IsNullOrWhiteSpace($migrationHost) -and $migrationHost -cne ([string]$dbHost).ToLowerInvariant()) {
        $problems += 'DATABASE_DIRECT_URL host does not exactly match PRODUCTION_DB_HOST.'
    }
}

$appDbUrl = Get-EffectiveValue 'DATABASE_URL'
if ([string]::IsNullOrWhiteSpace($appDbUrl)) {
    $problems += 'DATABASE_URL is missing.'
}
else {
    $appDbHost = Get-DatabaseIdentity -ConnectionString $appDbUrl -Name 'DATABASE_URL' -ExpectedRef $expectedRef
    if (-not [string]::IsNullOrWhiteSpace($appDbHost) -and $appDbHost -cne ([string]$dbHost).ToLowerInvariant()) {
        $problems += 'DATABASE_URL host does not exactly match PRODUCTION_DB_HOST.'
    }
}

if ($problems.Count -gt 0) {
    Fail-Preflight $problems
}

Write-Host 'PRODUCTION TARGET CHECK PASSED' -ForegroundColor Green
Write-Host "Production project reference: $expectedRef"
Write-Host "Production database host: $dbHost"
Write-Host "Canonical application origin: $canonicalOrigin"
Write-Host 'Only connection identity and non-secret environment values were checked. No database connection was opened and no setting or data was changed.'
) {
            $key = $Matches[1]
            $value = $Matches[2].Trim()
            if ((($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or (($value.StartsWith("'")) -and ($value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $vars[$key] = $value
        }
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
        if ($uri.Scheme -notin @('postgres', 'postgresql')) {
            throw 'Unsupported database URL scheme.'
        }

        $hostName = $uri.DnsSafeHost.ToLowerInvariant()
        $userInfoParts = $uri.UserInfo -split ':', 2
        if ($userInfoParts.Count -ne 2) {
            throw 'Database URL is missing user credentials.'
        }

        $userName = [System.Uri]::UnescapeDataString($userInfoParts[0])
        $password = [System.Uri]::UnescapeDataString($userInfoParts[1])
        $directHost = "db.$ExpectedRef.supabase.co"
        $isDirect = ($hostName -eq $directHost -and $userName -eq 'postgres')
        $isSessionPooler = (
            $hostName.EndsWith('.pooler.supabase.com') -and
            $userName -eq "postgres.$ExpectedRef" -and
            $uri.Port -eq 5432
        )

        if (-not ($isDirect -or $isSessionPooler)) {
            $script:problems += "$Name does not identify the confirmed production project using a direct or Session Pooler endpoint on port 5432."
            return $null
        }
        if ([string]::IsNullOrWhiteSpace($password) -or $password -match '^\[YOUR-PASSWORD\]$') {
            $script:problems += "$Name is missing the real database password; the placeholder is not accepted."
            return $null
        }

        return $hostName
    }
    catch {
        $script:problems += "$Name is not a valid PostgreSQL connection URL with the expected credentials."
        return $null
    }
}

$problems = @()

# This confirmation must be typed into the current PowerShell process; it cannot come from .env.
$expectedRef = [Environment]::GetEnvironmentVariable('TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF', 'Process')
$projectRef = Get-EffectiveValue 'PRODUCTION_DB_PROJECT_REF'
$dbHost = Get-EffectiveValue 'PRODUCTION_DB_HOST'
if ($expectedRef -eq 'xuhzhdjmgvqzjxijmksu') {
    $problems += 'The confirmed project ref is the known staging project; production migrations are forbidden against staging.'
}
if ([string]::IsNullOrWhiteSpace($expectedRef) -or $expectedRef -notmatch '^[a-z0-9]{20}$') {
    $problems += 'Set process-only TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF to the exact 20-character production project ref before running this check.'
}
if ([string]::IsNullOrWhiteSpace($projectRef) -or $projectRef -ne $expectedRef) {
    $problems += 'PRODUCTION_DB_PROJECT_REF is missing or does not match the process-only confirmation value.'
}
if ([string]::IsNullOrWhiteSpace($dbHost)) {
    $problems += 'PRODUCTION_DB_HOST is missing; set it to the exact host in the production Session Pooler connection string.'
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

$migrationUrl = Get-EffectiveValue 'DATABASE_DIRECT_URL'
if ([string]::IsNullOrWhiteSpace($migrationUrl)) {
    $problems += 'DATABASE_DIRECT_URL is required for the Drizzle migration preflight; DATABASE_URL fallback is deliberately not accepted.'
}
else {
    $migrationHost = Get-DatabaseIdentity -ConnectionString $migrationUrl -Name 'DATABASE_DIRECT_URL' -ExpectedRef $expectedRef
    if (-not [string]::IsNullOrWhiteSpace($migrationHost) -and $migrationHost -cne ([string]$dbHost).ToLowerInvariant()) {
        $problems += 'DATABASE_DIRECT_URL host does not exactly match PRODUCTION_DB_HOST.'
    }
}

$appDbUrl = Get-EffectiveValue 'DATABASE_URL'
if ([string]::IsNullOrWhiteSpace($appDbUrl)) {
    $problems += 'DATABASE_URL is missing.'
}
else {
    $appDbHost = Get-DatabaseIdentity -ConnectionString $appDbUrl -Name 'DATABASE_URL' -ExpectedRef $expectedRef
    if (-not [string]::IsNullOrWhiteSpace($appDbHost) -and $appDbHost -cne ([string]$dbHost).ToLowerInvariant()) {
        $problems += 'DATABASE_URL host does not exactly match PRODUCTION_DB_HOST.'
    }
}

if ($problems.Count -gt 0) {
    Fail-Preflight $problems
}

Write-Host 'PRODUCTION TARGET CHECK PASSED' -ForegroundColor Green
Write-Host "Production project reference: $expectedRef"
Write-Host "Production database host: $dbHost"
Write-Host "Canonical application origin: $canonicalOrigin"
Write-Host 'Only connection identity and non-secret environment values were checked. No database connection was opened and no setting or data was changed.'
