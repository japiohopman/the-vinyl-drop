# Technical Architecture

## Stack choices

| Layer | Implemented Technology | Notes / Details |
| --- | --- | --- |
| Runtime | Node.js (v22+) | Server environment |
| Language | TypeScript (v5.8) | Strict mode configuration |
| Web Framework | Express (v4.21) | HTTP routing and middleware |
| View Rendering | EJS (v3.1) | Server-rendered HTML templates |
| Database | PostgreSQL | Hosted on Supabase; tested locally via `@electric-sql/pglite` |
| Database ORM | Drizzle ORM (v0.45) | Schema definitions in `src/db/schema/` |
| Migration Tool | Drizzle Kit (v0.31) | SQL migrations in `drizzle/` |
| Input Validation | Zod (v3.24) | Route, body, and schema validation |
| Authentication | Supabase Auth | PKCE cookie-backed storage (`src/lib/supabase.ts`) |
| Storage | Supabase Storage | `listing-photos` bucket |
| Multipart Uploads | `@fastify/busboy` | Streaming file upload parser (5MB limit, 5 files max) |
| Image Processing | Sharp (v0.35) | Server-side WebP conversion, 2048px downscaling, EXIF stripping |
| Testing | Jest (v29) & Supertest (v7) | Unit and integration testing |
| Accessibility Testing | `@axe-core/playwright` / Playwright | Automated WCAG compliance checks (`npm run test:a11y`) |
| Styling & Tokens | Vanilla CSS | Tokens & utilities in `public/css/style.css` |

## Application layers and responsibilities

```
HTTP Request
  │
  ├── 1. Routes (`src/app/routes/`)
  │      Maps methods and URL paths to controllers
  │
  ├── 2. Middleware (`src/app/middleware/`)
  │      - `sessionMiddleware`: Binds Supabase Auth user & profile to `req`
  │      - `requireAuth`: Enforces login redirect for protected routes
  │      - `validateSameOrigin`: Enforces CSRF same-origin origin/referer validation
  │      - `multipartUploadHandler`: Streaming busboy upload parser
  │      - `errorHandler`: Centralized error catching & 500 HTML/JSON response
  │
  ├── 3. Controllers (`src/app/controllers/`)
  │      Extracts params, calls validators, calls services, prepares view models
  │
  ├── 4. Validation (`src/validators/`)
  │      Zod schemas for condition, price, release, listing, comment, and profile inputs
  │
  ├── 5. Domain Services & Repositories (`src/services/` & `src/db/`)
  │      Executes business logic, authorization checks, and Drizzle ORM database queries
  │
  └── 6. View Models & EJS Rendering (`src/app/utils/render.ts` & `views/`)
         Constructs structured presentation view data and renders HTML via `renderWithLayout`
```

## Implemented source tree

```
src/
  app/
    controllers/        # Route controllers (home, browse, listing, profile, auth, release)
    middleware/         # Session, auth, csrf, upload, and errorHandler middleware
    routes/             # Express router definitions (auth, listing, profile, release, index)
    utils/              # EJS layout renderer helper (`renderWithLayout`)
  db/
    schema/             # Drizzle database schemas (profiles, releases, physicalCopies, listings, listingPhotos, comments, enums)
    index.ts            # Drizzle client initialization
  domain/               # Core domain lifecycle rules (`listingLifecycle.ts`)
  lib/                  # Supabase client factory (`supabase.ts`)
  services/             # Application services (listingService, profileService, discogsService)
  validators/           # Zod validation schemas
  workflow/             # Agentic workflow modules (julesDispatcher, julesSessionCleanup, chatgptReviewRelay)
  server.ts             # Express server entry point

views/
  layouts/              # Master EJS layout (`main.ejs`)
  partials/             # Shared HTML partials (header, nav, footer, listing-card, condition-badge, comment-thread, form controls)
  home/                 # Discovery feed view
  browse/               # Filtered browse view
  search/               # Search results view
  listings/             # Listing show, create, edit, photo, preview, dashboard views
  profiles/             # Public profile and edit profile views
  auth/                 # Login and signup views
  releases/             # Custom release creation view
  errors/               # 404 and 500 error views
  design-system/        # Design tokens and UI primitives showcase

public/
  css/                  # Central design tokens and styles (`style.css`)

drizzle/                # Generated SQL migration scripts managed by Drizzle Kit
```

## Security boundaries

1. **Authentication:** Supabase Auth handles authentication credentials. Application sessions are persisted securely in HTTP-only cookies (`sb-access-token`, `sb-refresh-token`).
2. **Authorization:** Server-side authorization checks verify ownership before profile edits, listing modifications, photo upload/deletion, or status transitions. EJS template rendering never acts as an authorization boundary.
3. **CSRF Protection:** State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) pass through `validateSameOrigin` middleware to verify same-origin provenance via `Origin` and `Referer` headers.
4. **File Upload Security:** Multipart uploads streaming through `@fastify/busboy` are bounded by strict file size (5MB) and photo count limits (5 per listing). Sharp processes image buffers, strips EXIF metadata, converts to WebP, and validates image structure before storage.
5. **Database Parameterization:** All database queries utilize Drizzle ORM parameterized SQL statements, preventing SQL injection vulnerabilities.

## Testing and verification architecture

- **Unit Tests:** Pure validators (`condition`, `listingStatus`, `release`), lifecycle state machine rules (`listingLifecycle.ts`), and monetary price converters (`parsePriceEurToCents`).
- **Integration Tests:** Endpoint HTTP integration tests (`Supertest`), Supabase Auth cookie session flows, profile updates, listing lifecycle transitions, and comment posting.
- **Database Migration Testing:** Isolated in-memory PostgreSQL engine (`@electric-sql/pglite` via `scripts/verify-migration.ts`) tests fresh migration execution and forward upgrade data preservation without external database dependencies.
- **Accessibility Testing:** Automated Playwright axe-core audits (`scripts/test-accessibility.ts` / `npm run test:a11y`) verify WCAG AAA contrast, semantic HTML, and ARIA form labeling.
