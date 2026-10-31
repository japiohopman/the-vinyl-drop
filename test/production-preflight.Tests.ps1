$ErrorActionPreference = 'Stop'

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwsh) {
    throw 'PowerShell 7 (pwsh) is required to run the production preflight regression tests.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$preflightPath = Join-Path $repositoryRoot 'check-production-db-target.ps1'
$expectedProductionRef = 'anxhmlalxjvatrufcjei'
$expectedProductionHost = 'aws-0-eu-west-1.pooler.supabase.com'
$testPassword = 'preflight-test-password-not-a-secret'

function Invoke-PreflightCase {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ProjectRef,
        [Parameter(Mandatory = $true)][string]$PoolerHost,
        [Parameter(Mandatory = $true)][string]$SslMode,
        [Parameter(Mandatory = $true)][int]$ExpectedExitCode
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
        [Environment]::SetEnvironmentVariable('APP_BASE_URL', 'https://thevinyldrop.nl', 'Process')
        [Environment]::SetEnvironmentVariable('ALLOWED_REDIRECT_URLS', 'https://thevinyldrop.nl', 'Process')
        [Environment]::SetEnvironmentVariable('SUPABASE_URL', 'https://' + $ProjectRef + '.supabase.co', 'Process')

        $user = 'postgres.' + $ProjectRef
        $query = if ([string]::IsNullOrWhiteSpace($SslMode)) { '' } else { '?sslmode=' + $SslMode }
        $connection = 'postgresql://' + $user + ':' + $testPassword + '@' + $PoolerHost + ':5432/postgres' + $query
        [Environment]::SetEnvironmentVariable('DATABASE_URL', $connection, 'Process')
        [Environment]::SetEnvironmentVariable('DATABASE_DIRECT_URL', $connection, 'Process')

        $output = & $pwsh.Source -NoProfile -File $preflightPath 2>&1 | Out-String
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

Push-Location $repositoryRoot
try {
    Invoke-PreflightCase -Name 'approved production project with TLS' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 0
    Invoke-PreflightCase -Name 'known staging project is rejected' -ProjectRef 'xuhzhdjmgvqzjxijmksu' -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'valid-looking but unapproved project is rejected' -ProjectRef 'aaaaaaaaaaaaaaaaaaaa' -PoolerHost $expectedProductionHost -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'unapproved pooler host is rejected' -ProjectRef $expectedProductionRef -PoolerHost 'aws-9-eu-west-1.pooler.supabase.com' -SslMode 'require' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'TLS prefer mode is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode 'prefer' -ExpectedExitCode 1
    Invoke-PreflightCase -Name 'missing TLS mode is rejected' -ProjectRef $expectedProductionRef -PoolerHost $expectedProductionHost -SslMode '' -ExpectedExitCode 1
}
finally {
    Pop-Location
}
