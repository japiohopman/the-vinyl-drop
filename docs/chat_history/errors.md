# Local Runtime Error Log Trace

## Log Excerpt

```
Error: Database query error
    at PglitePreparedQuery.queryWithCache (node_modules/src/pg-core/session.ts:73:11)
    at searchListings (src/app/repositories/listingRepository.ts)
    at getHomeFeedListings (src/app/services/listingService.ts)
    at getHomePage (src/app/controllers/homeController.ts:22:5)
```

## Root Cause Analysis
The stack trace `searchListings` → `getHomeFeedListings` → `getHomePage` (`homeController.ts`) indicates that when querying published listings for the home feed, Drizzle ORM executes a SQL `SELECT` that includes `profiles.website_url`.
On any target PostgreSQL database where `drizzle/0004_mighty_spacker_dave.sql` has not been applied, PostgreSQL throws `column "website_url" of relation "profiles" does not exist`, causing Express to yield a 500 error response.

## Required Migration Action
Execute `npm run db:migrate` against the target database (using `DATABASE_URL`) to apply migration `0004_mighty_spacker_dave.sql`.
