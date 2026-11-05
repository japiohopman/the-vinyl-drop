# Application Page and Route Map

This document records the route/view architecture verified against the application source on 2 November 2026. It is the source of truth for actual routes, rendered EJS views, access context and application-vs-host error ownership.

Visual references and maintenance rules: [UI Visual Reference Library](./verification/UI_VISUAL_REFERENCE.md). Proposed information-page and error-page visual concepts: [Branded Status and Information Page Direction](./design/working/branded-status-and-information-page-direction.md).

## Interaction Design Contracts

Canonical UI interaction contracts and specification notes:
- **Navigation, Icon, and Feedback Contract (Draft v1):** [`docs/design/working/navigation-interaction-contract--draft-v1.md`](./design/working/navigation-interaction-contract--draft-v1.md) (governed by [#122](https://github.com/japiohopman/the-vinyl-drop/issues/122)).
- **Target Implementation Workstreams:**
  - [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) — SVG Icon System Catalog, Normalization & Shared EJS Partial.
  - [#124](https://github.com/japiohopman/the-vinyl-drop/issues/124) — Responsive Navigation & Full-Screen `YOU` Account Overlay.
  - [#125](https://github.com/japiohopman/the-vinyl-drop/issues/125) — Server-Confirmed Success Toasts & Persistent Error Banners.
  - [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126) — Desktop Floating Chat Window & Truthful Unread Indicator (Gated).
  - [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52) — Installable first-party website PWA, install guidance, sharing and QR experience. Implementation is merged; remaining platform acceptance evidence is tracked in the Issue.

## Verified route and screen inventory

**Source audit date:** 2 November 2026. This catalogue is checked against `src/app/routes/index.ts`, the nested route modules, their controllers, the EJS view tree, `src/app.ts`, `src/app/middleware/errorHandler.ts` and `src/app/services/rateLimitService.ts`.

The central screenshot register and visual update process live in [`docs/verification/UI_VISUAL_REFERENCE.md`](./verification/UI_VISUAL_REFERENCE.md). This page is the source of truth for route ownership and which views are actually rendered.

### Public and informational HTML screens

| Screen / state | Route | Controller / action | EJS view | Access and notes |
| --- | --- | --- | --- | --- |
| Home / discovery feed | `GET /` | `homeController.getHomePage` | `views/home/index.ejs` | Public; recent published listings and the Home empty state. |
| Browse | `GET /browse` | `browseController.getBrowsePage` | `views/browse/index.ejs` | Public; desktop browse list/grid, filters, results and no-results state. |
| Search results | `GET /search` | `browseController.getSearchPage` → `getBrowsePage` | `views/browse/index.ejs` | Public; same Browse surface with search parameters, not a separate `views/search/` template. |
| People search | `GET /people` | `peopleSearchController.getPeopleSearchPage` | `views/people/index.ejs` | Public; searches public usernames and display names only, with bounded results and links to existing public profiles. |
| Dig (responsive) | `GET /dig` | `browseController.getResponsiveDigPage` | `views/browse/responsive-dig.ejs` | Public; desktop grid/list and mobile crate/deck interaction share one route and normalized search/filter state. |
| Dig (alternate template route) | `GET /browse/dig` | `browseController.getDigBrowsePage` | `views/browse/dig.ejs` | Public; separate Dig template route retained in route registration. Do not assume it is an alias for `/dig`. |
| Activity | `GET /activity` | `activityController.getActivityPage` | `views/activity/index.ejs` | Public; populated and empty feed states. On feed-load failure the same view is rendered with a safe inline error at HTTP 500. |
| Listing detail | `GET /listings/:id` | `listingController.getListingDetailPage` | `views/listings/show.ejs` | Public; release, physical copy, photos, seller, comments and viewer/favorite states. Unknown/unavailable listing renders the 404 view here; some seller workflow missing-resource/ownership branches currently render the shared 500 template while preserving HTTP 404/403 (see the error ownership matrix). |
| Listing comments | `GET /listings/:id/comments` | `listingController.getListingCommentsPage` | `views/listings/comments.ejs` | Public; dedicated comments page/state. Unknown/unavailable listing renders the 404 view. |
| Public profile | `GET /profiles/:username` | `profileController.getPublicProfile` | `views/profiles/show.ejs` | Public; compact profile, owner vs visitor actions and empty/present profile details. |
| Public Crate | `GET /profiles/:username/crate` | `profileController.getPublicProfileCrate` | `views/profiles/crate.ejs` | Public; paginated published listing grid; owner and visitor empty states differ. |
| Legacy public-profile alias | `GET /profile/:username` | `profileController.getPublicProfile` | `views/profiles/show.ejs` | Legacy alias; canonical links should use `/profiles/:username`. |
| Legacy Crate alias | `GET /profile/:username/crate` | `profileController.getPublicProfileCrate` | `views/profiles/crate.ejs` | Legacy alias; canonical links should use `/profiles/:username/crate`. |
| Contact | `GET /contact` and `POST /contact` | `infoController.getContactPage` / `postContactMessage` | `views/info/contact.ejs` | Public; empty form, validation feedback, throttled submission and provider-handoff failure states remain on the Contact view. |
| Terms of Use | `GET /terms` | `infoController.getTermsOfUsePage` | `views/info/terms.ejs` | Public legal/information page. Visual work must not change legal wording or consent/version behavior. |
| Installation | `GET /install` | `infoController.getInstallPage` | `views/info/install.ejs` | Public PWA install/share instructions and QR code. Origin/canonical-link behavior is intentional. |
| Privacy Notice | `GET /privacy` | `infoController.getPrivacyNoticePage` | `views/info/privacy.ejs` | Public legal/information page. Visual work must not silently alter privacy representations. |
| Community Rules | `GET /community-rules` | `infoController.getCommunityRulesPage` | `views/info/community-rules.ejs` | Public conduct and reporting rules. |
| Options & Appearance | `GET /options` | `infoController.getOptionsPage` | `views/info/options.ejs` | Public, device-local preferences; the six themes and sound/interaction settings are in the existing baseline register. |
| Design system showcase | `GET /design-system` | `designSystemController.getDesignSystemPage` | `views/design-system/index.ejs` | Internal design/QA showcase, not a primary public product journey. A reference is optional unless the showcase itself changes. |

### Authentication and account HTML screens

| Screen / state | Route | Controller / action | EJS view | Access and notes |
| --- | --- | --- | --- | --- |
| Sign in | `GET /auth/login` | `authController.getLoginPage` | `views/auth/login.ejs` | Public; already-authenticated users redirect to their profile. Includes failed sign-in and OAuth-return feedback states. |
| Sign up | `GET /auth/signup` | `authController.getSignUpPage` | `views/auth/signup.ejs` | Public; already-authenticated users redirect to their profile. Includes validation, consent, eligibility and access-denied feedback states. |
| Forgot password | `GET /auth/forgot-password` | `authController.getForgotPasswordPage` | `views/auth/forgot-password.ejs` | Public recovery request form and confirmation/error states. |
| Reset password | `GET /auth/reset-password` | `authController.getResetPasswordPage` | `views/auth/reset-password.ejs` | Recovery-token/session dependent; expired/invalid recovery state may return to the forgot-password view. |
| Current user's profile redirect | `GET /profile` | `profileController.getCurrentProfile` | Redirects to `/profiles/:username` | Authenticated; not a distinct visual page. |
| Edit own profile | `GET /profile/edit` and `POST /profile/edit` | `profileController.getEditProfilePage` / `postEditProfile` | `views/profiles/edit.ejs` | Authenticated; validation and upload feedback remain on the editor. |

Google sign-in uses `POST /auth/google/start`, `GET /auth/google` and `GET /auth/callback` as an OAuth redirect/callback flow. These are not separate stable page designs: failures are rendered in the relevant signup/login view or the shared 500 view.

### Listing, release and seller HTML screens

| Screen / state | Route | Controller / action | EJS view | Access and notes |
| --- | --- | --- | --- | --- |
| My Listings dashboard | `GET /listings` | `listingController.getSellerListings` | `views/listings/index.ejs` | Authenticated seller; active, completed/hidden and empty dashboard states. |
| Select/find release | `GET /drop/new` | `releaseController.getCreateCustomReleasePage` | `views/releases/new.ejs` | Authenticated primary + DROP custom/Discogs-assisted release entry. |
| Select existing release | `GET /listings/new` | `listingController.getSelectReleasePage` | `views/listings/select-release.ejs` | Authenticated existing release-selection flow/entry. |
| Describe physical copy | `GET /listings/create` | `listingController.getCreateListingPage` | `views/listings/create.ejs` | Authenticated; condition, price/trade and copy description; invalid form state remains inline. |
| Edit listing and manage photos | `GET /listings/:id/edit` | `listingController.getEditListingPage` | `views/listings/edit.ejs` | Authenticated seller; listing fields, photo roles, ordering and photo feedback share the editor. |
| Listing preview | `GET /listings/:id/preview` | `listingController.getPreviewListingPage` | `views/listings/preview.ejs` | Authenticated seller/authorized preview; pre-publish state. |
| Custom release form | `GET /releases/new` | `releaseController.getCreateCustomReleasePage` | `views/releases/new.ejs` | Authenticated custom catalogue entry; the `/drop/new` entry uses this same view. |

Photo management is **not a standalone GET page**. Upload, role, delete and reorder are POST actions from the listing editor: `POST /listings/:id/photos`, `/:photoId/role`, `/:photoId/delete` and `/photos/reorder`. The upload/role/delete flows return to the edit view; reorder can return JSON.

The listing state lifecycle is action-driven rather than a new page: `POST /listings`, `/:id/edit`, `/:id/publish`, `/:id/unpublish`, `/:id/archive`, `/:id/dismiss` and `/:id/restore-dismissed` redirect to an existing seller/listing screen. Public comments and favorites are also actions, not additional standalone screens.

### Messaging screens and embedded states

| Screen / state | Route | Controller / action | EJS view | Access and notes |
| --- | --- | --- | --- | --- |
| Messages inbox | `GET /messages` | `messagingController.getInboxPage` | `views/messages/index.ejs` | Authenticated and guarded by `MESSAGING_ENABLED`. |
| Conversation thread | `GET /messages/:conversationId` | `messagingController.getConversationPage` | `views/messages/show.ejs` | Authenticated and guarded by `MESSAGING_ENABLED`. |
| Floating Messages & People widget | Shared layout/client UI state | `GET /messages/widget/unread-count`, `/messages/widget/data`, `/messages/widget/:conversationId` | Embedded widget; JSON supplies conversations, people and thread content | Not a standalone EJS route. Includes Conversations/People tabs, selected thread, unread and minimized/open states. All widget routes share the feature guard and authentication. |

With `MESSAGING_ENABLED=false`, the HTML messaging surface deliberately returns the 404 page and the widget JSON endpoints return a JSON 404. This hides the disabled feature; it is not evidence of a separate 403 page.

### Non-page endpoints and state-changing actions

These endpoints are part of the route contract but are **not screenshot surfaces**:

| Endpoint | Method | Response / visual relationship |
| --- | --- | --- |
| `/api/catalogue-suggestions` | GET | JSON autocomplete suggestions; used inside release/search forms. |
| `/api/people-suggestions` | GET | Bounded JSON suggestions using only public username, display name and avatar URL fields. |
| `/releases/lookup-metadata` | GET | Authenticated Discogs lookup JSON; used within the release form. |
| `/messages/widget/unread-count`, `/messages/widget/data`, `/messages/widget/:conversationId` | GET | Authenticated, feature-gated JSON for the embedded messaging widget. |
| `/health` | GET | JSON health response; operational endpoint, not a visual screen. |
| `/design-system/demo` | POST | Updates the design-system demo state in the existing showcase view. |
| Auth, listing, photo, comment, favorite, release-import and messaging POST routes | POST | Mutations/redirects/JSON; validation or success feedback is normally shown in the owning existing screen, not a separate page. |

### Verified EJS view hierarchy

The view tree below was checked against the repository's `views/` directories. It replaces earlier guesses about a separate Search view, Listing Photos view and My Listings template.

```text
views/
  layouts/
    main.ejs
  partials/
    header.ejs
    nav.ejs
    footer.ejs
    icon.ejs
    listing-card.ejs
    condition-badge.ejs
    comment-thread.ejs
    flash.ejs
    button.ejs
    form-errors.ejs
    form-input.ejs
    form-select.ejs
    form-textarea.ejs
  activity/
    index.ejs
  auth/
    forgot-password.ejs
    login.ejs
    reset-password.ejs
    signup.ejs
  browse/
    dig.ejs
    index.ejs
    responsive-dig.ejs
  design-system/
    index.ejs
  errors/
    400.ejs
    404.ejs
    500.ejs
  home/
    index.ejs
  info/
    community-rules.ejs
    contact.ejs
    install.ejs
    options.ejs
    privacy.ejs
    terms.ejs
  listings/
    comments.ejs
    create.ejs
    edit.ejs
    index.ejs
    preview.ejs
    select-release.ejs
    show.ejs
  messages/
    index.ejs
    show.ejs
  people/
    index.ejs
  profiles/
    crate.ejs
    edit.ejs
    show.ejs
  releases/
    new.ejs
```

### Error response and page ownership matrix

The application currently has three shared error templates: `views/errors/400.ejs`, `404.ejs` and `500.ejs`. The HTTP status and the rendered template are not always one-to-one.

| Status / condition | Current source and HTTP behavior | Current HTML / non-HTML presentation | Visual baseline suitability |
| --- | --- | --- | --- |
| 400 Bad Request | Generic application errors can reach `errorHandler`; many form/filter validation failures instead render the owning form with inline feedback and HTTP 400. | Generic HTML: `errors/400.ejs`; JSON/text requests receive safe response data. Form validation stays in its original view. | Capture one generic 400 and representative inline form errors separately. |
| 401 Unauthorized | Most page access goes through login redirects. API/JSON handlers may return 401. If a 401 reaches the generic HTML error handler it uses `errors/400.ejs`. | Usually redirect or JSON; not a dedicated 401 page. | No separate baseline until a real public HTML 401 path is introduced. |
| 403 Forbidden | Generic HTML errors use `errors/400.ejs` with a 403 title. Some listing-controller ownership branches currently render `errors/500.ejs` while preserving HTTP 403; this inconsistency is recorded, not changed in this documentation issue. | No dedicated 403 template. | Note current template; branded 403 requires a later implementation issue. |
| 404 Not Found | `notFoundHandler`, explicit missing listing/profile responses and the messaging feature guard return 404. | HTML: `errors/404.ejs`; JSON: `{ error: 'Not Found' }`; otherwise plain text. | Yes — primary branded missing-record concept. |
| 429 Too Many Requests | Shared rate-limit middleware sends 429 and `Retry-After`; Contact's own per-email cooldown can render its existing form at 429. | Shared limiter: plain text for HTML requests or JSON when requested; Contact cooldown: `info/contact.ejs`. | Contact inline state is capturable; shared limiter has no branded HTML error screen yet. |
| 500 Internal Server Error | Generic uncaught errors and selected controller failures; Activity has its own inline load-error state at HTTP 500. | Generic HTML: `errors/500.ejs`; Activity failure: `activity/index.ejs`; JSON/text clients receive safe generic output. | Yes — generic 500 and Activity-specific failure state are distinct references. |
| 503 Service Unavailable | Shared rate-limit store/IP prerequisite failure returns 503 directly; Contact provider hand-off failure renders the Contact form with 503. An error passed to the generic Express error handler can also preserve a 503 status while rendering `errors/500.ejs`. | Shared limiter: plain text/JSON; Contact: `info/contact.ejs`; generic Express error: `errors/500.ejs`. | Do not claim a single 503 screen. Capture the Contact provider failure only as an inline Contact state; a branded generic 503 needs a later issue. |
| 502 / 504 Gateway errors | No dedicated application route/template was found. These commonly originate at the reverse proxy/host before the request reaches Express. If an application error with this status is passed to Express, the generic 500 template is used while the HTTP status is preserved. | Hosting-generated response may bypass EJS entirely; application-forwarded error uses `errors/500.ejs`. | Hosting page is not currently an application-owned baseline. |
| 505 HTTP Version Not Supported | No route, controller or dedicated template. A protocol-version rejection is ordinarily owned by the edge/server before Express can render a view. | No application-owned branded 505 response is currently established. | Do not create a fake 505 template/screenshot. Revisit only if the deployed edge exposes a supported custom error-page mechanism. |

A wrong HTTP method does not currently have a dedicated 405 route: unmatched requests fall through to the application's 404 handler unless another middleware explicitly supplies a different status. `getGenericClientErrorMessage` contains a 405 string for an explicitly raised error, but that does not create a 405 endpoint or page.

### Screen state matrix

The following are meaningful states inside existing views, not additional routes:

| View family | States worth mapping/capturing |
| --- | --- |
| Home / Browse / Search | Populated results, no-results/empty state, active filters/search query, relevant validation feedback. |
| Dig | Active front, flipped reverse, filter dialog open/cancelled, empty results, reduced-motion presentation. |
| Listing detail / comments | Owner vs visitor actions, photos/front-back, comments collapsed/open, favorite state, unavailable listing 404. |
| Listing creation / edit / preview | Each step, validation errors, no-photo/photo states, upload success/failure, preview and publish-confirmation feedback. |
| My Listings / Crate | Active/completed/hidden filters; owner empty state vs visitor empty Crate; populated grid. |
| Profiles | Own vs public visitor, optional fields present/absent, edit validation. |
| Auth | Initial forms, validation/denied states, forgot-password confirmation, valid/invalid/expired reset flow, OAuth callback recovery. |
| Messaging | Feature disabled, widget minimized/open, Conversations/People tab, selected thread, empty inbox, unread state (only when enabled). |
| Information | Default page view, in-page navigation/long-scroll, Contact validation/success/provider failure states. |
| Errors | Generic 400, 404 and 500 templates; separately documented rate-limit/503 text/API responses and route-specific inline states. |

### Non-implemented routes and product concepts

The following are not registered as current application routes:
- `/favorites` and `/wantlist` as standalone pages; favorite state/actions are attached to listings and user-specific activity.
- A buy/trade transaction management state machine (Issue #51).
- Dedicated `/errors/403`, `/errors/429`, `/errors/503` or `/errors/505` routes/templates.
- A separate `/search` EJS view, a standalone GET photo-management page, or a distinct OAuth success page.

## Layered execution flow

Request processing adheres strictly to the following architecture:

1. **HTTP Request & Middleware Boundary:**
   - Request enters Express pipeline (`src/app/routes/`).
   - `sessionMiddleware` verifies Supabase Auth cookies (`sb-access-token`, `sb-refresh-token`) and attaches `req.user`; profile rows are loaded by controllers/services only on routes that require them.
   - `requireAuth` enforces login redirects for protected routes.
   - `messagingFeatureGuard` verifies `MESSAGING_ENABLED` feature flag state and returns 404 if disabled.
   - `validateSameOrigin` enforces CSRF same-origin origin/referer verification on state-changing requests (`POST`).
   - `multipartUploadHandler` parses file uploads via `@fastify/busboy`.

2. **Controller Layer (`src/app/controllers/`):**
   - Parses HTTP parameters, query parameters, or form body data.
   - Invokes Zod validator schemas (`src/validators/`).
   - Calls underlying services or repository functions (`src/services/` / `src/db/`).
   - Catches domain validation errors and maps them into view models.

3. **Domain Service & Repository Layer (`src/services/` / `src/db/`):**
   - Executes business rules, state transitions, and authorization checks (e.g. verifying `listing.sellerId === req.user.id`).
   - Interacts with PostgreSQL using Drizzle ORM queries.

4. **View Model & Presentation Boundary (`src/app/view-models/` / `views/`):**
   - Constructs typed view model payloads (e.g. converting price cents into Euros `€XX.XX`, formatting condition badges, mapping Zod errors into `FormViewModel`).
   - Calls `renderWithLayout(res, 'view-name', viewModel)` (`src/app/utils/render.ts`) to wrap the view inside `views/layouts/main.ejs`.

5. **Error Boundary (`src/app/middleware/errorHandler.ts`):**
   - Unhandled controller errors propagate to `errorHandler.ts`.
   - Renders `errors/500.ejs` for HTML requests while preserving the effective HTTP 5xx status, or returns safe JSON/text output for non-HTML clients. The template title may say 500 even when an app-forwarded status is 502/503/504/505.
