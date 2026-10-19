# The Vinyl Drop — Privacy Notice Draft

**Status: owner review draft; not approved for publication.** This text documents the implemented/source-level design and owner decisions, but does not certify legal compliance or live provider settings. Keep this warning until the remaining legal, provider and deployed-browser checks are evidenced and reviewed.

**Source review:** 19 October 2026
**Operator:** Jaap Hopman, acting as a private individual
**Public privacy contact:** yepyouknowhim@gmail.com

Do not invent a company or publish a residential address to fill a template. Required controller/contact disclosures for this exact arrangement remain subject to review.

## What The Vinyl Drop does

The Vinyl Drop is a free, invite-only community website for vinyl collectors to publish and discover records offered for sale or trade. It does not process payments, provide escrow or arrange shipping. Buyer and seller arrange any transaction and collection/logistics themselves.

## Information handled

- **Account and sign-in:** email address, Supabase Auth identity, authentication/session state and security information. Supabase Auth handles password/OAuth authentication; application tables do not store plaintext passwords.
- **Profile:** username, display name, avatar URL, optional website, bio, coarse location and timestamps. Public profile fields rendered by the application may be visible to visitors. Location is intended to be city/neighbourhood level, not a street address.
- **Listings and catalog data:** release and catalogue details, format, physical-copy condition, price or trade indication, listing description/status and timestamps.
- **Listing photos:** processed image bytes, Storage paths, ordering and alt text. Supported uploads are converted to WebP, resized and stripped of EXIF metadata. Published listing photos use a public-read path; do not upload private or sensitive images.
- **Community data:** comments, favorites and activity events. Comments on visible listings are public. Favorites are private. Activity visibility depends on event type.
- **Registration audit:** Terms version, Terms acceptance timestamp, 18+ attestation timestamp and linked Auth user ID are stored in the restricted private registration-consent table. The table stores no date of birth or identity document and is configured to cascade-delete when the Auth identity is removed. The source migration must be separately applied and verified before the updated registration flow is deployed.
- **Operational and security information:** application/runtime logs, bounded error diagnostics and authentication cookies. Provider-side log retention has not been independently verified.
- **Password-safety check:** the application sends only a five-character SHA-1 hash prefix to the Have I Been Pwned range API and compares matching suffixes locally. It does not intentionally send the raw password or full hash to that service. The remaining direct-Auth bypass is tracked separately in Issue #118.

## Purposes and legal basis

Information supports authentication, profile/account maintenance, listing and photo management, publication of user-selected public content, search/discovery, community features, account/service security, troubleshooting and the new-password safety check.

**Legal-basis review remains open.** Contract necessity is a candidate for data required for user-requested core functions. Legitimate interests are a candidate for necessary security/abuse prevention only after a documented balancing assessment. These are candidates, not a claim that a lawyer or privacy adviser has approved each purpose.

## Visibility

Published listings and their photos, public comments, and the public profile fields rendered by the site can be seen by visitors. Favorites are not public. Activity events can be displayed according to their event type. Users should not place personal details they do not want to disclose in public profile fields, listings or comments.

## Providers and external requests

Source-visible providers include Supabase for Auth/PostgreSQL/Storage, Render for hosting/runtime, Discogs and/or MusicBrainz for catalog lookups, Have I Been Pwned for password-range checks, and Google as part of OAuth sign-in. Resend and Strato apply only to the mail/domain/DNS functions actually configured. Not every provider receives every category of data.

Provider regions, international transfers and safeguards, processing terms, provider-side logs and backups must be checked against the actual configured services. This notice does not claim EU-only processing or a verified fixed provider retention period.

## Cookies and fonts

The source configures essential HTTP-only authentication/session cookies for access, refresh, recovery and short-lived PKCE/auth-flow handling. It also uses tvd-beta-welcome-seen as a first-party HTTP-only presentation marker for 180 days and tvd-beta-welcome as a 60-second HTTP-only display-only flash. Neither grants account or beta access.

The existing design font families are served from this site's own /fonts/ assets under the SIL Open Font License; the external Google Fonts links have been removed from the page layout. A clean deployed-browser/network check is still required before a definitive statement that no other third-party requests or tracking storage occur.

## Retention and deletion

These are the current policy directions/targets, not claims that automated purging or all provider settings have been verified:

- **Active account/profile:** retained while the account is active; no automatic one-year expiry for an active account.
- **Archived listing data/photos:** target deletion 12 months after archive, except for a specific documented reason to retain particular data longer.
- **Drafts:** verify whether and where drafts persist before setting a retention period; no independent draft retention period is claimed here.
- **Comments, favorites and activity:** retained only while needed for service/community purposes. On a valid account-erasure request, remove or anonymise linked records where appropriate while respecting other users' rights and specific lawful security/retention needs.
- **Registration agreement audit:** minimum Terms-version and timestamp record is linked to Auth identity and is removed when that identity is erased.
- **Routine app/security logs:** approximately 30 days is the target policy period. Incident material may remain longer where necessary and documented. Actual provider log retention is unverified.
- **Privacy-request audit:** minimal, access-controlled record with a target maximum of 12 months after closure unless a specific documented need requires longer.
- **Backups and provider logs:** actual provider retention limits and deletion after restore remain to be checked.

Archived does not mean deleted. The application does not currently provide self-service full account export or erasure. A valid request may require manual handling across Auth, database rows, Storage objects, diagnostics, provider logs and backups. Do not infer automatic deletion from a target policy.

## Minimum age and invitation model

The initial pilot is invite-only and limited to adults aged 18 or older. Registration uses a self-attestation only; no date of birth or identity document is requested solely for age checking. Google OAuth Console's test-user list and the application's private beta email allowlist are separate controls and must be configured consistently in access-controlled systems. Tester email addresses must not be placed in source code, commits or public issues.

There is no public waitlist, public email-capture form, marketing newsletter or advertising system in this pilot. The first cohort is limited to five personally known friends. Google OAuth test-user access is governed by the configured Google Cloud project; the application also applies its own private-beta email allowlist.

## Rights and requests

Depending on the applicable legal basis and circumstances, people may request access, correction, deletion, restriction or portability, or object to certain processing. Where consent is the legal basis for a purpose, it may be withdrawn. These rights have statutory conditions and exceptions. Contact yepyouknowhim@gmail.com; identity checks should be proportionate and responses are normally due within one month under GDPR, subject to lawful extensions.

People may complain to the Dutch supervisory authority, the Autoriteit Persoonsgegevens: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen

## Remaining publication checks

- Confirm the legally required controller identity/contact disclosures for this private-individual arrangement without publishing unnecessary private residential details.
- Review purpose-specific lawful bases, including a documented balancing assessment where legitimate interests are considered.
- Independently verify the actual provider regions, transfers/safeguards, processing terms, provider log retention and backups.
- Run a clean deployed-browser/network check for cookies, font requests and all other third-party network requests.
- Apply and verify the new private registration-consent migration only through a separately authorized staging process.
- Keep this notice and the separate Terms of Use marked as drafts until the owner/privacy review accepts the evidence and wording.

## References

- European Commission — information organisations must provide: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en
- Autoriteit Persoonsgegevens — cookies: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/internet-telefoon-tv-en-post/cookies
- Autoriteit Persoonsgegevens — privacy rights: https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen
- Google Cloud — manage app audience and test users: https://support.google.com/cloud/answer/15549945
- Repository data inventory: docs/BETA_DATA_INVENTORY.md
- Operational request runbook: docs/BETA_PRIVACY_OPERATIONS.md
