---
name: performance-investigation
description: Use for measurable browser, Node/Express, PostgreSQL/Drizzle/Supabase, Render, Sharp or Storage performance investigations; require comparable baselines before optimization.
---

# Performance investigation — The Vinyl Drop

This is a cross-specialist skill. Add it to an Issue with Required Agent Skills: performance-investigation when the scoped problem concerns latency, throughput, memory, CPU, query behavior, image processing, asset weight or network/egress. It does not create a sixth specialist role.

## Start with attribution

1. State the user-visible symptom, affected journey/route, environment and a measurable hypothesis.
2. Identify the layer before measuring: browser, Node/Express, PostgreSQL/Drizzle, Render runtime, Sharp/image processing, Supabase Storage or network.
3. Capture a reproducible baseline before changing code. Record commit SHA, environment/service, runtime/library versions, data shape, device/network, cache state, sample count and method.
4. Compare the same workload before/after. Report median and p95 when sample size supports them; disclose warm/cold cache and lab/field differences. Do not use one best run or an unsupported average as proof.
5. Change one material variable at a time where practical and re-check correctness, authorization, data visibility, image quality, mobile UX and write-path effects.
6. Produce an evidence note: symptom, hypothesis, baseline, method, before/after results, trade-offs, regressions checked, confidence and unknowns. If no comparable evidence exists, say what should be measured next; do not claim a speed gain.

## Browser and mobile

- Trace the actual route assets and browser work: CSS/JS bytes, image count/bytes/dimensions, image decode, long tasks, layout shifts and interaction responsiveness.
- Use Playwright for repeatable route/state/viewports; use Chrome DevTools/Lighthouse to profile lab behavior.
- Include representative 360/375/390/430 CSS-pixel sessions for mobile journeys where relevant.
- Label Lighthouse/Playwright as lab evidence. Do not present it as field user performance.
- Core Web Vitals reference thresholds considered good at the 75th percentile are LCP ≤2.5s, INP ≤200ms and CLS ≤0.1. They are external reference thresholds, not TVD budgets or proof of current field results.

## Node.js and Express

- Measure route/service latency, request fan-out, serial awaits, repeated work, CPU profiles, heap/allocation growth and memory pressure.
- Use built-in node:perf_hooks tools (including eventLoopUtilization and monitorEventLoopDelay) and built-in profiling before adding new telemetry.
- Report sample size and p50/p95 only where the sample supports a meaningful distribution. Separate handler time from provider/network round trips.

## PostgreSQL, Drizzle and Supabase Database

- Inspect the repository and query shape first: selected columns, repeated reads/N+1 patterns, pagination, row counts and indexes.
- Use read-only database inspection by default. Where permitted, use pg_stat_statements and EXPLAIN plans; compare estimated versus actual rows only when a safe execution plan allows it.
- Index design must account for write amplification and storage, not just read speed. A query count alone does not prove a slow query.
- Treat PGlite/npm run db:verify as isolated migration verification, not evidence that staging or production is migrated.
- Relevant project work: Issue #377, docs/verification/SHARED_POOLER_EGRESS_BASELINE_377.md, docs/CATALOGUE_SEARCH.md (25,004-row trigram plan), src/app/repositories/, src/db/ and src/app/services/.

## Render runtime

- Correlate available CPU, memory and HTTP request metrics with service logs, deploy SHA and the exact time window.
- Record the Render service and environment. Do not assume all graphs or metrics are available on the current plan.

## Sharp and listing-photo processing

- Check the lockfile-resolved Sharp version for the current branch before drawing conclusions.
- Measure input/output bytes and dimensions, encode/decode time, CPU, memory and concurrency.
- Inspect src/app/utils/imageProcessor.ts and the actual upload path. Public WebP display derivatives and private editing-source masters are different products with different quality and access requirements.
- Keep the public derivative separate from the private source. Do not trade away sleeve text/detail, shadows/highlights or future perspective editing without an evidence-backed comparison and explicit product approval.
- Relevant project work: Issue #388 and src/app/services/listingService.ts.

## Supabase network and egress attribution

Never conflate these quantities:
- PostgreSQL result bytes and database round trips;
- PostgreSQL Shared Pooler Egress;
- Supabase Storage object sizes and Storage request/response traffic;
- CDN/cache delivery;
- browser upload payloads.

Issue #377 concerns database/query and shared-pooler investigation. Issue #388 measures private listing-photo source size against public derivatives. A large private image object does not by itself prove a Shared Pooler Egress problem.

## Safety boundaries

- Staging and production inspection is read-only by default.
- Inspection does not authorize cancelling sessions, resetting statistics, enabling extensions, creating indexes, changing DB parameters, changing Render/Supabase settings, scaling services, altering concurrency/thread-pool settings or deploying.
- EXPLAIN ANALYZE executes the statement. Never run it against a write/destructive query or a target environment without a safe, explicitly approved execution plan.
- Do not add persistent telemetry, high-cardinality labels, invasive profilers or scheduled monitoring without explicit Issue scope and privacy/cost review.
- Prefer free built-in tools. No paid SaaS, service upgrades or metered agents without explicit owner approval.
- Do not invent generic latency, memory, query-count or bundle-size budgets before representative baseline measurement and owner approval.

## Official methodology references

- Node.js performance hooks: https://nodejs.org/api/perf_hooks.html
- PostgreSQL EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- Supabase database inspection: https://supabase.com/docs/guides/observability/inspect
- Supabase query optimization: https://supabase.com/docs/guides/database/query-optimization
- Sharp performance: https://sharp.pixelplumbing.com/performance/
- Render service metrics: https://render.com/docs/service-metrics
- Core Web Vitals: https://web.dev/articles/vitals and https://developers.google.com/search/docs/appearance/core-web-vitals
