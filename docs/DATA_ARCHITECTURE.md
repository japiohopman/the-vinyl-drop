# Data Architecture

## Database

The canonical persistence layer is **PostgreSQL** hosted by **Supabase**.

Supabase provides full PostgreSQL instance capabilities rather than a proprietary database layer. Authentication (`auth.users`) and Storage (`listing-photos` bucket) integrate with the same project.

## ORM and migration architecture

**Drizzle ORM + Drizzle Kit** is the application schema and migration layer (`src/db/schema/`).

Rules:
- Application database schemas are source-controlled under `src/db/schema/`.
- Generated migration SQL files are committed in `drizzle/`.
- Production and local database migrations are applied reproducibly using `drizzle-kit migrate`.
- Database schema changes are tested in isolation using `@electric-sql/pglite` (`scripts/verify-migration.ts`) during `npm test` and CI runs.
- Schema integrity constraints and indexes enforce invariants directly in PostgreSQL.

## Implemented database tables

### `profiles` (`src/db/schema/profiles.ts`)

Public community profile data linked 1:1 with Supabase Auth identities.

Columns:
- `id`: `uuid` (Primary Key, references `auth.users.id` without `defaultRandom()` fallback to enforce 1:1 auth identity mapping).
- `username`: `text` (Not Null, Unique index `profiles_username_idx`).
- `displayName`: `text` (Not Null).
- `avatarUrl`: `text` (Nullable).
- `bio`: `text` (Nullable).
- `coarseLocation`: `text` (Nullable).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

### `releases` (`src/db/schema/releases.ts`)

Canonical catalog release metadata.

Columns:
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `artist`: `text` (Not Null).
- `title`: `text` (Not Null).
- `label`: `text` (Not Null).
- `catalogNumber`: `text` (Nullable).
- `releaseYear`: `integer` (Nullable).
- `country`: `text` (Nullable).
- `format`: `text` (Not Null, default `'12" Vinyl'`).
- `barcode`: `text` (Nullable).
- `genre`: `text` (Nullable).
- `discogsReleaseId`: `integer` (Nullable).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

Indexes:
- `releases_artist_idx` on `artist`
- `releases_title_idx` on `title`
- `releases_label_idx` on `label`
- `releases_genre_idx` on `genre`

### `physical_copies` (`src/db/schema/physicalCopies.ts`)

Owned physical record items connecting releases and profiles.

Columns:
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `releaseId`: `uuid` (Not Null, FK -> `releases.id` CASCADE).
- `ownerId`: `uuid` (Not Null, FK -> `profiles.id` CASCADE).
- `mediaCondition`: `condition_grade_enum` (Not Null).
- `sleeveCondition`: `condition_grade_enum` (Not Null).
- `notes`: `text` (Nullable).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

Indexes:
- `physical_copies_release_idx` on `releaseId`
- `physical_copies_owner_idx` on `ownerId`

### `listings` (`src/db/schema/listings.ts`)

Marketplace offers referencing physical copies.

Columns:
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `physicalCopyId`: `uuid` (Not Null, FK -> `physical_copies.id` CASCADE).
- `sellerId`: `uuid` (Not Null, FK -> `profiles.id` CASCADE).
- `price`: `integer` (Nullable, minor units / cents).
- `currency`: `text` (Not Null, default `'EUR'`).
- `tradeAvailable`: `boolean` (Not Null, default `false`).
- `description`: `text` (Nullable).
- `status`: `listing_status_enum` (Not Null, default `'draft'`).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

Constraints & Indexes:
- Check constraint `listings_price_check`: `price IS NULL OR price >= 0`.
- `listings_seller_idx` on `sellerId`
- `listings_physical_copy_idx` on `physicalCopyId`
- `listings_status_idx` on `status`
- `listings_price_idx` on `price`
- `listings_created_at_idx` on `createdAt`
- Partial Unique Index `listings_active_physical_copy_idx` on `physicalCopyId` WHERE `status IN ('published', 'reserved')` to prevent concurrent active listings on a single physical copy.

### `listing_photos` (`src/db/schema/listingPhotos.ts`)

Storage key references and order for listing photography.

Columns:
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `listingId`: `uuid` (Not Null, FK -> `listings.id` CASCADE).
- `storagePath`: `text` (Not Null).
- `displayOrder`: `integer` (Not Null, default `0`).
- `altText`: `text` (Nullable).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

Indexes:
- `listing_photos_listing_idx` on `listingId`
- `listing_photos_order_idx` on `(listingId, displayOrder)`

### `comments` (`src/db/schema/comments.ts`)

Public discussion threads on listings.

Columns:
- `id`: `uuid` (Primary Key, default `gen_random_uuid()`).
- `listingId`: `uuid` (Not Null, FK -> `listings.id` CASCADE).
- `authorId`: `uuid` (Not Null, FK -> `profiles.id` CASCADE).
- `content`: `text` (Not Null).
- `createdAt`: `timestamp with time zone` (Not Null, default `now()`).
- `updatedAt`: `timestamp with time zone` (Not Null, default `now()`).

Indexes:
- `comments_listing_idx` on `listingId`
- `comments_author_idx` on `authorId`
- `comments_created_at_idx` on `createdAt`

## Enums (`src/db/schema/enums.ts`)

- `condition_grade_enum`: `'M'`, `'NM'`, `'VG+'`, `'VG'`, `'VG-'`, `'G+'`, `'G'`, `'F'`, `'P'`.
- `listing_status_enum`: `'draft'`, `'published'`, `'reserved'`, `'sold'`, `'traded'`, `'archived'`.

## Storage architecture

User uploaded record images live in Supabase Storage under the `listing-photos` bucket.

Rules:
- Streams are processed using `@fastify/busboy` with strict limits (5MB file size limit, 5 photo limit per listing).
- Images are inspected, stripped of EXIF metadata, scaled to 2048px max dimension, and converted to optimized WebP format using `sharp`.
- Storage paths are saved in `listing_photos.storage_path`.
- Transactional rollback guarantees cleanup of storage objects if database record insertion fails.

## Auth persistence & session storage

Authentication utilizes Supabase Auth with Express cookie-backed PKCE storage (`createExpressSupabaseClient`) in `src/lib/supabase.ts`.

Cookies:
- `sb-access-token`: short-lived JWT access token.
- `sb-refresh-token`: refresh token for automatic token rotation.

Middleware (`sessionMiddleware` and `requireAuth`) binds `req.user` and `req.profile` to Express requests.

## Application request flow

```
HTTP Request
  └─> Route handler (`src/app/routes/`)
        └─> Middleware (`sessionMiddleware`, `requireAuth`, `validateSameOrigin`)
              └─> Controller (`src/app/controllers/`)
                    └─> Validation (Zod schemas in `src/validators/`)
                          └─> Service (`src/services/`)
                                └─> Repository / Drizzle ORM (`src/db/`)
                                      └─> View Model (`src/app/view-models/`)
                                            └─> EJS Template (`views/`)
```
