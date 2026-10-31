# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** The production service is live at the owner-confirmed canonical apex domain with SSL. Production confirmation/recovery email, Google sign-in and the password-check hook have been exercised/configured by the owner. Public launch remains gated on provider-level signup-state verification, complete DB/Storage smoke coverage, dependency-audit triage, backup/recovery readiness, the unresolved `www` decision and the owner's final release decision.  
**Last checked:** 31 October 2026.

## 1. Owner-approved target and safety boundaries

The approved canonical public origin is **`https://thevinyldrop.nl`**. Jaap reports that the apex custom domain is attached to the production Render service and SSL is live. The `www.thevinyldrop.nl` alias/redirect behavior remains unverified and is not included in the canonical redirect allowlist. Treat the apex attachment and SSL as owner-confirmed observations, not as an independently repeated DNS/TLS audit.

The owner accepted the Free-plan availability, quota and backup limitations for the current five-person cohort. This is acceptance of Free-plan risk only; it is not approval for paid spend or for opening public registration.

Keep these gates closed until their separate checks and approvals are complete:
- `BETA_INVITE_ONLY_ENABLED=true`; the owner reports that the production application allowlist contains one controlled test account. Its address must never be copied into this document or public GitHub content.
- `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED=true`; Jaap reports that the production Supabase Before User Created hook is configured and enabled. This is owner-confirmed configuration, not a fresh provider-side inspection by this documentation change.
- Keep Supabase Email's provider-level **Allow new users to sign up** control separately verified. The first production signup test required temporarily enabling it; do not claim registration is closed until Jaap confirms this provider-level control is OFF.
- `MESSAGING_ENABLED=false`.
- `SHARED_RATE_LIMITS_ENABLED=false`.
- No staging users, listings, photos, credentials or OAuth secrets have been copied to production. Jaap manually created one production test account and two test listings; one is published and one remains a draft.

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
- No staging users, profiles, listings, listing-photo rows, Storage objects, credentials or OAuth secrets were copied into production.
- Jaap reports that a production test account and two smoke-test listings were created manually (one published, one draft). This is test data, not an import from staging.
- The private password-check function and production Before User Created Auth hook are reported enabled; the runtime flag is reported as `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED=true`.

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
| Canonical URL | [https://thevinyldrop.nl](https://thevinyldrop.nl) |
| Render service hostname | [https://the-vinyl-drop.onrender.com](https://the-vinyl-drop.onrender.com) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start` |
| Health check path | `/health` |
| Auto-Deploy | Off |

Render reported the deployment as **Live / succeeded** at 31 October 2026, 19:41 UTC. The logs show `npm run start`, `node dist/server.js`, and `The Vinyl Drop listening on port 10000 [production]`. The deployment's TypeScript build completed successfully. At 19:45 UTC on 31 October 2026, Jaap manually opened `https://the-vinyl-drop.onrender.com/health` and received `status: ok`, timestamp `2026-10-31T19:45:24.541Z`, and uptime `253.147793256` seconds. This confirms the public health endpoint responds successfully. It is a process-health check only; DB-backed reads/writes, Auth, Storage and full application smoke tests remain pending.

Jaap reports that the apex custom domain `https://thevinyldrop.nl` is attached to this service and SSL is live. The `onrender.com` hostname remains the underlying Render service hostname. The `www` alias and its redirect behavior have not been verified. Auto-Deploy is intentionally disabled so a later push to `main` does not silently deploy to production; future deployments require an explicit manual action.

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
| `SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED` | `true`; owner reports the production Before User Created hook is configured and active |
| `MESSAGING_ENABLED` | `false` |
| `SHARED_RATE_LIMITS_ENABLED` | `false` |

Keep `BETA_ALLOWED_EMAILS` limited to the one owner-controlled test account while invite-only access is in effect; never record its address here. Separately verify that Supabase Email's provider-level **Allow new users to sign up** control is OFF before treating registration as closed. Runtime does not require `DATABASE_DIRECT_URL`; migrations have already been applied. Render supplies `PORT` automatically. Never use a Supabase service-role key as the application anon/publishable key. Never copy secrets into Git, Issues, PRs, screenshots or logs.

The Express runtime explicitly configures Postgres.js with `ssl: 'require'` in both staging and production. This prevents fallback to plaintext but encrypts without verifying the server CA or hostname; certificate-verified `verify-full` remains a separate hardening option requiring the correct Supabase CA certificate to be securely supplied to the runtime.

The successful startup log confirms the app recognized `NODE_ENV=production`; it does not by itself prove DB reads/writes or Storage behavior. Jaap reports successful production confirmation email, password recovery and Google sign-in, and has created a test account plus one published and one draft listing. These are owner-confirmed smoke results; complete DB-backed and physical-photo Storage coverage remains open. The first DROP test exposed missing Discogs catalogue-artwork persistence/display, tracked separately in [Issue #288](https://github.com/japiohopman/the-vinyl-drop/issues/288).

## 5. Remaining launch gates

1. **Provider-level signup control:** Jaap must read the production Supabase Auth provider setting **Allow new users to sign up** and confirm it is OFF before the runbook may describe registration as closed. Do not change it as part of this documentation/implementation PR. Keep the application invite-only flag and private allowlist in place.
2. **Canonical `www` behavior:** the apex domain and SSL are owner-confirmed live. Decide whether `www.thevinyldrop.nl` should redirect to the apex, then verify its DNS, TLS and HTTP redirect before adding it to any allowlist. Do not change DNS in this PR.
3. **Complete production smoke coverage:** verify DB-backed reads/writes, authenticated session boundaries, listing creation/editing and seller-owned physical-photo Storage upload/read behavior against production. The existing process-health check and owner-reported account/listing/email/Google tests are useful partial evidence, not a substitute for complete DB/Storage verification. Discogs catalogue artwork is tracked separately in [#288](https://github.com/japiohopman/the-vinyl-drop/issues/288).
4. **Dependency security review:** the successful deployment's `npm ci --include=dev` audit summary reported 44 findings (4 low, 37 moderate, 2 high, 1 critical). Inspect the full `npm audit` report and classify production/runtime exposure before public registration. Do not run `npm audit fix --force` as a deployment workaround.
5. **Backups and recovery:** define and record manual database export and Storage object backup procedures for Supabase Free. A backup/restore exercise is still required before general availability.
6. **Final release decision:** keep public registration closed until the public-launch, privacy/legal, OAuth, anti-abuse and rate-limit gates are complete and Jaap explicitly approves the release. No automatic merge or release.

## 6. Explicit non-actions

This deployment and runbook reconciliation did **not**:
- upgrade Render or Supabase plans or create paid add-ons;
- modify the staging Render service or staging Supabase project;
- change DNS or infer that `www` redirects correctly;
- read, expose or modify production secrets;
- create the owner-reported production test account/listings (those were created separately by Jaap);
- enable messaging or shared rate limits, which remain disabled;
- open public registration or change the provider-level signup control.

Any paid spend, DNS mutation, provider-level signup toggle and public-launch decision remain separate owner-controlled actions.
