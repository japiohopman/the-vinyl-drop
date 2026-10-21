# Beta Legal-Basis Register — Owner-Approved Working Policy

**Status:** Jaap explicitly approved the proposed purpose-by-purpose GDPR basis framework and the two legitimate-interest policy directions on 21 October 2026. This is an owner policy decision, not legal advice, independent legal certification, or proof that every technical safeguard is already in place.  
**Scope:** The Vinyl Drop's initial free, invite-only, 18+ pilot operated by Jaap Hopman as a private individual.  
**Last reviewed against source:** 21 October 2026.

This register supports, but does not replace, the public Privacy Notice. The owner approval adopts these working rules: Article 6(1)(b) only for processing objectively necessary to provide an account/service or a feature the user requests; Article 6(1)(f) for narrowly scoped security, abuse prevention, minimal Terms/18+ evidence, password-safety checking and general enquiries only with the stated safeguards; Article 6(1)(c) only where a specific legal duty actually applies. Sending a contact message is not blanket GDPR consent. Technical facts, public/private field behaviour, provider retention/transfers and logging minimisation still require verification before the public Notice can be treated as complete.

## 1. Purpose-to-basis mapping

| Processing purpose | Data / source-visible operation | Owner-approved GDPR basis (working policy) | Reasoning and limits | Status |
| --- | --- | --- | --- | --- |
| Create and operate accounts and sessions | Auth user ID/email, sign-in state, session and recovery cookies, login/signup | GDPR Article 6(1)(b), where processing is objectively necessary to provide the account/service the person asks for | Authentication and session state are needed to sign in and keep the account usable. The short-lived registration-consent ticket carries a Terms version and 18+ attestation timestamp through the Google OAuth round-trip; it is cleared after callback and does not grant access. Keep optional profile fields separate from required account fields. | Owner-approved working basis; remaining safeguards still apply |
| Maintain profiles and show user-selected public profile fields | Username, optional display name/avatar/bio/website/coarse location | Article 6(1)(b) for user-requested profile features; publication should be tied to the user's choice and clearly described | Explain which fields are public before users submit them. Do not collect street address or precise location. | Owner-approved working basis; verify actual field visibility before final publication |
| Create, edit, publish, discover and archive listings and photos | Release metadata, price/trade status, description, physical-copy condition, public listing images and related timestamps | Article 6(1)(b) for the user-requested marketplace functions | Publication is the user's chosen service action. Catalog lookup may send search terms/identifiers to the specific provider invoked. Buyer/seller arrangements happen off-platform. | Owner-approved working basis; remaining safeguards still apply |
| Comments and favorites | Comment text, actor/listing IDs, favorite relation | Article 6(1)(b) for requested community features; consider Article 6(1)(f) only for separate retention/security needs | Public comments and private favorites must be accurately distinguished in the notice. Do not expose favorites as public activity. | Proposed; verify current visibility and deletion paths |
| Account/service security and abuse prevention | Password-safety range check, authentication safeguards, limited request/error logs, abuse report handling | Article 6(1)(f), subject to the balancing assessment in section 2 | The purpose is to prevent account takeover, spam, fraud, abusive use and operational failures. Do not describe this basis as validated until the assessment and provider facts are accepted. | Owner-approved policy direction under LIA-A; technical/provider safeguards remain open |
| Registration Terms/18+ audit | Terms version, Terms acceptance time, age-attestation time, Auth user ID in the restricted private table | Article 6(1)(f) for minimal evidence of accepted Terms and 18+ attestation, subject to minimisation/deletion safeguards; not a claimed legal obligation | The app stores no DOB or identity document for age checking. The row is designed to cascade with Auth identity deletion. This does not by itself implement full account erasure. | Owner-approved working basis: Article 6(1)(f); confirm deletion and retention paths before publication |
| Receive and respond to access/correction/erasure/privacy requests | Minimal private request reference, request category, timestamps and action/outcome | Article 6(1)(c) for any applicable legal response obligation; Article 6(1)(f) only where necessary for secure case administration and demonstrating completion | Verify identity proportionately; keep records access-controlled and no longer than needed. Do not put request details in public GitHub. | Owner-approved working basis: Article 6(1)(c) only for actual legal duties and Article 6(1)(f) only as needed for secure case administration |
| Routine diagnostics and incident response | Operational events, route/status metadata, exception diagnostics and provider logs | Article 6(1)(f), if necessity and balancing are established; legal duties may separately apply to a particular incident | Routine logs target about 30 days, but actual Render/provider retention is not verified. The exceptional Storage rollback path currently persists raw DB/Storage exception details in orphan diagnostics and can log them if orphan recording fails. PR #162 / Issue #161 proposes redaction; verify CI and merge before claiming this path is sanitized. | Open verification/fix required |
| Service communications | Email required to create/recover an account and manual replies to support/privacy requests | Article 6(1)(b) where needed to provide the requested account service; Article 6(1)(c) for applicable privacy-request duties; otherwise assess a narrow legitimate interest | No newsletter, advertising, waitlist or marketing campaign is part of the pilot. Do not reuse account email for marketing. | Owner-approved working basis; validate provider facts before final notice |
| Contact-form message and human reply | Optional name, reply email and message submitted through /contact; sent by the application to Resend and the operator mailbox | Proposed: Article 6(1)(f) for responding to an unsolicited general enquiry, subject to a short necessity/balancing rationale; Article 6(1)(b) only where the message is a request for pre-contract steps or requested service performance; Article 6(1)(c) where a specific legal response duty applies | The app sends the message for delivery but does not keep a database ticket/history. Do not describe pressing Send as blanket GDPR consent. Provider and mailbox retention are separate from application retention; warn users not to send credentials or sensitive data. | Owner-approved working basis; remaining safeguards still apply |
| Password-safety lookup | Five-character SHA-1 hash prefix sent to Have I Been Pwned range API; suffix comparison performed locally | Article 6(1)(f), subject to security balancing assessment | The raw password/full hash is not intentionally sent to HIBP. The native Supabase leaked-password warning remains a separate known limitation; do not imply that the application check removes it. | Owner-approved policy direction under LIA-A; verify operation and retain the Supabase warning limitation |

