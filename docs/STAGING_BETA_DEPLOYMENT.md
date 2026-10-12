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
3. **Supabase Storage (`listing-photos` bucket) — CONFIGURATION VERIFIED; END-TO-END CHECKS IN PROGRESS:**
   - Live verification on 2026-10-12 confirms the staging bucket exists, is public, has a 5 MiB file-size limit, and allows only `image/webp`, `image/jpeg`, and `image/png`.
   - Live verification confirms the four expected policies exist on `storage.objects`: scoped SELECT for published/owner listings; authenticated seller INSERT, UPDATE, and DELETE.
   - Migrations `0006` and `0007` are applied; live migration history has eight entries, and `public.orphaned_storage_objects` exists with RLS enabled and no privileges for `anon` or `authenticated`.
   - The operator confirmed on 2026-10-12 that a listing photo's direct public Storage URL displayed the image in an incognito browser without signing in. The exact HTTP status and URL were not recorded.
   - Other end-to-end authorization, invalid-file, and data-integrity checks remain open in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).

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

### 3.5 Human Runbook: Staging Password Recovery & Reset Flow Setup & Verification (Issue #79)

*Notice: This runbook is a human-only operational guide. Automated CI and Jules MUST NOT alter live Supabase Auth settings, send live password-reset emails, or modify real staging accounts.*

#### Required Staging Environment Configuration (Pre-Deployment Operation)
Before deploying PR #81 / Issue #79 to staging, the human operator must set the mandatory `RECOVERY_SIGNING_SECRET` environment variable in the **staging Render web service settings**:
1. Generate a secure, high-entropy secret string (minimum 32 characters, e.g. using `openssl rand -hex 32` or a secure local random generator).
2. Log into the Render Dashboard -> Staging Web Service -> **Environment**.
3. Add environment variable `RECOVERY_SIGNING_SECRET` with the generated secret value (>= 32 chars).
4. *Security Warning:* Do NOT commit the secret value to repository code, pull request descriptions, or logs. Jules and automated CI must NOT alter live Render environment settings.

#### Required Supabase Staging Auth Setup (Dashboard Operations)
1. **Redirect URL Whitelist (Auth -> URL Configuration):**
   - Ensure the staging callback URL is explicitly listed in allowed redirect URLs:
     `https://the-vinyl-drop-staging.onrender.com/auth/callback`
   - For local development testing:
     `http://localhost:3000/auth/callback`
2. **Email Templates (Auth -> Email Templates -> Reset Password):**
   - Required custom Reset Password email link (the app supplies a trusted, allow-listed `RedirectTo` ending in `/auth/callback?next=/auth/reset-password`):
     `<p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>`
     This appends the single-use token hash and recovery type to the callback URL passed by `resetPasswordForEmail`, so local and staging redirect to their own configured `APP_BASE_URL`.
   - Do **not** use the default `{{ .ConfirmationURL }}` verification link for this server-rendered recovery route. Supabase's built-in `/auth/v1/verify?token=...` flow redirects back with a PKCE `code`; a `type=recovery` query parameter on that callback is browser-controlled and is not proof of recovery.
   - The application intentionally grants recovery state only after the server calls `verifyOtp({ token_hash, type: 'recovery' })` successfully. Do not re-enable recovery-marker issuance from a PKCE code callback based on `type`, `next`, or any other query parameter.
   - Ensure SMTP/email delivery settings in Supabase Staging Auth are configured for staging email delivery. Do NOT modify production configuration.

#### Password Recovery Session Policy
- **Post-Reset Session Behavior:** Upon successfully submitting a new password (`POST /auth/reset-password`), the server clears active session cookies (`sb-access-token`, `sb-refresh-token`) and signs out of the temporary recovery session (`signOut`). The user is redirected to `/auth/login` with a success message asking them to sign in with their new password.
- **Security Invariant:** Password recovery tokens and session credentials are processed purely in memory and encrypted session cookies. They are never logged, stored in persistent application tables, or echoed in rendered view errors.

