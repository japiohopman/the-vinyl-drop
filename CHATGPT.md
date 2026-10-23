# 🧠 CHATGPT.md — The Vinyl Drop Project Memory

> **Maintenance & authority notice**
>
> - Maintained by ChatGPT as durable project memory across chat sessions.
> - Jules and other implementation agents must treat this file as **read-only** and must not edit or mutate it.
> - This file is **advisory context only**. It is not an execution queue, task database, dispatch contract, or substitute for source code.
> - A GitHub Issue is the authoritative execution contract for implementation work.
> - Specialist contracts under \`.github/agents/\`, repository rules, source code, tests, and explicit Issue scope take precedence over this file.
> - Chat history and model memory are optional context; fresh sessions must reconstruct facts from the repository and assigned Issue rather than relying on conversation memory.

---

## Project identity

**The Vinyl Drop** is a local, community-driven marketplace for buying, selling and trading physical vinyl records.

The initial cultural focus is:
- 1990s hip-hop;
- soul;
- adjacent crate-digging culture.

The underlying data model remains genre-agnostic.

The desired product character is an independent record shop / crate-digging community rather than a generic classifieds platform, SaaS dashboard, Spotify clone, or eBay clone.

---

## Canonical product model

The most important domain distinction is:

**Release metadata != physical copy != listing.**

### Release

Canonical information about a musical release:
- artist;
- title;
- label;
- catalogue number;
- year;
- country;
- format;
- optional barcode;
- genre;
- optional external metadata references.

### Physical copy / Listing

A particular copy owned by a user and currently offered:
- seller;
- price;
- media condition;
- sleeve condition;
- photos;
- description;
- sale/trade intent;
- availability state.

Release metadata must not be duplicated into every seller listing.

A listing must reference a release.

---

## Current architectural direction

### Stack

- Node.js
- TypeScript
- Express
- EJS
- PostgreSQL
- Supabase
- Drizzle ORM / Drizzle Kit
- Zod
- Supabase Storage
- Sharp
- GitHub Actions
- Playwright for important browser flows

### Rendering

The application is intentionally **server-rendered**.

EJS owns presentation.

Do not introduce React, Vue, or another client-side application framework unless a concrete requirement changes the architecture.

Small TypeScript browser modules are allowed for progressive enhancement and localized interaction.

### Application boundary

Preferred flow:

\`request -> route -> validation -> service -> repository/database -> view model -> EJS\`

Rules:
- no SQL in EJS;
- no database calls from templates;
- no business-rule duplication in templates;
- no UI-owned canonical domain state;
- authorization belongs server-side;
- validation and database constraints both matter.

---

## Canonical data ownership

- Supabase Auth owns authentication identity.
- Application profile tables own public profile data.
- PostgreSQL owns canonical application data.
- Release records own release metadata.
- Listings own physical-copy offer state.
- Storage owns uploaded image bytes.
- Database rows own storage references, ownership and image ordering.
- External metadata providers are enrichment sources only.
- UI state is never authoritative domain state.

### Money

Prices are stored as integer minor units.

Example:

\`€34.95 -> 3495\`

Never store money as floating-point numbers.

### Images

Record photos do not belong in PostgreSQL binary rows.

Expected relationship:

\`listing -> listing_photos -> storage object\`

Uploaded images must have:
- MIME/type validation;
- size limits;
- safe dimensions;
- ownership checks;
- generated storage paths;
- server-side processing where appropriate.

Sharp is the planned image-processing boundary.

---

## MVP boundary

The MVP includes:

- accounts;
- public profiles;
- release metadata;
- individual listings;
- sale/trade intent;
- price;
- media/sleeve condition;
- multiple photos;
- descriptions;
- browse/search;
- listing detail;
- seller profile;
- authenticated comments.

The first release does **not** include:
- payments;
- checkout;
- shipping labels;
- escrow;
- full transaction settlement;
- recommendation engine;
- native mobile app;
- public API;
- AI-generated listings;
- complex reputation scoring.

Future trading and private messaging are separate domains and must not be simulated with comments.

---

## Mobile-first UI direction

Visual identity:

**90s record shop + crate digging + local music community.**

Principles:
- editorial;
- tactile;
- high contrast;
- restrained;
- image-led;
- catalogue-oriented.

Avoid:
- excessive rounded cards;
- generic SaaS aesthetics;
- gradient-heavy interfaces;
- large marketing hero sections;
- unnecessary pill controls;
- decorative UI that competes with record photography.

The mobile information architecture is conceptually:

\`HOME | BROWSE | + DROP | ACTIVITY | YOU\`

Desktop expands this same information architecture rather than becoming a separate product.

Important mobile checkpoints:
- roughly 360–390px;
- roughly 430px;
- 768px;
- 1280px.

Essential functionality must never depend on hover.

---

## Listing flow

The intended seller flow is:

1. Find release
2. Describe your copy
3. Add photos
4. Preview and publish

A final preview is required before publication.

Condition needs a centrally validated controlled vocabulary. The current candidate set is:

\`M, NM, VG+, VG, VG-, G+, G, F, P\`

Before migration/schema implementation, the exact values and user-facing grading descriptions must be confirmed in one canonical validation/data definition.

---

## Search strategy

Start with PostgreSQL.

Use:
- normal indexes for structured filters;
- normalized search fields;
- PostgreSQL text search/trigram capabilities only when justified.

Do not introduce Elasticsearch or another search service until actual scale or search requirements require it.

---

## Page architecture

Public surface includes:
- home;
- browse;
- search;
- listing detail;
- public profile;
- login/signup.

Authenticated surface includes:
- new listing;
- edit listing;
- listing photo management;
- preview/publish;
- profile edit;
- my listings;
- activity.

Shared EJS partials should include reusable presentation such as:
- header;
- mobile navigation;
- listing card;
- release metadata;
- condition display;
- profile header;
- comment thread;
- status/flash messages.

---

## Agentic workflow

### Execution authority

**GitHub Issue = execution contract.**

The Issue defines:
- goal;
- scope;
- acceptance criteria;
- constraints;
- verification;
- specialist routing;
- dependencies when applicable.

Documentation describes the architecture and roadmap but never acts as the execution queue.

### Human / ChatGPT / Jules boundary

**Jaap**
- owns product direction;
- performs final human review;
- decides whether to merge.

**ChatGPT**
- architecture and planning partner;
- inspects repository state, Issues, PRs and workflow behavior;
- creates/updates Issues when appropriate;
- reviews implementation;
- writes precise PR continuation instructions when work is incomplete;
- maintains this file.

**Jules**
- implements the assigned Issue;
- works on its branch;
- reports factual progress and verification;
- continues review fixes on the same branch when scope remains inside the Issue;
- does not select unrelated work or change architectural direction without authorization.

### Continuation loop

\`Issue -> Jules -> branch -> PR -> CI -> ChatGPT review -> PR continuation instruction -> Jules -> ... -> human merge\`

When a review finds defects inside scope:
- keep the same branch and PR;
- put exact required changes in the PR body;
- rerun verification;
- review again.

If the required work is genuinely new scope, create a new Issue instead of quietly expanding the active one.

### Review discipline: evidence, uncertainty, and proportionality

A review must reduce project risk and help the owner ship correct work. It must not create unnecessary work by turning unverified assumptions into firm instructions.

Before forming a review conclusion, ChatGPT must:

1. **Rebuild the actual context.** Read this file, the governing Issue and its acceptance criteria, applicable specialist contracts, the current PR body and diff, and the changed source files and tests. Inspect relevant callers/configuration and workflow details when needed. Treat author summaries, bot reviews, previous ChatGPT messages, and green CI as leads or evidence with limited scope—not substitutes for source inspection.
2. **Inspect the implementation itself.** Check the actual code path and test assertions, not just filenames, labels, summaries, or the presence of source-code strings. Trace a reported behavior far enough to distinguish an implementation defect from a test, fixture, environment, or configuration problem.
3. **Separate observation from inference.** State what was directly observed, what it suggests, and what remains uncertain. Do not present a plausible explanation as a confirmed root cause. Never claim a test, browser flow, environment, or artifact was checked unless it was actually inspected.
4. **Calibrate the finding to the evidence.** A screenshot showing HTTP 500 proves that the captured request returned an error in that test environment; by itself, it does not prove the feature branch UI is defective or identify the root cause. Check how the environment is set up and what dependencies the route requires before assigning cause. Where a feature branch does not have the live configuration or external services needed by a route, prefer a deterministic fixture for the real template/styles and controlled test data. Do not require a connection to Render, Supabase, or other shared live infrastructure when an isolated test can verify the acceptance criterion.
5. **Make verification meaningful, not ceremonial.** A check must assert the intended behavior—not merely that a script ran, selectors exist, or a page has no overflow. Browser evidence generators must fail if the expected page/content did not render, and account-state screenshots must represent the state they claim to verify. Test doubles must faithfully model the behavior under test; do not count skipped branches or impossible mock states as coverage. Keep test screenshots and videos outside `public/` unless the product intentionally serves them.
6. **Tie blockers to the contract.** Every blocker must identify the Issue acceptance criterion, a concrete defect, or a substantiated security/data-integrity risk that remains unsatisfied. Do not invent extra acceptance criteria or demand more infrastructure/evidence than is needed to resolve the question. Choose the smallest reliable verification that answers it. If evidence is unavailable or inconclusive, state the precise limitation instead of treating an assumption as a defect or requiring unrelated implementation work.
7. **Give Jules actionable, feasible instructions.** Name the affected file/behavior, explain the observed failure and why it matters, and prescribe a bounded correction plus the verification that would demonstrate success. Check that the requested command, test path, and environment are actually available or explain the test setup needed. Keep in-scope fixes on the current branch/PR and preserve human merge authority.
8. **Reconsider challenges without defensiveness.** When Jaap questions a finding or proposed action, re-check the repository and evidence from first principles. Correct the PR body/comment/instruction itself when it was wrong or overstated; do not merely apologize, defend the original wording, or transfer the diagnostic burden to Jaap. Do not make the owner repeatedly prompt for source inspection or correct avoidable assumptions.

### Review conclusion format

For material findings, use this compact structure:

- **Observed:** the exact source, test result, log, or artifact that was inspected.
- **Assessment:** why that observation does or does not violate a named acceptance criterion or create a concrete risk.
- **Confidence / unknowns:** any material uncertainty and what evidence would settle it.
- **Required action:** only the smallest in-scope change and proportionate verification needed.

A finding may be marked a blocker only when the assessment is supported. Green CI is useful but does not prove product correctness; missing or imperfect evidence is not automatically a product defect. The review's goal is a correct, maintainable outcome with justified confidence—not maximizing the number or strictness of gates. Do not merge without Jaap's explicit authorization.

### PR-body control protocol

The **PR body is the operational control surface for Jules after a PR exists**.

When ChatGPT continues or corrects Jules work:
- put the authoritative continuation instruction in the existing PR body;
- explicitly address Jules with **\`@Jules\`** so the instruction is surfaced to the implementation agent;
- state **NOT READY** while required work remains;
- describe exact required changes, exact verification, and explicit "do not change" boundaries;
- keep the continuation on the same branch and PR when the work remains within the governing Issue;
- do not create a second implementation branch merely to continue normal review work;
- do not rely on an informal chat message as the durable implementation instruction once a PR exists.

When the implementation is correct:
- update the PR body to **READY FOR HUMAN REVIEW**;
- keep the exact Phase Safety Gate headings and Definition of Done contract intact;
- the human, not Jules, performs the final merge.

The \`@Jules\` mention is a delivery mechanism; the GitHub Issue remains the execution authority and the PR remains the active review/continuation contract.

---

## Specialist roles

Initial specialist set:

### Architecture Specialist
Owns:
- domain boundaries;
- persistence ownership;
- service/repository architecture;
- canonical invariants.

### Data / Catalog Specialist
Owns:
- release metadata;
- condition semantics;
- normalization;
- search/data concerns;
- later external catalogue enrichment.

### UI Specialist
Owns:
- EJS;
- CSS;
- responsive behavior;
- accessibility;
- interaction design.

### Marketplace Specialist
Owns:
- listing lifecycle;
- sale/trade behavior;
- comments;
- later trade and messaging flows.

### Verification Specialist
Owns:
- deterministic tests;
- CI contracts;
- security/evidence verification;
- regression coverage.

---

## Workflow safety

Planned GitHub Actions architecture:

- \`ci.yml\`
- \`phase-safety-gate.yml\`
- \`jules-issue-dispatcher.yml\`
- \`jules-session-cleanup.yml\`
- \`chatgpt-review-relay.yml\`

The workflows should be inspired by Artificer but implemented specifically for The Vinyl Drop.

Safety rules:
- live Jules dispatch fails closed;
- test paths never call the live Jules API;
- duplicate work is blocked;
- stale-session deletion is explicit/manual;
- PR origin must not create a security bypass;
- green CI is evidence, not proof of product correctness;
- Jules completion text is not proof that an Issue is complete;
- human retains final merge authority.

---

## Current project state — 2026-10-21 (current snapshot)

This section supersedes the older status snapshot. Re-check linked GitHub Issues, PRs and workflows before acting; this file is advisory project memory, not live status telemetry.

### Recently completed

- **PR #152 is merged**: [docs(privacy): reconcile beta release evidence and remaining gates](https://github.com/japiohopman/the-vinyl-drop/pull/152), merge status verified on 2026-10-21; head `330ec93e1408bf43d278dae57abe6c0d6209b8a6`. Its source tests, CI, safety-gate and review-relay checks passed. It reconciles source/docs, registration-consent cookie disclosure, Terms version v2, provider observations, and a more complete recovery checklist. The merge does **not** mean the privacy/Terms drafts are approved for publication or that beta release gates have closed.
- **Issue #49 — staging coordination gate: CLOSED**. The owner closed the staging-verification coordination gate after the recorded runtime and authorization evidence. Do not repeat the inconclusive historical #133 live PATCH probe; the owner accepted the documented residual uncertainty based on the verified least-privilege mitigation.
- The owner already tested the key user-facing pages in localhost, Firefox and staging. Do not ask for those same functional checks again without a new, specific reason.

### Current privacy / beta release gates

- **Issue #88 — privacy and beta readiness: OPEN**, the umbrella release gate. Do not invite external testers or present public Privacy Notice/Terms as approved until applicable gates are evidenced or residual risks are explicitly accepted by Jaap.
- **Issue #153 — CLOSED on 2026-10-21.** Jaap confirmed the full browser/network/cookie review, including auth-cookie expiry/attributes, registration-consent / Terms+18+ flow and Discogs thumbnail-host check. Do not repeat it.
- **Issue #154 — OPEN; draft docs PR [#159](https://github.com/japiohopman/the-vinyl-drop/pull/159).** Official-source analysis separates baseline DSA scope from additional platform/marketplace duties and includes a proposed contact-form legal basis. Free/private-individual/invite-only operation alone does not establish a blanket DSA exemption. The per-purpose legal-basis register and LIAs remain owner-review proposals; public notices remain drafts.
- **Issue #155 — OPEN; draft recovery-plan PR [#158](https://github.com/japiohopman/the-vinyl-drop/pull/158).** The proposed plan separates app schema/data/roles, Auth identities and Storage object bytes, with encryption, off-repo retention, checksums and isolated restore acceptance. No live export, backup or restore has been performed. A real backup/isolated restore or an explicit owner risk/defer decision remains required.
- **Issue #156 — OPEN; draft implementation PR [#157](https://github.com/japiohopman/the-vinyl-drop/pull/157).** Contact form, route, validation, same-origin protection, honeypot, bounded process-local cooldown, Resend adapter, privacy copy and mocked tests are implemented. CI build-and-test passed on the recorded head. Deployed delivery and presence of `RESEND_API_KEY` in the running service have not been independently verified; no real email was sent without separate authorization.
- **Issue #82 — OPEN; beta auth-email gate.** PRs #115/#116 are merged, templates were saved in staging according to Jaap, and sender/SMTP delivery was configured and tested. Remaining work: one authorized post-merge staging signup-confirmation run through the current callback plus branded confirmation-email desktop/mobile rendering. Password recovery and new-password sign-in were already reported passed; don't repeat those flows without a relevant change.
- **Issue #89 — OPEN; P1 before external beta exposure.** Route-level/shared rate limits for auth/recovery/comments/uploads and the human report-triage path remain incomplete. The process-local per-email cooldown in #156 is only narrow contact-form abuse protection and does not satisfy #89. Proposed numeric limits/store behavior and staging proxy/IP test need the required owner decision and verification.
- **Issue #72 — OPEN; P2 future photo-quality enhancement, not a current beta-release blocker.** Four-corner perspective correction remains selected backlog work; its own issue says it is not a prerequisite for #66. Do not dispatch it just to unblock beta.
- **Issue #118 — direct Auth signup-bypass boundary: OPEN.** Three runtime tests were recorded as passed. The native Supabase leaked-password-protection warning remains on Free; do not claim it is cleared.
- **Issue #119 — private messaging trigger/search-path safety: OPEN.** Keep `MESSAGING_ENABLED=false` until remaining review and an explicit rollout decision are complete.
- The five-person limit describes the small initial pilot, not the long-term beta. All invitations remain subject to #88 and Jaap's explicit release decision.

### Operational boundaries

- Jaap owns product decisions and final merge. ChatGPT maintains this memory file; Jules and other implementation agents must treat it as read-only.
- Read-only browser checks must not alter Render/Supabase settings, invite testers, enable waitlists, or change provider configuration.
- Do not create accounts or complete OAuth merely to inspect the transient registration-consent cookie.
- Never equate a green CI/safety workflow or a merged documentation PR with legal approval, a verified backup/restore, or authorization to open the beta.

### Phase 0 foundation — historical record

Phase 0 — Product and Architecture Foundation was completed and merged to `main`. It established the product vision, MVP boundary, domain/data/technical architecture, UX direction, security/privacy baseline, route map, Issue strategy, and agentic workflow. **The old note saying Phase 1 is the next implementation phase is historical and no longer describes the current project state.**

## Jules Phase 0 review notes

Jules reviewed the Phase 0 foundation and agreed with the core product and architecture.

The following items were specifically identified as implementation attention points:

1. **Condition grading**
   - centralize the allowed grading values;
   - validate consistently with Zod and database constraints;
   - provide stable user-facing descriptions.

2. **Image pipeline**
   - treat mobile photo performance as a first-class requirement;
   - implement Sharp processing and a robust mobile upload flow;
   - avoid allowing unbounded original files into public presentation.

3. **Search**
   - begin with PostgreSQL search/filter capabilities;
   - avoid premature search infrastructure;
   - add complexity only when actual dataset/search requirements justify it.

These are implementation priorities, not new Phase 0 scope.

---

## Context recovery rule

A fresh AI session should reconstruct project state in roughly this order:

1. assigned GitHub Issue;
2. relevant specialist contract;
3. repository rules/context files;
4. \`docs/\` architecture documents;
5. current source code and tests;
6. recent PR/workflow evidence.

\`CHATGPT.md\` supplies durable advisory context but does not replace repository evidence.

---

## Anti-patterns

Do not:
- recreate a hidden task board;
- dispatch work from ROADMAP.md;
- introduce a parallel domain state store;
- duplicate release metadata in listings;
- put database logic in EJS;
- use comments as a trade engine;
- introduce React just for local interaction;
- add infrastructure before the product requires it;
- merge automatically without human review;
- silently broaden an Issue during a review loop;
- allow an external metadata provider to become an undeclared source of truth.

