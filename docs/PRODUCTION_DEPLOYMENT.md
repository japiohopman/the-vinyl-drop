# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** Production is live on its separate Render/Supabase environment at the canonical apex domain and deliberately remains on PR #286 commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d` with Auto-Deploy off. On 4 November, read-only inspection confirmed production's Drizzle ledger remains at migrations `0000`–`0019`; the private `listing-photo-originals` bucket exists, but its three owner-scoped Storage policies required by migration `0022` are not yet present. `main` is `4102103623c1da85e7aec804fa95c4c7da54748e` (PR #350); staging is live at PR #348 commit `85098a60acc4ebee99a29fe21300ce8c34eacde6`, also with Auto-Deploy off. Post-merge CI run [41867838942](https://github.com/japiohopman/the-vinyl-drop/actions/runs/41867838942) passed; CI does not equal production acceptance. A controlled closed beta for up to 13 invited testers is now tracked separately in [#353](https://github.com/japiohopman/the-vinyl-drop/issues/353); general availability remains tracked in [#282](https://github.com/japiohopman/the-vinyl-drop/issues/282). No production migration or deploy is authorized by this checkpoint.  
**Last checked:** 4 November 2026.

## 1. Owner-approved target and safety boundaries

The approved canonical public origin is **`https://thevinyldrop.nl`**. A read-only browser check on 2 November confirmed that the apex site loads and `https://www.thevinyldrop.nl/` redirects to the apex canonical URL. This is an HTTP/browser routing check, not a complete DNS, certificate-chain or provider configuration audit.

