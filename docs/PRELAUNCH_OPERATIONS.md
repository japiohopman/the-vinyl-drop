# Pre-Launch Operations Strategy

This document outlines the operational decisions, infrastructure choices, policies, and readiness gates that must be established prior to opening The Vinyl Drop to a public or real-money audience.

*Note on infrastructure providers: Specific service names mentioned below (e.g. Render, Vercel, Stripe, Resend, Postmark, Sentry) are candidate evaluation options only and do not constitute binding architectural decisions.*

---

## 1. Environment Strategy

A multi-environment configuration strategy is required to isolate development, testing, and production data:

- **Local Development:** Developers run local Express server instances backed by environment variables (`.env`). Database migrations are verified against in-memory PostgreSQL (`@electric-sql/pglite`) and local or dev Supabase instances.
- **Staging / Preview Environment:** Dedicated beta environment (`https://the-vinyl-drop-staging.onrender.com`) deployed via Render (`render.yaml`). Backed by an isolated staging Supabase project (database, auth, and `listing-photos` storage bucket) seeded via `npm run db:seed:staging`. See full details in [STAGING_BETA_DEPLOYMENT.md](./STAGING_BETA_DEPLOYMENT.md).
- **Production Environment:** Hardened production runtime environment backed by a dedicated production Supabase project with production SSL certificates, connection pooling, and strict secret management.

---

## 2. Closed Alpha & Beta Onboarding

To manage initial user growth and ensure marketplace quality before public launch:

- **Closed Alpha Phase:** Invite-only access restricted to local Amsterdam community record collectors and sellers. Used to validate listing creation, image upload performance, and search usability.
- **Invite & Verification Flow:** Prospective sellers apply for an invite or receive an invite token. Account registration requires email verification before publishing listings.
- **Closed Beta Phase:** Expanded regional rollout across select neighborhood communities.

---

## 3. Customer Support & Complaints Handling

Operational channels for handling user inquiries and marketplace disputes:

- **Support Contact Channel:** Official support email (`support@thevinyldrop.com` or candidate desk software) for account, technical, or community inquiries.
- **Marketplace Dispute Boundary:** Because initial marketplace transactions occur directly between buyers and sellers locally, the platform acts as an information directory rather than a payment escrow agent. Clear terms must communicate the platform's non-involvement in cash handling or local meetup disputes.
- **Code of Conduct:** Explicit community guidelines governing accurate condition grading, fair trading, and respectful communication.

---

## 4. Transactional Email Strategy

System events requiring reliable transactional email delivery:

- **Core Operational Emails:** Account email verification, password reset links, security alerts, and comment notification digests.
- **Candidate Email Providers:** Resend, Postmark, or SendGrid.
- **Template & Domain Verification:** Domain authentication (DKIM, SPF, DMARC) configured for production sending domains.

---

## 5. Hosting & Runtime Execution

The application is a Node.js / Express server-rendered web app (`dist/server.js`).

- **Runtime Environment:** Containerized Node.js (v22 LTS) execution environment with process management (PM2 or container orchestrator).
- **Candidate Hosting Platforms:** Render, Fly.io, Railway, AWS ECS, or Vercel.
- **Auto-scaling & Health Monitoring:** HTTP `/health` check polling configured for automated restart on failure.

---

## 6. Infrastructure Responsibilities (PostgreSQL / Auth / Storage)

Supabase managed services tiering and responsibilities:

- **PostgreSQL Database:** Production tier with Supabase connection pooling (PgBouncer/Supavisor) to support concurrent Express database client connections.
- **Supabase Auth:** Enterprise or Pro tier configuring custom SMTP, OAuth credentials, and cookie session security limits.
- **Supabase Storage:** `listing-photos` bucket configured with CDN caching headers, image delivery optimization, and storage quota limits.

---

## 7. Payments & Payout Model (Future Real-Money Operations)

If online payments or automated checkout are evaluated for future phases beyond local P2P arrangements:

- **Candidate Payment Provider:** Stripe Connect (Express or Custom onboarding) for buyer card processing and automated seller payouts.
- **Fee Structure & Taxes:** Application fee collection, VAT calculation, tax invoice generation, and local regulatory compliance.
- **Escrow & Refund Liability:** Defining buyer protection policies, dispute handling, chargeback liabilities, and seller payout holding periods.

---

## 8. Shipping & Fulfillment Boundaries

- **Default Operational Model:** Local pickup and meetups in designated public neighborhood spots (e.g. local record stores or community spaces).
- **Future Shipping Option:** Optional seller-arranged shipping with tracking numbers. Platform liability boundaries must explicitly state that physical item damage during transit is the seller's/carrier's responsibility.

---

## 9. Moderation & Content Enforcement

Operational procedures for maintaining catalog and community safety:

- **Proactive Image Inspection:** Server-side Sharp processing strips EXIF metadata and verifies image integrity.
- **Reactive Content Reporting:** Triage workflows for user reports regarding fraudulent listings, incorrect condition grades, offensive comments, or copyright infringement.
- **Takedown Procedure:** Takedown runbook for archiving non-compliant listings or disabling policy-violating user profiles.

---

## 10. Disaster Recovery & Backups

- **Database Backups:** Automated daily PostgreSQL logical backups and Supabase Point-in-Time Recovery (PITR) enabled in production.
- **Storage Redundancy:** Object storage cross-region backup policies for uploaded listing photography.
- **Disaster Recovery Runbook:** Documented procedure for restoring database snapshots and executing Drizzle migrations on a clean database instance.

---

## 11. Observability, Logging & Alerting

- **Error Monitoring:** Candidate integration with Sentry or Datadog for catching uncaught Express controller errors and client-side error spikes.
- **Structured Server Logs:** JSON server logging capturing HTTP status codes, request latency, and database query errors without logging sensitive session tokens or personal data.
- **Uptime Monitoring:** External uptime checks (Pingdom, Better Stack, or UptimeRobot) pinging `GET /health`.

---

## 12. Pre-Launch Readiness Gates

Before promoting the platform to production launch, all pre-launch gates must pass:

1. **Security & Penetration Audit:** Independent security audit verifying Auth cookie security, CSRF same-origin enforcement, file upload isolation, and SQL injection safety.
2. **Accessibility Audit:** Automated (`npm run test:a11y` checking WCAG 2.1 AA rules) and manual screen reader testing across phone and desktop viewports.
3. **Load & Stress Testing:** Performance benchmarking verifying response times under simulated concurrent browse, search, and upload traffic.
4. **Legal & Compliance Gate:** Published Terms of Service, Privacy Policy, Cookie Policy, and Community Guidelines compliant with local GDPR regulations.
