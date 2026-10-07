# Domain Model

## Core domain hierarchy

The core domain model enforces a strict, explicit three-tier separation:

**`Release -> PhysicalCopy -> Listing`**

1. **`Release`**: Represents canonical music release metadata (artist, album title, record label, catalogue number, release year, country, format, barcode, genre, external metadata references). Independent of any user or physical record.
2. **`PhysicalCopy`**: Represents an individual physical vinyl record owned by a user (`ownerId`). Holds media condition grade, sleeve condition grade, and copy-specific notes.
3. **`Listing`**: Represents a seller's active marketplace offer for a specific physical copy. Holds price (integer minor units / cents), currency, trade availability flag, offer description, and lifecycle status (`draft`, `published`, `reserved`, `sold`, `traded`, `archived`).

### Why `PhysicalCopy` exists between `Release` and `Listing`

A seller owns a physical record item regardless of whether it is currently listed on the marketplace. By separating `PhysicalCopy` from `Listing`:
- Condition grading (media and sleeve) belongs to the physical item itself.
- Historical ownership and collection tracking can exist without duplicating release metadata.
- A single physical copy cannot have concurrent active listings. This invariant is enforced at the database level by a partial unique index (`listings_active_physical_copy_idx`) on `physical_copy_id` where `status IN ('published', 'reserved')`.

## Entities

### Profile

Represents the public community identity of an authenticated user.

- **Primary Key:** `id` (UUID), matching Supabase Auth `auth.users.id` 1:1.
- **Fields:**
  - `username` (text, required, unique, lowercased validation);
  - `displayName` (text, optional);
  - `avatarUrl` (text, optional);
  - `bio` (text, optional);
  - `location` (text, optional, e.g., "Amsterdam Oost");
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Public profile never exposes email, auth keys, or private session tokens.
  - Location is intentionally coarse for privacy.
  - Username uniqueness is enforced at the database boundary.

### Release

Represents canonical metadata for a musical release.

- **Primary Key:** `id` (UUID, default random).
- **Fields:**
  - `artist` (text, required);
  - `title` (text, required);
  - `label` (text, optional);
  - `catalogueNumber` (text, optional);
  - `releaseYear` (integer, optional);
  - `country` (text, optional);
  - `format` (text, optional);
  - `barcode` (text, optional);
  - `genre` (text, optional);
  - `coverArtUrl` (text, optional);
  - `externalSource` (text, optional external metadata provider, e.g. `'discogs'`);
  - `externalId` (text, optional external release ID);
  - `lastImportedAt` (timestamp with time zone, optional);
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Independent of seller ownership or listing state.
  - External IDs and cover art URLs are enrichment references, not canonical authorities.

### PhysicalCopy

Represents a specific physical record item owned by a profile.

- **Primary Key:** `id` (UUID, default random).
- **Foreign Keys:**
  - `releaseId` -> `releases.id` (required, CASCADE deletion);
  - `ownerId` -> `profiles.id` (required, CASCADE deletion).
- **Fields:**
  - `mediaCondition` (enum, required);
  - `sleeveCondition` (enum, required);
  - `notes` (text, optional);
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Media and sleeve conditions must use the controlled condition grade vocabulary.
  - Owned by a specific user profile (`ownerId`).

### Listing

Represents an active or historical marketplace offer for a physical copy.

- **Primary Key:** `id` (UUID, default random).
- **Foreign Keys:**
  - `physicalCopyId` -> `physical_copies.id` (required, CASCADE deletion);
  - `sellerId` -> `profiles.id` (required, CASCADE deletion).
- **Fields:**
  - `price` (integer, optional minor units / cents; `null` for trade-only offers);
  - `currency` (text, default `'EUR'`);
  - `tradeAvailable` (boolean, default `false`);
  - `description` (text, optional seller notes);
  - `status` (enum, default `'draft'`);
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Seller (`sellerId`) must own the referenced physical copy (`physicalCopyId`).
  - Price check constraint enforces `"price" IS NULL OR "price" >= 0`.
  - Non-draft creation requires valid price or `tradeAvailable = true`.
  - Terminal statuses (`sold`, `traded`, `archived`) are immutable.

