# 🤖 AGENTS.md — Repository Instructions for Implementation Agents

Welcome to **The Vinyl Drop** repository. This document provides core instructions and technical guidance for automated implementation agents (including Jules) working in this repository.

---

## 1. Primary Directives & Workflow Rules

1. **Issue = Execution Contract**
   - GitHub Issues authorize implementation work. Do not infer or invent scope outside the assigned Issue.
   - Do not dispatch work from documentation, chat history, or speculative task lists.

2. **`CHATGPT.md` is Read-Only Context**
   - `CHATGPT.md` contains durable project context maintained exclusively by ChatGPT.
   - Implementation agents **must treat `CHATGPT.md` as read-only** and must never edit, mutate, or modify it.

3. **Commit & Branch Conventions**
   - Work on feature branches off `main`.
   - Use `Refs #<issue_id>` in PR bodies and commit messages during phase execution.
   - Do not use `Closes #<issue_id>` until the entire governing phase is complete.

4. **Specialist Role Assignment**
   - Consult specialist contracts located under `.github/agents/` for domain boundaries and responsibilities:
     - `.github/agents/architecture.md`
     - `.github/agents/data-catalog.md`
     - `.github/agents/ui.md`
     - `.github/agents/marketplace.md`
     - `.github/agents/verification.md`

5. **Environment & External Dependency Boundaries**
   - Do not assume access to target databases, credentials, production-like services, browser environments, external APIs, or deployment infrastructure.
   - Isolated migration/schema validation (`npm run db:verify` or `npm test`) verifies SQL syntax and forward upgrade logic against an isolated in-memory engine (`@electric-sql/pglite`), but does NOT prove that a configured Supabase or target PostgreSQL database has been migrated.

6. **Failure & Escalation Protocol**
   - When implementation or verification hits an environmental boundary, missing capability, or external dependency that prevents satisfying an acceptance criterion, **never guess, mask, or downgrade acceptance criteria**, nor edit unrelated code or prose to fake a green result.
   - When blocked, set PR status to `NOT READY`.
   - Add a structured handoff section `### Blockers / External dependencies` to the PR body with the following required fields:
     - **Attempted / Command:** Exact command or test executed
     - **Error / Missing Capability:** Exact error output or missing environmental capability
     - **Affected Criterion:** Specific acceptance criterion blocked
     - **Environmental Boundary:** Target database credentials, external API key, deployment infra, etc.
     - **Concrete Human Action Required:** Exact step required from the human engineer
     - **Independently Verified:** In-scope work that was successfully completed and verified
   - Changing status to `READY FOR HUMAN REVIEW` requires every blocker to be resolved or the governing Issue explicitly re-scoped by a human engineer.

7. **PR Contract Integrity & Evidence Standards**
   - The Phase Safety Gate evaluates the actual PR body strictly. Commit messages are not substitutes for required PR-body contract sections.
   - An agent completion message is not evidence of completion; evidence must come strictly from source code, passing test suites, environment verification, and PR contract state.

---

## 2. Architecture & Technical Invariants

1. **Server-Rendered EJS Architecture**
   - Node.js, TypeScript, Express, EJS, PostgreSQL (Supabase), Drizzle ORM, Zod.
   - Standard application flow: `request -> route -> validation -> service -> repository/database -> view model -> EJS`.
   - No SQL queries, direct database calls, or complex business logic in EJS templates or routes.
   - Server-rendered HTML only; do not introduce client-side SPA frameworks (React, Vue, etc.).

2. **Domain Boundaries**
   - **Release metadata != Physical copy != Listing.**
   - Release metadata represents canonical musical releases (genre-agnostic, single source of truth, not duplicated per seller).
   - Listings represent individual seller physical copy offers and reference a Release entity.

3. **Monetary Values**
   - Prices and monetary amounts MUST be stored as integer minor units (e.g. €34.95 -> `3495`). Never use floating-point numbers for currency.

4. **Condition Grading**
   - Controlled vocabulary for media and sleeve condition: `M, NM, VG+, VG, VG-, G+, G, F, P`. Validate strictly with Zod schemas and database constraints.

5. **Security & Authorization**
   - All authorization checks and input validation must occur on the server side.

---

## 3. Mandatory Verification Pipeline

Before marking any plan step complete or submitting a PR, agents must execute and confirm the full verification suite cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Passing verification is required evidence of progress. All commands must exit with status code 0.
