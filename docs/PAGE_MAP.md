# Application Page and Route Map

This document records the exact route and view architecture implemented in the application as of Phase 7, as well as canonical links to proposed interaction contracts.

## Interaction Design Contracts

Canonical UI interaction contracts and specification notes:
- **Navigation, Icon, and Feedback Contract (Draft v1):** [`docs/design/working/navigation-interaction-contract--draft-v1.md`](./design/working/navigation-interaction-contract--draft-v1.md) (governed by [#122](https://github.com/japiohopman/the-vinyl-drop/issues/122)).
- **Target Implementation Workstreams:**
  - [#123](https://github.com/japiohopman/the-vinyl-drop/issues/123) — SVG Icon System Catalog, Normalization & Shared EJS Partial.
  - [#124](https://github.com/japiohopman/the-vinyl-drop/issues/124) — Responsive Navigation & Full-Screen `YOU` Account Overlay.
  - [#125](https://github.com/japiohopman/the-vinyl-drop/issues/125) — Server-Confirmed Success Toasts & Persistent Error Banners.
  - [#126](https://github.com/japiohopman/the-vinyl-drop/issues/126) — Desktop Floating Chat Window & Truthful Unread Indicator (Gated).
  - [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52) — Future PWA / Mobile Shell Context (Out of scope for current UI implementation).

## Implemented public routes

| Route | HTTP Method | Controller Action | Primary Data / Purpose |
| --- | --- | --- | --- |
| `/` | `GET` | `homeController.getHomePage` | Discovery feed displaying recent published listings |
| `/browse` | `GET` | `browseController.getBrowsePage` | Filtered browse page (genre, condition grade, price range, trade flag) |
| `/search` | `GET` | `browseController.getSearchPage` | Search results matching keyword query across releases & descriptions |
| `/activity` | `GET` | `activityController.getActivityPage` | Community activity feed |
| `/contact` | `GET` | `infoController.getContactPage` | Contact & support details |
| `/community-rules` | `GET` | `infoController.getCommunityRulesPage` | Conduct rules and guidelines |
| `/listings/:id` | `GET` | `listingController.getListingDetailPage` | Listing detail page (release metadata, physical copy, photos, seller, comments) |
| `/profiles/:username` | `GET` | `profileController.getPublicProfile` | Compact public profile summary and Crate entry/count |
| `/profiles/:username/crate` | `GET` | `profileController.getPublicProfileCrate` | Paginated grid of the user's published Crate records |
| `/profile/:username` | `GET` | `profileController.getPublicProfile` | Legacy alias for compact public profile; `?page=N` redirects to canonical Crate route |
| `/profile/:username/crate` | `GET` | `profileController.getPublicProfileCrate` | Legacy alias for public Crate listings |
| `/auth/login` | `GET` | `authController.getLoginPage` | User login form |
| `/auth/signup` | `GET` | `authController.getSignUpPage` | User registration form |
| `/auth/google` | `GET` | `authController.getGoogleOAuth` | Initiate Google OAuth PKCE flow |
| `/auth/callback` | `GET` | `authController.getAuthCallback` | Supabase OAuth callback route |
| `/health` | `GET` | Inline handler | Health check JSON status (`200 OK`) |
| `/design-system` | `GET` | `designSystemController.getDesignSystemPage` | Design system component showcase |

## Implemented authenticated routes (`requireAuth` enforced)

| Route | HTTP Method | Controller Action | Purpose |
| --- | --- | --- | --- |
| `/drop/new` | `GET` | `listingController.getSelectReleasePage` | + DROP product entrypoint (select or find release) |
| `/listings` | `GET` | `listingController.getSellerListings` | Seller dashboard ("My Listings") |
| `/listings/new` | `GET` | `listingController.getSelectReleasePage` | Select existing release for listing creation |
| `/listings/create` | `GET` / `POST` | `getCreateListingPage` / `postCreateListing` | Describe physical copy and create draft listing |
| `/listings/:id/edit` | `GET` / `POST` | `getEditListingPage` / `postEditListing` | Edit draft or published listing details |
| `/listings/:id/photos` | `POST` | `postUploadPhoto` | Upload photo (busboy streaming + sharp WebP processing) |
| `/listings/:id/photos/:photoId/delete` | `POST` | `postDeletePhoto` | Delete photo and re-compact display order |
| `/listings/:id/photos/reorder` | `POST` | `postReorderPhotos` | Reorder listing photo array |
| `/listings/:id/preview` | `GET` | `getPreviewListingPage` | Preview listing before publishing |
| `/listings/:id/publish` | `POST` | `postPublishListing` | Transition draft listing to `published` |
| `/listings/:id/archive` | `POST` | `postArchiveListing` | Transition listing to `archived` status |
| `/listings/:id/comments` | `POST` | `postCreateComment` | Post public comment on listing |
| `/messages` | `GET` | `messagingController.getInboxPage` | Private messaging inbox (gated by `MESSAGING_ENABLED`) |
| `/messages/:conversationId` | `GET` | `messagingController.getConversationPage` | Conversation thread view (gated by `MESSAGING_ENABLED`) |
| `/messages/listing/:listingId` | `POST` | `messagingController.postStartConversation` | Start or reopen conversation on a listing |
| `/messages/:conversationId/send` | `POST` | `messagingController.postSendMessage` | Send a message in a conversation thread |
| `/messages/:conversationId/read` | `POST` | `messagingController.postMarkRead` | Mark conversation thread read for current participant |
| `/messages/:conversationId/archive` | `POST` | `messagingController.postArchiveConversation` | Archive conversation thread for current participant |
| `/releases/new` | `GET` / `POST` | `getCreateCustomReleasePage` / `postCreateCustomRelease` | Create custom catalog release |
| `/releases/import-discogs` | `POST` | `postImportDiscogsRelease` | Import release metadata from Discogs API |
| `/profile` | `GET` | `profileController.getCurrentProfile` | Redirect authenticated user to own public profile |
| `/profile/edit` | `GET` / `POST` | `getEditProfilePage` / `postEditProfile` | Edit own profile details (display name, bio, location) |
| `/auth/logout` | `POST` | `authController.postLogout` | Log out user and clear auth cookies |

## Non-implemented / Future routes

The following routes are **NOT implemented** in current code:
- `/favorites` / `/wantlist`: User wantlists or saved records collection page (future Phase 6 concept).
- Buy/trade transaction management state machine (Issue #51).

## View hierarchy (`views/`)

```
views/
  layouts/
    main.ejs                     # Master HTML shell with header, nav, flash, footer
  partials/
    header.ejs                   # Top brand mark header
    nav.ejs                      # Responsive navigation bar
    footer.ejs                   # Footer section
    listing-card.ejs             # Reusable record listing card component
    condition-badge.ejs          # Goldmine condition grade badge component
    comment-thread.ejs           # Listing comment thread component
    flash.ejs                    # Success/error alert banner component
    button.ejs                   # Accessible button primitive
    form-errors.ejs              # Accessible form validation error summary
    form-input.ejs               # Text/number input field partial
    form-select.ejs              # Select dropdown partial
    form-textarea.ejs            # Textarea input field partial
  home/
    index.ejs                    # Discovery feed view
  browse/
    index.ejs                    # Browse with filters view
  search/
    index.ejs                    # Search results view
  messages/
    index.ejs                    # Inbox view
    show.ejs                     # Private conversation thread view
  listings/
    show.ejs                     # Listing detail view with photos & comments
    select-release.ejs           # Select or search release step
    create.ejs                   # Physical copy condition & price form
    edit.ejs                     # Edit listing details form
    photos.ejs                   # Photo upload & reorder interface
    preview.ejs                  # Pre-publication preview view
    my-listings.ejs              # Seller listings dashboard
  profiles/
    show.ejs                     # Public seller profile view
    edit.ejs                     # Edit profile form
  auth/
    login.ejs                    # Sign in view
    signup.ejs                   # Account creation view
  releases/
    new.ejs                      # Custom release creation form
  errors/
    404.ejs                      # Not found error view
    500.ejs                      # Internal server error view
  design-system/
    index.ejs                    # Design tokens & UI components showcase
```

## Layered execution flow

Request processing adheres strictly to the following architecture:

1. **HTTP Request & Middleware Boundary:**
   - Request enters Express pipeline (`src/app/routes/`).
   - `sessionMiddleware` verifies Supabase Auth cookies (`sb-access-token`, `sb-refresh-token`) and attaches `req.user` / `req.profile`.
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
   - Renders `errors/500.ejs` with 500 status code for HTML requests, or returns 500 JSON error for API requests.
