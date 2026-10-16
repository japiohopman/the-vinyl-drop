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

### 3.1 Signup Confirmation Email → Application Callback (Issues #109 and #82)

When `POST /auth/signup` calls Supabase Auth, the server passes an explicit `options.emailRedirectTo` built from `APP_BASE_URL` and the same-origin `/auth/callback` route. The requested post-confirmation destination is normalized through `sanitizeRedirectUrl`, defaults to `/profile`, and is encoded into the callback's `next` query parameter. The callback itself must remain on the configured application origin; form input must never choose the callback host.

For the custom Supabase **Confirm Sign Up** template, the link contract is:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Confirm email address</a>
```

Apply/test this template in staging only after the code that sets `emailRedirectTo` has been deployed. In Supabase Auth → URL Configuration, confirm the correct environment's `/auth/callback` destination is allowed. Then check the relevant test account in Auth before submitting any new signup; open the received email, verify it reaches `/auth/callback` with `token_hash`, `type=email`, and the encoded `next`, and confirm the callback creates a signed-in session and redirects to the safe destination. Do not put real token values in logs, screenshots, or Issues. This manual staging test is intentionally not run from CI, which uses mocked Auth clients.

3. **Supabase Storage (`listing-photos` bucket) — CONFIGURATION VERIFIED; END-TO-END CHECKS IN PROGRESS:**
   - Live verification on 2026-10-12 confirms the staging bucket exists, is public, has a 5 MiB file-size limit, and allows only `image/webp`, `image/jpeg`, and `image/png`.
   - Live verification confirms the four expected policies exist on `storage.objects`: scoped SELECT for published/owner listings; authenticated seller INSERT, UPDATE, and DELETE.
   - Migrations `0006` and `0007` are applied; live migration history has eight entries, and `public.orphaned_storage_objects` exists with RLS enabled and no privileges for `anon` or `authenticated`.
   - The operator confirmed on 2026-10-12 that a listing photo's direct public Storage URL displayed the image in an incognito browser without signing in. The exact HTTP status and URL were not recorded.
   - Other end-to-end authorization, invalid-file, and data-integrity checks remain open in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61).

### 3.1 Least-Privilege Data API Access Matrix

The application is a server-rendered Express/EJS site. Application data writes go through server-side services and Drizzle using `DATABASE_URL`; browser code does not need direct Supabase Data API write access. Supabase Auth and Storage remain separate services and are not affected by this table-grant restriction.

Migration `0005_enforce_least_privilege_rls.sql` establishes row-level policies. The pending append-only migration `0010_supabase_data_api_read_only.sql` adds a stronger table-privilege boundary: even an authenticated JWT cannot use the Supabase Data API to INSERT, UPDATE, or DELETE application rows. The existing RLS policies remain as defense in depth, but the roles below receive only the stated SELECT permissions.

| Table | SELECT through Supabase Data API | INSERT / UPDATE / DELETE through Supabase Data API | Intended application write path |
| --- | --- | --- | --- |
| `profiles` | Public SELECT, filtered by table policy | **Denied by table privileges** | Express profile service + Drizzle |
| `releases` | Public catalogue SELECT | **Denied by table privileges** | Server-side catalogue service + Drizzle |
| `physical_copies` | Published/owner rows, filtered by RLS | **Denied by table privileges** | Express listing workflow + Drizzle |
| `listings` | Published/owner rows, filtered by RLS | **Denied by table privileges** | Express listing workflow + Drizzle |
| `listing_photos` | Published/owner listing rows, filtered by RLS | **Denied by table privileges** | Express upload workflow + Drizzle; bytes use Supabase Storage |
| `comments` | Comments on readable listings, filtered by RLS | **Denied by table privileges** | Express comment service + Drizzle |
| `activity_events` | Public events and permitted actor-scoped events, filtered by RLS | **Denied by table privileges** | Server-managed activity service + Drizzle |
| `favorites` | Authenticated owner-only SELECT; no `anon` SELECT grant | **Denied by table privileges** | Express favorites service + Drizzle |
| `conversations`, `messages` | No client Data API access | **Denied; no client table grants** | Server-side participant-scoped messaging services + Drizzle |
| `orphaned_storage_objects` | No client Data API access | **Denied; no client table grants** | Server-side storage cleanup only |

The migration deliberately revokes table privileges granted to `PUBLIC`, `anon`, and `authenticated` on the listed application tables, then grants back only the approved SELECT permissions. It does not remove RLS policies or alter grants on Supabase-managed Auth/Storage tables.

**Deployment status (verified 2026-10-16; supersedes the earlier source-only note):** Under the explicit owner authorization recorded in [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49), one staging-only `npm run db:migrate` operation applied migrations 0009–0012. The live Drizzle history contains 13 entries, and read-only verification confirms the lowercase username index, the Data API privilege boundary, the private signup approval objects, and the pinned messaging trigger functions. Full sanitized evidence is recorded in Section 5.8 and in the linked child Issues. No production operation was performed.

The live cross-user PATCH investigation remains tracked in [Issue #133](https://github.com/japiohopman/the-vinyl-drop/issues/133). The previous PowerShell row count could misrepresent an empty JSON array in Windows PowerShell 5.1, and the original raw response body was not retained. A read-only PostgREST log search for PATCH/profile request entries during the available 2026-10-16 window returned no matching request-level records; the relevant PostgreSQL logs showed migration statements but did not explain the earlier PATCH response. This evidence is **inconclusive**: do not claim either that the old request bypassed RLS or that its write was denied. Migration 0010's preventative least-privilege mitigation is now live and its effective grants were verified, but that does not establish the historical request's root cause. Do not repeat the old mutation probe.

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

#### Step 3 — Reconcile Storage Policies; Use the Gated Migration Procedure
1. Confirm the four policies in Section 3.2 exist in the intended staging Supabase project under `storage.objects`, with SELECT targeted to `public` and INSERT/UPDATE/DELETE targeted to `authenticated`.
2. **Do not run `npm run db:migrate` from this setup checklist.** That command applies every pending migration in journal order—not only migrations `0006` and `0007`—and may also apply migrations `0009`–`0012` (or any other pending journal entries). Use the gated procedure in [Section 3.4](#34-human-runbook-staging-security-migration-application--verification) only after Issue [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) explicitly authorizes the exact staging operation and migration `0009` in Issue [#127](https://github.com/japiohopman/the-vinyl-drop/issues/127) has been separately reviewed and authorized. Migration `0006` applies its Storage policy DDL only when the current role owns `storage.objects`; otherwise it validates the four pre-provisioned policies and skips managed-table DDL only if they match. Migration `0007` creates the private `orphaned_storage_objects` tracking table.
3. `npm run db:verify` runs the migration verifier against an isolated in-memory PGlite database; it is not a live staging database check. Verify live state only with the read-only queries below after the separately gated procedure has been approved and completed:

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

### 3.4 Human Runbook: Staging Security Migration Application & Verification

*Human-only operational guidance. This section does not itself authorize a live operation. Do not apply live database migrations, edit Dashboard settings, create Auth users, or send write probes as part of CI or ordinary review work.*

The source tree now contains four sequential security migrations:

| Migration | Governing Issue | Purpose | Live staging status |
| --- | --- | --- | --- |
| `0009_case_insensitive_usernames.sql` | [#127](https://github.com/japiohopman/the-vinyl-drop/issues/127) | Enforce case-insensitive username uniqueness | **Applied and verified 2026-10-16** |
| `0010_supabase_data_api_read_only.sql` | [#135](https://github.com/japiohopman/the-vinyl-drop/issues/135), [PR #134](https://github.com/japiohopman/the-vinyl-drop/pull/134) | Remove client Data API INSERT/UPDATE/DELETE privileges | **Applied and verified 2026-10-16** |
| `0011_password_checked_signup_hook.sql` | [#118](https://github.com/japiohopman/the-vinyl-drop/issues/118), [PR #136](https://github.com/japiohopman/the-vinyl-drop/pull/136) | Install the private one-time signup-approval table and Before User Created function | **SQL applied and DB objects verified 2026-10-16; Auth hook not configured** |
| `0012_pin_messaging_trigger_search_path.sql` | [#119](https://github.com/japiohopman/the-vinyl-drop/issues/119), [PR #138](https://github.com/japiohopman/the-vinyl-drop/pull/138) | Pin both messaging trigger functions to an empty `search_path` and qualify references | **Applied and verified 2026-10-16; messaging remains disabled** |

A source PR merge is not evidence that its migration ran. The status table above records the observed staging state as of 2026-10-16: migrations 0009–0012 are already applied and verified. The preflight and execution instructions below are retained as a reusable procedure for any future authorized staging migration; do not rerun `npm run db:migrate` just to reproduce this completed operation. Drizzle applies every pending journal entry in order, and `npm run db:migrate` is not a command for choosing a single migration. Before any future use, identify every migration that will run and obtain explicit owner approval for that exact set.

#### Step 1 — Required authorization and preflight

The following preflight is retained for future migration operations. Migrations 0009–0012 were already applied and verified on 2026-10-16; do not rerun `npm run db:migrate` merely to repeat this completed operation.

Do **not** start any future staging migration until all of the following are true:

1. The human-owned release gate [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49) explicitly approves the precise staging operation, the full set of pending migrations, the read-only post-checks, and any separate Auth-hook / Render setting operations. Merely referencing this runbook or merging a PR is not authorization.
2. Migration `0009` in [Issue #127](https://github.com/japiohopman/the-vinyl-drop/issues/127) is separately reviewed. Re-run the documented **read-only** case-insensitive username-collision query immediately before the migration. If any collision exists, stop; do not delete, rename, or merge records as part of migration preflight.
3. The owner has reviewed the intended `0010` Data API grant change delivered in [PR #134](https://github.com/japiohopman/the-vinyl-drop/pull/134), and the live operation explicitly includes it.
4. The owner has reviewed the `0011` signup-hook rollout in [Issue #118](https://github.com/japiohopman/the-vinyl-drop/issues/118). The plan distinguishes applying the SQL migration from configuring Supabase Auth → Hooks → Before User Created and opting in the Render **staging** flag. Those are separate live operations and each must be explicitly authorized; never enable the flag before the hook exists and is configured.
5. The operator verifies the exact staging project reference, database host, and connection target against `STAGING_DB_PROJECT_REF`, `STAGING_DB_HOST`, and the effective Drizzle connection (`DATABASE_DIRECT_URL` takes precedence over `DATABASE_URL` in `drizzle.config.ts`). Do not expose connection strings or credentials in evidence.
6. Migration `0012` in [Issue #119](https://github.com/japiohopman/the-vinyl-drop/issues/119) is separately reviewed and included in the approved list if it will be applied. Private messaging must remain disabled until `0012` is applied and its trigger function definitions/grants are verified.
7. The read-only migration-history comparison identifies all pending migrations. If any pending migration is outside the expressly approved list, stop. Because the normal Drizzle command applies the entire pending sequence, do not use it when that sequence exceeds the approved scope.

#### Step 2 — Apply only the approved pending sequence

After the preconditions above are satisfied and the owner explicitly authorizes the live operation:

1. Record the migration-history baseline and the username-collision preflight result using read-only queries. Check the pending migration set against the reviewed files under `drizzle/`.
2. Run the version-controlled command against the **confirmed staging PostgreSQL connection only**, and only when every migration it will apply is included in the authorization:
   ```powershell
   npm run db:migrate
   ```
3. Run the isolated verifier:
   ```powershell
   npm run db:verify
   ```
   This verifier uses in-memory PGlite. It is not evidence of live staging state.
4. Re-run the read-only live checks below. Save sanitized outputs and update [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49) and the applicable child issues. Do not include tokens, connection strings, email addresses, or other personal data.

#### Step 3 — Read-only database and Data API privilege checks

Use read-only SQL to confirm all of the following after the authorized migrations:

- The migration history contains the expected applied entries and the `profiles_username_lower_idx` index exists.
- Public browse tables (`profiles`, `releases`, `physical_copies`, `listings`, `listing_photos`, `comments`, and `activity_events`) retain only the documented SELECT access for `anon` and `authenticated`.
- `favorites` grants SELECT to `authenticated`, not `anon`.
- `conversations`, `messages`, and `orphaned_storage_objects` have no client SELECT access.
- Neither `anon` nor `authenticated` has INSERT, UPDATE, or DELETE table privileges on any of the 11 application tables.
- The private approval table and function from migration `0011` exist; `anon` and `authenticated` cannot access the private schema/table or execute the hook function. The intended hook role has only its scoped privileges.
- Both messaging trigger functions have `search_path` fixed to the empty path and use schema-qualified references. Existing trigger names/timing and the private table grants are intact. Messaging stays disabled until this is verified in staging.

Example read-only existence checks:

```sql
SELECT to_regclass('public.profiles_username_lower_idx') AS username_unique_index,
       to_regclass('private.password_checked_signup_approvals') AS signup_approval_table,
       to_regprocedure('private.enforce_password_checked_signup(jsonb)') AS signup_hook_function;