#### Operator Human Verification Steps (Staging Post-Deploy)
Perform these verification steps after PR merge and deployment to staging:
1. **Neutral Request Test:** Navigate to `https://the-vinyl-drop-staging.onrender.com/auth/forgot-password`. Submit both an existing account email and an unregistered test email (`unregistered@example.com`). Confirm that both submissions display the exact same neutral message: *"If an account with that email exists, we have sent instructions to reset your password. Please check your inbox."*
2. **Email & Redirect Verification:** Check the inbox for the registered staging account and click the recovery link. Confirm that it redirects to the verified staging URL (`https://the-vinyl-drop-staging.onrender.com/auth/callback?next=/auth/reset-password&token_hash=...&type=recovery`) and lands safely on the "Choose New Password" page (`/auth/reset-password`). The reset-password email template must use the custom `token_hash` link specified above; a default Supabase `/auth/v1/verify?token=...` PKCE link is not accepted as proof of recovery by this server-side flow.
3. **Breached Password Rejection:** On the reset form, submit a known breached password (e.g. `password123`). Confirm that the form rejects the submission with the message *"This password appears in known data breaches. Please choose a different password."* without updating the account password.
4. **Successful Password Reset & Session Re-Authentication:** Submit a unique, unbreached strong password. Confirm that the system clears the recovery session and redirects to `/auth/login` with the success banner *"Your password has been successfully updated. Please sign in with your new password."* Verify that signing in with the old password fails, and signing in with the new password succeeds.

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
- [ ] **8. Storage access & media upload:** Bucket settings, all four Storage policies, and migrations `0006`/`0007` are verified live. A direct public photo URL was opened successfully in an unauthenticated incognito browser on 2026-10-12. Remaining upload authorization, invalid-file, and data-integrity checks are tracked in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).
- [x] **9a. CSRF/Same-Origin check on `POST /auth/login`:** External Origin returned HTTP 403; missing Origin/Referer returned HTTP 403; the staging Origin reached form validation and returned HTTP 400 for deliberately invalid form data.
- [ ] **9b. CSRF/Same-Origin on listing/profile mutations:** The `POST /listings/new` and `POST /profile/edit` paths still need their own verification.
- [ ] **10. Supabase Auth leaked-password protection:** the native `auth_leaked_password_protection` control is unavailable on the current Free plan; the Security Advisor warning remains. Issue #62 tracks the application-level compensating control, its direct-Auth limitation, and the human risk decision.

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

- The staging Supabase Storage bucket, policies, and migrations are now configured and verified. The operator confirmed a public image URL loaded in an incognito browser without authentication on 2026-10-12. Remaining upload authorization, unsupported-file, and failed-upload data-integrity checks are tracked in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).
- The native Supabase Security Advisor warning `auth_leaked_password_protection` remains because the organization is on Free. See [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62) for the compensating control and residual-risk decision.
- Authenticated cross-user Data API access, OAuth callback behavior, listing/profile mutation CSRF tests, the full environment-variable audit, fixture verification, and browser certificate inspection remain unverified.
- **Do not mark staging/beta ready or close Issue #49 yet.** Once the remaining checks are completed, append their actual outcomes here rather than assuming success.

## 6. Handoff to Product Specialist

