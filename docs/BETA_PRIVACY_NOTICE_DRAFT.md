# The Vinyl Drop — Privacy Notice Draft

**Status: internal publication copy for the first five-person pilot.** Jaap approved the purpose-specific working legal-basis policy and accepted baseline DSA-scope uncertainty for this bounded pilot on 21 October 2026. The text describes observed facts and marks provider-managed retention or configuration as unknown where the connected metadata cannot establish them; it does not claim independent legal certification, EU-only processing, automatic deletion, or a verified complete backup/restore. The staging contact-form delivery and deployed-browser/network/cookie checks are complete. The public page remains labelled for review until PR #162 is merged and the final page-copy change in PR #159 is merged by the owner.

**Source review:** 21 October 2026
**Operator:** Jaap Hopman, acting as a private individual
**Public privacy contact:** yepyouknowhim@gmail.com

Controller identity and public contact are recorded as Jaap Hopman, acting as a private individual, and yepyouknowhim@gmail.com. Do not invent a company or publish a residential address to fill a template. Separate business-website disclosure rules have not been treated as a settled requirement for this non-commercial pilot; seek specific advice only if greater certainty is desired or the operating model changes.

## What The Vinyl Drop does

The Vinyl Drop is a free, invite-only community website for vinyl collectors to publish and discover records offered for sale or trade. It does not process payments, provide escrow or arrange shipping. Buyer and seller arrange any transaction and collection/logistics themselves.

## Information handled

- **Account and sign-in:** email address, Supabase Auth identity, authentication/session state and security information. Supabase Auth handles password/OAuth authentication; application tables do not store plaintext passwords.
- **Profile:** username, display name, avatar URL, optional website, bio, coarse location and timestamps. Public profile fields rendered by the application may be visible to visitors. Location is intended to be city/neighbourhood level, not a street address.
- **Listings and catalog data:** release and catalogue details, format, physical-copy condition, price or trade indication, listing description/status and timestamps.
- **Listing photos:** processed image bytes, Storage paths, ordering and alt text. Supported uploads are converted to WebP, resized and stripped of EXIF metadata. Published listing photos use a public-read path; do not upload private or sensitive images.
- **Community data:** comments, favorites and activity events. Comments on visible listings are public. Favorites are private. Activity visibility depends on event type.
- **Registration audit:** Terms version, Terms acceptance timestamp, 18+ attestation timestamp and linked Auth user ID are stored in the restricted private registration-consent table. The table stores no date of birth or identity document and is configured to cascade-delete when the Auth identity is removed.
- **Operational and security information:** application/runtime logs, bounded error diagnostics and authentication cookies. Provider-side log retention has not been independently verified.
- **Password-safety check:** the application sends only a five-character SHA-1 hash prefix to the Have I Been Pwned range API and compares matching suffixes locally. It does not intentionally send the raw password or full hash to that service. The remaining direct-Auth bypass is tracked separately in Issue #118.

## Purposes and legal basis

Information supports authentication, profile/account maintenance, listing and photo management, publication of user-selected public content, search/discovery, community features, account/service security, troubleshooting and the new-password safety check.

**Owner-approved working policy — 21 October 2026.** Use GDPR Article 6(1)(b) for processing objectively necessary to provide the requested account/service or a feature the user asks for. Use Article 6(1)(f) for proportionate security/abuse prevention, limited diagnostics, minimal Terms/18+ audit evidence, the password-safety check and general contact enquiries, subject to the necessity/balancing safeguards in the internal register. Use Article 6(1)(b) for a contact message only where it requests pre-contract steps or requested service performance; use Article 6(1)(c) only where a specific legal obligation applies. Submitting a contact form is not blanket GDPR consent. This owner policy decision is not legal certification, and provider/technical facts still need verification.

## Visibility

Published listings and their photos, public comments, and the public profile fields rendered by the site can be seen by visitors. Favorites are not public. Activity events can be displayed according to their event type. Users should not place personal details they do not want to disclose in public profile fields, listings or comments.

## Providers and external requests

Source-visible providers include Supabase for Auth/PostgreSQL/Storage, Render for hosting/runtime, Discogs and/or MusicBrainz for catalog lookups, Have I Been Pwned for password-range checks, and Google as part of OAuth sign-in. Resend and Strato apply only to the mail/domain/DNS functions actually configured. Not every provider receives every category of data.

