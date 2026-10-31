# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** Production infrastructure is provisioned and the application service is live on its temporary Render hostname. Public launch remains blocked on production Auth/SMTP, domain/DNS/TLS, smoke tests, security review and the owner's final release decision.  
**Last checked:** 31 October 2026.

## 1. Owner-approved target and safety boundaries

The approved canonical public origin is **`https://thevinyldrop.nl`**. The `www` redirect decision remains open. The custom domain has not been attached and DNS has not been changed.

The owner accepted the Free-plan availability, quota and backup limitations for the current five-person cohort. This is acceptance of Free-plan risk only; it is not approval for paid spend or for opening public registration.

Keep these gates closed until their separate checks and approvals are complete:
- `BETA_INVITE_ONLY_ENABLED=true`; no production allowlist entries have been added.
- `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED=false`; the production Auth Before User Created hook is not configured/activated.
- `MESSAGING_ENABLED=false`.
- `SHARED_RATE_LIMITS_ENABLED=false`.
- No staging users, listings, photos, credentials or OAuth secrets have been copied to production.

## 2. Production Supabase project — provisioned and verified

| Item | Verified value |
| --- | --- |
| Organization | The Vinyl Drop |
| Organization plan | Free |
| Project | `the-vinyl-drop-production` |
| Project ref | `anxhmlalxjvatrufcjei` |
| Region | `eu-west-1` |
| Project status | `ACTIVE_HEALTHY` |
| Production recurring project cost quoted at creation | $0/month |

The existing staging project `xuhzhdjmgvqzjxijmksu` remains separate and was not modified.

Production database provisioning and read-only verification completed on 31 October 2026:
- All 20 repository Drizzle migrations `0000`–`0019` applied with the repository runner.
- `drizzle.__drizzle_migrations` contains 20 rows, 20 distinct hashes, and all 20 `created_at` timestamps match the repository journal.
- All 12 public application tables and all three private tables have RLS enabled.
- The public `listing-photos` bucket is present with a 5 MiB limit and allowed MIME types `image/webp`, `image/jpeg`, and `image/png`.
- Exactly four seller-scoped Storage object policies exist and pass the migration `0006` predicate checks.
- No production users, profiles, listings, listing-photo rows or Storage objects were copied or created.
- The private password-check function exists, but its Supabase Auth hook remains unconfigured and inactive.

Do not run the production migration helper again unless a new migration is intentionally authorized and reviewed. Staging remains an independent project and was not used as a migration target.

## 3. Production Render service — live

| Item | Verified value |
| --- | --- |
| Workspace | `Jaap's workspace` |
| Service name | `the-vinyl-drop` |
| Service ID | `srv-dbj3te2jnfac73c34pv0` |
| Repository / branch | `japiohopman/the-vinyl-drop` / `main` |
| Deployed commit | `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d` |
| Region / plan | Frankfurt / Free |
| Temporary URL | [https://the-vinyl-drop.onrender.com](https://the-vinyl-drop.onrender.com) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start` |
| Health check path | `/health` |
| Auto-Deploy | Off |

Render reported the deployment as **Live / succeeded** at 31 October 2026, 19:41 UTC. The logs show `npm run start`, `node dist/server.js`, and `The Vinyl Drop listening on port 10000 [production]`. The deployment's TypeScript build completed successfully. At 19:45 UTC on 31 October 2026, Jaap manually opened `https://the-vinyl-drop.onrender.com/health` and received `status: ok`, timestamp `2026-10-31T19:45:24.541Z`, and uptime `253.147793256` seconds. This confirms the public health endpoint responds successfully. It is a process-health check only; DB-backed reads/writes, Auth, Storage and full application smoke tests remain pending.

Auto-Deploy is intentionally disabled so a later push to `main` does not silently deploy to production. Future deployments require an explicit manual action. The live Render hostname is temporary; do not treat this as proof that the canonical custom domain, TLS or redirects are configured.

The chosen Render Free plan shares a 750-instance-hour monthly workspace allowance with the other Free services in the same workspace. Free services can spin down after inactivity, have cold starts and do not provide a production SLA. Supabase Free has finite quotas and requires a manual backup process. These limitations were explicitly accepted for the current small cohort; no paid upgrade is authorized.

## 4. Production Render environment contract

The owner reports that the required production environment variables were entered directly in the Render dashboard. Their values are deliberately not recorded here or read back into chat.

Expected production settings:
| Variable | Required handling |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://thevinyldrop.nl` |
| `ALLOWED_REDIRECT_URLS` | Only the canonical apex origin until the `www` decision is made |
| `SUPABASE_URL` | New production project's URL |
| `SUPABASE_ANON_KEY` | New production project's publishable key; never a service-role/secret key |
| `DATABASE_URL` | Production Supabase Shared Session Pooler, port `5432` |
| `RECOVERY_SIGNING_SECRET` | Unique random production secret, at least 32 characters |
| `BETA_INVITE_ONLY_ENABLED` | `true` |
| `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED` | `false` until the production Auth hook is separately configured and verified |
| `MESSAGING_ENABLED` | `false` |
| `SHARED_RATE_LIMITS_ENABLED` | `false` |

Leave `BETA_ALLOWED_EMAILS` empty while public access is closed. Runtime does not require `DATABASE_DIRECT_URL`; migrations have already been applied. Render supplies `PORT` automatically. Never use a Supabase service-role key as the application anon/publishable key. Never copy secrets into Git, Issues, PRs, screenshots or logs.

The successful startup log confirms the app recognized `NODE_ENV=production`; it does not by itself prove DB reads/writes, Auth, Storage upload, email delivery or user flows. Those checks remain explicit tasks.

## 5. Remaining launch gates

1. **Production Auth and email:** configure the production Auth site URL and redirect allowlist, SMTP/Resend sender, confirmation and password-recovery templates, and the separate production Google OAuth client (Issue #281). Verify confirmation, recovery and Google sign-in on the production project. Do not enable the password-check hook until its separate review/authorization is complete.
2. **Canonical domain:** decide whether `www.thevinyldrop.nl` must redirect to the apex. Attach `thevinyldrop.nl` to the production Render service only after confirming the target; then follow the exact STRATO DNS instructions. Verify apex HTTPS, TLS and canonical redirects. DNS changes remain a separately gated action.
3. **Production smoke tests:** check `GET /health`, basic page rendering, DB-backed reads, auth/session boundaries and Storage image behavior against production only. No staging account or data should be used.
4. **Dependency security review:** the successful deployment's `npm ci --include=dev` audit summary reported 44 findings (4 low, 37 moderate, 2 high, 1 critical). The provided summary does not identify affected packages or whether advisories affect production dependencies. Inspect the full `npm audit` report and classify production/runtime exposure before public registration. Do not run `npm audit fix --force` as a deployment workaround.
5. **Backups and recovery:** define and record manual database export and Storage object backup procedures for Supabase Free. A backup/restore exercise is still required before general availability.
6. **Final release decision:** keep invite-only registration closed until the linked public-launch, privacy/legal, OAuth and rate-limit gates are complete and Jaap explicitly approves the release. No automatic merge or release.

## 6. Explicit non-actions

This deployment did **not**:
- upgrade Render or Supabase plans or create paid add-ons;
- modify the staging Render service or staging Supabase project;
- attach the custom domain or change STRATO DNS;
- configure or activate the production Before User Created Auth hook;
- configure production SMTP or Google OAuth;
- create production users or copy staging data;
- enable messaging, shared rate limits or public registration.

Any paid spend, domain/DNS mutation, production Auth-hook activation and public signup remain separate owner-approval gates.
