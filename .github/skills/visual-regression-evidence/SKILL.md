---
name: visual-regression-evidence
description: Use when changing visible UI or when an Issue/PR requires screenshot evidence, baseline comparison, viewport coverage or a visual reference update.
---

# Visual regression evidence — The Vinyl Drop

## Authority and current baseline status

The canonical entry point is docs/verification/UI_VISUAL_REFERENCE.md. Read its index and docs/verification/ui-baselines/README.md before selecting a reference.

The library currently distinguishes owner-supplied visual references, historical images, temporary CI artifacts and promoted approved baselines. Do not silently treat those categories as interchangeable. The owner-supplied 2 November screenshots communicate intended direction but are not automatic pixel-perfect goldens; the central register currently says no committed capture has been promoted as an approved baseline.

## Required sequence

1. Identify the exact route, state, viewport and theme being changed.
2. Find the corresponding row in UI_VISUAL_REFERENCE.md and open the relevant image(s). Desktop and mobile references must match their respective viewport and journey.
3. Record whether the image is an approved baseline, an owner-supplied directional reference, historical evidence or a temporary CI artifact.
4. Capture the same route and state before/after at comparable viewport dimensions, browser, theme and data. Use synthetic fixtures only.
5. Check more than pixel similarity: clipping, overflow, fixed navigation, touch target reachability, keyboard focus, modal bounds, empty/error states and actual interaction behavior.
6. If an exact baseline does not exist, state that clearly, identify the nearest valid reference and add the needed capture to the Issue/PR. Do not imply exact comparison occurred.
7. When a visual change is intentionally accepted, update the canonical image path and matching metadata row in the same PR, after review. Record route, viewport, state, theme, capture date/source and the deployed application commit SHA. If unknown, write not recorded.
8. Keep full matrices in expiring GitHub Actions artifacts. Promote only a small, reviewed, privacy-safe set into ui-baselines/.

## Photos-route evidence example

The dedicated GET /listings/:id/photos route is a focused creation step rendered by views/listings/edit.ejs in photoStepOnly mode. It is not interchangeable with GET /listings/:id/edit.

The route-specific reference is still pending owner review. Automated synthetic evidence should capture:
- The initial Photos step and upload dialog before a file is selected.
- The photo editor after a generated synthetic image is selected.
- Mobile widths 360, 375, 390 and 430 CSS px.
- Record Shop theme, route/state details, test source and application commit provenance.

The current evidence test is test/squarePhotoCropper.test.ts and its CI output is included in issue-333-photo-editor-playwright-evidence. Those images are diagnostic test evidence until an owner reviews and promotes a chosen capture; they are not automatically committed baselines. Do not use private photos, real account data or live Storage writes.

## PR reporting language

Every visual PR must state exactly one:
- Baseline checked and unchanged — link the exact reference and name the route/state/viewport.
- Intentional baseline update — link the new reference and record the deployed app SHA.
- No exact baseline exists — name the nearest valid reference, explain the gap and identify the follow-up capture.

Do not invent missing metadata or overwrite a different route/state to make the register appear complete.
