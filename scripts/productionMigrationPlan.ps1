# Explicit, append-only migration ranges for the isolated production environment.
# A later journal entry must never be picked up by an earlier phase.
$script:ProductionMigrationExpectedTags = @(
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
    '0025_add_release_styles'
)

$script:ProductionMigrationPhaseRanges = @{
    Base = @{
        StartIndex = 0
        EndIndex = 5
    }
    Complete = @{
        StartIndex = 6
        EndIndex = 19
    }
    ReleaseCandidate = @{
        StartIndex = 20
        EndIndex = 23
    }
    ProfileAndStyles = @{
        StartIndex = 24
        EndIndex = 25
    }
}

function Get-ProductionMigrationEntries {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('Base', 'Complete', 'ReleaseCandidate')]
        [string]$Phase,

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

    if ($journal.version -cne '7' -or $journal.dialect -cne 'postgresql') {
        throw 'Unexpected Drizzle migration journal version or dialect; refusing to select migrations.'
    }

    $range = $script:ProductionMigrationPhaseRanges[$Phase]
    if (-not $range) {
        throw "No pinned migration range is defined for phase $Phase."
    }

    $selectedEntries = @()
    $previousTimestamp = [int64]0

    # Validate the complete historical prefix through the phase's end index.
    # Only the requested phase's sub-range is returned to the migration runner.
    for ($index = 0; $index -le $range.EndIndex; $index++) {
        $matches = @($journal.entries | Where-Object { [int]$_.idx -eq $index })
        if ($matches.Count -ne 1) {
            throw "Expected exactly one journal entry for migration index $index; found $($matches.Count)."
        }

        $entry = $matches[0]
        $expectedTag = $script:ProductionMigrationExpectedTags[$index]
        if ($entry.tag -cne $expectedTag) {
            throw "Migration index $index must be '$expectedTag'; found '$($entry.tag)'."
        }

        $timestamp = [int64]$entry.when
        if ($timestamp -le $previousTimestamp) {
            throw "Migration timestamps are not strictly increasing at index $index."
        }
        $previousTimestamp = $timestamp

        if ($index -ge $range.StartIndex) {
            $selectedEntries += $entry
        }
    }

    $expectedCount = $range.EndIndex - $range.StartIndex + 1
    if ($selectedEntries.Count -ne $expectedCount) {
        throw "Phase $Phase should select exactly $expectedCount migrations; found $($selectedEntries.Count)."
    }

    return $selectedEntries
}
