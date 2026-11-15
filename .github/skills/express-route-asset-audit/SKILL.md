---
name: express-route-asset-audit
description: Use when tracing an Express page or feature end to end, changing routes/controllers/views, or diagnosing missing route-specific CSS or JavaScript.
---

# Express route and asset audit — The Vinyl Drop

## Current architecture

The app is Node.js, TypeScript, Express, EJS, PostgreSQL/Supabase, Drizzle and Zod. Browser behavior is plain JavaScript and CSS, not a React/Vue SPA.

The normal server-rendered path is:
HTTP request → src/app/routes/ → src/app/middleware/ → src/app/controllers/ → src/validators/ → src/app/services/ → src/app/repositories/ and src/db/ → src/app/view-models/ → views/ → public/js/ and public/css/.

## Read first

- docs/AGENT_GUIDE.md and docs/PAGE_MAP.md.
- docs/TECHNICAL_ARCHITECTURE.md and docs/AGENTIC_WORKFLOW.md for the relevant architectural boundary.
- The exact route, controller, service, repository, view model, EJS and browser assets found in the current tree.

## Repeatable trace

1. Start with the exact HTTP method and route. Confirm it in src/app/routes/ and PAGE_MAP.md.
2. Follow middleware and authorization, including same-origin and upload/rate-limit middleware on mutation routes.
3. Follow the controller to Zod validation and the service/repository boundary. Keep routes thin; no SQL/business logic in EJS.
4. Follow the returned view model into the exact EJS template and included partials.
5. Inspect views/layouts/main.ejs. Trace how currentPath selects the CSS and JavaScript bundles for this exact route. Do not assume that sharing an EJS view means two routes share all assets.
6. Verify the CSS rules actually needed by the page and the browser scripts that activate interactions. Avoid loading unrelated page bundles globally.
7. Add a focused test for the route and its asset contract. Prefer an exact positive assertion for required assets and negative assertions for unrelated bundles.
8. Check both the initial and interactive states where behavior depends on a browser module.

## Worked regression lesson: PR #415

The dedicated GET /listings/:id/photos route reuses views/listings/edit.ejs in photoStepOnly mode. The main layout initially loaded listing-forms.css for /drop/new, /listings/create and /listings/:id/edit, but omitted /listings/:id/photos. The result was broken styling on the mobile photo workflow: dialog/input presentation failed even though the shared EJS view contained the right markup.

PR #415 corrected the route condition and test/cssRouteBundles.test.ts now asserts that the Photos route receives the required scoped bundle without loading listing-interactions.css. Keep this exact distinction in future audits.

## Safety and verification

- Never widen a CSS route matcher without checking every matched route and its asset dependencies.
- Keep server-side authorization and validation authoritative.
- A route render test does not prove browser interaction; use Playwright for dynamic dialogs, file selection and responsive behavior.
- Report exact test commands and which viewport/state evidence exists. Do not claim an external deployed route was tested from a local render.
