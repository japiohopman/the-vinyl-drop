# Staging & Beta Infrastructure Strategy

This document specifies the environment taxonomy, hosting provider evaluation, isolated Supabase configuration, seeding instructions, and minimum pre-launch deployment checklist for **The Vinyl Drop**.

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
- **Environment Variable Boundary:** All environment parameters are validated strictly at startup via `src/config/env.ts`.

---

## 2. Infrastructure & Hosting Provider Evaluation (2026 Verified Facts)

The application is built on a server-rendered Node.js / Express / EJS runtime (`dist/server.js`). The hosting platform must support standard Express process execution without forcing architectural rewrites or serverless function adaptations.

### Provider Comparison Matrix

| Criteria | Render (Recommended) | Netlify | Vercel | Railway / Fly.io |
| --- | --- | --- | --- | --- |
| **Express/EJS Support** | Native Node web service (`node dist/server.js`) | Requires `@netlify/functions` or `serverless-http` wrapper | Requires `api/index.ts` serverless adapter | Native container / Node process |
| **Code Changes Required** | **None** | High (EJS template path bundling & adapter) | High (Vercel serverless function & file inclusions) | None |
| **Free Tier (2026)** | 512MB RAM, 0.1 CPU, 750 free hours/month | 100GB bandwidth, 125k function invocations/mo | 100GB bandwidth, 100k invocations/mo | Paid usage / Trial credits required |
| **Cold Starts & Sleeping** | Sleep after 15 min inactivity; ~50s wake delay on free tier | Serverless function cold starts (~1-3s) | Serverless function cold starts (~1-2s) | Always on (until credits exhaust) |
| **Execution Time Limits** | Standard HTTP request timeouts (no hard 10s cap) | Hard 10-second function timeout | Hard 10-second hobby timeout | Standard HTTP request timeouts |
| **Persistent Filesystem** | Ephemeral container disk | Ephemeral read-only lambda environment | Ephemeral read-only lambda environment | Ephemeral container disk / Optional volumes |
| **Health Checks & HTTPS** | Native HTTP `/health` polling & automatic SSL | SSL provided; no server process health check | SSL provided; function routing only | Native `/health` polling & automatic SSL |

### Host Recommendation Decision
**Render (`render.yaml`) is selected as the primary Beta host.**
- **Rationale:** Render executes our compiled Express application directly via `npm run start` without requiring serverless wrappers (`serverless-http`), custom EJS view bundlers, or route refactoring.
- **Durable Storage Alignment:** Although Render free web services utilize an ephemeral filesystem, our application stores all persistent media in Supabase Storage (`listing-photos` bucket), ensuring zero dependency on local disk.

---

## 3. Supabase Staging Isolation & Object Storage

Staging infrastructure utilizes a dedicated, standalone Supabase project:

1. **PostgreSQL Database:**
   - Isolated database instance running Drizzle SQL migrations (`npm run db:migrate`).
   - Database connection pooler (Session pooler) configured for Express ORM queries.
2. **Supabase Auth:**
   - Isolated Auth user directory (`auth.users`).
   - Redirect URL whitelist configured in Supabase Dashboard:
     - `https://the-vinyl-drop-staging.onrender.com/auth/callback`
     - `http://localhost:3000/auth/callback` (for local dev testing)
3. **Supabase Storage (`listing-photos` bucket):**
   - Dedicated `listing-photos` bucket created in staging Supabase project.
   - Public read permissions enabled for serving album artwork WebP photos.
   - Server-side streaming via `@fastify/busboy` and `sharp` processes uploaded images directly to Supabase Storage, keeping media completely off the local filesystem.

---

## 4. Staging Seed Script & Test Accounts

A reproducible seed command populates the isolated staging environment with realistic beta test data and accounts.

### Execution Command
```bash
# Seed isolated staging database
npm run db:seed:staging
```

### Pre-Seeded Beta Test Accounts
| Role | Email | Username | Display Name | Location |
| --- | --- | --- | --- | --- |
| **Seller** | `seller.beta@vinyldrop.local` | `@amsterdam_grooves` | Amsterdam Grooves | De Pijp, Amsterdam |
| **Buyer** | `buyer.beta@vinyldrop.local` | `@spin_doctor` | Spin Doctor | Amsterdam Noord |
| **Collector** | `collector.beta@vinyldrop.local` | `@wax_collector` | Wax Collector | Oost, Amsterdam |

### Pre-Seeded Dataset
- **5 Canonical Catalog Releases:** Miles Davis (*Kind of Blue*), Fleetwood Mac (*Rumours*), Daft Punk (*Random Access Memories*), Amy Winehouse (*Back to Black*), John Coltrane (*A Love Supreme*).
- **Marketplace Listings:** 4 published listings featuring Goldmine media/sleeve grades (`NM/VG+`, `M/NM`, `VG+/VG`), minor unit integer prices (e.g. €38.50 = `3850`), trade-only listing (`price = null`), photo references, and sample buyer/seller comment threads.

---

## 5. Minimum Pre-Launch Deployment Checklist

Before opening the beta environment to external testers in Issue #48, the following verification checklist MUST be executed:

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

For invite-only beta onboarding (#48), hand off the verified staging target URL (`https://the-vinyl-drop-staging.onrender.com`) along with the pre-seeded test account matrix (`seller.beta@vinyldrop.local` / `buyer.beta@vinyldrop.local`).
