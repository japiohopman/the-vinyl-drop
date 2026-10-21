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

### Supabase and database environment boundary

- The application uses the owner's configured **remote Supabase project** for hosted PostgreSQL, Auth, and Storage. There is no local Supabase instance in the normal development setup.
- Never ask Jaap to install, start, or troubleshoot a hypothetical local Supabase service. Only discuss local Supabase if an explicit repository configuration change and owner-approved task actually introduce it.
- `npm run db:verify` and the isolated PGlite test engine verify migration/schema behavior in an in-memory test environment. They are **not** a local Supabase instance and do **not** prove that a migration ran against remote staging/production.
- State separately what source/tests prove and what was read-only verified against the remote project. Never invent remote database state or require an extra live operation just to improve confidence.
- Remote migrations, provider-setting changes, and live data mutations require the authorization specified by the governing Issue; do not perform them as ad-hoc diagnostics.

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

### Execution authority and delivery channel

**GitHub Issue = execution authority for authorized scope and acceptance.** The Issue defines the goal, scope, acceptance criteria, constraints, verification, specialist routing, and dependencies. Documentation and chat never supersede its scope.

**Active PR body = operational instruction surface for Jules once a PR exists.** Put concrete continuation/review instructions in the existing PR body, explicitly address `@Jules`, and state the exact change, verification, current status, and out-of-scope boundaries. If a notification is needed, add a separate comment on that same PR pointing Jules to the updated body; the comment does not replace the body.

**Jaap retains final human review and merge authority.** ChatGPT reviews source, tests, Issues, PRs, and workflow evidence; Jules implements the assigned Issue and does not select unrelated work.

### No invented pilot blockers

- Before calling something a release blocker, tie it to an actual acceptance criterion in the **current** pilot gate and to concrete source/runtime evidence. Distinguish a blocker for the five-person pilot from an expansion gate, accepted residual risk, and future product backlog.
- Do not reopen tests the owner has already confirmed complete unless a relevant code/runtime change gives a specific reason.
- Do not elevate provider-account details that the connected metadata cannot expose into an endless research task when the governing release decision explicitly allows the unknown to be disclosed.
- Do not create an Issue merely to restate an existing Issue, repeat a completed check, or turn an already-deferred task into a new gate. Update the governing Issue or durable context instead.
- Do not add local Supabase commands, services, or setup to the workflow; the environment boundary above is binding.

### Continuation loop

`Issue -> Jules -> branch -> PR -> CI -> ChatGPT review -> PR-body continuation -> Jules -> ... -> human merge`

When review finds defects within scope, keep the same branch and PR and update its body with exact corrections and verification. Create a separate Issue only when genuinely new scope is required; do not quietly expand the active Issue or create a second branch for routine continuation.

### Repeated owner corrections become durable rules

- If the owner has to repeat a correction because it is missing from durable context, treat that as a process failure—not as another one-off reminder.
- Convert the correction into a precise rule in this file or the most appropriate existing project source of truth.
- Do not mark any work complete because an agent said it is complete. Use the source, current tests, live checks already authorized, and current CI/workflow evidence.
- Keep the current operational status aligned with the governing Issues and PRs. Historical status snapshots must be clearly labelled historical, never presented as current release gates.
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

## Current project state — 2026-10-21 (verified release snapshot)

This is a compact status snapshot, not live telemetry. The current governing record is [Issue #88](https://github.com/japiohopman/the-vinyl-drop/issues/88); re-check current PR/workflow state before acting. Do not use older status wording to recreate release gates.

### First five-person pilot — only two remaining PRs

The intended first cohort is **at most five personally known adults**, with the server-side private-beta allowlist enforced. The current release sequence has exactly two required PR merges:

1. **PR #162 — privacy-safe Storage rollback diagnostics.** Source changes and regression tests are complete; CI, migration verification, build, and the PR safety contract passed. Jaap performs the final review and merge.
2. **PR #159 — reconcile/publish the pilot Privacy Notice and Terms with the approved scope.** The current PR records the owner-approved working policy and accepted residual DSA-scope uncertainty; provider-controlled/unknown retention is disclosed without unsupported claims. Its tests, migration verification, build, and CI passed. Jaap reviews/merges it after #162.

After both merges, do one focused staging smoke check that `/privacy` and `/terms` render the merged copy and match the current deployment. Invitations can be sent once those two merges and that smoke check pass. No general re-audit or extra provider operation is part of this release sequence.

### Completed, accepted, or deferred — not blockers for this pilot

- **#153 browser/network/cookie review:** owner-confirmed complete. Do not repeat it without a material change.
- **#156 contact form:** one end-to-end staging submission reached the operator inbox. Closed; do not repeat the delivery test without a concrete reason.
- **#155 backup/export/restore:** explicitly deferred by the owner for the five-person pilot. Possible loss of profile/personal data and listing photos is an accepted availability/recovery risk; no backup or restore test is claimed to have passed. This must not block the pilot.
- **#89 shared rate limits:** deferred until expansion beyond the bounded cohort. Manual report handling and the server-side allowlist remain in force for the first five testers.
- **#118 native Supabase leaked-password warning:** the native Free-plan warning remains and must not be described as cleared. The custom HIBP check and one-time signup approval hook passed the documented direct-signup/bypass tests. Keep reassessment as a gate before cohort expansion, not before this pilot.
- **#72 photo perspective correction:** future photo-quality backlog; not a pilot release dependency.
- **#82 auth email:** the signup-confirmation/recovery flow and sender/SMTP configuration were tested; optional desktop/mobile email-rendering polish was deferred and the Issue closed as not planned for this pilot.
- **#119 private-messaging trigger/search-path remediation:** migration 0012 and staging behavior were confirmed; the Issue is closed. Private messaging remains disabled unless separately approved.
- **Provider unknowns:** the exact Render workspace log-retention tier and account-specific Strato terms are not exposed through the connected metadata. The approved notice discloses provider-controlled/unknown retention. No plan upgrade, extra backup operation, or endless provider-account investigation is required for this pilot.

### Binding operating boundaries

- Supabase database/Auth/Storage are hosted on the configured **remote Supabase project**; do not assume or request a local Supabase instance.
- The pilot is free, invite-only, and adults-only (18+); no public waitlist, broad public signup, marketing, payments, escrow, shipping, or private messaging.
- Reassess deferred expansion gates only before a materially larger cohort, public/open signup, commercialisation, in-app transactions/payments, or enabling private messaging.
- Jaap owns all final merges and the decision to send invitations. Never equate green CI alone with deployment, legal certification, data recovery, or release authorization.

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
- invent or require a local Supabase service when the application is configured for remote Supabase;
- promote accepted/deferred/future work into a pilot blocker against the current Issue #88 release decision;
- create additional Issues to restate an existing release decision or repeat completed verification;
- allow an external metadata provider to become an undeclared source of truth.

