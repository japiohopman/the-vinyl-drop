---
name: safe-migration-rollout
description: Use when adding, reviewing, verifying or applying PostgreSQL/Drizzle schema migrations or coordinating staging/production database rollout.
---

# Safe migration rollout — The Vinyl Drop

## Read first

- docs/AGENT_GUIDE.md, docs/DATA_ARCHITECTURE.md, docs/DOMAIN_MODEL.md and docs/AGENTIC_WORKFLOW.md.
- docs/STAGING_BETA_DEPLOYMENT.md or docs/PRODUCTION_DEPLOYMENT.md for the exact target environment.
- Current drizzle/meta/_journal.json, migration SQL under drizzle/, src/db/ and scripts/verify-migration.ts.
- The governing Issue and any pinned migration runner/preflight scripts it names.

## Sequence

1. Confirm the exact Issue, migration purpose, target environment and owner-approved scope. Staging and production are separate databases; never infer parity.
2. Inspect current schema, migration journal, migration ledger expectations, SQL and dependent application code. Check ordering and whether existing data must be backfilled or preserved.
3. Prefer additive, compatible changes for rolling application deployment. Account for lock duration, index build/write cost, uniqueness conflicts, nullability and RLS/storage policies.
4. Verify the upgrade path in isolation with the repository's migration verification commands and tests. npm run db:verify and PGlite prove isolated behavior only; they do not prove a remote target is migrated.
5. Before any target apply, stop and require explicit owner authorization naming staging or production and the exact runner/SQL. Run the target-specific read-only preflight first and record its output.
6. Apply only the approved migration to the named target using the pinned runner. Never improvise a manual alternate SQL path to bypass a failed preflight.
7. Independently verify the target schema, migration ledger/hash, policies and expected data using read-only checks. Report the exact target and timestamp.
8. Treat application deployment as a separate action with its own approval. A merged migration PR does not authorize production deployment or flags/settings changes.

## TVD-specific invariants

- Drizzle SQL migration files, drizzle/meta/_journal.json and the target database's Drizzle ledger must agree. A local journal or PGlite test is not a live ledger.
- Respect the pinned production migration runner when an Issue supplies one. Do not skip older unresolved migrations or assume staging's later migration history applies to production.
- Keep PostgreSQL schema, private schemas, RLS and Supabase Storage policies aligned with the app's data visibility and ownership rules.
- Never place secrets, connection URLs, tokens or private production data in a migration, Issue, PR, screenshot or test output.
- Do not run migrations, seed scripts, repair tools, reset statistics or destructive diagnostics against a remote database without explicit target-specific authorization.

## Output evidence

Report the exact files and migration IDs changed; isolated test command and result; target preflight command and result; whether a remote apply was authorized/performed; independent post-apply checks; and separate application deployment status. Mark inaccessible or unverified target stages as blocked, not passed.
