param(
    [ValidateSet('Base', 'Complete')]
    [string]$Phase = 'Base'
)

$ErrorActionPreference = 'Stop'

# Base applies migrations 0000-0005 only. Then create the bucket and the four
# exact Storage object policies in Supabase Dashboard. Complete applies 0006-0019.
$projectRef = 'anxhmlalxjvatrufcjei'
$poolerHost = 'aws-0-eu-west-1.pooler.supabase.com'
$canonicalOrigin = 'https://thevinyldrop.nl'
$expectedConfirmation = if ($Phase -eq 'Base') {
    "APPLY-PRODUCTION-BASE-MIGRATIONS $projectRef"
} else {
    "APPLY-PRODUCTION-REMAINING-MIGRATIONS $projectRef"
}

$requiredFiles = @(
    'package.json',
    'drizzle.config.ts',
    'drizzle/meta/_journal.json',
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

Write-Host "Production migration phase: $Phase"
Write-Host "Project: $projectRef"
Write-Host "Host: $poolerHost (Supabase Shared Session Pooler, port 5432)"
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

$tempMigrationDirectory = Join-Path (Get-Location) '.production-migrations-base'
$tempConfigPath = Join-Path (Get-Location) 'drizzle.production-base.config.ts'

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

    if ($Phase -eq 'Base') {
        if ((Test-Path -LiteralPath $tempMigrationDirectory) -or (Test-Path -LiteralPath $tempConfigPath)) {
            throw 'Temporary base-migration files already exist. Inspect and remove them manually before retrying.'
        }

        $journalPath = Join-Path (Get-Location) 'drizzle/meta/_journal.json'
        $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
        $baseEntries = @($journal.entries | Where-Object { [int]$_.idx -le 5 } | Sort-Object { [int]$_.idx })
        if ($baseEntries.Count -ne 6) {
            throw 'Expected exactly six ordered base migration entries (0000-0005); refusing to proceed.'
        }

        $metaDirectory = Join-Path $tempMigrationDirectory 'meta'
        New-Item -ItemType Directory -Path $metaDirectory -Force | Out-Null
        foreach ($entry in $baseEntries) {
            $sourceMigration = Join-Path (Get-Location) ("drizzle/" + $entry.tag + '.sql')
            if (-not (Test-Path -LiteralPath $sourceMigration)) {
                throw "A required base migration file is missing: $($entry.tag).sql"
            }
            Copy-Item -LiteralPath $sourceMigration -Destination $tempMigrationDirectory
        }
        $journal.entries = $baseEntries
        $journalJson = $journal | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText(
            (Join-Path $metaDirectory '_journal.json'),
            $journalJson,
            [System.Text.UTF8Encoding]::new($false)
        )

        $baseConfig = @'
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './.production-migrations-base',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_DIRECT_URL || '',
  },
});
'@
        [System.IO.File]::WriteAllText(
            $tempConfigPath,
            $baseConfig,
            [System.Text.UTF8Encoding]::new($false)
        )

        try {
            Write-Host 'Applying only base migrations 0000-0005...'
            npx drizzle-kit migrate --config=drizzle.production-base.config.ts
            if ($LASTEXITCODE -ne 0) {
                throw 'Base migration phase failed. STOP: inspect drizzle.__drizzle_migrations before any retry.'
            }
            Write-Host 'Base migrations 0000-0005 completed.'
            Write-Host 'STOP HERE. Create and verify the listing-photos bucket and all four Storage object policies before running Phase Complete.'
        }
        finally {
            Remove-Item -LiteralPath $tempMigrationDirectory -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
        }
    }
    else {
        Write-Host 'Applying the remaining repository migrations 0006-0019...'
        npm run db:migrate
        if ($LASTEXITCODE -ne 0) {
            throw 'Remaining migration phase failed. STOP: earlier migration files may already have committed. Inspect drizzle.__drizzle_migrations before any retry.'
        }
        Write-Host 'All repository Drizzle migrations completed successfully.'
        Write-Host 'Next: verify the 20-row Drizzle migration ledger, schema, RLS and Storage policies before creating or deploying the Render application service.'
    }
}
finally {
    if (Test-Path -LiteralPath $tempMigrationDirectory) {
        Remove-Item -LiteralPath $tempMigrationDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $tempConfigPath) {
        Remove-Item -LiteralPath $tempConfigPath -Force -ErrorAction SilentlyContinue
    }
    foreach ($name in $previousValues.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousValues[$name], 'Process')
    }
    $connectionString = $null
    $environmentValues = $null
    $previousValues = $null
}