- **Supabase:** the project's core database/Auth/Storage region is Ireland (EU). Supabase states that account information, support access, usage telemetry/logs and some Storage content delivery may involve processing outside the selected region; its published DPA includes Standard Contractual Clauses for applicable transfers. Do not assume all processing stays in Ireland.
- **Render:** hosts the staging web service in Frankfurt. Render says log retention depends on workspace tier: Hobby 7 days, Pro 14 days, Scale/Enterprise 30 days. The exact workspace-level tier has not been confirmed, so no exact Render retention period is promised here.
- **Resend:** delivers contact-form messages to the operator's mailbox. The sending domain is verified and configured for the EU-West sending region, but Resend states stored customer data, including message content and delivery logs, is held in the United States. Resend states email/log data is retained for 30 days on Free/Pro/Scale plans and backups for 7 days; its published DPA describes transfer safeguards. An EU sending region does not mean EU-only storage.
- **Google/Gmail:** Google sign-in is used for OAuth, and the operator's receiving mailbox processes contact-form notifications. Google may therefore process sign-in and received-message data for those functions.
- **Strato:** used for domain/DNS functions; it is not the contact-form message-delivery path in the observed setup. Account-specific contract and retention terms have not been verified.
- **Catalog/password-check services:** Discogs and/or MusicBrainz receive catalog lookup data when invoked; Have I Been Pwned receives only the five-character password hash prefix for the range check. Not every provider receives every data category.
 
These provider details are based on current read-only project/account metadata available through the connected services and published vendor documentation. The exact Render workspace tier and account-specific Strato terms are not exposed by the available connection. The notice therefore gives Render's published retention range without selecting a tier, identifies Strato only for the configured domain/DNS functions, and does not claim EU-only processing, exact account-specific retention, or a verified backup/restore capability. These metadata limits are disclosed, not treated as indefinite research blockers for the five-person pilot.

## Cookies and fonts

The source configures essential HTTP-only authentication/session cookies for access, refresh, recovery and short-lived PKCE/auth-flow handling. During Google sign-up, tvd-registration-consent is a first-party signed, HTTP-only cookie (Secure on HTTPS/staging/production, SameSite=Lax) that carries the selected Terms version and Terms/18+ attestation timestamps through the OAuth round-trip; it expires after up to 10 minutes and is cleared by the callback. It does not grant account or beta access. The site also uses tvd-beta-welcome-seen as a first-party HTTP-only presentation marker for 180 days and tvd-beta-welcome as a 60-second HTTP-only display-only flash. Neither welcome cookie grants account or beta access.

The existing design font families are served from this site's own /fonts/ assets under the SIL Open Font License; the external Google Fonts links have been removed from the page layout. The owner-confirmed deployed browser/network/cookie review was completed and approved on 21 October 2026 (Issue #153 closed). It included the Google OAuth flow and external catalog-thumbnail requests during Discogs search; do not claim zero external requests. Provider processing and retention limits that are known are described below; plan-dependent or account-specific values that cannot be verified are stated as unknown. The owner explicitly deferred a full backup/export/restore test for this pilot in Issue #155.

### Messages sent through the Contact form

If you submit the form on /contact, the application receives your optional name, reply email address and message and sends them through the configured Resend API to the operator's mailbox so the operator can review and reply. The application does not store a support-message history in its database and does not intentionally log the message contents. Resend and the receiving email service process the message to deliver it and may retain it under their own service settings and terms. Do not include passwords, session tokens, account-recovery links, health information or other sensitive personal details. If the application cannot confirm that the email provider accepted the message for sending, it shows a failure message; the direct email address remains available. A staging end-to-end test on 21 October 2026 confirmed that one submitted test message was received by the operator inbox. This verifies that submission only; it does not guarantee future delivery or establish provider/mailbox retention. The overall privacy/legal review remains open.

## Retention and deletion

These are the current policy directions/targets, not claims that automated purging or all provider settings have been verified:

