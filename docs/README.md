# The Vinyl Drop — Documentation

This directory contains maintained product, architecture, security, operations and contributor references. It is a navigation index, not an execution queue.

## Start here

| Document | Purpose |
| --- | --- |
| [AGENT_GUIDE.md](./AGENT_GUIDE.md) | Practical repository map and end-to-end examples for human contributors and implementation agents |
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | Product purpose, intended users, implemented scope and non-goals |
| [ROADMAP.md](./ROADMAP.md) | Completed phase history and future boundaries; not a live task list |
| [ISSUE_STRATEGY.md](./ISSUE_STRATEGY.md) | Guidance for structuring and sequencing GitHub Issues |

## Product, domain and user experience

| Document | Purpose |
| --- | --- |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | Release → PhysicalCopy → Listing domain boundaries and lifecycle rules |
| [CATALOGUE_SEARCH.md](./CATALOGUE_SEARCH.md) | Catalogue search behavior, normalization and data-provider boundaries |
| [UX_UI.md](./UX_UI.md) | Visual direction, design tokens, responsive behavior and accessibility |
| [PAGE_MAP.md](./PAGE_MAP.md) | Verified route, controller, view and error-response inventory |
| [verification/UI_VISUAL_REFERENCE.md](./verification/UI_VISUAL_REFERENCE.md) | Current screenshot register, visual baselines and UI evidence workflow |
| [design/working/](./design/working/) | Working design contracts and proposals; check their governing Issue before treating a proposal as accepted |

## Architecture and data

| Document | Purpose |
| --- | --- |
| [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) | Express request flow, layers, source tree and testing architecture |
| [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md) | PostgreSQL, Drizzle, migrations, Auth persistence and Storage |
| [DECISIONS.md](./DECISIONS.md) | Architectural decision records |
| [LOCAL_FONT_ASSETS.md](./LOCAL_FONT_ASSETS.md) | Self-hosted font assets and licensing notes |

## Security, privacy and operations

| Document | Purpose |
| --- | --- |
| [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) | Implemented security boundaries and privacy behavior |
| [SECURITY_AUTH_INVESTIGATION.md](./SECURITY_AUTH_INVESTIGATION.md) | Focused Auth/security investigation and evidence |
| [PUBLIC_LAUNCH_PRIVACY_ASSESSMENT.md](./PUBLIC_LAUNCH_PRIVACY_ASSESSMENT.md) | Public-service privacy/legal scope questions and assessment |
| [BETA_LEGAL_BASIS_REGISTER.md](./BETA_LEGAL_BASIS_REGISTER.md) | Working register of processing purposes and legal bases |
| [BETA_DATA_INVENTORY.md](./BETA_DATA_INVENTORY.md) | Personal-data inventory for the controlled service |
| [BETA_PRIVACY_NOTICE_DRAFT.md](./BETA_PRIVACY_NOTICE_DRAFT.md) | Draft privacy wording; not a substitute for the published notice or legal advice |
| [BETA_PRIVACY_OPERATIONS.md](./BETA_PRIVACY_OPERATIONS.md) | Operational procedure for privacy requests and incidents |
| [BETA_PILOT_SETUP.md](./BETA_PILOT_SETUP.md) | Controlled beta preparation and access boundaries |
| [PRELAUNCH_OPERATIONS.md](./PRELAUNCH_OPERATIONS.md) | Current environment architecture, support boundaries and release-gate categories |
| [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) | Production Render/Supabase architecture and manual deployment runbook |
| [STAGING_BETA_DEPLOYMENT.md](./STAGING_BETA_DEPLOYMENT.md) | Staging environment, beta safety and verification procedures |
| [STAGING_LISTINGS_DB_DIAGNOSTIC.md](./STAGING_LISTINGS_DB_DIAGNOSTIC.md) | Read-only staging listings/database diagnostic procedure |
| [email-templates/README.md](./email-templates/README.md) | Supabase Auth email templates and callback/link contracts |

## Agent workflow and historical records

| Document | Purpose |
| --- | --- |
| [AGENTIC_WORKFLOW.md](./AGENTIC_WORKFLOW.md) | GitHub Actions, Issue-driven work, PR contract and environment evidence rules |
| [CASE_COLLISION_REPAIR_PLAN.md](./CASE_COLLISION_REPAIR_PLAN.md) | Historical security repair plan; consult its Issue/PR links before relying on status |
| [PHASE_0.md](./PHASE_0.md) | Completed Phase 0 acceptance contract |
| [last_chat.md](./last_chat.md) | Historical chat snapshot only; superseded and not authoritative for current status |
| [chat_history/](./chat_history/) | Preserved conversation snapshots; historical evidence only |
| [evidence/](./evidence/) | Preserved verification evidence and attachments |

## Source-of-truth rules

- GitHub Issues define authorized scope, acceptance criteria, dependencies and current execution status.
- Pull requests and their final-head checks record implementation and review status.
- Workflow runs record automated verification; deployment dashboards and explicitly recorded runtime checks record environment status.
- This documentation describes durable product behavior and architecture. The roadmap records phase history and future boundaries, not next tasks.
- The database is authoritative for persisted application data; external catalogue providers are enrichment sources only.
- The domain hierarchy is `Release → PhysicalCopy → Listing`. A release's catalogue artwork is distinct from photos of a seller's exact physical copy.
- Root `CHATGPT.md` and `AGENTS.md` are read-only project guidance, not live status reports.
