# Public Launch Privacy, DSA & Operator Assessment

**Governing issue:** [#280](https://github.com/japiohopman/the-vinyl-drop/issues/280)  
**Assessment date:** 1 November 2026  
**Status:** evidence snapshot for owner/legal review — **not** a legal opinion, compliance certificate, or approval to open registration.  
**Scope:** public-facing production pages and current `main` source, compared with the pilot privacy/operations records. No forms were submitted; no production or staging setting, database, user record, or provider configuration was changed.

## 1. Executive assessment

The existing pilot privacy work is a useful foundation, but the public-launch change is material. The public site currently presents legal copy for a **private beta / invite-only pilot**, while the approved product direction in Issue #280 is a publicly accessible community marketplace with open registration.

A read-only production GET review on 1 November 2026 confirmed that the live `/privacy`, `/terms`, `/community-rules`, `/contact`, and `/auth/signup` pages still contain pilot wording. In particular:

- Privacy Notice says “Private beta privacy notice”, “free, invite-only”, “small, non-commercial pilot”, and says legal classification may need reassessment if the operating model changes.
- Terms of Use says “Private beta”, limits use to invited adults, and describes manual moderation “during the pilot”.
- Contact page describes the service as “free, invite-only”.
- Signup copy says the Privacy Notice “remains marked as a review draft”, despite the privacy controller passing `noticeStatus: 'current'`. The copy is stale and contradictory.
- Community Rules prohibit hate, harassment, threats, doxxing, fraudulent listings, counterfeit records sold as originals, deliberate grading misrepresentation, spam, and malicious exploitation. They direct users to Contact, but do not describe a detailed notice, decision, or appeal process.

The current contact page exposes two practical user contact methods: a direct email address and a human-submitted web form. This is a good starting point and matches the two-method approach described in ACM guidance. However, the live form was **not submitted** during this assessment (doing so would send a real email); the existing staging delivery test is evidence for staging only. The page also does not identify a distinct authority contact point, and the current form is general-purpose rather than a structured notice-and-action mechanism for a specific item of allegedly illegal content.

**Recommendation:** keep public registration closed until the operator has recorded a qualified scope decision and the public-facing policies and actual report-handling process have been aligned with that decision. Do not treat the old five-person pilot acceptance as a public-launch legal assessment.

## 2. Verified product and operator facts

| Area | Current evidence | Limitation |
| --- | --- | --- |
| Public user content | Production publicly serves profiles, published vinyl listings/photos and public comments. | Public access to content is distinct from the account-registration gate. |
| Marketplace operation | Terms say buyers and sellers arrange price/trade and collection/logistics themselves. Source/docs say there is no in-app payment, escrow or shipping; user-to-user messaging remains disabled. | Whether particular users are acting as traders, and whether the service facilitates a distance contract, is a legal/factual question. |
| Operator identity | Source and live pages identify Jaap Hopman as a private individual and provide the public contact email. No company, KVK number, business address or residential address is claimed. | Whether separate business/e-commerce disclosure rules apply depends on the actual economic/business activity. Do not publish a residential address by inference. |
| Contact options | Production Contact page visibly lists direct email and a web form. The form asks for a reply email and message; name is optional. | No production send/delivery test was performed. The staging form has one successful owner-reported delivery test (21 October 2026), not a delivery guarantee. |
| Registration consent | Current source requires Terms acceptance and an 18+ self-attestation. It records the Terms version and the two timestamps in a restricted private table; it does not collect date of birth or ID for the age gate. | Public copy and runtime/provider registration gates still need owner verification before any opening of signup. |
| Privacy requests | The app has no self-service full export or erasure route. The owner-approved runbook describes manual request handling. | End-to-end cross-system erasure is not claimed as tested; provider-held logs/backups may remain under separate provider controls. |
| Retention and recovery | The Privacy Notice distinguishes policy targets from automatic deletion and says a complete backup/restore path has not been verified. Supabase Free does not provide the complete recovery promise the public service would ideally need. | The pilot's explicit acceptance of data-loss risk must not silently carry over to a public service. Owner must decide the public launch recovery standard. |
| Incidents and reports | A private, minimal human-handled incident/request process exists in the pilot runbook. There is no user-facing moderation dashboard, report history or automated appeals system. | Public volume, response capacity, backup/recovery and on-call expectations have not been approved. |

### Source paths reviewed

- `views/info/privacy.ejs`, `views/info/terms.ejs`, `views/info/community-rules.ejs`, `views/info/contact.ejs`, `views/auth/signup.ejs`
- `src/app/controllers/infoController.ts`, `src/app/routes/index.ts`
- `src/validators/auth.ts`, `src/app/services/registrationConsent.ts`, `src/app/repositories/registrationConsentRepository.ts`
- `docs/BETA_PRIVACY_OPERATIONS.md`, `docs/BETA_LEGAL_BASIS_REGISTER.md`, `docs/BETA_DATA_INVENTORY.md`, `docs/SECURITY_PRIVACY.md`, `docs/PRODUCTION_DEPLOYMENT.md`

## 3. DSA scope — provisional analysis, decision still open

The DSA applies to intermediary services offered to recipients established or located in the EU (Article 2). An intermediary service must be an information-society service. The DSA defines a hosting service as storage, at a recipient's request, of information supplied by that recipient; an online platform is a hosting service that also disseminates that information to the public, subject to the statutory ancillary-feature exception (Article 3).

The Vinyl Drop's user-submitted listings, photos, profiles and comments are stored and made publicly accessible. **If** the service is an information-society service within the DSA definition, those product facts are strong indicators of a hosting function and potentially the online-platform category. Public access, user posting and the product's central marketplace/community purpose mean the old invite-only pilot analysis cannot simply be carried forward.

There is, however, a material scope question that cannot responsibly be answered from source code alone:

- The information-society-service definition is for a service normally provided for remuneration, at a distance, by electronic means and at an individual recipient's request (Directive (EU) 2015/1535; DSA recital 5).
- The product is described as free and non-commercial; the reviewed sources do not identify user fees, subscriptions, commission or advertising revenue.
- The Court of Justice has confirmed that remuneration need not be paid by the recipient (for example, advertising-funded services can qualify). That case does **not** establish that every free, non-advertising hobby service is an economic service.
- Whether there is another form of economic activity or remuneration, and whether the operator's activity is within the relevant legal definition, requires a fact-specific legal assessment.

Therefore this note does **not** conclude that the DSA either definitely applies or definitely does not apply. Obtain qualified Dutch/EU advice or record a reasoned owner decision supported by counsel before opening registration.

### DSA obligations to assess if in scope

| Provision | What the law addresses | Current product observation |
| --- | --- | --- |
| Article 11 | Designated electronic contact point for Member State authorities, the Commission and the DSA Board; information must be accessible and current. | A public email exists, but neither the page nor the runbook expressly designates an authority contact point or its handling owner. |
| Article 12 | A central electronic contact point for service recipients, enabling direct, rapid, user-friendly communication and a choice of means that is not exclusively automated. | Email plus human-reviewed form are two useful methods. ACM guidance describes at least two user contact methods; production form delivery still needs a safe owner-controlled test. |
| Article 14 | Terms must explain content-use restrictions and the policies/procedures/tools used for content moderation; application must be careful, objective and proportionate. | Terms and Community Rules list some prohibited conduct and allow removal/restriction, but do not explain a sufficiently detailed moderation procedure or how reasons/redress are communicated. |
| Article 15 | Annual transparency reporting on content moderation, subject to the statutory micro/small-enterprise exemption. | No report is documented. Determine whether the service/provider is in scope and whether an exemption applies; do not infer exemption from the absence of a company record. |
| Articles 16–17 | Hosting providers need an accessible, user-friendly electronic notice-and-action mechanism and, where relevant, specific reasons for restrictions. | General Contact form has no dedicated item URL/location, reasoned illegality statement or good-faith declaration fields; no defined receipt/decision/redress workflow is evidenced. Terms do not describe Article 17-style decision notices. |
| Article 18 | A hosting provider that becomes aware of information suggesting certain serious offences threatening life or safety must notify competent authorities without undue delay. | No specific escalation procedure is recorded in the reviewed public pages. Add a realistic private runbook only if applicability is confirmed; do not promise automated detection. |

**Size exemptions require precise treatment.** DSA Article 19 exempts qualifying micro/small providers of online platforms from Section 3's additional platform provisions, except Article 24(3). That does not erase the baseline intermediary-service rules or the Section 2 hosting-provider provisions, including Articles 16 and 17. Article 15 separately exempts qualifying micro/small providers from its annual reporting obligation. Confirm whether the provider is an undertaking and meets the EU SME criteria before relying on either exemption. Do not confuse an exemption from particular obligations with a finding that the service is not an online platform.

### Online-marketplace rules

The DSA's additional marketplace provisions concern online platforms that enable consumers to conclude distance contracts with traders. The current product has consumer-to-consumer-looking vinyl listings, no checkout/payment/escrow/shipping, and buyer/seller arrangements outside the application. This makes the Section 4 trader-traceability regime less obviously applicable than the hosting analysis, but the seller's status and the extent to which the product enables an agreement must be assessed. Do not claim either that marketplace rules definitely apply or that absence of an in-app payment button definitely excludes them.

## 4. GDPR and Dutch operator-disclosure assessment

The prior legal-basis register records an owner-approved **pilot** working policy: Article 6(1)(b) only for objectively necessary requested service functions; Article 6(1)(f) for proportionate security/abuse prevention, minimal Terms/18+ evidence, password-safety checks and general enquiries with the listed safeguards; Article 6(1)(c) only for an actual legal obligation. Sending a contact message is not blanket consent.

That is a useful starting point, not a public-launch legal conclusion. A publicly accessible marketplace that processes account, profile, listing, photo, comment and contact data should not assume the GDPR's purely personal/household exception applies merely because the operator is an individual. The AP describes that exception as narrow and distinguishes genuinely private/restricted activity from public internet publication. Confirm controller status, each purpose and basis, legitimate-interest balancing, and Article 13 information for the broader service with qualified advice.

The existing Privacy Notice already explains many important details truthfully: public/private fields, provider roles and known transfer/retention limits, the 18+ attestation, manual data-subject requests, and the absence of automatic deletion and verified full recovery. Those statements need review against the public operating model, not wholesale replacement. In particular:

- Remove pilot-only claims only after the corresponding public operating decisions are actually approved and deployed.
- Review the purpose/legal-basis register for public content moderation, reports, legal notices, incident handling and any public analytics/marketing that might later be introduced.
- Keep actual provider retention and international-transfer statements provider-specific; an EU database region does not prove that all processing stays in the EU.
- Do not describe policy deletion targets as implemented automatic jobs, or manual erasure as fully tested.
- Do not promise a complete backup/restore or incident-response service that has not been exercised.

For Dutch business-website disclosure, government guidance lists business identity, physical address (with stated exceptions), contact details and business registration information for business websites. That guidance is not by itself a finding that this private individual project is a business. Determine whether public operation, seller facilitation, any income/benefit or future monetisation changes that classification. Do not invent a company, KVK number, representative or residential address.

## 5. Content rules and operational process

The current Community Rules provide a useful minimum prohibited-content list, including counterfeit records sold as originals and fraudulent listings. The Terms preserve user ownership and grant the operator a limited licence to host, process and display submitted content. Before public registration, the policies/runbook should additionally make clear:

1. Users may submit only images, text and other material they own or are authorised to use; explain the limited service licence and how to complain about suspected copyright/trademark infringement.
2. What a report should identify (specific listing/comment/profile URL, reason, and supporting information), where to send it, and how a human operator records and assesses it.
3. The types of actions the operator may take (no action, request clarification, restrict visibility, remove content, suspend an account), and that decisions are individual and proportionate.
4. How the affected user is informed of the decision and the available way to ask for human reconsideration. Do not promise a statutory internal appeal system unless legal scope says it applies.
5. How urgent threats, suspected illegal content, serious safety threats, data breaches and authority orders are escalated.
6. That reports are handled manually, only while the operator is available, with no guaranteed response time unless the owner explicitly adopts a workable service level.

The current Contact route can remain the single human intake channel if it is upgraded to collect the evidence required for the applicable notice process. Do not create a duplicate reporting product unnecessarily.

## 6. Owner decisions / launch blockers

The following are not questions that a source-code change can decide:

- **DSA and information-society-service classification:** obtain qualified Dutch/EU advice or record a reasoned, approved classification decision for the free, non-advertising, private-individual service.
- **Provider/SME status:** establish whether the operator is an undertaking and whether the EU micro/small-enterprise exemptions can be relied on. Do not assume Article 19 removes all DSA obligations.
- **Marketplace/trader model:** confirm whether users are private consumers or whether traders may list, and whether any contract is facilitated/concluded through the service.
- **Operator disclosure:** confirm the public legal identity and whether any business/address/KVK disclosure duty applies. No residential address will be published without explicit approval.
- **Authority contact:** designate an email/contact route for competent authorities and identify who monitors it.
- **Public content-reporting process:** approve a realistic human review and escalation process and any response expectation before the form is changed.
- **Recovery and incident risk:** explicitly accept or improve the pilot's data-loss, provider-retention and manual-incident limitations for a broader public audience.
- **Production tests:** perform the contact-form delivery check using a safe owner-controlled test message and confirm direct email is usable. This assessment did not submit a message or claim production delivery.
- **Registration gates:** separately verify the production Supabase provider-level signup setting and the app's invite-only/Google OAuth controls; this document changes none of them.

## 7. Source references

Official / primary sources reviewed on 1 November 2026:

- [Digital Services Act — Regulation (EU) 2022/2065, Dutch Official Journal text](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/nld) — Articles 2, 3, 11–19, 20–21, 24(3), 29–30.
- [Directive (EU) 2015/1535, Article 1(1)(b)](https://eur-lex.europa.eu/eli/dir/2015/1535/oj/eng) — information-society-service definition.
- [CJEU, C-291/13, Papasavvas](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62013CJ0291) — recipient need not be the party paying remuneration; the case concerned advertising-funded online information.
- [ACM — Tussenhandeldiensten](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten) — baseline DSA scope, contact points, transparency and content rules.
- [ACM — Online platforms](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-platforms) — additional online-platform regime and its scope.
- [Autoriteit Persoonsgegevens — Grondslagen AVG uitgelegd](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslagen-avg-uitgelegd) — lawful bases and personal/household exception.
- [Autoriteit Persoonsgegevens — Persoonsgegevens op internet](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/internet-telefoon-tv-en-post/persoonsgegevens-op-internet) — public online publication and personal data.
- [Business.gov.nl — Rules for business correspondence](https://business.gov.nl/regulations/rules-business-correspondence/) — disclosure duties for business websites; applicability to this private operation remains to be determined.
- [GDPR — Regulation (EU) 2016/679, Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) — information to provide when data is collected.

## 8. Next work sequence

1. Jaap obtains/records the unresolved legal and operator decisions above.
2. Based on those decisions, update Privacy Notice, Terms, Community Rules and the signup copy together; increment the Terms version and preserve the required acceptance/audit behavior.
3. Implement only the in-scope reporting/contact workflow that the confirmed legal classification requires; add regression tests for receipt, validation, privacy-safe handling and decision notices.
4. Update the private operations runbook with authority-contact, report triage, decision, incident and recovery processes.
5. Run CI and source verification, then separately verify production pages and the actual contact-delivery route under owner control.
6. Keep Issue #280 open until every Definition of Done criterion and Jaap's public-registration decision are satisfied.
