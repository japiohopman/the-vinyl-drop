$ErrorActionPreference = 'Stop'

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwsh) {
    throw 'PowerShell 7 (pwsh) is required to run the production migration 0026 regression tests.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repositoryRoot 'run-production-special-pressings-migration.ps1'
$planPath = Join-Path $repositoryRoot 'scripts/productionMigration0026Plan.ps1'
$journalPath = Join-Path $repositoryRoot 'drizzle/meta/_journal.json'
$verifierPath = Join-Path $repositoryRoot 'scripts/verifyProductionMigration0026.ts'
$sqlPath = Join-Path $repositoryRoot 'drizzle/0026_release_content_type_and_special_pressing.sql'

. $planPath

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $threw = $false
    try {
        & $Action | Out-Null
    }
    catch {
        $threw = $true
    }
    if (-not $threw) {
        throw "$Name unexpectedly passed."
    }
}

function Test-PinnedMigration0026Plan {
    $entry = Get-PinnedProductionMigration0026Entry -JournalPath $journalPath
    if ([int]$entry.idx -ne 26 -or $entry.tag -cne '0026_release_content_type_and_special_pressing') {
        throw 'The production migration 0026 plan did not select exactly index 26.'
    }

    $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
    $tempJournal = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-0026-journal-" + [guid]::NewGuid().ToString('N') + '.json')
    try {
        $journal.entries[26].tag = '0026_unapproved_migration'
        $journal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tempJournal
        Assert-Throws { Get-PinnedProductionMigration0026Entry -JournalPath $tempJournal } 'Replaced migration 0026 tag'
    }
    finally {
        if (Test-Path -LiteralPath $tempJournal) { Remove-Item -LiteralPath $tempJournal -Force }
    }

    foreach ($case in 'missing', 'duplicate', 'future') {
        $tempJournal = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-0026-$case-" + [guid]::NewGuid().ToString('N') + '.json')
        try {
            $journal = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
            if ($case -eq 'missing') {
                $journal.entries = @($journal.entries | Where-Object { [int]$_.idx -ne 26 })
            }
            elseif ($case -eq 'duplicate') {
                $journal.entries += $journal.entries[26]
            }
            else {
                $journal.entries += [pscustomobject]@{
                    idx = 27
                    version = '7'
                    when = 1795000000000
                    tag = '0027_future_migration'
                    breakpoints = $true
                }
            }
            $journal | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $tempJournal
            Assert-Throws { Get-PinnedProductionMigration0026Entry -JournalPath $tempJournal } "Journal $case entry"
        }
        finally {
            if (Test-Path -LiteralPath $tempJournal) { Remove-Item -LiteralPath $tempJournal -Force }
        }
    }

    Write-Host 'PASS: production migration plan selects only the pinned 0026 entry and rejects journal drift'
}

function Test-Production0026RunnerOrdering {
    $source = Get-Content -LiteralPath $runnerPath -Raw
    $preflightInvocation = "& `$tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigration0026.ts') preflight"
    $completeInvocation = "& `$tsxPath (Join-Path (Get-Location) 'scripts/verifyProductionMigration0026.ts') complete"
    $firstPreflight = $source.IndexOf($preflightInvocation)
    $confirmation = $source.IndexOf('$confirmation = Read-Host')
    $lastPreflight = $source.LastIndexOf($preflightInvocation)
    $drizzle = $source.IndexOf('& $drizzleKitPath migrate')
    $complete = $source.IndexOf($completeInvocation)

    if ($firstPreflight -lt 0 -or $lastPreflight -le $firstPreflight) {
        throw 'The new runner must perform an initial and a final read-only 0026 baseline preflight.'
    }
    if ($firstPreflight -ge $confirmation -or $lastPreflight -le $confirmation) {
        throw 'The new runner must verify the baseline before confirmation and repeat it after confirmation.'
    }
    if ($lastPreflight -ge $drizzle) {
        throw 'The final read-only preflight must occur before the single Drizzle migration command.'
    }
    if ($complete -le $drizzle) {
        throw 'Post-migration schema and constraint verification must run after Drizzle completes.'
    }
    if (-not $source.Contains('$journal.entries = @($migrationEntry)') -or
        -not $source.Contains('Copy-Item -LiteralPath $migrationPath -Destination $tempMigrationDirectory')) {
        throw 'The temporary Drizzle folder must contain exactly the pinned migration 0026 and its single-entry journal.'
    }
    if ($source -match 'run-production-migrations.ps1|npm run db:migrate|supabase db push') {
        throw 'The dedicated 0026 runner must not reuse another phase or a generic migration command.'
    }

    Write-Host 'PASS: production 0026 runner gates, single-migration selection and post-commit verification are correctly ordered'
}

function Test-RunnerStopsWhenLocalTsxIsMissing {
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("tvd-production-0026-no-tsx-" + [guid]::NewGuid().ToString('N'))
    $locationPushed = $false

    try {
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'drizzle/meta') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'scripts') -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $tempRoot 'node_modules/.bin') -Force | Out-Null
        Copy-Item -LiteralPath $planPath -Destination (Join-Path $tempRoot 'scripts/productionMigration0026Plan.ps1')
        Copy-Item -LiteralPath $journalPath -Destination (Join-Path $tempRoot 'drizzle/meta/_journal.json')
        Set-Content -LiteralPath (Join-Path $tempRoot 'package.json') -Value '{}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle.config.ts') -Value 'export default {}' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'drizzle/0026_release_content_type_and_special_pressing.sql') -Value '-- test stub' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'check-production-db-target.ps1') -Value '# test stub' -NoNewline
        Set-Content -LiteralPath (Join-Path $tempRoot 'scripts/verifyProductionMigration0026.ts') -Value '// test stub' -NoNewline

        $drizzleBinary = if ($env:OS -eq 'Windows_NT') { 'drizzle-kit.cmd' } else { 'drizzle-kit' }
        Set-Content -LiteralPath (Join-Path $tempRoot "node_modules/.bin/$drizzleBinary") -Value '# test stub' -NoNewline
        # No tsx binary is created.

        Push-Location $tempRoot
        $locationPushed = $true
        $output = & $pwsh.Source -NoProfile -File $runnerPath *>&1 | Out-String
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0 -or $output -notmatch 'lockfile-installed local tsx binary is missing') {
            throw "The runner did not fail closed when local tsx was missing. Output: $output"
        }
        if ($output -match 'Enter the production database password|APPLY-PRODUCTION-SPECIAL-PRESSINGS-MIGRATION-0026') {
            throw 'The runner asked for a production password or confirmation before validating local dependencies.'
        }

        Write-Host 'PASS: production 0026 runner stops before password entry when local tsx is unavailable'
    }
    finally {
        if ($locationPushed) { Pop-Location }
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Push-Location $repositoryRoot
try {
    Test-PinnedMigration0026Plan
    Test-Production0026RunnerOrdering
    Test-RunnerStopsWhenLocalTsxIsMissing
}
finally {
    Pop-Location
}

Write-Host 'All production migration 0026 regression cases passed.'
exit 0
