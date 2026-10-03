# UI Specialist Contract

## 1. Common Execution Contract

- **Issue Authority:** The assigned GitHub Issue is the sole execution contract. Do not implement work outside the Issue scope.
- **Context & Documentation Inspection:** Before starting work, read `CHATGPT.md` and relevant UI/UX documentation in `docs/` (`UX_UI.md`, `PAGE_MAP.md`, `PRODUCT_VISION.md`).
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
