# Phase 0 — Product, Architecture and Agentic Foundation

Governing Issue: #1

## Objective

Create a stable design contract for The Vinyl Drop before application implementation begins.

## Required documentation

- [x] Product vision and MVP boundary
- [x] Domain model
- [x] Data architecture
- [x] Technical architecture
- [x] UX/UI direction
- [x] Security/privacy baseline
- [x] Agentic workflow specification
- [x] Roadmap and phase dependencies
- [x] Architectural decisions

## Review questions

Before implementation starts, the human reviewer should confirm:

1. Is the release/listing distinction correct?
2. Is PostgreSQL/Supabase the agreed persistence direction?
3. Is Express/EJS the agreed web architecture?
4. Is the mobile-first information architecture coherent?
5. Is the MVP small enough to implement and test safely?
6. Are the security and privacy boundaries clear?
7. Is the Jules continuation loop explicit enough to operate without reconstructing context?
8. Are the Issue/PR rules strict enough to prevent hidden task-board behavior?

## Completion criteria

Phase 0 is complete when:
- all documents above are reviewed;
- contradictions are resolved;
- foundational decisions are accepted;
- Phase 1 can be written as an implementation Issue without requiring major architecture discovery.

## Out of scope

No application code, schema migration, workflow implementation or deployment configuration belongs in this phase.
