# Beta Legal-Basis Register — Owner Review Draft

**Status:** proposed basis-by-purpose and legitimate-interests assessment for owner review; not legal advice or independent legal certification.  
**Scope:** The Vinyl Drop's initial free, invite-only, 18+ pilot operated by Jaap Hopman as a private individual.  
**Last reviewed against source:** 21 October 2026.

This register supports, but does not replace, the public Privacy Notice. It separates what the application actually does from the legal basis proposed for each purpose. A checked source-code implementation item does not itself establish that a legal basis is valid.

## 1. Purpose-to-basis mapping

| Processing purpose | Data / source-visible operation | Proposed GDPR basis | Reasoning and limits | Status |
| --- | --- | --- | --- | --- |
| Create and operate accounts and sessions | Auth user ID/email, sign-in state, session and recovery cookies, login/signup | GDPR Article 6(1)(b), where processing is objectively necessary to provide the account/service the person asks for | Authentication and session state are needed to sign in and keep the account usable. The short-lived registration-consent ticket carries a Terms version and 18+ attestation timestamp through the Google OAuth round-trip; it is cleared after callback and does not grant access. Keep optional profile fields separate from required account fields. | Proposed; owner review required |
| Maintain profiles and show user-selected public profile fields | Username, optional display name/avatar/bio/website/coarse location | Article 6(1)(b) for user-requested profile features; publication should be tied to the user's choice and clearly described | Explain which fields are public before users submit them. Do not collect street address or precise location. | Proposed; confirm actual field visibility before final publication |
| Create, edit, publish, discover and archive listings and photos | Release metadata, price/trade status, description, physical-copy condition, public listing images and related timestamps | Article 6(1)(b) for the user-requested marketplace functions | Publication is the user's chosen service action. Catalog lookup may send search terms/identifiers to the specific provider invoked. Buyer/seller arrangements happen off-platform. | Proposed; owner review required |
| Comments and favorites | Comment text, actor/listing IDs, favorite relation | Article 6(1)(b) for requested community features; consider Article 6(1)(f) only for separate retention/security needs | Public comments and private favorites must be accurately distinguished in the notice. Do not expose favorites as public activity. | Proposed; verify current visibility and deletion paths |
| Account/service security and abuse prevention | Password-safety range check, authentication safeguards, limited request/error logs, abuse report handling | Article 6(1)(f), subject to the balancing assessment in section 2 | The purpose is to prevent account takeover, spam, fraud, abusive use and operational failures. Do not describe this basis as validated until the assessment and provider facts are accepted. | Draft assessment below; owner approval required |
| Registration Terms/18+ audit | Terms version, Terms acceptance time, age-attestation time, Auth user ID in the restricted private table | Requires a recorded owner decision. Possible basis: Article 6(1)(f) for minimal evidence of the access agreement and protection of legal claims; do not automatically label it a legal obligation | The app stores no DOB or identity document for age checking. The row is designed to cascade with Auth identity deletion. This does not by itself implement full account erasure. | Open decision in #154 |
| Receive and respond to access/correction/erasure/privacy requests | Minimal private request reference, request category, timestamps and action/outcome | Article 6(1)(c) for any applicable legal response obligation; Article 6(1)(f) only where necessary for secure case administration and demonstrating completion | Verify identity proportionately; keep records access-controlled and no longer than needed. Do not put request details in public GitHub. | Proposed; runbook exists; operator approval required |
| Routine diagnostics and incident response | Operational events, route/status metadata, exception diagnostics and provider logs | Article 6(1)(f), if necessity and balancing are established; legal duties may separately apply to a particular incident | Routine logs target about 30 days, but actual Render/provider retention is not verified. An exceptional Storage rollback path may persist raw DB/Storage error detail; assess or sanitize before approving a broader claim about log minimisation. | Open verification/fix required |
| Service communications | Email required to create/recover an account and manual replies to support/privacy requests | Article 6(1)(b) where needed to provide the requested account service; Article 6(1)(c) for applicable privacy-request duties; otherwise assess a narrow legitimate interest | No newsletter, advertising, waitlist or marketing campaign is part of the pilot. Do not reuse account email for marketing. | Proposed; confirm configured email providers |
| Contact-form message and human reply | Optional name, reply email and message submitted through /contact; sent by the application to Resend and the operator mailbox | Proposed: Article 6(1)(f) for responding to an unsolicited general enquiry, subject to a short necessity/balancing rationale; Article 6(1)(b) only where the message is a request for pre-contract steps or requested service performance; Article 6(1)(c) where a specific legal response duty applies | The app sends the message for delivery but does not keep a database ticket/history. Do not describe pressing Send as blanket GDPR consent. Provider and mailbox retention are separate from application retention; warn users not to send credentials or sensitive data. | Proposed; owner review required |
| Password-safety lookup | Five-character SHA-1 hash prefix sent to Have I Been Pwned range API; suffix comparison performed locally | Article 6(1)(f), subject to security balancing assessment | The raw password/full hash is not intentionally sent to HIBP. The native Supabase leaked-password warning remains a separate known limitation; do not imply that the application check removes it. | Draft; owner review required |

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
- Provider log retention/transfer terms and the exceptional Storage rollback error-detail path still need verification.

