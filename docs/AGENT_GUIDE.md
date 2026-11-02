# Contributor & Agent Guide

This is the practical starting point for people and agents working in The Vinyl Drop. It maps the current repository; detailed architecture, privacy and operating rules remain in the linked canonical documents.

## Start here

1. Read [Product Vision](./PRODUCT_VISION.md) for purpose, implemented scope and non-goals.
2. Read [Domain Model](./DOMAIN_MODEL.md): a **Release** is catalogue metadata; a **Physical Copy** is one person's actual record; a **Listing** is that copy being offered.
3. Read [PAGE_MAP.md](./PAGE_MAP.md) before changing routes, page flows or views. It was source-audited on 2 November 2026.
4. Read the task's live GitHub Issue and linked PRs. The Issue is the execution contract; current status belongs in GitHub, not an old chat snapshot.
5. Open only the specialist reference relevant to the task:
   - UI: [UX/UI Direction](./UX_UI.md) and [UI Visual Reference](./verification/UI_VISUAL_REFERENCE.md).
   - Data/catalogue: [Data Architecture](./DATA_ARCHITECTURE.md), [Domain Model](./DOMAIN_MODEL.md), [Catalogue Search](./CATALOGUE_SEARCH.md).
   - Security/privacy: [Security & Privacy](./SECURITY_PRIVACY.md) and the active security/privacy Issues.
   - Environments: [Staging Runbook](./STAGING_BETA_DEPLOYMENT.md) and [Production Runbook](./PRODUCTION_DEPLOYMENT.md).
   - Workflow and verification: [Agentic Workflow](./AGENTIC_WORKFLOW.md).

## What the application is

The Vinyl Drop is a server-rendered marketplace for physical vinyl. Buyers and sellers arrange transactions directly; the application does not provide checkout, escrow or payment processing.

Keep three domain records separate:

- **Release:** canonical artist, title, pressing/catalogue metadata and release artwork.
- **Physical Copy:** one record owned by a profile, with its own media/sleeve condition and notes.
- **Listing:** an offer for that copy, with price/trade intent, status and seller.

Discogs cover art is catalogue/reference artwork, not a photograph of the seller's exact record. A seller's `front_cover` photo takes precedence for the physical copy; release catalogue art is the fallback front artwork. The reverse face uses a seller-uploaded `back_cover` photo only. Never create fake Storage objects or `listing_photos` rows for catalogue art.

## Technology and request flow

The stack is Node.js, TypeScript, Express, EJS, PostgreSQL on Supabase, Drizzle ORM, Zod, Supabase Auth/Storage, Busboy and Sharp. Browser behavior is plain JavaScript and CSS; this is not a React/Vue SPA.

```text
HTTP request
  -> src/app/routes/
  -> src/app/middleware/
  -> src/app/controllers/
  -> src/validators/ (Zod)
  -> src/app/services/
  -> src/app/repositories/ and src/db/ (Drizzle/schema)
  -> src/app/view-models/
  -> views/ (EJS)
  -> public/js/ and public/css/
```

Keep route handlers thin. Authorization and validation belong on the server. Do not put database queries or domain rules in EJS templates or browser JavaScript.

## Where to look

| Task | Current location |
| --- | --- |
| Express startup and app composition | `src/server.ts`, `src/app.ts` |
| Route registration | `src/app/routes/` |
| Controllers | `src/app/controllers/` |
| Application services | `src/app/services/` |
| Database repositories | `src/app/repositories/` |
| Request validation | `src/validators/` |
| Domain rules | `src/domain/` |
| Drizzle schema and DB connection | `src/db/` |
| SQL migrations | `drizzle/` |
| Typed presentation models | `src/app/view-models/` |
| EJS templates and shared partials | `views/` |
| Browser JavaScript | `public/js/` |
| CSS, tokens and route bundles | `public/css/` |
| Automated tests | `test/` |
| Operational / verification scripts | `scripts/` |
| GitHub Actions and workflow modules | `.github/workflows/`, `src/workflow/` |
| Environment schema and feature flags | `src/config/env.ts` |

Do not assume a file exists because an older document mentions it. Check the current tree and [PAGE_MAP.md](./PAGE_MAP.md).

## Trace a feature end to end

### + DROP, Discogs and catalogue artwork

