# Beta Privacy Operations — Owner Review

**Status: proposed manual runbook; not a claim of legal compliance.**  
**Scope:** initial invite-only beta. The published waitlist remains disabled.  
**Last source review:** 2026-10-19.

This runbook converts the source inventory into a small operational procedure without claiming that the application has self-service privacy tools. It must be reviewed by the project owner and, where appropriate, a privacy/legal adviser before the privacy notice is approved.

## 1. Responsible person and contact route

- **Accountable human for initial handling:** the repository owner/maintainer account `japiohopman` is the named operational owner for receiving, triaging and ensuring completion of privacy requests. This internal responsibility assignment is not a substitute for confirming the legal controller's identity for the public notice. Do not leave requests unattended in a general repository issue.
- **Current public intake address:** `yepyouknowhim@gmail.com`, confirmed in `src/app/controllers/infoController.ts` and the existing `/contact` page.
- **Still required before final publication:** the controller's legal identity and the address/contact details required for the actual operating arrangement must be confirmed. The email address alone does not establish the controller identity.
- **Private handling:** keep request contents, account email addresses, identity evidence and tester details in a restricted mailbox or similarly access-controlled system. Never paste them into public GitHub issues, commits, screenshots or logs.

## 2. Manual request workflow

The application currently has no self-service export or full account-deletion route. Until that changes, the project owner must handle requests manually.

1. **Record receipt privately.** Record only the date received, contact channel, request category and a private reference. Do not put the person’s details in GitHub.
2. **Clarify and verify identity proportionately.** If the person can write from the email address linked to the account, use that as a starting point. If it is not sufficient, ask for proportionate additional evidence. Never ask for a password, session token, refresh token or recovery link; do not collect copies of identity documents unless legal advice confirms a genuine need.
3. **Understand the request.** Determine whether it is access, correction, deletion, restriction, portability, objection, consent withdrawal, account help or a complaint. Confirm whose data is involved.
4. **Inventory relevant locations.** Check the Auth identity, profile, listings/physical-copy relationships, listing photos and Storage objects, comments, favorites/activity records, and relevant operational diagnostics. Check provider-held data or backups where that is within the controller’s control.
5. **Assess exceptions before changing data.** Do not erase other users’ data or evidence that must lawfully be retained. If the request is unclear, disproportionate, conflicts with other people’s rights, or may involve a legal retention duty, seek appropriate advice and document the reason before acting.
6. **Carry out the approved action carefully.** Use the existing documented procedures and access-controlled provider consoles. For account erasure, verify what each database relationship, Storage object and Auth record will do; a cascade or a public listing archive is not proof that every personal-data copy is deleted. If safe complete deletion is not yet possible, explain the limitation and escalate rather than claiming it is complete.
7. **Respond and record closure.** Explain what was done, what was not done and the reason, and any applicable complaint route. GDPR requests normally require a response within one month; a permitted extension has to be communicated within the initial period. Track the deadline privately.
8. **Minimise the request record.** Keep only what is needed to document the request and response, with an owner-approved deletion date. Do not retain identity evidence or message contents indefinitely just because they were once used to process a request.

The exact legal deadlines, grounds for refusal/retention, and the appropriate identity-check method should be checked for each case. This runbook is operational guidance, not legal advice.

## 3. Retention / deletion decision table

The owner-approved directions below are the current policy baseline for the initial pilot. Targets are not claims that automated purging or provider-side retention has been verified.

| Data category | Owner-approved policy direction | Current implementation caveat |
| --- | --- | --- |
| Auth account and profile | Retain while active; no automatic expiry after 12 months. On valid erasure, remove/anonymise personal data where appropriate and document specific lawful exceptions. | No self-service full erasure/export path. Manual cross-system handling remains required. |
| Draft/published/archived listings and photos | Archived content is targeted for deletion 12 months after archive unless a specific documented reason justifies longer retention. Draft retention must be defined only after confirming where drafts persist. | Policy target only; archive is not deletion. Storage objects and orphan reconciliation require separate checks. |
| Comments, favorites and activity records | Retain only while needed for the active service/community function. On an approved erasure request, remove or de-identify records linked to the person where appropriate, taking account of other users’ rights. | Existing cascade behavior and any independent activity references must be checked; do not assume all related content is automatically erased. |
| Release/catalog metadata | It may remain where it describes a musical release rather than an identifiable seller. Remove personal associations when no longer needed. | Keep release metadata separate from personal listing and account records. |
| Auth/session cookies | Follow the configured expiries: access token follows session expiry (one hour fallback), refresh token up to 30 days, recovery marker 15 minutes, temporary PKCE/auth-flow values up to 10 minutes. | This reflects source configuration; deployed behavior should be checked. Clearing cookies does not delete server-side data. |
| Application/platform logs | Target approximately 30 days for routine logs. Incident-specific material may remain longer only where necessary and documented. | Render/provider retention remains unverified, so the target is not a verified configured expiry. |
| Storage orphan diagnostics | Keep only while needed to resolve a failed upload/delete cleanup; review after the incident is resolved and remove diagnostic details when no longer needed. | No automated expiry policy is currently documented. The table is restricted; verify actual access grants as part of operational review. |
| Privacy-request handling record | Keep a minimal, access-controlled record; target deletion within 12 months after closure unless a documented need requires longer. Do not keep ID copies by default. | Manual process; no ticket/mailbox automation is implemented. |
| HIBP password-range request | Do not persist the submitted password or full hash; the service checks the returned suffix in memory. | The app uses the five-character hash-prefix protocol. The native Supabase leaked-password warning remains a separate known limitation. |
| Registration agreement audit | Retain only the Terms version, Terms-acceptance timestamp, 18+ attestation timestamp and Auth user ID. Delete it when the Auth identity is erased. | Migration 0013 was applied and verified on staging on 19 October 2026 (schema, RLS, grants and Auth-delete cascade). The manual account-erasure process and provider/backup retention still need operational verification. |
| Waitlist / marketing | No collection and no retention. If later selected, approve purpose, provider, access, retention and deletion as a separate scope. | No waitlist route/table; #48 excludes a public waitlist from the five-person pilot. |