- **Active account/profile:** retained while the account is active; no automatic one-year expiry for an active account.
- **Archived listing data/photos:** target deletion 12 months after archive, except for a specific documented reason to retain particular data longer.
- **Drafts:** verify whether and where drafts persist before setting a retention period; no independent draft retention period is claimed here.
- **Comments, favorites and activity:** retained only while needed for service/community purposes. On a valid account-erasure request, remove or anonymise linked records where appropriate while respecting other users' rights and specific lawful security/retention needs.
- **Registration agreement audit:** minimum Terms-version and timestamp record is linked to Auth identity and is removed when that identity is erased.
- **Routine app/security logs:** approximately 30 days is the target policy period. Incident material may remain longer where necessary and documented. Actual provider log retention is unverified.
- **Privacy-request audit:** minimal, access-controlled record with a target maximum of 12 months after closure unless a specific documented need requires longer.
- **Provider-managed logs and backups:** retention is controlled by the respective provider and account/plan settings; the exact Render workspace tier is unavailable through service metadata. The application does not claim a fixed provider-side retention period or a verified complete restore path. A deletion request is handled manually across relevant application records and Storage objects; provider-held logs/backups may be subject to separate provider retention.

Archived does not mean deleted. The application does not currently provide self-service full account export or erasure, and it does not have a general automatic retention-purge job. A valid request is handled manually by the operator across the Auth identity, linked database records and Storage objects; provider-held logs/backups are subject to provider controls and applicable terms. The operator must verify what was actually removed and explain any limits rather than promising that every provider copy is immediately erased.

## Minimum age and invitation model

The initial pilot is invite-only and limited to adults aged 18 or older. Registration uses a self-attestation only; no date of birth or identity document is requested solely for age checking. Google OAuth Console's test-user list and the application's private beta email allowlist are separate controls and must be configured consistently in access-controlled systems. Tester email addresses must not be placed in source code, commits or public issues.

There is no public waitlist, public email-capture form, marketing newsletter or advertising system in this pilot. The first cohort is limited to five personally known friends. Google OAuth test-user access is governed by the configured Google Cloud project; the application also applies its own private-beta email allowlist.

## Rights and requests

Depending on the applicable legal basis and circumstances, people may request access, correction, deletion, restriction or portability, or object to certain processing. Where consent is the legal basis for a purpose, it may be withdrawn. These rights have statutory conditions and exceptions. Contact yepyouknowhim@gmail.com; identity checks should be proportionate and responses are normally due within one month under GDPR, subject to lawful extensions.

People may complain to the Dutch supervisory authority, the Autoriteit Persoonsgegevens: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen

## Remaining publication checks

- Confirm the public notice identifies Jaap Hopman as operator/controller and gives the public contact email; do not add a residential address or invented business details without a specific requirement.
- Ensure the actual processing and technical safeguards remain consistent with the owner-approved purpose-specific bases and the legitimate-interest assessments in the internal register.
- Published provider documentation and read-only metadata have been reconciled. Exact Render workspace tier and account-specific Strato terms are not exposed by the connection; the notice states those limits rather than inventing values. A full backup/restore test is explicitly not required for the initial pilot under Issue #155.
- [x] Owner-confirmed deployed-browser/network/cookie review completed and approved; see Issue #153 (closed 21 October 2026). Do not repeat the check or retain raw HAR/cookie values.
- [x] The private registration-consent migration was applied and its schema/history verified on staging on 19 October 2026. Any further database changes require separate authorization.
- Keep the public privacy/Terms pages marked for review until the privacy-safe rollback fix in PR #162 is merged and this page-copy change is merged by Jaap. The page copy must describe the known provider and deletion limits accurately; it must not claim a backup/restore guarantee or automated full erasure. No additional backup test, repeated contact test, repeated browser check or inaccessible account-tier investigation is required for this five-person pilot.

## References

- European Commission — information organisations must provide: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en
- Autoriteit Persoonsgegevens — cookies: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/internet-telefoon-tv-en-post/cookies
- Autoriteit Persoonsgegevens — privacy rights: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen
- Google Cloud — manage app audience and test users: https://support.google.com/cloud/answer/15549945
- Repository data inventory: docs/BETA_DATA_INVENTORY.md
- Operational request runbook: docs/BETA_PRIVACY_OPERATIONS.md
- Internal legal-basis register (owner-approved working policy; remaining factual checks): docs/BETA_LEGAL_BASIS_REGISTER.md
