# Beta Privacy Notice — Owner Review Draft

**Status: NOT approved for publication.** This is a source-grounded draft for the owner to review. It does not claim legal compliance. Do not merge or publish until the owner confirms the responsible operator identity, legal basis, retention rules, and the actual deployed cookie/provider behavior.

**Last source audit:** 2026-10-18  
**Existing privacy contact in the application:** [yepyouknowhim@gmail.com](mailto:yepyouknowhim@gmail.com), currently shown on `/contact`.  
**Still missing:** the responsible operator's approved legal name and business/postal address, approved purpose-by-purpose legal basis, owner-approved retention schedule, responsible human for data-rights requests, and final third-party/cookie review.

## What The Vinyl Drop does

The Vinyl Drop is a community marketplace for people to discover, list, buy, sell, and trade physical vinyl records. The current application does not take payments or provide escrow. Listings, their photos, public profile fields, and comments can be visible to other visitors when published.

## Information the current application handles

- **Account and sign-in:** email address, Supabase Auth user ID, authentication state and session tokens. Passwords and OAuth credentials are managed by Supabase Auth; the app does not store plaintext passwords in its application tables.
- **Profile:** username, display name, avatar URL, optional website, bio, coarse location and timestamps. Public profile fields may be visible to visitors. The app's intended location granularity is city/neighborhood, not a street address.
- **Records and listings:** artist/title/release metadata, label/catalogue details, format, seller's copy condition, price/trade status, description, publication state and relevant timestamps.
- **Photos:** processed listing images, storage paths, ordering and alt text. The source upload pipeline converts supported images to WebP, resizes large images and strips EXIF metadata. Listing imagery is served from the public-read listing-photo bucket, so do not upload private or sensitive images.
- **Community activity:** comments on published listings, favorites and activity-event records. Comments on visible listings are public. Favorites are intended to be private to the signed-in user; activity events may appear on community activity surfaces according to the event type.
- **Security and operational diagnostics:** bounded application/runtime error information and hosting logs. Provider-side log retention was not inspected. A rare Storage rollback failure can write diagnostic details to a restricted reconciliation table; those details and their cleanup schedule still need review.
- **Password safety check:** during the app's new-password check, the service sends a five-character SHA-1 hash prefix to the Have I Been Pwned range API and compares returned suffixes locally. The raw password and full hash are not intentionally sent to that service. This is an application-path control; the native Supabase leaked-password warning remains and the direct-Auth mitigation is governed by Issue #118.

The application source audit did not find a waitlist table or waitlist collection route. **Do not collect waitlist addresses** until the owner separately approves its purpose, provider, access, retention and deletion process.

## Why the information is used

The current source supports these purposes: signing users in, maintaining profiles, publishing and managing record listings, displaying listing photos and comments, supporting marketplace discovery, keeping the service functioning, investigating faults/security issues, and checking new passwords against a known-breach list.

**Owner/legal review required:** the lawful basis for each purpose has not been approved in this draft. No lawful basis or legal-compliance claim should be inferred from this list of technical purposes.

## Services that may receive information

The current architecture uses:

- **Supabase** for authentication, the PostgreSQL database and listing-photo storage.
- **Render** for web hosting/runtime and platform logs.
- **Discogs and/or MusicBrainz** for catalog searches/lookups when those features are used.
- **Have I Been Pwned** for the password-range check described above.
- The browser and the email/auth provider for sign-in verification, recovery and OAuth flows.

This inventory records the providers visible in source/configuration; it does not yet verify every deployed provider setting, data-processing agreement, region, international transfer or retention default. Those details must be checked before this draft is approved.

## Sign-in cookies and similar browser storage

The source currently sets essential authentication/session cookies for sign-in and account recovery:

- `sb-access-token`: session access token; lifetime follows the returned Supabase session expiry (one hour if no expiry is returned).
- `sb-refresh-token`: refresh token; configured for up to 30 days.
- `sb-recovery-mode`: short-lived recovery marker; configured for 15 minutes.
- Temporary Supabase PKCE/auth-flow values: configured for up to 10 minutes.

These cookies are HTTP-only and use SameSite=Lax; the Secure flag follows the application environment's cookie policy. They support authentication, session refresh and password recovery.

No analytics or advertising tracker was identified in the tracked application source/package manifest in the 2026-10-18 source audit. **That is not yet a verified statement about the deployed website:** deployed browser/network behavior and third-party font/provider requests still need to be checked before the public notice is finalized. The owner must decide whether a separate cookie notice or other disclosure is needed after that check. Do not add a consent banner unless the actual deployed setup requires one.

## How long information is kept

**Not approved yet.** The repository has timestamps, some foreign-key cascades, listing-photo cleanup, and cookie expiries, but those do not amount to a complete data-retention policy. There is currently no approved retention schedule for accounts/profiles, listings and comments, favorites/activity, release metadata, Storage objects, diagnostics, or provider logs. Archived content is not the same as deleted content. The app has no self-service account export or full account-deletion flow.

Before publication, the owner must approve a practical rule for each category: what event starts deletion, what is removed, what exceptions may be retained for security/operational reasons, and what provider/back-up retention cannot be controlled directly.

## Access, correction and deletion requests

The existing Contact page lists [yepyouknowhim@gmail.com](mailto:yepyouknowhim@gmail.com). A user may use that address to ask a question or request access, correction or deletion of their information. The actual responsible person, identity-verification steps, request log, response process and deletion steps still need an owner-approved runbook. Do not promise automated self-service deletion or export; neither was found in the audited routes.

## Privacy rights and complaints

Depending on the situation and the applicable legal basis, people may have rights to request access to their personal data, correction, deletion, restriction of processing, portability, or to object to processing. Where processing relies on consent, they may withdraw that consent. These rights are subject to the conditions and exceptions in applicable law; this draft does not promise that every request will always result in deletion or export.

Send a request to the contact address on the site's Contact page. The project should verify identity proportionately, respond within the applicable statutory deadline (normally one month under GDPR), explain any lawful refusal or extension, and keep only a minimal protected record that a request was handled.

People may also lodge a complaint with the Dutch supervisory authority, the [Autoriteit Persoonsgegevens](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen). The public notice must retain a working link to that authority.

## Responsible operator and contact

**Required before approval:** confirm the legal name of the controller/responsible operator and the public postal/business address (or obtain advice on what must be published for this project). The current application only verifies the existing email contact; it does not establish the operator's legal identity or address.

Privacy contact currently shown by the application: [yepyouknowhim@gmail.com](mailto:yepyouknowhim@gmail.com).

## Owner decisions needed before this becomes a public notice

1. Confirm the responsible controller/operator's legal name and the address/contact details to publish.
2. Approve the purpose-specific legal bases and the retention/deletion rule for each data category.
3. Name the person responsible for access/correction/deletion requests and approve the manual handling procedure.
4. Confirm deployed cookies, third-party resources and provider/data-region details; decide whether a separate Terms of Use or cookie notice is needed.
5. Keep waitlist collection disabled until the separate #48 decision explicitly approves its purpose, provider, access, retention and deletion.

## References used for drafting

- [European Commission — information that organisations must provide](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en)
- [Autoriteit Persoonsgegevens — cookies](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/internet-telefoon-tv-en-post/cookies)
- [Autoriteit Persoonsgegevens — privacy rights and requests](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen)
- [Repository data inventory](BETA_DATA_INVENTORY.md)
- [Security and privacy notes](SECURITY_PRIVACY.md)
