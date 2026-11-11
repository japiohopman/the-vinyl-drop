# Production Deployment — The Vinyl Drop

**Governing Issue:** [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278)  
**Status:** Production remains live on the separate Render/Supabase environment at the canonical apex domain and on approved PR #286 application runtime `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`; Auto-Deploy remains off. Production database migrations are verified through `0023` (24 Drizzle ledger entries). The 11 November read-only comparison confirms staging has all 26 migration entries through `0025`, including the repaired `0020`, profile columns from `0024` and style columns from `0025`; production does not yet have `0024` or `0025`. Both environments still lack the separate `profile-avatars` Storage bucket and its two owner-scoped policies. Issue [#401](https://github.com/japiohopman/the-vinyl-drop/issues/401) is preparing a separately pinned production runner phase for `0024`–`0025`; no production migration, Storage provisioning or application deployment is authorized or performed by that source work. Section 11 records the current migration-parity evidence and rollout boundary. Public release still requires the separate release-candidate audit, authenticated DB/Storage smoke coverage, provider-level signup state, dependency-audit triage, backup/recovery readiness, privacy/legal decisions and Jaap's final application-deployment approval.  
**Last checked:** 11 November 2026.

## 1. Owner-approved target and safety boundaries

The approved canonical public origin is **`https://thevinyldrop.nl`**. A read-only browser check on 2 November confirmed that the apex site loads and `https://www.thevinyldrop.nl/` redirects to the apex canonical URL. This is an HTTP/browser routing check, not a complete DNS, certificate-chain or provider configuration audit.

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
- All repository Drizzle migrations `0000`–`0023` are applied with the controlled repository runner.
- `drizzle.__drizzle_migrations` contains exactly 24 sequential rows (IDs 1–24), without gaps or duplicates. The stored hashes for migrations 0020–0023 match the checked-in SQL files using Windows CRLF line endings, as used by the local migration environment.
- Migrations 0020–0023 were successfully applied on 5 November and independently verified read-only. Migration 0020 installed `pg_trgm` 1.6 in `extensions` and all three artist/title/label GIN trigram indexes. Migration 0021 added `country_code`, `canonical_genres`, `format_characteristics`, the country-code CHECK constraint and the expected indexes. Migration 0022 added `source_storage_path`, `source_is_legacy`, `editor_state` and the partial unique source-path index. Migration 0023 changed the existing Before User Created hook function to deny first-time Google identities while retaining the one-use email/password approval requirement.
- All 12 public application tables and all three private tables have RLS enabled.
- The public `listing-photos` bucket is present with a 5 MiB limit and allowed MIME types `image/webp`, `image/jpeg`, and `image/png`.
- Exactly seven Storage object policies exist and pass the shared exact production validator: four existing `listing-photos` policies and three authenticated seller-owner policies for `listing-photo-originals`. The private originals bucket remains private and `storage.objects` RLS is enabled.
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

The apex custom domain `https://thevinyldrop.nl` is attached with SSL. The `www` host was checked on 2 November and redirects to the apex URL. The `onrender.com` hostname remains the underlying Render service hostname. Auto-Deploy is intentionally disabled so a later push to `main` does not silently deploy to production; future deployments require an explicit manual action. Staging remains on `4102103623c1da85e7aec804fa95c4c7da54748e` from its 4 November manual deployment; `main` has since advanced to `b39fa74bba0b12f1987d03fb80b0203221fcf7ed` through PR #354 (migration-runner, tests and documentation only). Production remains on PR #286 commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`. GitHub's comparison reports 538 commits and 227 changed files between current `main` and production; this is a broad integrated feature delta, not a small hotfix.

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