### ListingPhoto

Represents an image asset associated with a listing.

- **Primary Key:** `id` (UUID, default random).
- **Foreign Key:** `listingId` -> `listings.id` (required, CASCADE deletion).
- **Fields:**
  - `storagePath` (text, relative Supabase Storage key in `listing-photos` bucket);
  - `displayOrder` (integer, 0-indexed ordering);
  - `altText` (text, optional accessibility description);
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Maximum 5 photos per listing.
  - Reordering and photo deletion preserve sequential 0-indexed `displayOrder`.
  - Actual image binaries are processed server-side via Sharp (converted to optimized WebP, scaled to 2048px max, EXIF metadata stripped) and stored in object storage.

### Comment

Represents a public community comment on a listing.

- **Primary Key:** `id` (UUID, default random).
- **Foreign Keys:**
  - `listingId` -> `listings.id` (required, CASCADE deletion);
  - `authorId` -> `profiles.id` (required, CASCADE deletion).
- **Fields:**
  - `content` (text, required);
  - `createdAt`, `updatedAt` (timestamps).
- **Rules:**
  - Requires authenticated author (`authorId`).
  - Comments are public and chronologically ordered on the listing detail page.
  - Seller comments are visually distinguished in UI (`authorId === listing.sellerId`).

## Entity relationships

```
Profile (auth.users 1:1)
  ├── owns many PhysicalCopies
  ├── owns many Listings (via physical copies)
  └── authors many Comments

Release
  └── referenced by many PhysicalCopies

PhysicalCopy
  ├── belongs to one Release
  ├── belongs to one owner Profile
  └── referenced by many Listings (at most 1 active listing via partial index)

Listing
  ├── references one PhysicalCopy
  ├── references one seller Profile
  ├── has many ListingPhotos (0 to 5)
  └── has many Comments
```

## Listing lifecycle state machine

Valid status transitions validated strictly in `src/domain/listingLifecycle.ts`:

- `draft` -> `published`, `archived`
- `published` -> `reserved`, `sold`, `traded`, `archived`
- `reserved` -> `published`, `sold`, `traded`, `archived`
- `sold` -> *(terminal state)*
- `traded` -> *(terminal state)*
- `archived` -> *(terminal state)*

Rules:
- A listing must pass validation before transitioning to `published` (must have valid price or trade availability, media/sleeve condition, and at least one uploaded photo).
- Terminal statuses (`sold`, `traded`, `archived`) cannot transition to any other status and reject updates.

## Money representation

Monetary amounts (prices) are stored strictly as **integer minor currency units (cents)** in PostgreSQL.

Example:
- `€34.95` -> stored as `3495`
- `€120.00` -> stored as `12000`
- `Trade Only` -> stored as `null` with `tradeAvailable = true`

Floating-point numbers are never used for prices in database or service layers. Currency conversion/formatting is performed exclusively at the presentation boundary (`ListingCardViewModel`).

## Controlled vocabularies

### Condition grade vocabulary (Goldmine standard)

Validated via Zod schema (`src/validators/condition.ts`) and Postgres enum (`conditionGradeEnum`):

| Code | Grade | Description |
| --- | --- | --- |
| `M` | Mint | Unplayed, perfect condition in original factory seal |
| `NM` | Near Mint | Near perfect with no visible surface marks or defects |
| `VG+` | Very Good Plus | Minimal signs of wear; light scuffs that do not affect playback |
| `VG` | Very Good | Visible surface scuffs or light scratches; mild surface noise |
| `VG-` | Very Good Minus | Noticeable wear, surface marks, and audible crackle without skips |
| `G+` | Good Plus | Significant wear and background noise; plays through without jumping |
| `G` | Good | Heavy wear and continuous crackle; plays through without skipping |
| `F` | Fair | Deep scratches, potential skipping or significant surface noise |
| `P` | Poor | Severe damage; unplayable or cracked media |

### Listing status vocabulary

Validated via Postgres enum (`listingStatusEnum`):
`draft`, `published`, `reserved`, `sold`, `traded`, `archived`.