SELECT p.proname,
       p.proconfig,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('check_conversation_validity', 'check_message_sender_validity')
ORDER BY p.proname;

SELECT has_table_privilege('anon', 'private.password_checked_signup_approvals', 'SELECT') AS anon_can_read_approvals,
       has_table_privilege('authenticated', 'private.password_checked_signup_approvals', 'SELECT') AS authenticated_can_read_approvals,
       has_function_privilege('anon', 'private.enforce_password_checked_signup(jsonb)', 'EXECUTE') AS anon_can_execute_signup_hook,
       has_function_privilege('authenticated', 'private.enforce_password_checked_signup(jsonb)', 'EXECUTE') AS authenticated_can_execute_signup_hook;
```

These checks must return existing objects and the expected privilege results; an absent object or unexpected grant is a stop condition. Also use the privilege matrix in Section 3.1 to inspect all 11 application tables, including inherited/public grants via the documented effective-privilege query or `has_table_privilege`.

A harmless public-listing GET may be used as a read-only Data API smoke check after approval. **Do not repeat the earlier live profile PATCH or send test writes** merely to prove denial. The earlier PowerShell result is inconclusive because an empty JSON array could be miscounted and its raw response body was not retained. Track that discrepancy in [Issue #133](https://github.com/japiohopman/the-vinyl-drop/issues/133); neither the migration nor this SQL inventory retrospectively proves its root cause.

#### Step 4 — Configure and verify the signup hook (Issue #118)

Perform this only after migration `0011` is confirmed applied and separately authorized. Migration `0012` is a separate messaging-trigger hardening migration and does not need to be active to configure the signup hook; however, messaging must remain disabled until `0012` is applied and verified.

1. In Supabase **staging** → Authentication → Hooks → **Before User Created**, configure the Postgres function `private.enforce_password_checked_signup(jsonb)` using the function URI:
   `pg-functions://postgres/private/enforce_password_checked_signup`.
