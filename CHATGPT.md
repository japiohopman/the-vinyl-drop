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

- **Issue #88 — privacy and beta readiness: OPEN**, the umbrella release gate. Do not invite external testers or present the public Privacy Notice/Terms as approved until applicable gates are evidenced or residual risks are explicitly accepted by Jaap.
- **Issue #153 — staging Network/Cookies evidence: OPEN.** This is a narrow, read-only evidence task, not a request to repeat all earlier browser checks. Already reported: pages `/privacy`, `/terms`, and `/auth/signup` were checked; `sb-access-token` and `sb-refresh-token` were reported with `Secure=Yes`, `HttpOnly=Yes`, `SameSite=Lax`; normal site fonts were confirmed as local. Exact remaining evidence:
  1. Owner has now confirmed for both `sb-access-token` and `sb-refresh-token`: `Secure=Yes`, `HttpOnly=Yes`, `SameSite=Lax`, expiry displayed as `Fri, 20 Nov 2026 03:13:52 GMT`. Do not repeat this completed check. Exact `Domain` and `Path` are not recorded in this correction and should only be pursued if readily available without repeating the inspection.
  2. At the precise Google-sign-up redirect point, check whether `tvd-registration-consent` is set and record safe attributes only. Test sequence: on staging `/auth/signup`, tick Terms of Use and 18+; with Firefox DevTools Network open, click **Sign up with Google**; inspect the `POST /auth/google/start` redirect response / `Set-Cookie` headers or the staging-origin Cookies view, then stop as soon as the browser redirects to Google. Do not complete OAuth or create an account; the callback clears this cookie.
  3. During a catalogue/release search using an already-authorized session, record the actual external image-hostname(s) serving result thumbnails. Discogs/MusicBrainz API lookups are server-side and are not expected to appear as browser API requests.
  Record browser version and clean-session/private-window details if known; the earlier evidence did not capture them. Never save cookie values, tokens, OAuth codes, authorization headers or raw HAR files. Do not repeat already completed checks merely to reproduce them.
- **Issue #154 — legal/operator/contact review: OPEN.** Resolve and record the actual legal scope, contact obligations, operator wording and owner-approved per-purpose legal-basis register. No legal certification is claimed; keep Privacy Notice and Terms marked as drafts until approved.
- **Issue #155 — backup/recovery plan: OPEN.** Supabase is on the Free plan. A plain database dump is not a full recovery plan; application data, Auth identities and Storage bytes/references must each have an appropriate path and isolated restore verification. No backup/export/restore or plan upgrade is authorized by documentation work.
- **Issue #156 — secondary contact form: OPEN / READY for implementation.** Jaap confirmed the existing Resend API sender and Auth SMTP setup were configured and tested. The app still needs its own contact-message handler wired to the already-approved Resend configuration. Do not repeat provider setup, change live settings, create new secrets, add paid services, or claim delivery works until the application path is verified.
- **Issue #118 — direct Supabase Auth signup-bypass protection: OPEN.** The recorded normal signup, breached-password rejection, and direct-Auth rejection tests passed. The native Supabase `auth_leaked_password_protection` warning remains on the Free plan. This issue must be reviewed/resolved before expanding beyond the limited pilot; do not say the native warning is cleared.
- **Issue #119 — private messaging trigger/search-path safety: OPEN.** The recorded staging migration verification removed the mutable-search-path warning, but private messaging must stay disabled (`MESSAGING_ENABLED=false`) until the remaining review and an explicit rollout decision are complete.
- **Issue #89 — rate limits and abuse/report handling: OPEN.** Do not treat the existing contact email as proof that rate limits and a documented abuse-response process are implemented; resolve the required controls before broader external beta exposure.
- The five-person limit refers to the explicitly bounded initial pilot, not the long-term beta target. Any pilot invitations remain subject to #88's applicable hard gates and the owner's explicit release decision.

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

