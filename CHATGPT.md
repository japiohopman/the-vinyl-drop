# CHATGPT.md — The Vinyl Drop: durable project context

> **Authority and upkeep**
>
> - Maintained by ChatGPT as advisory context for fresh chat sessions. Implementation agents (Jules and others) treat this file as **read-only**.
> - This file holds what stays true for months: identity, invariants, boundaries, working agreements. It holds **no live status**.
> - **Current status lives in GitHub**: open Issues, PRs, workflow runs. Never answer "where are we?" from this file.
> - Precedence when sources disagree: assigned Issue > `.github/agents/*` > `AGENTS.md` > source code and tests > this file.
> - Keep this file short. If a line is about "now", "next", or a specific PR/Issue number, it belongs in an Issue, not here.

---

## What this is

**The Vinyl Drop** is a local, community-driven marketplace for buying, selling and trading physical vinyl records. Rooted in Amsterdam Oost; initial cultural focus is 1990s hip-hop, soul and adjacent crate-digging culture. The data model stays genre-agnostic.

Product character: an independent record shop and crate-digging community. **Not** a generic classifieds site, a SaaS dashboard, a Spotify clone or an eBay clone.

## Core domain rule

**Release metadata ≠ physical copy ≠ listing.**

- **Release**: canonical musical release (artist, title, label, catalogue number, year, country, format, optional barcode, genre, optional external references). One source of truth, never duplicated per seller.
- **Listing**: one seller's physical copy offer. Must reference a release. Owns price, media and sleeve condition, photos, description, sale/trade intent and availability state.

## Stack

Node.js, TypeScript, Express, EJS, PostgreSQL on Supabase (Auth, Storage), Drizzle ORM/Kit, Zod, Sharp, Resend (email), Render (hosting), GitHub Actions, Playwright for key browser flows.

**Server-rendered only.** EJS owns presentation. No React/Vue/SPA framework unless a concrete requirement changes the architecture. Small TypeScript modules for progressive enhancement are fine.

Flow: `request → route → validation → service → repository/database → view model → EJS`

## Invariants

- No SQL, database calls or business rules in EJS or routes.
- Authorization and validation happen server-side; validation and database constraints both matter.
- Money is stored as integer minor units (`€34.95 → 3495`). Never floats.
- Condition vocabulary is `M, NM, VG+, VG, VG-, G+, G, F, P`, defined once and validated by Zod and database constraints.
- Ownership of data: Supabase Auth owns identity; PostgreSQL owns application data; Storage owns image bytes; database rows own storage references, ownership and photo ordering. UI state is never authoritative.
- External metadata providers (e.g. Discogs) are enrichment only, never the source of truth.
- Photos never live in PostgreSQL. Uploads need type validation, size limits, safe dimensions, ownership checks, generated storage paths and server-side processing (Sharp).
- Search starts with PostgreSQL (indexes, normalized fields, text search/trigram only when justified). No separate search service until real scale demands it.

## Scope boundaries

In scope: accounts, public profiles, releases, listings with sale/trade intent, price and condition, multiple photos, browse/search, listing detail, seller profiles, authenticated comments.

Out of scope unless an Issue says otherwise: payments, checkout, shipping, escrow, transaction settlement, recommendations, native apps, public API, AI-generated listings, reputation scoring.

Private messaging and trading are **separate domains**. Never simulate them with comments. Messaging stays disabled (`MESSAGING_ENABLED=false`) until the owner explicitly decides to roll it out.

## UI direction

Mobile-first. Editorial, tactile, high-contrast, restrained, image-led, catalogue-oriented. Navigation concept: `HOME | BROWSE | + DROP | ACTIVITY | YOU`; desktop expands the same structure.

Avoid: generic SaaS look, gradients, large marketing heroes, excess rounded cards and pills, decoration that competes with record photography. Essential functionality never depends on hover. Check widths around 360–390, 430, 768 and 1280 px.

Seller flow: find release → describe your copy → add photos → preview and publish. A preview is required before publishing.

---

## How we work

### Roles

- **Jaap** owns product direction, final review and every merge decision.
- **ChatGPT** plans, inspects repo state, Issues, PRs and workflows, writes Issues, reviews PRs, gives continuation instructions and maintains this file.
- **Jules** implements the assigned Issue on its branch and reports factual progress and verification. It does not pick its own work or change architecture.
- Domain boundaries per specialist are in `.github/agents/` (architecture, data-catalog, ui, marketplace, verification).

### Issue = execution contract

An Issue defines goal, scope, acceptance criteria, constraints, verification and specialist routing. Docs, chat history and this file never authorize implementation work. New scope means a new Issue; do not quietly widen an active one.

### Loop

`Issue → Jules → branch → PR → CI → review → continuation in PR body → Jules → … → human merge`

When a review finds in-scope defects, keep the same branch and PR. The **PR body** is the control surface: address `@Jules`, state `NOT READY` while work remains, list exact changes, exact verification and explicit do-not-change boundaries. When the work is correct, set `READY FOR HUMAN REVIEW` and keep the Phase Safety Gate headings intact. Jules never merges.

### Review standard

1. **Inspect the source.** Read the Issue, the PR body and diff, the changed code and the test assertions. Summaries, bot reviews and green CI are leads, not proof.
2. **Separate observation from inference.** Never claim something was checked unless it was. A failed request in a test environment is not automatically a feature defect; trace the cause before assigning it.
3. **Tie blockers to the contract.** A blocker names an acceptance criterion, a concrete defect or a substantiated security/data-integrity risk. Do not invent criteria or demand live infrastructure when an isolated test answers the question.
4. **Verification must assert behavior**, not merely that a script ran. Test artifacts (screenshots, videos) stay out of `public/`.
5. **Give feasible instructions**: affected file or behavior, observed failure, bounded fix, and the check that proves it.
6. **When challenged, re-check from first principles** and fix the wrong wording yourself. Do not defend it or push the diagnostic burden back to Jaap.

Format for material findings: **Observed** (what exactly was inspected) · **Assessment** (why it matters, against which criterion) · **Confidence / unknowns** · **Required action** (smallest in-scope fix plus proportionate verification).

### Safety rules

- Green CI, a passing safety gate, a merged docs PR or an agent's completion message is **evidence, not proof** of product correctness, legal approval, a verified backup or permission to open the beta.
- Live Jules dispatch fails closed. Test paths never call the live Jules API. Duplicate work is blocked. Session cleanup is explicit and manual.
- Read-only inspection must not change Render, Supabase or provider settings, invite testers, or create accounts.
- Before asking Jaap to repeat a check, look in the relevant Issue for whether it is already recorded as done.
- Do not merge without Jaap's explicit authorization.

## Anti-patterns

Do not: recreate a hidden task board; dispatch work from docs or roadmaps; put database logic in EJS; duplicate release metadata in listings; use comments as a trade engine; add infrastructure before the product needs it; let an external provider become an undeclared source of truth; widen an Issue during a review loop.

## Recovering context in a fresh session

Assigned Issue → relevant `.github/agents/` contract → `AGENTS.md` → `docs/` → source and tests → recent PR and workflow evidence. This file supplies orientation only.
