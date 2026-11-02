# Pre-Launch Operations

This document records durable operating boundaries for The Vinyl Drop. It is not a live checklist: current completion status, evidence and owner decisions belong in the linked GitHub Issues, especially [#282 — release tracker](https://github.com/japiohopman/the-vinyl-drop/issues/282).

**Last reconciled:** 2 November 2026.

## 1. Product and transaction model

The Vinyl Drop is a local community marketplace for physical vinyl. Buyers and sellers discover records and arrange any purchase, trade, payment and collection directly with one another.

The application does not currently provide online checkout, payment processing, seller payouts, escrow, shipping labels, carrier booking, fulfilment, automated dispute adjudication or an administrative moderation console. It also does not operate a public waitlist or marketing newsletter.

## 2. Environments and deployment boundaries

Staging and production are separate Render services backed by separate Supabase projects. Treat them as independent environments with separate Auth identities, database state, Storage objects and secrets.

| Environment | Current operating model |
| --- | --- |
| Local / CI | Node.js + TypeScript application; tests and migration verification run in isolated environments |
| Staging | Render staging service with its own Supabase project; merges to `main` auto-deploy here |
| Production | Separate Render service and Supabase project; Render Auto-Deploy is off; production deployments require a separate manual owner decision |

The official production origin is `https://thevinyldrop.nl`; `www.thevinyldrop.nl` redirects to the non-www canonical origin. The staging origin is `https://the-vinyl-drop-staging.onrender.com`.

See [STAGING_BETA_DEPLOYMENT.md](./STAGING_BETA_DEPLOYMENT.md) and [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for environment-specific procedures. A green CI run, staging deploy or successful `/health` response does not prove that production DB, Auth, Storage or user journeys are fully verified.

## 3. Cost and availability constraints

Staging and production currently use Free-tier Render and Supabase resources. Free services may sleep or cold-start, have finite quotas and do not provide a production availability SLA. The production Free environment does not provide a tested automated disaster-recovery guarantee; manual export and Storage-backup procedures and a restore exercise remain release concerns.

The target is to avoid additional recurring platform spend. Do not upgrade a plan, add a paid service or enable a paid external integration without a current cost/benefit check and Jaap's explicit approval.

## 4. Authentication, registration and abuse prevention

The current operating boundary is a private, invite-only beta for adults. The application and provider-level signup controls are separate. Do not treat a publicly reachable `/auth/signup` page as permission to register: private-beta checks and Supabase Auth controls remain part of the access boundary.

The password-safety flow uses an application-side Have I Been Pwned range check and a Supabase Before User Created approval hook for email/password registration. The native Supabase leaked-password protection warning is a separate provider capability and is not available on the current Free plan; the application check must not be represented as the native feature.

The shared PostgreSQL rate limiter is implemented and its controlled staging runtime probe passed on 2 November 2026 (`database: pass`, `clientIpHeader: pass`). Its temporary diagnostic endpoint/token were removed. Production application's own database-role and client-IP runtime proof remains tracked in [#89](https://github.com/japiohopman/the-vinyl-drop/issues/89).

Keep these controls unchanged until the applicable Issues are complete and Jaap authorizes a change:
- `BETA_INVITE_ONLY_ENABLED=true`;
- `SHARED_RATE_LIMITS_ENABLED=false`;
- `MESSAGING_ENABLED=false`.

Preparation for a cohort capacity of up to 13 people is not confirmation that 13 people are on the live production allowlist. It does not authorize widening the current cohort or opening public registration. See [#279](https://github.com/japiohopman/the-vinyl-drop/issues/279), [#89](https://github.com/japiohopman/the-vinyl-drop/issues/89) and [#282](https://github.com/japiohopman/the-vinyl-drop/issues/282).

## 5. Support, complaints and moderation

The public [Contact page](https://thevinyldrop.nl/contact) is the supported channel for account questions, technical feedback, listing concerns, complaints and privacy requests. Its displayed contact details are authoritative; do not invent a separate `support@` address or external ticketing provider.

Reports and privacy requests are handled manually by the operator. The current product does not provide an automated moderation queue, per-listing/profile in-app reporting workflow or automated moderation appeals. Keep incident notes minimal and access-controlled. Never put raw IP addresses, passwords, tokens, recovery URLs or private message contents in public Issues/PRs.

## 6. Email and external providers

Supabase Auth handles credentials and account/session lifecycle. Production authentication email, recovery and Google sign-in have owner-reported smoke evidence; production Google OAuth still has its own verification gate in [#281](https://github.com/japiohopman/the-vinyl-drop/issues/281).

Use only providers and credentials approved for the relevant environment. A staging sender/domain check is not proof of production email delivery. Never copy provider credentials, OAuth secrets, database URLs or SMTP passwords into repository files, Issues, PRs or logs.

Optional external services are called only when the corresponding feature is used. Discogs receives catalogue lookup terms when a user requests a lookup; the privacy-enhanced YouTube player loads only after a visitor activates a preview. See [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md).

## 7. Data handling, uploads and recovery

Listing photos are seller-owned physical-copy images stored through Supabase Storage. The upload pipeline enforces file/count limits, validates and processes images with Sharp, strips EXIF metadata and records role/order in the database. Release catalogue artwork remains release metadata and is not copied into seller photo storage.

Do not promise automatic deletion, a complete export/erasure feature, provider-side log expiry, point-in-time recovery or a tested full restore unless the relevant implementation/provider evidence exists. Account/privacy requests are currently handled manually; see [BETA_PRIVACY_OPERATIONS.md](./BETA_PRIVACY_OPERATIONS.md).

A production manual database export and a separate Storage-object backup/restore rehearsal remain readiness items under [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278). Isolated PGlite migration tests do not substitute for a production backup or restore.

## 8. Monitoring and health checks

The application exposes `GET /health` as a process-level health response. A successful response confirms that the web process is responding; it does not prove database writes, Auth, Storage, mail delivery or end-to-end marketplace behavior. Render Free cold starts are expected.

Do not claim an external uptime-monitoring service, Sentry/Datadog integration, tested alert delivery or an established incident SLA unless those are separately configured and verified.

## 9. Public-launch gates

Current completion status and evidence are tracked in GitHub:
- [#278](https://github.com/japiohopman/the-vinyl-drop/issues/278) — production isolation, domain, DB/Storage, backup/recovery and production smoke matrix;
- [#279](https://github.com/japiohopman/the-vinyl-drop/issues/279) — safe public registration and abuse-prevention review;
- [#280](https://github.com/japiohopman/the-vinyl-drop/issues/280) — privacy/legal scope, public disclosures, operator and complaint readiness;
- [#281](https://github.com/japiohopman/the-vinyl-drop/issues/281) — separate production Google OAuth setup and verification;
- [#89](https://github.com/japiohopman/the-vinyl-drop/issues/89) — production shared-rate-limit runtime proof and any later owner-approved activation;
- [#52](https://github.com/japiohopman/the-vinyl-drop/issues/52) — PWA installation and sharing acceptance;
- [#282](https://github.com/japiohopman/the-vinyl-drop/issues/282) — final release decision and dependency reconciliation.

The site remains invite-only until those gates are assessed and Jaap explicitly authorizes any expansion. This document is not legal advice or an independent security audit.
