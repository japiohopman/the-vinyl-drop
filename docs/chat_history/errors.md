# Local Runtime Error Log

## 1. Observed local homepage query failure

Jaap reported this trace from the local `npm run dev` session while the homepage feed was loading published listings:

```
Error: Database query error
    at PostgresJsPreparedQuery.queryWithCache (node_modules/src/pg-core/session.ts:73:11)
    at searchListings (src/app/repositories/listingRepository.ts)
    at getHomeFeedListings (src/app/services/listingService.ts)
    at getHomePage (src/app/controllers/homeController.ts:9:22)
```

The associated SQL query selected `profiles.website_url` as part of the published-listing feed. This stack identifies the **homepage request path** (`searchListings` → `getHomeFeedListings` → `getHomePage`); it is not the stack for `POST /auth/login?next=/profile`. The pasted stack alone did not include PostgreSQL's underlying SQLSTATE or prove the login request's specific cause.

## 2. Separately confirmed database cause

A subsequent PostgreSQL/Supabase log entry reported SQLSTATE `42703` for the missing `profiles.website_url` column. Migration `drizzle/0004_mighty_spacker_dave.sql` adds that nullable column:

```sql
ALTER TABLE "profiles" ADD COLUMN "website_url" text;
```

A missing column explains the published-listing query failure on a database where this migration had not yet been applied. The same missing column could also affect profile queries during login, but the homepage trace above must not be treated as direct evidence of the login request's own stack.

## 3. Resolution recorded on 2026-10-09

- The migration was applied to the intended Supabase database.
- A subsequent schema check confirmed `public.profiles.website_url` exists.
- The published-listing join/query path subsequently executed successfully and returned six rows.
- Jaap reported that the local runtime errors were resolved after the database fix.

Do not rerun the migration against a database until `DATABASE_URL` is confirmed to target the intended environment. No connection string, token, or other credential is recorded here.
