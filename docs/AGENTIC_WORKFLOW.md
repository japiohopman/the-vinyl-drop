# Agentic Development Workflow

## Goal

The Vinyl Drop should be developed so that the human role is primarily:
1. define product intent;
2. inspect/review completed work;
3. approve merges.

Jules performs implementation work inside explicit GitHub Issue contracts.

ChatGPT acts as architecture/review partner and writes precise continuation instructions into the PR when implementation is incomplete.

## Source of execution truth

**GitHub Issue = execution contract.**

The Issue defines:
- goal;
- scope;
- acceptance criteria;
- constraints;
- verification;
- specialist ownership.

Documentation is not an execution queue.

Do not dispatch Jules by scanning ROADMAP.md or arbitrary checklist documents.

## Phase model

A substantial change belongs to a phase Issue.

Feature Issues may depend on a phase Issue.

Implementation PRs reference the governing Issue.

## Branch rules

Normal implementation:

main
 -> feature branch
 -> PR
 -> review
 -> merge

Rules:
- never start substantial work directly on main;
- one coherent change per branch;
- avoid concurrent agents modifying the same architectural boundary;
- after a phase is merged, create new work from the new main state;
- a review continuation normally stays on the existing implementation branch.

## Jules dispatch contract

The dispatcher should select only an explicitly dispatchable Issue.

Preflight must verify:
- Issue is open;
- required metadata exists;
- dependencies are satisfied;
- no conflicting active implementation PR exists;
- no blocking Jules session exists;
- the selected specialist is valid.

A dry-run selector must be testable without calling the live Jules API.

## Specialist agents

Initial specialist set:

### Architecture Specialist

Owns:
- domain boundaries;
- persistence ownership;
- service/repository structure;
- architectural invariants.

### Data / Catalog Specialist

Owns:
- release metadata;
- condition semantics;
- search/data normalization;
- catalog integrations.

### UI Specialist

Owns:
- EJS;
- CSS;
- responsive design;
- accessibility;
- interactions.

### Marketplace Specialist

Owns:
- listing lifecycle;
- buying/selling/trading;
- comments;
- future messaging/trades.

### Verification Specialist

Owns:
- deterministic tests;
- CI contracts;
- security/evidence review;
- regression coverage.

The implementation Issue identifies the primary specialist.

Cross-specialist handoffs must be explicit in the Issue or PR.

## PR contract

A substantial PR should contain:

### Phase

Reference the governing Issue.

### Goal

State the final state delivered by the PR.

### Scope completed

List completed acceptance items and explicitly state unrelated work was not added.

### Architecture

State the relevant invariants and boundaries.

### Data integrity

Explain schema, persistence, migration and ownership effects.

### Verification

List exact commands and manual/browser checks.

### Security

Required whenever auth, permissions, uploads, or personal data are touched.

### Documentation

State what docs changed or why no documentation change was required.

### Definition of Done

Confirm the Issue acceptance criteria are satisfied.

## ChatGPT review continuation loop

When a PR is not ready:

1. ChatGPT inspects implementation and verification.
2. The review identifies concrete defects or missing acceptance criteria.
3. The PR body receives a **Latest reviewer instruction** section containing exact continuation work.
4. Jules continues on the same branch.
5. CI reruns.
6. The PR is reviewed again.
7. Repeat until the implementation satisfies the Issue.
8. Human performs final review and merge.

The continuation instruction must be concrete enough that Jules does not need to infer the missing work.

## Review instruction format

Recommended PR body section:

### Status

NOT READY

### Required changes

1. Exact defect or missing requirement.
2. Exact implementation change.

### Verification required

- exact command;
- exact browser flow;
- exact expected result.

### Do not change

- unrelated scope;
- established domain boundaries;
- unrelated visual patterns.

### Completion signal

Update the Definition of Done and leave the PR ready for human review.

When the PR is correct:

### Status

READY FOR HUMAN REVIEW

## GitHub Actions

Planned workflow set:

### ci.yml

- install;
- lint/type checking;
- unit/integration tests;
- build.

### phase-safety-gate.yml

- validate PR contract;
- verify Issue reference;
- repository health.

### jules-issue-dispatcher.yml

- dry-run selection;
- safe live dispatch after explicit confirmation.

### jules-session-cleanup.yml

- manual cleanup of explicitly named stale sessions.

### chatgpt-review-relay.yml

- maintain review/queue metadata when PRs change.

These workflows are inspired by the Artificer workflow but must be rewritten for The Vinyl Drop rather than copied unchanged.

## Safety principles

- Live Jules dispatch must fail closed.
- Test workflows must never call the live Jules API.
- Duplicate dispatch must be blocked.
- Stale sessions must never be deleted by an uncontrolled automatic sweep.
- PR origin must never create a security bypass.
- A green build is not proof of behavioral correctness.
- A Jules completion message is not proof that an Issue is complete.

## Issue labels

Proposed taxonomy:
- phase
- feature
- bug
- architecture
- data
- ui
- backend
- security
- verification
- workflow
- blocked

Implementation may refine the names during workflow bootstrap.

## Agent context contract

Create a root context document later:

VINYL_DROP_CONTEXT.md

It should record:
- product purpose;
- canonical data owners;
- architecture invariants;
- visual principles;
- workflow rules;
- current implementation status.

This prevents agents from reconstructing architecture from stale task prose.

## What the workflow must not become

Do not recreate:
- a hidden task board;
- an autonomous merge loop;
- an agent that edits main directly;
- a dispatcher that chooses work from arbitrary documentation;
- a generic refactor agent with no Issue boundary.

The human retains the final merge decision.
