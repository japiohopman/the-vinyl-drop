# The Vinyl Drop — Agent & Contributor Guide

This guide is a practical map of the current repository. It helps a human contributor or implementation agent find the correct files and understand the normal request path without reconstructing chat history.

## Quick start

1. Read [the product vision](./PRODUCT_VISION.md) and [domain model](./DOMAIN_MODEL.md) for what the product is and what its records mean.
2. Read [the technical architecture](./TECHNICAL_ARCHITECTURE.md), [data architecture](./DATA_ARCHITECTURE.md) and [application page map](./PAGE_MAP.md) before changing a cross-layer feature.
3. Read [UX/UI direction](./UX_UI.md) and the [visual reference library](./verification/UI_VISUAL_REFERENCE.md) before changing a screen.
4. Read [security and privacy](./SECURITY_PRIVACY.md) plus the relevant deployment runbook before touching authentication, uploads, database access, or environment behavior.
5. Open the governing GitHub Issue. Its acceptance criteria, scope and verification requirements—not this guide—authorize the work.

The roadmap is a phase-history and dependency reference, not a task queue. Current execution status belongs in GitHub Issues, pull requests and workflow runs.

## What the application does

The Vinyl Drop is a local community marketplace for buying, selling and trading physical vinyl records. Its data model keeps three concepts separate:

- **Release:** shared catalogue metadata for an edition of a recording (artist, title, label, year, format and catalogue artwork).
- **Physical copy:** one actual record owned by a person, with its media and sleeve condition and notes.
- **Listing:** the seller's offer for that physical copy, including price or trade intent, description, publication state and seller-uploaded photos.

A Discogs result can enrich a Release, but it is not the application's canonical database. A catalogue cover belongs to the Release. A photograph of the exact copy belongs to the seller's listing-photo records and Storage objects.

## Technology and request flow

The current application is a server-rendered Node.js / TypeScript / Express application. EJS renders HTML; PostgreSQL is hosted by Supabase; Drizzle manages schema and migrations; Supabase Auth owns identities and Storage owns image bytes. Zod validates inputs, Sharp processes images, and Jest / Supertest / Playwright cover application and browser behavior.

The usual path is:

`HTTP request → route → middleware and validation → controller → service → repository / Drizzle → view model → EJS`

Keep SQL, authorization and business rules out of routes and EJS templates. Browser JavaScript provides focused progressive enhancement; it is not a second client-side application.

## Where to look

| Concern | Current location |
| --- | --- |
| Express setup and middleware order | `src/app.ts`, `src/server.ts`, `src/app/middleware/` |
| Route registration | `src/app/routes/index.ts` and the nested `*Routes.ts` modules in the same directory |
| Controllers | `src/app/controllers/` |
| Application services and external providers | `src/app/services/` (Discogs providers under `metadata/`) |
| Repositories / database queries | `src/app/repositories/`, `src/db/` |
| Domain rules | `src/domain/` |
| Input schemas | `src/validators/` |
| Database schema and migrations | `src/db/schema/`, `drizzle/` |
| Typed presentation data | `src/app/view-models/` |
| EJS screens and shared partials | `views/` |
| Browser enhancement | `public/js/` |
| Styles and design tokens | `public/css/` |
| Tests and browser regressions | `test/` |
| Developer and verification scripts | `scripts/`, plus root `package.json` |
| GitHub workflow definitions | `.github/workflows/` |
| Canonical route and rendered-view inventory | `docs/PAGE_MAP.md` |

Do not assume a filename from an older document is still accurate. Confirm the route, controller and view in the current source before editing.

## Trace a feature end to end

### + DROP, Discogs and release artwork

1. `GET /drop/new` is registered in `src/app/routes/index.ts` and handled by `releaseController.getCreateCustomReleasePage`; it renders `views/releases/new.ejs`.
2. The browser module `public/js/discogs-release-lookup.js` calls authenticated `GET /releases/lookup-metadata`, registered in `src/app/routes/releaseRoutes.ts` and handled by `releaseController.getDiscogsMetadataLookup`.
3. A confident match can fill release metadata and a catalogue-artwork URL. The release form submits multipart data to `POST /releases/new`; the upload middleware parses it and the release service persists the release-level `cover_art_url`.
4. The listing then references that Release. Catalogue artwork remains release metadata; do not create a fake Storage object or `listing_photos` row for it.

Useful starting files: `src/app/routes/index.ts`, `src/app/routes/releaseRoutes.ts`, `src/app/controllers/releaseController.ts`, `src/app/services/metadata/discogsProvider.ts`, `public/js/discogs-release-lookup.js`, `views/releases/new.ejs`, and the corresponding controller/service tests.

