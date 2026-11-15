---
name: Feature Issue
about: Implement a bounded user-facing or technical capability within an active phase.
title: 'feature: [Feature Title]'
labels: 'feature'
assignees: ''
---

## Governing Phase

<!-- Reference the governing phase Issue, e.g., Phase 1 (#18) -->

## Goal

<!-- Describe the user story or technical capability delivered by this feature -->

## Scope & Deliverables

<!-- List specific files, endpoints, components, or modules to be added/modified -->
- [ ]

## Non-Goals

<!-- List explicit items excluded from this feature -->
-

## Visual reference (complete for visible UI work; otherwise write N/A)

- **Route and HTTP method:** exact route(s) and action(s).
- **User and UI state:** authentication/data state and the screen, dialog, editor, empty/error/success state.
- **Viewport and theme:** exact mobile/tablet/desktop widths and theme to preserve or change.
- **Relevant reference:** link the matching row in docs/verification/UI_VISUAL_REFERENCE.md and the relevant screenshot(s). If no exact reference exists, say so and name the nearest valid reference.
- **Intentional visual changes:** list what should change and what must remain unchanged.
- **Evidence:** required Playwright/manual capture and whether a reviewed baseline update is expected.

## Acceptance Criteria

<!-- Unambiguous criteria that define feature completeness -->
- [ ]

## Security & Data Impact

<!-- Detail authentication, authorization, user permissions, schema, or persistence impact (or state N/A if none) -->

## Specialist & Handoff Information

- **Primary Specialist:** [Architecture | Data / Catalog | UI | Marketplace | Verification]
- **Handoff Protocol:** <!-- Detail required handoffs to/from other specialists -->

## Required Verification

<!-- List automated tests and verification steps required -->
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
