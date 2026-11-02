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
| Multipart Uploads | `@fastify/busboy` | Streaming file upload parser (`multipartUploadHandler` in `src/app/middleware/upload.ts`) |
| Image Processing | Sharp (v0.35) | Server-side WebP conversion, 2048px downscaling, EXIF stripping |
| Testing | Jest (v29) & Supertest (v7) | Unit and integration testing |
| Accessibility Testing | `@axe-core/playwright` / Playwright | Automated accessibility checks run against WCAG 2.1 AA rule sets (`npm run test:a11y`) |
| Styling & Tokens | Vanilla CSS | Tokens & utilities in `public/css/style.css` |

## Application layers and responsibilities

```
HTTP Request
  │
  ├── 1. Routes (`src/app/routes/`)
  │      Maps methods and URL paths to controllers
  │
  ├── 2. Middleware (`src/app/middleware/`)
  │      - `src/app/middleware/auth.ts`: `sessionMiddleware`, `requireAuth`, `requireOwnership`
  │      - `src/app/middleware/csrf.ts`: `validateSameOrigin` (same-origin CSRF verification)
  │      - `src/app/middleware/upload.ts`: `multipartUploadHandler` (streaming busboy upload parser)
  │      - `src/app/middleware/errorHandler.ts`: `errorHandler` (centralized error handler)
  │
  ├── 3. Controllers (`src/app/controllers/`)
  │      Extracts params, calls validators, calls services, prepares view models
  │
  ├── 4. Validation (`src/validators/`)
  │      Zod schemas for condition, price, release, listing, comment, and profile inputs
  │
  ├── 5. Domain Services & Repositories (`src/app/services/`, `src/app/repositories/` and `src/db/`)
  │      Executes business logic, authorization checks, and Drizzle ORM database queries
  │
  └── 6. View Models & EJS Rendering (`src/app/utils/render.ts` & `views/`)
         Constructs structured presentation view data and renders HTML via `renderWithLayout`
```

## Implemented source tree

```
src/
  app/
    controllers/        # HTTP controllers
    middleware/         # Auth, CSRF, upload, feature guards and error handling
    repositories/       # Database-facing Drizzle query modules
    routes/             # Express route registration
    services/           # Application and domain services
    utils/              # Rendering, image and shared server utilities
    view-models/        # Typed data prepared for EJS presentation
  config/               # Environment schema and runtime feature flags
  db/
    schema/             # Drizzle table and enum definitions
    index.ts            # Database client initialization
  domain/               # Listing lifecycle, photo roles and format rules
  lib/                  # Supabase client and integration helpers
  validators/           # Zod request schemas
  workflow/             # Issue/PR review and safety workflow modules
  server.ts             # Express server entry point

views/
  activity/             # Community activity feed
  auth/                 # Login, signup and recovery views
  browse/               # Browse, Dig and search-result views
  design-system/        # Internal design-system showcase
  errors/               # Error templates
  home/                 # Discovery feed
  info/                 # Terms, privacy, contact, install, options and community rules
  layouts/              # Master EJS layout
  listings/             # Listing dashboard, create, edit, preview, detail and comments
  messages/             # Messaging inbox and conversation views (feature-gated)
  partials/             # Shared header, navigation, footer, icons and form components
  profiles/             # Public profile, Crate and profile editor
  releases/             # Discogs-assisted custom release form

public/
  css/                  # Design tokens, shared CSS and route-specific bundles
  js/                   # Browser interactions (plain JavaScript)

drizzle/                # Generated SQL migrations managed by Drizzle Kit
test/                   # Jest and browser/integration regression suites
scripts/                # Verification, migration, operational and CI support scripts
```

## Security boundaries

1. **Authentication:** Supabase Auth handles authentication credentials. Application sessions are persisted securely in HTTP-only cookies (`sb-access-token`, `sb-refresh-token`).
2. **Authorization:** Server-side authorization checks (`requireAuth`, `requireOwnership` in `src/app/middleware/auth.ts`) verify ownership before profile edits, listing modifications, photo upload/deletion, or status transitions. EJS template rendering never acts as an authorization boundary.
3. **CSRF Protection:** State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) pass through `validateSameOrigin` middleware (`src/app/middleware/csrf.ts`) to verify same-origin provenance via `Origin` and `Referer` headers.
4. **File Upload Security:** Multipart uploads streaming through `multipartUploadHandler` (`src/app/middleware/upload.ts`) via `@fastify/busboy` are bounded by strict file size (5MB) and photo count limits (5 per listing). Sharp processes image buffers, strips EXIF metadata, converts to WebP, and validates image structure before storage.
5. **Database Parameterization:** All database queries utilize Drizzle ORM parameterized SQL statements, preventing SQL injection vulnerabilities.

## Testing and verification architecture

- **Unit Tests:** Pure validators (`condition`, `listingStatus`, `release`), lifecycle state machine rules (`listingLifecycle.ts`), and monetary price converters (`parsePriceEurToCents`).
- **Integration Tests:** Endpoint HTTP integration tests (`Supertest`), Supabase Auth cookie session flows, profile updates, listing lifecycle transitions, and comment posting.
- **Database Migration Testing:** Isolated in-memory PostgreSQL engine (`@electric-sql/pglite` via `scripts/verify-migration.ts`) tests fresh migration execution and forward upgrade data preservation without external database dependencies.
- **Accessibility Testing:** Automated accessibility checks run against WCAG 2.1 AA rule sets (`scripts/test-accessibility.ts` / `npm run test:a11y` checking `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` rulesets).


Repositories live under `src/app/repositories/`; application services live under `src/app/services/`. Database table definitions are under `src/db/schema/`, while migrations are under `drizzle/`. The old top-level `src/services/` and a separate `views/search/` directory are not current repository paths.
