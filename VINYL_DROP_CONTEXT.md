# Vinyl Drop Context Contract

## Product Vision
The Vinyl Drop is a local community marketplace for buying, selling, and trading physical vinyl records.

## Core Domain Invariants
1. **Release != Listing**: Release metadata represents the musical release; Listing represents a seller's physical copy offer.
2. **Prices**: Integer minor units (e.g. €34.95 -> 3495).
3. **Architecture**: Server-rendered Express + EJS + TypeScript. Drizzle ORM + PostgreSQL on Supabase.
4. **Mobile First**: Design and navigation prioritize mobile phone screens.
5. **Agentic Workflow**: GitHub Issues serve as execution contracts; human maintains final merge authority.

## Current Phase
Phase 1 — Repository and Agentic Workflow Foundation.
