$ErrorActionPreference = 'Stop'

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwsh) {
    throw 'PowerShell 7 (pwsh) is required to run the production preflight regression tests.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$preflightPath = Join-Path $repositoryRoot 'check-production-db-target.ps1'
$migrationRunnerPath = Join-Path $repositoryRoot 'run-production-migrations.ps1'
$migrationPlanPath = Join-Path $repositoryRoot 'scripts/productionMigrationPlan.ps1'
$journalPath = Join-Path $repositoryRoot 'drizzle/meta/_journal.json'
$expectedProductionRef = 'anxhmlalxjvatrufcjei'
$expectedProductionHost = 'aws-0-eu-west-1.pooler.supabase.com'
$testPassword = 'preflight-test-password-not-a-secret'

function Invoke-PreflightCase {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ProjectRef,
        [Parameter(Mandatory = $true)][string]$PoolerHost,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$SslMode,
        [Parameter(Mandatory = $true)][int]$ExpectedExitCode,
        [string]$AppBaseUrl = 'https://thevinyldrop.nl',
        [string]$SupabaseUrl = ''
    )

    $names = @(
        'TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF',
        'PRODUCTION_DB_PROJECT_REF',
        'PRODUCTION_DB_HOST',
        'NODE_ENV',
        'APP_BASE_URL',
        'ALLOWED_REDIRECT_URLS',
        'SUPABASE_URL',
        'DATABASE_URL',
        'DATABASE_DIRECT_URL'
    )
    $original = @{}
    foreach ($item in $names) {
        $original[$item] = [Environment]::GetEnvironmentVariable($item, 'Process')
    }

    try {
        [Environment]::SetEnvironmentVariable('TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF', $ProjectRef, 'Process')
        [Environment]::SetEnvironmentVariable('PRODUCTION_DB_PROJECT_REF', $ProjectRef, 'Process')
        [Environment]::SetEnvironmentVariable('PRODUCTION_DB_HOST', $PoolerHost, 'Process')
        [Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Process')
        [Environment]::SetEnvironmentVariable('APP_BASE_URL', $AppBaseUrl, 'Process')
        [Environment]::SetEnvironmentVariable('ALLOWED_REDIRECT_URLS', 'https://thevinyldrop.nl', 'Process')
        $effectiveSupabaseUrl = if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
            'https://' + $ProjectRef + '.supabase.co'
        } else {
            $SupabaseUrl
        }
        [Environment]::SetEnvironmentVariable('SUPABASE_URL', $effectiveSupabaseUrl, 'Process')

        $user = 'postgres.' + $ProjectRef
        $query = if ([string]::IsNullOrWhiteSpace($SslMode)) { '' } else { '?sslmode=' + $SslMode }
        $connection = 'postgresql://' + $user + ':' + $testPassword + '@' + $PoolerHost + ':5432/postgres' + $query
        [Environment]::SetEnvironmentVariable('DATABASE_URL', $connection, 'Process')
        [Environment]::SetEnvironmentVariable('DATABASE_DIRECT_URL', $connection, 'Process')

        $output = & $pwsh.Source -NoProfile -File $preflightPath *>&1 | Out-String
        $actualExitCode = $LASTEXITCODE
        if ($actualExitCode -ne $ExpectedExitCode) {
            throw "$Name expected exit code $ExpectedExitCode but received $actualExitCode. Output: $output"
        }
        if ($output.Contains($testPassword)) {
            throw "$Name unexpectedly printed the test connection password."
        }
        Write-Host "PASS: $Name"
    }
    finally {
        foreach ($item in $names) {
            [Environment]::SetEnvironmentVariable($item, $original[$item], 'Process')
        }
    }
}