For invite-only beta onboarding (#48), hand off the staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`) upon completion of live deployment verification.

### 5.2 Live Verification Log — 2026-10-12 (Storage public-read check)

**Target:** Staging listing-photo public Storage URL  
**Performed by:** Operator  
**Test:** Opened the direct URL for an uploaded listing photo in an incognito browser with no signed-in session.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Direct public image URL in incognito | The image was visible without signing in. The exact URL and HTTP status code were not recorded. | Pass — operator-reported visual confirmation |

**Not verified by the public-read test:** direct anonymous upload denial, authenticated non-owner upload denial, unsupported MIME-type rejection, and absence of orphaned Storage objects/database rows after rejected uploads. See the separate application-route check in Section 5.3. Keep the remaining Storage/API and data-integrity checks open under [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61). This successful direct-read check confirms public readability for the tested object; it does not establish that draft object URLs are private.

### 5.3 Live Verification Log — 2026-10-12 (Unauthenticated listing-photo UI flow)

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Performed by:** Operator  
**Test:** While signed out, the operator attempted to enter the listing-photo upload flow. The app redirected to the sign-in page before the operator could upload. The operator also reported that, after signing in to an account in the incognito window, a photo upload succeeded.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Enter listing-photo upload flow while signed out | Redirected to sign-in; no photo was uploaded while signed out. Exact request URL and HTTP status were not captured. | Pass — operator-reported application-route authentication guard |
| Upload photo after signing in within incognito | Upload succeeded after sign-in. | Pass — operator-reported authenticated upload smoke test |

**Security scope:** The app-level redirect confirms the normal UI flow requires authentication before upload. It is not the same test as sending a direct anonymous HTTP POST to the Supabase Storage API without a user session. The staging Storage INSERT policy has separately been inspected and is targeted to `authenticated` with an `auth.role() = 'authenticated'` check, but a raw unauthenticated Storage API POST has not been independently executed in this run. Do not claim that raw API probe was performed.

**Remaining checks under Issue #61:** The normal application listing-access guard for a signed-in non-owner was also checked by the operator; see Section 5.4. A direct authenticated upload attempt targeting another seller's listing has not been separately demonstrated and remains open, along with unsupported MIME-type rejection and verification that rejected uploads leave no orphaned Storage objects/listing-photo rows. A raw anonymous Storage API write is also distinct from the UI sign-in redirect and remains untested. Keep Issue #61 and parent Issue #49 open until all required checks are evidenced.

### 5.4 Live Verification Log — 2026-10-12 (Signed-in non-owner listing access)

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Performed by:** Operator  
**Test:** The operator signed in as a different seller and attempted to access a listing owned by another seller. The listing was not accessible under the non-owner account, and the operator reported that the behavior worked as intended. The exact URL, HTTP status, and browser/network evidence were not captured.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Access another seller's listing while signed in as a different seller | The listing could not be accessed under the non-owner account; the operator reports the behavior worked as intended. Exact URL and HTTP status were not recorded. | Pass — operator-reported application listing-access/ownership guard |

**Security scope:** This confirms the application-level access guard for the listing flow the operator tested. It does not prove that a direct upload request using another seller's listing ID is rejected by the upload handler or Storage authorization. Keep a targeted non-owner upload/authorization probe open until that operation is directly attempted or verified by an appropriate integration test.

### 5.5 Upload validation and data-integrity checks — 2026-10-12

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Performed by:** Operator  
**Scope:** Unsupported image type, oversized image, and non-owner listing UI access.

#### Operator-reported results

| Check | Observed result | Assessment |
| --- | --- | --- |
| Signed-in alternate seller opens another seller's listing | The other seller's listing was inaccessible and upload controls were not visible. | Pass for the tested application UI ownership guard. A direct forged POST to the upload endpoint was not tested, so backend authorization of a crafted request remains a separate check. |
| Unsupported GIF | The listing edit page displayed: `Detected image format 'gif' is not an allowed image format (JPEG, PNG, WebP)`. | Pass for visible file-type validation and user-facing warning. The HTTP status/redirect chain and whether the rejected attempt created any persistent objects/rows remain unverified. |
| Oversized image (>5 MiB) | The operator observed the error page text: `400 - Bad Request`, `File upload size exceeds maximum limit of 5MB`, and a `Back to Home` link to the staging root. | **Pass for the visible client-error heading and message** after PR #71 deployment. The actual upload POST status/redirect chain has not been separately captured in Firefox Network; the rendered heading alone is not treated as wire-level status evidence. |

The upload-response implementation from Issue #69 is deployed. The operator reports that an oversized image produced the rendered error page `400 - Bad Request` with `File upload size exceeds maximum limit of 5MB` and a `Back to Home` link. This passes the expected visible error-page/message check. The actual HTTP status of the original upload POST and any redirect chain have not yet been captured in Firefox Network. The operator also supplied the exact unsupported-content warning `Detected image format 'gif' is not an allowed image format (JPEG, PNG, WebP)`, which passes the visible server/content-validation-message check for that attempt. The native file picker separately filters out `.gif` files because the input has `accept="image/jpeg,image/png,image/webp"`; this does not prevent testing actual GIF bytes by selecting an explicitly renamed copy, and it does not by itself prove server-side validation. Do not infer the original POST's HTTP status from the rendered heading.

#### How to capture the actual upload response in Firefox

1. Open the staging listing edit page while signed in as the listing's owner.
2. Press **F12** and open **Network**. Enable **Persist Logs** (wording can vary), then clear existing requests.
3. The operator has already reported the visible validation messages for GIF content and an image larger than 5 MiB. To capture the remaining raw status evidence, test each case separately while Network is open: for GIF content, if the picker hides `.gif`, use a *copy* of a small GIF renamed to `test-gif-as-png.png` (never overwrite the original); for the size limit, use a valid JPEG/PNG larger than 5 MiB.
4. After each upload, inspect the upload **POST** request and record its HTTP status. If the POST is 301/302/303, also record the following GET request's status and the `Location` response header. This distinguishes the original upload response from a subsequent page that happens to show “404”.
5. Record the visible error text and the request/status results; do not share cookies, authorization headers, or tokens.

#### Read-only data-integrity check

Run these queries in the **Supabase SQL Editor for the confirmed staging project** only. Replace `<LISTING_UUID>` with the UUID from the seller's own staging edit URL (the part in `/listings/<LISTING_UUID>/edit`). These are SELECT-only queries; do not run DELETE/UPDATE statements.

Capture the results **before** the first rejected upload, then repeat all three queries after each rejected upload:

```sql
-- Database photo rows attached to this listing
SELECT id, listing_id, storage_path, created_at
FROM public.listing_photos
WHERE listing_id = '<LISTING_UUID>'::uuid
ORDER BY created_at, id;

-- Actual Storage objects belonging to this listing
SELECT name, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'listing-photos'
  AND name LIKE 'listings/<LISTING_UUID>/%'
ORDER BY created_at, name;

-- Durable records for objects that could not be cleaned up after a failed DB write
SELECT id, listing_id, photo_id, storage_path, reason, created_at
FROM public.orphaned_storage_objects
WHERE listing_id = '<LISTING_UUID>'::uuid
ORDER BY created_at, id;
```

**Expected result for rejected GIF / oversized uploads:** no new `listing_photos` row, no new `storage.objects` object under that listing's folder, and no new `orphaned_storage_objects` record. Existing photos/objects may already be present, so compare row IDs and storage paths against the baseline rather than expecting zero total rows.

- If all three result sets are unchanged, record data-integrity as a pass for that specific rejected upload and attach the before/after counts or screenshots.
- If a new Storage object appears without a corresponding photo row, or a new photo row refers to a missing Storage object, record a failure and keep the issue open. Do not manually delete anything; preserve the paths/IDs for investigation.
- A record in `orphaned_storage_objects` means the compensation path registered a cleanup problem and must be investigated, not silently marked passed.

**Still open under Issue #61:** confirm the exact HTTP response for GIF and >5 MiB uploads; run the before/after read-only comparison for each rejected upload; perform a direct authenticated non-owner upload authorization check if the endpoint-level protection still needs explicit runtime evidence; and retain the separate raw anonymous Storage API write check only if required beyond the verified normal UI sign-in guard and inspected policy.

#### Connected read-only staging snapshot — 2026-10-12

The operator's Supabase SQL Editor returned a browser-level `NetworkError when attempting to fetch resource (api.supabase.com)`. The accompanying note about a 100-row limit is not a query result and does not establish a SQL syntax error. To avoid treating that failed dashboard request as evidence, a separate connected, read-only SQL check was run against the confirmed staging project. No data was changed.

| Check | Observed current snapshot | Assessment |
| --- | ---: | --- |
| Rows in `public.listing_photos` | 4 | Current count recorded |
| Objects in `storage.objects` for bucket `listing-photos` | 4 | Current count recorded |
| Photo rows with a matching Storage object path | 4 of 4 | Pass — no missing object for a current photo row |
| Photo rows whose Storage object is missing | 0 | Pass — none observed |
| Storage objects without a matching `listing_photos` row | 0 | Pass — no unreferenced bucket objects observed |
| Rows in `public.orphaned_storage_objects` | 0 | Pass — no cleanup failures registered |

The latest `listing_photos` row still has `created_at` and `updated_at` of `2026-10-12 09:31:52.639760 UTC`; the latest Storage object still has timestamps of `2026-10-12 09:31:52.582630 UTC`. These timestamps predate the operator-reported rejected-upload tests. A read-only staging snapshot taken after the reported rejection attempts matched the recorded baseline: 4 photo rows, 4 Storage objects, all 4 photo rows matched to their object paths, 0 rows missing objects, 0 objects without photo rows, and 0 orphan-tracking records. All recorded photo/object IDs, paths, and timestamps still match the earlier baseline. **Assessment: aggregate pass — no persistent database/Storage additions or mismatches were detected after the reported rejected-upload attempts.**

**Scope limitation:** no separate immediate snapshot was taken between the individual GIF and oversized attempts, so this supports an aggregate post-test consistency pass but does not independently isolate the effect of each request. The visible GIF and oversized error messages are recorded above; the original upload POST status/redirect chain for each attempt remains unverified.
---

### 5.6 Auth security — leaked-password protection (2026-10-12)

**Target:** Supabase staging project `xuhzhdjmgvqzjxijmksu` (The Vinyl Drop)  
**Verification source:** Connected Supabase project and organization metadata, read-only; Security Advisor; current official Supabase and Have I Been Pwned documentation.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Staging project identity | Project reference is `xuhzhdjmgvqzjxijmksu`; project is active/healthy. | Confirmed — staging only |
| Supabase organization plan | Organization `The Vinyl Drop` is on the **Free** plan. | Confirmed plan limitation |
| Security Advisor: `auth_leaked_password_protection` | **WARN — Leaked Password Protection Disabled** remains present. | Native Supabase control is unavailable on Free |
| Auth configuration change | No Auth settings or billing settings were changed as part of this mitigation. | No configuration mutation |

Supabase's [password-security documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) states that its native leaked-password control is available on Pro and above. The current Free plan therefore leaves a real Security Advisor warning. Do not describe that native warning as cleared or enabled.

#### Application-level free compensating control

The application checks new passwords on its server-rendered signup path:

`POST /auth/signup` → `src/app/controllers/authController.ts` → `src/app/services/authService.ts::signUp` → `supabase.auth.signUp()`.

The server calculates a SHA-1 lookup hash in memory and sends only its first five hexadecimal characters to the free [Have I Been Pwned Pwned Passwords range API](https://haveibeenpwned.com/API/V3#PwnedPasswords). It compares the returned suffixes locally, sends a truthful User-Agent, requests Add-Padding, and ignores zero-count padding entries. A bounded timeout and defensive response parsing fail closed. A known breached password is rejected before the Supabase signup call; if the lookup is unavailable or malformed, the user sees a generic retryable error and the password is not sent to Supabase. Routine sign-in does not invoke this check.

The application code does not send the raw password or full SHA-1 hash to HIBP and does not log or persist password/hash material. Automated tests cover the breached and absent-suffix cases, zero-count padding, non-success and malformed responses, network failure, timeout, and the signup route's fail-closed behavior.

#### Security boundary and remaining limitation

This is an application-level compensating control, not the native Supabase feature. A direct request to the project's Supabase Auth signup API could bypass the Express signup guard. This is an **architecture-based bypass risk**; no live direct-Auth request was performed. Supabase's [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) accepts user data and metadata but does not receive the submitted password, so it cannot perform this HIBP password comparison centrally. Therefore, the app-level check protects the normal The Vinyl Drop signup route; it must not be represented as project-wide enforcement for every possible Auth/API path.

The native `auth_leaked_password_protection` warning remains present on Free and is not cleared by this code. Under [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62), the owner must explicitly decide whether the app-route control and this direct-Auth limitation are acceptable for the invite-only beta. If not, scope a separately reviewed trusted server-managed signup design; do not silently broaden this implementation or change live Auth settings.

#### Human-operated staging verification after merge and deployment

Do these checks only after the implementation has been human-reviewed, merged, and deployed to the confirmed staging target. Automated CI must not create real Auth accounts or mutate live Auth settings.

1. **Confirm the target first.** Verify that the deployment is the staging app and its configured Supabase project reference is `xuhzhdjmgvqzjxijmksu`. Do not run these tests against production.
2. **Known breached password.** Use a known breached test value (for example, `password`) on the normal signup form with a disposable test email and username. Expected: the form shows the safe rejection message. In the browser Network panel, confirm the signup request returns the validation response; do not copy cookies, authorization headers, or any password into the evidence. Confirm that no new Auth user was created by the rejected attempt.
3. **Password not present in the returned range.** Use a newly generated high-entropy test password and a deliberately disposable staging identity. Expected: the normal signup flow proceeds according to the staging email-confirmation configuration. Record that this was a deliberate human-operated smoke test. Do not reuse a real account password.
4. **Failure handling.** Automated tests cover network errors, timeouts, non-success status, malformed data, and fail-closed behavior. Do not take HIBP offline or disrupt shared staging to simulate an outage; rely on isolated CI tests unless a separately approved staging fault-injection method exists.
5. **Security Advisor.** Re-run the read-only Security Advisor check. Record the native `auth_leaked_password_protection` warning accurately as still present if the project remains on Free.
6. **Record evidence.** In Issue #62, record the staging deployment/commit, timestamp, observed success/error messages, whether the rejected attempt created an Auth user, the clean-password outcome, and the Security Advisor result. Never include passwords, tokens, session cookies, API keys, or other secrets.

#### Verification and release gate

- No Supabase plan upgrade is part of this mitigation.
- Do not modify production Auth settings.
- Human-controlled staging evidence and the owner's explicit residual-risk decision belong to [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62).
- Keep [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49) open and external beta invitations blocked until the full staging gate is evidenced and accepted.
