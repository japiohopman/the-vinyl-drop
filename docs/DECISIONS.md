# Architectural Decision Records (ADR)

## ADR-001 — Server-rendered web application with Express and EJS

**Decision:** Use Express + TypeScript + EJS for server-rendered page layout and template composition.

**Reason:** The core product consists of catalogue content, listing details, search/filter forms, seller profiles, and comment threads. Server-rendered HTML simplifies routing, SEO/sharing, state management, and accessibility while avoiding frontend SPA framework overhead.

**Consequence:** Interactive features use progressive enhancement (e.g. lightweight client JS for photo preview/reordering) without introducing heavy client frameworks.

## ADR-002 — PostgreSQL (Supabase) as canonical persistence

**Decision:** Use PostgreSQL hosted on Supabase as the primary relational database.

**Reason:** Domain entities (profiles, releases, physical copies, listings, photos, comments) have relational constraints and transactional requirements. Supabase integrates PostgreSQL, Auth, and Storage into one platform.

**Consequence:** Critical constraints (foreign keys, check constraints, unique partial indexes) are enforced natively in PostgreSQL.

## ADR-003 — Drizzle ORM and migration workflow

**Decision:** Use Drizzle ORM and Drizzle Kit for schema definitions and SQL migrations.

**Reason:** Drizzle provides a type-safe TypeScript query layer with explicit migration generation and lightweight overhead.

**Consequence:** Schemas are source-controlled in TypeScript (`src/db/schema/`) and migrations are committed as SQL files (`drizzle/`). Isolated test execution uses `@electric-sql/pglite`.

## ADR-004 — Canonical domain model: Release -> PhysicalCopy -> Listing

**Decision:** Maintain strict separation between canonical release metadata (`releases`), physical record copies (`physical_copies`), and marketplace offers (`listings`).

**Reason:** Multiple users can own physical copies of the same release. Physical copy condition (media/sleeve grade) belongs to the owned physical item, whereas price, trade availability, description, and status belong to the marketplace offer.

**Consequence:** A single physical copy can only have one active marketplace listing at a time, enforced by a partial unique index on `physical_copy_id` where status is `published` or `reserved`.

## ADR-005 — Monetary amounts stored strictly as integer minor units (cents)

**Decision:** Store listing prices as non-negative integer cents (e.g., `€34.95` -> `3495`).

**Reason:** Floating-point numbers introduce rounding errors and precision issues in monetary calculations and database queries.

**Consequence:** Monetary inputs are validated and parsed into cents at controller boundaries and formatted back into Euros (`€XX.XX`) in view models.

## ADR-006 — Supabase Auth with Express PKCE cookie storage

**Decision:** Integrate Supabase Auth using Express cookie-backed PKCE session persistence (`createExpressSupabaseClient` in `src/lib/supabase.ts`).

**Reason:** Supports secure server-side session persistence and token rotation using HTTP cookies (`sb-access-token`, `sb-refresh-token`). Profile `id` matches `auth.users.id` 1:1.

**Consequence:** Authentication state is attached to requests via Express middleware (`sessionMiddleware`) and protected endpoints enforce `requireAuth`.

## ADR-007 — Object storage for listing photography with server-side processing

**Decision:** Upload listing images to Supabase Storage (`listing-photos` bucket) and store relative storage keys in PostgreSQL (`listing_photos`).

**Reason:** Binary image files do not belong inside relational database rows. Server-side processing via `@fastify/busboy` and `sharp` ensures strict file limits (5MB max, 5 photos max per listing), EXIF stripping, dimension scaling (2048px max), and WebP conversion.

**Consequence:** Database holds clean relative path references. Upload failure rolls back storage objects.

## ADR-008 — Controlled vocabularies for condition grading and listing status

**Decision:** Enforce Goldmine condition grades (`M`, `NM`, `VG+`, `VG`, `VG-`, `G+`, `G`, `F`, `P`) and listing lifecycle statuses (`draft`, `published`, `reserved`, `sold`, `traded`, `archived`) via Postgres enums and Zod schemas.

**Reason:** Standardized grading and state machine rules prevent invalid lifecycle transitions and inconsistent data.

**Consequence:** State transitions are explicitly validated in `src/domain/listingLifecycle.ts`.

## ADR-009 — Same-origin CSRF protection middleware

**Decision:** Implement custom same-origin CSRF middleware (`validateSameOrigin` in `src/app/middleware/csrf.ts`).

**Reason:** Enforces same-origin provenance on state-changing HTTP requests (`POST`, `PUT`, `DELETE`, `PATCH`), rejecting requests missing both `Origin` and `Referer` headers with a 403 Forbidden status.

**Consequence:** State-changing routes require same-origin headers.

## ADR-010 — Local marketplace scope boundary (No payments or shipping)

**Decision:** Exclude automated payment processing, shipping, checkout, and private messaging from core MVP scope.

**Reason:** Payments, postage calculations, escrow, and fulfillment introduce extensive legal, financial, and security complexities. The core value prop is local community record discovery, listing, and direct P2P meetups.

**Consequence:** Transactions are arranged directly between buyer and seller offline. Payments and shipping are non-goals for initial release.

## ADR-011 — Issue-driven agentic workflow with human merge authority

**Decision:** Use GitHub Issues as execution contracts for Jules automated implementation, with Phase Safety Gate checks, ChatGPT PR review relay, and mandatory human final merge.

**Reason:** Ensures deterministic execution, rigorous automated verification, PR safety enforcement, and human oversight.

**Consequence:** Automation stops at READY FOR HUMAN REVIEW status. Humans perform all branch merges to `main`.
