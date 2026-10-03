# Architectural Decisions

## ADR-001 — Server-rendered web application

**Decision:** Use Express + TypeScript + EJS.

**Reason:** The core product is catalogue/listing/profile/form content. Server-rendered HTML keeps the application simple and avoids a client-side state system that is not required.

**Consequence:** Interactive UI should use small progressive-enhancement scripts rather than a full frontend framework unless a concrete requirement proves otherwise.

## ADR-002 — PostgreSQL is canonical persistence

**Decision:** Use PostgreSQL on Supabase.

**Reason:** The domain is relational: users, profiles, releases, listings, photos and comments have clear relationships and integrity constraints. Supabase also provides integrated Auth and Storage.

**Consequence:** Domain relationships and critical invariants should be represented in the relational schema.

## ADR-003 — Drizzle ORM

**Decision:** Use Drizzle ORM and Drizzle Kit.

**Reason:** It provides a TypeScript-first schema/query layer with PostgreSQL support and an explicit migration workflow.

**Consequence:** Schema definitions and migrations remain source-controlled.

## ADR-004 — Release and listing are separate concepts

**Decision:** Store release metadata separately from seller listings.

**Reason:** Many people may own copies of the same release. Duplication would make metadata inconsistent.

**Consequence:** A listing must reference a release. A seller's physical copy state belongs to the listing.

## ADR-005 — Prices use integer minor units

**Decision:** Store €34.95 as 3495.

**Reason:** Floating-point representation is inappropriate for money.

**Consequence:** Formatting occurs at the presentation boundary.

## ADR-006 — Images live in object storage

**Decision:** Store record photos in Supabase Storage and metadata/references in PostgreSQL.

**Reason:** Binary image content should not live in ordinary relational listing rows.

**Consequence:** Image authorization and cleanup need explicit service/storage boundaries.

## ADR-007 — External metadata is enrichment

**Decision:** External catalogues may populate or help identify releases, but the application's database remains canonical.

**Reason:** Existing listings must continue to work if an external service changes or becomes unavailable.

**Consequence:** External IDs are references only.

## ADR-008 — MVP excludes payments and shipping

**Decision:** Initial marketplace functionality ends at discovery and contact/trade coordination.

**Reason:** Payments, fulfilment, disputes and shipping introduce a much larger security and business domain.

**Consequence:** The first product can remain a local community marketplace while those concerns are evaluated later.

## ADR-009 — Mobile-first

**Decision:** Design for narrow phone widths first.

**Reason:** Listing a record while handling a physical collection is naturally mobile-friendly, and the product should remain useful at local meetups and record shops.

**Consequence:** Desktop is an expansion of the mobile information architecture, not a separate product.

## ADR-010 — Human-controlled final merge

**Decision:** Jules may implement and iterate, but humans retain final merge authority.

**Reason:** Automated implementation and verification are useful, but product/architecture review remains a human decision.

**Consequence:** Automation must stop at review readiness rather than self-merging.
