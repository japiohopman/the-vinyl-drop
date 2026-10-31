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

## 2. Current cost comparison (USD)

These are published list prices checked on 31 October 2026, not an invoice or an account-specific quote. They exclude tax, usage overages, email-provider charges, domain renewal and optional backup add-ons.

### Render — production web service

| Plan | Resources | Published price | Assessment |
| --- | --- | ---: | --- |
| Free | 0.1 CPU / 512 MB RAM | $0/month | **Not suitable for production.** Render explicitly says not to use Free services for production; they sleep after 15 minutes idle and can take about a minute to wake. |
| Starter (`0.5c-512mb`) | 0.5 CPU / 512 MB RAM | $7/month | Lowest paid always-on web service. Lowest-cost candidate; memory headroom for Node.js and Sharp image processing is limited. |
| Standard (`1c-2g`) | 1 CPU / 2 GB RAM | $25/month | **Recommended starting point** for the Express app and image-processing workload; provides materially more memory headroom. |

Sources: [Render pricing](https://render.com/pricing), [Render compute plans](https://render.com/docs/compute-plans), [Render Free service limits](https://render.com/docs/free).

### Supabase — separate production project

The connected organization is currently on Free. The published Pro price is **$25/month**, including **$10/month in compute credits**. Each project has its own compute. A Micro project is approximately **$10/month** before credits.

Assuming staging and production both run one Micro compute in the same Pro organization:

| Component | Estimated monthly price |
| --- | ---: |
| Supabase Pro organization subscription | $25 |
| Two Micro project computes | $20 |
| Included monthly compute credits | -$10 |
| **Estimated organization total** | **$35/month** |

Pro includes daily database backups with seven-day retention, 8 GB database disk per project, 250 GB egress and 100 GB file storage. Usage above included limits can incur additional charges. Point-in-Time Recovery is a separate, substantial add-on (currently about $100/month for seven-day retention) and also requires at least Small compute; it is **not included** in the $35 estimate.

Important backup boundary: Supabase database backups do **not** include the actual object bytes in Storage. A database restore alone does not restore listing photos deleted after that backup. A separate Storage-object backup/export and restore procedure must be decided and tested.

Sources: [Supabase pricing](https://supabase.com/pricing), [compute usage and credits](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [database backups and PITR pricing](https://supabase.com/docs/guides/platform/backups).

### Combined monthly scenarios

| Runtime choice | Render | Supabase (two Micro projects, Pro) | Combined estimate |
| --- | ---: | ---: | ---: |
| Lowest paid candidate | $7 | $35 | **$42/month** |
| Recommended starting point | $25 | $35 | **$60/month** |

No resource is authorized by this comparison. The Supabase connector must return an organization-specific project cost quote before creation; no project should be created until Jaap has reviewed the exact quote and explicitly approved it. Likewise, no Render service should be created until Jaap approves the compute plan and recurring spend.

## 3. Intended isolation model

| Concern | Staging | Production |
| --- | --- | --- |
| Render service | Existing `the-vinyl-drop-staging` | New, separate service from `main` |
| Render region | Frankfurt | Frankfurt candidate; confirm on service creation |
| App origin | `https://the-vinyl-drop-staging.onrender.com` | `https://thevinyldrop.nl` |
| Supabase project | `xuhzhdjmgvqzjxijmksu` | New project with independent credentials |
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

These boundaries preserve the existing staging environment and avoid unapproved spend or production mutations.