## 2. Legitimate-interests assessment — first-pilot draft

### LIA-A: account/service security and prevention of abuse

**Purpose / interest.** Protect a small community marketplace and its users against account takeover, automated abuse, spam, fraud, unauthorised access and avoidable service failure.

**Necessity.** Authentication controls, proportionate rate limits, limited operational logs and a manual path for reporting harmful listings/comments are relevant to these purposes. The service should not gather broad behavioural profiles or tracking data. Password-safety checking uses the range-prefix protocol rather than transmitting a raw password or full hash.

**Reasonable expectations.** Users signing up to a private marketplace reasonably expect basic account security, abuse response and service diagnostics. They should not reasonably expect marketing profiles, advertising trackers, or public exposure of private account/security data.

**Impact and balancing safeguards.**
- The pilot is restricted to adults, manually selected invitees and at most five personally known friends.
- Published listings/photos, public comments and selected public profile fields are distinguishable from private favorites and account/security information.
- No advertising, marketing newsletter, public waitlist or behavioural-profiling feature is intended.
- Raw passwords, full password hashes, session tokens and recovery URLs must not be logged.
- Routine logs target approximately 30 days; this is a policy target, not a verified provider retention setting.
- Any incident-specific extension must be necessary, documented and access-controlled.
- Published provider documentation and read-only metadata have been reviewed for Supabase region/transfer boundaries, Render log-retention tiers, and Resend US storage/retention. Exact Render workspace tier, account-specific terms/subprocessor records, Strato terms, backup/recovery configuration and actual deletion/purge behavior remain unverified. The exceptional Storage rollback error-detail path is under remediation in PR #162 / Issue #161; verify the fix before final publication.

