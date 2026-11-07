# Shared Pooler Egress and Dig query baseline — Issue #377

**Date:** 7 November 2026  
**Scope:** Initial source-derived query baseline and isolated PGlite regression evidence. This is not a live egress-byte benchmark.

## What this baseline measures

Supabase Shared Pooler Egress is the data returned to the application through Supavisor. Database round-trip counts and selected column volume are useful workload indicators, but they are **not** a substitute for actual egress bytes, request timings or organization-wide usage measurements.

The counts below were derived by tracing the current `GET /dig` controller/service/repository path. The populated and empty `searchDigListings` query counts are also covered by PGlite integration assertions. No production or staging code was changed to collect this baseline.

## First-page query count

A normal first-page request has both the desktop grid/list and the mobile crate presentations. The mobile crate preloads up to 100 records; the desktop grid shows 12.

### Before the #377 implementation

| Request work | Database queries |
| --- | ---: |
| White-label inventory availability | 1 |
| Separate desktop Browse search: count, listing rows, primary-photo lookup | 3 |
| Separate mobile Dig search: count, listing rows, primary-photo lookup, all-photo lookup | 4 |
| **Total for populated first page** | **8** |

The desktop and mobile searches used the same normalized filters but independently queried the same first-page catalogue records. The Dig service also read front-cover photo metadata for its card view model and then fetched all photo metadata again for the crate artwork.

### After the #377 implementation

| Request work | Database queries |
| --- | ---: |
| White-label inventory availability | 1 |
| Shared Dig search: count and bounded listing rows | 2 |
| One Dig photo metadata lookup for both presentations | 1 |
| Desktop first-page cards derived from the shared results | 0 |
| **Total for populated first page** | **4** |

The first 12 desktop cards are now sliced from the same bounded Dig results already used by the mobile crate. The Dig search skips the separate primary-photo lookup and derives the primary card image from the one photo lookup used for front/back artwork.

### Empty first-page results

| Request work | Before | After |
| --- | ---: | ---: |
| White-label inventory availability | 1 | 1 |
| Desktop / Dig count queries | 2 | 1 |
| Listing-row and photo queries | 0 | 0 |
| **Total** | **3** | **2** |

When the listing count is zero, `searchListings` returns before selecting listing rows. The Dig photo repository also returns immediately for an empty ID list, so it issues no photo query.

### Desktop page 2 and later

The mobile crate still requires its page-one preload, while the desktop view must load the requested page. The source-derived count for a populated request after this change is therefore **7** (one white-label count, three Dig queries and three paginated Browse queries). This work does not claim to have removed the mobile preload for later desktop pages.

## Query projections

The normal listing-card search now selects only the fields used by its view model:

- Listing: ID, price and trade availability.
- Physical copy: media and sleeve condition.
- Release: title, artist, release year, format and catalogue artwork URL.
- Seller: username and location.

The Dig photo lookup selects only listing ID, public derivative storage path, photo role, display order and alt text. It does not select private original-source storage paths or the photo editor recipe. The generic primary-cover lookup selects only listing ID and storage path.

## Automated regression evidence

PGlite integration tests assert:

- A populated `searchDigListings` request performs exactly three Drizzle SELECTs: matching count, bounded listing rows and Dig photo metadata.
- An empty `searchDigListings` request performs exactly one SELECT (the count); it does not query listing rows or photo metadata.
- The responsive first-page route does not call the separate Browse search service; both desktop and mobile markup are rendered from the shared Dig results.
- Front/back artwork selection, the desktop front-photo card image and catalogue-art fallback remain available.
- The returned Dig view model does not contain `sourceStoragePath`.

The CI run for the PR head must remain green; these assertions do not by themselves measure bytes transferred through a live Supavisor connection.

## Supabase observations already collected

Read-only staging observations from 6–7 November 2026 found PostgreSQL errors with SQLSTATE `42703` mentioning `profiles.avatar_storage_path`, and query cancellations with SQLSTATE `57014`. The current staging schema check confirms the profile media columns exist and Drizzle migration `0024_profile_avatars_and_music_links` is recorded.

The inspected staging database log window around the owner's local HTTP 500 at approximately 07:24 UTC on 7 November had no matching PostgreSQL/Supavisor error. These log observations therefore do not establish the cause of that exact local 500.

## Measurements still required

- Actual Shared Pooler Egress bytes before/after under comparable traffic windows.
- Organization-wide versus per-project usage separation.
- Query Performance evidence for frequent and expensive application statements.
- Repeatable request/query p50 and p95 timings where the environment exposes reliable measurements.
- Attribution (or an explicit unresolved status) for the `42703` and `57014` events.

Do not claim route-specific or organization-wide egress savings from SQL call counts alone. Do not deploy this branch, apply migrations, change Supabase/Render settings or alter live data as part of collecting this source baseline.
