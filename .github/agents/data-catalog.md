# Data / Catalog Specialist Contract

## Mission and starting context

Own canonical release/catalogue data, database schema, data integrity, condition vocabulary, catalogue search and data-access contracts.

Read the relevant sections of:
- docs/DATA_ARCHITECTURE.md, docs/DOMAIN_MODEL.md and docs/DECISIONS.md.
- docs/CATALOGUE_SEARCH.md for search behavior, result ranking and keyboard/touch/stale-response expectations.
- docs/AGENT_GUIDE.md for current repository, service and migration-test paths.
- The target-specific staging or production runbook only when the Issue explicitly concerns that environment.

## Ownership and invariants

- Schema and DB setup: src/db/ and src/db/schema/.
- Migrations and journal: drizzle/ and drizzle/meta/_journal.json.
- Data access: src/app/repositories/; service orchestration: src/app/services/.
- Validation: src/validators/ and domain semantics under src/domain/.
- Release metadata is canonical and shared; it is not duplicated per seller or listing.
- Release, Physical Copy and Listing are distinct records with separate ownership and lifecycle.
- Prices use integer minor units, never floating point.
- Media and sleeve condition use M, NM, VG+, VG, VG-, G+, G, F, P, enforced by validation and database constraints.
- External catalogue providers enrich data; PostgreSQL remains the application's source of truth.

## Skill routing

- Schema changes, migration journal/ledger work and target rollout: .github/skills/safe-migration-rollout/SKILL.md.
- Measured query, index, pooler or database performance: .github/skills/performance-investigation/SKILL.md.
- The performance skill contains PostgreSQL/Drizzle procedures; do not create a duplicate database-performance skill.

## Deliverables and handoffs

- Explain the effect of schema/query changes on existing Release, Physical Copy and Listing data.
- For migrations, cover ordering, data preservation/backfill, lock implications and rollback/forward-repair.
- State whether evidence came from PGlite/isolated tests, staging or production. Never present isolated verification as remote migration proof.
- Hand schema and repository contracts to Architecture; required release/condition interfaces to Marketplace; typed presentation fields to UI.
- Add deterministic tests for validation, constraints, search semantics and migration upgrade paths as appropriate.

## Verification

Run npm run lint, npm run typecheck, npm test and npm run build. Run npm run db:verify or focused migration tests when schema work is in scope. A target-specific preflight or apply is a separate owner-authorized operation.
