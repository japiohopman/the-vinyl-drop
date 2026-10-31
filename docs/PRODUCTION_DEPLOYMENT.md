# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278 — establish an isolated production environment](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** Preparation only. No production resource, billing plan, DNS record, Auth setting, database or deployment has been created or changed by this runbook.  
**Last checked:** 31 October 2026.

## 1. Owner-approved target and present inventory

The approved canonical public origin is **`https://thevinyldrop.nl`**.

The status of `https://www.thevinyldrop.nl` is **unverified**. Before deploying, Jaap must decide whether `www` should be an alias that permanently redirects to the apex host. Do not assume that DNS ownership, a registrar verification or an SSL certificate means the hostname is connected to the application.

Read-only Supabase account inspection on 31 October 2026 returned:

| Resource | Observed value | Meaning |
| --- | --- | --- |
| Organization | The Vinyl Drop | Existing Supabase organization |
| Organization plan | Free | No Pro billing plan is active |
| Existing project | `xuhzhdjmgvqzjxijmksu` | Existing staging project; keep as staging |
| Existing project region | `eu-west-1` | Ireland |
| Existing project database host | `db.xuhzhdjmgvqzjxijmksu.supabase.co` | Staging only |
| Production Supabase project | Not present in returned project inventory | Must be separately provisioned after plan/cost approval |

Read-only staging migration inspection on 31 October 2026 confirmed `drizzle.__drizzle_migrations` contains **20 entries**, matching the **20 versioned SQL files** `drizzle/0000` through `drizzle/0019` in the repository. This is the Drizzle migration history used by `npm run db:migrate`.

The Supabase connector's `list_migrations` endpoint returned seven entries from the separate `supabase_migrations.schema_migrations` tracking table. Do not confuse that Supabase CLI history with the Drizzle migration ledger or use it as proof that the production Drizzle schema is current. Production verification must query/verify the Drizzle ledger itself and compare it with the repository migration set.

Issue #278's recorded Render baseline identifies the staging service as `the-vinyl-drop-staging` in Frankfurt. The Render service inventory has not yet been refreshed in this preparation pass because the Render connector requires the owner to explicitly select a workspace before it can inspect or act on services. No Render service has been created or modified.

## 2. Free-first deployment decision

**Default target for the current five-person, low-growth phase: $0/month additional platform spend.** The paid scenarios below are optional future upgrades, not prerequisites for beginning a closed, small-cohort production deployment.

### Render Free

Render Free web services support custom domains and managed TLS certificates. The current official limits include:
- 512 MB RAM and a shared workspace allowance of 750 Free instance hours per calendar month.
- A service spins down after 15 minutes without inbound traffic; the next request can take about one minute while it starts.
- No persistent disk, no SSH/shell access, no scaling beyond one instance, no service-level uptime SLA, and Render may restart the service.
- Usage above the included outbound-bandwidth/build allowances can cause service suspension or additional charges depending on workspace billing configuration.
- Render describes Free as suitable for testing/hobby use and explicitly says not to use it for production applications.

The app uses Supabase for PostgreSQL and Storage, so it must not depend on the Render filesystem for durable listing photos or database files. Confirm actual image processing memory use and workspace-wide 750-hour consumption during the pilot.

