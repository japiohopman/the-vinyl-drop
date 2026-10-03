# Product Vision

## Product

**The Vinyl Drop** is a local, community-driven marketplace for buying, selling and trading physical records.

The initial focus is the culture around digging: 1990s hip-hop, soul and adjacent genres, while the data model remains genre-agnostic.

The product should feel closer to a good independent record shop and a local crate-digging community than to a generic classifieds site.

## Core promise

A user should be able to:
1. discover a record;
2. understand exactly which physical copy is being offered;
3. see the condition, metadata, photos and price;
4. understand who is offering it;
5. contact the seller through the platform;
6. buy or arrange a trade locally.

## Primary user types

### Seller

Owns physical records and wants to sell or trade individual copies.

Needs:
- fast listing creation;
- reliable metadata;
- clear condition entry;
- multiple photos;
- price and trade intent;
- control over availability.

### Buyer / digger

Searches for records and wants trustworthy information before contacting the seller.

Needs:
- useful search;
- filters;
- accurate release metadata;
- clear grading;
- useful photos;
- seller identity;
- comments/contact.

### Community member

May not currently be buying or selling, but follows local records and people.

Needs:
- profiles;
- comments;
- favorites later;
- discovery feed later.

## MVP

The MVP includes:
- account and profile;
- release metadata;
- individual physical-copy listings;
- sale and/or trade intent;
- price;
- media and sleeve condition;
- multiple listing photos;
- description;
- browse and search;
- listing detail;
- seller profile;
- comments.

## Explicit MVP non-goals

Not part of the first release:
- payment processing;
- shipping labels;
- automated checkout;
- escrow;
- full transaction settlement;
- recommendation algorithms;
- native mobile apps;
- public API;
- automated AI-generated listings;
- complex reputation scoring.

The MVP should support local arrangements without making the application responsible for payment or fulfilment.

## Product principles

### Physical-first

The product is about actual physical copies, not only abstract album records.

### Metadata is useful, not decorative

Artist, title, label, year, catalogue number, format, country and condition should be presented as structured data.

### Local by default

Profiles may expose a coarse location such as city or neighbourhood, but never require publication of a private street address.

### Community over marketplace mechanics

Communication and trust matter more than checkout optimization.

### Simple listing flow

Publishing a record should be practical on a phone and should not require a seller to understand database terminology.

### Honest condition

The UI should make it easy to distinguish:
- media condition;
- sleeve condition;
- specific defects or notes.

## Future direction

Later phases can add:
- favorites;
- wanted lists;
- trade proposals;
- messaging;
- notifications;
- collection views;
- moderation tools;
- local groups;
- completed trade history;
- optional external release metadata lookup.

These are extensions of the current domain model, not reasons to prematurely build them into the MVP.