**Provisional conclusion.** A narrowly scoped legitimate interest in service security and abuse prevention appears plausible for the small pilot if the safeguards above are applied and the remaining log/provider issues are resolved. This is a draft balancing conclusion, not independent legal advice. Jaap must approve it or revise it before the public notice is treated as final.

### LIA-B: minimal registration agreement audit

**Purpose / interest.** Preserve evidence of the exact Terms version accepted and the user's 18+ self-attestation without collecting a date of birth or identity document.

**Necessity and minimisation.** The stored fields are limited to Terms version, acceptance timestamp, attestation timestamp and Auth user ID. The table is private, with restricted access and an Auth-delete cascade.

**Balancing / retention.** The record can matter for access control and a later disagreement about which Terms were accepted, but should not become a permanent identity history. The current design deletes the record with the Auth identity. Full account erasure still requires separate handling of other database rows, Storage objects, provider logs and backups.

**Provisional conclusion.** A legitimate interest in retaining this minimal evidence may be defensible, subject to owner review of the actual operating model and deletion process. Do not describe the audit as required by law unless a specific obligation has been verified.

## 3. Operating-model and contact-scope assessment — 21 October 2026

This is a fact-based preliminary assessment, **not a legal opinion or owner approval**.

### Baseline DSA / intermediary-service question

Current owner-confirmed facts: the pilot is operated by one private individual; it is free, invite-only and limited to at most five personally known adults; there is no advertising, paid membership, public waitlist, payment processing, escrow, shipping or private messaging. The service can nevertheless store and display user-provided listing content and listing photographs, and published listings may be visible to visitors without an account.

The ACM's intermediary-service guidance describes services that store or disseminate information provided by recipients as potentially in scope and states that providers of in-scope intermediary services need a central contact point and at least two contact methods:
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten

The DSA uses the “information society service” concept. Directive (EU) 2015/1535 ties that concept to a service normally provided for remuneration, at a distance, electronically and at an individual request:
https://eur-lex.europa.eu/eli/reg/2022/2065/oj/nld
https://eur-lex.europa.eu/eli/dir/2015/1535/oj/eng

Free, private-individual operation is relevant context but does not prove a universal exemption; remuneration can be indirect and the actual operating arrangement matters. Accordingly, this register does **not** conclude that the entire DSA is inapplicable. If the owner wants a definitive classification before publication, obtain qualified Dutch/EU legal advice or authoritative written guidance instead of treating this source review as certification.

### Additional online-platform and online-marketplace duties

The current scope appears materially less likely to meet the criteria for the additional obligations aimed at large commercial online platforms/marketplaces: it is not a large provider group or commercial activity, it does not handle purchases, payment or in-platform buyer/seller communications, and it is configured for a very small manually selected pilot. Relevant ACM guidance:
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-platforms
https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-marktplaatsen

That is a distinction between extra platform/marketplace obligations and any baseline intermediary-service obligation, not a blanket exemption. Reassess on commercialisation, public signup, increased scale, in-platform messaging or transaction features.

### Contact and operator disclosure

The GDPR information duty requires the controller's identity and contact details; separate Dutch business-site disclosure rules depend on whether the arrangement is a business/economic activity. These questions must not be collapsed into an assumption that every private individual must publish a residential address. No company, KVK number, telephone number or residential address is invented here. The approved product direction is to keep the public operator name and email and add a human-reviewed contact form alongside it (#156). A second contact method reduces risk but does not itself decide DSA applicability.

## 4. Decisions that remain open

1. **Controller/contact and service classification:** Jaap has confirmed that The Vinyl Drop is operated by him as a private individual and that the public email is `yepyouknowhim@gmail.com`. Do not invent a company or publish a residential address. The applicability of Dutch website information rules and DSA requirements to this particular free, manually invite-only community service remains to be determined; see #154.
2. **Per-purpose basis approval:** approve/revise the Article 6(1)(b) mapping and the legitimate-interests assessments above before removing the public draft warning.
3. **Public/private behavior:** verify that routes display exactly the fields the Notice describes, especially public profile fields, favorites, comments and activity events.
4. **Provider facts:** Supabase project region and Render staging region are recorded in #152. The owner-confirmed deployed Network/Cookies check is complete and #153 is closed (21 October 2026); do not request another capture. Provider account terms/transfer safeguards, provider-side logs/backups and any account-specific configuration that cannot be proven from repository source still need review.
5. **Retention and erasure:** targets in the operations runbook are policy directions, not automatic expiry. Do not imply complete account erasure until the cross-system/manual procedure has been rehearsed.

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
- Court of Justice case C-769/22 (context on remuneration/economic activity; not a direct decision on this project): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A62022CJ0769

This register is intentionally not marked “approved.” Do not remove the draft labels from `/privacy` or `/terms` until the owner-approved legal decisions and remaining technical/live checks are recorded.
