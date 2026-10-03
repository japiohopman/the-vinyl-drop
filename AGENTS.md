# Agent Guidance for The Vinyl Drop

Welcome agent! This document contains rules and instructions for automated agents working on this codebase.

## Source of Truth
- `VINYL_DROP_CONTEXT.md` contains the active architecture and domain invariants.
- GitHub Issues define execution contracts.
- `docs/` describes product and architectural intent.

## Rules for Code Changes
1. **Never edit build artifacts directly.** Modify source files in `src/`, `views/`, `public/`, or `scripts/`.
2. **Always verify changes.** Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` after changes.
3. **Preserve layer boundaries.** Routes handle HTTP, Services handle domain rules, Repositories handle database queries, Views handle presentation.
4. **Follow commit conventions.** Reference governing issues using `Refs #<issue_number>`.

## Verification Commands
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
