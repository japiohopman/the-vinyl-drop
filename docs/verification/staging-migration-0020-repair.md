# Staging migration 0020 reconciliation

**Scope:** staging project \`xuhzhdjmgvqzjxijmksu\` only.  
**Production project:** \`anxhmlalxjvatrufcjei\` is explicitly out of scope.

## Read-only audit — 11 November 2026

The live staging audit found:

- The Drizzle ledger records the known journal entries through 0019 and then 0021–0025.
- The staging ledger has a surrogate-ID gap at ID 14. The migration timestamps show that 0013 is present; this ID gap must not be "fixed" or renumbered.
- The journal timestamp for \`0020_catalogue_search_trigram\` is missing from the staging ledger.
- \`pg_trgm\` is not installed in the staging \`extensions\` schema.
- The three 0020 GIN trigram indexes on \`public.releases\` are absent.
- Migration 0021–0025 schema effects are present in staging.

Production is different: 0020 and all three indexes are already applied there. Production currently has 0023 as its latest recorded migration; 0024 and 0025 are separate future rollout work.

## Why the ordinary Drizzle command is not a repair

Drizzle ORM 0.45.3 compares journal timestamps with the newest \`created_at\` value in \`drizzle.__drizzle_migrations\`. Because staging already has later entries 0021–0025, the ordinary \`npm run db:migrate\` command will skip the missing 0020. Do not use that command for this repair.

The missing row is identified by the migration's journal timestamp, not by the ledger's numeric \`id\`. The \`id\` is a surrogate primary key. Leave existing IDs and rows untouched; inserting the missing timestamp may receive the next sequence value (currently 27), and that is correct.

## Prerequisites

Use the repository root on a trusted workstation with the lockfile-installed dependencies. Supply the approved staging target through environment variables or the local \`.env\` file:

- \`STAGING_DB_PROJECT_REF=xuhzhdjmgvqzjxijmksu\`
- \`STAGING_DB_HOST=aws-0-eu-west-1.pooler.supabase.com\` when using the shared session pooler, or the exact direct host \`db.xuhzhdjmgvqzjxijmksu.supabase.co\`.
- \`DATABASE_DIRECT_URL\` (preferred) or \`DATABASE_URL\`, using the approved staging host, database \`postgres\`, port 5432 and a password. The script forces TLS with \`ssl: require\`; if the URL includes \`sslmode\`, it must be exactly \`require\`.

The script rejects the production project reference, production host, wrong pooler username, wrong port, alternate TLS modes and unexpected URL parameters. It never prints the connection URL or password.

## Commands

**Audit only — this is the default and never writes:**

\`\`\`powershell
npm run db:repair:staging:0020
\`\`\`

The report identifies whether the correct action would be to create the extension, create one or more missing indexes, or repair only the Drizzle ledger entry. It also refuses to proceed if history, extension placement or an existing index differs from the reviewed contract.

**Apply — only after separate, explicit owner authorization for the live staging database:**

\`\`\`powershell
npm run db:repair:staging:0020 -- --apply
\`\`\`

The apply command additionally requires an interactive terminal and the exact typed confirmation:

\`\`\`text
REPAIR-STAGING-MIGRATION-0020 xuhzhdjmgvqzjxijmksu
\`\`\`

That confirmation is not implied by merging this PR. The owner must separately authorize the actual staging operation.

## What apply does

The script repeats all preconditions after taking a transaction-scoped advisory lock and an exclusive lock on the Drizzle ledger. It uses short lock and statement timeouts, then within one PostgreSQL transaction:

1. Creates the \`extensions\` schema only if absent.
2. Installs \`pg_trgm\` 1.6 into \`extensions\` only if absent.
3. Creates only the missing, correctly defined GIN trigram indexes from migration 0020.
4. Inserts exactly one \`drizzle.__drizzle_migrations\` row with the SHA-256 hash of the checked-out 0020 SQL file and the pinned journal timestamp.
5. Verifies the extension, all three valid indexes and the single ledger timestamp before commit.

If the indexes are already correct but only the migration record is missing, it performs a ledger-only repair. If an index is invalid/wrong, the extension is installed in another schema/version, another migration timestamp is missing/duplicated, or the ledger does not match the known timeline, the tool stops without changing anything. Transaction failures roll back the DDL and ledger insert together.

## Verification and boundaries

- The Jest suite tests target validation and repair planning with in-memory fixtures only. Tests never connect to Supabase.
- Existing \`npm run db:verify\` continues to validate all source migrations against isolated PGlite; it is not evidence of a live staging repair.
- A successful CI run, PR merge, or audit report does not apply the repair.
- Do not change production, Storage buckets/policies, Auth, Render, environment settings, flags, tester access or deployment as part of this procedure.
- Do not apply 0024 or 0025 to production as part of this repair. The missing \`profile-avatars\` bucket/policies remain a separate #351 prerequisite.
