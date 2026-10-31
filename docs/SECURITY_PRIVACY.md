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

## Optional YouTube player privacy boundary

Release-level YouTube previews store only a validated video ID. Seller edits require authenticated listing ownership; the release association is resolved server-side through the listing's physical copy. No YouTube API key, video search, arbitrary iframe markup, downloaded media, or automatic video selection is used. The embedded player is not requested until a visitor explicitly activates it; the privacy-enhanced `youtube-nocookie.com` domain does not imply that no data is sent to YouTube. The visitor has a normal YouTube link when embedding is unavailable.

## Application request rate limiting — Issue #89

The source implementation uses private PostgreSQL fixed-window counters shared across application instances. It is fail-closed: if the required client-IP identity or counter store is unavailable, the protected request is not forwarded to its controller. The first migration is `0019_shared_rate_limit_buckets.sql`; source code must not be deployed to an environment until that migration has been separately applied and verified there.

| Route group | Approved limit |
| --- | --- |
| Email/password signup | 5 requests per hour per client IP |
| Login | 5 failed attempts per 15 minutes per client-IP + normalized-email pair; 30 attempts per 15 minutes per client IP |
| Password recovery request | 5 per hour per client-IP + normalized-email pair; 10 per hour per client IP |
| Password reset submission | 5 per hour per client-IP + authenticated-user pair; 10 per hour per client IP |
| Google OAuth start | 10 per 15 minutes per client IP; callback is excluded |
| Contact form | 5 per hour per client IP, in addition to the existing per-email cooldown |
| Listing creation | 5 per day per authenticated account |
| Listing comments | 5 per 10 minutes and 30 per day per authenticated account |
| Listing photo-upload requests | 5 per hour and 10 per day per authenticated account |
| Discogs search/metadata lookup | 30 per 10 minutes per authenticated account |
| Discogs imports | 5 per hour per authenticated account |
| Messaging conversation starts | 5 per day per authenticated account |
| Messaging sends | 30 per 10 minutes and 100 per day per authenticated account |

Client IP extraction accepts one syntactically valid `CF-Connecting-IP` value in staging/production. It does not parse or trust `X-Forwarded-For`, and Express `trust proxy` remains unset. Render documents that inbound web-service requests pass through Cloudflare; Cloudflare documents that `CF-Connecting-IP` is a single client-IP value added on edge-to-origin traffic. See [Render's edge-protection and client-IP guidance](https://render.com/articles/how-render-handles-ddos-attacks) and [Cloudflare's HTTP header reference](https://developers.cloudflare.com/fundamentals/reference/http-headers/). A separate controlled runtime check is still required before staging or production use; no request IP is logged.

Bucket identifiers are HMAC-derived using a domain-separated key from the existing recovery-signing secret. The private counter table stores only the derived identifier, window start, count and expiry, not raw IP addresses, e-mail addresses, credentials, tokens or submitted content. RLS is enabled and Supabase Data API roles receive no table privileges. Expired rows are pruned opportunistically; the request path does not depend on cleanup succeeding.

A database outage returns a neutral `503`; exceeding a configured bucket returns `429` with `Retry-After`. Login retains generic application responses; password recovery remains non-enumerating. The initial five-person pilot remains the only approved cohort while the separate native leaked-password warning and other release gates remain as recorded in #62/#118. `MESSAGING_ENABLED=false` remains in force; message limits in the table are implemented as a pre-enable safeguard, not approval to activate messaging.

The project operator handles reports through the existing contact channel. For the controlled pilot, keep only a minimal private incident note: date, category, related account or listing identifier where needed, status and action taken. Do not record raw IP addresses, passwords, session/recovery tokens, recovery URLs, or message bodies. This manual process is not an in-app reporting or moderation feature.

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
