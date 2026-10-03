# Product Roadmap

This document describes dependency order and intended phases.

**It is not an execution queue.**

Implementation work is created as GitHub Issues and dispatched only from explicit Issue contracts.

## Phase 0 — Product and architecture foundation

Deliver:
- product vision;
- domain model;
- data architecture;
- technical architecture;
- UX/UI direction;
- security baseline;
- agentic workflow specification.

Status: complete — merged to main.

## Phase 1 — Repository and workflow foundation

Deliver:
- Node/TypeScript project;
- lint/test/build commands;
- EJS application shell;
- GitHub Issue templates;
- PR template;
- specialist agent definitions;
- Jules selector/dispatcher;
- CI;
- phase safety gate;
- review relay;
- stale-session cleanup;
- project context contract.

Execution contract: Issue #4.

Dependency: Phase 0.

## Phase 2 — Design system and application shell

Deliver:
- tokens;
- typography;
- responsive layout;
- header;
- mobile navigation;
- forms;
- listing card;
- reusable EJS partials;
- accessibility baseline.

Planned implementation Issues:
- #6 — Design tokens and responsive application shell
- #7 — Navigation and brand header
- #8 — Reusable forms, listing card and accessibility baseline

Dependency: Phase 1.

## Phase 3 — Database, authentication and profiles

Deliver:
- Supabase project integration;
- Drizzle schema and migrations;
- authentication;
- profile creation/editing;
- protected routes;
- ownership authorization.

Planned implementation Issues:
- #9 — Supabase, PostgreSQL and Drizzle data foundation
- #10 — Authentication, profiles and ownership authorization

Dependency: Phase 1.

## Phase 4 — Releases and listings

Deliver:
- release records;
- listing lifecycle;
- condition;
- price;
- descriptions;
- photos;
- publish/edit/archive;
- seller ownership checks.

Planned implementation Issues:
- #11 — Release, physical copy and listing domain model
- #12 — Listing creation, editing and photo pipeline

Future enrichment contract:
- #14 — Metadata identification and enrichment

Dependencies: Phases 2 and 3.

## Phase 5 — Discovery

Deliver:
- homepage feed;
- browse;
- search;
- filters;
- listing detail;
- seller profile views.

Planned implementation Issue:
- #13 — Browse, search, listing detail and seller profile views

Dependency: Phase 4.

## Phase 6 — Community

Deliver:
- comments;
- favorites;
- activity;
- basic notification hooks.

Dependency: Phase 5.

## Phase 7 — Trading and private communication

Deliver:
- wanted lists;
- trade requests;
- conversations;
- messages;
- trade lifecycle.

Dependency: Phase 6.

## Phase 8 — Moderation and production hardening

Deliver:
- reports;
- moderation tools;
- rate limits;
- image hardening;
- observability;
- backup/recovery runbook;
- deployment hardening.

Dependency: feature maturity.

## Later possibilities

Potential future work:
- external metadata lookup;
- collection management;
- local groups;
- reputation signals;
- import/export;
- mobile PWA improvements.

These should be evaluated based on actual user need rather than assumed MVP scope.