Production currently runs commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`; staging remains on `4102103623c1da85e7aec804fa95c4c7da54748e`; current `main` is `b39fa74bba0b12f1987d03fb80b0203221fcf7ed` after PR #354. The current `main`/production delta is 538 commits and 227 changed files. No dependency or devDependency version changed in `package.json`, and the `package-lock.json` Git blob is unchanged from the production baseline. The Render Blueprint diff is comment-only; production remains manually managed with Auto-Deploy off.

### Pending migrations

- **0021 — required before deploying current `main`.** Adds the three release-metadata columns referenced by the current Drizzle schema and release service. It is additive, uses empty-array defaults, preserves existing raw fields and does not backfill/rewrite existing release rows.
- **0020 — required for full fuzzy catalogue suggestions, but not for basic startup.** Installs `pg_trgm` in the non-public `extensions` schema and creates artist/title/label GIN indexes. The catalogue-suggestions repository detects a missing extension/operator and falls back to normalized exact/prefix/contains matching. The extension is available in the production PostgreSQL installation (version 1.6) but was not installed at the 3 November read-only check.

Migration 0021 was applied directly to staging through Supabase on 2 November. The staging Drizzle ledger was not reconciled with that direct migration history. Do **not** run the general `npm run db:migrate` command against staging until this is reconciled; PR #321 records this operational warning. Production has neither migration 0020 nor 0021 applied. Do not run the existing broad production migration helper or deploy current `main` until a pinned 0020/0021 plan has been reviewed and Jaap separately authorizes execution.

### Shared rate-limit target verification

On 3 November, the protected production runtime check returned `database: pass` and `clientIpHeader: pass`. This verifies the production application's configured PostgreSQL role can perform the bounded zero-row access check on `private.rate_limit_buckets`, and that the Cloudflare `CF-Connecting-IP` header reaches the validator. The temporary token was removed, production was restored to its baseline commit, and diagnostic source was removed through PR #328. This was not an end-to-end 429/threshold test and did not enable the limiter. Keep `SHARED_RATE_LIMITS_ENABLED=false` until a separate activation decision.

### Release boundary

Do not treat this checkpoint as approval to deploy, apply migrations, change provider settings, expand the allowlist, enable public signup or activate messaging. Production remains invite-only; `MESSAGING_ENABLED=false`; `SHARED_RATE_LIMITS_ENABLED=false`. The 13-person figure is capacity preparation only, not proof of 13 production allowlist entries or authorization to invite them.


## 9. Controlled 13-tester release candidate — historical preparation checkpoint, 4 November 2026

This is the historical 4 November pre-migration checkpoint. Its statements about the migration ledger and pending policies are superseded by the successful 5 November run and verification in section 10. It did not authorize or perform an application deployment, allowlist edit or invitation.

### Current service revisions

- Production Render is still Live on PR #286 commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`, Auto-Deploy off.
- Staging Render is Live on `4102103623c1da85e7aec804fa95c4c7da54748e` after its manual 4 November deployment; `main` has since advanced to `b39fa74bba0b12f1987d03fb80b0203221fcf7ed` through PR #354. That PR changes migration tooling/tests/docs only, not the deployed application runtime. No production service or setting was changed.
- The staging application revision's CI [41867838942](https://github.com/japiohopman/the-vinyl-drop/actions/runs/41867838942) passed; post-merge `main` CI for PR #354 merge commit [41885145489](https://github.com/japiohopman/the-vinyl-drop/actions/runs/41885145489) also passed Linux build/test and Windows preflight. The ChatGPT Review Relay [41886282244](https://github.com/japiohopman/the-vinyl-drop/actions/runs/41886282244) passed.
- Production's Drizzle ledger contains exactly 20 entries, IDs 1–20, through migration 0019. The 20 stored hashes and `created_at` timestamps match the repository's historical journal through that point.
- Staging's Drizzle ledger is not a clean mirror of the current journal: it has 23 rows with IDs 1–13 and 15–24 (ID 14 is absent), and several hashes differ from the current journal. Its live schema does contain the current release metadata and listing-photo source columns and the three private source policies. **Do not run a general Drizzle migration command against staging or use its ledger as proof of production migration parity.** The staging database was inspected read-only.

### Production schema and Storage facts

- Production `public.releases` does not yet contain `country_code`, `canonical_genres` or `format_characteristics`; migration 0021 adds them.
- Production `public.listing_photos` does not yet contain `source_storage_path`, `source_is_legacy` or `editor_state`; migration 0022 adds them.
- The private `listing-photo-originals` bucket already exists in production, is private, and has a 20 MiB upload limit. It currently has **none** of the three required authenticated seller-owner Storage object policies. Production's existing four `listing-photos` policies are present and remain unchanged.
- The controlled ReleaseCandidate runner will perform an independent read-only Storage preflight before asking for the migration confirmation or starting Drizzle. It requires exactly seven `storage.objects` policies: the four existing `listing-photos` policies plus the three authenticated seller-owner `listing-photo-originals` policies. It checks each policy's normalized full `USING`/`WITH CHECK` predicate, command, role and permissive mode, and rejects any missing, changed or additional policy. The read-only check runs both before the typed confirmation and immediately before Drizzle starts. Migration 0022's historical SQL guard remains supplementary; its substring checks alone are not treated as the complete policy-set guarantee. Do not weaken or replace the four existing public-display photo policies.
- Production does not yet have the pg_trgm extension installed in the `extensions` schema or the migration 0020 trigram indexes. The current catalogue-search implementation has a normalized-search fallback, but migration 0020 is part of the pinned release-candidate range for full fuzzy suggestions.
- Migration 0023 replaces the existing private `enforce_password_checked_signup(jsonb)` function so a first-time Google Auth identity is denied before creation. The production Before User Created hook is owner-confirmed attached to this function; the migration does not change the provider's hook selection. Existing verified-email Google sign-in is expected to keep working for already registered members, but production Google OAuth remains unconfigured/unverified under #281 and is not a supported tester onboarding path for this release.

