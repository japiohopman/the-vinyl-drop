# Staging listings database diagnostic

This is a separate, explicitly opt-in diagnostic for the **known staging Supabase project only**. It does not loosen the loopback-only local helper.

## Safety boundary

- It accepts only the staging project's Supabase pooler URL shape and project-specific database username. It refuses other Supabase projects, direct database hosts, local URLs, and non-PostgreSQL URLs before connecting.
- It requires a one-command PowerShell confirmation. Keep this confirmation out of .env.
- It forces certificate-verified TLS, uses a single connection, disables prepared statements for pooler compatibility, and runs each check inside a PostgreSQL READ ONLY transaction.
- Each transaction uses short statement/lock/idle timeouts. There are no migration, update, insert, delete, DDL, or storage calls.
- It checks whether public.profiles.website_url exists, whether Drizzle migration history is present and includes migration 0004 or later, then calls the application's real getHomeFeedListings(6) function within the read-only transaction.
- Output contains only check statuses, booleans, the number of returned cards, and validated SQLSTATE codes. It does not print connection URLs, usernames, row values, cookies, tokens, raw error text, or query text.

The staging project reference allowed by the script is xuhzhdjmgvqzjxijmksu. Before running, verify in the Supabase dashboard that your local DATABASE_URL belongs to that staging project. Do not run this diagnostic against production.

## Run

From the repository root in PowerShell, after reviewing the target project:

    $env:TVD_CONFIRM_STAGING_READONLY_DB_DIAGNOSTIC = 'CONFIRM_STAGING_READ_ONLY'
    npm run db:diagnose:listings:remote
    Remove-Item Env:TVD_CONFIRM_STAGING_READONLY_DB_DIAGNOSTIC

The confirmation is intentionally temporary. If the script refuses the URL, do not bypass the allowlist. If the query reports a failure, share only the emitted JSON status report; do not share .env, the full database URL, or its password.

A successful diagnostic is evidence about the configured staging database only. It is not production verification and does not by itself close Issue #87.
