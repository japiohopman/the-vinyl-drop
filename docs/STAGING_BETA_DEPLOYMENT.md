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
3. **Supabase Storage (`listing-photos` bucket) — CONFIGURATION VERIFIED; UPLOAD TEST PENDING:**
   - Live verification on 2026-10-12 confirms the staging bucket exists, is public, has a 5 MiB file-size limit, and allows only `image/webp`, `image/jpeg`, and `image/png`.
   - Live verification confirms the four expected policies exist on `storage.objects`: scoped SELECT for published/owner listings; authenticated seller INSERT, UPDATE, and DELETE.
   - Drizzle migration history still needs to complete migrations `0006` and `0007`. The previous migration attempt exited with code 1, and `public.orphaned_storage_objects` was still absent at the last check.
   - The upload flow has not passed an end-to-end live test. Do not claim the issue is resolved until a real owner upload, image read, and unauthorized-write denial are tested.
   - Track remaining work in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).

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

### 3.2 Storage Object Access & Storage RLS Policy Specification

The persistent media layer utilizes Supabase Storage bucket `listing-photos` with strict least-privilege policies. Anonymous write access is disabled. Write calls (`upload`, `remove`) require an authenticated user JWT (`Authorization: Bearer <token>`) passed via Express session cookies or authorization headers.

#### Staging Bucket Configuration Specifications
- **Bucket Name:** `listing-photos`
- **Public Access:** Enabled (Public read access for object downloading)
- **Maximum File Size Limit:** `5242880` bytes (5 MB)
- **Allowed MIME Types:** `image/webp`, `image/jpeg`, `image/png`

#### Storage RLS Policies (`storage.objects`)

The four Storage RLS policies are version-controlled in `drizzle/0006_storage_objects_rls.sql`. Supabase may own the managed `storage.objects` table under a role different from the application's database role. Migration `0006` therefore applies the policy DDL only when the migration role owns that table; otherwise it verifies that the exact four expected policies are already provisioned and refuses to mark the migration applied if they are missing or differ. This allows the dashboard-provisioned staging policies to be reconciled safely without trying to alter a Supabase-managed table.

*Important Privacy Note on Public Storage Buckets:*
`listing-photos` is configured as a public bucket to enable performant public CDN asset delivery for published listings. The `SELECT` RLS policy below restricts key enumeration (listing bucket folder contents) to published listings or the authenticated seller. However, because public buckets do not require token-authenticated GET requests for direct object path downloads, any user with exact knowledge of a draft object path (`listings/{listing_id}/{photo_id}.webp`) can technically fetch the binary asset directly. If total privacy for draft photo assets is required in future releases, the architecture must transition to private storage buckets with signed, short-lived download URLs.

1. **Scoped Read Policy (`SELECT`):**
   - Restricts key enumeration/listing in bucket folder queries to objects attached to published listings or objects owned by the authenticated seller (`seller_id = auth.uid()`). Direct object GET requests on public buckets do not evaluate RLS policies; anyone with exact knowledge of a draft object key can download the binary.
   ```sql
   CREATE POLICY "Scoped Read Access for listing-photos"
   ON storage.objects FOR SELECT
   USING (
     bucket_id = 'listing-photos'
     AND (
       EXISTS (
         SELECT 1 FROM public.listings
         WHERE id::text = (storage.foldername(name))[2]
           AND (status = 'published' OR seller_id = auth.uid())
       )
     )
   );
   ```

2. **Authenticated Seller Insert Policy (`INSERT`):**
   - Objects are stored under key prefix `listings/{listing_id}/{photo_id}.webp`.
   - Access requires the authenticated user (`auth.uid()`) to be the verified seller of the target listing:
   ```sql
   CREATE POLICY "Authenticated Seller Insert for listing-photos"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'listing-photos'
     AND auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.listings
       WHERE id::text = (storage.foldername(name))[2]
         AND seller_id = auth.uid()
     )
   );
   ```

3. **Authenticated Seller Update Policy (`UPDATE`):**
   ```sql
   CREATE POLICY "Authenticated Seller Update for listing-photos"
   ON storage.objects FOR UPDATE
   USING (
     bucket_id = 'listing-photos'
     AND auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.listings
       WHERE id::text = (storage.foldername(name))[2]
         AND seller_id = auth.uid()
     )
   )
   WITH CHECK (
     bucket_id = 'listing-photos'
     AND auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.listings
       WHERE id::text = (storage.foldername(name))[2]
         AND seller_id = auth.uid()
     )
   );
   ```

