# Issue Strategy

## Purpose

GitHub Issues are the execution layer for The Vinyl Drop.

Documentation explains intent and architecture. Issues authorize concrete implementation work.

## Issue categories

### Phase Issue

Defines a coherent architectural/product phase.

Examples:
- Phase 1 — Repository and agentic workflow foundation
- Phase 2 — Design system and application shell

A Phase Issue should contain:
- goal;
- scope;
- dependencies;
- acceptance criteria;
- verification;
- explicit non-goals.

### Feature Issue

Implements a bounded user-facing or technical capability inside a phase.

Examples:
- Create release/listing database schema
- Implement listing creation flow
- Implement mobile browse/search page

### Bug Issue

Describes an observed defect in existing behavior.

Must include:
- observed behavior;
- expected behavior;
- reproduction;
- affected surface;
- regression test requirement.

### Architecture Issue

Used for changes that alter canonical boundaries or infrastructure.

Must include:
- current architecture;
- proposed change;
- migration/compatibility impact;
- alternatives rejected;
- verification.

## Issue dependency model

Prefer explicit dependency references.

Example:

Phase 4
  -> listing data model
  -> listing photo storage
  -> listing creation flow
  -> listing editing
  -> browse/detail

Do not represent dependencies only as text buried in ROADMAP.md.

## Dispatch metadata

Before an Issue can be dispatched to Jules, it should identify:
- phase;
- specialist;
- scope;
- acceptance criteria;
- required verification;
- dependencies;
- expected branch type.

A future dispatcher can then fail closed if required fields are missing.

## Labels

Initial label vocabulary:

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

Labels classify work. They do not replace Issue acceptance criteria.

## Issue quality rules

An Issue is ready for implementation when:
- the requested end state is concrete;
- scope boundaries are explicit;
- success can be tested;
- dependencies are known;
- the specialist responsibility is clear;
- no major product decision remains implicit.

An Issue is not ready when it says only:
- "build the marketplace";
- "make it responsive";
- "improve the UI";
- "fix database stuff".

## PR relationship

Every substantial implementation PR must reference its governing Issue.

The PR proves execution.

The Issue defines authorization.

The documentation explains the larger system.

## Review continuation

When review finds defects:
- do not silently widen the Issue;
- update the PR continuation instructions when the defect is still within scope;
- create a new Issue when the required work is genuinely new scope.

This protects the Jules loop from turning into uncontrolled scope expansion.
