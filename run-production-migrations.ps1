$ErrorActionPreference = 'Stop'

# Run from the repository root after the production Storage bucket and four
# Storage object policies have been created and verified.
$projectRef = 'anxhmlalxjvatrufcjei'
$poolerHost = 'aws-0-eu-west-1.pooler.supabase.com'
$canonicalOrigin = 'https://thevinyldrop.nl'
$expectedConfirmation = "APPLY-PRODUCTION-MIGRATIONS $projectRef"

$requiredFiles = @(
    'package.json',
    'drizzle.config.ts',
    'check-production-db-target.ps1',
    '.env'
)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path (Get-Location) $file))) {
        throw "Required file is missing. Run this script from the repository root; missing: $file"
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install/use the supported Node.js environment before running migrations.'
}

Write-Host 'This operation applies the 20 repository Drizzle migrations to the isolated production database.'
Write-Host "Project: $projectRef"
Write-Host "Host: $poolerHost (Supabase Shared Session Pooler, port 5432)"
Write-Host 'The password is requested securely and is not written to .env or printed.'

$securePassword = Read-Host 'Enter the production database password (input hidden)' -AsSecureString
if ($securePassword.Length -eq 0) {
    throw 'The database password cannot be empty.'
}

$bstr = [IntPtr]::Zero
$plainPassword = $null
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

try {
    $encodedPassword = [System.Uri]::EscapeDataString($plainPassword)
    $databaseUser = "postgres.$projectRef"
    $connectionString = 'postgresql://' + $databaseUser + ':' + $encodedPassword + '@' + $poolerHost + ':5432/postgres'
}
finally {
    $plainPassword = $null
    $encodedPassword = $null
    $securePassword.Dispose()
}

$environmentValues = @{
    NODE_ENV = 'production'
    APP_BASE_URL = $canonicalOrigin
    ALLOWED_REDIRECT_URLS = $canonicalOrigin
    SUPABASE_URL = "https://$projectRef.supabase.co"
    PRODUCTION_DB_PROJECT_REF = $projectRef
    PRODUCTION_DB_HOST = $poolerHost
    TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF = $projectRef
    DATABASE_URL = $connectionString
    DATABASE_DIRECT_URL = $connectionString
}
$previousValues = @{}
foreach ($name in $environmentValues.Keys) {
    $previousValues[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    foreach ($name in $environmentValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $environmentValues[$name], 'Process')
    }

    $engineName = if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh.exe' } else { 'powershell.exe' }
    $enginePath = Join-Path $PSHOME $engineName
    if (-not (Test-Path -LiteralPath $enginePath)) {
        throw 'Could not locate the PowerShell executable to run the isolated preflight process.'
    }

    Write-Host 'Running the fail-closed production target preflight...'
    & $enginePath -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Get-Location) 'check-production-db-target.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Production target preflight failed. No Drizzle migration command was started.'
    }

    $confirmation = Read-Host "Type exactly: $expectedConfirmation"
    if ($confirmation -cne $expectedConfirmation) {
        throw 'Confirmation did not match. No Drizzle migration command was started.'
    }

    Write-Host 'Starting npm run db:migrate...'
    npm run db:migrate
    $migrationExitCode = $LASTEXITCODE
    if ($migrationExitCode -ne 0) {
        throw 'The Drizzle migration command failed. STOP: earlier migration files may already have committed. Inspect drizzle.__drizzle_migrations before any retry.'
    }

    Write-Host 'Drizzle migration command completed successfully.'
    Write-Host 'Next: verify the Drizzle migration ledger and schema before creating or deploying the Render application service.'
}
finally {
    foreach ($name in $previousValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process')
    }
    $connectionString = $null
    $environmentValues = $null
    $previousValues = $null
}
