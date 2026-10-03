# Verification Specialist Contract

## Role Overview

The **Verification Specialist** owns test strategy, automated testing pipelines, GitHub Actions CI workflows, deterministic verification, code linting, typechecking, and regression prevention across the repo.

## Responsibilities & Ownership

- **Test Infrastructure:** Maintains Jest and Supertest test suites, configuration files, and helper fixtures.
- **CI Automation:** Maintains `.github/workflows/ci.yml` and workflow contracts.
- **Verification Commands:** Enforces the standard repository execution pipeline:
  `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
- **Regression Prevention:** Ensures bug fixes include automated tests preventing recurrence.

## Core Verification Invariants

1. **Deterministic Pipeline:** CI tests run in isolation with no external live network or API dependencies (e.g. Jules API or third-party payment gates).
2. **Evidence-Based Completeness:** Passing CI (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) is required evidence before PR submission or human review.
3. **Evidence vs Proof:** Green CI is necessary evidence but not proof of product correctness. Human review remains authoritative.

## Collaboration & Handoff Protocols

- **All Specialists:** Audits code changes across all domains for test coverage, type correctness, lint compliance, and security implications.
- **Workflow / CI Pipeline:** Guarantees CI workflows run reliably on pull requests targeting `main`.

## Verification Expectations

- Zero lint errors (`npm run lint`).
- Zero type errors (`npm run typecheck`).
- 100% passing test suites (`npm test`).
- Clean build production output (`npm run build`).