### Physical-copy photo management

1. `GET /listings/:id/edit` is handled by `listingController.getEditListingPage` and renders `views/listings/edit.ejs`.
2. The same view displays the Release's catalogue artwork as a labelled reference when present, followed by the actual-copy photo controls.
3. Upload, role assignment, delete and reorder are POST actions registered in `src/app/routes/listingRoutes.ts`; they are not a separate GET photo page.
4. A seller's explicit `front_cover` photo takes precedence for the physical copy's front. If absent, Release catalogue artwork supplies the front reference/fallback. The reverse face uses the seller's `back_cover` photo only.

Useful starting files: `src/app/routes/listingRoutes.ts`, `src/app/controllers/listingController.ts`, `src/app/services/listingService.ts`, `src/app/repositories/listingPhotoRepository.ts`, `src/domain/listingPhotoRole.ts`, `views/listings/edit.ejs`, and `test/listingPhotoRoundTrip.test.ts`.

### Ordinary listing edit

Trace `GET /listings/:id/edit` through `listingRoutes.ts`, `listingController.getEditListingPage`, the listing/physical-copy services and repositories, the typed form view model, and `views/listings/edit.ejs`. The save action is `POST /listings/:id/edit`. Ownership checks remain server-side; hiding an edit button is not authorization.

## Which documentation to read

- Product scope and terminology: [PRODUCT_VISION.md](./PRODUCT_VISION.md), [DOMAIN_MODEL.md](./DOMAIN_MODEL.md).
- Database, migrations and storage: [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md).
- Routes, screens and UI: [PAGE_MAP.md](./PAGE_MAP.md), [UX_UI.md](./UX_UI.md), [verification/UI_VISUAL_REFERENCE.md](./verification/UI_VISUAL_REFERENCE.md).
- Auth and security boundaries: [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md), [SECURITY_AUTH_INVESTIGATION.md](./SECURITY_AUTH_INVESTIGATION.md).
- Production and staging operation: [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md), [STAGING_BETA_DEPLOYMENT.md](./STAGING_BETA_DEPLOYMENT.md), [PRELAUNCH_OPERATIONS.md](./PRELAUNCH_OPERATIONS.md).
- Contributor / workflow contract: [AGENTIC_WORKFLOW.md](./AGENTIC_WORKFLOW.md), root [AGENTS.md](../AGENTS.md).

## Issue → branch → PR workflow

1. Start from an open GitHub Issue and confirm that it explicitly authorizes the intended change. Check dependencies and open PRs to avoid duplicate or overlapping work.
2. Create a dedicated feature branch from current `main`. Do not commit directly to `main`.
3. Keep the change within the Issue's scope. Reference the governing Issue in commits and the PR body. Preserve the Phase Safety Gate headings and keep the PR status `NOT READY` while criteria or CI remain incomplete.
4. Run the commands required by the Issue. The usual application pipeline is `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`; run `npm run db:verify` for migration/schema work and any additional focused checks required by the Issue.
5. Review the final diff and test results on the final PR head. If a required environment check cannot be performed, record the exact blocker and the human action needed; do not claim a pass.
6. Jaap retains final human review and merge authority. Do not self-merge or deploy production.

## Non-negotiable safety boundaries

- Treat root `CHATGPT.md` and `AGENTS.md` as read-only. Do not edit them as part of ordinary implementation or documentation work.
- Never commit secrets, tokens, provider keys, credentials, private tester addresses, account identifiers, production values or customer data.
- Never change Render, Supabase, Resend, Google OAuth, DNS, production data, production deployments or live feature flags from a repository task unless the governing Issue and explicit owner authorization allow that exact action.
- Never run a migration or diagnostic against a remote database by guessing its target. Use the project-specific preflight and authorization process.
- Keep `BETA_INVITE_ONLY_ENABLED`, `SHARED_RATE_LIMITS_ENABLED` and `MESSAGING_ENABLED` decisions within their governing Issues. Source defaults do not prove hosted environment values.
- Do not treat CI, an isolated PGlite migration test, a source-code inspection or a public `/health` response as proof of a different environment's database, Auth, Storage or runtime behavior.
- Keep historical chat snapshots and archived evidence for traceability, but never use them as current execution status.

## Source-of-truth order

For implementation scope, the assigned GitHub Issue is the execution contract. Then follow the specialist instructions in `.github/agents/`, root `AGENTS.md`, the current source and tests, and the relevant maintained documents. Root `CHATGPT.md` provides durable context only; it deliberately does not hold live status. If sources disagree, stop and resolve the discrepancy instead of copying stale claims forward.