4. **Authenticated Seller Delete Policy (`DELETE`):**
   ```sql
   CREATE POLICY "Authenticated Seller Delete for listing-photos"
   ON storage.objects FOR DELETE
   USING (
     bucket_id = 'listing-photos'
     AND auth.role() = 'authenticated'
     AND EXISTS (
       SELECT 1 FROM public.listings
       WHERE id::text = (storage.foldername(name))[2]
         AND seller_id = auth.uid()
     )
   );
   ```

### 3.3 Human Runbook: Staging Storage Bucket Provisioning & Access Policy Verification

*Notice: This runbook is a human-only operational guide. Do NOT execute live dashboard edits or service-role mutations from automated CI sessions.*

#### Step 1 — Verify Staging Project Identity
Confirm that the active project reference in the Supabase Dashboard matches `STAGING_DB_PROJECT_REF` and that `SUPABASE_URL` matches `https://[STAGING_REF].supabase.co`. Do NOT apply changes to production.

#### Step 2 — Provision Storage Bucket in Staging Supabase Dashboard
1. Log into the Supabase Staging Project Dashboard.
2. Navigate to **Storage** -> **New Bucket**.
3. Set **Bucket Name**: `listing-photos`.
4. Toggle **Public Bucket**: **Enabled**.
5. Set **Max file size**: `5 MB`.
6. Restrict **Allowed MIME types**: `image/webp`, `image/jpeg`, `image/png`.
7. Save bucket.

#### Step 3 — Reconcile Storage Policies and Apply Database Migrations
1. Confirm the four policies in Section 3.2 exist in the staging Supabase Dashboard under `storage.objects`, with SELECT targeted to `public` and INSERT/UPDATE/DELETE targeted to `authenticated`.
2. Execute the version-controlled Drizzle migrations against the confirmed staging database:

   ```bash
   DATABASE_URL="postgres://postgres:[PASSWORD]@[STAGING_HOST]:5432/postgres" npm run db:migrate
   ```

   Migration `0006` applies its policy DDL only when the current role owns `storage.objects`; otherwise it validates the four pre-provisioned policies and skips managed-table DDL only if they match. It fails with a clear error if they do not match. Migration `0007` then creates the private `orphaned_storage_objects` tracking table.

3. `npm run db:verify` runs the migration verifier against an isolated in-memory PGlite database; it is not a live staging database check. Verify the live state in the Supabase SQL Editor with read-only queries:

   ```sql
   SELECT policyname, roles, cmd
   FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
   ORDER BY cmd, policyname;

   SELECT to_regclass('public.orphaned_storage_objects') IS NOT NULL AS orphan_table_exists;

   SELECT count(*) AS migration_count, max(created_at) AS latest_migration_at
   FROM drizzle.__drizzle_migrations;
   ```

#### Step 4 — Verify Live Staging Upload & Public Read
1. Log in to the staging application using a confirmed Auth-provisioned staging account (e.g. created via Supabase Auth Admin API with `STAGING_SELLER_ID` or registered directly via `/auth/signup`). Note: seed profile rows alone do not automatically create password-ready Auth users in Supabase Auth directory.
2. Navigate to an existing draft listing edit page (`/listings/[id]/edit`) owned by the signed-in user.
3. Upload a sample image (`< 5MB`, JPEG/PNG/WebP).
4. Verify image displays correctly on the preview page (`/listings/[id]/preview`) and public detail page (`/listings/[id]`).
5. Inspect image element `src` URL: `https://[STAGING_REF].supabase.co/storage/v1/object/public/listing-photos/listings/[id]/[photoId].webp`.
6. Open image URL in an unauthenticated incognito tab to confirm public read access.
7. Attempt upload as non-owner or unauthenticated user (e.g. via cURL) to verify 401/403 rejection.

### 3.4 Human Runbook: Staging RLS Migration Application & Live Data API Verification

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

## 5. Minimum Pre-Launch Deployment Checklist

