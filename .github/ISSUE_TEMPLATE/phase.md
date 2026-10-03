---
name: Phase Issue
about: Define a coherent architectural or product phase with deliverables, dependencies, and verification criteria.
title: 'Phase [X]: [Phase Title]'
labels: 'phase'
assignees: ''
---

## Goal

<!-- State the concrete end state and product/technical goal for this phase -->

## Scope & Deliverables

<!-- List explicit capabilities and components delivered by this phase -->
- [ ]

## Non-Goals

<!-- List items explicitly excluded from this phase to prevent scope creep -->
-

## Acceptance Criteria

<!-- Define unambiguous criteria that determine when the phase is finished -->
- [ ]

## Security & Data Impact

<!-- Detail authentication, permissions, privacy, schema, database, or storage impact (or state N/A if none) -->

## Specialist & Handoff Information

- **Primary Specialist:** [Architecture | Data / Catalog | UI | Marketplace | Verification]
- **Handoff Protocol:** <!-- Describe cross-specialist inputs/outputs or dependencies -->

## Required Verification

<!-- Specify deterministic commands and manual verification protocols required -->
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

## Dispatch Metadata

- **Phase:** Phase [X]
- **Expected Branch Type:** feature/[phase-name]
