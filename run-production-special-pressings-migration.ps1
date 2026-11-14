$ErrorActionPreference = 'Stop'

# This runner is intentionally production-only and applies exactly migration 0026.
# Do not extend or reuse the existing ProfileAndStyles (0024-0025) phase.
$projectRef = 'anxhmlalxjvatrufcjei'
$poolerHost = 'aws-0-eu-west-1.pooler.supabase.com'
$canonicalOrigin = 'https://thevinyldrop.nl'
$expectedConfirmation = "APPLY-PRODUCTION-SPECIAL-PRESSINGS-MIGRATION-0026 $projectRef"

$requiredFiles = @(
    'package.json',
    'drizzle.config.ts',
    'drizzle/meta/_journal.json',
    'drizzle/0026_release_content_type_and_special_pressing.sql',
    'check-production-db-target.ps1',
    'scripts/productionMigration0026Plan.ps1',
    'scripts/verifyProductionMigration0026.ts'
)
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path (Get-Location) $file) -PathType Leaf)) {
        throw "Required file is missing. Run this script from the repository root; missing: $file"
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install/use the supported Node.js environment before running migrations.'
}

. (Join-Path (Get-Location) 'scripts/productionMigration0026Plan.ps1')
$journalPath = Join-Path (Get-Location) 'drizzle/meta/_journal.json'
$migrationEntry = Get-PinnedProductionMigration0026Entry -JournalPath $journalPath
$migrationPath = Join-Path (Get-Location) 'drizzle/0026_release_content_type_and_special_pressing.sql'

# Use only lockfile-installed local tools. No npx or registry fallback is allowed.
$binDirectory = Join-Path (Get-Location) 'node_modules/.bin'
$drizzleKitNames = if ($env:OS -eq 'Windows_NT') {
    @('drizzle-kit.cmd', 'drizzle-kit.ps1', 'drizzle-kit')
} else {
    @('drizzle-kit')
}
$drizzleKitPath = $null
foreach ($binaryName in $drizzleKitNames) {
    $candidate = Join-Path $binDirectory $binaryName
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $drizzleKitPath = $candidate
        break
    }
}
if ([string]::IsNullOrWhiteSpace($drizzleKitPath)) {
    throw 'The lockfile-installed local drizzle-kit binary is missing. Run npm ci --include=dev from the repository root; no registry fallback will be used.'
}

$tsxNames = if ($env:OS -eq 'Windows_NT') {
    @('tsx.cmd', 'tsx.ps1', 'tsx')
} else {
    @('tsx')
}
$tsxPath = $null
foreach ($binaryName in $tsxNames) {
    $candidate = Join-Path $binDirectory $binaryName
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        $tsxPath = $candidate
        break
    }
}
if ([string]::IsNullOrWhiteSpace($tsxPath)) {
    throw 'The lockfile-installed local tsx binary is missing. Run npm ci --include=dev from the repository root; no registry fallback will be used.'
}

$tempMigrationDirectoryName = '.production-migrations-special-pressings-0026'
$tempMigrationDirectory = Join-Path (Get-Location) $tempMigrationDirectoryName
$tempConfigFileName = 'drizzle.production-special-pressings-0026.config.ts'
$tempConfigPath = Join-Path (Get-Location) $tempConfigFileName
$createdTemporaryFiles = $false

Write-Host 'Production migration: 0026_release_content_type_and_special_pressing'
Write-Host "Project: $projectRef"
Write-Host "Host: $poolerHost (Supabase Shared Session Pooler, port 5432; TLS required)"
Write-Host 'This runner selects one Drizzle migration only: index 26 / migration 0026.'
Write-Host 'The separate 0024-0025 ProfileAndStyles runner and phase are not modified.'
Write-Host 'The production database password is requested securely and is not written to .env or printed.'

