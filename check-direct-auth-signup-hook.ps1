$ErrorActionPreference = 'Stop'

# This script sends ONE direct signup request to the approved staging Supabase project.
# It does not send signup_approval_id or user_metadata.
# It never prints the public API key or generated temporary password.

$ProjectRef = 'xuhzhdjmgvqzjxijmksu'
$ProjectUrl = "https://$ProjectRef.supabase.co"

$PublicKey = Read-Host 'Plak de PUBLIEKE staging anon/publishable API-key'
if ([string]::IsNullOrWhiteSpace($PublicKey)) {
    throw 'Geen publieke API-key opgegeven. Er is geen request verstuurd.'
}

$Email = Read-Host 'Vul een VERS staging-testadres in dat je beheert (geen bestaand account)'
if ([string]::IsNullOrWhiteSpace($Email) -or $Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
    throw 'Het testadres ontbreekt of heeft geen geldig e-mailformaat. Er is geen request verstuurd.'
}

$TemporaryPassword = ([guid]::NewGuid().ToString('N') + 'Aa1!')
$Payload = @{
    email    = $Email.Trim()
    password = $TemporaryPassword
} | ConvertTo-Json -Compress

$Client = $null
$Request = $null
$Response = $null
$StatusCode = $null
$ResponseText = ''

try {
    $Client = [System.Net.Http.HttpClient]::new()
    $Request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::Post,
        "$ProjectUrl/auth/v1/signup"
    )
    $Request.Headers.Add('apikey', $PublicKey.Trim())
    $Request.Content = [System.Net.Http.StringContent]::new(
        $Payload,
        [System.Text.Encoding]::UTF8,
        'application/json'
    )

    # Read the body before disposing the response, including for HTTP 4xx responses.
    $Response = $Client.SendAsync($Request).GetAwaiter().GetResult()
    $StatusCode = [int]$Response.StatusCode
    $ResponseText = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
}
catch {
    Write-Host 'Geen bruikbaar HTTP-antwoord ontvangen; resultaat is ONBESLIST.' -ForegroundColor Yellow
    Write-Host "Fouttype: $($_.Exception.GetType().Name)"
    return
}
finally {
    if ($null -ne $Response) { $Response.Dispose() }
    if ($null -ne $Request) { $Request.Dispose() }
    if ($null -ne $Client) { $Client.Dispose() }
}

$Result = $null
try {
    $Result = $ResponseText | ConvertFrom-Json -ErrorAction Stop
}
catch {
    # Do not print the raw response; it may contain sensitive fields.
}

$Message = $null
if ($Result -and $Result.msg) {
    $Message = [string]$Result.msg
}
elseif ($Result -and $Result.message) {
    $Message = [string]$Result.message
}
elseif ($Result -and $Result.error_description) {
    $Message = [string]$Result.error_description
}
elseif ($Result -and $Result.error -is [string]) {
    $Message = [string]$Result.error
}
elseif ($Result -and $Result.error -and $Result.error.message) {
    $Message = [string]$Result.error.message
}

Write-Host ''
Write-Host "HTTP-status: $StatusCode"
Write-Host "Staging-test-email: $Email"
if ($Message) {
    Write-Host "Servermelding: $Message"
} else {
    Write-Host 'Servermelding: geen herkenbare foutmelding in de response.'
}

if ($StatusCode -ge 400 -and $Message -like '*Email sign-up must use The Vinyl Drop password-security check*') {
    Write-Host 'PASS: de Before User Created-hook heeft de directe aanmelding zonder goedkeuring geweigerd.' -ForegroundColor Green
}
elseif ($StatusCode -ge 400) {
    Write-Host 'ONBESLIST: de aanvraag is geweigerd, maar de specifieke hook-weigering is niet bevestigd.' -ForegroundColor Yellow
}
else {
    Write-Host 'FAIL: de aanvraag is niet geweigerd. Controleer Supabase Auth > Users op het opgegeven testadres en verwijder alleen die testgebruiker als deze is aangemaakt.' -ForegroundColor Red
}

# Clear sensitive values from variables best-effort; they are not printed or saved.
$TemporaryPassword = $null
$Payload = $null
$PublicKey = $null
$ResponseText = $null
