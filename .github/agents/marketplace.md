# Marketplace Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant marketplace documentation in `docs/` (`DOMAIN_MODEL.md`, `TECHNICAL_ARCHITECTURE.md`, `DECISIONS.md`).
- **Read-Only Rule:** `CHATGPT.md` is strictly read-only and must **NEVER** be edited, mutated, or modified by implementation agents.
- **Commit Reference:** Use `Refs #<issue_id>` in PR descriptions and commit messages.

## 2. Responsibility Boundary & Ownership

- **Listing Lifecycle:** Manages listing states (draft, preview, published, sold, archived) and state transitions.
- **Physical Copy Offer:** Captures seller price, media condition, sleeve condition, descriptions, and sale/trade intent.
- **Photo Processing Pipeline:** Coordinates image uploads via Supabase Storage and Sharp processing (MIME/type validation, size limits, safe dimensions, ownership checks).
- **Community Interaction:** Manages authenticated public listing comments (excluding trade negotiation engines, escrow, or payment settlement which are out of MVP scope).
- **File & Surface Ownership:** `src/services/listingService.ts`, `src/services/photoService.ts`, `src/services/commentService.ts`, listing validation schemas.

## 3. Core Marketplace Invariants

1. **Listing Reference:** Every listing must reference a valid Release entity.
2. **Mandatory Preview:** Seller listing creation requires a final preview step before publication.
3. **Storage Isolation:** Record photos reside in Supabase Storage with database rows storing object references and display order. Photos are never stored as database binaries.
4. **No Simulated Trades:** Comments are community discussions; they must not simulate trading or payment escrow.

## 4. Handoff Conditions & Protocol

- **Data / Catalog Specialist:** Consume release metadata models and condition grading definitions.
- **UI Specialist:** Provide form view models and preview structures for listing views.
- **Architecture Specialist:** Hand off listing lifecycle mutations for server-side authorization enforcement.

## 5. Verification Evidence

Before handoff or PR submission, the following verification evidence must be collected and pass cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
