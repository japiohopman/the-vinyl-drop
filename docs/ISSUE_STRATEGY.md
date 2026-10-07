# Issue Strategy

## Purpose

GitHub Issues serve as the authoritative execution contracts for all development work on The Vinyl Drop.

Documentation (`docs/`) defines architectural intent and domain boundaries. GitHub Issues authorize concrete implementation work. Automated agents (Jules) execute strictly within the contract of an assigned Issue.

## Issue categories

### Phase Issue

Defines a major architectural or product milestone.

Examples:
- `#9` — Supabase, PostgreSQL and Drizzle data foundation
- `#13` — Browse, search, listing detail and seller profile views
- `#39` — Phase 5 closeout — pre-Phase-6 documentation and contract alignment

Required contents:
- title and phase designation;
- governing issue number;
- goal and scope;
- acceptance criteria;
- verification steps;
- explicit non-goals and scope boundaries.

### Feature Issue

Implements a bounded feature or capability within an established phase.

Required contents:
- governing phase issue reference;
- detailed acceptance criteria;
- route / domain / view scope;
- mandatory verification commands.

### Bug Issue

Describes a reproduction and fix for an observed defect.

Required contents:
- observed behavior vs expected behavior;
- reproduction steps;
- affected surface;
- regression test requirement.

### Architecture Issue

Defines a change to domain boundaries, schema, persistence, or infrastructure.

Required contents:
- current architectural state;
- proposed modification;
- data integrity / migration impact;
- verification strategy.

## Dispatch readiness requirements

Before an Issue can be dispatched to Jules by `jules-issue-dispatcher.yml`, it must meet preflight criteria:
- Issue is open and not currently assigned to an active PR branch;
- required metadata (Phase, Goal, Specialist, Scope, Verification) is present;
- issue dependencies are resolved and closed;
- no conflicting active Jules session exists for the repository.

## Label taxonomy

Standard repository labels:
- `phase`: Major phase milestone issue
- `feature`: Bounded feature work
- `bug`: Defect fix
- `architecture`: Structural / domain boundary change
- `data`: Database schema or migration work
- `ui`: EJS templates, CSS, or visual work
- `backend`: Express controllers, middleware, or services
- `security`: Auth, CSRF, or security verification
- `verification`: Testing and CI infrastructure
- `chatgpt-review`: PR labeled for ChatGPT review processing
- `blocked`: Work blocked on dependencies

## PR relationship and review continuation

- Every implementation PR must reference its governing Issue (e.g. `Refs #39`).
- Review continuation feedback stays on the existing branch when requested changes fall within the governing Issue's original scope.
- If review identifies brand new scope or an unbudgeted feature request, a separate Issue must be created rather than expanding the active branch scope.
- Human engineers perform the final code review and merge the PR to `main`.
