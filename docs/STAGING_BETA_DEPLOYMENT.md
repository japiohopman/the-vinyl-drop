# Staging & Beta Infrastructure Strategy

This document specifies the environment taxonomy, hosting provider evaluation, isolated Supabase configuration, seeding instructions, and minimum pre-launch deployment checklist for **The Vinyl Drop**.

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
- **Environment Variable Boundary:** All environment parameters are validated strictly at startup via `src/config/env.ts`. `APP_BASE_URL` is strictly required in staging and production modes and must not fall back to localhost.

---

## 2. Infrastructure & Hosting Provider Evaluation (Sourced 2026 Facts)

The application is built on a server-rendered Node.js / Express / EJS runtime (`dist/server.js`). The hosting platform must support standard Express process execution without forcing architectural rewrites or serverless function adaptations.

### Sourced Provider Comparison Matrix

| Provider | Express / EJS Runtime Compatibility | Free Tier Allocation & Pricing Model (Current 2026) | Execution Time & Timeout Limits | Storage & Health Check | Documentation Source |
| --- | --- | --- | --- | --- | --- |
| **Render** *(Recommended)* | **Native Node Web Service:** Direct execution (`node dist/server.js`). Zero code changes or serverless wrappers required. | **Free Web Service:** 512MB RAM, 0.1 CPU, 750 free instance hours/month. Inactivity sleep after 15m; ~50s cold start delay. | Standard HTTP request timeout (no strict 10s function limit). | Ephemeral disk; Native HTTP `/health` check polling; Free automatic TLS/SSL. | [Render Free Docs](https://render.com/docs/free) & [Blueprint Spec](https://render.com/docs/blueprint-spec) |
| **Netlify** | **Serverless Adapter Required:** Requires `@netlify/functions` or `serverless-http` wrapper and custom EJS view path bundling. | **Personal/Free Tier:** Credit-based pricing model ($0/mo with $7/mo credit allowance; legacy starter plan 100GB/125k invocations explicitly labeled legacy). | **60-second synchronous limit:** Configurable max duration up to 60s for synchronous functions. | Ephemeral read-only Lambda disk; Static CDN SSL; No native Express process health check. | [Netlify Pricing](https://www.netlify.com/pricing/) & [Functions Billing](https://docs.netlify.com/build/functions/usage-and-billing/) |
| **Vercel** | **Serverless Function Adapter:** Requires `api/index.ts` handler and custom `includeFiles` configuration in `vercel.json` for EJS templates. | **Hobby Tier:** Personal, non-commercial use terms only; 100GB bandwidth (legacy no-Fluid-Compute table 100k invocations explicitly labeled legacy). | **60s / 300s Limit:** Up to 60s without Fluid Compute, or up to 300s with Fluid Compute enabled. | Ephemeral read-only Lambda disk; Automatic SSL; No native Express process health check. | [Vercel Plans](https://vercel.com/docs/plans) & [Legacy Pricing](https://vercel.com/docs/functions/usage-and-pricing/legacy-pricing) |
| **Railway** | **Native Container / Node:** Direct process execution from repository or Dockerfile. | **Free Trial / Credit Plan:** $1/month credit allowance or $5 trial credits; usage-based micro-billing thereafter. | Standard HTTP request timeout. | Ephemeral container disk (optional volumes); Native HTTP `/health` polling. | [Railway Pricing Plans](https://docs.railway.com/pricing/plans) & [Free Trial](https://docs.railway.com/pricing/free-trial) |
| **Fly.io** | **Native Container / MicroVM:** Direct process execution via `fly.toml` / Dockerfile. | **Pay-as-you-go:** Micro VMs with initial trial credit allowances. | Standard HTTP request timeout. | Persistent volume support; Native health checks. | [Fly.io Pricing](https://fly.io/docs/about/pricing/) |

### Host Recommendation Decision
**Render (`render.yaml`) is selected as the primary Beta host.**
- **Rationale:** Render executes our compiled Express application directly via `npm run start` without requiring serverless wrappers (`serverless-http`), custom EJS view bundlers, or route refactoring.
- **Durable Storage Alignment:** Although Render free web services utilize an ephemeral filesystem, our application stores all persistent media in Supabase Storage (`listing-photos` bucket), ensuring zero dependency on local disk.

---

## 3. Supabase Staging Isolation & OAuth Redirects

Staging infrastructure utilizes a dedicated, standalone Supabase project:

1. **PostgreSQL Database:**
   - Isolated database instance running Drizzle SQL migrations (`npm run db:migrate`).
   - Database connection pooler (Session pooler) configured for Express ORM queries.
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

*Note on Supabase Auth Provisioning:*
Database profile rows alone do not populate Supabase Auth password credentials. To provision matching login accounts in the staging Supabase Auth directory:
1. **Supabase CLI / Direct SQL (Local/Staging):** Insert matching rows into `auth.users` with `id = '11111111-1111-4111-8111-111111111111'`, `email = 'seller.beta@vinyldrop.local'`, `encrypted_password`, and `email_confirmed_at = now()`.
2. **Supabase Admin Dashboard:** Create Auth user with email (`seller.beta@vinyldrop.local`) and password, and update the database row `profiles.id` to match the generated Auth UUID.
3. **Supabase Admin API:** Execute `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via server-side admin script using `SUPABASE_SERVICE_ROLE_KEY` and sync `profiles.id`.
*Security Requirement:* The Supabase service-role key MUST NEVER be committed to repository code or exposed in client builds.

### Pre-Seeded Dataset & Storage Fixtures
- **5 Canonical Catalog Releases:** Miles Davis (*Kind of Blue*), Fleetwood Mac (*Rumours*), Daft Punk (*Random Access Memories*), Amy Winehouse (*Back to Black*), John Coltrane (*A Love Supreme*).
- **Marketplace Listings:** 4 published listings featuring Goldmine media/sleeve grades (`NM/VG+`, `M/NM`, `VG+/VG`), minor unit integer prices (e.g. €38.50 = `3850`), trade-only listing (`price = null`), and sample buyer/seller comment threads.
- **Photo Asset Handling:** Seed records omit un-uploaded photo rows so the application does not attempt to render non-existent storage objects. Listing photo assets are uploaded dynamically via the application upload workflow (`POST /listings/new`).

---

## 5. Minimum Pre-Launch Deployment Checklist (Live Verification Pending)

*Notice: The following checklist represents the manual pre-launch verification gates to be performed against deployed live staging resources before inviting external beta testers (#48).*

- [ ] **1. Isolated Database Migration:** Run `npm run db:migrate` against the staging `DATABASE_URL` to verify all PostgreSQL tables, enums, foreign keys, and indexes are created cleanly.
- [ ] **2. Staging Seed Data:** Execute `npm run db:seed:staging` to populate test accounts, catalog releases, listings, and comment threads.
- [ ] **3. Environment Variable Audit:** Verify that `NODE_ENV=staging`, `APP_BASE_URL`, `ALLOWED_REDIRECT_URLS`, `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` are populated in the Render Dashboard.
- [ ] **4. Health Check Endpoint:** Confirm that `GET https://the-vinyl-drop-staging.onrender.com/health` returns `200 OK` with status `ok` and valid JSON timestamp.
- [ ] **5. HTTPS & Certificate Verification:** Confirm browser renders valid TLS certificate with HTTPS connection lock.
- [ ] **6. Authentication & Callback Flow:** Test login, registration, and logout using test accounts. Verify callback redirect returns safely to `APP_BASE_URL`.
- [ ] **7. Storage Access & Media Upload:** Verify that album cover images load properly from Supabase Storage and test uploading a new listing photo via `/listings/new`.
- [ ] **8. CSRF & Same-Origin Boundary:** Verify state-changing form posts (`POST /listings/new`, `POST /profile/edit`) pass same-origin verification without 403 errors.

---

## 6. Handoff to Product Specialist

For invite-only beta onboarding (#48), hand off the staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`) upon completion of live deployment verification.
