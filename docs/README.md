# The Vinyl Drop — Documentation Index

This directory contains maintained product, architecture, security, UI and operating references. Use the quick start below instead of reading every document.

**Execution status lives in GitHub Issues, PRs and Actions.** This index and the roadmap explain where things are; they are not a task queue. See [#282 — release tracker](https://github.com/japiohopman/the-vinyl-drop/issues/282) for the current launch-gate summary.

## Start here

| Read in this order | Purpose |
| --- | --- |
| [AGENT_GUIDE.md](./AGENT_GUIDE.md) | Practical contributor map, source paths, feature tracing, verification and safety boundaries |
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | Product purpose, implemented scope and non-goals |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | Release → Physical Copy → Listing ownership and lifecycle |
| [PAGE_MAP.md](./PAGE_MAP.md) | Source-audited route, method, controller and EJS-view inventory |
| [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) | Runtime stack and application boundaries |
| [AGENTIC_WORKFLOW.md](./AGENTIC_WORKFLOW.md) | Issue-driven branch, PR, CI, review and human-merge workflow |

## Product and catalogue

| Document | Purpose |
| --- | --- |
| [PRODUCT_VISION.md](./PRODUCT_VISION.md) | Product purpose and user experience boundaries |
| [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) | Core domain entities and lifecycle |
| [CATALOGUE_SEARCH.md](./CATALOGUE_SEARCH.md) | Catalogue search behavior and metadata providers |
| [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md) | PostgreSQL, Drizzle, migration, Auth and Storage persistence |

## UI and design

| Document | Purpose |
| --- | --- |
| [UX_UI.md](./UX_UI.md) | Visual identity, navigation, responsive behavior and interaction contracts |
| [verification/UI_VISUAL_REFERENCE.md](./verification/UI_VISUAL_REFERENCE.md) | Approved and historical UI baselines and visual-review checklist |
| [LOCAL_FONT_ASSETS.md](./LOCAL_FONT_ASSETS.md) | First-party font assets and licensing |
| [design/working/](./design/working/) | Working design notes; check their governing Issue before treating a proposal as approved |
| [email-templates/README.md](./email-templates/README.md) | Supabase Auth email templates and token/link contracts |

## Security, privacy and beta controls

| Document | Purpose / status |
| --- | --- |
| [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) | Implemented Auth, CSRF, input, upload and rate-limit boundaries |
| [SECURITY_AUTH_INVESTIGATION.md](./SECURITY_AUTH_INVESTIGATION.md) | Security investigation evidence and historical decisions |
| [BETA_LEGAL_BASIS_REGISTER.md](./BETA_LEGAL_BASIS_REGISTER.md) | Owner-approved working record of processing purposes/legal bases; not independent legal advice |
| [PUBLIC_LAUNCH_PRIVACY_ASSESSMENT.md](./PUBLIC_LAUNCH_PRIVACY_ASSESSMENT.md) | Public-launch privacy assessment and unresolved decisions |
| [BETA_PRIVACY_OPERATIONS.md](./BETA_PRIVACY_OPERATIONS.md) | Manual privacy request and incident process |
| [BETA_PRIVACY_NOTICE_DRAFT.md](./BETA_PRIVACY_NOTICE_DRAFT.md) | Draft privacy notice; not the live website notice |
| [BETA_DATA_INVENTORY.md](./BETA_DATA_INVENTORY.md) | Beta data inventory and retention context |

## Operations and deployment

| Document | Purpose |
| --- | --- |
| [PRELAUNCH_OPERATIONS.md](./PRELAUNCH_OPERATIONS.md) | Durable operating model, cost boundaries and launch-gate ownership |
| [STAGING_BETA_DEPLOYMENT.md](./STAGING_BETA_DEPLOYMENT.md) | Staging environment, migration and beta verification runbook |
| [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) | Production infrastructure, environment contract and manual deployment boundary |
| [BETA_PILOT_SETUP.md](./BETA_PILOT_SETUP.md) | Private pilot preparation and capacity instructions |
| [STAGING_LISTINGS_DB_DIAGNOSTIC.md](./STAGING_LISTINGS_DB_DIAGNOSTIC.md) | Task-specific read-only staging diagnostic; use only under its governing Issue and owner authorization |

## Architecture decisions and project history

| Document | Purpose / status |
| --- | --- |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Records |
| [ROADMAP.md](./ROADMAP.md) | Completed phase history and future boundaries; not current issue status |
| [ISSUE_STRATEGY.md](./ISSUE_STRATEGY.md) | Issue planning and execution conventions |
| [PHASE_0.md](./PHASE_0.md) | Historical Phase 0 completion contract |
| [CASE_COLLISION_REPAIR_PLAN.md](./CASE_COLLISION_REPAIR_PLAN.md) | Historical repair plan; check linked Issues/PRs before reuse |
| [last_chat.md](./last_chat.md) | Historical, superseded conversation snapshot — not current project state |
| [chat_history/](./chat_history/) | Archived conversation records; historical context only |

## Source-of-truth rules

- The Issue is the execution contract; the latest Issue/PR/Actions record is the source for current work status.
- Source code and tests establish implemented behavior. The database is authoritative for persisted domain data.
- `PAGE_MAP.md` is the route/view map; verify paths against source before changing them.
- `ROADMAP.md` records architectural history and future boundaries, not work selection or completion status.
- Draft, working and historical documents are labelled as such. Do not silently promote a proposal or old chat snapshot into current policy.
- `CHATGPT.md` is read-only advisory context and is intentionally not an implementation document.
