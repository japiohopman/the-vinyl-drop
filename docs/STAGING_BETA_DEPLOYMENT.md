# Staging & Beta Infrastructure Strategy

This document specifies the environment taxonomy, hosting provider evaluation, isolated Supabase configuration, security prerequisites (Row Level Security & least-privilege privileges), seeding instructions, human verification runbooks, and minimum pre-launch deployment checklist for **The Vinyl Drop**.

*Verification Date: October 2026*

---

## 1. Environment Taxonomy & Data Separation

To ensure production integrity and prevent accidental data contamination, environments are strictly isolated:

| Environment | Target URL | Database Source | Supabase Project | Purpose |
| --- | --- | --- | --- | --- |
| **LOCAL** | `http://localhost:3000` | In-memory PGlite or Local Supabase CLI (`127.0.0.1:54322`) | Local Dev Instance | Daily feature development & unit testing |
| **STAGING / BETA** | `https://the-vinyl-drop-staging.onrender.com` | Dedicated Staging PostgreSQL | Isolated Staging Project | Invite-only Beta testing (#48), integration, QA |
| **PRODUCTION** | `https://vinyldrop.com` | Production PostgreSQL | Isolated Production Project | Public live marketplace |

### Security Invariants
- **No Shared Persistence:** Staging and Production MUST use separate, completely isolated Supabase projects (database, auth, and object storage).
- **No Production Secrets:** Production credentials, API keys, and service tokens MUST NEVER be present in local environments or staging deployment configs.
- **Environment Variable Boundary:** All environment parameters are validated strictly at startup via `src/config/env.ts`. `APP_BASE_URL` and `ALLOWED_REDIRECT_URLS` are strictly required in staging and production modes and must not fall back to localhost.
- **Project Identity Verification:** Staging database seeding strictly verifies project identity via `STAGING_DB_HOST` and `STAGING_DB_PROJECT_REF`. For direct connection hosts (`db.[project-ref].supabase.co`), `STAGING_DB_HOST` must match the exact database hostname and `STAGING_DB_PROJECT_REF` must match the project reference. For Supabase Session Pooler connections (`*.pooler.supabase.com`), `STAGING_DB_HOST` must match the exact pooler hostname (e.g. `aws-0-eu-central-1.pooler.supabase.com`) and `STAGING_DB_PROJECT_REF` must match the connection username project reference (`postgres.[project-ref]`).

---

## 2. Infrastructure & Hosting Provider Evaluation (Sourced 2026 Facts)

The application is built on a server-rendered Node.js / Express / EJS runtime (`dist/server.js`). The hosting platform must support standard Express process execution without forcing architectural rewrites or serverless function adaptations.

### Sourced Provider Comparison Matrix

| Provider | Express / EJS Runtime Compatibility | Free Tier Allocation & Pricing Model (Current 2026) | Execution Time & Timeout Limits | Storage & Health Check | Documentation Source |
| --- | --- | --- | --- | --- | --- |
| **Render** *(Recommended)* | **Native Node Web Service:** Direct execution (`node dist/server.js`). Zero code changes or serverless wrappers required. | **Free Web Service:** 512MB RAM, 0.1 CPU, 750 free instance hours/month. Inactivity sleep after 15m; ~50s cold start delay. | Standard HTTP request timeout (no strict 10s function limit). | Ephemeral disk; Native HTTP `/health` check polling; Free automatic TLS/SSL. | [Render Free Docs](https://render.com/docs/free) & [Blueprint Spec](https://render.com/docs/blueprint-spec) |
| **Netlify** | **Serverless Adapter Required:** Requires `@netlify/functions` or `serverless-http` wrapper and custom EJS view path bundling. | **Free Tier:** 300 credits/month allowance; Personal plan is $9/month/member for 1,000 credits (legacy 100GB/125k plan explicitly labeled legacy). | **60-second synchronous limit:** Configurable max duration up to 60s for synchronous functions. | Ephemeral read-only Lambda disk; Static CDN SSL; No native Express process health check. | [Netlify Pricing](https://www.netlify.com/pricing/) & [Functions Billing](https://docs.netlify.com/build/functions/usage-and-billing/) |
| **Vercel** | **Serverless Function Adapter:** Requires `api/index.ts` handler and custom `includeFiles` configuration in `vercel.json` for EJS templates. | **Hobby Tier:** Personal, non-commercial use terms only; 1,000,000 function invocations/month (legacy no-Fluid-Compute table 100k invocations explicitly labeled legacy). | **60s / 300s Limit:** Up to 60s without Fluid Compute, or up to 300s with Fluid Compute enabled. | Ephemeral read-only Lambda disk; Automatic SSL; No native Express process health check. | [Vercel Plans & Hobby Terms](https://vercel.com/docs/plans/hobby) & [Legacy Pricing](https://vercel.com/docs/functions/usage-and-pricing/legacy-pricing) |
| **Railway** | **Native Container / Node:** Direct process execution from repository or Dockerfile. | **Free Trial / Credit Plan:** $1/month credit allowance or $5 trial credits; usage-based micro-billing thereafter. | Standard HTTP request timeout. | Ephemeral container disk (optional volumes); Native HTTP `/health` polling. | [Railway Pricing Plans](https://docs.railway.com/pricing/plans) & [Free Trial](https://docs.railway.com/pricing/free-trial) |
| **Fly.io** | **Native Container / MicroVM:** Direct process execution via `fly.toml` / Dockerfile. | **Pay-as-you-go:** Micro VMs with initial trial credit allowances. | Standard HTTP request timeout. | Persistent volume support; Native health checks. | [Fly.io Pricing](https://fly.io/docs/about/pricing/) |

### Host Recommendation Decision
**Render (`render.yaml`) is selected as the primary Beta host.**
- **Rationale:** Render executes our compiled Express application directly via `npm run start` without requiring serverless wrappers (`serverless-http`), custom EJS view bundlers, or route refactoring.
- **Durable Storage Alignment:** Although Render free web services utilize an ephemeral filesystem, our application stores all persistent media in Supabase Storage (`listing-photos` bucket), ensuring zero dependency on local disk.

---

## 3. Supabase Staging Isolation, OAuth Redirects & Row Level Security

Staging infrastructure utilizes a dedicated, standalone Supabase project:

1. **PostgreSQL Database:**
   - Isolated database instance running Drizzle SQL migrations (`npm run db:migrate`).
   - Database connection pooler (Session pooler) configured for Express ORM queries (`DATABASE_URL`).
2. **Supabase Auth & OAuth Redirect Whitelist:**
   - Isolated Auth user directory (`auth.users`).
   - `ALLOWED_REDIRECT_URLS` is validated server-side in `src/validators/auth.ts` (`isAllowedRedirectUrl`) to verify post-login/callback targets. In `render.yaml`, `ALLOWED_REDIRECT_URLS` is set to `https://the-vinyl-drop-staging.onrender.com`.
   - Redirect URL whitelist configured in Supabase Dashboard (Auth -> URL Configuration):
     - `https://the-vinyl-drop-staging.onrender.com/auth/callback`
     - `http://localhost:3000/auth/callback` (for local dev testing)
3. **Supabase Storage (`listing-photos` bucket):**
   - Dedicated `listing-photos` bucket created in staging Supabase project.
   - Public read permissions enabled for serving album artwork WebP photos.
   - Server-side streaming via `@fastify/busboy` and `sharp` processes uploaded images directly to Supabase Storage, keeping media completely off the local filesystem.

### 3.1 Least-Privilege Data API Access Matrix

The application's backend server uses Express/EJS and Drizzle ORM connecting via direct PostgreSQL / Session Pooler connection (`DATABASE_URL`), operating as table superuser/owner (bypassing RLS). Because Supabase exposes PostgreSQL public schema tables through the PostgREST Data API (accessible via `SUPABASE_ANON_KEY` or client JWTs), **Row Level Security (RLS) and explicit role privileges are enforced** on all eight public tables via `drizzle/0005_enforce_least_privilege_rls.sql`:

| Table Name | SELECT Access Policy | INSERT Access Policy | UPDATE Access Policy | DELETE Access Policy | Granted Roles |
| --- | --- | --- | --- | --- | --- |
| **`profiles`** | **Public:** `true` (Anyone can view profiles) | **Owner:** `auth.uid() = id` | **Owner:** `auth.uid() = id` | **Owner:** `auth.uid() = id` | `anon` (SELECT), `authenticated` (SELECT, INSERT, UPDATE, DELETE) |
| **`releases`** | **Public:** `true` (Catalogue is public) | **Denied for Data API:** Server-managed only | **Denied for Data API:** Server-managed only | **Denied:** Default deny | `anon` (SELECT), `authenticated` (SELECT) |
| **`physical_copies`** | **Public / Owner:** `owner_id = auth.uid() OR EXISTS (SELECT 1 FROM listings WHERE physical_copy_id = physical_copies.id AND status = 'published')` | **Owner:** `auth.uid() = owner_id` | **Owner:** `auth.uid() = owner_id` | **Owner:** `auth.uid() = owner_id` | `anon` (SELECT), `authenticated` (SELECT, INSERT, UPDATE, DELETE) |
| **`listings`** | **Public / Seller:** `status = 'published' OR seller_id = auth.uid()` | **Seller & Copy Owner:** `auth.uid() = seller_id AND EXISTS (SELECT 1 FROM physical_copies WHERE id = listings.physical_copy_id AND owner_id = auth.uid())` | **Seller & Copy Owner:** `auth.uid() = seller_id AND EXISTS (SELECT 1 FROM physical_copies WHERE id = listings.physical_copy_id AND owner_id = auth.uid())` | **Seller:** `auth.uid() = seller_id` | `anon` (SELECT), `authenticated` (SELECT, INSERT, UPDATE, DELETE) |
| **`listing_photos`** | **Public / Seller:** Attached listing is published or owned by `auth.uid()` | **Seller:** `auth.uid()` matches attached listing's `seller_id` | **Seller:** `auth.uid()` matches attached listing's `seller_id` | **Seller:** `auth.uid()` matches attached listing's `seller_id` | `anon` (SELECT), `authenticated` (SELECT, INSERT, UPDATE, DELETE) |
| **`comments`** | **Public / Seller:** Attached listing is published or owned by `auth.uid()` | **Author:** `auth.uid() = author_id` on readable/published listing | **Author:** `auth.uid() = author_id` on readable/published listing | **Author:** `auth.uid() = author_id` | `anon` (SELECT), `authenticated` (SELECT, INSERT, UPDATE, DELETE) |
| **`activity_events`** | **Public / Actor:** `event_type IN ('listing.published', 'comment.created') OR (event_type = 'favorite.created' AND actor_id = auth.uid())` | **Denied for Data API:** Server-managed only | **Denied:** Default deny | **Denied for Data API:** Server-managed only | `anon` (SELECT), `authenticated` (SELECT) |
| **`favorites`** | **Owner Only:** `user_id = auth.uid()` (Strictly private) | **Owner:** `auth.uid() = user_id` on published listing | **Denied:** Default deny | **Owner:** `auth.uid() = user_id` | `authenticated` (SELECT, INSERT, DELETE); `anon` has NO grants |

### 3.2 Storage Object Access Assumptions
- **Storage Bucket:** Persistent media objects are stored in the Supabase Storage `listing-photos` bucket.
- **Public Cover Art Reads:** Public HTTP GET reads for album artwork are enabled on the `listing-photos` bucket via Supabase Storage public access policies.
- **Write Operations:** File uploads (`POST /listings/new`) are handled server-side via `@fastify/busboy` and `sharp` image processing using server credentials, ensuring direct storage writes are authenticated and sanitized.

### 3.3 Human Runbook: Staging RLS Migration Application & Live Data API Verification

*Notice: This runbook is a human-only operational guide. Do NOT execute live database migrations, dashboard policy edits, or database resets from automated CI sessions.*

#### Step 1 — Review and Apply SQL Migration to Reserved Staging Project
1. Obtain the staging database connection string (`DATABASE_URL`) from staging environment configuration.
2. Execute the version-controlled Drizzle migration against the staging PostgreSQL database:
   ```bash
   DATABASE_URL="postgres://postgres:[PASSWORD]@[STAGING_HOST]:5432/postgres" npm run db:migrate
   ```
3. Run database verification script to confirm all 8 tables have RLS enabled:
   ```bash
   DATABASE_URL="postgres://postgres:[PASSWORD]@[STAGING_HOST]:5432/postgres" npm run db:verify
   ```

#### Step 2 — Verify PostgREST / Supabase Data API Security Boundaries via CURL
Run the following curl verification commands against the staging Supabase Data API endpoint (`https://[STAGING_REF].supabase.co/rest/v1/`):

1. **Anonymous Read Check (Public Tables Allowed, Favorites Denied):**
   ```bash
   # Should return 200 OK with public listings
   curl -i -X GET "https://[STAGING_REF].supabase.co/rest/v1/listings?select=id,status" \
     -H "apikey: [SUPABASE_ANON_KEY]"

   # Should return 401 Unauthorized or 403 Forbidden (anon table grant revoked on favorites)
   curl -i -X GET "https://[STAGING_REF].supabase.co/rest/v1/favorites" \
     -H "apikey: [SUPABASE_ANON_KEY]"
   ```

2. **Anonymous Write Check (MUST BE DENIED):**
   ```bash
   # Should return 401 Unauthorized or 403 Forbidden
   curl -i -X POST "https://[STAGING_REF].supabase.co/rest/v1/profiles" \
     -H "apikey: [SUPABASE_ANON_KEY]" \
     -H "Content-Type: application/json" \
     -d '{"id":"00000000-0000-0000-0000-000000000000","username":"attacker"}'
   ```

3. **Authenticated Cross-User Tampering Check (MUST BE DENIED BY RLS):**
   ```bash
   # Attempting to modify User A's profile as User B (using User B JWT)
   curl -i -X PATCH "https://[STAGING_REF].supabase.co/rest/v1/profiles?id=eq.[USER_A_UUID]" \
     -H "apikey: [SUPABASE_ANON_KEY]" \
     -H "Authorization: Bearer [USER_B_JWT]" \
     -H "Content-Type: application/json" \
     -d '{"display_name":"Hacked Name"}'
   # Should affect 0 rows (204 No Content with 0 affected rows or 403 Forbidden)
   ```

#### Step 3 — Safety Recovery Procedure
If an issue occurs during migration application on staging:
1. Re-run `npm run db:migrate` or connect via `psql` to check `pg_stat_activity` if connection pooling locks occur.
2. If policies need adjustment, prepare a new version-controlled Drizzle migration SQL file in `drizzle/` (e.g. `0006_*.sql`). Do NOT perform ad-hoc edits in the Supabase Dashboard.

---

## 4. Staging Seed Data, Test Accounts & Storage Fixtures

A reproducible, idempotent seed command populates the isolated staging environment with realistic beta test data and accounts.

### Execution Command
```bash
# Seed isolated staging database
npm run db:seed:staging
```

### Pre-Seeded Beta Profile Fixtures & Provisioning Procedure
The seed script inserts database profile fixtures with deterministic UUIDs:

| Role | Email | Username | Display Name | Fixed Profile UUID | Location |
| --- | --- | --- | --- | --- | --- |
| **Seller** | `seller.beta@vinyldrop.local` | `@amsterdam_grooves` | Amsterdam Grooves | `11111111-1111-4111-8111-111111111111` | De Pijp, Amsterdam |
| **Buyer** | `buyer.beta@vinyldrop.local` | `@spin_doctor` | Spin Doctor | `22222222-2222-4222-8222-222222222222` | Amsterdam Noord |
| **Collector** | `collector.beta@vinyldrop.local` | `@wax_collector` | Wax Collector | `33333333-3333-4333-8333-333333333333` | Oost, Amsterdam |

*Note on Supabase Auth Provisioning (Auth-First Provisioning Runbook):*
Database profile rows alone do not populate Supabase Auth password credentials. To enable login-ready test accounts in the staging Supabase Auth directory:
1. **Option A — Pre-Provision Auth Users & Supply Account IDs (Recommended):** Create Supabase Auth accounts prior to seeding via Supabase Admin Dashboard or Admin API (`supabase.auth.admin.createUser({ email, password, email_confirm: true })`), obtain the generated Auth UUIDs, and pass them to the seed script via `accountIds` or environment variables (`STAGING_SELLER_ID`, `STAGING_BUYER_ID`, `STAGING_COLLECTOR_ID`). This ensures profiles and all foreign-key child rows (`physical_copies`, `listings`, `comments`, `activity_events`) are seeded with the correct Auth UUIDs.
2. **Option B — Profile Fixtures for Catalog Display:** Running `npm run db:seed:staging` without custom account IDs populates profile fixtures (`11111111-1111-4111-8111-111111111111`, etc.) for marketplace catalog display.
3. **Option C — Application Registration:** Alternatively, sign up new test accounts through the application UI (`POST /auth/signup`), establishing authenticated credentials directly through Supabase Auth.
*Security Requirement:* The Supabase service-role key MUST NEVER be committed to repository code or exposed in client builds.

### Pre-Seeded Dataset & Storage Fixtures
- **5 Canonical Catalog Releases:** Miles Davis (*Kind of Blue*), Fleetwood Mac (*Rumours*), Daft Punk (*Random Access Memories*), Amy Winehouse (*Back to Black*), John Coltrane (*A Love Supreme*).
- **Marketplace Listings:** 4 published listings featuring Goldmine media/sleeve grades (`NM/VG+`, `M/NM`, `VG+/VG`), minor unit integer prices (e.g. €38.50 = `3850`), trade-only listing (`price = null`), and sample buyer/seller comment threads.
- **Photo Asset Handling:** Seed records omit un-uploaded photo rows so the application does not attempt to render non-existent storage objects. Listing photo assets are uploaded dynamically via the application upload workflow (`POST /listings/new`).

---

## 5. Minimum Pre-Launch Deployment Checklist (Live Verification Pending)

*Notice: The following checklist represents the manual pre-launch verification gates to be performed against deployed live staging resources before inviting external beta testers (#48).*

- [ ] **1. Isolated Database Migration & RLS Enforcement:** Run `npm run db:migrate` against staging `DATABASE_URL` to apply all migrations including `0005_enforce_least_privilege_rls.sql`. Run `npm run db:verify` to confirm RLS is enabled on all 8 public tables.
- [ ] **2. Data API Least-Privilege Verification:** Perform CURL checks against Supabase Data API (`/rest/v1/`) as `anon` and `authenticated` user to confirm direct anonymous writes are rejected and private favorites are inaccessible across users.
- [ ] **3. Staging Seed Data:** Execute `npm run db:seed:staging` to populate test accounts, catalog releases, listings, and comment threads.
- [ ] **4. Environment Variable Audit:** Verify that `NODE_ENV=staging`, `APP_BASE_URL`, `ALLOWED_REDIRECT_URLS`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STAGING_DB_HOST`, and `STAGING_DB_PROJECT_REF` are populated in the Render Dashboard.
- [ ] **5. Health Check Endpoint:** Confirm that `GET https://the-vinyl-drop-staging.onrender.com/health` returns `200 OK` with status `ok` and valid JSON timestamp.
- [ ] **6. HTTPS & Certificate Verification:** Confirm browser renders valid TLS certificate with HTTPS connection lock.
- [ ] **7. Authentication & Callback Flow:** Test login, registration, and logout using test accounts. Verify callback redirect returns safely to `APP_BASE_URL`.
- [ ] **8. Storage Access & Media Upload:** Verify album cover images load properly from Supabase Storage and test uploading a new listing photo via `/listings/new`.
- [ ] **9. CSRF & Same-Origin Boundary:** Verify state-changing form posts (`POST /listings/new`, `POST /profile/edit`) pass same-origin verification without 403 errors.

---

## 6. Handoff to Product Specialist

For invite-only beta onboarding (#48), hand off the staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`) upon completion of live deployment verification.