**Owner decision — 21 October 2026.** Jaap approved this narrow legitimate-interest policy direction for security and abuse prevention, conditional on the safeguards listed above. This approval does not certify that the current implementation/provider settings already meet those safeguards. Published provider docs are recorded, but account-specific retention/transfer settings, workspace tier, backup/recovery configuration and actual deletion/purge behavior remain unverified. The exceptional Storage rollback error-detail path is under remediation in PR #162 / Issue #161 and must be verified before the public Notice is final.

### LIA-B: minimal registration agreement audit

**Purpose / interest.** Preserve evidence of the exact Terms version accepted and the user's 18+ self-attestation without collecting a date of birth or identity document.

**Necessity and minimisation.** The stored fields are limited to Terms version, acceptance timestamp, attestation timestamp and Auth user ID. The table is private, with restricted access and an Auth-delete cascade.

**Balancing / retention.** The record can matter for access control and a later disagreement about which Terms were accepted, but should not become a permanent identity history. The current design deletes the record with the Auth identity. Full account erasure still requires separate handling of other database rows, Storage objects, provider logs and backups.

**Owner decision — 21 October 2026.** Jaap approved this narrow legitimate-interest policy direction for minimal Terms/18+ audit evidence, subject to the minimisation and deletion safeguards described above. Do not describe it as required by law; account deletion and cross-system erasure still need verification.

## 3. Operating-model and contact-scope assessment — 21 October 2026

This is a fact-based preliminary assessment, **not a legal opinion or independent legal certification**. The owner's decision on the accepted pilot risk is recorded below.

### Baseline DSA / intermediary-service question

Current owner-confirmed facts: the pilot is operated by one private individual; it is free, invite-only and limited to at most five personally known adults; there is no advertising, paid membership, public waitlist, payment processing, escrow, shipping or private messaging. The service can nevertheless store and display user-provided listing content and listing photographs, and published listings may be visible to visitors without an account.

The ACM's intermediary-service guidance discusses user content stored or disseminated by a service and describes the baseline DSA obligations that may apply:
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten

The DSA uses the “information society service” concept. Directive (EU) 2015/1535 refers to a service normally provided for remuneration, at a distance, electronically and at an individual request:
https://eur-lex.europa.eu/eli/reg/2022/2065/oj/nld
https://eur-lex.europa.eu/eli/dir/2015/1535/oj/eng

Free operation and private-individual status are relevant facts, but neither “webapp” nor the absence of a BV decides the statutory test. Indirect advertising or another economic connection can matter in other cases. The current facts recorded for The Vinyl Drop include no fees, ads, sponsorship, commercial business model or in-app transactions. The reviewed sources do not provide a project-specific binding ruling on whether this purely personal pilot is a service normally provided for remuneration. The ACM's DSA-check is an estimate, not a certificate:
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/dsa-check

**Owner decision — 21 October 2026:** Jaap accepts the remaining baseline DSA-scope uncertainty for the current very small pilot. This is not a conclusion that the DSA definitely does or does not apply, and the project must not claim legal certification. To reduce risk, retain a second genuine human-reviewed contact route and a workable path to report problematic/illegal content. Those measures are prudent safeguards, not proof of legal classification. There is no general government pre-approval certificate required before launch. A qualified Dutch technology/privacy lawyer can provide an opinion if stronger legal certainty is desired; that is optional advice, not a regulator's launch approval. Reassess if the project becomes commercial, scales materially, adds advertising, messaging, payments or other commercial features.

### Additional online-platform and online-marketplace duties

The current scope appears materially less likely to meet the criteria for the additional obligations aimed at large commercial online platforms/marketplaces: it is not a large provider group or commercial activity, it does not handle purchases, payment or in-platform buyer/seller communications, and it is configured for a very small manually selected pilot. Relevant ACM guidance:
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-platforms
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-marktplaatsen

That is a distinction between extra platform/marketplace obligations and the baseline intermediary-service question, not a blanket exemption. Reassess if the operating model changes.

