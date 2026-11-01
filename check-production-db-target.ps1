$ErrorActionPreference = 'Stop'
$canonicalOrigin = 'https://thevinyldrop.nl'
$expectedProductionRef = 'anxhmlalxjvatrufcjei'
$expectedProductionHost = 'aws-0-eu-west-1.pooler.supabase.com'
$envPath = Join-Path (Get-Location) '.env'

function Fail-Preflight {
    param([string[]]$Problems)
    Write-Host 'PRODUCTION TARGET CHECK FAILED — DO NOT RUN MIGRATIONS' -ForegroundColor Red
    foreach ($problem in $Problems) {
        Write-Host "- $problem"
    }
    exit 1
}

# The runner supplies these values as process-only variables. An optional .env
# file may supply non-secret values for standalone read-only checks.
$vars = @{}
if (Test-Path -LiteralPath $envPath) {
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

        # Only the single explicit TLS parameter is allowed; prefer/allow can fall back.
        $queryItems = @(
            $uri.Query.TrimStart('?') -split '&' |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )
        if ($queryItems.Count -ne 1) {
            $script:problems += "$Name must contain only one query parameter: sslmode=require."
            return $null
        }
        $queryParts = $queryItems[0] -split '=', 2
        $queryKey = [System.Uri]::UnescapeDataString($queryParts[0])
        $sslMode = if ($queryParts.Count -eq 2) {
            [System.Uri]::UnescapeDataString($queryParts[1])
        } else {
            ''
        }
        if ($queryKey -ine 'sslmode' -or $sslMode -cne 'require') {
            $script:problems += "$Name must include exactly one sslmode=require parameter."
            return $null
        }
        if ($uri.AbsolutePath -cne '/postgres' -or -not [string]::IsNullOrEmpty($uri.Fragment)) {
            $script:problems += "$Name must target only the postgres database without a URL fragment."
            return $null
        }

        $userInfoParts = $uri.UserInfo -split ':', 2
        if ($userInfoParts.Count -ne 2) {
            throw 'Database URL is missing user credentials.'
        }

        $userName = [System.Uri]::UnescapeDataString($userInfoParts[0])
        $password = [System.Uri]::UnescapeDataString($userInfoParts[1])
        $isApprovedSessionPooler = (
            $hostName -eq $expectedProductionHost -and
            $userName -eq "postgres.$ExpectedRef" -and
            $uri.Port -eq 5432
        )

        if (-not $isApprovedSessionPooler) {
            $script:problems += "$Name does not identify the approved production Shared Session Pooler endpoint on port 5432."
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

if ([string]::IsNullOrWhiteSpace($expectedRef) -or $expectedRef -cne $expectedProductionRef) {
    $problems += 'The process-only confirmation must equal the one approved production project reference.'
}
if ($expectedRef -eq 'xuhzhdjmgvqzjxijmksu') {
    $problems += 'The confirmed project ref is the known staging project; production migrations are forbidden against staging.'
}
if ([string]::IsNullOrWhiteSpace($projectRef) -or $projectRef -cne $expectedProductionRef -or $projectRef -cne $expectedRef) {
    $problems += 'PRODUCTION_DB_PROJECT_REF must exactly match the approved production project and process-only confirmation.'
}
if ([string]::IsNullOrWhiteSpace($dbHost) -or $dbHost -cne $expectedProductionHost) {
    $problems += 'PRODUCTION_DB_HOST must exactly match the approved production Session Pooler host.'
}

$nodeEnv = Get-EffectiveValue 'NODE_ENV'
if ($nodeEnv -cne 'production') {
    $problems += 'NODE_ENV must be exactly production.'
}

$appBaseUrl = Get-EffectiveValue 'APP_BASE_URL'
try {
    $appUri = [System.Uri]$appBaseUrl
    if (
        $appUri.Scheme -cne 'https' -or
        $appUri.DnsSafeHost.ToLowerInvariant() -cne 'thevinyldrop.nl' -or
        $appUri.Port -ne 443 -or
        $appUri.AbsolutePath -cne '/' -or
        -not [string]::IsNullOrEmpty($appUri.Query) -or
        -not [string]::IsNullOrEmpty($appUri.Fragment) -or
        -not [string]::IsNullOrEmpty($appUri.UserInfo)
    ) {
        $problems += "APP_BASE_URL must be exactly the canonical origin $canonicalOrigin with no path, port override, query, fragment or credentials."
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
    if (
        $supabaseUri.Scheme -cne 'https' -or
        $supabaseUri.DnsSafeHost.ToLowerInvariant() -cne "$expectedRef.supabase.co" -or
        $supabaseUri.Port -ne 443 -or
        $supabaseUri.AbsolutePath -cne '/' -or
        -not [string]::IsNullOrEmpty($supabaseUri.Query) -or
        -not [string]::IsNullOrEmpty($supabaseUri.Fragment) -or
        -not [string]::IsNullOrEmpty($supabaseUri.UserInfo)
    ) {
        $problems += 'SUPABASE_URL must be exactly the HTTPS origin for the confirmed production project with no path, port override, query, fragment or credentials.'
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
Write-Host "Production project reference: $expectedProductionRef"
Write-Host "Production database host: $expectedProductionHost"
Write-Host "Canonical application origin: $canonicalOrigin"
Write-Host 'Both database URLs were checked for sslmode=require. Only process environment values and optional .env settings were checked; no database connection was opened and no setting or data was changed.'
