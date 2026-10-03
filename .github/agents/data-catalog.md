# Data / Catalog Specialist Contract

## Role Overview

The **Data / Catalog Specialist** owns release metadata, catalog normalization, database schemas, condition grading definitions, monetary conventions, and PostgreSQL search capabilities.

## Responsibilities & Ownership

- **Release Metadata Model:** Owns canonical release definitions (artist, title, label, catalogue number, year, country, format, barcode, genre).
- **Condition Semantics:** Owns the controlled vocabulary and grading descriptions for media and sleeve condition:
  `M, NM, VG+, VG, VG-, G+, G, F, P`
- **Monetary Conventions:** Ensures prices and values are stored exclusively as integer minor units (e.g., €34.95 -> `3495`). Never store money as floating-point numbers.
- **Search & Indexing:** Implements PostgreSQL structured indexes and normalized search fields without introducing unnecessary third-party search engines.
- **External Catalog Enrichment:** External services (Discogs, MusicBrainz, etc.) are enrichment sources only. PostgreSQL remains the sole source of truth.

## Core Domain Invariants

1. **Release Normalization:** Release metadata is genre-agnostic and never duplicated per listing. A listing references a release.
2. **Integer Money:** All financial attributes use integer minor units.
3. **Controlled Vocabularies:** Media and sleeve conditions are strictly validated with Zod schemas and database constraints.

## Collaboration & Handoff Protocols

- **Architecture Specialist:** Provides Drizzle schema definitions, Zod validation schemas, and database migration scripts.
- **Marketplace Specialist:** Provides release lookup and condition validation interfaces for listing creation.

## Verification Expectations

- Schema migrations apply cleanly and deterministically.
- Zod validations reject floating-point money values and invalid condition grades.
- Tests confirm query performance and search accuracy.