The checkboxes below reflect the actual live staging evidence recorded on 2026-10-11. A passed sub-check does not imply that the whole beta gate is complete. Keep the parent staging issue [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) open until all required checks and blockers are resolved.

- [x] **1. Staging database migration & RLS:** Migration `0005_enforce_least_privilege_rls.sql` was applied. Read-only database queries confirmed RLS is enabled on all 8 public tables and verified the expected policies/grants.
- [x] **2. Anonymous Data API boundaries:** Public listings returned HTTP 200; anonymous access to `favorites` returned HTTP 401; anonymous profile creation returned HTTP 401. These are expected deny/allow results.
- [ ] **2a. Authenticated cross-user tampering:** A signed-in cross-user access test was not performed in this verification session.
- [ ] **3. Staging seed data & test-account fixtures:** Confirm the intended fixtures/accounts and record the result. A public listing response alone is not proof that all seed fixtures are correct.
- [ ] **4. Environment variable audit:** Reconfirm the required staging-only Render variables and exact `STAGING_DB_HOST` / `STAGING_DB_PROJECT_REF` identity.
- [x] **5. Health and basic HTTP responses:** `GET /health`, `/`, and `/profiles/jaap` returned HTTP 200.
- [ ] **6. Browser HTTPS/certificate review:** HTTPS requests succeeded, but the requested browser lock/certificate check was not separately recorded.
- [x] **7a. Registration/login/logout:** Manually tested by the operator; the operator reported that these flows worked without errors.
- [ ] **7b. Auth/OAuth callback and redirect:** The callback/redirect flow was not independently verified in this session.
- [ ] **8. Storage access & media upload:** Bucket settings and all four Storage policies are now verified live (2026-10-12). Drizzle migrations `0006`/`0007` and end-to-end upload/authorization tests remain outstanding. See [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).
- [x] **9a. CSRF/Same-Origin check on `POST /auth/login`:** External Origin returned HTTP 403; missing Origin/Referer returned HTTP 403; the staging Origin reached form validation and returned HTTP 400 for deliberately invalid form data.
- [ ] **9b. CSRF/Same-Origin on listing/profile mutations:** The `POST /listings/new` and `POST /profile/edit` paths still need their own verification.
- [ ] **10. Supabase Auth leaked-password protection:** Security Advisor still reported `auth_leaked_password_protection` as disabled. Track the staging-only setting in [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62).

### 5.1 Live Verification Log — 2026-10-11

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Scope:** HTTP health/routes, staging database RLS/grants, anonymous Data API access, manually tested Auth flows, and CSRF behavior on the login route.

#### Confirmed results

| Check | Observed result | Assessment |
| --- | --- | --- |
| `GET /health` | HTTP 200; JSON status `ok` | Pass |
| `GET /` | HTTP 200 | Pass |
| `GET /profiles/jaap` | HTTP 200 | Pass |
| RLS on public tables | Enabled on all 8 checked tables | Pass |
| Public listings through Data API | HTTP 200 with listing rows | Expected public access |
| Anonymous Data API access to `favorites` | HTTP 401, permission denied | Expected denial |
| Anonymous profile creation through Data API | HTTP 401, permission denied | Expected denial |
| CSRF test, external Origin | HTTP 403 | Pass |
| CSRF test, missing Origin/Referer | HTTP 403 | Pass |
| CSRF test, staging Origin + deliberately invalid form | HTTP 400 from form validation | Pass; request passed the same-origin gate |
| Registration/login/logout UI flow | Operator reported no errors | Pass for manual UI smoke test |

#### Remaining blockers and scope limits

- The staging Supabase Storage bucket `listing-photos` was not present in `storage.buckets`. A real upload was not attempted; the missing bucket and unverified write authorization must be fixed before testing. See [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).
- Supabase Security Advisor still reported `auth_leaked_password_protection` as disabled. See [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62).
- Authenticated cross-user Data API access, OAuth callback behavior, listing/profile mutation CSRF tests, the full environment-variable audit, fixture verification, and browser certificate inspection remain unverified.
- **Do not mark staging/beta ready or close Issue #49 yet.** Once the remaining checks are completed, append their actual outcomes here rather than assuming success.

## 6. Handoff to Product Specialist

For invite-only beta onboarding (#48), hand off the staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`) upon completion of live deployment verification.
