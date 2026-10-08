# Security and Privacy

## Trust model

The Vinyl Drop is a local community marketplace for buying, selling, and trading physical vinyl records.

The application handles:
- user identity and authentication credentials (via Supabase Auth);
- public seller profiles and coarse location data;
- record catalog metadata and physical copy condition details;
- uploaded record listing photography;
- public listing discussion comments.

Security boundaries are enforced at the application middleware, service authorization, and PostgreSQL schema layers.

## Implemented authentication architecture

Authentication is powered by **Supabase Auth** using Express cookie-backed PKCE session management (`src/lib/supabase.ts` and `src/app/middleware/auth.ts`).

- User passwords and OAuth credentials are managed entirely by Supabase Auth; custom application code never handles raw passwords.
- Authenticated session tokens (`sb-access-token` and `sb-refresh-token`) are stored in HTTP cookies and validated on incoming requests.
- `profiles.id` maps 1:1 to `auth.users.id` (enforced as a UUID primary key without random default fallback).
- Protected endpoints (`/listings/create`, `/profile/edit`, `/listings/:id/photos`, etc.) enforce `requireAuth` middleware, redirecting unauthenticated users to `/auth/login`.

## Implemented server-side authorization

Authorization checks verify that an authenticated user has permission to perform state-changing operations:

- **Profile Editing:** `profileService.updateProfile` verifies `requestingUserId === targetUserId`.
- **Listing Management:** `listingService` verifies `listing.sellerId === requestingUserId` before allowing listing updates, preview generation, status transitions, or photo operations.
- **Photo Operations:** Photo upload, deletion, and reordering require authenticated seller ownership of the target listing.
- **Comment Creation:** Comment posting requires an authenticated session (`req.user.id`).
- **State Machine Enforcement:** Status transitions (`draft` -> `published` -> `sold`/`archived`) are validated in `src/domain/listingLifecycle.ts`. Terminal states (`sold`, `traded`, `archived`) reject further updates.

Authorization logic is strictly server-side. EJS template conditionals (e.g., displaying an "Edit Listing" button) are presentation conveniences only and never serve as authorization boundaries.

## Implemented CSRF protection

State-changing HTTP requests (`POST`, `PUT`, `DELETE`, `PATCH`) pass through `validateSameOrigin` middleware (`src/app/middleware/csrf.ts`).

- Evaluates request origin using `Origin` and `Referer` headers against the server's expected request host.
- Rejects state-changing requests missing both origin headers with a `403 Forbidden` response.
- Logout (`POST /auth/logout`) strictly requires `POST` method with same-origin verification.

## Input validation and sanitization

- **Zod Schema Validation:** All route parameters, query strings, and form bodies are validated using Zod schemas (`src/validators/`).
- **Controlled Vocabularies:** Condition grades (`M`, `NM`, `VG+`, `VG`, `VG-`, `G+`, `G`, `F`, `P`) and listing statuses (`draft`, `published`, `reserved`, `sold`, `traded`, `archived`) are validated against Zod enums and backed by PostgreSQL `enum` types.
- **Monetary Inputs:** Prices are validated and parsed into integer minor currency units (cents) at controller boundaries (`parsePriceEurToCents`). Negative price values and non-numeric inputs are rejected with 400 Bad Request responses.
- **SQL Injection Prevention:** Database queries use Drizzle ORM parameterized SQL statements, eliminating raw string concatenation.
- **XSS Prevention:** EJS template rendering automatically HTML-escapes string values (`<%= %>`). Comments and descriptions are rendered as plain text.

## Implemented file upload & photo security

Listing photo uploads pass through a multi-stage security pipeline:

1. **Streaming Limits:** `@fastify/busboy` limits upload payloads to a maximum file size of **5MB** per file and a maximum of **5 photos** per listing. Excess files or oversized uploads are rejected with a 400 Bad Request error.
2. **Buffer Inspection & Format Processing:** Image buffers are processed server-side using `sharp` (`processAndValidateImage`):
   - Validates image structure; non-image binaries or unsupported formats are rejected.
   - Converts images to optimized WebP format.
   - Downscales images exceeding 2048px in maximum dimension.
   - Strips EXIF metadata (GPS coordinates, camera metadata) to protect seller privacy.
3. **Storage & Rollback:** Storage paths are generated deterministically and saved in Supabase Storage (`listing-photos` bucket). If database transaction insertion fails, storage objects are automatically deleted.

## Implemented privacy boundaries

**Public Data (Accessible without authentication):**
- Profile `username`, `displayName`, `avatarUrl`, `bio`, and `location` (intentionally coarse, e.g. "Amsterdam Oost");
- Published record listings, release metadata, condition grades, prices, and photos;
- Public listing comments and author display names.

**Private Data (Never published or exposed):**
- User email addresses;
- Supabase Auth provider tokens and session refresh tokens;
- User street addresses or precise geolocation data;
- Unpublished draft listings (accessible only to the listing owner).

Location data is intentionally limited to coarse neighborhood or city names (e.g. "Amsterdam Oost") to facilitate local meetups without compromising home address privacy.

## Future security & moderation capabilities (Not currently implemented)

The following security and moderation capabilities are documented as future roadmap items and are **NOT implemented** in current code:

- User-facing content reporting buttons (for flagrant listings or abusive comments);
- Administrative moderation dashboard;
- IP-based or user-based API rate limiting;
- Automated content abuse filtering;
- Data export and right-to-be-forgotten automated account deletion tools.