## 4. Legal-basis decision register

The project owner must decide the actual legal basis for each purpose before final publication. These are candidates for review only, not legal conclusions:

- Account/session and requested marketplace functions: assess whether necessary processing is based on steps requested by the user / performance of the relevant service arrangement.
- Security, abuse prevention and essential service diagnostics: assess whether legitimate interests apply, including the balancing test and data minimisation.
- Password safety checks: assess the basis for this security processing and disclose the external range-query recipient.
- Waitlist, newsletters or nonessential marketing: not active for the small initial pilot. Reassess separately before enabling collection or sending messages.
- Essential authentication cookies: source identifies these as necessary for login/session/recovery. The notice should describe them. Do not introduce analytics/tracking cookies or a consent manager without first verifying an actual need.

The Dutch Autoriteit Persoonsgegevens explains that controllers must choose the appropriate legal basis themselves and must not retain personal data longer than necessary. Therefore this register deliberately does not mark a basis or retention period as approved.

## 5. Cookies, trackers and Terms decision

- Source review on 2026-10-19 found authentication/session and short-lived auth-flow cookies in `src/app/middleware/auth.ts` and `src/lib/supabase.ts`. Registration also uses a short-lived, signed, first-party HTTP-only consent ticket for Google OAuth sign-up; it does not grant beta access.
- The layout now serves Capriola, DM Sans, IBM Plex Mono and Space Grotesk from same-origin `/fonts/` assets under SIL Open Font License notices; remote Google Fonts links have been removed from source. No analytics or advertising tracker was identified in source, but deployed browser/network behavior has not been independently verified.
- **Provisional decision:** do not add a cookie banner or consent manager solely for the identified essential authentication cookies. The privacy notice describes the source-configured cookies. Before final publication, check the deployed page in a clean browser session and confirm whether any nonessential cookies, trackers or third-party embeds are present. If tracking cookies or other consent-requiring storage are found, block them until valid consent can be collected.
- **Terms of Use:** a separate Terms draft now exists at `/terms` and is linked from the footer and signup form. It remains explicitly marked as an owner-review draft until legal wording and release gates are reviewed; the Community Rules are still a separate document.
- This document does not make a claim that the deployed site is free of tracking, or that a separate cookie notice/Terms page is legally unnecessary.

## 6. Waitlist boundary for initial beta

The current owner scope recorded in Issue #48 says the first group is manually selected, no more than five known friends; a public waitlist is not part of this first pilot. Follow that boundary:

- Do not add a waitlist form, mailing-list form or email collection table in this task.
- Do not import people into Mailchimp/Resend/Gmail or send marketing messages based on this privacy draft.
- If a later decision selects a waitlist, update #48 and this register before implementation with the exact purpose, provider, data fields, access controls, confirmation message, withdrawal/deletion flow and approved retention rule.
- Keep tester recipient lists in access-controlled systems only.

## 7. Owner closeout checklist

- [ ] Confirm controller/operator legal identity and which postal/contact details must be public.
- [ ] Approve or revise the legal-basis register above.
- [ ] Approve the data-retention/deletion rules and practical end conditions for every category.
- [ ] Confirm the manual request handler, restricted record location and record retention period.
- [ ] Perform a deployed clean-browser/network check for cookies, third-party requests and tracking; record evidence without exposing session values.
- [ ] Review the separate `/terms` draft and the `/privacy` notice; keep both labelled as drafts until the required owner/legal/provider checks are evidenced.
- [ ] Confirm the initial pilot is 18+ and that registration stores no date of birth or identity document.
- [x] The private registration-consent migration was applied and schema/history verified on staging on 19 October 2026. Further database changes require separate authorization.
- [ ] Keep the five-person pilot manual and invite-only; no public waitlist or marketing collection.
- [ ] Review the public wording with appropriate legal/privacy advice before converting the draft into a final notice.

## Source references

- [European Commission — information individuals must receive](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en)
- [Autoriteit Persoonsgegevens — legal bases](https://autoriteitpersoonsgegevens.nl/nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd)
- [Autoriteit Persoonsgegevens — retention of personal data](https://autoriteitpersoonsgegevens.nl/en/themes/basic-gdpr/privacy-and-personal-data/retention-of-personal-data)
- [Autoriteit Persoonsgegevens — cookies](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/internet-telefoon-tv-en-post/cookies)
- [Autoriteit Persoonsgegevens — privacy rights](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen)
- `docs/BETA_DATA_INVENTORY.md`
- Issue #48 and Issue #88
