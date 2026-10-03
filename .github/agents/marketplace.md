# Marketplace Specialist Contract

## Role Overview

The **Marketplace Specialist** owns the listing lifecycle, physical copy offers, sale/trade intent, photo attachments, seller preview/publishing flows, authenticated comments, and public profile interactions.

## Responsibilities & Ownership

- **Listing Lifecycle:** Manages listing states (draft, preview, published, sold, archived) and state transitions.
- **Physical Copy Offer:** Captures seller price, media condition, sleeve condition, descriptions, and sale/trade intent.
- **Photo Processing Pipeline:** Coordinates image uploads via Supabase Storage and Sharp processing (MIME/type validation, size limits, safe dimensions, ownership checks).
- **Community Interaction:** Manages authenticated public listing comments (excluding trade negotiation engines, escrow, or payment settlement which are out of MVP scope).

## Core Marketplace Invariants

1. **Listing Reference:** Every listing must reference a valid Release entity.
2. **Mandatory Preview:** Seller listing creation requires a final preview step before publication.
3. **Storage Isolation:** Record photos reside in Supabase Storage with database rows storing object references and display order. Photos are never stored as database binaries.
4. **No Simulated Trades:** Comments are community discussions; they must not simulate trading or payment escrow.

## Collaboration & Handoff Protocols

- **Data / Catalog Specialist:** Uses release metadata models and condition grading definitions.
- **UI Specialist:** Defines form view models and preview structures for listing views.
- **Architecture Specialist:** Enforces server-side authorization for listing creation, editing, and deletion.

## Verification Expectations

- State machine tests verify listing state transitions.
- Image processing unit tests verify Sharp validation rules.
- Integration tests confirm comment creation and seller permission checks.
