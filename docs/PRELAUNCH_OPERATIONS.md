# Pre-Launch Operations Strategy

This document describes the deployed operating model and the operational boundaries that remain important before broader release. Current pass/fail status belongs in the governing GitHub Issues, especially [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278), [#279](https://github.com/japiohopman/the-vinyl-drop/issues/279), [#280](https://github.com/japiohopman/the-vinyl-drop/issues/280), [#281](https://github.com/japiohopman/the-vinyl-drop/issues/281) and [#89](https://github.com/japiohopman/the-vinyl-drop/issues/89).

The application is a free, server-rendered community marketplace. Current transactions are arranged directly between members; the application does not process payments, provide escrow or arrange shipping. Do not treat future payment, shipping or moderation concepts below as implemented features.

## 1. Deployed environment architecture

- **Local development:** Node.js / TypeScript / Express with environment-specific configuration. Use the isolated PGlite verification path for migration tests; it does not prove the state of a remote database.
- **Staging:** A dedicated Render Free web service in Frankfurt backed by a separate Supabase Free project in `eu-west-1`. Render auto-deploys commits to `main`. Staging data, Auth and Storage are separate from production.
- **Production:** A separate Render Free web service backed by a separate Supabase Free project in `eu-west-1`. The canonical public origin is `https://thevinyldrop.nl`; `www.thevinyldrop.nl` redirects to the apex. Production Render Auto-Deploy is off; deployment is a deliberate manual release action, not an automatic consequence of merging to `main`.
- **Cost and availability:** Both environments currently use Free services. Free-plan cold starts, quotas and limited backup/recovery controls are accepted constraints, not an uptime or recovery guarantee. Paid upgrades require a measured need and Jaap's explicit approval.

Keep environment secrets in their provider dashboards or approved local secret store. Never copy values into repository files, Issues, PRs, screenshots or logs.

## 2. Access, beta and public-release boundaries

Account creation is controlled by the application's beta allowlist and separate Supabase Auth provider settings. Source defaults do not prove hosted environment values.

The approved preparation capacity is up to 13 manually invited testers. This is not confirmation that all 13 are allowlisted or authorization to widen the live cohort. The active cohort remains limited to five until registration, privacy, OAuth and anti-abuse gates are complete and Jaap approves the increase. General public registration remains closed until the separate release decision.

The application requires the registration eligibility, age attestation and Terms acceptance flow. Email/password signup also uses the application-side leaked-password check and the Supabase Before User Created approval hook. The native Supabase leaked-password-protection warning is separate; do not claim that the application hook clears the provider warning.

## 3. Support, complaints and marketplace boundaries

The current public support routes are the Contact page (`/contact`, including its web form) and the published operator email in the live Contact/Terms/Privacy pages. Contact messages are handed to the configured email provider for delivery; the application does not provide a self-service support-ticket history.

Reports and requests are handled manually. Do not claim an automated moderation queue, in-app report workflow, appeal portal, response SLA or legal certification unless a separately verified implementation establishes it. Marketplace transactions are arranged directly between buyers and sellers; The Vinyl Drop does not hold funds or resolve payment/collection disputes.

## 4. Email and external providers

- Supabase Auth handles identity, email confirmation and password recovery through the configured Auth email-delivery setup.
- The Contact form uses the configured Resend delivery path.
- Google OAuth must be configured and verified separately for each Supabase environment; staging configuration is not proof of production OAuth readiness.
- Discogs and MusicBrainz are catalogue enrichment sources. Their returned metadata is not the canonical application record.
- YouTube previews use the privacy-enhanced player only after an explicit visitor action.

Provider delivery, OAuth, retention and plan-specific settings must be verified per environment. Do not infer successful email delivery or provider configuration from the presence of a template or environment-variable name.

## 5. Hosting, database, Auth and Storage

The deployed application is a Node.js / Express server-rendered process (`dist/server.js`) hosted on Render. `GET /health` is a process-health endpoint; `status: ok` does not prove database, Auth or Storage availability.

Supabase provides separate PostgreSQL, Auth and Storage projects for staging and production. Drizzle migrations in `drizzle/` are the application's schema history. Use the repository migration runner and target-specific preflight; do not confuse PGlite/CI verification with a remote database migration.

Listing photographs are seller-owned Storage objects referenced by `listing_photos`. The `listing-photos` bucket has a 5 MiB per-file limit and accepts WebP, JPEG and PNG. Upload processing validates image content, converts to WebP, resizes and strips EXIF metadata. Four seller-scoped Storage object policies protect create/update/delete/read behavior. Release catalogue artwork is stored as release metadata and is not a seller-uploaded photo object.

Messaging routes and UI exist in source but remain disabled by `MESSAGING_ENABLED=false`. Shared request rate limits use a private PostgreSQL bucket table and are fail-closed when enabled; keep `SHARED_RATE_LIMITS_ENABLED=false` until the exact target's application database-role and client-IP behavior is verified and Jaap separately authorizes activation.

## 6. Payments, shipping and future operations

There is no payment provider, checkout, seller payout, escrow or automated refund flow in the current product. Do not add payment fees, tax invoices, chargeback or payout language to current user-facing copy as though these capabilities exist.

The current arrangement is direct buyer/seller coordination. Shipping is not a platform-managed fulfillment feature. Any future payment or shipping design needs a separate approved Issue, provider/legal assessment and explicit owner decision.

## 7. Backups, recovery and observability

The selected Free plans have limited backup and recovery capabilities. Do not state that automated daily logical backups, Supabase PITR, cross-region Storage backups or a tested restore procedure are enabled unless current provider evidence proves each one. Current backup and recovery readiness is tracked in [Issue #278](https://github.com/japiohopman/the-vinyl-drop/issues/278).

`GET /health` provides a lightweight process-health response. It is not a database health probe, uptime-monitoring subscription or alerting system. Do not document Sentry, Datadog, Pingdom or another external monitoring service as installed unless separately verified.

## 8. Release-readiness workstreams

The current release gates and their exact evidence live in GitHub:

1. [#278 — production infrastructure and application verification](https://github.com/japiohopman/the-vinyl-drop/issues/278)
2. [#279 — safe public registration and abuse prevention](https://github.com/japiohopman/the-vinyl-drop/issues/279)
3. [#280 — privacy, legal scope, operator disclosure and complaint handling](https://github.com/japiohopman/the-vinyl-drop/issues/280)
4. [#281 — production Google OAuth setup and verification](https://github.com/japiohopman/the-vinyl-drop/issues/281)
5. [#89 — shared rate-limit production target verification and activation decision](https://github.com/japiohopman/the-vinyl-drop/issues/89)
6. [#52 — first-party PWA installation and sharing acceptance](https://github.com/japiohopman/the-vinyl-drop/issues/52)

Do not open public registration, widen the beta cohort, enable messaging/rate limits, change provider settings, deploy production or incur paid spend as a documentation task. Those actions require the governing Issue and the relevant explicit owner authorization.
