# Public Content Reports — Proposed Manual Handling Procedure

**Governing issue:** [#280](https://github.com/japiohopman/the-vinyl-drop/issues/280)  
**Status:** implementation and operating proposal for owner review — **not** a legal opinion, compliance certificate, or approval to open public registration.  
**Review date:** 3 November 2026

This document proposes a small, human-operated process for reports about listings, profiles, comments and other user-submitted content. It is deliberately not a moderation platform, ticketing system or automated legal-classification tool.

## 1. Current intake design

The existing `/contact` page provides two human contact routes: direct email and a web form. The structured form implementation was added by PR #332, merged to `main` on 3 November 2026, and is included in the current Live staging deploy. It collects:

- The category of the message.
- The submitter's name (required for the formal illegal-content, copyright/trademark and counterfeit/fraud notice categories) and reply email address.
- The exact page URL for formal content notices and Community Rules reports.
- A factual explanation of what is reported and why.
- A good-faith confirmation for the formal notice categories.

The form uses the existing same-origin `POST /contact` route and the Resend delivery service. The route is wired to shared contact rate-limit middleware, but that middleware is deliberately **inactive** while `SHARED_RATE_LIMITS_ENABLED=false`; the separate activation decision remains open under #89. The form does not accept file uploads. The application does not persist a report or support-message history in PostgreSQL and does not automatically hide or remove the reported item. The service hands the message to Resend; this is not proof that it reached or was read in the operator's mailbox. The email provider and receiving mailbox have their own retention and access controls.

**Environment boundary (3 November 2026):** PR #332 is merged to `main`, and the current `main` revision containing it is Live on staging. Production remains deliberately on the older PR #286 baseline with Auto-Deploy off. No production contact-form submission or delivery test has been performed for this implementation. Treat the new form as production-verified only after the separately authorised production release and an owner-controlled end-to-end delivery check.

## 2. Scope and triage categories

Treat each report as one of these categories:

| Category | Initial treatment |
| --- | --- |
| Allegedly illegal content | Check the exact item and the alleged legal basis. Do not assume that every objection makes content illegal. |
| Copyright or trademark | Identify the specific work/mark, the relevant rights, the claimant's relationship to those rights, the exact URL and the explanation of the alleged infringement. |
| Counterfeit record or fraud | Check the listing, the claim that the record is counterfeit or misrepresented, and any relevant evidence. Do not treat ordinary grading or metadata disagreement as proven fraud. |
| Community Rules | Compare the specific item with the published rule and record the relevant facts. |
| Safety concern | Triage for immediacy and credible threat first. Do not wait for a routine queue if someone may be in immediate danger. |
| Privacy request | Route to the separate privacy-request workflow in docs/BETA_PRIVACY_OPERATIONS.md; do not put request details in GitHub. |
| General question | Handle as an ordinary contact message. |

Do not ask people to upload or email copies of illegal material. Ask only for the page URL and a factual explanation. Do not invite sensitive personal data that is not needed to identify and assess the report.

## 3. Human review workflow

1. **Check delivery.** Confirm that the message reached the operator's restricted mailbox. A web success screen only means the mail provider accepted the send request; it does not prove mailbox delivery.
2. **Create a minimal private reference.** Record the date/time received, category, URL, a private case reference, priority, current status and the date of the last action. Keep names, reply addresses and message contents only in the restricted mailbox unless a separate operational need justifies a minimal case note.
3. **Triage urgency.** Look first for an immediate risk to a person's life or safety, credible threats, ongoing exploitation or other urgent circumstances. If a person appears to be in immediate danger, contact the appropriate emergency service. Where the conditions in DSA Article 18 apply, promptly notify the relevant law-enforcement or judicial authority and provide the relevant information available. Do not investigate crimes yourself or circulate suspected illegal material.
4. **Identify the exact item.** Check that the URL identifies the relevant listing, profile, comment or image. If the notice is incomplete, request only the missing information needed to identify the item and understand the allegation.
5. **Assess objectively.** Distinguish alleged illegality from a breach of The Vinyl Drop's Community Rules. Consider the reporter's evidence, the affected user's interests, relevant rights and the exact wording of the rule or legal ground. Do not use automated moderation decisions; no such system is implemented.
6. **Choose a proportionate outcome.** Possible outcomes are: no action; request clarification; warn or ask a user to correct information; restrict visibility temporarily where justified; remove the relevant item; or restrict an account where the facts justify it. Do not delete evidence or restrict an account merely because a report was submitted.
7. **Tell the reporter what happened.** Where the report can be handled, send a decision or status update without disclosing another user's private information. If no action is taken, explain the reason at an appropriate level and the available way to raise a further concern.
8. **Tell an affected user about a restriction.** Where content or an account is restricted, send a clear, specific reason to the affected user using the relevant account contact details. Record the action, the facts relied on, whether it followed a user notice or the operator's own review, the applicable legal or Terms/Community Rules ground, any automated means (none are currently used), and the available routes for reconsideration or other redress. Do not disclose the reporter's identity unless it is strictly necessary and lawful.
9. **Allow human reconsideration.** The affected user may reply to the decision notice or use the Contact page to request human reconsideration. Review the original evidence and any new information, then record and communicate the outcome. This is a proposed informal manual route; it must not be described as a statutory DSA Article 20 internal complaint-handling system or Article 21 out-of-court settlement process unless legal scope and any exemption have been established.
10. **Close and minimise.** Keep the minimum private record needed to explain the decision and demonstrate handling. Do not place reporter details, content copies, account identifiers, screenshots or case records in public GitHub issues, PRs or source control. Apply an owner-approved deletion date after the legal/operational retention basis is confirmed.

## 4. Decision and notice content

For a report decision, the private case note should capture:

- Private case reference and receipt / decision timestamps.
- Exact URL and category.
- The allegation and evidence considered, stored only as necessary.
- Whether the decision followed a user notice or an operator-initiated review.
- Outcome: no action, clarification requested, visibility restriction, removal, account restriction or other stated action.
- The facts and relevant legal / contractual rule relied on.
- The reason the chosen action is proportionate.
- The reporter notification and affected-user notification dates.
- Any request for reconsideration and its outcome.

For a restriction notice to an affected user, use plain language and explain the action, its scope and duration where relevant; the facts and circumstances; whether it followed a notice or own-initiative review; whether automated means were used; the legal ground or Terms/Community Rules clause; and the available redress. DSA Article 17 contains specific statement-of-reasons requirements for hosting providers in the circumstances it describes. Whether The Vinyl Drop is in scope and the exact applicable redress duties remain subject to the legal assessment under #280.

## 5. Authority and urgent-safety handling

- A distinct authority contact point under DSA Article 11 has **not yet been designated**. The existing public operator email is a candidate, not a recorded owner decision. Jaap must confirm the route, the person monitoring it and the languages in which authority communications can be received before the public-launch copy claims this requirement is satisfied.
- Validate an apparent authority request through an official channel before disclosing information. Record the authority, legal instrument, scope, deadline, what was provided and who approved the response. Seek qualified advice where scope or legality is unclear.
- If there is a credible suspicion of a criminal offence involving a threat to life or safety, follow the escalation described in DSA Article 18 where it applies. For immediate danger, use the relevant emergency services. Do not promise that a private marketplace operator can investigate or resolve an emergency.

## 6. Capacity, availability and service levels

This is a one-person manual process. It is not monitored continuously and has no staffed on-call rota, moderation dashboard, automated detection, automatic evidence preservation, ticketing system or guaranteed response time. The public Contact page must not promise a response SLA that Jaap has not explicitly accepted and can realistically meet.

Before public registration, Jaap must explicitly decide whether this operating model is adequate for the expected volume and risk. If not, public registration remains closed until capacity or scope is adjusted.

## 7. Legal and product boundaries

The ACM's current Dutch guidance says intermediary-service providers should make a central user contact point available and provide at least two ways to contact the provider, with no more than one automated. Article 12 DSA itself describes a single electronic, user-friendly point of contact and does not state a numeric two-method rule; the ACM guidance is the current Dutch practical guidance.

If the DSA applies and the service is a hosting service, Article 16 requires an accessible electronic notice-and-action mechanism that supports sufficiently precise, substantiated notices, including the reasons, exact content location, reporter name and email (subject to the narrow statutory exception) and a good-faith accuracy/completeness statement. Article 16 also addresses receipt confirmation, decision notification and timely, diligent, non-arbitrary and objective processing. Article 17 requires clear and specific reasons to affected users for the relevant restrictions.

The small/micro enterprise exemption in Article 19 applies to the additional online-platform rules in Section 3 (with the Article 24(3) exception). It does not remove the hosting-service duties in Section 2, including Articles 16 and 17. It may remove Article 20/21 requirements only if the provider and undertaking actually qualify for the exemption. Do not assume eligibility merely because this is a one-person project.

The DSA's application to this privately operated, currently free service remains a fact-specific legal-scope question under #280. This operational proposal is a precautionary design, not a conclusion that the DSA applies or a certification that it does not.

## 8. Owner decisions still required before public launch

- Confirm the DSA / information-society-service and hosting/online-platform classification with qualified Dutch/EU advice or a documented, reasoned owner decision.
- Establish operator/undertaking status and whether any micro/small-enterprise exemption is available, including linked/partner-enterprise aggregation where relevant.
- Confirm the public legal operator identity and whether any Dutch business website disclosure (address / KVK / VAT) applies. Do not invent a company or publish a residential address without explicit approval.
- Designate the authority contact point, monitor owner and accepted languages.
- Approve whether the manual one-person response capacity is adequate and any realistic response expectation.
- Confirm how report/decision notes are stored privately and when they are deleted.
- Update the Terms of Use and Community Rules together, agree a Terms version / existing-user notice or reacceptance strategy, and ensure the wording matches actual moderation and redress.
- Verify direct email usability and test actual production form delivery with an owner-controlled message.
- Review the public Privacy Notice for report-category, URL, explanation and retention disclosures before the public-service policy copy is released.

## 9. Sources

- ACM, [Tussenhandeldiensten](https://www.acm.nl/nl/digitale-economie/online-diensten-aanbieden/tussenhandeldiensten) — current Dutch guidance on contact routes, authority contact and basic intermediary duties.
- ACM, [Illegale of opzettelijk onjuiste content](https://www.acm.nl/nl/digitale-economie/rechten-van-ondernemers-bij-online-diensten/illegale-opzettelijk-onjuiste-content) — practical notice, decision and user rights guidance.
- Regulation (EU) 2022/2065, [Digital Services Act, Articles 11–21](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/nld) — contact points, terms, notice-and-action, statements of reasons, serious-offence escalation and online-platform redress.
- Recommendation 2003/361/EC, [EU micro and small enterprise definition](https://eur-lex.europa.eu/eli/reco/2003/361/oj/eng) — enterprise-size test.
