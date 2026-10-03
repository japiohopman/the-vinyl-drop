# Domain Model

## Core distinction

The most important domain distinction is:

**Release metadata != physical copy != listing.**

A release describes a musical release.

A physical copy is a particular owned copy of that release.

A listing is the owner's current offer of that physical copy.

For MVP these concerns can be represented efficiently with the release and listing entities, but the conceptual boundary must remain explicit.

## Entities

### Profile

Represents the public-facing community identity of an authenticated user.

Core fields:
- user identity reference;
- username;
- display name;
- avatar;
- bio;
- coarse location;
- created/updated timestamps.

Rules:
- public profile must never expose private authentication data;
- location is intentionally coarse;
- username uniqueness is enforced at the database boundary.

### Release

Represents canonical metadata for a music release.

Core fields:
- id;
- artist;
- title;
- label;
- catalogue number;
- release year;
- country;
- format;
- barcode when known;
- genre classification;
- optional external metadata references.

Rules:
- release metadata is independent of seller ownership;
- missing optional metadata is allowed;
- external metadata IDs are references, not canonical authority.

### Listing

Represents an offer for a seller's physical copy.

Core fields:
- id;
- release_id;
- seller_id;
- price in integer minor units;
- currency;
- media condition;
- sleeve condition;
- trade availability;
- description;
- status;
- timestamps.

Listing status should be explicit, for example:
- draft;
- published;
- reserved;
- sold;
- traded;
- archived.

Rules:
- seller owns the listing;
- only the seller can edit or change availability;
- sold/traded listings remain historically meaningful and should not be hard-deleted by normal UI flows;
- a listing cannot exist without a release reference.

### Listing Photo

Represents one image associated with a listing.

Core fields:
- id;
- listing_id;
- storage path;
- display order;
- alternative text;
- timestamps.

Rules:
- images live in object storage, not as binary blobs inside PostgreSQL;
- ordering belongs to the listing-photo relationship;
- deleting/reordering photos must preserve deterministic display order.

Recommended photo intent:
1. front/cover;
2. back;
3. record;
4. label;
5. damage/detail.

The UI should not require every slot.

### Comment

Represents a community comment attached to a listing.

Rules:
- authenticated user required;
- author identity is stored separately from text;
- comments are not anonymous;
- comment deletion/moderation must be policy-driven;
- seller replies are normal comments with author identity, not a special duplicated data model.

### Favorite

Future entity for saved listings.

Not required for MVP, but the listing ID and user ID relationship should remain easy to add.

### Trade Request

Future entity connecting one user's offered item to another user's requested listing.

Do not model trade state using free-form comments.

### Conversation / Message

Future communication domain.

Private messages must not be represented as listing comments.

## Relationships

Profile
  └── owns many Listings

Release
  └── has many Listings

Listing
  ├── belongs to one Release
  ├── belongs to one seller Profile
  ├── has many Listing Photos
  └── has many Comments

Comment
  └── belongs to one Profile and one Listing

## Ownership boundaries

- Auth identity is owned by the authentication provider.
- Public profile data is owned by the application's profile tables.
- Release metadata is owned by the application database.
- Physical-copy offer state is owned by the listing owner through application commands.
- Images are owned by the application through storage paths and database references.
- UI components never become domain owners.

## Lifecycle

### Listing

draft -> published -> reserved -> sold/traded -> archived

Some paths may skip states, but publication and terminal availability must remain explicit.

### Release

A release is catalog data and normally has no status lifecycle tied to any individual listing.

### Comment

Comment creation is append-oriented. Moderation or soft deletion may remove it from public display without erasing audit-relevant information prematurely.

## Currency

Money is stored as integer minor units.

Example:

€34.95 -> 3495

Never use floating-point numbers for stored prices.

## Condition

The MVP uses a controlled vocabulary derived from common record-grading practice.

Initial supported values should be validated centrally rather than free-typed.

Candidate vocabulary:

M, NM, VG+, VG, VG-, G+, G, F, P

The implementation phase must confirm the final allowed values and their user-facing descriptions before migration creation.

## Domain anti-patterns

Avoid:
- duplicating release metadata into every listing;
- storing prices as floating point;
- putting photos directly into database rows;
- using comments as the trade system;
- storing authorization rules in EJS templates;
- inventing duplicate profile/user systems;
- hard-deleting sold history from normal UI actions.
