# Navigation, Icon, and Feedback Interaction Contract (Draft v1)

**Design ID:** `DESIGN-122` / `navigation-interaction-contract--draft-v1`
**Purpose:** Define canonical, implementation-ready specifications for responsive navigation, account actions, SVG icon usage, toast feedback, and messaging-window interactions for The Vinyl Drop.
**Status:** `draft`
**Owner Review Status:** Direction agreed by Jaap and ChatGPT on 2026-10-16. Draft v1 contract prepared for implementation workstreams (#123–#126). Awaiting registration in the canonical working map when supplied by Issue #111 (Note: `docs/design/WORKING_MAP.md` is not yet present on `main`).

## Linked Issues

- **Governing Contract:** [#122](https://github.com/japiohopman/the-vinyl-drop/issues/122)
- **Implementation Workstream Issues:**
  - [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) — SVG icon inventory, normalization, and shared EJS mechanism.
  - [#124](https://github.com/japiohopman/the-vinyl-drop/issues/124) — Responsive navigation and `YOU` account surface.
  - [#125](https://github.com/japiohopman/the-vinyl-drop/issues/125) — Success toast lifecycle and persistent actionable errors.
  - [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126) — Desktop floating messaging window and truthful unread indicator.
- **Prerequisites & Staging Gates:**
  - [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) — Human-owned staging gate.
  - [#119](https://github.com/japiohopman/the-vinyl-drop/issues/119) — Private messaging security & session context verification.
  - [#117](https://github.com/japiohopman/the-vinyl-drop/issues/117) & [#65](https://github.com/japiohopman/the-vinyl-drop/issues/65) — Visual identity and foundation gates.
  - [#111](https://github.com/japiohopman/the-vinyl-drop/issues/111) — Canonical design working map (template scope).
- **Future Context:**
  - [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52) — Future PWA / mobile-shell context only (not in current scope).

---

## Relevant Route, View, and CSS Surfaces

- **Routes:**
  - `/` (Home discovery feed)
  - `/browse` (Browse catalog)
  - `/drop/new` (+ DROP listing creation flow)
  - `/activity` (Community activity feed)
  - `/profile` & `/profiles/:username` (Public seller profile)
  - `/profile/edit` (Edit user profile)
  - `/listings` (Seller dashboard / "My Listings")
  - `/messages` & `/messages/:conversationId` (Private messaging thread views — gated)
  - `/auth/login` & `/auth/signup` (Authentication)
  - `/auth/logout` (`POST` Logout action)
- **EJS Surfaces:**
  - `views/partials/header.ejs` (Desktop/mobile header shell)
  - `views/partials/nav.ejs` (Responsive primary navigation)
  - `views/partials/flash.ejs` (Toast and alert feedback)
  - `views/partials/icon.ejs` (Shared icon partial to be implemented in #123)
  - `views/layouts/main.ejs` (Global application shell)
- **CSS & Token Surfaces:**
  - `public/css/style.css` (Central design tokens: `--color-rust`, `--color-rust-accessible`, `--color-deep-green`, `--border-thick`, typography stacks, responsive breakpoints).

---

## 1. Responsive Navigation Contract

### 1.1 Visual Identity and Architecture
The navigation adheres to the **90s record shop + crate digging** identity: high contrast, solid borders, square control edges, infrared pink accents (`--color-rust: #f60f4b`), and zero glossy SaaS or pill-button patterns. Built strictly for the Express + EJS + TypeScript architecture.

### 1.2 Desktop Navigation (~1024px and wider)
- **Compact Header:** Preserves the owner's Figma layout in `views/partials/header.ejs`.
- **Primary Destinations:** `HOME`, `BROWSE`, `+ DROP`, `ACTIVITY`. Primary destinations are visually distinct from user account controls.
- **Account Action Menu (`YOU` / `@username`):**
  - Authenticated user control shows `You` or `@username`.
  - Clicking/activating opens a compact, floating desktop account dropdown/menu anchored to the control.
  - Menu contains links to:
    1. *View Profile* (`/profiles/:username` or `/profile`)
    2. *Edit Profile* (`/profile/edit`)
    3. *My Listings* (`/listings`)
    4. *Messages* (`/messages`) — *visible strictly when authenticated AND `MESSAGING_ENABLED=true`*.
    5. *Log Out* (`POST /auth/logout`) — *placed at the bottom, visually separated by a border, styled as a secondary action (never a primary navigation destination)*.
  - Unauthenticated desktop menu presents a prominent `SIGN IN` link (`/auth/login`).

### 1.3 Mobile Primary Navigation (~360px – 768px viewports)
- **Fixed Bottom Navigation Bar:** The mobile primary touch bar uses fixed bottom positioning (`position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;`).
- **Safe-Area Inset & Content Padding:**
  - The navigation bar includes safe-area inset handling via CSS: `padding-bottom: env(safe-area-inset-bottom, 0px);` to account for mobile home indicator notches.
  - To prevent the fixed bar from obscuring page content, submit buttons, or footer links, the page body shell receives compensating bottom padding: `padding-bottom: calc(var(--mobile-nav-height, 60px) + env(safe-area-inset-bottom, 0px));`.
- **Five Primary Destinations:**
  1. `HOME` (`/`)
  2. `BROWSE` (`/browse`)
  3. `+ DROP` (`/drop/new`)
  4. `ACTIVITY` (`/activity`)
  5. `YOU` (Triggers full-screen account surface)
- **Behavior & Styling:** Minimum 44x44px touch targets. Active item marked with `aria-current="page"` and high-contrast border/background token.

### 1.4 Mobile `YOU` Account Overlay / Surface
- Tapping **`YOU`** on mobile slides or displays a full-screen account surface overlay.
- **Surface Header:** Displays the current signed-in user identity (`@username` and avatar/placeholder) with an explicit, high-contrast `CLOSE` / `X` button.
- **Grouped Actions:**
  - *View Profile* (`/profiles/:username`)
  - *Edit Profile* (`/profile/edit`)
  - *My Listings* (`/listings`)
  - *Messages* (`/messages`) — *rendered strictly when `MESSAGING_ENABLED=true`*.
- **Bottom Separated Logout:** `LOG OUT` (`POST /auth/logout`) sits at the bottom of the surface, separated by a heavy border (`--border-thick`), styled distinctly from navigation links.
- **Unauthenticated Mobile `YOU` Surface:** Displays sign-in and account creation actions (`/auth/login`, `/auth/signup`).

### 1.5 Route Honesty and Feature Guards
- Destinations and menu items are **never exposed** unless their backing route and feature flag are available in the current environment context.
- `MESSAGES` appears in navigation or the `YOU` surface **only** when `req.user` is present AND `messagingEnabled` is `true` in `res.locals`.

### 1.6 Accessible Interaction Requirements
- **Keyboard Navigation:** Full tab order support. Focus must be trapped inside the mobile `YOU` surface while open and restored to the `YOU` trigger when closed.
- **Escape Key:** Pressing `Escape` closes the desktop account menu or mobile `YOU` surface instantly.
- **ARIA Attributes:** Trigger controls use `aria-expanded="true|false"`, `aria-controls="account-surface-id"`, and `aria-label`. Active links receive `aria-current="page"`.
- **Reduced Motion:** Overlay transitions respect `@media (prefers-reduced-motion: reduce)` by disabling sliding animations and providing instant visibility toggles.
- **Hover Independence:** All navigation and account controls function via click/touch without requiring hover states.

---

## 2. SVG Icon System Contract

### 2.1 Existing Asset Inventory Audit (`public/assets/svg/`)

The repository contains exactly 25 SVG files in `public/assets/svg/`. Inspection confirms that **none** of these 25 functional SVGs are currently directly rendered inside EJS template views (brand logo rendering in `header.ejs` references `/assets/brand/vinyl-drop-cartridge.svg`, and artwork fallbacks reference `/assets/vinyl-placeholder.svg`).

Each asset appears exactly once below with its audited content characteristics and draft usage proposal for workstream [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123):

| File Name | Actual Content & Geometry Attributes | Current Code Reference | Factual Description & Draft Usage Proposal (#123) |
| --- | --- | --- | --- |
| `boombox.svg` | Single-path boombox audio player silhouette. Contains fixed 512px style, full-canvas background square, and wrapper group. | None in templates/code | Boombox audio player silhouette. Draft proposal for community activity feed headers or music features. |
| `calendar.svg` | Multi-path calendar page with date grids. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Calendar page silhouette. Draft proposal for release year / publication date metadata. |
| `cardboard-box-closed.svg` | Cardboard shipping box with tape seam. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Sealed shipping box icon. Draft proposal for shipping / crate digging badges. |
| `click.svg` | Hand cursor pointer click gesture. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Cursor pointer clicking gesture. Draft proposal for interactive cues or onboarding callouts. |
| `cog.svg` | Gear / sprocket cog wheel. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Gear sprocket icon. Draft proposal for settings or profile edit configuration. |
| `confirmed.svg` | Checkmark badge inside circular ring. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Checkmark inside circle badge. Draft proposal for confirmed order/publication or success states. |
| `conversation.svg` | Overlapping speech bubbles. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Dialogue speech bubbles. Draft proposal for private message conversation threads. |
| `envelope.svg` | Sealed mailing envelope. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Mail envelope icon. Draft proposal for `/contact` page indicators or email references. |
| `funnel.svg` | Filter funnel shape. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Filter funnel icon. Draft proposal for `/browse` and `/search` filter toggle triggers. |
| `next-button.svg` | Right arrow inside circular button border. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Right arrow in circle. Draft proposal for pagination forward or multi-step form progress. |
| `pause-button.svg` | Parallel vertical pause bars. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Pause bars symbol. Draft proposal for audio preview pause controls. |
| `photo-camera.svg` | Camera body with lens aperture. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | SLR camera silhouette. Draft proposal for photo upload step (`/listings/:id/photos`). |
| `pin.svg` | Pushpin marker silhouette. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Pushpin marker icon. Draft proposal for location / regional marketplace indicators. |
| `plain-arrow.svg` | Downward pointing block arrow. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Downward arrow silhouette. Draft proposal for accordion expansion or directional movement. |
| `position-marker.svg` | Map location pin marker. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Map pin marker icon. Draft proposal for seller location on listing detail page. |
| `previous-button.svg` | Left arrow inside circular button border. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Left arrow in circle. Draft proposal for pagination backward or form step back controls. |
| `price-tag.svg` | Hanging price tag badge with string loop. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Price tag badge icon. Draft proposal for price display or trade indicator. |
| `round-star.svg` | 5-point star featuring an embedded linear gradient (`url(#delapouite-round-star-gradient-1)`). | Source asset for build scripts (`favicon.ico`, `apple-touch-icon.png`) | Rounded 5-point gradient star. Source for site favicons; draft proposal for favoriting highlights. |
| `save.svg` | Floppy disk silhouette. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Floppy disk icon. Draft proposal for saving draft listings or profile changes. |
| `sound-off.svg` | Speaker symbol with slash/mute. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Muted speaker icon. Draft proposal for audio preview mute toggles. |
| `sound-on.svg` | Speaker symbol with active sound waves. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Active speaker icon. Draft proposal for audio preview unmute toggles. |
| `talk.svg` | Speech bubble with inner discussion dots. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Discussion bubble with dots. Draft proposal for public comment threads (`comment-thread.ejs`). |
| `thought-bubble.svg` | Cloud-shaped thought bubble. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Thought cloud bubble. Draft proposal for seller copy description notes. |
| `trash-can.svg` | Trash bin with lid and handle. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Wastebin trash icon. Draft proposal for photo removal or draft listing deletion. |
| `user.svg` | Person head and shoulders silhouette. Contains fixed 512px style, background square, and wrapper group. | None in templates/code | Person user silhouette. Draft proposal for `YOU` navigation trigger, profile links, avatar fallback. |

### 2.2 SVG Normalization and Color Rules
- **No Blanket Color Replacement:** Fills will **not** be globally replaced with `currentColor`. Each icon must be evaluated individually during workstream [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123).
- **Protection of Fills, Gradients & Artwork:** Fixed fills, linear gradients (such as `round-star.svg`'s `<linearGradient>`), multi-color brand artwork (`/assets/brand/vinyl-drop-cartridge.svg`), contrast relationships, and negative-space geometry must be preserved unless a specific modification is explicitly tested and demonstrably safe.
- **Structural Normalization:** Normalization in [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) focuses strictly on stripping redundant canvas wrapper attributes (such as fixed `style="height: 512px; width: 512px;"`, empty wrapper groups `<g class="" style="" transform="translate(0,0)">`, and full-canvas background square paths `<path d="M0 0h512v512H0z"...>`) while preserving root `<svg>`, `viewBox`, `<defs>`, and core path geometry coordinates.

### 2.3 Reusable EJS Icon Mechanism
- Implementation in [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) will introduce a single project-native partial (`views/partials/icon.ejs`) or inline SVG symbol sprite system.
- Direct copy-pasting of raw `<svg>` path strings into individual EJS templates is prohibited.
- Third-party icon frameworks (FontAwesome, Lucide, React/Vue icon wrappers) are prohibited.

### 2.4 Identified Functional Icon Gaps
The audit identifies the following specific functional gaps required for approved UI interactions:
1. `home` (Navigation home destination)
2. `search` (Search bar input trigger)
3. `close` / `x` (Dismissing toasts, closing mobile account surface)
4. `edit` / `pencil` (Edit profile / edit listing action)
5. `logout` (Logout action indicator)

Only icons strictly needed for approved UI behavior will be added in [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123).

### 2.5 Brand Artwork Distinction
Functional SVGs are strictly separated from brand mark assets. Brand artwork (such as `/assets/brand/vinyl-drop-cartridge.svg`) retains its custom identity and geometry and is not treated as a generic functional icon.

---

## 3. Toast Notifications & Alert Feedback Contract

### 3.1 Server-Confirmed Success Toasts
- **Purpose:** Provide non-blocking feedback for confirmed successful actions (e.g. photo uploaded, profile saved, listing published).
- **Trigger Condition:** Rendered **only after** the server processes an action and confirms success via flash/view model state.
- **Appearance & Position:** High-contrast floating toast banner positioned at top-right on desktop or top-center on mobile, styled with infrared accent or dark ink borders.
- **Lifecycle & Duration:**
  - Automatically dismisses after 4–5 seconds.
  - Contains an explicit, keyboard-accessible `CLOSE` (`X`) button for immediate manual dismissal.
- **Accessibility:** Rendered inside a live region (`role="status"`, `aria-live="polite"`).

### 3.2 Actionable Error Banners
- **Purpose:** Present input validation errors, authorization failures, or system errors that require user resolution.
- **Lifecycle & Persistence:** Error feedback is **never** presented as an auto-dismissing toast. Errors remain fixed and readable until the user acts or resubmits.
- **Format:** Displayed inline within form contexts (`views/partials/form-errors.ejs`) or as a persistent alert banner at the top of the content area.
- **Accessibility:** Rendered inside an assertive live region (`role="alert"`, `aria-live="assertive"`).

### 3.3 Architecture Integration
- Toast feedback extends the existing EJS flash message architecture (`res.locals.flashMessages` / view-model state).
- No secondary or parallel JavaScript notification library will be added.

---

## 4. Private Messaging Window Contract (Future Implementation)

### 4.1 Feature Guard and Authorization Boundary
- **Strict Enforcement:** Private messaging remains **disabled** (`MESSAGING_ENABLED=false`) in staging and production.
- **Explicit Authorization Constraint:** `MESSAGING_ENABLED=false` stays strictly in force **even after** prerequisite Issues [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) and [#119](https://github.com/japiohopman/the-vinyl-drop/issues/119) are closed, until Jaap explicitly authorizes activation after applicable prerequisites and human review.

### 4.2 Desktop Floating Chat Window (~1024px and wider)
- **Compact Widget:** Rendered at the bottom-right of the desktop viewport when an active conversation is open.
- **Controls:** Features a title bar with `MINIMIZE` (`-`) and `CLOSE` (`X`) controls.
- **State Integrity Guarantee:** Opening, minimizing, or closing the floating chat widget **must never** mark messages as read, delete conversations, archive threads, or alter message read status.
- **Accessible Fallback:** The standard full-page messaging views (`/messages` and `/messages/:conversationId`) serve as the primary, fully accessible fallback.

### 4.3 Truthful Unread Indicator Semantics
- Navigation header message affordance displays an unread count badge derived **strictly** from `unreadCount` calculated for the authenticated user's actual participant conversations.
- No fabricated, hardcoded, or simulated unread numbers are permitted.
- Database query boundaries strictly prevent leaking conversation metadata or unread status across users.

### 4.4 Mobile Messaging Fallback (~360px – 768px viewports)
- Floating chat windows are **disabled** on mobile viewports.
- Mobile messaging executes entirely through the full-screen conversation view (`/messages/:conversationId`) with standard back-navigation to the inbox (`/messages`).

---

## 5. Verification and Compliance Criteria

1. **Document Agreement:** `docs/UX_UI.md`, `docs/PAGE_MAP.md`, and this interaction contract must strictly agree on all route, view-model, and feature-flag definitions.
2. **Route Honesty:** All documentation explicitly labels proposed UI behaviors (e.g. mobile 5-item fixed bottom bar, desktop floating chat window) versus implemented backend routes.
3. **Pipeline Verification:** Documentation updates must pass repository linting, typechecking, test execution, and build checks without warnings or errors.
