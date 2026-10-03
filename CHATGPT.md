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

## Current project state

Phase 0 — Product and Architecture Foundation is complete and merged to \`main\`.

Phase 0 established:
- product vision;
- MVP boundary;
- domain model;
- data architecture;
- technical architecture;
- UX/UI direction;
- security/privacy baseline;
- page/route map;
- Issue strategy;
- agentic workflow;
- architectural decisions.

No application implementation was part of Phase 0.

The next implementation phase is:

**Phase 1 — Repository and Agentic Workflow Foundation**

Expected responsibilities:
- Node/TypeScript application bootstrap;
- lint/test/build commands;
- initial Express/EJS shell;
- GitHub Issue templates;
- PR template;
- specialist agent files;
- Jules selector/dispatcher;
- CI;
- phase safety gate;
- review relay;
- stale-session cleanup;
- this context contract wired into repository guidance.

---

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

