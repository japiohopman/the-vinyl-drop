# Public-launch DSA scope assessment — The Vinyl Drop

**Governing issue:** [#280](https://github.com/japiohopman/the-vinyl-drop/issues/280)  
**Assessment date:** 3 November 2026  
**Status:** first-pass, source-based assessment — **not legal advice, not a final operator classification, and not launch approval**

## 1. Purpose and checkpoint conclusion

This note separates observed application/owner facts from the legal tests and from decisions that still require the operator or qualified Dutch/EU legal advice.

**No final conclusion is made that The Vinyl Drop is, or is not, an information-society service or an intermediary service under the Digital Services Act (DSA).** The DSA applies to intermediary services that are information-society services. The underlying definition includes a service normally provided for remuneration. The current owner-described model is free and non-commercial, operated by a private individual, with no provider advertising, membership fee or transaction fee. Those facts matter, but a free-to-user service is not automatically outside the test. The economic-activity question must be decided against the actual operating model, not by the invite-only switch or by assuming that every marketplace-like website is automatically in scope.

The prudent engineering position is to prepare a proportionate baseline hosting/reporting process while the scope decision is outstanding. That is risk preparation, not an admission that the DSA applies and not a claim of compliance.

## 2. Current product and operator facts reviewed

These are source/owner-record observations, not legal conclusions:

- The Privacy Notice identifies Jaap Hopman as the operator, acting as a private individual rather than a company. It states that the service is free and non-commercial. This assessment does not invent a company, KVK number, VAT number, business address or residential address.
- The recorded operating model has no paid membership, seller fee, advertising revenue, platform commission, in-app checkout or platform payment processing. These owner-described facts must be revisited before commercialisation or a product change.
- Users create and submit vinyl listings, descriptions, photographs, profiles and comments. These are persistent, user-supplied items; listing other users' records is a central product function, not an incidental comment box.
- Public browse/listing pages are accessible without an application account. The invitation-only control restricts who can create an account/use authenticated features; it does not make already-published listing content private.
- Sellers can advertise vinyl records for sale or trade. Current source has no in-app checkout or payment flow, and private messaging remains disabled. The evidence reviewed does not show that buyers and sellers conclude their distance contract through The Vinyl Drop's interface. A different contact or transaction flow would require a fresh assessment.
- Email/password registration requires server-side Terms acceptance and an 18+ self-attestation, recorded in the restricted registration-consent table. New accounts must start with email/password; after email confirmation, Supabase Auth can link a Google identity with the same verified email to that existing account. The Before User Created hook rejects a new Google identity that would otherwise create a separate Auth user. The application does not collect date of birth or identity documents solely for the age gate.
- The current Terms and Privacy Notice still describe an invite-only/private-beta pilot. The signup page says the Privacy Notice remains marked as a review draft. These statements are not suitable as final general-availability copy.
- The Contact page offers direct email and a web form. PR #332 is merged to main and adds structured report categories, the specific content URL, a reason and a good-faith confirmation. This is a source change only: production remains on an older code baseline, so it is not yet production evidence.
- The application does not persist a contact/report case history in PostgreSQL, does not send a separate reporter receipt confirmation, and does not automatically remove reported content. The manual handling document is a proposal; the operator's secure case-note location, retention and practical response capacity have not yet been approved or demonstrated.

## 3. Threshold question: information-society service and economic activity

### 3.1 Legal test

The DSA applies to intermediary services offered to recipients of the service in the Union (Article 2(1)). The DSA definition of an information-society service refers to Article 1(1)(b) of Directive (EU) 2015/1535: a service normally provided for remuneration, at a distance, by electronic means and at the individual request of a recipient.

A service storing information provided by a recipient at that recipient's request fits the functional definition of a hosting service (DSA Article 3(g)(iii)). If the DSA threshold is met, the service is then classified by function as an intermediary service, hosting service, online platform and, separately, possibly an online platform allowing consumers to conclude distance contracts with traders.

### 3.2 What the free-service case law does and does not establish

In **McFadden, C-484/14**, the Court of Justice explained that an information-society service must represent an economic activity. It also held that a service supplied free of charge can still be an information-society service when it forms part of the provider's economic activity; the user receiving the service need not be the person who pays. The example before the Court was free public Wi-Fi supplied by a business to advertise its own goods or services.

That judgment prevents the simplistic conclusion that "free to users" automatically means "outside the DSA". It does **not**, by itself, establish that every free, volunteer-run hobby/community website is an economic activity. The facts in McFadden involved an operator's commercial activity and are not the same as the current owner-described model for The Vinyl Drop.

### 3.3 Application to the current facts

Factors pointing away from an operator-side economic activity in the present recorded model are: operation by a private individual; no company identified; no fee, commission, paid membership, advertising or monetised provider service; and an expressly non-commercial purpose.

Factors which still need to be considered are: the service is designed around public listings of goods for sale/trade; users may carry out economic transactions with one another; and the service provides the electronic infrastructure through which those offers are presented. The existence of seller transactions does not, without more, prove that the operator itself supplies the service in the course of an economic activity. Equally, the current facts do not justify a definitive legal conclusion without assessing all relevant circumstances.

**Finding:** the information-society-service / economic-activity threshold remains unresolved. Before public registration, obtain a reasoned owner decision informed by qualified Dutch/EU advice if the conclusion is material to launch. Reassess if the operator begins charging, accepting advertising, earning commissions, providing paid seller services or operating through a commercial undertaking.

## 4. Conditional DSA obligations by service layer

The following matrix describes what would need to be assessed **if the threshold scope test is met**. It is not a finding that every layer applies.

| Layer | Legal framework | Current product assessment |
| --- | --- | --- |
| Intermediary-service baseline | DSA Section 1, including Articles 11 and 12 | If in scope, designate and publish an authority contact point and accepted languages (Article 11). Designate and publish a user contact point supporting direct, rapid, electronic communication and a choice of communication method, not solely automated contact (Article 12). |
| Hosting service | DSA Section 2, especially Articles 16 and 17 | User listings, descriptions, photographs and comments are stored at users' request. If the DSA threshold applies, the hosting notice-and-action mechanism and affected-user statement-of-reasons duties require a specific gap review. |
| Online platform | DSA Section 3, Articles 19–28 | The statutory definition concerns hosting that stores information at a user's request and disseminates it to the public. Public listing pages fit the functional pattern. Article 19 excludes qualifying micro and small providers from most of Section 3, except Article 24(3). The ACM also explains size and commercial-activity criteria for the additional platform layer. Operator/undertaking size and linked/partner-enterprise aggregation have not been legally verified. |
| Online marketplace | DSA Section 4, Articles 29–32 | This is a separate layer for online platforms that allow consumers to conclude distance contracts with traders. The current app has product offers but no in-app checkout/payment or private messaging. Whether consumers can conclude contracts with traders through the service, and whether individual sellers are acting as traders, must be determined from the actual transaction journey. Article 29 contains a separate micro/small-enterprise exclusion for this Section. |

### 4.1 User and authority contact points

The ACM's current guidance says an in-scope intermediary service should have a central user contact point offering at least two ways to contact the provider, with no more than one automated option. It separately identifies a central contact point for authorities.

The Contact page has two non-automated user routes: direct email and a web form. That is a plausible fit for the two user communication methods, subject to production discoverability, usability and delivery verification. It should be treated as one clearly signposted central user contact point with a choice of methods, not as proof that the authority contact requirement is also met.

No separate authority contact owner, monitored channel or accepted language set has yet been designated. Article 11 requires authority contact information to be public and up to date, and accepted languages to include at least one official language of the Member State of establishment plus a language broadly understood by the largest possible number of Union citizens. Dutch and English are practical candidates, but the operator must confirm monitoring and the ability to respond in those languages.

### 4.2 Hosting notices: Article 16

If Article 16 applies, an electronic notice mechanism must be easy to access and user-friendly and facilitate notices containing:
- a sufficiently substantiated explanation of why the specific information is alleged to be illegal;
- a clear indication of the exact electronic location, such as the URL;
- the notifier's name and email address, **except** where the information is considered to involve one of the offences in Articles 3–7 of Directive 2011/93/EU; and
- a statement that the notifier believes in good faith that the information and allegations are accurate and complete.

Where the notice contains the notifier's electronic contact details, Article 16(4) requires a receipt confirmation without undue delay. Article 16(5) requires the notifier to be informed of the decision and available redress without undue delay. Article 16(6) requires notices and decisions to be handled in a timely, diligent, non-arbitrary and objective manner.

PR #332 improves the existing intake form but does not complete this conditional Article 16 assessment:
- It currently requires a name and reply email for all formal notice categories. It does not implement the narrow Article 16(2)(c) exception. Do not broaden or narrow identity collection until that exception is reviewed and implemented accurately.
- It does not send a distinct receipt confirmation to the reporter. The current success response describes only the email-provider hand-off to the operator; that is not a reporter receipt.
- It does not provide an implemented decision/notification workflow or a demonstrated way to send redress information. The manual procedure is a proposal, not evidence of an established case process.
- It has no database case history or ticketing. A proportionate private manual record may be sufficient for a one-person operation, but the secure location, retention, access and actual monitoring capacity require owner approval.

Do not confuse Article 16 notice-and-action with the separate Article 20 internal complaint-handling system. Whether Article 20 applies depends on the online-platform layer and any applicable Article 19 exemption.

### 4.3 Affected-user reasons: Article 17

If Article 17 applies, a hosting provider must give an affected user a clear, specific statement of reasons for a covered restriction (including removing content, restricting visibility or suspending an account) where relevant electronic contact details are known. The statement must explain the action, its scope/duration where relevant, the facts and circumstances, the legal or contractual ground and available redress; it must also state whether automated means were used where applicable.

The proposed manual report procedure describes the information a case note and restriction notice should contain. It does not yet demonstrate an approved secure record location, a usable notification template, an operational retention rule or capacity to meet the required handling/notification standard.

### 4.4 Small-enterprise exemptions are limited, not universal

Article 19 applies to **Section 3** (additional online-platform obligations), except Article 24(3), for providers qualifying as micro or small enterprises under Recommendation 2003/361/EC. It does not switch off the DSA's baseline intermediary-service provisions in Section 1 or the hosting-service provisions in Section 2.

Article 29 contains a separate exclusion for qualifying micro/small providers from **Section 4** (online platforms allowing consumers to conclude distance contracts with traders). Neither provision is a blanket exemption from the whole DSA.

Whether the provider is an undertaking, whether it qualifies as micro/small, and whether linked/partner enterprises must be aggregated are not established by the fact that the operator currently acts as a private individual. Do not claim an SME exemption until those conditions have been checked.

## 5. Current copy and operational gaps independent of final classification

The following inconsistencies are directly visible in the current source:

- The Terms describe The Vinyl Drop as a free, invite-only pilot and say access is restricted to invited adults.
- The Privacy Notice describes a free, invite-only pilot and refers to its current pilot status. It accurately describes provider/retention limitations, including the absence of self-service erasure and a verified full backup/restore path; those limitations must not be silently removed from public copy.
- The signup page currently says that the Privacy Notice remains marked as a review draft.
- The Community Rules now describe user content rights/authenticity and the structured content-report route. The related manual report-handling document remains explicitly a proposal, not a compliance certificate.
- The current Terms permit proportionate removal/account restrictions and manual review, but they still use pilot language and do not yet reconcile final legal scope, any applicable formal decision/reasons duties, the Article 20 question or the Terms version/re-acceptance strategy.
- PR #332 is merged to main, but production runs an older baseline. Its contact-form changes must not be described as live on production until the separate production release and a safe, synthetic delivery test are approved and completed.
- GDPR transparency, legal-basis, data-subject rights, processor/transfer and retention obligations are a separate analysis. A conclusion that the DSA does not apply would not remove GDPR obligations.

Do not rewrite public Terms, Privacy Notice or signup wording to claim general availability until the operator model, legal disclosures and Terms version/acceptance decision are approved.

## 6. Decisions and evidence still required

### Owner / qualified-advice decisions

1. Decide, with qualified Dutch/EU legal advice where needed, whether the present private, free and non-commercial service is an information-society service and an intermediary service under the DSA.
2. Determine the correct service layers (hosting, online platform and online marketplace) against the real browse, listing and seller/buyer transaction journey.
3. Determine operator/undertaking status and any micro/small-enterprise status, including linked/partner-enterprise aggregation. Do not infer this solely from operating as a private individual.
4. Confirm which public operator identity/contact disclosures apply under Dutch law to this actual activity. Do not invent a company, registered office, KVK/VAT identifier or publish a private residential address without a reasoned basis and explicit approval.
5. Designate the authority contact route, person responsible for monitoring it, and accepted languages if Article 11 applies.
6. Approve the private case-note location, access, retention and one-person handling capacity. Do not introduce a paid ticketing service or database moderation system without a separate approved scope.

### Engineering and verification after the scope decision

1. If Article 16 applies, implement and test its narrow Article 16(2)(c) identity exception, reporter receipt confirmation when electronic contact details are supplied, decision communication and redress information.
2. If Article 17 applies, ensure restrictions can produce a clear, specific affected-user statement of reasons and a recorded route to applicable redress.
3. Decide whether an Article 20 system is required or excluded by the applicable online-platform/SME analysis. Do not label the proposed informal human reconsideration process as a statutory Article 20 system until that decision is made.
4. Reconcile Terms, Privacy Notice, Community Rules, signup copy and the Terms-version/re-acceptance strategy with the approved scope and actual product.
5. Verify the production user contact methods and production contact delivery using synthetic data only after the separate production release process is authorised. Provider acceptance alone is not proof of mailbox receipt.
6. Keep registration invite-only, keep production settings unchanged and obtain Jaap's explicit go/no-go before public signup.

## 7. Official sources reviewed (3 November 2026)

- [Regulation (EU) 2022/2065 — Digital Services Act, official EUR-Lex text](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng), especially Articles 2, 3, 11, 12, 16, 17, 19 and 29–32, and recitals 13–14.
- [Directive (EU) 2015/1535, Article 1(1)(b)](https://eur-lex.europa.eu/eli/dir/2015/1535/oj), defining an information-society service.
- [Court of Justice, McFadden v Sony Music, C-484/14, ECLI:EU:C:2016:689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62014CJ0484), especially paragraphs 40–43 (economic activity and free-to-user services).
- [ACM — Tussenhandeldiensten](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten), including user and authority contact points and the layered intermediary/hosting/platform/marketplace framework.
- [ACM — Online platforms](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-platforms), including the additional platform criteria and complaint-handling guidance.
- [ACM — Online marketplaces](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/online-marktplaatsen), for the separate consumer/trader marketplace layer.
- [Commission Recommendation 2003/361/EC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003H0361), for micro/small-enterprise definitions.

## 8. Status and boundary

**Status remains NOT READY.** This is a first-pass legal-scope and implementation-gap assessment; it does not certify compliance, settle the economic-activity question, approve policy changes or authorise public registration.

No production/staging settings, secrets, provider configuration, databases, user data, deployments, signup gates or messaging/rate-limit flags were changed while preparing this note. No production report was submitted.
