# Verification Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant verification/workflow documentation in `docs/` (`AGENTIC_WORKFLOW.md`, `SECURITY_PRIVACY.md`).
- **Read-Only Rule:** `CHATGPT.md` is strictly read-only and must **NEVER** be edited, mutated, or modified by implementation agents.
- **Commit Reference:** Use `Refs #<issue_id>` in PR descriptions and commit messages.

## 2. Responsibility Boundary & Ownership

- **Test Infrastructure:** Maintains Jest and Supertest test suites, configuration files (`jest.config.js`), and helper fixtures.
- **CI Automation:** Maintains `.github/workflows/ci.yml` and workflow contracts.
- **Verification Commands:** Enforces the standard repository execution pipeline:
  `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- **Regression Prevention:** Ensures bug fixes include automated tests preventing recurrence.
- **File & Surface Ownership:** `test/`, `jest.config.js`, `tsconfig.typecheck.json`, `.eslintrc.js`, `.github/workflows/`.

## 3. Core Verification Invariants

1. **Deterministic Pipeline:** CI tests run in isolation with no external live network or API dependencies (e.g. Jules API or third-party payment gates).
2. **Evidence-Based Completeness:** Passing CI (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) is required evidence before PR submission or human review.
3. **Evidence vs Proof:** Green CI is necessary evidence but not proof of product correctness. Human review remains authoritative.

## 4. Handoff Conditions & Protocol

- **All Specialists:** Audit code changes across all domains for test coverage, type correctness, lint compliance, and security implications.
- **Workflow / CI Pipeline:** Guarantee CI workflows run reliably on pull requests targeting `main`.

## 5. Verification Evidence

Before handoff or PR submission, the following verification evidence must be collected and pass cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