- Entry: `GET /drop/new` in `src/app/routes/index.ts`; `GET /releases/new` and `POST /releases/new` in `src/app/routes/releaseRoutes.ts`.
- Lookup: `GET /releases/lookup-metadata` calls `releaseController.getDiscogsMetadataLookup`; provider code is under `src/app/services/metadata/`.
- Form/browser: `views/releases/new.ejs`, `public/js/discogs-release-lookup.js`, `public/js/release-file-picker.js`.
- Persistence: `releaseController` invokes the release/Discogs services; catalogue artwork is saved on the Release as `cover_art_url`.
- Start regression review with `test/discogsImport.test.ts` and follow the related listing/artwork tests.

### Seller's actual listing photos

- Seller dashboard and edit screen: `GET /listings` and `GET /listings/:id/edit`.
- The editor is `views/listings/edit.ejs`; there is **no separate GET photo-management page**.
- Upload, role selection, delete and reorder are POST actions in `src/app/routes/listingRoutes.ts`; follow `listingController.ts`, `src/app/services/` and `src/app/repositories/listingPhotoRepository.ts`.
- Uploads pass through `multipartUploadHandler` and the image processing/Storage pipeline. Keep seller photographs separate from catalogue art.
- Relevant tests include `test/listingPhotoRoundTrip.test.ts`, `test/storage.test.ts` and `test/squarePhotoCropper.test.ts`.

Use the actual route file and [PAGE_MAP.md](./PAGE_MAP.md) as the final authority for paths and HTTP methods.

## Verification commands

The current `package.json` exposes:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run db:verify
npm run test:a11y
```

- `npm test` runs Jest unit/integration coverage, including isolated PGlite migration tests.
- `npm run db:verify` checks migrations in an isolated test database; it does **not** prove a remote Supabase database has been migrated.
- `npm run test:a11y` runs the repository's Playwright/axe accessibility checks.
- Report exactly which commands ran. A successful build or PGlite test is not a remote DB/runtime smoke test.

## Issue → branch → PR workflow

1. Start from an explicit, open GitHub Issue. Read its scope, acceptance criteria, non-goals, dependencies and owner decisions.
2. Create a dedicated branch from current `main`; do not commit directly to `main`.
3. Keep changes within the Issue. Use `Refs #<number>` in commit messages and the PR body. Do not use `Closes #<number>` until all Issue acceptance criteria are genuinely complete.
4. Open a PR to `main` with the repository's exact Phase Safety Gate headings and a truthful status. Record external blockers under `### Blockers / External dependencies`.
5. Wait for final-head CI, Phase Safety Gate and any relevant migration preflight checks. Review the complete final diff and address actionable review comments on the same branch.
6. The human owner retains final approval and merge authority. Merging to `main` normally triggers staging deployment; production Auto-Deploy is off and a production deploy is a separate, explicitly approved action.

The workflow may use a human contributor or an implementation agent selected for the Issue. Do not dispatch Jules or another external agent unless the owner and Issue call for it.

## Safety boundaries — never assume permission

- `CHATGPT.md` is read-only advisory context. Treat `AGENTS.md` and specialist contracts as repository instructions; do not change their rules from an unrelated Issue.
- Never put passwords, API keys, OAuth secrets, database URLs, tester e-mail addresses, session/recovery tokens or private production values in Git, Issues, PRs, screenshots or logs.
- Staging and production are separate Render/Supabase environments. A staging test is not production evidence.
- Do not run migrations, diagnostics, data repair, seed scripts or destructive commands against a remote database without explicit target-specific owner authorization.
- Do not change DNS, provider settings, OAuth clients, SMTP, invite allowlists, feature flags or deployment settings without explicit owner authorization.
- The current beta remains invite-only; `SHARED_RATE_LIMITS_ENABLED=false` and `MESSAGING_ENABLED=false`. Capacity preparation for up to 13 testers is not permission to widen the live allowlist or open public registration.
- No paid service, subscription or plan upgrade without a current cost check and the owner's explicit approval.

## Sources of truth

- **Source code and tests:** implemented behavior.
- **GitHub Issues:** execution scope, acceptance criteria, dependencies and current work status.
- **GitHub PRs and Actions:** proposed/merged changes and verified CI results.
- **[PAGE_MAP.md](./PAGE_MAP.md):** route/view inventory checked against source.
- **[ROADMAP.md](./ROADMAP.md):** architectural phase history and future boundaries, not a task queue.
- **Runbooks:** environment-specific operating instructions; always re-check the current governing Issue before acting.
- **[last_chat.md](./last_chat.md) and `chat_history/`:** historical only, never current deployment or launch status.