### Pinned production migration range

The production migration runner selects exactly **0020–0023**, after the verified 0000–0019 baseline. It validates the journal prefix through index 23 and strict timestamps before requesting database credentials; index 24 and later remain outside the selected range. PowerShell regressions reject replaced entries at indexes 21, 22 and 23.

Before any separately authorized production execution:
1. Confirm the production target identity and pinned migration file hashes using the repository preflight.
2. Provision the three authenticated seller-owner policies for the existing private `listing-photo-originals` bucket, then run the controlled runner's read-only preflight. It must verify the exact seven-policy set (including the four existing `listing-photos` policies), full predicates, roles, commands and permissive mode, with no additional policies. Do not grant public access or alter the existing `listing-photos` policies.
3. Review the effect of migration 0023 on the owner-confirmed Before User Created hook and retain the existing application HIBP / one-use signup approval requirement.
4. Apply only the typed, reviewed ReleaseCandidate phase (0020–0023), then independently verify all 24 Drizzle journal entries, RLS/grants, trigram extension/indexes, release columns, private-source policies and the hook function definition.
5. Only after verified migration state may a separate owner-approved application deploy be considered.

No migration, Storage policy, Auth setting, environment variable, allowlist address, user, listing or production object was changed for this checkpoint.


## 10. Production ReleaseCandidate migration and Session Pooler verification — 5 November 2026

### Migration execution

Jaap ran the approved Windows command from the repository root after updating `main`:

```powershell
git pull origin main
.\run-production-migrations.ps1 -Phase ReleaseCandidate
```

The target preflight passed for production project `anxhmlalxjvatrufcjei` and the approved Shared Session Pooler host. The Storage preflight passed twice, including immediately before Drizzle started. Drizzle reported `[✓] migrations applied successfully!` and the runner confirmed that only migrations 0020–0023 were selected. No later journal entry was selected.

### Independent read-only verification

- Exactly 24 Drizzle ledger rows exist, IDs 1–24, with no gaps or duplicates.
- Stored hashes for 0020–0023 match the checked-in SQL source using Windows CRLF line endings.
- `pg_trgm` version 1.6 is installed in the `extensions` schema; the artist, title and label trigram GIN indexes exist.
- Release metadata columns, country-code CHECK constraint and the three metadata indexes exist.
- Listing-photo source/editor columns and the partial unique source-path index exist.
- The private `listing-photo-originals` bucket remains private; Storage RLS is enabled and all seven policies match the exact reviewed policy contract.
- The production Before User Created function now returns HTTP 403 for first-time Google identity creation, for email signup without a valid one-use password-check approval, and for unsupported providers. The function remains SECURITY INVOKER with an empty search path; required `supabase_auth_admin` execution and table/column privileges were checked. No test account or signup was created during these checks.
- The `drizzle.__drizzle_migrations` table has RLS disabled, but the `drizzle` schema and ledger table are not accessible to either `anon` or `authenticated`; both roles have no schema USAGE and no table SELECT/UPDATE grants. The Supabase linter flag is therefore not currently an exposed Data API path. Do not add a policy or grant as part of this release without a separate review.

### Application deployment boundary

Production Render remains Live on PR #286 commit `6c5feb809ffd6c71ad26d44fbd1f041c77e4069d`, with Auto-Deploy off. Production DB migrations are current through 0023, but the application has **not** been deployed to the new `main` revision. A separate exact-commit release-candidate audit, staging acceptance and Jaap's explicit application deployment approval are required before any Render deploy. The migration authorization did not authorize an application deployment, allowlist edit, invitations, account creation, rate-limit activation, messaging activation or opening public signup.

