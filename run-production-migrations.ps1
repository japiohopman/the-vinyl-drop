param(
    [ValidateSet('Base', 'Complete', 'ReleaseCandidate', 'ProfileAndStyles')]
    [string]$Phase = 'Base'
)

$ErrorActionPreference = 'Stop'

$projectRef = 'anxhmlalxjvatrufcjei'
$poolerHost = 'aws-0-eu-west-1.pooler.supabase.com'
$canonicalOrigin = 'https://thevinyldrop.nl'

$phaseSettings = @{
    Base = @{
        Confirmation = "APPLY-PRODUCTION-BASE-MIGRATIONS-0000-0005 $projectRef"
        Description = '0000-0005'
    }
    Complete = @{
        Confirmation = "APPLY-PRODUCTION-COMPLETE-MIGRATIONS-0006-0019 $projectRef"
        Description = '0006-0019'
    }
    ReleaseCandidate = @{
        Confirmation = "APPLY-PRODUCTION-RELEASE-MIGRATIONS-0020-0023 $projectRef"
        Description = '0020-0023'
    }
    ProfileAndStyles = @{
        Confirmation = "APPLY-PRODUCTION-PROFILE-AND-STYLES-MIGRATIONS-0024-0025 $projectRef"
        Description = '0024-0025'
    }
}
$expectedConfirmation = $phaseSettings[$Phase].Confirmation

$requiredFiles = @(
    'package.json',
    'drizzle.config.ts',
    'drizzle/meta/_journal.json',
    'check-production-db-target.ps1',
    'scripts/productionMigrationPlan.ps1'
)
if ($Phase -eq 'ReleaseCandidate') {
    $requiredFiles += @(
        'scripts/productionStoragePolicies.ts',
        'scripts/verifyProductionStoragePolicies.ts'
    )
}
if ($Phase -eq 'ProfileAndStyles') {
    $requiredFiles += 'scripts/verifyProductionMigrationBaseline.ts'
}
foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path (Get-Location) $file) -PathType Leaf)) {
        throw "Required file is missing. Run this script from the repository root; missing: $file"
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install/use the supported Node.js environment before running migrations.'
}

. (Join-Path (Get-Location) 'scripts/productionMigrationPlan.ps1')

# Always use the lockfile-installed local Drizzle Kit. Never allow npx or a
# registry fallback to install an unreviewed migration tool during this task.
$drizzleKitPath = $null
$binDirectory = Join-Path (Get-Location) 'node_modules/.bin'
$drizzleKitNames = if ($env:OS -eq 'Windows_NT') {
    @('drizzle-kit.cmd', 'drizzle-kit.ps1', 'drizzle-kit')
} else {
    @('drizzle-kit')
}
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

$tsxPath = $null
if ($Phase -in @('ReleaseCandidate', 'ProfileAndStyles')) {
    $tsxNames = if ($env:OS -eq 'Windows_NT') {
        @('tsx.cmd', 'tsx.ps1', 'tsx')
    } else {
        @('tsx')
    }
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
}

$journalPath = Join-Path (Get-Location) 'drizzle/meta/_journal.json'
$migrationEntries = @(Get-ProductionMigrationEntries -Phase $Phase -JournalPath $journalPath)
foreach ($entry in $migrationEntries) {
    $sourceMigration = Join-Path (Get-Location) ("drizzle/" + $entry.tag + '.sql')
    if (-not (Test-Path -LiteralPath $sourceMigration -PathType Leaf)) {
        throw "A required pinned migration file is missing: $($entry.tag).sql"
    }
}

$tempMigrationDirectoryName = ".production-migrations-$($Phase.ToLowerInvariant())"
$tempMigrationDirectory = Join-Path (Get-Location) $tempMigrationDirectoryName
$tempConfigFileName = "drizzle.production-$($Phase.ToLowerInvariant()).config.ts"
$tempConfigPath = Join-Path (Get-Location) $tempConfigFileName
$createdTemporaryFiles = $false

