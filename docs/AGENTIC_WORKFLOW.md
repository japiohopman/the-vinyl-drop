# Agentic Development Workflow

## Goal

The Vinyl Drop is developed using an Issue-driven agentic workflow where human engineers retain explicit architectural and merge authority:

1. **Human:** defines product goals, approves strategy, writes Issue contracts, inspects pull requests, and performs final merges to `main`.
2. **Jules:** performs automated code and documentation changes inside explicit GitHub Issue contracts on dedicated feature branches.
3. **ChatGPT:** acts as architectural review partner, reviewing PRs, managing the `chatgpt-review` label, and writing structured continuation feedback.

## Source of execution truth

**GitHub Issue = execution contract.**

An Issue defines:
- title and governing issue number;
- explicit goal and scope;
- mandatory acceptance criteria;
- constraints and non-goals;
- required verification commands;
- specialist assignment (`Architecture`, `Data / Catalog`, `UI`, `Marketplace`, or `Verification`).

Documentation (`docs/ROADMAP.md`, `docs/PRODUCT_VISION.md`) is architectural reference, **not an execution queue**. Automated agents never select or execute work from arbitrary documentation files.

## Branching & PR lifecycle

1. **Branch Creation:** Implementation begins on a feature branch named after the governing issue (e.g. `feature/issue-39-phase-5-closeout-docs-...`).
2. **Execution:** Jules completes work on the branch, following strict file modification and verification rules.
3. **Review Continuation:** If review feedback identifies missing criteria or defects within the issue scope, work continues **on the same branch**.
4. **Read-Only Memory:** `CHATGPT.md` serves as durable, read-only advisory memory across sessions. Agents must never modify or rewrite `CHATGPT.md`.
5. **Final Merge:** Humans perform all merges to `main`. Automated agents never self-merge branches or push directly to `main`.

## Live GitHub Actions workflows

The repository operates five live GitHub Actions workflows (`.github/workflows/`):

### 1. CI Workflow (`ci.yml`)

Runs on pull requests and pushes to `main`.
- `npm run lint` (ESLint TypeScript checks)
- `npm run typecheck` (tsc compilation check)
- `npm test` (Jest test suite including isolated `@electric-sql/pglite` database migration tests)
- `npm run build` (TypeScript production compilation)

> **Note on CI Database Execution:** CI executes unit and integration tests (including isolated migration fixture tests via `npm test`), but CI does NOT directly invoke `npm run db:verify` or apply migrations to a target PostgreSQL/Supabase database. PGlite tests prove SQL syntax and schema definition validity in an isolated in-memory engine, but do NOT prove a remote/target database has been migrated.

### 2. Phase Safety Gate (`phase-safety-gate.yml`)

Enforces PR quality and contract completeness before human review.
- Executes `src/workflow/runSafetyGate.ts` / `src/workflow/prSafetyGate.ts`.
- Validates that the actual PR body contains required exact markdown headings (`## Phase / Governing Issue`, `## Goal`, `## Scope completed`, `## Architecture`, `## Data integrity`, `## Verification`, `## Security`, `## Documentation`, `## Definition of Done`).
- Checks that the referenced governing GitHub Issue exists, is open, and is not a pull request.
- Validates status semantics: `NOT READY` is a contract-valid state where Definition of Done items may remain unchecked; `READY FOR HUMAN REVIEW` requires all Definition of Done items to be checked (`- [x]`).
- Evaluates the PR body strictly without falling back to or auto-copying commit messages.

### 3. Jules Issue Dispatcher (`jules-issue-dispatcher.yml`)

Automates dispatch-ready issue selection and session preflight verification.
- Executes `src/workflow/julesDispatcher.ts`.
- Preflight checks verify: issue is open, labeled appropriately, dependencies satisfied, no active implementation branch/PR exists, no blocking Jules session exists.
- Supports dry-run testing without calling live external APIs.

### 4. Jules Session Cleanup (`jules-session-cleanup.yml`)

Manually triggered workflow for inspecting and terminating stale Jules sessions.
- Executes `src/workflow/julesSessionCleanup.ts`.
- Validates explicit confirmation tokens and repository ownership before session cleanup.

### 5. ChatGPT Review Relay (`chatgpt-review-relay.yml`)

