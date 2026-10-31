# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278 — establish an isolated production environment](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** Free-first preparation. A separate Supabase Free production project exists and is healthy, but its application schema and Storage setup are still empty. No Render production service, production Auth configuration, DNS change or application deployment has been created.  
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
| Production Supabase project | `the-vinyl-drop-production` (`anxhmlalxjvatrufcjei`) | Separate Free project; `ACTIVE_HEALTHY`, created 31 October 2026 at a quoted $0/month |

Read-only staging migration inspection on 31 October 2026 confirmed `drizzle.__drizzle_migrations` contains **20 entries**, matching the **20 versioned SQL files** `drizzle/0000` through `drizzle/0019` in the repository. This is the Drizzle migration history used by `npm run db:migrate`.

The Supabase connector's `list_migrations` endpoint returned seven entries from the separate `supabase_migrations.schema_migrations` tracking table. Do not confuse that Supabase CLI history with the Drizzle migration ledger or use it as proof that the production Drizzle schema is current. Production verification must query/verify the Drizzle ledger itself and compare it with the repository migration set.

Jaap explicitly selected the Render workspace `Jaap's workspace`. The latest read-only inventory confirms the existing `the-vinyl-drop-staging` service remains in Frankfurt and no separate The Vinyl Drop production web service has been created.

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

The connected Supabase organization remains on the Free plan. It now contains the existing staging project and the newly created production project, using the two active-project slots available on Supabase Free.

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
| Supabase project | `xuhzhdjmgvqzjxijmksu` | `anxhmlalxjvatrufcjei`, independent credentials and empty app schema |
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
| `DATABASE_URL` | Production Supabase Shared Pooler **Session** connection string, port `5432` |
| `DATABASE_DIRECT_URL` | Same production project via the Shared Pooler Session endpoint on port `5432` for the Drizzle migration operation; never use Transaction Pooler port `6543` |
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

1. **Owner decisions and Free-plan acceptance**
   - The owner has accepted the Render Free and Supabase Free availability, quota and manual-backup limitations for the current five-person cohort.
   - The canonical origin is `https://thevinyldrop.nl`; whether `www` redirects to the apex remains undecided.
   - No paid plan, add-on or recurring spend is authorized.
2. **Supabase production project — completed**
   - The separate Free project `anxhmlalxjvatrufcjei` exists in `eu-west-1` and reports `ACTIVE_HEALTHY`.
   - The existing `xuhzhdjmgvqzjxijmksu` project remains staging.
   - The production project currently has no application tables, no Drizzle migration records, no `listing-photos` bucket and no Storage object policies.
3. **Prepare production Storage**
   - Staging has one public `listing-photos` bucket, a 5 MiB limit, and allowed MIME types `image/webp`, `image/jpeg`, `image/png`. Create the same bucket in production using the Supabase Storage dashboard.
   - The four Storage object policies refer to `public.listings`. Because that table does not exist until base migrations 0000-0005 have run, create the four policies only after the Base migration phase described below.
   - Migration `0006_storage_objects_rls.sql` deliberately refuses to change the managed `storage.objects` table when the database role is not its owner unless the exact four policies already exist. The migration must not be bypassed or weakened.
4. **Prepare the production DB connection**
   - Use the Shared Pooler **Session** URI, port `5432`; its hostname ends in `.pooler.supabase.com` and username is `postgres.anxhmlalxjvatrufcjei`.
   - Keep the database password out of Git, Issues, PRs and chat. The Render connector does not return the Supabase-generated password. Obtain the connection from the Supabase Dashboard; do not use the Transaction Pooler port `6543`.
   - Set non-secret local preflight values `PRODUCTION_DB_PROJECT_REF=anxhmlalxjvatrufcjei` and `PRODUCTION_DB_HOST` to the exact Session Pooler hostname.
   - The corrected `check-production-db-target.ps1` checks the exact project ref, canonical origin/redirect allowlist, Supabase URL, database usernames/hosts, password placeholder and Session Pooler port. It opens no DB connection and changes nothing. The migration runner also invokes this preflight in a child PowerShell process. Neither PowerShell script has yet been exercised on Windows.
5. **Apply the reviewed Drizzle schema — explicitly authorized 31 October 2026, 16:41 UTC, but not yet run**
   - The repository now includes `run-production-migrations.ps1`, which prompts for the DB password securely and keeps both connection URLs in the current process only. The password is not written to `.env`, Git, Issues or chat.
   - First run `./run-production-migrations.ps1 -Phase Base`. It uses a temporary Drizzle journal containing only migrations 0000-0005, runs the normal Drizzle migrator, and removes the temporary files. This creates the application tables including `public.listings` and records the six migrations in the real `drizzle.__drizzle_migrations` ledger.
   - After Base completes, create the four Storage object policies in the Supabase dashboard/policy editor (their predicates reference `public.listings`, now available). Verify the bucket and exact policy set read-only before proceeding.
   - Then run `./run-production-migrations.ps1 -Phase Complete`. The normal repository runner applies the remaining migrations 0006-0019 and skips the six already recorded entries.
   - The full ordered source set is `drizzle/0000` through `drizzle/0019`. Do not use the separate Supabase CLI migration ledger as a substitute.
   - Stop immediately on any failure; inspect the Drizzle ledger before any retry because earlier migrations may already have committed.
   - Verify all 20 Drizzle records, tables, RLS, grants, private functions, bucket/policies and application DB-role access afterward.
6. **Provision production Render service**
   - Workspace `Jaap's workspace` has been explicitly selected.
   - Once the production database connection is ready and the reviewed schema/policies are verified, create a separate Render **Free** web service from `japiohopman/the-vinyl-drop`, branch `main`, region Frankfurt.
   - Configure `/health` as the health check and keep auto-deploy tied only to `main`. Do not attach the production custom domain until the service is healthy on its temporary Render hostname.
7. **Set production-only secrets and closed gates**
   - Configure the environment contract above using protected Render settings. Use fresh production-only recovery and rate-limit secrets.
   - Keep invite-only registration closed, `SHARED_RATE_LIMITS_ENABLED=false` and `MESSAGING_ENABLED=false`.
8. **Configure Auth, email and storage**
   - Configure site URL, exact redirect allowlist, email templates/SMTP and Before User Created hook independently in production.
   - Enable password-check approval only after migration `0011` and the production hook are configured and verified.
   - Start with no staging users, listings or photos.
9. **Attach domain and smoke-test after separate approvals**
   - Production migrations are authorized, but DNS changes, production Auth hook activation, deployment and opening registration retain separate approval gates.
   - Verify TLS, canonical redirects, `/health`, email confirmation, password recovery and Google OAuth only after their corresponding settings are authorized.
   - Confirm staging remains connected exclusively to the staging Supabase project and remains usable.
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
- upgrade the Supabase organization plan or incur paid spend;
- create a Render production service before its database credentials/schema are ready;
- apply production migrations before the Storage bucket and four exact Storage policies are provisioned;
- activate the production Before User Created Auth hook or change Auth URL/SMTP settings;
- change STRATO DNS, attach the domain, or issue/replace TLS;
- create production users, copy staging data, or open public signup;
- enable shared rate limits or messaging.

Jaap explicitly authorized the 20 Drizzle migrations on 31 October 2026 at 16:41 UTC. That authorization remains unused until the migration preconditions above are satisfied. The corrected PowerShell preflight has not yet been tested on Windows.

These boundaries preserve the existing staging environment and avoid unapproved spend or production mutations. The current target is the Free-first route; a paid upgrade is not needed unless later evidence demonstrates a specific limitation that matters to the service.
