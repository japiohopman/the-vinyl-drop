# UX / UI Direction

## Design identity

The visual direction is:

**90s record shop + crate digging + local music community.**

It explicitly does not look like:
- a generic SaaS dashboard;
- a glossy e-commerce template;
- Spotify;
- eBay;
- a social-media clone.

The record cover photography and structured release metadata provide the primary visual character.

## Canonical Interaction Contract Reference

The canonical, version-controlled interaction contract for navigation, account surface, SVG icons, toasts, and messaging window behavior is recorded in:
- [`docs/design/working/navigation-interaction-contract--draft-v1.md`](./design/working/navigation-interaction-contract--draft-v1.md) (governed by [#122](https://github.com/japiohopman/the-vinyl-drop/issues/122)).

The workstream sequence for UI implementation is:
- [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) — SVG icon system cataloging, normalization, and EJS partial mechanism.
- [#124](https://github.com/japiohopman/the-vinyl-drop/issues/124) — Responsive navigation and `YOU` account surface.
- [#125](https://github.com/japiohopman/the-vinyl-drop/issues/125) — Reusable success toasts and persistent actionable error banners.
- [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126) — Desktop floating messaging window and truthful unread indicator (gated on [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) and [#119](https://github.com/japiohopman/the-vinyl-drop/issues/119)).
- [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52) — Future PWA / mobile-shell context (not in current scope).

## Brand

Brand name:

**THE VINYL DROP**

The word "Drop" supports the community language of publishing new record listings and discovering fresh additions.

Brand taglines / cues:

**Buy. Trade. Dig.**

## Visual language

Principles:
- editorial;
- tactile;
- high contrast;
- restrained;
- catalog-oriented;
- image-led.

Avoid:
- rounded card overuse;
- heavy gradients;
- decorative shadows;
- oversized SaaS hero banners;
- unnecessary pill-shaped controls.

Borders, structured typography, record photography, and precise spacing establish visual hierarchy. Design tokens and custom CSS live centrally in `public/css/style.css`.

## Color palette tokens

Custom properties defined in `public/css/style.css`:
- Paper background: `#F3EFE7`
- Ink text/borders: `#151515`
- White surface: `#FFFDF8`
- Infrared / 90s pink accent (CSS token currently named `--color-rust`): `#f60f4b`
- Darker infrared for accessible text links (`--color-rust-accessible`): `#d6003b`
- Deep green accent (`--color-deep-green`): `#30463D`

Color palette tokens are verified against automated accessibility contrast rules for text readability.

## Typography strategy

Typography stack defined in system styles:
- **Brand Wordmark:** `Capriola` (used exclusively for "THE VINYL DROP" logo mark).
- **Display / Headings:** `Space Grotesk` geometric sans.
- **Body / Interface:** `DM Sans` sans-serif.
- **Metadata / Catalog Values:** `IBM Plex Mono` monospace for catalogue numbers, release years, prices, and condition grades.

Typography choices prioritize legibility, fast web font delivery, and catalog structure.

## Email templates

Transactional Supabase Auth emails should carry this same identity rather than introduce a separate visual system: paper background, ink typography and borders, infrared pink action accents, and the `THE VINYL DROP` wordmark/tagline. Email clients cannot be assumed to support the website's CSS or custom fonts, so templates use inline styles, system-font fallbacks, simple table layout, square-edged high-contrast actions, and a visible text wordmark that remains readable when the logo image is blocked. Drafts and application notes live in [`docs/email-templates/`](./email-templates/). Auth URL/token variables are functional contracts and must not change as a side effect of visual styling.

## Responsive strategy & Viewport Boundaries

Mobile is the primary design and implementation target.

Tested viewport boundaries:
- narrow phone (~360–390px);
- standard phone (~430px);
- tablet (~768px);
- desktop (~1024px+ / 1280px+).

Essential functionality relies on touch and click interactions rather than hover states.

## Navigation Architecture and Account Surface Contract

### Current Implemented Navigation (`views/partials/nav.ejs`)
Implemented application primary navigation routes:
- `HOME` (`/`)
- `BROWSE` (`/browse`)
- `+ DROP` (`/drop/new`)
- `ACTIVITY` (`/activity` — implemented public route displaying community activity feed)
- `MESSAGES` (`/messages` — authenticated route gated by `MESSAGING_ENABLED` feature flag)
- `YOU` (`/profile` or `/profiles/:username` — public profile / account link)
- `LOGOUT` (`POST /auth/logout` — authenticated logout action) / `SIGN IN` (`/auth/login`)

### Agreed Target Interaction Model (Owner-Approved 2026-10-16 for [#124](https://github.com/japiohopman/the-vinyl-drop/issues/124))
- **Desktop Navigation:** Compact header retaining Figma layout. Primary destinations (`HOME`, `BROWSE`, `+ DROP`, `ACTIVITY`) stay visually distinct from user account actions. `YOU` / `@username` acts as a dropdown trigger opening a compact floating menu grouping profile views, edit profile, my listings, messages (when enabled), and a visually separated logout button at the bottom.
- **Mobile Primary Navigation:** 5-item app-like fixed bottom navigation bar: `HOME | BROWSE | + DROP | ACTIVITY | YOU`.
  - Fixed bottom positioning (`position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;`).
  - Safe area inset handling (`padding-bottom: env(safe-area-inset-bottom, 0px);`) and compensating main container padding (`padding-bottom: calc(var(--mobile-nav-height, 60px) + env(safe-area-inset-bottom, 0px));`) prevent obscuring page controls or content.
- **Mobile `YOU` Account Surface:** Tapping `YOU` on mobile slides or displays a full-screen account overlay grouping account actions:
  - Header with user handle (`@username`) and high-contrast Close (`X`) control.
  - Grouped links: *View profile*, *Edit profile*, *My listings*, *Messages* (only when authenticated and `MESSAGING_ENABLED=true`).
  - *Log out* (`POST /auth/logout`) placed at the bottom, visually separated by a heavy border (`--border-thick`), styled distinctly from primary destinations.
- **Route Honesty:** Actions and tabs are never rendered unless their backing route and feature flag are available in the current runtime context.

## SVG Icon System Contract (Target for [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123))

- **Inventory:** 25 functional SVGs reside under `public/assets/svg/`.
- **Normalization:** Strips inline fixed dimensions (`height`/`width`), empty wrapper tags, and redundant full-canvas background square paths **only** when visual/code inspection confirms the path is a redundant canvas wrapper and that removing it preserves negative space, contrast, and geometry. Strictly preserves root `<svg>`, `viewBox`, `<defs>`, and path coordinates.
- **Coloring:** Evaluates each SVG individually; no blanket replacement of fills with `currentColor`. Preserves fixed fills, linear gradients (`round-star.svg`), and brand artwork (`vinyl-drop-cartridge.svg`) unless explicitly tested and proven safe.
- **EJS Mechanism:** Uses a single project-native EJS partial (`views/partials/icon.ejs`) or inline SVG symbol sprite system. Raw SVG paths are not duplicated across views.
- **Icon Gaps:** Adds only required functional gap icons (`home`, `search`, `close`, `edit`, `logout`) needed for approved UI behaviors.
- **Brand Distinction:** Brand artwork (such as `/assets/brand/vinyl-drop-cartridge.svg`) remains distinct from functional icons.

## Toast Feedback & Actionable Error Lifecycle Contract (Target for [#125](https://github.com/japiohopman/the-vinyl-drop/issues/125))

- **Success Toasts:** Short, non-blocking feedback (4–5 second duration, dismissible via `X` control) displayed **only after** server confirmation of actions (e.g., photo upload, saved profile, published listing). Rendered inside polite live regions (`role="status"`, `aria-live="polite"`).
- **Actionable Errors:** Error messages (validation, authorization, network) remain readable, persistent, and un-timed until resolved by the user. Rendered in inline form summaries or persistent banners (`role="alert"`, `aria-live="assertive"`).
- **Architecture:** Extends existing EJS flash message locals (`res.locals.flashMessages`) without introducing secondary client notification frameworks.

## Private Messaging Window Contract (Responsive shared widget; follow-up to [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126))

- **One Messaging Hub:** The same floating messaging widget is the primary Messages & People experience on desktop and mobile. The Me menu opens that widget in place; opening or closing it must never navigate to the static inbox.
- **Inbox Tabs:** The widget separates active Conversations from private Saved People with accessible tabs. Conversation selection opens the thread in the same panel; returning from a thread restores the originating tab. People entries link to the public profile and offer a direct Message action, without creating a public Follow relationship.
- **Desktop:** Compact draggable window at the viewport bottom-right, with minimize and close controls. Pointer dragging and keyboard-arrow repositioning remain available. A short fade/scale transition opens and closes the panel. Opening, minimizing, or closing does not delete, archive, or mark messages as read.
- **Mobile:** The shared widget appears as an inset app-like modal with roughly 12px outer margin, a dimmed/blurred backdrop, 5px corners, and a short fade/scale transition. Preserve safe areas, focus containment, background-scroll lock, and touch-sized controls. VisualViewport sizing keeps the composer reachable when the keyboard opens. A downward drag on the header minimizes the panel; an upward drag restores it.
- **Route Fallbacks:** The full inbox/conversation routes (/messages and /messages/:conversationId) remain directly accessible for compatibility, but are not primary Me-menu links or the default widget flow. Me-menu actions and the own-profile Messages & People action open the widget in place. A Message action on another person's profile starts the direct thread in the same widget when its client enhancement is available; the form retains its same-origin POST fallback if JavaScript is unavailable. The primary Messages & People actions are buttons, never links to /messages.
- **Reduced Motion:** Respect prefers-reduced-motion and remove overlay/tab transitions when requested.
- **Conversation Presentation:** Display the other participant's profile avatar in the thread header and beside incoming bubbles; display the current user's avatar beside outgoing bubbles. Avatars are decorative when the surrounding conversation context already identifies the people. Keep the text field and compact icon-only send action together, and use a compact toolbar Archive action instead of a full-width footer button.
- **Truthful Unread Indicators:** Navigation message indicator reflects strictly the authenticated user's actual unreadCount. No fake numbers or data leaks across users.
- **Security & Feature Flag Gating:** Private messaging remains disabled (MESSAGING_ENABLED=false) in staging/production even after prerequisites ([#49](https://github.com/japiohopman/the-vinyl-drop/issues/49)) and ([#119](https://github.com/japiohopman/the-vinyl-drop/issues/119)) close, until Jaap explicitly authorizes activation.

## Home view (`/`)

The home page is a discovery surface featuring recent record drops and search access.

Key sections:
- header brand mark and primary navigation;
- search bar for rapid keyword queries;
- recent drops listing card grid;
- empty state feedback when no published listings exist.

## Browse view (`/browse`) & Search view (`/search`)

Filter and search interfaces designed for one-handed phone use.

Filters:
- keyword search (artist, title, label, catalogue number, description);
- genre;
- media / sleeve condition grade;
- price range (min/max in Euros);
- trade availability flag.

Listing results display clear metadata, price or trade badge, condition tags, and seller location.

## Dig mode (`/dig`)

Mobile Dig is a **single-card deck/discard interaction**, not a tilted or multi-sleeve 3D stack:

- Exactly one physical sleeve is visible at rest, square and facing the viewer. A neutral card edge may hint at a deck, but other records' artwork must remain hidden.
- Swipe left to draw the next record from the right; swipe right to return to the previous record from the left.
- Swipe up to discard the active record off the top while the next record rises into place from below. Swipe down to restore the previous record from above.
- The front/back photo flip is a separate explicit control; horizontal browsing never flips the cover.
- Title, artist and price fade with the active-card transition. Non-active slides remain visually hidden and inert outside the transition.
- Reduced-motion mode removes transition motion but retains a single active sleeve, the selected record, accessible metadata and flip state.
- Use each listing's existing seller-selected front/back photo roles and existing missing-photo placeholders. Do not add a second artwork fallback or change upload/crop behavior.
- The conventional desktop grid/list remains unchanged.

## Activity view (`/activity`)

Community activity feed displaying recent community events:
- `listing.published` events for newly published drops (publicly visible);
- `comment.created` events for public discussion on listings (publicly visible);
- `favorite.created` events for favorited records — **included strictly when `actorId === requestingUserId`** (authenticated users see strictly their own favorite activity; anonymous/unauthenticated visitors do **not** receive `favorite.created` events).

Respects public visibility boundaries and excludes draft, unpublished, or deleted source listings.

## Listing detail view (`/listings/:id`)

Prioritizes listing information in logical hierarchy:
1. listing photography and image viewer;
2. artist and release title;
3. price formatted in Euros (e.g. `€34.95`) or `FOR TRADE` status;
4. Goldmine condition badges (Media condition and Sleeve condition);
5. structured release metadata (label, catalogue number, year, country, format, genre);
6. seller profile card and location;
7. seller's physical copy description;
8. authenticated public comment thread for buyer-seller inquiries.

## Sell flow (`/drop/new` -> `/listings/create` -> `/listings/:id/photos` -> `/listings/:id/preview`)

Mobile-first multi-step workflow:
1. **Find or create release:** Search existing releases or import/enter canonical release metadata (`/drop/new`).
2. **Describe physical copy:** Enter media condition, sleeve condition, price/trade intent, and notes (`/listings/create`).
3. **Upload photos:** Stream upload up to 5 photos with server-side validation and Sharp processing (`/listings/:id/photos`).
4. **Preview & publish:** Review draft listing before transitioning to published status (`/listings/:id/preview`).

Form fields preserve user input on validation errors using structured Zod error view models (`FormViewModel`).

## Public profile and Crate (`/profiles/:username`)

The public profile is a compact introduction to a digger, not a listing feed:
- avatar, display name, @handle, optional location/website, concise bio and member-since metadata;
- a prominent Crate entry using the shared `cardboard-box-closed` icon and a count of published active records;
- `Edit Profile` appears only to the profile owner;
- messaging actions are not shown until direct user-to-user messaging is implemented and enabled.

## Public Crate (`/profiles/:username/crate`)

The dedicated Crate view contains the seller's paginated published-listing grid and the existing reusable listing cards.
- Only published active records are exposed; drafts remain on the authenticated `/listings` management dashboard.
- The owner sees a helpful empty state with `+ Drop a Record`; visitors see a neutral empty-Crate state.
- Legacy `/profile/:username` remains an alias for the compact profile. Legacy `?page=N` profile URLs redirect to the canonical Crate route and preserve the page number.
- Does not expose email, auth provider IDs, internal user keys or drafts.
## Comments component (`views/partials/comment-thread.ejs`)

Public comment threads attached to listings support pre-sale inquiries:
- requires authenticated user;
- chronological listing of comments;
- highlights comments posted by the listing seller;
- sanitized plain text rendering.

Private messaging is not supported via comments.

## Accessibility standards

Automated accessibility checks run against WCAG 2.1 AA rule sets (`npm run test:a11y` checking `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` rulesets):
- semantic HTML sectioning and landmarks (`header`, `nav`, `main`, `footer`);
- accessible form labeling and `aria-describedby` error references;
- visible focus rings across all interactive controls;
- sufficient color contrast for text readability;
- descriptive alt text on record photography;
- keyboard tab navigation throughout form and listing flows;
- explicit `aria-expanded`, `aria-controls`, and `aria-current="page"` attributes across interactive controls;
- `aria-live` regions (`polite` / `assertive`) applied strictly to status and alert feedback containers (such as success toasts and form error summaries).

## Scope boundary reminder

Payment widgets, checkout flows, shipping calculators, and native PWA capabilities (context in [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52)) are **not part of current application scope** and are not implemented.


## Listing detail and seller preview polish — Issue #236

Keep the public listing detail focused on the record: preserve real release metadata, price, condition, trade/status, seller, description, YouTube/privacy disclosure, and the comments entry, but remove redundant helper sentences and repeated headings where they add little. The seller-only `/listings/:id/preview` uses `PREVIEW` and a shared icon-only back-to-My-Listings action in the mobile context header. Its in-content back link remains a desktop fallback only. Publish/edit/archive behavior and seller authorization remain unchanged.

## Profile edit and Saved People boundaries — Issue #237

The profile editor changes only the authenticated user's public profile properties (username, display name, location, avatar URL, website URL, and bio) through the existing validated `/profile/edit` route. Saved People is a different private relationship between the current owner and another profile, accessed through Messages & People; it is not a profile field, does not change the target user's profile, and is not a public Follow graph. Keep these data paths and authorization boundaries separate while using consistent UI styling.

## Mobile Me overlay parity — Issue #234

The mobile Me/About account surface shares the Messenger panel's visual language: 12px outer inset, 5px corners, a restrained shadow, and the same light `rgba(18, 18, 18, 0.48)` backdrop without the heavy blur. The header uses the deep-green surface and infrared divider; account actions use the shared SVG icon partial, compact 1px borders, and at least 44px touch targets.

Keep Me/About transitions vertical/fade-only. The overlay may scroll vertically, but it must not pan horizontally or create page-level horizontal overflow. Preserve focus containment/restoration, Escape and backdrop close, scroll locking, reduced-motion support, existing account routes, POST logout, and strict `MESSAGING_ENABLED` gating. This is presentation polish only; it does not enable or alter messaging.


## Mobile Dig crate and contextual filters — Issue #241

The supplied `public/assets/UI/dig_crate.webp` is the top-down crate source for the **mobile Dig experience only**. Keep the image behind the active sleeve so the crate reads as the physical origin of the existing deck transition without exposing neighbouring album artwork at rest. Preserve the asset's 2:3 aspect ratio.

Mobile Dig offers a compact Filters trigger that opens an accessible dialog for the existing server-side `/dig` filters. Preserve query, genre, condition, price range, sort, format selections, white-label state, and the current view parameter. Cancel/Close discards unsaved dialog edits; Clear all resets the filters through `/dig`.

**Desktop is explicitly unchanged:** at widths of 768px and above, do not show the crate art, mobile filter trigger, or dialog. Preserve the existing desktop grid/list and filter controls.