Source: [Render Free service limits](https://render.com/docs/free).

### Supabase Free

The connected Supabase organization currently has the Free plan and only one active project (the existing staging project). Supabase Free allows up to two active projects in total, so one separate production project can fit without upgrading the organization.

Current published Free-plan limits include:
- 500 MB database per project, shared CPU and 500 MB RAM.
- 1 GB file storage per project.
- 5 GB egress and 5 GB cached egress.
- Up to 50,000 monthly active users.
- No downloadable managed database backups.
- Projects with insufficient database activity over a seven-day window may be paused automatically. A few real database requests per day are usually enough to avoid pausing, but Supabase does not guarantee that.
- A paused project can be restored; data and settings are retained.

For five people and slow growth this may be a reasonable starting point, provided usage is monitored and we make our own regular database exports. Storage object bytes need their own backup/export process; a database dump contains Storage metadata, not the actual photos.

Sources: [Supabase pricing and limits](https://supabase.com/pricing), [Free project limits](https://supabase.com/docs/guides/platform/billing-on-supabase), [automatic pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [database backups](https://supabase.com/docs/guides/platform/backups).

### What $0 means in practice

| Component | Free-first choice | Additional monthly platform cost |
| --- | --- | ---: |
| Render application | Separate Render Free web service | $0 |
| Supabase database/Auth/Storage | Second Free project in The Vinyl Drop organization | $0 |
| Custom domain and TLS | Existing domain, Render-managed TLS | $0 platform charge |
| **Total additional platform spend** | | **$0/month** |

This is subject to the documented Free quotas and the workspace's actual usage. The two Render Free services share the workspace's 750 instance-hour allowance; monitor that pool rather than assuming each service gets 750 hours.

### Optional paid upgrade path — only when evidence justifies it

If cold starts, memory, storage, database size, uptime or backup requirements become a real problem, review current prices again at that time. The present published reference prices are:
- Render Starter: $7/month (512 MB RAM); Render Standard: $25/month (2 GB RAM).
- Supabase Pro organization: starts at $25/month; additional project compute and usage can add cost. Two Micro projects under Pro may be about $35/month total under current credit assumptions.

These are upgrade options only. They are **not recommended or authorized now**. No upgrade, add-on or spend is to be created unless the owner explicitly approves an exact current quote.

## 3. Intended isolation model

| Concern | Staging | Production |
| --- | --- | --- |
| Render service | Existing `the-vinyl-drop-staging` | New, separate Free service from `main` (subject to documented Free-plan risk acceptance) |
| Render region | Frankfurt | Frankfurt candidate; confirm on service creation |
| App origin | `https://the-vinyl-drop-staging.onrender.com` | `https://thevinyldrop.nl` |
| Supabase project | `xuhzhdjmgvqzjxijmksu` | Second Free project with independent credentials |
| Auth users | Existing staging users only | Start empty; do not copy pilot accounts |
| Storage | Existing staging buckets and objects | New buckets/policies; no staging photo copy |
| Secrets | Staging-only values | Fresh, independent production-only values |

Never reuse staging database connection strings, Supabase API keys, OAuth client secrets, Auth hooks, recovery signing keys or shared-rate-limit secrets for production.

## 4. Production environment contract

Set these values only in the new production Render service's protected environment settings. Never put actual values in Git, Issues, PRs, screenshots or logs.

| Variable | Production value / handling |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Render-provided port (the app already supports `PORT`) |
| `APP_BASE_URL` | `https://thevinyldrop.nl` |
| `ALLOWED_REDIRECT_URLS` | Only the confirmed canonical production origin. Add `www` only if a deliberate alias/redirect design requires it and is verified. |
| `DATABASE_URL` | Production Supabase pooled PostgreSQL connection string |
| `DATABASE_DIRECT_URL` | Production-only direct/migration connection string; use only during an explicitly authorized migration operation |
| `SUPABASE_URL` | New production Supabase project URL |
| `SUPABASE_ANON_KEY` | New production project's publishable/anon key |
| `RECOVERY_SIGNING_SECRET` | Fresh random secret, at least 32 characters; never reuse staging |
| `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED` | `true` only after production migration 0011 and the production Before User Created hook are configured and verified |
| `BETA_INVITE_ONLY_ENABLED` | `true` initially; keep public signup closed |
| `BETA_ALLOWED_EMAILS` | Do not copy staging tester addresses. Keep the production gate closed until Issue #279 and the final release gate authorize opening it. |
| `SHARED_RATE_LIMITS_SECRET` | Fresh stable random secret, at least 32 characters; different from recovery secret and staging secret |
| `SHARED_RATE_LIMITS_ENABLED` | `false` until Issue #89's target DB/client-IP checks and separate activation approval are complete |
| `MESSAGING_ENABLED` | `false` |

The production Auth URL configuration must use the canonical production site URL and exact redirect allowlist. Configure email SMTP, Google OAuth and the password-check hook independently in the new project; staging settings do not transfer. Issue #281 owns the separate production Google OAuth client.

## 5. Ordered provisioning and verification procedure

1. **Owner decisions and cost approval**
   - Confirm the apex domain and whether `www` must redirect to it.
   - Review the Render plan and current recurring price.
   - Request the Supabase project cost quote for the selected organization.
   - Explicitly approve the exact nonzero monthly spend before creating or upgrading anything.
2. **Create isolated Supabase production project**
   - Use an EU region selected by the owner; Frankfurt (`eu-central-1`) is the preferred low-latency candidate for the Netherlands.
   - Keep the existing `xuhzhdjmgvqzjxijmksu` project as staging.
   - Record the new project ref and database host as non-secret identifiers.
3. **Provision production Render service**
   - Connect `japiohopman/the-vinyl-drop`, branch `main`, in Frankfurt.
   - Use the explicitly approved non-free compute plan.
   - Configure `/health` as the health check; keep auto-deploy tied only to `main`.
   - Do not attach the production custom domain until the service is healthy on its temporary Render hostname.
4. **Set production-only secrets and closed gates**
   - Populate the environment contract above through the protected provider UI/connector.
   - Keep invite-only registration enabled, shared rate limits disabled pending #89, and messaging disabled.
5. **Apply reviewed schema and policies**
   - Compare the full migration history against the repository before any migration.
   - Populate the non-secret `PRODUCTION_DB_PROJECT_REF` and `PRODUCTION_DB_HOST` values in the operator's local `.env`; never put DB passwords or secrets in those fields.
   - Set the process-only confirmation value to the exact production project ref and run `./check-production-db-target.ps1`. The script checks `NODE_ENV`, canonical origin/redirect allowlist, `SUPABASE_URL`, both DB URLs, direct migration host and pooler project identity. It opens no database connection and changes nothing.
   - Require a separate explicit authorization immediately before applying production migrations. The preflight is a target identity check, not migration approval.
   - Verify Drizzle migration history, RLS, grants, private functions, Storage buckets/policies and application DB-role access afterward.
6. **Configure Auth, email and storage**
   - Configure site URL, exact redirect allowlist, email templates/SMTP and Before User Created hook for the production project.
   - Enable the password-check approval setting only after its production hook is proven active.
   - Verify bucket names, privacy, policies and upload limits against the reviewed migrations.
   - Start with no staging users, listings or photos.
7. **Attach domain and verify TLS**
   - Add `thevinyldrop.nl` to the production Render service and follow its exact DNS instructions at STRATO.
   - Add `www` only if its redirect target has been decided; verify it redirects to the apex canonical origin.
   - Confirm TLS certificate validity, final DNS target, apex HTTPS and canonical redirects.
8. **Deploy closed and smoke-test**
   - Verify the production deploy commit, environment identity and `/health`.
   - Test email confirmation, password recovery and Google OAuth only after each production provider setting is configured.
   - Confirm staging remains connected exclusively to the staging Supabase project and remains usable.
   - Public registration stays closed until Issues #279, #280, #281 and #89 plus the parent release gate authorize opening it.
9. **Backup/recovery acceptance**
   - Record the actual Supabase daily backup retention and owner access.
   - Define a separate backup/restore approach for Storage object bytes.
   - Perform and record a controlled recovery exercise before general availability. Do not claim a recovery path is proven merely because automatic database backups are enabled.

## 6. Explicit non-actions

Until separately authorized, this preparation does **not**:
- upgrade the Supabase organization plan;
- create a Supabase production project;
- create a Render production service or choose a paid compute plan;
- set production environment variables or secrets;
- apply production database migrations or Auth hooks;
- change STRATO DNS, attach the domain, or issue/replace TLS;
- create production users, copy staging data, or open public signup;
- enable shared rate limits or messaging.

These boundaries preserve the existing staging environment and avoid unapproved spend or production mutations. The current target is the Free-first route; a paid upgrade is not needed unless later evidence demonstrates a specific limitation that matters to the service.
