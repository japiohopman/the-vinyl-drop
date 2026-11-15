---
name: Bug Issue
about: Describe an observed defect in existing behavior and specify regression test requirements.
title: 'bug: [Short Summary of Defect]'
labels: 'bug'
assignees: ''
---

## Observed Behavior

<!-- Describe what currently happens incorrectly -->

## Expected Behavior

<!-- Describe what should happen according to specs and domain rules -->

## Scope & Affected Surface

<!-- List affected routes, files, components, view pages, or modules -->
- [ ]

## Non-Goals

<!-- List any out-of-scope refactoring or unrelated fixes -->
-

## Reproduction Steps

1.
2.
3.

## Visual reference (complete for visible UI work; otherwise write N/A)

- **Route and HTTP method:** exact route(s) and action(s).
- **User and UI state:** authentication/data state and the screen, dialog, editor, empty/error/success state.
- **Viewport and theme:** exact mobile/tablet/desktop widths and theme to preserve or change.
- **Relevant reference:** link the matching row in docs/verification/UI_VISUAL_REFERENCE.md and the relevant screenshot(s). If no exact reference exists, say so and name the nearest valid reference.
- **Intentional visual changes:** list what should change and what must remain unchanged.
- **Evidence:** required Playwright/manual capture and whether a reviewed baseline update is expected.

## Acceptance Criteria

<!-- Criteria confirming defect resolution -->
- [ ] Defect resolved according to expected behavior
- [ ] Automated regression test added and passing

## Security & Data Impact

<!-- Detail security, privacy, auth, or data integrity implications of the defect or fix (or state N/A if none) -->
<!-- For schema-changing fixes, state whether target database credentials/access are expected to be available to the agent -->

## Specialist & Handoff Information

- **Primary Specialist:** [Architecture | Data / Catalog | UI | Marketplace | Verification]
- **Handoff Protocol:** <!-- Detail handoffs or dependencies if fix spans multiple layers -->

## Required Verification

<!-- Specify automated regression tests and standard verification checks -->
- [ ] Automated regression test covering this scenario
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
