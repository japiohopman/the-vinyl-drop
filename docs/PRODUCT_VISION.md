# Product Vision

## Product

**The Vinyl Drop** is a local, community-driven marketplace for buying, selling and trading physical records.

The primary product is the marketplace for physical records. Community features—such as profiles, listing comments, activity feeds, and local events—serve strictly to support, discover, and build trust around physical record transactions; they are not the primary product.

The initial cultural focus is the community around digging: 1990s hip-hop, soul and adjacent genres, while the underlying data model remains genre-agnostic.

The product feels closer to a good independent record shop and a local crate-digging community than to a generic classifieds site or a social network.

## Core promise

A user can:
1. discover a record via search, browse filters, or recent listings;
2. understand exactly which physical copy is being offered;
3. see media and sleeve condition, structured release metadata, photos, price, and trade intent;
4. understand who is offering it through their public seller profile;
5. post public comments on a listing to inquire or discuss;
6. arrange buying or trading locally directly between seller and buyer.

## Primary user types

### Seller

Owns physical records and wants to sell or trade individual copies.

Needs:
- fast listing creation linked to canonical release metadata;
- explicit condition grading (Goldmine standard);
- multiple listing photos;
- price (or trade-only designation) and description;
- lifecycle control over listing availability (draft, published, reserved, sold, traded, archived).

### Buyer / digger

Searches for records and wants trustworthy information before arranging a local transaction.

Needs:
- search across release metadata and descriptions;
- structured filtering by genre, condition grade, price range, and trade availability;
- accurate release metadata distinguishing pressings;
- clear media and sleeve grading;
- listing photos showing actual record condition;
- seller identity and profile context;
- public listing comments to ask questions.

### Community member

Follows local record activity and contributes to the local digging culture.

Needs:
- public member profiles;
- listing comments;
- favorites / wantlists (future);
- community activity feed (future).

## Implemented MVP scope

The core product implemented through Phase 5 includes:
- user account creation, Supabase Auth authentication, and public profiles;
- canonical release metadata (artist, title, label, catalog number, year, country, format, barcode, genre);
- physical copy ownership records linked to releases;
- listings referencing physical copies with price (in minor unit integer cents) or trade intent;
- media condition and sleeve condition grading using controlled vocabularies;
- multiple optimized WebP listing photos (up to 5 per listing, maximum 5MB per upload, server-side Sharp processing and metadata stripping);
- listing lifecycle management (draft, published, reserved, sold, traded, archived);
- browse and search capabilities across releases, condition, price ranges, and descriptions;
- listing detail pages with structured metadata, photo view, seller context, and public comment threads;
- public seller profiles displaying active listings and member details.

## Explicit non-goals and non-implemented scope

The following are **NOT implemented** in the current system and must not be presented as active features:
- online payment processing or checkout;
- shipping labels, calculated postage, or fulfillment integration;
- escrow or automated transaction settlement;
- private messaging / direct in-app chat;
- collection management or personal inventory tracking;
- recommendation algorithms or AI-generated listings;
- mobile native applications;
- automated transaction feedback or reputation scoring.

The marketplace supports local, peer-to-peer arrangements without making the application platform responsible for payment settlement, shipping logistics, or dispute handling.

## Product principles

### Physical-first

The product is about actual physical copies, not only abstract album records. Every listing references a specific physical copy with its own media condition, sleeve condition, and notes.

### Metadata is structured and useful

Artist, title, label, release year, catalog number, format, country, and condition are presented as structured data, cleanly separating canonical release metadata from individual physical copy condition.

### Local by default

Profiles expose a coarse location (e.g., city or neighborhood) to facilitate local meetups and pickup, but never require or publish a user's private street address.

### Community supports the marketplace

Communication and seller trust enhance the marketplace. Comments and public profiles exist to build confidence around physical record listings.

### Mobile-first listing flow

Publishing a record is optimized for mobile browser use while holding a physical record.

### Honest grading

The UI cleanly distinguishes:
- media condition;
- sleeve condition;
- specific notes or defects.

## Future direction

Future phases may introduce:
- saved searches and favorites;
- member wantlists;
- structured trade proposals;
- private buyer/seller messaging;
- notification engine;
- community activity feeds (`/activity`);
- moderation tools and content reporting;
- completed transaction records.

These are potential future extensions of the canonical domain model, not current application behaviors.
