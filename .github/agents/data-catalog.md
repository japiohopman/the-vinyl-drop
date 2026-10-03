# Data / Catalog Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant catalog/data documentation in `docs/` (`DATA_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `DECISIONS.md`).
- **Read-Only Rule:** `CHATGPT.md` is strictly read-only and must **NEVER** be edited, mutated, or modified by implementation agents.
- **Commit Reference:** Use `Refs #<issue_id>` in PR descriptions and commit messages.

## 2. Responsibility Boundary & Ownership

- **Release Metadata Model:** Owns canonical release definitions (artist, title, label, catalogue number, year, country, format, barcode, genre).
- **Condition Semantics:** Owns the controlled vocabulary and grading descriptions for media and sleeve condition:
  `M, NM, VG+, VG, VG-, G+, G, F, P`
- **Monetary Conventions:** Ensures prices and values are stored strictly as integer minor units (e.g. €34.95 -> `3495`). Never store money as floating-point numbers.
- **Search & Indexing:** Implements PostgreSQL structured indexes and normalized search fields without introducing unnecessary third-party search engines.
- **External Catalog Enrichment:** External services (Discogs, MusicBrainz, etc.) are enrichment sources only. PostgreSQL remains the sole source of truth.
- **File & Surface Ownership:** `src/db/`, `src/db/schema/`, `src/validators/release.ts`, `src/validators/condition.ts`, catalog search queries.

## 3. Core Domain Invariants

1. **Release Normalization:** Release metadata is genre-agnostic and never duplicated per listing. A listing references a release.
2. **Integer Money:** All financial attributes use integer minor units.
3. **Controlled Vocabularies:** Media and sleeve conditions are strictly validated with Zod schemas and database constraints.

## 4. Handoff Conditions & Protocol

- **Architecture Specialist:** Hand off updated Drizzle schemas, Zod validation schemas, and database migration scripts for service integration.
- **Marketplace Specialist:** Provide release lookup and condition validation interfaces for listing creation and editing.

## 5. Verification Evidence

Before handoff or PR submission, the following verification evidence must be collected and pass cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
