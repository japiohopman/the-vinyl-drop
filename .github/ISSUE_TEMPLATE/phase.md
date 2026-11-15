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

## Visual reference (complete for visible UI work; otherwise write N/A)

- **Route and HTTP method:** exact route(s) and action(s).
- **User and UI state:** authentication/data state and the screen, dialog, editor, empty/error/success state.
- **Viewport and theme:** exact mobile/tablet/desktop widths and theme to preserve or change.
- **Relevant reference:** link the matching row in docs/verification/UI_VISUAL_REFERENCE.md and the relevant screenshot(s). If no exact reference exists, say so and name the nearest valid reference.
- **Intentional visual changes:** list what should change and what must remain unchanged.
- **Evidence:** required Playwright/manual capture and whether a reviewed baseline update is expected.

## Acceptance Criteria

<!-- Define unambiguous criteria that determine when the phase is finished -->
- [ ]

## Security & Data Impact

<!-- Detail authentication, permissions, privacy, schema, database, or storage impact (or state N/A if none) -->
<!-- For schema-changing issues, state whether target database credentials/access are expected to be available to the agent -->

## Specialist & Handoff Information

- **Primary Specialist:** [Architecture | Data / Catalog | UI | Marketplace | Verification]
- **Handoff Protocol:** <!-- Describe cross-specialist inputs/outputs or dependencies -->

## Required Verification

<!-- Specify deterministic commands and manual verification protocols required -->
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

### Runtime Verification Matrix

<!-- Standard matrix for externally verifiable routes and runtime behavior -->
<!--
| Route | Expected Status | Required Auth State | Data / Env Prerequisite | Automated Test Coverage | Human Smoke-Test Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| | | | | | |
-->

## Dispatch Metadata

- **Phase:** Phase [X]
- **Expected Branch Type:** feature/[phase-name]
