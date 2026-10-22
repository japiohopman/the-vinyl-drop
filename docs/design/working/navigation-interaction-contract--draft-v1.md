# Navigation, Icon, and Feedback Interaction Contract (Draft v1)

**Design ID:** `DESIGN-122` / `navigation-interaction-contract--draft-v1`
**Purpose:** Define canonical, implementation-ready specifications for responsive navigation, account actions, SVG icon usage, toast feedback, and messaging-window interactions for The Vinyl Drop.
**Status:** `draft`
**Owner Review Status:** Direction agreed by Jaap and ChatGPT on 2026-10-16. Draft v1 contract prepared for implementation workstreams (#123–#126). Awaiting registration in the canonical working map when Issue #111 is completed.

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

### 1.3 Mobile Navigation (~360px – 768px viewports)
- **App-like Bottom Primary Navigation Bar:** Fixed or sticky primary touch bar at the viewport bottom on mobile devices.
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

| File Name | Semantic Meaning | Approved Usage Guidelines |
| --- | --- | --- |
| `boombox.svg` | Audio / Community drop / Music gear | Visual accent for activity feed, audio/music features, or community headers. |
| `calendar.svg` | Date / Year / Release timeline | Release release date, publication timestamp, or event metadata. |
| `cardboard-box-closed.svg` | Crate / Collection / Shipping | Physical crate digging badge or order/shipping indicators. |
| `click.svg` | Action / Selection | Interactive cues or tutorial callouts. |
| `cog.svg` | Settings / Preferences | Account settings or edit configuration options. |
| `confirmed.svg` | Verified / Success / Published | Success states, confirmed order/publication, or verified seller badge. |
| `conversation.svg` | Dialogue / Active chat | Private message threads or conversation list item. |
| `envelope.svg` | Contact / Direct mail | `/contact` info page or email notification references. |
| `funnel.svg` | Filter / Catalog refinement | `/browse` and `/search` filter toggle controls. |
| `next-button.svg` | Forward / Next step | Pagination forward or multi-step form progress. |
| `pause-button.svg` | Pause state | Audio preview or media control pause. |
| `photo-camera.svg` | Photo upload / Image capture | Listing photo upload interface (`/listings/:id/photos`). |
| `pin.svg` | Location / City | Seller location or regional marketplace filter. |
| `plain-arrow.svg` | Directional indicator | Accordion toggle or directional movement pointer. |
| `position-marker.svg` | Map marker / Seller origin | Geographic location metadata on listing detail pages. |
| `previous-button.svg` | Backward / Previous step | Pagination backward or form step back control. |
| `price-tag.svg` | Price / Trade offer | Listing price display, trade badge, or valuation metadata. |
| `round-star.svg` | Favorite / Rated / Highlight | Item favoriting or seller rating highlight. |
| `save.svg` | Save draft / Bookmark | Saving draft listings or profile changes. |
| `sound-off.svg` | Mute / Silent | Media preview mute control. |
| `sound-on.svg` | Unmute / Audio active | Media preview sound active control. |
| `talk.svg` | Public comment / Discussion | Public comment section (`comment-thread.ejs`). |
| `thought-bubble.svg` | Notes / Seller commentary | Seller description or copy notes field. |
| `trash-can.svg` | Delete / Remove item | Photo removal or draft listing deletion. |
| `user.svg` | Profile / Account identity | Navigation `YOU` control, user profile links, avatar fallback. |

### 2.2 SVG Normalization Rules
When processing SVGs in workstream [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123):
- **Remove Redundant Attributes:** Strip inline fixed dimensions (`style="height: 512px; width: 512px;"`), empty wrapper group transformations (`<g class="" style="" transform="translate(0,0)">`), and blank full-canvas background paths (`<path d="M0 0h512v512H0z" fill="#ffffff" fill-opacity="1"></path>`).
- **Preserve Geometry:** Keep root `<svg>`, original `viewBox` (e.g. `viewBox="0 0 512 512"` or `viewBox="0 0 24 24"`), and core path coordinates (`<path d="..." />`).
- **Color Inheritance:** Replace hardcoded `fill="#fff"` or `fill="#000"` with `fill="currentColor"` for single-color functional icons to enable dynamic CSS styling via design tokens.
- **Multicolor Protection:** Do **not** re-color complex or multi-color artwork.

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

### 4.1 Feature Guard and Security Boundary
- **Status:** Private messaging remains **disabled** by default in staging and production (`MESSAGING_ENABLED=false`).
- **Dependency:** Implementation in [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126) is strictly gated on closing human-owned staging gates ([#49](https://github.com/japiohopman/the-vinyl-drop/issues/49)) and messaging security verification ([#119](https://github.com/japiohopman/the-vinyl-drop/issues/119)).

### 4.2 Desktop Floating Chat Window (~1024px and wider)
- **Compact Widget:** Rendered at the bottom-right of the desktop viewport when an active conversation is open.
- **Controls:** Features a draggable title bar with `MINIMIZE` (`-`) and `CLOSE` (`X`) controls.
- **State Integrity:** Closing or minimizing the floating window **must never** delete, archive, or implicitly mark unread messages as read.
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
2. **Route Honesty:** All documentation explicitly labels proposed UI behaviors (e.g. mobile 5-item bottom bar, desktop floating chat window) versus implemented backend routes.
3. **Pipeline Verification:** Documentation updates must pass repository linting, typechecking, test execution, and build checks without warnings or errors.
