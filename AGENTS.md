# Agent Guidance for The Vinyl Drop

Welcome agent! This document contains guidance for automated agents working on this codebase.

## Source of Truth
- GitHub Issues are the execution contracts.
- Product and architectural intent are documented in `docs/`.
- Specialist agent definitions are located in `.github/agents/`.

## Rules for Code Changes
1. **Never edit build artifacts directly.** Modify source files in `src/`, `views/`, `public/`, `scripts/`, or `tests/`.
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