$securePassword = Read-Host -Prompt 'Enter the production database password (input hidden)' -AsSecureString
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
    $connectionString = 'postgresql://' + $databaseUser + ':' + $encodedPassword + '@' + $poolerHost + ':5432/postgres?sslmode=require'
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

    $engineName = if ($PSVersionTable.PSEdition -eq 'Core') {
        if ($IsWindows) { 'pwsh.exe' } else { 'pwsh' }
    } else {
        'powershell.exe'
    }
    $enginePath = Join-Path $PSHOME $engineName
    if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) {
        throw 'Could not locate the PowerShell executable to run the isolated production target preflight.'
    }

    Write-Host 'Running the fail-closed production target preflight...'
    & $enginePath -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Get-Location) 'check-production-db-target.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Production target preflight failed. No Drizzle migration command was started.'
    }

    Write-Host 'Running read-only production baseline and 0026-absence verification (0000-0025)...'
    & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigration0026.ts') preflight
    if ($LASTEXITCODE -ne 0) {
        throw 'Production 0000-0025 baseline or 0026-absence verification failed. No Drizzle migration command was started.'
    }

    $confirmation = Read-Host "Type exactly: $expectedConfirmation"
    if ($confirmation -cne $expectedConfirmation) {
        throw 'Confirmation did not match. No Drizzle migration command was started.'
    }

    if ((Test-Path -LiteralPath $tempMigrationDirectory) -or (Test-Path -LiteralPath $tempConfigPath)) {
        throw 'Temporary migration files already exist. Inspect and remove them manually before retrying.'
    }

    New-Item -ItemType Directory -Path $tempMigrationDirectory | Out-Null
    $createdTemporaryFiles = $true
    $metaDirectory = Join-Path $tempMigrationDirectory 'meta'
    New-Item -ItemType Directory -Path $metaDirectory | Out-Null
    Copy-Item -LiteralPath $migrationPath -Destination $tempMigrationDirectory

    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    $journal.entries = @($migrationEntry)
    $journalJson = $journal | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText(
        (Join-Path $metaDirectory '_journal.json'),
        $journalJson,
        [System.Text.UTF8Encoding]::new($false)
    )

    $configContent = @"
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './$tempMigrationDirectoryName',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_DIRECT_URL || '',
  },
});
"@
    [System.IO.File]::WriteAllText(
        $tempConfigPath,
        $configContent,
        [System.Text.UTF8Encoding]::new($false)
    )

    # Last read-only guard immediately before the single Drizzle migration.
    Write-Host 'Repeating production target preflight immediately before Drizzle...'
    & $enginePath -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Get-Location) 'check-production-db-target.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Final production target preflight failed. Drizzle was not started.'
    }

    Write-Host 'Repeating read-only exact ledger/hash and schema preflight immediately before Drizzle...'
    & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigration0026.ts') preflight
    if ($LASTEXITCODE -ne 0) {
        throw 'Final production 0000-0025 baseline or 0026-absence verification failed. Drizzle was not started.'
    }

    Write-Host 'Applying only migration 0026_release_content_type_and_special_pressing...'
    & $drizzleKitPath migrate "--config=$tempConfigFileName"
    if ($LASTEXITCODE -ne 0) {
        throw 'Production migration 0026 failed. STOP: inspect the Drizzle ledger and live schema before any retry.'
    }

    # The migration deliberately installs its CHECK as NOT VALID, so validation
    # is a separate post-commit step with a bounded lock/statement timeout.
    Write-Host 'Verifying migration 0026, validating its CHECK constraint post-commit, and checking final schema...'
    & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigration0026.ts') complete
    if ($LASTEXITCODE -ne 0) {
        throw 'Migration 0026 was applied but its post-migration schema/constraint verification did not complete. STOP: do not rerun Drizzle; inspect the ledger and constraint state.'
    }

    Write-Host 'PASS: production ledger contains exactly migrations 0000-0026 with matching hashes.'
    Write-Host 'PASS: release_content_type, special_pressing_characteristic, Release/PhysicalCopy columns and defaults match the approved schema.'
    Write-Host 'PASS: physical_copies_special_pressing_check is independently verified as validated.'
    Write-Host 'STOP: no application deployment, Storage/Auth change, setting change or data backfill was performed by this runner.'
}
finally {
    if ($createdTemporaryFiles -and (Test-Path -LiteralPath $tempMigrationDirectory)) {
        Remove-Item -LiteralPath $tempMigrationDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($createdTemporaryFiles -and (Test-Path -LiteralPath $tempConfigPath)) {
        Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
    }
    foreach ($name in $previousValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process')
    }
    $connectionString = $null
    $environmentValues = $null
    $previousValues = $null
}
