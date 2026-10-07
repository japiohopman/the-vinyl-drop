# The Vinyl Drop — Documentation

This directory is the source of truth for product and architecture decisions.

## Documents

| Document | Purpose |
| --- | --- |
| PRODUCT_VISION.md | Product purpose, user needs, implemented scope, non-goals, and product principles |
| DOMAIN_MODEL.md | Domain hierarchy (Release -> PhysicalCopy -> Listing), entities, lifecycle rules, controlled vocabularies |
| DATA_ARCHITECTURE.md | PostgreSQL schema definitions, Drizzle ORM, migration testing, Supabase Auth & Storage architecture |
| TECHNICAL_ARCHITECTURE.md | Application layers, Express route structure, middleware, view tree, security boundaries, testing architecture |
| UX_UI.md | Visual direction, color tokens, typography, responsive navigation, views, accessibility standards |
| SECURITY_PRIVACY.md | Supabase Auth PKCE cookie sessions, server-side authorization, CSRF protection, input validation, upload security |
| AGENTIC_WORKFLOW.md | Live GitHub Actions workflows (`ci`, `phase-safety-gate`, `jules-issue-dispatcher`, `jules-session-cleanup`, `chatgpt-review-relay`) |
| ROADMAP.md | Truthful architectural phase map (Phases 0-5 completed, Phase 5 Closeout #39 current, future Phase 5B/6/7/8 boundaries) |
| DECISIONS.md | Architectural decision records (ADRs) for foundational technology and domain choices |
| PRELAUNCH_OPERATIONS.md | Operational requirements, environment strategy, closed beta, hosting, payments/shipping boundaries, launch gates |
| PHASE_0.md | Completion contract for Phase 0 |

## Source-of-truth rules

- A GitHub Issue is the authoritative execution contract for implementation work.
- Documentation describes architecture and product intent; it is not an execution queue.
- The database is authoritative for persisted domain data.
- Domain hierarchy is strictly `Release -> PhysicalCopy -> Listing`.
- A listing represents a physical copy offered by a specific owner.
- A release represents canonical metadata about a recording and is separate from any seller's physical copy.
- UI state is never authoritative domain state.
- External metadata providers are enrichment sources, not the application's canonical database.
