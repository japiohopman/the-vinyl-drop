# The Vinyl Drop — Documentation

This directory is the source of truth for product and architecture decisions.

## Documents

| Document | Purpose |
| --- | --- |
| PRODUCT_VISION.md | Product purpose, users, MVP, non-goals and future direction |
| DOMAIN_MODEL.md | Domain entities, ownership and lifecycle rules |
| DATA_ARCHITECTURE.md | PostgreSQL schema direction, persistence and data integrity |
| TECHNICAL_ARCHITECTURE.md | Application layers, stack and project structure |
| UX_UI.md | Mobile-first information architecture and visual language |
| SECURITY_PRIVACY.md | Authentication, authorization, privacy and abuse boundaries |
| AGENTIC_WORKFLOW.md | GitHub Issues, Jules, specialist agents, CI and PR continuation loop |
| ROADMAP.md | Product phases and dependencies; not an execution queue |
| DECISIONS.md | Architectural decision record for foundational choices |
| PHASE_0.md | Completion contract for Phase 0 |

## Source-of-truth rules

- A GitHub Issue is the execution contract for implementation work.
- Documentation describes architecture and product intent; it is not an execution queue.
- The database is authoritative for persisted domain data.
- A listing represents a physical copy offered by a specific owner.
- A release represents canonical metadata about a recording/release and is separate from any seller's physical copy.
- UI state is never authoritative domain state.
- External metadata providers are enrichment sources, not the application's canonical database.
