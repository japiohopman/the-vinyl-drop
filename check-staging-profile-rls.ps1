$ErrorActionPreference = 'Stop'

$baseUrl = 'https://xuhzhdjmgvqzjxijmksu.supabase.co'
$anonKey = $null
$secureJwt = $null
$jwt = $null
$jwtPtr = [IntPtr]::Zero

function Invoke-StageApi {
    param(
        [ValidateSet('GET', 'PATCH')]
        [string]$RequestMethod,
        [string]$Path,
        [string]$JsonBody
    )

    $headers = @{
        apikey        = $anonKey
        Authorization = "Bearer $jwt"
        Accept        = 'application/json'
    }

    $requestParams = @{
        Uri             = "$baseUrl$Path"
        Method          = $RequestMethod
        Headers         = $headers
        UseBasicParsing = $true
        ErrorAction     = 'Stop'
    }

    if ($RequestMethod -eq 'PATCH') {
        $headers['Prefer'] = 'return=representation'
        $requestParams['ContentType'] = 'application/json'
        $requestParams['Body'] = $JsonBody
    }

    try {
        $response = Invoke-WebRequest @requestParams

        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Content    = [string]$response.Content
        }
    }
    catch {
        $webResponse = $_.Exception.Response

        if ($null -eq $webResponse) {
            throw
        }

        $status = [int]$webResponse.StatusCode
        $content = ''

        try {
            $stream = $webResponse.GetResponseStream()

            if ($null -ne $stream) {
                $reader = [System.IO.StreamReader]::new($stream)
                $content = $reader.ReadToEnd()
                $reader.Dispose()
            }
        }
        catch {}

        return [pscustomobject]@{
            StatusCode = $status
            Content    = $content
        }
    }
}

try {
    $anonKey = Read-Host 'Plak de publieke staging API-key'
    $secureJwt = Read-Host 'Plak de actuele sb-access-token (verborgen)' -AsSecureString

    if ([string]::IsNullOrWhiteSpace($anonKey)) {
        throw 'De publieke API-key ontbreekt.'
    }

    if ($null -eq $secureJwt -or $secureJwt.Length -eq 0) {
        throw 'De access token ontbreekt.'
    }

    $jwtPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureJwt)
    $jwt = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($jwtPtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($jwtPtr)
    $jwtPtr = [IntPtr]::Zero

    # 1. Controleer de geldigheid van de login.
    $auth = Invoke-StageApi -RequestMethod GET -Path '/auth/v1/user'

    if ($auth.StatusCode -ne 200) {
        throw "Logincontrole mislukt: HTTP $($auth.StatusCode). Geen wijziging uitgevoerd."
    }

    $authUser = $auth.Content | ConvertFrom-Json

    # 2. Zoek het eigen profiel.
    $ownResult = Invoke-StageApi -RequestMethod GET -Path (
        "/rest/v1/profiles?select=id,username&id=eq.$($authUser.id)"
    )

    if ($ownResult.StatusCode -ne 200) {
        throw "Controle van het eigen profiel mislukt: HTTP $($ownResult.StatusCode)."
    }

    $ownRows = @($ownResult.Content | ConvertFrom-Json)

    if ($ownRows.Count -ne 1) {
        throw 'Geen eenduidig eigen profiel gevonden. Er is niets bijgewerkt.'
    }

    $own = $ownRows[0]
    Write-Host "Ingelogd profiel: $($own.username)"

    # 3. Kies een ander bestaand stagingprofiel.
    $targetUsername = Read-Host 'Username van een ANDERE staginggebruiker'

    if ($targetUsername -eq $own.username) {
        throw 'Dit is je eigen profiel. Er is niets bijgewerkt.'
    }

    $filter = [Uri]::EscapeDataString("eq.$targetUsername")
    $targetPath = "/rest/v1/profiles?select=id,username,bio,updated_at&username=$filter"

    $beforeResult = Invoke-StageApi -RequestMethod GET -Path $targetPath

    if ($beforeResult.StatusCode -ne 200) {
        throw "Controle van het andere profiel mislukt: HTTP $($beforeResult.StatusCode)."
    }

    $beforeRows = @($beforeResult.Content | ConvertFrom-Json)

    if ($beforeRows.Count -ne 1) {
        throw 'Het andere profiel is niet eenduidig gevonden. Er is niets bijgewerkt.'
    }

    $target = $beforeRows[0]

    if ($target.id -eq $own.id) {
        throw 'Het geselecteerde profiel is je eigen profiel. Test afgebroken.'
    }

    $before = ConvertTo-Json -Compress -InputObject @(
        $target.id, $target.username, $target.bio, $target.updated_at
    )

    # 4. Gerichte RLS-test: dezelfde username terugschrijven.
    # Dit is een echte PATCH en kan een wijziging veroorzaken als de
    # beveiliging onvoldoende is. Daarom controleren we de gegevens erna.
    $patchPath = "/rest/v1/profiles?id=eq.$($target.id)&select=id,username,bio,updated_at"

    $patchBody = ConvertTo-Json -Compress -InputObject @{
        username = [string]$target.username
    }

    $patch = Invoke-StageApi `
        -RequestMethod PATCH `
        -Path $patchPath `
        -JsonBody $patchBody

    $returnedRows = @()

    if (-not [string]::IsNullOrWhiteSpace($patch.Content)) {
        $returnedRows = @($patch.Content | ConvertFrom-Json)
    }

    # 5. Lees het profiel opnieuw en vergelijk de gegevens.
    $afterResult = Invoke-StageApi -RequestMethod GET -Path $targetPath

    if ($afterResult.StatusCode -ne 200) {
        throw "Nacontrole mislukt: HTTP $($afterResult.StatusCode). Stop voor nader onderzoek."
    }

    $afterRows = @($afterResult.Content | ConvertFrom-Json)

    if ($afterRows.Count -ne 1) {
        throw 'Het doelprofiel ontbreekt na de test. Stop voor nader onderzoek.'
    }

    $afterTarget = $afterRows[0]

    $after = ConvertTo-Json -Compress -InputObject @(
        $afterTarget.id, $afterTarget.username, $afterTarget.bio, $afterTarget.updated_at
    )

    $unchanged = ($before -ceq $after)

    Write-Host ''
    Write-Host "Doelprofiel: $($target.username)"
    Write-Host "PATCH HTTP-status: $($patch.StatusCode)"
    Write-Host "Geretourneerde doelrijen: $($returnedRows.Count)"
    Write-Host "Doelgegevens ongewijzigd: $unchanged"

    if ($patch.StatusCode -eq 200 -and
        $returnedRows.Count -eq 0 -and $unchanged) {
        Write-Host 'RESULTAAT: PASS — de update leverde geen doelrij op en de gegevens bleven gelijk.'
    }
    elseif (($patch.StatusCode -eq 401 -or $patch.StatusCode -eq 403) -and
        $returnedRows.Count -eq 0 -and $unchanged) {
        Write-Host 'RESULTAAT: VERZOEK GEWEIGERD — gegevens bleven gelijk; status nader registreren.'
    }
    else {
        Write-Host 'RESULTAAT: NADER ONDERZOEK NODIG.'
        Write-Host 'Stop met verdere tests als gegevens zijn veranderd of een rij is teruggegeven.'
    }
}
finally {
    $jwt = $null
    $anonKey = $null

    if ($jwtPtr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($jwtPtr)
    }

    if ($null -ne $secureJwt) {
        $secureJwt.Dispose()
    }
}