2. Verify that the hook is saved and targets the staging project. Do not change production.
3. Only after the hook is configured, separately authorize and set Render **staging** environment variable `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED=true`. The source default remains off in staging/production to prevent an unconfigured hook from activating by accident.
4. Use only the exact controlled verification plan authorized under #49. It must confirm: the existing application signup rejects a known-breached password before Auth; an unbreached password can complete the normal confirmation flow; a direct email/password Auth signup with no valid approval is denied; and Google OAuth remains available. Do not create duplicate users or repeat already completed recovery tests without a specific approved need.
5. Record sanitized outcomes and keep [#118](https://github.com/japiohopman/the-vinyl-drop/issues/118) and [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) open until runtime evidence is reviewed. This hook does **not** clear Supabase's native `auth_leaked_password_protection` warning on the Free plan and does not check later password updates for existing users.

#### Step 5 — Stop conditions

If the migration history, effective grants, hook configuration, or any check differs from the approved plan, stop. Do not edit live policies directly in the Dashboard, repeat mutation probes, change production, or continue to the next step. Record the exact read-only discrepancy with secrets and personal data redacted, then return to the human-owned release gate for review.

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
   - **Required custom Reset Password template:** the app passes an allow-listed `RedirectTo` value that already contains `next=/auth/reset-password`. Preserve that redirect and append the server-verifiable token hash and recovery type:
     `<p><a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a></p>`
   - This implementation creates the recovery-only marker only after successful server-side `verifyOtp({ token_hash, type: 'recovery' })`.
   - Do **not** use the default Supabase `/auth/v1/verify?token=...` PKCE link for this recovery route. It redirects with a PKCE `code`, and the current server implementation intentionally does not treat that code, a query-string `type=recovery`, or `next=/auth/reset-password` as proof of a recovery event. A code-only recovery link is therefore not a supported reset flow.
   - Ensure SMTP/email delivery settings in Supabase Staging Auth are configured for staging email delivery. Do NOT modify production configuration.
   - The branded HTML drafts are maintained in `docs/email-templates/`: [Reset Password](./email-templates/reset-password.html) and [Confirm Sign Up](./email-templates/confirm-sign-up.html). They use inline email-safe styles and the existing The Vinyl Drop brand tokens. Suggested subjects and the full verification sequence are in [the template README](./email-templates/README.md).
   - **Confirm Sign Up sequencing:** do not save the custom `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email` template until Issue #109's `emailRedirectTo` callback implementation is merged and deployed to staging. The target must point to the staging `/auth/callback` with a safe `next` destination and be included in Supabase's allowed redirect URLs.

#### Password Recovery Session Policy
- **Post-Reset Session Behavior:** Upon successfully submitting a new password (`POST /auth/reset-password`), the server clears active session cookies (`sb-access-token`, `sb-refresh-token`) and signs out of the temporary recovery session (`signOut`). The user is redirected to `/auth/login` with a success message asking them to sign in with their new password.
- **Security Invariant:** Password recovery tokens and session credentials are processed purely in memory and encrypted session cookies. They are never logged, stored in persistent application tables, or echoed in rendered view errors.

#### Operator Human Verification Steps (Staging Post-Deploy)
Perform these verification steps after PR merge and deployment to staging:
1. **Neutral Request Test:** Navigate to `https://the-vinyl-drop-staging.onrender.com/auth/forgot-password`. Submit both an existing account email and an unregistered test email (`unregistered@example.com`). Confirm that both submissions display the exact same neutral message: *"If an account with that email exists, we have sent instructions to reset your password. Please check your inbox."*
2. **Email & Redirect Verification:** Check the inbox for the registered staging account and click the recovery link generated by the custom token-hash template. Confirm that it redirects to the staging callback with `next=/auth/reset-password`, `token_hash`, and `type=recovery` (query parameters may be displayed in a different order) and lands safely on the "Choose New Password" page (`/auth/reset-password`). Do not paste the complete URL or token hash into any log, issue, or chat. A default `/auth/v1/verify?token=...` link that returns a PKCE `code` is not an accepted recovery link for this implementation.
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

The checkboxes below are reconciled against the owner-confirmed staging evidence and current Issue #49 status as of 2026-10-16. A passed sub-check does not imply that the whole beta gate is complete. Keep the parent staging issue [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49) open while any required check remains outstanding.

- [x] **1. Staging database migration & RLS:** Migration `0005_enforce_least_privilege_rls.sql` was applied. Read-only database queries confirmed RLS is enabled on all 8 public tables and verified the expected policies/grants.
- [x] **2. Anonymous Data API boundaries:** Public listings returned HTTP 200; anonymous access to `favorites` returned HTTP 401; anonymous profile creation returned HTTP 401. These are expected deny/allow results.
- [ ] **2a. Historical authenticated cross-user Data API PATCH discrepancy:** Root cause remains inconclusive; **do not repeat the previous PATCH**. The original 2026-10-16 response body was not retained, and Windows PowerShell 5.1 was confirmed to count a parsed empty JSON array incorrectly with the old `@(...)` expression. The available `pg_stat_statements.rows = 1` observation came from a CTE with an outer aggregate and does not independently prove the target row was updated. Migrations 0009 and 0010 are now applied; read-only staging checks confirm the lowercase username index and that neither `anon` nor `authenticated` has INSERT/UPDATE/DELETE privileges on the 11 target application tables. This is an active preventative mitigation, not proof of the old response or its root cause. See [Issue #133](https://github.com/japiohopman/the-vinyl-drop/issues/133) and [PR #134](https://github.com/japiohopman/the-vinyl-drop/pull/134). Keep this gate open until #133's evidence is formally reconciled; do not perform another live mutation just to obtain a new response.
- [x] **3. Staging seed data & test-account fixtures:** Owner confirmed on 2026-10-16 that the existing manually created staging dataset is the intended test dataset; the three fixed-ID demo fixtures in the seed script are examples, not a requirement to recreate them. No seed script was run and no accounts or fixtures were created/deleted for this check. See [Issue #49 comment](https://github.com/japiohopman/the-vinyl-drop/issues/49#issuecomment-6210105491).
- [x] **4. Environment variable audit:** The owner confirmed the staging project reference and DB host match the approved staging project, that `RECOVERY_SIGNING_SECRET` meets the 32-character minimum, and that `MESSAGING_ENABLED=false` was restored after the staging message test. For the authorized migration operation, an additional local preflight confirmed the effective Drizzle connection (`DATABASE_DIRECT_URL`, which takes precedence over `DATABASE_URL`) used the approved Supabase pooler host and project-specific connection username. Do not record or disclose secret values. The current Issue #49 checklist records the broader environment audit as completed; no Render secret values were fetched by these checks. See [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49).
- [x] **5. Health and basic HTTP responses:** `GET /health`, `/`, and `/profiles/jaap` returned HTTP 200.
- [x] **6. Browser HTTPS/certificate review:** The current Issue #49 checklist records the browser HTTPS/certificate review as completed. This note does not invent an issuer/fingerprint or claim this assistant independently inspected the browser certificate.
- [x] **7a. Registration/login/logout:** Manually tested by the operator; the operator reported that these flows worked without errors.
- [x] **7b. Auth/OAuth callback and redirect:** Owner confirmed Google sign-in on staging completes the callback and returns to the application on 2026-10-16. See [Issue #49 comment](https://github.com/japiohopman/the-vinyl-drop/issues/49#issuecomment-6215483522). Do not repeat absent a new regression.
- [x] **8. Storage access & media upload:** Complete and closed in [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61). The operator-confirmed upload, rejected GIF/oversized-file checks and the merged actual-route non-owner denial/integrity evidence are recorded in the issue and PRs #96–#99. Do not re-open this item or repeat completed tests without new contradictory evidence.
- [x] **9a. CSRF/Same-Origin check on `POST /auth/login`:** External Origin returned HTTP 403; missing Origin/Referer returned HTTP 403; the staging Origin reached form validation and returned HTTP 400 for deliberately invalid form data.
- [x] **9b. CSRF/Same-Origin on listing/profile mutations:** Both `POST /profile/edit` and `POST /listings` verified live against staging on 2026-10-16. Both rejected mismatched Origin (`https://attacker.invalid`) and missing Origin/Referer with HTTP 403 before reaching mutation handlers. Baseline and post-check GET requests confirmed valid active session and zero mutations. See Section 5.7.
- [x] **10. Supabase Auth leaked-password protection — initial-pilot decision recorded:** Issue #62 records acceptance of the residual risk only for the first manually controlled test group of at most five personally known friends. This is a temporary initial-testing boundary, not the intended lasting size of the beta. The native Supabase `auth_leaked_password_protection` WARN remains on Free; do not describe it as cleared. The owner says beta readiness was expected around 2026-10-08 and that target has passed. Treat [Issue #118](https://github.com/japiohopman/the-vinyl-drop/issues/118) as an immediate release blocker for expanding beyond the initial group, not an indefinitely deferred follow-up. The staging gate in #49 and privacy/data-handling prerequisite in #88 still apply.

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

- The staging Supabase Storage bucket, policies, and upload-integrity checks are configured and verified. The operator confirmed a public image URL loaded in an incognito browser without authentication on 2026-10-12. The rejected GIF/oversized-file checks, actual-route non-owner denial, and Storage object/data-integrity evidence are complete and recorded in closed [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61) and PRs #96–#99. Do not treat these completed checks as remaining blockers or repeat them absent new contradictory evidence.
- The native Supabase Security Advisor warning `auth_leaked_password_protection` remains because the organization is on Free. See [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62) for the compensating control and residual-risk decision.
- Migration 0010 is now applied in staging. A read-only effective-grant audit confirms `anon` and `authenticated` have no INSERT, UPDATE, or DELETE privileges on the 11 target application tables, including `profiles`. The historical cross-user PATCH discrepancy in [Issue #133](https://github.com/japiohopman/the-vinyl-drop/issues/133) remains **unexplained** because the original response body was not retained and available request-level logs did not capture a matching record. Do not repeat the mutation probe; the least-privilege mitigation is active.
- Migrations 0009–0012 are applied and verified in staging under the owner authorization recorded in [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49). The database objects for the signup hook exist, but Supabase Auth → Before User Created has not been configured and Render's `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED` flag has not been enabled. Private messaging remains disabled; the native `auth_leaked_password_protection` WARN remains.
- **Do not mark staging/beta ready or close Issue #49 yet.** The historical #133 discrepancy is still unresolved, and the separately authorized Auth-hook/Render cutover and controlled signup verification remain outstanding under [Issue #118](https://github.com/japiohopman/the-vinyl-drop/issues/118).

---

## 6. Handoff to Product Specialist

For invite-only beta onboarding (#48), hand off the staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`) upon completion of live deployment verification.

### 5.2 Live Verification Log — 2026-10-12 (Storage public-read check)

**Target:** Staging listing-photo public Storage URL  
**Performed by:** Operator  
**Test:** Opened the direct URL for an uploaded listing photo in an incognito browser with no signed-in session.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Direct public image URL in incognito | The image was visible without signing in. The exact URL and HTTP status code were not recorded. | Pass — operator-reported visual confirmation |

**Not verified by the public-read test alone:** authenticated non-owner upload denial and absence of orphaned Storage objects/database rows after rejected uploads. The separate direct anonymous Storage API write-denial test passed on 2026-10-13; see Section 5.3 and [Issue #61](https://github.com/japiohopman/the-vinyl-drop/issues/61). This successful direct-read check confirms public readability for the tested object; it does not establish that draft object URLs are private.

### 5.3 Live Verification Log — 2026-10-12 (Unauthenticated listing-photo UI flow)

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Performed by:** Operator  
**Test:** While signed out, the operator attempted to enter the listing-photo upload flow. The app redirected to the sign-in page before the operator could upload. The operator also reported that, after signing in to an account in the incognito window, a photo upload succeeded.

| Check | Observed result | Assessment |
| --- | --- | --- |
| Enter listing-photo upload flow while signed out | Redirected to sign-in; no photo was uploaded while signed out. Exact request URL and HTTP status were not captured. | Pass — operator-reported application-route authentication guard |
| Upload photo after signing in within incognito | Upload succeeded after sign-in. | Pass — operator-reported authenticated upload smoke test |

**Security scope:** The app-level redirect confirms the normal UI flow requires authentication before upload. A separate direct anonymous HTTP POST to the Supabase Storage API was subsequently executed on 2026-10-13 and denied by Storage RLS; see the evidence immediately below. The Storage INSERT policy was also independently inspected and is restricted to authenticated users with a listing-owner check.

#### Direct anonymous Storage API write-denial — 2026-10-13

**Target:** Confirmed staging Supabase project `xuhzhdjmgvqzjxijmksu`, public bucket `listing-photos`  
**Performed by:** Operator, from Windows PowerShell  
**Authentication:** No signed-in user session or user access token. The public anon key was supplied as both the `apikey` and `Authorization: Bearer` header; no service-role or secret key was used.  
**Request:** One `POST` to a unique disposable object path under `__security_probe__/anonymous-probe-<timestamp>.jpg`.

| Evidence | Observed result |
| --- | --- |
| Outer HTTP response | `400 Bad Request` |
| Storage response `statusCode` | `403` |
| `error` | `Unauthorized` |
| `message` | `new row violates row-level security policy` |
| `code` | `AccessDenied` |

**Assessment: PASS — anonymous Storage INSERT denied by RLS.** Although the HTTP envelope uses status 400, the Storage API response explicitly identifies the authorization denial as status 403 / `AccessDenied` caused by the row-level security policy. This was not a missing-header or missing-object error. The request did not create the probe object; no cleanup was required. No policy, bucket, account, or existing data was changed.

**Historical open checks as of 2026-10-12 — superseded by the operator-confirmed follow-up below:** At the time of this snapshot, the normal application listing-access guard for a signed-in non-owner had been checked (see Section 5.4), while the other upload checks were still awaiting evidence or explicit scoping. The later follow-up on 2026-10-13 records the repeated rejected-file checks, the staging Anonymous Sign-Ins setting, the merged actual-route non-owner regression test, and the Storage integrity audit. Issue #61 is now closed; do not treat this historical paragraph as a current blocker.

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

**Still open under Issue #61:** confirm the exact HTTP response for GIF and >5 MiB uploads; run the before/after read-only comparison for each rejected upload; and perform a direct authenticated non-owner upload authorization check if endpoint-level protection still needs explicit runtime evidence. The separate raw anonymous Storage API write-denial test passed on 2026-10-13; see Section 5.3 above.

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

#### Fresh connected read-only Storage audit — 2026-10-13

**Target:** Confirmed staging Supabase project `xuhzhdjmgvqzjxijmksu`  
**Performed by:** Connected read-only SQL audit  
**Scope:** Current Storage configuration, policy shape, schema/migration markers, and aggregate integrity only. No Auth settings, policies, bucket configuration, rows, or objects were changed.

##### Current integrity snapshot

| Check | Observed result | Assessment |
| --- | ---: | --- |
| `public.listing_photos` rows | 4 | Current snapshot recorded |
| Objects in `storage.objects` for `listing-photos` | 4 | Current snapshot recorded |
| Photo rows matched to a Storage object by path | 4 of 4 | Pass — no current missing object |
| Photo rows whose Storage object is missing | 0 | Pass — none observed |
| Storage objects with no corresponding photo row | 0 | Pass — none observed |
| `public.orphaned_storage_objects` rows | 0 | Pass — no cleanup failures currently registered |
| Objects under `__security_probe__/` | 0 | Pass — no disposable security-probe object remains |
| `profiles.website_url` exists in this staging database | Yes | This confirms staging schema only; it does not establish the schema state of the separate local database involved in Issue #87 |
| Rows in `drizzle.__drizzle_migrations` | 8 | Consistent with the recorded staging migration history |

This is a fresh aggregate snapshot. It confirms the present state and that the anonymous probe path is empty; it does not independently attribute any earlier state to an individual rejected GIF or oversized upload. Per-attempt before/after evidence, if required for final acceptance, remains open under Issue #61.

##### Current bucket and policy inspection

- `storage.objects` has RLS enabled.
- Bucket `listing-photos` is public-read, limited to 5,242,880 bytes, and allows `image/jpeg`, `image/png`, and `image/webp`.
- Four bucket-scoped policies are present: public SELECT scoped to published listings or the owner; authenticated INSERT scoped to the listing seller; and authenticated UPDATE/DELETE scoped to the listing seller.
- Source review also found an explicit application ownership guard in `addPhotoToListing` and route middleware on `POST /listings/:id/photos`. This is static code evidence; a direct authenticated non-owner request or equivalent targeted passing integration test is still required before that endpoint-level check can be marked passed.

##### Additional Auth configuration check still required

The live Storage policies include `auth.role() = 'authenticated'` alongside the policy's `TO authenticated` role clause. Supabase currently marks `auth.role()` as deprecated. Supabase also documents that **Auth anonymous users use the `authenticated` Postgres role**, with `is_anonymous` in their JWT to distinguish them. The database currently contains zero anonymous Auth user records, but that does not prove the Anonymous Sign-Ins provider is disabled.

Before closing the Storage security gate, confirm in the staging Supabase Dashboard under **Authentication → Sign In / Providers** whether Anonymous Sign-Ins is disabled. If enabled, explicitly test the application flow and review the owner-only policy so an anonymous Auth session cannot be mistaken for a normal seller. Do not change live policy/configuration as part of this verification step. If a policy change is needed, create a separate reviewed implementation Issue/migration rather than silently broadening this verification Issue.

References: [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) and [Deprecated RLS features (`auth.role()`)](https://supabase.com/docs/guides/troubleshooting/deprecated-rls-features-Pm77Zs).

##### Read-only Security Advisor note

The fresh Supabase Security Advisor query returned:
- `auth_leaked_password_protection` — WARN; the native leaked-password control remains plan-gated on the current Free plan and is tracked under Issue #62.
- `rls_enabled_no_policy` — INFO for `public.orphaned_storage_objects`. A read-only privilege check found no SELECT/INSERT table privileges for either `anon` or `authenticated`, and the table currently has zero rows. This is evidence about the current permissions/state, not a claim that the Advisor finding disappeared.

**Historical status as of 2026-10-12 — superseded by the operator-confirmed follow-up below:** At that time, Issue #61 and parent Issue #49 were open while upload/network checks and the Anonymous Sign-Ins configuration check were outstanding. The follow-up below records the later evidence; Issue #61 has since been closed. Parent Issue #49 remains OPEN / NOT READY for its separate outstanding staging/security gates.


#### Operator-confirmed follow-up — 2026-10-13

This note supersedes the open-action wording in the earlier audit snapshot above where the operator has since supplied new confirmation. It records operator evidence; no new live upload request or Auth configuration change was performed as part of this update.

- **Rejected GIF and oversized image checks:** the operator confirms these staging upload checks have already been performed three times and passed. Do not ask the operator to repeat them solely to reproduce this note. The confirmation supplied in chat did not include the numeric HTTP status codes or redirect `Location` values, so this note records the repeated pass as operator-reported and does not invent those values.
- **Supabase Auth Anonymous Sign-Ins:** the operator checked the staging dashboard and confirmed **Allow anonymous sign-ins is OFF**. No Auth setting was changed. The conditional follow-up test for anonymous Auth-user upload behavior is therefore not required for the current staging configuration.
- **Non-owner endpoint authorization:** [PR #98](https://github.com/japiohopman/the-vinyl-drop/pull/98) is merged. Its regression test passed CI run [#38456892479](https://github.com/japiohopman/the-vinyl-drop/actions/runs/38456892479): 28 suites and 374 tests passed, including a request through the actual `POST /listings/:id/photos` route. The non-owner received HTTP 403; photo-row counting/insertion, orphan tracking, and Storage upload were not invoked.
- **Audit documentation:** [PR #97](https://github.com/japiohopman/the-vinyl-drop/pull/97) is merged. The latest read-only aggregate Storage snapshot remains 4 photo rows, 4 objects, 4/4 matched paths, 0 missing/unreferenced objects, 0 orphan-tracking rows, and 0 objects in the disposable probe path.

The native Supabase leaked-password protection warning under Issue #62 and unrelated staging checks under parent Issue #49 remain separate gates. No live data, Storage policy, bucket setting, Auth setting, or secret was changed during this follow-up.

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

The native `auth_leaked_password_protection` warning remains present on Free and is not cleared by this code. The owner has accepted the application-level control and documented direct-Auth limitation only for an initial, manually controlled bug-finding pilot of at most five personally known friends; see [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62). This bounded decision does not mark the native control enabled or complete the overall staging gate [#49](https://github.com/japiohopman/the-vinyl-drop/issues/49). Track technical bypass remediation in [#118](https://github.com/japiohopman/the-vinyl-drop/issues/118) before expanding the cohort, and keep the separate private-messaging `search_path` warning tracked in [#119](https://github.com/japiohopman/the-vinyl-drop/issues/119). Do not upgrade billing or change live Auth settings as part of this decision.

#### Owner-confirmed staging auth evidence and bounded pilot decision — 2026-10-15

This section supersedes the older operator-test instructions immediately above for the owner-confirmed scenarios it explicitly records. It consolidates existing results; **it does not claim that this documentation change ran a new live test**.

**Staging target and implementation context**
- Staging URL: `https://the-vinyl-drop-staging.onrender.com`.
- PR #116 is merged to `main` as `62ab4f559126a0a6b58d81021d02211752221457`; Render staging was independently confirmed LIVE on that merge commit.
- The results below are owner-confirmed staging observations, not newly executed tests in this documentation update. Exact request timestamps, raw responses, and intermediate callback URLs are not invented when they were not retained.

**Owner-confirmed outcomes**

| Scenario | Recorded outcome | Evidence boundary |
| :--- | :--- | :--- |
| Normal staging signup form — known-breached password | The owner confirms this check was already run and passed; the app-owned signup path rejects the known-breached password. | PASS — owner-reported. Do not ask to repeat it. This is not proof that a direct Supabase Auth/API request is protected. |
| Signup confirmation | The owner received the confirmation email, followed its link, and reached an authenticated profile page for the same account (Logout visible). | PASS — owner-confirmed screenshots and test report; #109 records the implementation/deployment review. Do not request a new account or repeat the flow. |
| Password recovery and new-password sign-in | The owner confirms recovery email delivery and callback, rejection of a known-breached new password, acceptance of a strong new password, rejection of the old password, and successful sign-in with the new password. | PASS — owner-reported sequence recorded under [Issue #79](https://github.com/japiohopman/the-vinyl-drop/issues/79) / merged [PR #81](https://github.com/japiohopman/the-vinyl-drop/pull/81). Do not repeat the recovery flow. |
| HIBP lookup failure handling and non-match behavior | Automated tests cover HIBP network/timeout, non-success, malformed/empty responses, prefix-only lookup, suffix matching, and fail-closed behavior. No exact, separate live clean-password/HIBP non-match result is claimed in this record. | Automated implementation coverage is distinct from live staging evidence. Do not invent a live result or create another account merely to complete this documentation. |

No passwords, full hashes, recovery tokens, token hashes, cookies, API keys, real tester addresses, or full recovery URLs are stored here.

**Historical Supabase Security Advisor snapshot — 2026-10-15 (superseded by Section 5.8)**

This table records the state observed on 2026-10-15 only. The later read-only staging verification after migration 0012 is authoritative for current trigger-function and Security Advisor status; see Section 5.8.

A fresh read-only advisor query for the confirmed staging project reported:

| Finding | Current result | Treatment |
| :--- | :--- | :--- |
| `auth_leaked_password_protection` | WARN — Leaked Password Protection Disabled | Remains present on Free. The app-level HIBP guard is a compensating control only for application-owned password paths; it does not clear this native warning. |
| `function_search_path_mutable` | WARN on the 2026-10-15 snapshot — two functions: `public.check_conversation_validity` and `public.check_message_sender_validity` | At the time of this historical snapshot, migration `0012_pin_messaging_trigger_search_path.sql` was proposed under [Issue #119](https://github.com/japiohopman/the-vinyl-drop/issues/119). It was applied and read-only verified on 2026-10-16; the subsequent Security Advisor result no longer reports this warning. See Section 5.8. Keep private messaging disabled pending the separate rollout decision. |
| `rls_enabled_no_policy` | INFO — `public.conversations`, `public.messages`, and `public.orphaned_storage_objects` | Separate from the two WARN findings. The current messaging migration enables RLS and revokes `anon`/`authenticated` privileges on conversations/messages; verify effective grants during the remaining staging Data API audit rather than treating this INFO alone as either a vulnerability or proof of safety. |

**Owner risk decision and release boundary**

The owner explicitly accepts the application-level HIBP control and documented direct Supabase Auth/API bypass limitation **only for an initial, manually controlled pilot of no more than five personally known friends, for bug-finding**. This is a temporary first-test boundary, not a permanent limit on the intended beta audience. It is not acceptance for a larger cohort, public waitlist, or general availability; the recorded security and staging gates must be completed before expansion.

- [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62) is closed for the bounded five-friend pilot decision. Its native Supabase warning remains; see the current status at the top of [Issue #62](https://github.com/japiohopman/the-vinyl-drop/issues/62).
- [Issue #118](https://github.com/japiohopman/the-vinyl-drop/issues/118) has the source-level approval hook merged through [PR #136](https://github.com/japiohopman/the-vinyl-drop/pull/136). Migration `0011` is now applied and its database objects are read-only verified; the Supabase Auth hook configuration, Render flag, and staging runtime proof still require separately authorized rollout before cohort expansion. See Section 5.8.
- [Issue #119](https://github.com/japiohopman/the-vinyl-drop/issues/119) tracked the independent private-messaging trigger-function search-path warning in this 2026-10-15 snapshot. Migration `0012` has since been applied and verified; the new Advisor result no longer contains that warning. Private messaging remains disabled pending the separate rollout decision. See Section 5.8.
- [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49) remains OPEN / NOT READY while the historical authenticated cross-user Data API PATCH discrepancy is inconclusive and the separate Auth-hook/Render runtime cutover is outstanding. Do not repeat the old PATCH merely to obtain another response. The seed/account decision, OAuth callback, environment/certificate checks, Storage acceptance, and live listing/profile CSRF checks have been reconciled above. The migration pending set discussed in this 2026-10-15 snapshot was subsequently applied and verified on 2026-10-16 (migrations 0009–0012; see Section 5.8 and [#49 post-check evidence](https://github.com/japiohopman/the-vinyl-drop/issues/49#issuecomment-6226536933)); it is no longer a pending migration task.
- The five-friend limit is the temporary initial pilot boundary, not a permanent beta-size target. The owner reports that beta readiness was expected around 2026-10-08 and that date has passed; re-evaluate the launch path now rather than leaving the expansion work queued behind an unspecified future pilot wrap-up. Before expanding beyond that initial group, complete the unresolved staging gate in [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49), the privacy/data-handling prerequisites in [Issue #88](https://github.com/japiohopman/the-vinyl-drop/issues/88), and the security work in [Issue #118](https://github.com/japiohopman/the-vinyl-drop/issues/118), unless the owner explicitly changes the recorded risk decision. This does not authorize public waitlist collection, live migrations, production changes, or a claim that the native Supabase warning has cleared.

No new Auth user, mailbox, live setting, database record, DNS/SMTP setting, billing setting, or production state was created or changed by this documentation work.

---

#### Free-plan remediation design — one-time checked-signup approval hook (source change, 2026-10-16)

The free-plan design does not attempt to read the password from the Supabase hook. The official [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) receives the pending user and metadata, but not the submitted password. Instead, The Vinyl Drop checks the password with HIBP first and then, only in protected mode, writes a random one-time approval row tied to the normalized email and expiring after five minutes. The approval UUID is sent as `user_metadata.signup_approval_id` in the application's existing Supabase `signUp()` request.

The private hook function `private.enforce_password_checked_signup(jsonb)` consumes that approval atomically. A direct email/password Auth signup request without a valid, unexpired, matching and unused approval is rejected. The table is in a non-public `private` schema with no access for `anon` or `authenticated`; the `SECURITY INVOKER` function pins an empty `search_path`, and row-level policies grant `supabase_auth_admin` only SELECT access plus UPDATE permission on the `consumed_at` column. Anonymous and authenticated API roles have no access. The application fails closed if it cannot persist an approval. No raw password or HIBP hash is stored or sent to the hook. Google OAuth signup remains allowed because the provider supplies the authentication credential; unknown providers fail closed.

**This migration and hook are not active in staging just because this source PR is merged.** Migration `0011_password_checked_signup_hook.sql` must be applied only after migrations `0009` and `0010` have been separately reviewed/authorized in the Issue #49 staging gate. Then configure **Supabase Auth → Hooks → Before User Created** to call `private.enforce_password_checked_signup` with function URI `pg-functions://postgres/private/enforce_password_checked_signup`. Only after that succeeds should the owner set Render staging `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED=true`. The code default is false in staging/production so deployment cannot silently change signup behavior ahead of the approved cutover. If protected mode is enabled while the approval table is absent or unavailable, app signup fails before calling Supabase Auth.

The human-operated staging verification after approved cutover must confirm the existing breached-password rejection, a non-breached password through the normal email-confirmation path, rejection of a direct email/password Auth signup without approval, and continued Google OAuth behavior. Isolated tests cover replay, expiry, wrong-email matching, and provider behavior. Do not create Auth users or change live hooks/settings from CI. This source change does **not** clear the native `auth_leaked_password_protection` Security Advisor warning. The Before User Created hook covers new email signups; it does not enforce the HIBP check on later password updates by already-authenticated users. Keep #118 and #49 open until separately authorized staging configuration and runtime evidence are complete.

---

### 5.7 Live Authenticated CSRF Verification — Listing & Profile Mutations (2026-10-16)

**Target:** [Staging site](https://the-vinyl-drop-staging.onrender.com)  
**Timestamp:** 2026-10-16 14:12 UTC  
**Performed by:** Automated in-memory session runner reusing the operator's active staging Firefox session (`sb-access-token`, `sb-refresh-token`).  
**Privacy Boundary:** Session tokens and cookies were processed purely in memory and never logged, written to files, output to terminal, or disclosed.  
**Scope:** Authenticated `POST /profile/edit` and `POST /listings` mutation routes under mismatched `Origin` and omitted `Origin`/`Referer` headers.

#### Baseline Session & State Verification
- `GET /profile/edit`: returned `HTTP 200 OK` with the edit profile form for user `@jaap` (confirmed valid, authenticated staging session; not redirected to login).
- `GET /listings`: returned `HTTP 200 OK` (seller listings dashboard baseline captured).

#### Live Negative CSRF Test Results

| # | Endpoint | Test Case | Header Configuration | Observed HTTP Status | Response Body | Assessment |
| :-: | :--- | :--- | :--- | :-: | :--- | :--- |
| 1 | `POST /profile/edit` | Mismatched Origin | `Origin: https://attacker.invalid` | **HTTP 403 Forbidden** | `{"error":"CSRF Forbidden: Origin mismatch"}` | **PASS** — Rejected at `validateSameOrigin` before mutation handler |
| 2 | `POST /profile/edit` | Missing Origin & Referer | `Origin` and `Referer` absent | **HTTP 403 Forbidden** | `{"error":"CSRF Forbidden: Missing Origin and Referer headers"}` | **PASS** — Rejected at `validateSameOrigin` before mutation handler |
| 3 | `POST /listings` | Mismatched Origin | `Origin: https://attacker.invalid` | **HTTP 403 Forbidden** | `{"error":"CSRF Forbidden: Origin mismatch"}` | **PASS** — Rejected at `validateSameOrigin` before mutation handler |
| 4 | `POST /listings` | Missing Origin & Referer | `Origin` and `Referer` absent | **HTTP 403 Forbidden** | `{"error":"CSRF Forbidden: Missing Origin and Referer headers"}` | **PASS** — Rejected at `validateSameOrigin` before mutation handler |

#### Post-Test Non-Mutation Confirmation
- `GET /profile/edit`: returned `HTTP 200 OK`. The profile form HTML and values were identical before and after probes (confirmed 0 profile changes occurred).
- `GET /listings`: returned `HTTP 200 OK`. The listings dashboard HTML and inventory were identical before and after probes (confirmed 0 listings created).
- No database records, listings, or user profile fields were altered.

**Conclusion:** All four negative CSRF test cases passed cleanly against the live staging application. Both protected mutation routes enforce same-origin verification and fail closed before executing mutation handlers.



### 5.8 Staging security migration post-check — 2026-10-16

**Target:** Supabase staging project `xuhzhdjmgvqzjxijmksu`  
**Authority:** One staging-only `npm run db:migrate` operation was explicitly authorized in [Issue #49 comment 6226023302](https://github.com/japiohopman/the-vinyl-drop/issues/49#issuecomment-6226023302). The operation was executed once from the repository environment. This section records sanitized evidence; no credentials or connection strings are included.

#### Migration history and username integrity

- The live Drizzle history contains 13 entries (IDs 1–13). Entries 10–13 have timestamps matching source migrations 0009–0012 in journal order.
- `public.profiles_username_lower_idx` exists after migration 0009.
- The case-insensitive username-collision query returned zero rows after migration.
- No profile records were renamed, deleted, or edited as part of the migration operation.

#### Effective Data API grants after migration 0010

The read-only privilege audit confirmed that neither `anon` nor `authenticated` has INSERT, UPDATE, or DELETE privileges on any of the 11 target application tables. Effective SELECT access matches the migration contract:

- Both API roles retain SELECT on `activity_events`, `comments`, `listing_photos`, `listings`, `physical_copies`, `profiles`, and `releases`.
- `authenticated` retains SELECT on `favorites`; `anon` does not.
- Neither API role has SELECT on `conversations`, `messages`, or `orphaned_storage_objects`.

This confirms the preventative least-privilege boundary is active in staging. It does not by itself explain the response observed in the historical #133 request.

#### Signup-hook database objects after migration 0011

- `private.password_checked_signup_approvals` exists, has RLS enabled, and has two policies.
- `anon` and `authenticated` cannot use the `private` schema or access the approval table.
- `supabase_auth_admin` has schema USAGE and SELECT on the approval table; its UPDATE grant is restricted to the `consumed_at` column. It cannot update `email_normalized`, INSERT, or DELETE approval rows.
- `private.enforce_password_checked_signup(jsonb)` is SECURITY INVOKER with an empty `search_path`. EXECUTE is denied to `anon` and `authenticated` and granted to `supabase_auth_admin`.

**Separate runtime configuration is still outstanding:** this migration operation did not configure Supabase Auth → Hooks → Before User Created or change Render's `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED` flag. Do not enable the flag until the hook has been configured and the operation is separately authorized under #49. Issue #118 remains open pending runtime proof.

#### Messaging trigger hardening after migration 0012

- `public.check_conversation_validity()` and `public.check_message_sender_validity()` both have an empty `search_path`, schema-qualified relations/types, and one enabled trigger each.
- A fresh Security Advisor result no longer reports `function_search_path_mutable`.
- The Security Advisor still reports three INFO findings for RLS-enabled tables without policies: `public.conversations`, `public.messages`, and `public.orphaned_storage_objects`.
- The native `auth_leaked_password_protection` WARN remains on the Free plan. This migration does not clear that native warning.

Per the explicit operation boundary in #49, `MESSAGING_ENABLED=false` remains in place. No post-migration live messaging test was run as part of this operation, and messaging must stay disabled until the owner separately authorizes further rollout and the applicable conditions are satisfied.

#### Issue #133 log investigation result

A read-only Supabase log search was performed for 2026-10-16. The available `postgrest_logs` query returned no matching request-level entries for PATCH/profile terms in the inspected time window. The relevant `postgres_logs` entries showed migration statements from that run near 23:19 UTC, but did not explain the historical PATCH response. A prior temporary, read-only PostgREST diagnostic RPC confirmed that the RPC itself saw the expected `authenticated` role and caller UID rather than the target UID; it was immediately removed, and it did not establish the claim context of the earlier PATCH. The recorded `pg_stat_statements.rows = 1` observation came from a PostgREST CTE with an outer aggregate SELECT, which can itself emit one row when its inner UPDATE affects zero rows; it is not independent proof that the target profile was updated. Separately, the owner confirmed the old Windows PowerShell 5.1 expression can count a literal empty JSON array (`[]`) as one outer item. Because the original raw HTTP response body was not retained, the actual response body remains unknown and the root cause is **inconclusive**.

Do not repeat the old cross-user PATCH probe, create an account, alter profile data, or use a service-role key for this investigation. Keep [Issue #133](https://github.com/japiohopman/the-vinyl-drop/issues/133) and parent [Issue #49](https://github.com/japiohopman/the-vinyl-drop/issues/49) open until the discrepancy is resolved through safe evidence and review.

#### Change boundary

This evidence covers the authorized database migration and read-only verification only. No Supabase Auth hook, Render environment variable, messaging flag, production environment, account, mailbox, or DNS/SMTP setting was changed by this operation.
