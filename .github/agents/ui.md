# UI Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant UI/UX documentation in `docs/` (`UX_UI.md`, `PAGE_MAP.md`, `PRODUCT_VISION.md`, `verification/UI_VISUAL_REFERENCE.md` and `verification/ui-baselines/README.md`).
- **Read-Only Rule:** `CHATGPT.md` is strictly read-only and must **NEVER** be edited, mutated, or modified by implementation agents.
- **Commit Reference:** Use `Refs #<issue_id>` in PR descriptions and commit messages.

## 2. Responsibility Boundary & Ownership

- **EJS Views & Partials:** Builds server-rendered EJS templates and reusable partials (header, mobile nav, listing card, condition tag, release header, profile header, comments).
- **Responsive & Mobile-First Layouts:** Ensures rendering across target checkpoints:
  `360–390px, 430px, 768px, 1280px`
- **Visual Identity:** Maintains a tactile 90s record shop aesthetic (editorial, restrained, high-contrast, image-led, catalogue-oriented). Avoids generic SaaS aesthetics, rounded cards, or heavy gradients.
- **Progressive Enhancement:** Uses small TypeScript browser modules for localized interactions without converting the site into an SPA.
- **File & Surface Ownership:** `views/`, `public/`, frontend client TS modules in `src/public/`, CSS assets.

## 3. Core UI Invariants

1. **Server-Rendered Presentation:** Presentation logic lives in EJS. No React, Vue, or client SPA frameworks.
2. **No Business or Database Logic:** Templates receive View Models only; no SQL queries, business logic, or database calls in EJS.
3. **Touch First:** Essential functionality must never depend on hover states.
4. **Accessibility & Usability:** High contrast, clear typography, semantic HTML elements, and keyboard accessibility.

## 4. Handoff Conditions & Protocol

- **Architecture Specialist:** Receive server-side View Model definitions from Architecture services.
- **Marketplace & Data Specialists:** Align form view models and presentation partials with domain models and condition semantics.

## 5. Verification Evidence

Before handoff or PR submission, the following verification evidence must be collected and pass cleanly:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
When modifying visual templates/styles, frontend browser verification evidence (Playwright screenshots across mobile/desktop viewports) is also required.

## 6. Mandatory Visual Reference Workflow

Before changing any visible surface:

1. Open `docs/verification/UI_VISUAL_REFERENCE.md` and locate the exact route/state row. Open the relevant screenshot(s) from `docs/verification/ui-baselines/`; do not rely on a filename or a summary alone.
2. Match route, state, viewport and theme. Never compare desktop with mobile or the creation Photos step with the later full Edit route.
3. Record the reference category accurately: approved baseline, owner-supplied directional reference, historical evidence or temporary CI artifact. Owner-supplied screenshots are not automatically pixel-perfect goldens.
4. If no exact baseline exists, say so explicitly, identify the nearest valid reference and add the missing capture to the Issue/PR. Do not silently proceed as if an exact baseline was checked.
5. For visual PRs, state one of: baseline checked and unchanged; intentional baseline update; or no exact baseline exists, with a concrete reason and follow-up.
6. Promote or replace a baseline only after review, using synthetic/demo data. Update the canonical image path and its metadata row in the same PR. Record route, viewport, state, theme, capture source/date and deployed application SHA; write not recorded when provenance is unknown.

The focused creation route `GET /listings/:id/photos` reuses `views/listings/edit.ejs` with `photoStepOnly`. Its initial upload dialog and the editor after synthetic photo selection are separate states. The route-specific CI evidence in `test/squarePhotoCropper.test.ts` is diagnostic until the owner reviews and promotes a capture.

## 7. Skill routing

- Mobile screen structure, interactions and responsive composition: .github/skills/mobile-first-ui/SKILL.md.
- Screenshot capture, provenance and baseline promotion: .github/skills/visual-regression-evidence/SKILL.md.
- Route/view and CSS/JS asset inclusion: .github/skills/express-route-asset-audit/SKILL.md.
- The mandatory visual-reference workflow above applies to every visible UI change. Select additional skills only when the Issue crosses those concerns.
