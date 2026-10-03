# Data Architecture

## Database

The canonical persistence layer is **PostgreSQL** hosted by **Supabase**.

Supabase provides a full PostgreSQL database rather than a proprietary database abstraction. Its Auth and Storage services integrate with the same project. Drizzle has documented PostgreSQL and Supabase integration paths.

References:
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth
- https://supabase.com/docs/guides/storage
- https://orm.drizzle.team/docs/get-started/postgresql
- https://orm.drizzle.team/docs/get-started/supabase

## ORM and migrations

**Drizzle ORM + Drizzle Kit** is the planned database access and migration layer.

Rules:
- application schema definitions live in source control;
- migrations are committed;
- production schema changes must be reproducible;
- application code must not rely on manually edited production tables;
- database constraints are used for invariants that must survive application bugs.

The initial implementation should use one clearly defined database module and one schema boundary.

## Initial tables

### profiles

Public user profile data.

Important constraints:
- one profile per authenticated user;
- unique username;
- no private auth secrets.

### releases

Canonical release metadata.

Important indexes will likely cover:
- artist;
- title;
- label;
- catalogue number;
- year;
- normalized search fields.

### listings

Physical-copy offers.

Important indexes will likely cover:
- seller;
- status;
- release;
- published timestamp;
- price;
- trade availability.

### listing_photos

Listing-to-storage references.

Important constraints:
- valid listing foreign key;
- deterministic sort order;
- safe storage path ownership.

### comments

Community interaction on listings.

Important indexes will likely cover:
- listing;
- author;
- created timestamp.

## Future tables

Add only when the feature enters an implementation phase:
- favorites;
- wanted_items;
- trade_requests;
- conversations;
- conversation_members;
- messages;
- notifications;
- reports;
- moderation_actions.

## External metadata

The database should support optional references such as:
- source;
- external ID;
- last imported/verified timestamp.

External catalogues are enrichment sources.

They must not become hidden dependencies for:
- displaying a listing;
- loading an existing release;
- editing a listing;
- maintaining ownership history.

## Search

Start with PostgreSQL.

Expected strategy:
- normal indexes for exact/filter queries;
- normalized text fields for predictable matching;
- PostgreSQL text search/trigram capabilities only when actual requirements justify them.

Do not introduce Elasticsearch or another search service in the MVP.

## Storage

Record images live in object storage.

Database rows contain:
- storage path/key;
- metadata;
- ownership relationship;
- ordering.

The application must validate that users may only mutate photos belonging to listings they own.

## Transactions

Database transactions are required whenever one user action must update multiple records atomically.

Examples:
- publishing a listing together with required metadata;
- reordering/deleting listing photos;
- changing a listing to a terminal state and creating associated records later in the marketplace lifecycle.

## Deletion policy

Prefer soft/historical states for marketplace records.

Normal user actions should not physically delete:
- sold listings;
- traded listings;
- important moderation records.

Personal data deletion must be handled as a separate privacy operation rather than by cascading arbitrary public-record deletions.

## Canonical data flow

Request
-> route
-> validation
-> application service
-> repository/database
-> view model
-> EJS

The EJS layer receives prepared view data and does not run queries.
