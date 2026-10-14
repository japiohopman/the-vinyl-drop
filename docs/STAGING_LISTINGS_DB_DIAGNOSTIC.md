# Staging listings database diagnostic

This is a separate, explicitly opt-in diagnostic for the **known staging Supabase project only**. It does not loosen the loopback-only local helper.

## Safety boundary

- It accepts only the staging project's Supabase pooler URL shape and project-specific database username. It refuses other Supabase projects, direct database hosts, local URLs, and non-PostgreSQL URLs before connecting.
- It requires a one-command PowerShell confirmation. Keep this confirmation out of .env.
- It requires the staging database's trusted root certificate, enforces certificate-verified TLS, uses a single connection, and disables prepared statements.
- It uses the session pooler (port 5432). If DATABASE_URL currently uses the transaction pooler's port 6543, the diagnostic switches only the port while preserving the allowlisted staging host, database, user, and password. This avoids the Postgres.js transaction-pooler pipelining limitation for a multi-query transaction.
- Every diagnostic query runs inside a PostgreSQL READ ONLY transaction with short statement, lock, and idle timeouts. There are no migration, update, insert, delete, DDL, or storage calls.
- It checks whether public.profiles.website_url exists, whether Drizzle migration history is present and includes migration 0004 or later, then calls the application's real getHomeFeedListings(6) function within a read-only transaction.
- Output contains only check statuses, booleans, the number of returned cards, validated SQLSTATE codes, allowlisted generic error-type labels, and up to six allowlisted source-location labels with line/column numbers for a failed homepage query, prioritizing application frames over dependency/runtime frames when available. It does not print connection URLs, usernames, absolute paths, row values, cookies, tokens, raw error text, arbitrary class names, function names, or query text.

The staging project reference allowed by the script is xuhzhdjmgvqzjxijmksu. Before running, verify in the Supabase dashboard that your local DATABASE_URL belongs to that staging project. Do not run this diagnostic against production.

## Preparation

In the Supabase dashboard for the staging project, open **Settings → Database → SSL Configuration** and download the database root certificate. Store it outside the repository; do not commit it. The script refuses to connect if the certificate path is absent or unreadable.

## Run

From the repository root in PowerShell, after reviewing the target project and downloading the certificate, set the temporary values to the actual certificate path and the explicit confirmation:

    $env:TVD_SUPABASE_DB_CA_PATH = "$HOME\Documents\Supabase\staging-db-ca.crt"
    $env:TVD_CONFIRM_STAGING_READONLY_DB_DIAGNOSTIC = 'CONFIRM_STAGING_READ_ONLY'
    npm run db:diagnose:listings:remote
    Remove-Item Env:TVD_CONFIRM_STAGING_READONLY_DB_DIAGNOSTIC
    Remove-Item Env:TVD_SUPABASE_DB_CA_PATH

The example path is a placeholder; use the path where you saved the certificate. The confirmation is intentionally temporary. If the script refuses the URL, certificate or confirmation, do not bypass its guards. If the query reports a failure, share only the emitted JSON status report; do not share .env, the full database URL, its password, or the certificate contents.

A successful diagnostic is evidence about the configured staging database only. It is not production verification and does not by itself close Issue #87.
