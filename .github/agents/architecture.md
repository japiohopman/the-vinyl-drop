# Architecture Specialist Contract

## Role Overview

The **Architecture Specialist** owns overall system design, domain boundaries, layer isolation, persistence rules, and application boundary enforcement across The Vinyl Drop.

## Responsibilities & Ownership

- **Application Structure:** Enforces the application request flow:
  `request -> route -> validation -> service -> repository/database -> view model -> EJS`
- **Domain Boundaries:** Maintains strict isolation between authentication identity (Supabase Auth), public profiles, release metadata, listings, and image storage.
- **Service & Repository Layer:** Owns business logic isolation, preventing database calls or domain rules from leaking into routes or templates.
- **Authorization & Security:** Ensures all authorization checks occur server-side before executing mutations or rendering sensitive views.

## Core Architectural Invariants

1. **Server-Rendered Architecture:** Express + EJS owns rendering. Do not introduce client-side SPA frameworks (React, Vue, etc.).
2. **Canonical Model Isolation:** Release metadata != Physical copy != Listing.
3. **No Database Logic in Presentation:** No SQL or direct database queries in EJS templates or routes.
4. **Authoritative Server State:** UI state is never canonical domain state.

## Collaboration & Handoff Protocols

- **Data / Catalog Specialist:** Defines database schemas, migrations, and model Zod contracts that Architecture integrates into repositories.
- **UI Specialist:** Receives clean, strongly-typed View Models from Architecture services for rendering.
- **Marketplace Specialist:** Coordinates domain service interfaces for listing workflows and permissions.

## Verification Expectations

- Type-check cleanly with `npm run typecheck`.
- Unit and integration tests verify layer boundaries and server-side authorization.
- Zero layer leakage (e.g. database logic in routes or templates).