function Test-PinnedProductionMigrationPlans {
    . $migrationPlanPath

    $base = @(Get-ProductionMigrationEntries -Phase Base -JournalPath $journalPath)
    $complete = @(Get-ProductionMigrationEntries -Phase Complete -JournalPath $journalPath)
    $release = @(Get-ProductionMigrationEntries -Phase ReleaseCandidate -JournalPath $journalPath)
    $profileAndStyles = @(Get-ProductionMigrationEntries -Phase ProfileAndStyles -JournalPath $journalPath)

    $baseIndexes = @($base | ForEach-Object { [int]$_.idx })
    if ($base.Count -ne 6 -or ($baseIndexes -join ',') -cne '0,1,2,3,4,5' -or
        $base[0].tag -cne '0000_grey_living_tribunal' -or
        $base[-1].tag -cne '0005_enforce_least_privilege_rls') {
        throw 'Base phase did not select exactly indexes 0-5 (migrations 0000-0005).'
    }

    $completeIndexes = @($complete | ForEach-Object { [int]$_.idx })
    if ($complete.Count -ne 14 -or ($completeIndexes -join ',') -cne '6,7,8,9,10,11,12,13,14,15,16,17,18,19' -or
        $complete[0].tag -cne '0006_storage_objects_rls' -or
        $complete[-1].tag -cne '0019_shared_rate_limit_buckets') {
        throw 'Complete phase did not select exactly indexes 6-19 (migrations 0006-0019).'
    }

    $releaseIndexes = @($release | ForEach-Object { [int]$_.idx })
    if ($release.Count -ne 4 -or ($releaseIndexes -join ',') -cne '20,21,22,23' -or
        $release[0].tag -cne '0020_catalogue_search_trigram' -or
        $release[1].tag -cne '0021_release_metadata_vocabulary' -or
        $release[2].tag -cne '0022_listing_photo_source_versions' -or
        $release[3].tag -cne '0023_block_new_google_oauth_identities') {
        throw 'ReleaseCandidate phase did not select exactly indexes 20-23 (migrations 0020-0023) in order.'
    }

    $profileAndStylesIndexes = @($profileAndStyles | ForEach-Object { [int]$_.idx })
    if ($profileAndStyles.Count -ne 2 -or ($profileAndStylesIndexes -join ',') -cne '24,25' -or
        $profileAndStyles[0].tag -cne '0024_profile_avatars_and_music_links' -or
        $profileAndStyles[1].tag -cne '0025_add_release_styles') {
        throw 'ProfileAndStyles phase did not select exactly indexes 24-25 (migrations 0024-0025) in order.'
    }

    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    # Index 26 is deliberately future/unapproved and must remain outside both release phases.
    $journal.entries += [pscustomobject]@{
        idx = 26
        version = '7'
        when = 1794300000000
        tag = '0026_unapproved_future_migration'
        breakpoints = $true
    }

    $futureJournalPath = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-future-journal-" + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $journal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $futureJournalPath
        $futureRelease = @(Get-ProductionMigrationEntries -Phase ReleaseCandidate -JournalPath $futureJournalPath)
        $futureProfileAndStyles = @(Get-ProductionMigrationEntries -Phase ProfileAndStyles -JournalPath $futureJournalPath)
        if ($futureRelease.Count -ne 4 -or @($futureRelease | Where-Object { $_.idx -gt 23 }).Count -ne 0) {
            throw 'ReleaseCandidate phase selected a later unapproved journal entry.'
        }
        if ($futureProfileAndStyles.Count -ne 2 -or ($futureProfileAndStyles.idx -join ',') -cne '24,25') {
            throw 'ProfileAndStyles phase selected a later unapproved journal entry.'
        }
    }
    finally {
        if (Test-Path -LiteralPath $futureJournalPath) {
            Remove-Item -LiteralPath $futureJournalPath -Force
        }
    }

    foreach ($driftIndex in 21, 22, 23, 24, 25) {
        $invalidJournalPath = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-invalid-journal-" + [guid]::NewGuid().ToString('N') + '.json')
        try {
            $invalidJournal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
            $invalidJournal.entries[$driftIndex].tag = "unexpected_migration_$driftIndex"
            $invalidJournal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $invalidJournalPath
            $threw = $false
            try {
                $phaseToCheck = if ($driftIndex -le 23) { 'ReleaseCandidate' } else { 'ProfileAndStyles' }
                Get-ProductionMigrationEntries -Phase $phaseToCheck -JournalPath $invalidJournalPath | Out-Null
            }
            catch {
                $threw = $true
            }
            if (-not $threw) {
                throw "ReleaseCandidate phase accepted a replaced migration entry at index $driftIndex."
            }
        }
        finally {
            if (Test-Path -LiteralPath $invalidJournalPath) {
                Remove-Item -LiteralPath $invalidJournalPath -Force
            }
        }
    }

    foreach ($affectedIndex in 24, 25) {
        foreach ($case in 'missing', 'duplicate') {
            $invalidJournalPath = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-$case-journal-" + [guid]::NewGuid().ToString('N') + '.json')
            try {
                $invalidJournal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
                if ($case -eq 'missing') {
                    $invalidJournal.entries = @($invalidJournal.entries | Where-Object { [int]$_.idx -ne $affectedIndex })
                }
                else {
                    $entryToDuplicate = @($invalidJournal.entries | Where-Object { [int]$_.idx -eq $affectedIndex })[0]
                    $invalidJournal.entries += $entryToDuplicate
                }
                $invalidJournal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $invalidJournalPath
                $threw = $false
                try {
                    Get-ProductionMigrationEntries -Phase ProfileAndStyles -JournalPath $invalidJournalPath | Out-Null
                }
                catch {
                    $threw = $true
                }
                if (-not $threw) {
                    throw "ProfileAndStyles accepted a $case journal entry at index $affectedIndex."
                }
            }
            finally {
                if (Test-Path -LiteralPath $invalidJournalPath) {
                    Remove-Item -LiteralPath $invalidJournalPath -Force
                }
            }
        }
    }

    Write-Host 'PASS: production migration phases select only their pinned index ranges and reject journal drift'
}

