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
- `npm test` (Jest test suite & `@electric-sql/pglite` isolated PostgreSQL database migration verification)
- `npm run build` (TypeScript production compilation)

### 2. Phase Safety Gate (`phase-safety-gate.yml`)

Enforces PR quality and contract completeness before human review.
- Executes `src/workflow/runSafetyGate.ts` / `src/workflow/prSafetyGate.ts`.
- Validates that the PR body contains required exact markdown headings (`## Phase / Governing Issue`, `## Goal`, `## Scope completed`, `## Architecture`, `## Data integrity`, `## Verification`, `## Security`, `## Documentation`, `## Definition of Done`).
- Checks that the referenced governing GitHub Issue exists, is open, and is not a pull request.

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

PR status remains **NOT READY** until all checks pass and verification is complete, after which it becomes **READY FOR HUMAN REVIEW**.

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