Write-Host "Production migration phase: $Phase ($($phaseSettings[$Phase].Description))"
Write-Host "Project: $projectRef"
Write-Host "Host: $poolerHost (Supabase Shared Session Pooler, port 5432; TLS required)"
if ($Phase -eq 'ReleaseCandidate') {
    Write-Host 'Precondition: production must have a private listing-photo-originals bucket and the exact approved Storage policy set (seven base policies, optionally plus two owner-scoped profile-avatar policies).'
    Write-Host 'The seven base policies are the four existing listing-photos policies plus the three authenticated seller-owner source policies. If profile avatars are provisioned, the validator also accepts only their exact owner-scoped insert/delete pair.'
    Write-Host 'A read-only preflight compares full predicates, roles, commands and permissive mode, and rejects missing, altered or extra policies before migrations start.'
    Write-Host 'Migration 0023 updates the existing Before User Created function; it does not change the Auth hook selection.'
}
Write-Host 'The password is requested securely and is not written to .env or printed.'

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
    # Supabase recommends sslmode=require so the driver cannot fall back to plaintext.
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
        throw 'Could not locate the PowerShell executable to run the isolated preflight process.'
    }

    Write-Host 'Running the fail-closed production target preflight...'
    & $enginePath -NoProfile -ExecutionPolicy Bypass -File (Join-Path (Get-Location) 'check-production-db-target.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Production target preflight failed. No Drizzle migration command was started.'
    }

    if ($Phase -eq 'ReleaseCandidate') {
        Write-Host 'Running read-only production Storage policy verification...'
        & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionStoragePolicies.ts')
        if ($LASTEXITCODE -ne 0) {
            throw 'Production Storage policy verification failed. No Drizzle migration command was started.'
        }
        Write-Host 'PASS: the exact approved Storage policy set is present; no extra or widened policy was found.'
    }

    if ($Phase -eq 'ProfileAndStyles') {
        Write-Host 'Running read-only production migration-ledger baseline verification (0000-0023)...'
        & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigrationBaseline.ts')
        if ($LASTEXITCODE -ne 0) {
            throw 'Production migration-ledger baseline verification failed. No Drizzle migration command was started.'
        }
        Write-Host 'PASS: the exact 24-entry production baseline through migration 0023 is present.'
    }

    $confirmation = Read-Host "Type exactly: $expectedConfirmation"
    if ($confirmation -cne $expectedConfirmation) {
        throw 'Confirmation did not match. No Drizzle migration command was started.'
    }

    if ((Test-Path -LiteralPath $tempMigrationDirectory) -or (Test-Path -LiteralPath $tempConfigPath)) {
        throw 'Temporary production-migration files already exist. Inspect and remove them manually before retrying.'
    }

    New-Item -ItemType Directory -Path $tempMigrationDirectory | Out-Null
    $createdTemporaryFiles = $true
    $metaDirectory = Join-Path $tempMigrationDirectory 'meta'
    New-Item -ItemType Directory -Path $metaDirectory | Out-Null

    foreach ($entry in $migrationEntries) {
        $sourceMigration = Join-Path (Get-Location) ("drizzle/" + $entry.tag + '.sql')
        Copy-Item -LiteralPath $sourceMigration -Destination $tempMigrationDirectory
    }

    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    $journal.entries = @($migrationEntries)
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

    if ($Phase -eq 'ReleaseCandidate') {
        Write-Host 'Repeating read-only Storage policy verification immediately before Drizzle starts...'
        & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionStoragePolicies.ts')
        if ($LASTEXITCODE -ne 0) {
            throw 'Final production Storage policy verification failed. Drizzle was not started.'
        }
    }

    if ($Phase -eq 'ProfileAndStyles') {
        Write-Host 'Repeating read-only production migration-ledger baseline verification immediately before Drizzle starts...'
        & $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigrationBaseline.ts')
        if ($LASTEXITCODE -ne 0) {
            throw 'Final production migration-ledger baseline verification failed. Drizzle was not started.'
        }
    }

    Write-Host "Applying only pinned production migrations $($phaseSettings[$Phase].Description)..."
    & $drizzleKitPath migrate "--config=$tempConfigFileName"
    if ($LASTEXITCODE -ne 0) {
        throw "Production migration phase $Phase failed. STOP: inspect drizzle.__drizzle_migrations before any retry."
    }

    switch ($Phase) {
        'Base' {
            Write-Host 'Base migrations 0000-0005 completed (or were already recorded by Drizzle).'
            Write-Host 'STOP HERE. Create and verify the listing-photos bucket and all four Storage object policies before running Phase Complete.'
        }
        'Complete' {
            Write-Host 'Only migrations 0006-0019 were selected. No migration after 0019 was included in this phase.'
            Write-Host 'Next: verify the 20-row Drizzle migration ledger, schema, RLS and Storage policies before creating or deploying the Render application service.'
        }
        'ReleaseCandidate' {
            Write-Host 'Only migrations 0020-0023 were selected. Later journal entries beginning at index 24 remain outside this phase.'
            Write-Host 'The read-only preflight verified full predicates, roles, commands and permissive mode for the seven base Storage policies and, if provisioned, the exact two profile-avatar owner policies before Drizzle started.'
            Write-Host 'Migration 0022 retains its historical private-source bucket/policy prerequisite; migration 0023 updates the existing private password-check hook function to reject new Google Auth identities.'
            Write-Host 'Next: verify all 24 Drizzle migration entries, pg_trgm indexes, release metadata columns, private-source policies, hook function/grants, RLS and Storage before deployment.'
        }
        'ProfileAndStyles' {
            Write-Host 'Only pinned production migrations 0024-0025 were selected. Later journal entries beginning at index 26 remain outside this phase.'
            Write-Host 'The read-only baseline preflight verified exactly the 24 production ledger timestamps through migration 0023 before confirmation and immediately before Drizzle started.'
            Write-Host 'This phase changes database schema only; it does not create or modify Storage buckets, policies, Auth settings or application runtime configuration.'
            Write-Host 'Before deploying the Issue #351 profile-avatar feature, separately provision and verify the public profile-avatars bucket and the exact two owner-scoped INSERT/DELETE policies.'
            Write-Host 'Independently verify all 26 migration ledger entries and the 0024 profile columns plus 0025 style columns after any separately authorized execution.'
        }
    }
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
