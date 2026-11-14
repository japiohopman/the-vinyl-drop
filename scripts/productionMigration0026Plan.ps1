# Pinned production migration 0026 plan. Keep separate from the existing 0024-0025 phase.
$script:ProductionMigration0026ExpectedTags = @(
    '0000_grey_living_tribunal',
    '0001_add_physical_copies',
    '0002_add_release_cover_art',
    '0003_brainy_scarlet_witch',
    '0004_mighty_spacker_dave',
    '0005_enforce_least_privilege_rls',
    '0006_storage_objects_rls',
    '0007_add_orphaned_storage_objects',
    '0008_private_conversations_messages',
    '0009_case_insensitive_usernames',
    '0010_supabase_data_api_read_only',
    '0011_password_checked_signup_hook',
    '0012_pin_messaging_trigger_search_path',
    '0013_private_registration_consents',
    '0014_add_listing_photo_roles',
    '0015_dismiss_completed_listings',
    '0016_direct_conversations_and_sequence_cursor',
    '0017_saved_people',
    '0018_add_release_youtube_preview',
    '0019_shared_rate_limit_buckets',
    '0020_catalogue_search_trigram',
    '0021_release_metadata_vocabulary',
    '0022_listing_photo_source_versions',
    '0023_block_new_google_oauth_identities',
    '0024_profile_avatars_and_music_links',
    '0025_add_release_styles',
    '0026_release_content_type_and_special_pressing'
)

function Get-PinnedProductionMigration0026Entry {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$JournalPath
    )

    if (-not (Test-Path -LiteralPath $JournalPath -PathType Leaf)) {
        throw "Migration journal not found: $JournalPath"
    }

    try {
        $journal = Get-Content -LiteralPath $JournalPath -Raw | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw 'Migration journal is not valid JSON.'
    }

    if ($journal.version -cne '7' -or $journal.dialect -cne 'postgresql' -or $journal.entries -isnot [array]) {
        throw 'Unexpected Drizzle migration journal version, dialect or entries; refusing migration 0026.'
    }

    if ($journal.entries.Count -ne $script:ProductionMigration0026ExpectedTags.Count) {
        throw 'The migration journal must contain exactly the approved 0000-0026 prefix; later or missing entries are not accepted.'
    }

    $previousTimestamp = [int64]0
    $selectedEntry = $null
    for ($index = 0; $index -lt $script:ProductionMigration0026ExpectedTags.Count; $index++) {
        if ([int]$journal.entries[$index].idx -ne $index) {
            throw 'Migration journal entries must remain in exact ascending index order.'
        }
        $matches = @($journal.entries | Where-Object { [int]$_.idx -eq $index })
        if ($matches.Count -ne 1) {
            throw "Expected exactly one journal entry for migration index $index; found $($matches.Count)."
        }

        $entry = $matches[0]
        $expectedTag = $script:ProductionMigration0026ExpectedTags[$index]
        if ($entry.tag -cne $expectedTag) {
            throw "Migration index $index must be '$expectedTag'; found '$($entry.tag)'."
        }

        $timestamp = [int64]$entry.when
        if ($timestamp -le $previousTimestamp) {
            throw "Migration timestamps are not strictly increasing at index $index."
        }
        $previousTimestamp = $timestamp

        if ($index -eq 26) {
            $selectedEntry = $entry
        }
    }

    if ($null -eq $selectedEntry -or $selectedEntry.tag -cne '0026_release_content_type_and_special_pressing') {
        throw 'The production migration plan did not resolve exactly migration 0026.'
    }

    return $selectedEntry
}
