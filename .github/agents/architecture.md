# Architecture Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant architecture documentation in `docs/` (`DECISIONS.md`, `TECHNICAL_ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `AGENTIC_WORKFLOW.md`).
- **Read-Only Rule:** `CHATGPT.md` is strictly read-only and must **NEVER** be edited, mutated, or modified by implementation agents.
- **Commit Reference:** Use `Refs #<issue_id>` in PR descriptions and commit messages.

## 2. Responsibility Boundary & Ownership

- **Application Structure:** Enforces the application request flow:
  `request -> route -> validation -> service -> repository/database -> view model -> EJS`
- **Domain Boundaries:** Maintains strict isolation between authentication identity (Supabase Auth), public profiles, release metadata, listings, and image storage.
- **Service & Repository Layer:** Owns business logic isolation, preventing database calls or domain rules from leaking into routes or templates.
- **Authorization & Security:** Ensures all authorization checks occur server-side before executing mutations or rendering sensitive views.
- **File & Surface Ownership:** `src/controllers/`, `src/services/`, `src/repositories/`, `src/middleware/auth.ts`, `src/app.ts`.

## 3. Core Architectural Invariants

1. **Server-Rendered Architecture:** Express + EJS owns rendering. Do not introduce client-side SPA frameworks (React, Vue, etc.).
2. **Canonical Model Isolation:** Release metadata != Physical copy != Listing.
3. **No Database Logic in Presentation:** No SQL or direct database queries in EJS templates or routes.
4. **Authoritative Server State:** UI state is never canonical domain state.

## 4. Handoff Conditions & Protocol

- **Data / Catalog Specialist:** Request schema definitions, Drizzle migrations, or Zod model schemas from Data Specialist when entity properties change.
- **UI Specialist:** Hand off strongly-typed View Models to UI Specialist when presenting data in EJS views.
- **Marketplace Specialist:** Coordinate service interfaces and permission rules for listing lifecycle mutations.

## 5. Verification Evidence

Before handoff or PR submission, the following verification evidence must be collected and pass cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
