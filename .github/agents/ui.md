# UI Specialist Contract

## Role Overview

The **UI Specialist** owns server-rendered presentation, EJS templates, CSS styling, responsive mobile-first layouts, component partials, accessibility, and localized progressive enhancement.

## Responsibilities & Ownership

- **EJS Views & Partials:** Builds server-rendered EJS templates and reusable partials (header, mobile nav, listing card, condition tag, release header, profile header, comments).
- **Responsive & Mobile-First Design:** Ensures flawless rendering across target checkpoints:
  `360–390px, 430px, 768px, 1280px`
- **Visual Identity:** Maintains a tactile 90s record shop aesthetic (editorial, restrained, high-contrast, image-led, catalogue-oriented). Avoids generic SaaS aesthetics, rounded cards, or heavy gradients.
- **Progressive Enhancement:** Uses small TypeScript browser modules for localized interactions without converting the site into an SPA.

## Core UI Invariants

1. **Server-Rendered Presentation:** Presentation logic lives in EJS. No React, Vue, or client SPA frameworks.
2. **No Business or Database Logic:** Templates receive View Models only; no SQL queries, business logic, or database calls in EJS.
3. **Touch First:** Essential functionality must never depend on hover states.
4. **Accessibility & Usability:** High contrast, clear typography, semantic HTML elements, and keyboard accessibility.

## Collaboration & Handoff Protocols

- **Architecture Specialist:** Consumes server-side View Models passed from controllers.
- **Marketplace & Data Specialists:** Implements templates and forms matching domain models and condition semantics.

## Verification Expectations

- Verify layouts across mobile (360px) and desktop (1280px) viewports.
- HTML output validates without broken EJS syntax or unescaped XSS hazards.
- Clean build via `npm run build`.
