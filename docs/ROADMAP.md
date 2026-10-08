# Product Roadmap

This document describes product phase history, dependency structure, and future boundaries.

**It is a truthful architectural phase map, not an execution queue.**

Implementation work is authorized exclusively through explicit GitHub Issue contracts.

## Phase 0 — Product and architecture foundation

Deliverables:
- Product vision (`docs/PRODUCT_VISION.md`);
- Domain model (`docs/DOMAIN_MODEL.md`);
- Data architecture (`docs/DATA_ARCHITECTURE.md`);
- Technical architecture (`docs/TECHNICAL_ARCHITECTURE.md`);
- UX/UI direction (`docs/UX_UI.md`);
- Security baseline (`docs/SECURITY_PRIVACY.md`);
- Agentic workflow contract (`docs/AGENTIC_WORKFLOW.md`).

Status: **COMPLETED** (merged to `main`).

## Phase 1 — Repository and workflow foundation

Deliverables:
- Node.js / Express / TypeScript application foundation;
- Centralized ESLint, TypeScript typecheck, Jest test, and build scripts;
- EJS application layout shell and partials;
- GitHub Actions workflow foundation (`ci.yml`, `phase-safety-gate.yml`, `jules-issue-dispatcher.yml`, `jules-session-cleanup.yml`, `chatgpt-review-relay.yml`);
- Specialist agent definitions and PR contract safety gate validation scripts.

Governing Issues: `#15`, `#4`.
Status: **COMPLETED** (merged to `main`).

## Phase 2 — Design system and application shell

Deliverables:
- Design tokens and CSS custom properties (`public/css/style.css`);
- Capriola / Space Grotesk / DM Sans / IBM Plex Mono typography strategy;
- Responsive application header, mobile navigation, and footer partials;
- Accessible UI primitives (listing cards, condition badges, form controls, flash alerts);
- Automated accessibility verification testing (`npm run test:a11y`).

Governing Issues: `#6`, `#7`, `#8`.
Status: **COMPLETED** (merged to `main`).

## Phase 3 — Database, authentication and profiles

Deliverables:
- Supabase PostgreSQL integration with Drizzle ORM and Drizzle Kit migrations;
- Supabase Auth integration with Express cookie-backed PKCE storage (`src/lib/supabase.ts`);
- Profiles table (`profiles.id` matching `auth.users.id` 1:1) and user registration/login/logout flows;
- Public profile display (`/profiles/:username`) and authenticated profile editing (`/profile/edit`);
- Server-side ownership authorization.

Governing Issues: `#9`, `#10`.
Status: **COMPLETED** (merged to `main`).

## Phase 4 — Releases, physical copies and listings

Deliverables:
- Canonical domain model separation: `Release -> PhysicalCopy -> Listing`;
- Goldmine condition grading vocabulary and Zod validation;
- Minor currency unit (cents) pricing model and trade-only listing support;
- Listing lifecycle state machine (`draft`, `published`, `reserved`, `sold`, `traded`, `archived`) with partial unique index enforcing single active listing per physical copy;
- Multipart image upload pipeline via `@fastify/busboy` with server-side Sharp WebP conversion, 2048px downscaling, and EXIF stripping;
- Multi-step sell flow (`/drop/new`, `/listings/create`, `/listings/:id/photos`, `/listings/:id/preview`).

Governing Issues: `#11`, `#12`.
Status: **COMPLETED** (merged to `main`).

## Phase 5 — Core Discovery, Search & Listing Detail

Deliverables:
- Homepage discovery feed (`/`);
- Browse interface (`/browse`) with genre, condition, price range, and trade filters;
- Search results (`/search`) matching keyword queries across release metadata and listing descriptions;
- Listing detail pages (`/listings/:id`) displaying release details, physical copy condition, photo viewer, seller summary, and public comment threads;
- Public comment thread posting (`/listings/:id/comments`) with seller identification;
- Public seller profiles displaying active listings grid.

Governing Issue: `#13`.
Status: **COMPLETED** (merged to `main`).

## Phase 5 Closeout — Documentation and Contract Alignment (Current Phase)

Deliverables:
- Truthful alignment of product, domain, persistence, route, page, roadmap, workflow, security, and operational documentation with actual Phase 5 merged codebase state;
- Pre-launch operational requirements specification (`docs/PRELAUNCH_OPERATIONS.md`);
- Elimination of stale route and implementation references across all docs.

Governing Issue: `#39`.
Status: **IN PROGRESS** (current active branch).

---

## Future Phase Boundaries

### Phase 5B — Search & Discovery Hardening (Future)

Planned scope:
- Performance optimizations for discovery and search queries;
- PostgreSQL full-text search / trigram indexing tuning;
- Saved searches and filter persistence;
- Search result pagination / infinite scroll loading.

### Metadata Enrichment & Identification (Future)

Planned scope:
- Enhanced external metadata lookup and enrichment (Issue `#14`);
- Release barcode scanner / matrix number identification assistance;
- Additional catalog metadata fields without breaking canonical release structure.

### Phase 6 — Community & Social Engagement (Future)

Planned scope:
- Member favorites and saved listings;
- Public seller wantlists;
- Community activity feed route (`/activity`);
- Seller trust and community reputation signals;
- Notification hooks (in-app alerts for listing updates and comment replies).

*Note: Listing comments and public profiles are already fully implemented as part of Phase 5 Core Discovery.*

### Phase 7 — Trading & Private Communication (Future)

Planned scope:
- Structured trade proposal workflow;
- Private buyer/seller messaging threads (`/messages`);
- Direct offer negotiation;
- Trade lifecycle completion.

### Phase 8 — Moderation & Production Hardening (Future)

Planned scope:
- Content reporting mechanisms for listings, comments, and profiles;
- Administrative moderation tools;
- API rate limiting and upload throttling;
- Automated image abuse and payload inspection hardening;
- Disaster recovery, backup procedures, and uptime observability;
- Production deployment hardening and security audit gate.