The owner accepted the Free-plan availability, quota and backup limitations for the earlier five-person pilot. That historical acceptance does not silently resolve every residual security/privacy risk for the new 13-person closed-beta target. Record the specific cohort-expansion risk decision under [#353](https://github.com/japiohopman/the-vinyl-drop/issues/353). No paid spend or public registration is authorized.

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
- Read-only checks on 4 November confirmed production is still at Drizzle migration `0019` (20 entries total). Migration `0020` (`pg_trgm` and GIN indexes) and `0021` (release metadata columns) are not applied; `pg_trgm` is available in the server but not installed in the database. Migration `0021` is required by current `main`; `0020` remains an optional catalogue-suggestion enhancement because the app has a tested normalized-search fallback.
- Migration `0022` adds private photo-source references/editor state. The `listing-photo-originals` bucket already exists and is private, limited to WebP and 20 MiB. The `storage.objects` table is owned by `supabase_storage_admin`; only the four existing `listing-photos` policies were found. The three additional `listing-photo-originals` owner-scoped SELECT/INSERT/DELETE policies required by migration `0022` are currently absent. Migration `0022` fails closed unless these exact policies are in place; do not broaden or replace the existing public listing-photo policies.
- Migration `0023` updates the existing private Before User Created hook to reject new Google Auth identities until the member has completed the email/password + consent flow. It must follow `0022` in the same ordered release-candidate migration range. After applying it, verify email approval success/replay rejection, rejection of an unapproved Google identity, and continued Google sign-in for a previously registered account.
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

Render reported the production deployment as **Live / succeeded** at 31 October 2026, 19:41 UTC. The logs show `npm run start`, `node dist/server.js`, and `The Vinyl Drop listening on port 10000 [production]`. The deployment's TypeScript build completed successfully. On 2 November 2026, a read-only browser check opened `https://the-vinyl-drop.onrender.com/health` after the expected Free-service wake-up and received `{"status":"ok","timestamp":"2026-11-02T08:13:43.757Z","uptime":13.49308256}`. This is a process-health check only; it does not prove DB-backed writes, Auth, Storage or full application behavior.

The apex custom domain `https://thevinyldrop.nl` is attached with SSL. The `www` host was checked on 2 November and redirects to the apex URL. The `onrender.com` hostname remains the underlying Render service hostname. Auto-Deploy is intentionally disabled so a later push to `main` does not silently deploy to production; future deployments require an explicit manual action. Current `main` is at PR #350 merge commit `4102103623c1da85e7aec804fa95c4c7da54748e`; staging is Live at PR #348 commit `85098a60acc4ebee99a29fe21300ce8c34eacde6`; production remains on PR #286 commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`. GitHub compares current `main` as 534 commits ahead of production, while staging is 518 commits behind current `main`. This is a broad integrated feature delta, not a routine or small hotfix. No automatic deployment occurs on either Render service.

The chosen Render Free plan shares a 750-instance-hour monthly workspace allowance with the other Free services in the same workspace. Free services can spin down after inactivity, have cold starts and do not provide a production SLA. Supabase Free has finite quotas and requires a manual backup process. These limitations were explicitly accepted for the current small cohort; no paid upgrade is authorized.

## 4. Production Render environment contract

The owner reports that the required production environment variables were entered directly in the Render dashboard. Their values are deliberately not recorded here or read back into chat.

Expected production settings:
| Variable | Required handling |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://thevinyldrop.nl` |
| `ALLOWED_REDIRECT_URLS` | Keep application redirects on the canonical apex origin; the `www` host redirects to the apex |
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

The successful startup log confirms the app recognized `NODE_ENV=production`; it does not by itself prove DB reads/writes or Storage behavior. Jaap reports production confirmation email and password-recovery smoke results and has created a test account plus one published and one draft listing. The separate production Google OAuth client/provider configuration and end-to-end sign-in remain unverified under [Issue #281](https://github.com/japiohopman/the-vinyl-drop/issues/281). Complete DB-backed and physical-photo Storage coverage also remains open. The first DROP test exposed missing Discogs catalogue-artwork persistence/display, tracked separately in [Issue #288](https://github.com/japiohopman/the-vinyl-drop/issues/288).

## 5. Remaining launch gates

1. **Provider-level signup control:** Jaap must read the production Supabase Auth provider setting **Allow new users to sign up** and confirm it is OFF before the runbook may describe registration as closed. Do not change it as part of this documentation/implementation PR. Keep the application invite-only flag and private allowlist in place.
2. **Canonical `www` behavior:** a read-only browser check on 2 November confirmed `www.thevinyldrop.nl` redirects to `https://thevinyldrop.nl/`. The canonical decision is apex/no-www. Do not add the `www` host to application redirect allowlists or change DNS unless a separate requirement is approved.
3. **Complete production smoke coverage:** verify DB-backed reads/writes, authenticated session boundaries, listing creation/editing and seller-owned physical-photo Storage upload/read behavior against production. The existing process-health check and owner-reported account/listing/email/Google tests are useful partial evidence, not a substitute for complete DB/Storage verification. Discogs catalogue artwork is tracked separately in [#288](https://github.com/japiohopman/the-vinyl-drop/issues/288).
4. **Dependency security review:** the successful deployment's `npm ci --include=dev` audit summary reported 44 findings (4 low, 37 moderate, 2 high, 1 critical). Inspect the full `npm audit` report and classify production/runtime exposure before public registration. Do not run `npm audit fix --force` as a deployment workaround.
5. **Backups and recovery:** define and record manual database export and Storage object backup procedures for Supabase Free. A backup/restore exercise is still required before general availability.
6. **Final release decision:** keep public registration closed until the public-launch, privacy/legal, OAuth, anti-abuse and rate-limit gates are complete and Jaap explicitly approves the release. No automatic merge or release.

## 6. Explicit non-actions

This deployment and runbook reconciliation did **not**:
- upgrade Render or Supabase plans or create paid add-ons;
- modify the staging Render service or staging Supabase project;
- change DNS; the `www` to apex redirect was observed in the read-only browser check;
- read, expose or modify production secrets;
- create the owner-reported production test account/listings (those were created separately by Jaap);
- enable messaging or shared rate limits, which remain disabled;
- open public registration or change the provider-level signup control.

Any paid spend, DNS mutation, provider-level signup toggle and public-launch decision remain separate owner-controlled actions.


## 7. Read-only public-route checkpoint — 2 November 2026

The following public production GET routes loaded successfully in a read-only smoke check: `/`, `/health`, `/browse`, `/dig`, `/activity`, `/install`, `/terms`, `/privacy`, `/community-rules`, `/contact`, `/auth/signup` and `/auth/login`.

This confirms public page availability only. No form was submitted and no authenticated operation was attempted. Production remains on the PR #286 revision, so newer Activity and Discogs-artwork changes on `main` are not expected to appear until a separate production deployment is explicitly approved. Authenticated DB-backed writes, seller-owned physical-photo Storage round-trip, provider-level signup verification, production OAuth and backup/recovery checks remain open under #278/#279/#281/#282. The separate production application DB-role and Cloudflare client-IP checks for shared rate limits **passed on 3 November 2026**; the temporary endpoint/token were removed via merged PR #328. This does not activate rate limiting: `SHARED_RATE_LIMITS_ENABLED=false` remains in force.


## 8. Production/main compatibility checkpoint — 3 November 2026

Production remains on `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`; current `main` is `4102103623c1da85e7aec804fa95c4c7da54748e`, and staging is Live on `85098a60acc4ebee99a29fe21300ce8c34eacde6`. The 4 November GitHub compare reports 534 commits ahead from production to current `main`; it is a broad integrated feature delta. Both Render Auto-Deploy settings remain off. Do not promote the full delta without the controlled candidate and gates in #353.

### Pending migrations

- **0021 — required before deploying current `main`.** Adds the three release-metadata columns referenced by the current Drizzle schema and release service. It is additive, uses empty-array defaults, preserves existing raw fields and does not backfill/rewrite existing release rows.
- **0020 — required for full fuzzy catalogue suggestions, but not for basic startup.** Installs `pg_trgm` in the non-public `extensions` schema and creates artist/title/label GIN indexes. The catalogue-suggestions repository detects a missing extension/operator and falls back to normalized exact/prefix/contains matching. The extension is available in the production PostgreSQL installation (version 1.6) but was not installed at the 3 November read-only check.

Migration 0021 was applied directly to staging through Supabase on 2 November. The staging Drizzle ledger was not reconciled with that direct migration history. Do **not** run the general `npm run db:migrate` command against staging until this is reconciled; PR #321 records this operational warning. Production has none of migrations `0020`–`0023` applied. The current source migration runner on `main` pins its ReleaseCandidate phase to `0020`–`0021`; the proposed release-candidate hardening in the #353 branch extends this fixed range to `0020`–`0023`, validates the exact ordered journal prefix, and rejects future journal entries. It does not create the missing private-source policies. Before that phase is ever run, a human must verify the three exact owner-scoped policies for `listing-photo-originals`; migration `0022` independently fails closed if they are absent. A production migration plan and explicit Jaap authorization are still required.

### Shared rate-limit target verification

On 3 November, the protected production runtime check returned `database: pass` and `clientIpHeader: pass`. This verifies the production application's configured PostgreSQL role can perform the bounded zero-row access check on `private.rate_limit_buckets`, and that the Cloudflare `CF-Connecting-IP` header reaches the validator. The temporary token was removed, production was restored to its baseline commit, and diagnostic source was removed through PR #328. This was not an end-to-end 429/threshold test and did not enable the limiter. Keep `SHARED_RATE_LIMITS_ENABLED=false` until a separate activation decision.

### Release boundary

Do not treat this checkpoint as approval to deploy, apply migrations, change provider settings, expand the allowlist, enable public signup or activate messaging. Production remains invite-only; `MESSAGING_ENABLED=false`; `SHARED_RATE_LIMITS_ENABLED=false`. The 13-person figure is capacity preparation only, not proof of 13 production allowlist entries or authorization to invite them.
