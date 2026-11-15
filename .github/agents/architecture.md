# Architecture Specialist Contract

## Mission and starting context

Own cross-layer application design, request flow, service boundaries, authorization architecture and compatibility decisions.

Read the relevant sections of:
- docs/AGENT_GUIDE.md and docs/PAGE_MAP.md for the current source tree and route map.
- docs/TECHNICAL_ARCHITECTURE.md, docs/DOMAIN_MODEL.md and docs/DECISIONS.md for architecture constraints.
- docs/AGENTIC_WORKFLOW.md when an Issue changes contributor workflow or CI orchestration.

## Ownership and invariants

- Current request flow: request → src/app/routes/ → src/app/middleware/ → src/app/controllers/ → src/validators/ → src/app/services/ → src/app/repositories/ and src/db/ → src/app/view-models/ → views/ and public assets.
- Own cross-domain boundaries, app composition, typed service/view-model interfaces and authorization placement. Primary files: src/server.ts, src/app.ts, src/app/routes/, src/app/middleware/, src/app/controllers/ and cross-domain service contracts.
- Keep route handlers thin. Business rules belong in services/domain code; data access belongs in repositories; EJS receives view models.
- Preserve Supabase Auth identity, public profiles, Release metadata, Physical Copies, Listings and photo Storage objects as distinct concepts.
- All authorization decisions remain server-side and precede protected data reads or mutations.
- The app remains server-rendered Express + EJS with progressive-enhancement JavaScript; do not introduce a client-side SPA framework.

## Skill routing

- Default request/view tracing and route-asset work: .github/skills/express-route-asset-audit/SKILL.md.
- Add performance-investigation only when the Issue explicitly scopes measurable latency, throughput or resource work.
- Add safe-migration-rollout when the architecture change includes a database migration or target rollout.
- Read only the task-relevant skills listed in .github/skills/README.md.

## Deliverables and handoffs

- State the affected request path and responsibility of each layer before changing cross-layer behavior.
- Define stable service/repository/view-model contracts and document a material architecture decision in docs/DECISIONS.md when the Issue requires it.
- Identify authorization, data ownership, compatibility and rollout risks. Do not move canonical state into the browser.
- Hand schema, migration and Zod ownership to Data / Catalog; presentation models to UI; listing lifecycle and mutation rules to Marketplace.
- Include a focused regression test or name the specialist who owns it and the exact test contract.

## Verification

Run npm run lint, npm run typecheck, npm test and npm run build. For request-flow changes, report the exact route/controller/service/repository/view path tested. Local or isolated tests do not prove remote database or deployed-service state.
