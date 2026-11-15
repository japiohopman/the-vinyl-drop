---
name: mobile-first-ui
description: Use for visible UI, EJS, responsive layout, navigation, forms or interaction changes in The Vinyl Drop; start from the mobile user journey and the canonical design references.
---

# Mobile-first UI — The Vinyl Drop

## Trigger

Use this skill for any change to a visible page, EJS partial, browser interaction, CSS, navigation, form flow or responsive behavior. It complements the UI specialist contract.

## Read first

- docs/UX_UI.md — product interaction and visual direction.
- docs/PAGE_MAP.md — source-audited routes and page families.
- docs/PRODUCT_VISION.md — product scope and non-goals.
- docs/verification/UI_VISUAL_REFERENCE.md and docs/verification/ui-baselines/README.md — visual reference authority and provenance rules.
- The exact route, EJS view, route-specific stylesheet and browser module in the current source tree.

## Project-specific design rules

The Vinyl Drop is a mobile-first, server-rendered vinyl marketplace with a tactile independent record-shop identity. Mobile is the primary interaction surface; desktop adapts the same product journey rather than defining it.

- Keep key journeys compact, image-led, touch-first and understandable one-handed.
- Preserve semantic HTML, keyboard access, visible focus, high contrast and accessible names. Essential behavior must not depend on hover.
- Keep server-rendered EJS as the presentation architecture. Browser code is progressive enhancement, not an excuse to introduce a SPA.
- Respect the existing design tokens, theme system, fixed mobile navigation and safe-area behavior.
- Avoid generic SaaS patterns, unnecessary rounded cards, heavy gradients, long desktop-shaped dialogs and duplicate form steps.
- Do not force users to re-enter listing details when the flow already has a focused step.

## Repeatable implementation sequence

1. Trace the exact route through src/app/routes/, middleware, controller and view model to the EJS template. Check docs/PAGE_MAP.md against the source.
2. Open the matching image(s) in the UI Visual Reference Library before changing the layout. Match the route, state, theme and viewport; never compare desktop with mobile.
3. Inspect the existing CSS tokens and route-specific asset conditions in views/layouts/main.ejs. Add styles to the owning bundle; do not load every page stylesheet globally.
4. Start with the narrowest relevant mobile width. For listing and photo journeys, include 360, 375, 390 and 430 CSS-pixel checkpoints where practical; check desktop adaptation after mobile behavior is sound.
5. Preserve the existing request/validation/service boundaries and progressive enhancement. Do not move authorization or canonical state into browser code.
6. Verify empty, error, success, keyboard and touch states as relevant. Capture browser evidence and report horizontal overflow or clipped controls explicitly.
7. In the PR, state whether the baseline was checked and unchanged, intentionally updated, or unavailable. Never promote unreviewed screenshots.

## Worked TVD example: listing Photos step

The creation Photos route is GET /listings/:id/photos and reuses views/listings/edit.ejs with photoStepOnly enabled. It must not render the full listing Details form again. Compare the focused Photos journey, not just the later full Edit route. The upload dialog and the editor after selecting a synthetic file are distinct states and should both be checked at mobile widths.

## Do not

- Do not redesign unrelated page families while fixing one route.
- Do not remove the fixed mobile navigation or ignore device safe areas to make a screenshot fit.
- Do not use real owner or tester photos in committed fixtures or screenshots.
- Do not call a page responsive solely because a wide viewport looks correct.