### Session Pooler quota incident — owner-confirmed resolved 5 November 2026

The 99.8% Session Pooler usage reading from 28 October was caused by an application bug: profile requests unnecessarily issued repeated profile-row updates even when no profile data had changed. Jaap confirms that this redundant write path was fixed on 4 November. Treat the 28 October figure as historical consumption from the now-fixed bug, not an ongoing application behavior or an unresolved release blocker. The Supabase banner may continue to refer to the previous billing cycle until its usage/billing window updates. Do not recommend a paid upgrade on the basis of that historical reading alone; check a fresh usage window after the fix before drawing conclusions about ongoing consumption.

## Profile media follow-up — Issue #351

The application implementation for device-uploaded profile avatars (static JPEG/PNG/WebP converted to WebP, animated GIF retained) and optional SoundCloud/Mixcloud profile links was merged in PR #375. Migration `0024_profile_avatars_and_music_links` is present in staging and is **not applied to production**.

The 11 November read-only audit confirms that neither staging nor production currently has the dedicated `profile-avatars` Storage bucket. Both environments retain the seven pre-existing listing-photo/private-source policies; the two avatar owner-scoped INSERT/DELETE policies are absent. Do not change those seven existing policies.

Before deploying the #351 application revision to either environment, separately create the dedicated public-read `profile-avatars` bucket (5 MiB; processed output types `image/webp` and `image/gif`) and provision exactly the two authenticated owner-scoped INSERT/DELETE policies documented in [the provisioning checklist](./verification/profile-avatar-storage-provisioning.md) and [the SQL policy file](./verification/profile-avatar-storage-policies.sql). The bucket's public setting provides avatar reads; writes/deletes remain restricted to `profiles/<auth-user-uuid>/...`.

Schema migration, Storage provisioning and application deployment remain separate approval steps. The production migration runner must never create the bucket, add Storage policies, deploy the application or change any live setting.


## 11. Migration parity checkpoint — 11 November 2026

A fresh read-only SQL audit was run against both explicitly identified Supabase projects. The audit queried the Drizzle ledger timestamps, the `pg_trgm` extension and indexes, the schema columns introduced by 0024/0025, the `profile-avatars` bucket and Storage policy names. It performed no writes.

### Staging — project `xuhzhdjmgvqzjxijmksu`

- The Drizzle ledger contains 26 rows through migration index 25.
- Migration 0020 was repaired on 11 November by the explicit staging-only tool added in PR #399. The tool reported that schema objects and the Drizzle ledger record were repaired and verified in one transaction. Its subsequent audit returned no pending extension, indexes or ledger entry and no validation reasons.
- `pg_trgm` is present in the `extensions` schema; all three artist/title/label trigram indexes are valid.
- Migration 0024 profile columns (`avatar_storage_path`, `soundcloud_url`, `mixcloud_url`) are present.
- Migration 0025 style columns (`styles`, `canonical_styles`) are present.
- The `profile-avatars` bucket and its two owner policies are absent.

### Production — project `anxhmlalxjvatrufcjei`

- The Drizzle ledger contains 24 rows through migration index 23.
- `pg_trgm` is present in the `extensions` schema; all three artist/title/label trigram indexes are valid.
- Migration 0024 profile columns and migration 0025 style columns are absent.
- The `profile-avatars` bucket and its two owner policies are absent.

### Rollout boundary

- The existing production migration phases remain pinned to 0000–0005, 0006–0019 and 0020–0023. A new phase must select exactly 0024–0025 and must not select a later migration.
- Issue [#401](https://github.com/japiohopman/the-vinyl-drop/issues/401) adds source tooling and regression coverage for that bounded phase. It first checks the production target and then validates that the live production Drizzle ledger contains exactly the 24 expected journal timestamps through 0023; that read-only check is repeated immediately before Drizzle starts.
- The new phase is schema-only. It does not provision `profile-avatars`, modify Storage policies, Auth settings, feature flags or Render, and it does not deploy the app.
- Any production execution still requires a separate, explicit owner authorization and independent post-migration verification. The #351 avatar feature must not be deployed to an environment until its dedicated bucket settings and exact two owner-scoped policies are separately provisioned and verified.
- Future Special Pressing / Non-Music schema work under #296 is a later migration, not part of 0024–0025. Issue #299 is a UI tutorial and has no current database migration requirement.