Manages PR review labeling and review signal comments on PRs targeting `main`.
- Executes `src/workflow/chatgptReviewRelay.ts` / `scripts/chatgptReviewRelay.ts`.
- Deterministically manages the `chatgpt-review` label and a single marked review-signal comment.

## PR contract requirements

PR descriptions must strictly conform to the Phase Safety Gate contract:

```markdown
## Phase / Governing Issue
#39 — Phase 5 closeout — pre-Phase-6 documentation and contract alignment

## Goal
Short description of the PR goal.

## Scope completed
- Item 1
- Item 2

## Architecture
Summary of architectural boundaries respected.

## Data integrity
Confirmation of schema / migration handling.

## Verification
Exact commands executed and output.

## Security
Security checks performed.

## Documentation
Docs modified or created.

## Definition of Done
- [x] All Issue acceptance criteria satisfied
- [x] Verification commands pass cleanly
- [x] Scope remains strictly within governing Issue
```

PR status remains **NOT READY** until all checks pass and verification is complete, after which it becomes **READY FOR HUMAN REVIEW**. When work is blocked on environment boundaries or missing external capabilities, setting status to **NOT READY** keeps the PR contract valid while handoff details are documented under `### Blockers / External dependencies`.

## Environment Verification Contract

The workflow explicitly distinguishes four verification stages:
1. **Source implementation complete:** Code, types, and unit/integration tests written.
2. **Isolated migration/schema validation:** Migration SQL generated and tested against an isolated engine (`@electric-sql/pglite` via `npm test` or `npm run db:verify`).
3. **Target database migration applied:** Migration SQL executed against the actual target PostgreSQL/Supabase database (`DATABASE_URL`).
4. **Target runtime smoke test passed:** Application routes and behavior verified against the target database environment.

> **Crucial Rule:** A migration file or PGlite test run must NEVER be represented as proof that a remote or target database is migrated. For schema-changing issues, the Issue contract must explicitly state whether target-database access/credentials are expected to be available to the agent.

## Agent Escalation & Blocker Handoff Protocol

When implementation or verification encounters an environment boundary, missing credential, external service limitation, or browser testing requirement that prevents full completion:
- **No Masking:** Never guess, mask, or downgrade acceptance criteria, nor edit unrelated code or prose to fake completion.
- **Truthful Status:** Set PR status to `NOT READY`.
- **Structured Handoff:** Record a `### Blockers / External dependencies` section in the PR body containing:
  1. **Attempted / Command:** Command or test executed.
  2. **Error / Missing Capability:** Exact error message or environmental boundary encountered.
  3. **Affected Criterion:** Specific acceptance criterion blocked.
  4. **Environmental Boundary:** Credential, database, API, or infrastructure boundary.
  5. **Concrete Human Action Required:** Exact step required from human engineer.
  6. **Independently Verified:** In-scope work that was successfully tested and verified.
- **Scope Boundary:** Resume only independently verifiable in-scope work; do not claim blocked criteria are satisfied.
- **Transition Gate:** Changing status to `READY FOR HUMAN REVIEW` requires every blocker to be resolved or the governing Issue explicitly re-scoped by a human engineer.

## Runtime Verification Matrix

For externally verifiable routes and runtime behavior, Issues and PRs utilize a standard matrix format:

| Route | Expected Status | Required Auth State | Data / Env Prerequisite | Automated Test Coverage | Human Smoke-Test Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/browse` | 200 OK | Public | Published listings in target DB | Unit/integration test in `test/discovery.test.ts` | Required if target DB schema updated |

## Specialist agent roles

Specialist definitions reside in `.github/agents/`:
- **Architecture Specialist:** Domain boundaries, layer separation, persistent contracts.
- **Data / Catalog Specialist:** Release metadata, schema migrations, controlled vocabularies.
- **UI Specialist:** EJS view templates, design system tokens, responsive CSS, accessibility.
- **Marketplace Specialist:** Listing lifecycle state machine, photo pipeline, comments.
- **Verification Specialist:** Automated tests, CI workflow verification, PR safety gate rules.

## Core safety principles

- Live dispatch fails closed on missing metadata or open dependencies.
- No automated self-merging to `main`.
- `CHATGPT.md` is strictly read-only context.
- Stale session cleanup requires explicit confirmation token verification.
- Review continuations stay on the original feature branch.