function Test-ReleaseCandidateStoragePreflightRunsBeforeDrizzle {
    $runnerSource = Get-Content -LiteralPath $migrationRunnerPath -Raw
    $preflightInvocation = '& $tsxPath (Join-Path (Get-Location) ''scripts/verifyProductionStoragePolicies.ts'')'
    $firstPreflight = $runnerSource.IndexOf($preflightInvocation)
    $confirmation = $runnerSource.IndexOf('$confirmation = Read-Host')
    $finalPreflight = $runnerSource.LastIndexOf($preflightInvocation)
    $drizzleMigration = $runnerSource.IndexOf('& $drizzleKitPath migrate')

    if ($firstPreflight -lt 0 -or $finalPreflight -le $firstPreflight) {
        throw 'ReleaseCandidate runner must perform an initial and a final Storage policy preflight.'
    }
    if ($firstPreflight -ge $confirmation) {
        throw 'The initial Storage policy preflight must run before the typed migration confirmation.'
    }
    if ($finalPreflight -ge $drizzleMigration) {
        throw 'The final Storage policy preflight must run immediately before Drizzle migration execution.'
    }

    Write-Host 'PASS: ReleaseCandidate checks exact Storage policies before confirmation and again before Drizzle starts'
}


function Test-ProfileAndStylesLedgerPreflightRunsBeforeDrizzle {
    $runnerSource = Get-Content -LiteralPath $migrationRunnerPath -Raw
    $preflightInvocation = "& $tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigrationBaseline.ts')"
    $firstPreflight = $runnerSource.IndexOf($preflightInvocation)
    $confirmation = $runnerSource.IndexOf('$confirmation = Read-Host')
    $finalPreflight = $runnerSource.LastIndexOf($preflightInvocation)
    $drizzleMigration = $runnerSource.IndexOf('& $drizzleKitPath migrate')

    if ($firstPreflight -lt 0 -or $finalPreflight -le $firstPreflight) {
        throw 'ProfileAndStyles must perform two read-only production ledger baseline checks.'
    }
    if ($firstPreflight -ge $confirmation -or $finalPreflight -le $confirmation) {
        throw 'ProfileAndStyles must check the production ledger before confirmation and repeat it after confirmation.'
    }
    if ($finalPreflight -ge $drizzleMigration) {
        throw 'The final production ledger baseline check must run immediately before Drizzle starts.'
    }

    Write-Host 'PASS: ProfileAndStyles validates the exact production ledger baseline twice before Drizzle'
}

