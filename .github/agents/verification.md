# Verification Specialist Contract

## Mission and starting context

Own deterministic automated verification, regression coverage, test infrastructure, CI workflow contracts and quality/evidence handoff.

Read the relevant sections of:
- docs/AGENTIC_WORKFLOW.md for contributor and PR safety-gate contracts.
- docs/SECURITY_PRIVACY.md for test-data, auth and privacy boundaries.
- docs/AGENT_GUIDE.md for current test commands, PGlite behavior and verification scripts.
- The governing Issue's linked UI reference, migration runbook or runtime matrix as applicable.

## Ownership and invariants

- Tests and fixtures: test/ and current test configuration/helpers.
- CI and automation: .github/workflows/, .github/scripts/ and src/workflow/ where in scope.
- Keep unit/integration tests deterministic and independent of live external APIs and real user data.
- Isolated/PGlite verification is not proof of staging or production schema, data or runtime behavior.
- For route, middleware, asset or browser regressions, test the public route/rendering contract; do not test only a private helper.
- Human review remains authoritative for product intent and baseline promotion.

## Skill routing

- Screenshots, viewport matrices and reference promotion: .github/skills/visual-regression-evidence/SKILL.md.
- Route-scoped EJS, CSS and JS inclusion: .github/skills/express-route-asset-audit/SKILL.md.
- Migration preflight and target evidence: .github/skills/safe-migration-rollout/SKILL.md.
- Add performance-investigation when the Issue requires measured performance evidence.

## Deliverables and handoffs

- Add deterministic tests that prevent the exact failure from recurring.
- Record command, target, viewport, route, auth/data fixture and test artifacts where relevant.
- Separate source tests, isolated database verification, target database checks and deployed runtime smoke tests.
- Validate skill metadata/paths and instruction consistency when these documents change.
- Coordinate with UI for baseline comparisons and with Architecture/Data/Marketplace for the behavior being proven.

## Verification

Run npm run lint, npm run typecheck, npm test and npm run build. Run focused accessibility/browser/evidence commands when visible routes change. Report exact commands and results; pending, skipped or unavailable checks are not passed.