### Contact and operator disclosure

The GDPR information duty requires the controller's identity and contact details; separate Dutch business-site disclosure rules depend on whether the arrangement is a business/economic activity. Do not assume that every private individual must publish a residential address. No company, KVK number, telephone number or residential address is invented here. The approved product direction is to keep the public operator name and email and add a human-reviewed contact form alongside it (#156). The contact form was merged/deployed and one end-to-end staging delivery test passed on 21 October 2026. Provider/mailbox retention remains separate and unverified.

## 4. Owner decisions recorded and remaining verification

**Owner decisions complete — 21 October 2026:**
1. The operator context is approved as Jaap Hopman acting as a private individual. Do not invent a company/BV, KVK number, telephone number or residential address. Public contact email remains `yepyouknowhim@gmail.com`.
2. The purpose-by-purpose legal-basis map and narrow legitimate-interest policy directions in sections 1–2 are approved as the working policy for this pilot, with the safeguards and limits recorded in each row. Article 6(1)(c) may only be claimed when a specific legal obligation has been identified. Contact-form submission is not consent.
3. The remaining baseline DSA-scope uncertainty is accepted for the current five-person, manually invite-only, free personal pilot. This is not a claim that the DSA is inapplicable. Keep proportionate contact/reporting safeguards and reassess if the facts change. No outside pre-approval is a statutory prerequisite; qualified advice is optional if stronger certainty is wanted.

**Verification still required before the public Privacy Notice/Terms are called final:**
- [x] Source-level visibility review completed 21 October 2026: the profile schema does not contain an account email field; public profile pages render username, display name, avatar, website, bio, coarse location and join date; public profile crates query published listings only; the listing search defaults to published; non-published listings/comments are restricted to the seller; and activity queries include favourite events only for the requesting user (anonymous/public feeds exclude favourite events). The activity template labels a personal favourite as private. Keep Notice wording aligned with these actual fields and visibility rules. This is a source review, not a new deployed-browser test.
- Confirm provider account terms/transfer safeguards, provider-side logs/backups and account-specific settings that cannot be proven from repository source.
- Verify the redaction remediation for the exceptional Storage rollback error-detail path in PR #162 / Issue #161 and confirm retention/logging claims match actual behaviour.
- One deployed contact-form delivery test passed on staging; verify provider/mailbox retention and keep the public notice in draft until remaining release gates are satisfied.
- Rehearse the cross-system/manual account-erasure procedure. Retention targets are policy directions, not automatic expiry.

## 5. Official sources used for this draft

- European Commission — information individuals must receive under GDPR: https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en
- European Commission — lawful bases for processing: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en
- Autoriteit Persoonsgegevens — the right to information and transparent privacy notices: https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/privacyrechten/recht-op-informatie
- Autoriteit Persoonsgegevens — legitimate grounds and need to substantiate the selected basis: https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd
- Business.gov.nl / KVK — business website disclosures (classification as a business website must be assessed rather than assumed): https://business.gov.nl/starting-your-business/first-steps/creating-a-business-website/
- ACM — intermediary-service scope and baseline DSA contact requirements: https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten
- ACM — online-platform scope and criteria: https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-platforms
- EU Digital Services Act (Regulation (EU) 2022/2065): https://eur-lex.europa.eu/eli/reg/2022/2065/oj/nld
- Directive (EU) 2015/1535 — definition of an information society service: https://eur-lex.europa.eu/eli/dir/2015/1535/oj/eng
- Court of Justice, Case C-291/13, Papasavvas — ad-funded online information service and indirect remuneration; this is an example involving advertising revenue, unlike the current pilot as described: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A62013CJ0291
- ACM — DSA-check provides an estimate based on selected answers, not a binding determination: https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/dsa-check

The owner has approved the working policy decisions above. Do not remove the draft labels from `/privacy` or `/terms` until the remaining verification items are completed and the public wording matches the actual implementation.