function Test-ProfileAndStylesRunnerStopsWithoutLocalTsx {
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-runner-no-tsx-" + [guid]::NewGuid().ToString('N'))
    $locationPushed = $false

    try {
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'drizzle/meta') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'scripts') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'drizzle') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'node_modules/.bin') -Force | Out-Null
        Copy-Item -LiteralPath $migrationPlanPath -Destination (Join-Path $tempRoot 'scripts/productionMigrationPlan.ps1')
        Copy-Item -LiteralPath $journalPath -Destination (Join-Path $tempRoot 'drizzle/meta/_journal.json')
        Set-Content -LiteralPath (Join-Path $tempRoot 'package.json') -Value '{}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle.config.ts') -Value 'export default {}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'check-production-db-target.ps1') -Value '# test stub' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'scripts/verifyProductionMigrationBaseline.ts') -Value '// test stub' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle/0024_profile_avatars_and_music_links.sql') -Value '-- test stub' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle/0025_add_release_styles.sql') -Value '-- test stub' -NoNewline

        $drizzleBinary = if ($env:OS -eq 'Windows_NT') { 'drizzle-kit.cmd' } else { 'drizzle-kit' }
        Set-Content -LiteralPath (Join-Path $tempRoot "node_modules/.bin/$drizzleBinary") -Value '# test stub' -NoNewline
        # Intentionally do not create any local tsx binary.

        Push-Location $tempRoot
        $locationPushed = $true
        $output = & $pwsh.Source -NoProfile -File $migrationRunnerPath -Phase ProfileAndStyles *>&1 | Out-String
        $actualExitCode = $LASTEXITCODE

        if ($actualExitCode -eq 0) {
            throw "ProfileAndStyles runner unexpectedly continued without the lockfile-installed local tsx binary. Output: $output"
        }
        if ($output -notmatch 'lockfile-installed local tsx binary is missing') {
            throw "ProfileAndStyles runner did not stop with the expected local-tsx error. Output: $output"
        }
        if ($output -match 'Enter the production database password|APPLY-PRODUCTION-PROFILE-AND-STYLES') {
            throw 'ProfileAndStyles runner prompted for production credentials or confirmation before locating local tsx.'
        }
        if ($output.Contains($testPassword)) {
            throw 'ProfileAndStyles runner unexpectedly printed the test connection password.'
        }

        Write-Host 'PASS: ProfileAndStyles stops before password entry when local tsx is missing'
    }
    finally {
        if ($locationPushed) {
            Pop-Location
        }
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Test-MigrationRunnerStopsWithoutLocalDrizzleKit {
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-runner-preflight-" + [guid]::NewGuid().ToString('N'))
    $locationPushed = $false

    try {
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'drizzle/meta') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'scripts') -Force | Out-Null
        Copy-Item -LiteralPath $migrationPlanPath -Destination (Join-Path $tempRoot 'scripts/productionMigrationPlan.ps1')
        Set-Content -LiteralPath (Join-Path $tempRoot 'package.json') -Value '{}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle.config.ts') -Value 'export default {}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle/meta/_journal.json') -Value '{}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'check-production-db-target.ps1') -Value '# test stub' -NoNewline
        # Intentionally do not create node_modules/.bin/drizzle-kit.

        Push-Location $tempRoot
        $locationPushed = $true
        $output = & $pwsh.Source -NoProfile -File $migrationRunnerPath -Phase Base *>&1 | Out-String
        $actualExitCode = $LASTEXITCODE

        if ($actualExitCode -eq 0) {
            throw "Migration runner unexpectedly continued without the locked local Drizzle Kit binary. Output: $output"
        }
        if ($output -notmatch 'lockfile-installed local drizzle-kit binary is missing') {
            throw "Migration runner did not stop with the expected actionable local-binary error. Output: $output"
        }
        if ($output -match 'Enter the production database password|APPLY-PRODUCTION-BASE-MIGRATIONS-0000-0005') {
            throw 'Migration runner prompted for a production credential or confirmation before checking the local Drizzle Kit binary.'
        }
        if ($output.Contains($testPassword)) {
            throw 'Migration runner unexpectedly printed a test connection password.'
        }

        Write-Host 'PASS: migration runner stops before password entry when the locked local Drizzle Kit binary is missing'
    }
    finally {
        if ($locationPushed) {
            Pop-Location
        }
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Push-Location $repositoryRoot
try {
    Test-PinnedProductionMigrationPlans
    Test-ReleaseCandidateStoragePreflightRunsBeforeDrizzle
    Test-ProfileAndStylesLedgerPreflightRunsBeforeDrizzle
    Invoke-PreflightCase -Name 'approved production project with TLS' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 0
    Invoke-PreflightCase -Name 'known staging project is rejected' -ProjectRef 'xuhzhdjmgvqzjxijmksu' -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'valid-looking but unapproved project is rejected' -ProjectRef 'aaaaaaaaaaaaaaaaaaaa' -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'unapproved pooler host is rejected' -ProjectRef $expectedProductionRef -PoolerHost 'aws-9-eu-west-1.pooler.supabase.com' -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'TLS prefer mode is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'prefer' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'missing TLS mode is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode '' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'duplicate TLS modes are rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require&sslmode=disable' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'APP_BASE_URL path is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1 -AppBaseUrl 'https://thevinyldrop.nl/wrong-prefix'
    Invoke-PreflightCase -Name 'SUPABASE_URL port override is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1 -SupabaseUrl 'https://anxhmlalxjvatrufcjei.supabase.co:8443'
    Invoke-PreflightCase -Name 'SUPABASE_URL path prefix is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1 -SupabaseUrl 'https://anxhmlalxjvatrufcjei.supabase.co/prefix/'
    Test-MigrationRunnerStopsWithoutLocalDrizzleKit
    Test-ProfileAndStylesRunnerStopsWithoutLocalTsx
}
finally {
    Pop-Location
}

Write-Host 'All production preflight and pinned migration-plan regression cases passed.'
exit 0
