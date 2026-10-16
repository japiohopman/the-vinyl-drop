# Case-Insensitive Username Collision Inventory & Repair Plan

**Status:** Documented repair plan & diagnostic runbook for human operator review
**Last updated:** 2026-10-16
**Repository:** The Vinyl Drop
**Related issue:** [Issue #127 — security(auth): prevent ghost profiles on duplicate signup and enforce case-insensitive usernames](https://github.com/japiohopman/the-vinyl-drop/issues/127)

---

## 1. Executive Summary & Rules

During testing on 2026-10-16, case-variant username signups (e.g. `jaapJeKentHem` vs `JaapJeKentHem`) created two profile records in `profiles`. Before enforcing the database boundary constraint (`CREATE UNIQUE INDEX "profiles_username_lower_idx" ON "profiles" (LOWER("username"))`), any pre-existing case-colliding profile rows must be inventoried and remediated.

### Non-Negotiable Boundaries
1. **No Automatic Destructive Actions:** Code migrations and deployment scripts **must not** automatically delete, merge, rename, reassign, or cascade-delete profiles, auth identities, or marketplace listings.
2. **Explicit Owner Approval Required:** Any database modifications to existing staging or production profiles require explicit owner confirmation and approval.
3. **Read-Only Verification First:** The operator must run read-only diagnostic queries against the target environment (`staging` or `production`) before applying schema changes or live data fixes.

---

## 2. Read-Only Diagnostic Inventory Queries

The human operator should execute the following read-only SQL queries via the Supabase SQL Editor or direct psql session to inventory existing case-colliding profiles and verify matching Supabase Auth identities.

### Query A: Find All Case-Colliding Profiles
Identifies any username groups in `profiles` where case-insensitive usernames collide.

```sql
SELECT
  LOWER(username) AS lower_username,
  COUNT(*) AS collision_count,
  array_agg(username) AS username_variants,
  array_agg(id) AS profile_ids
FROM profiles
GROUP BY LOWER(username)
HAVING COUNT(*) > 1;
```

### Query B: Correlate Profile Rows with Supabase Auth Identities
Checks whether each colliding `profiles` record has a corresponding identity in Supabase `auth.users` or if it is an application-only "ghost" profile.

```sql
SELECT
  p.id AS profile_id,
  p.username,
  p.display_name,
  p.created_at AS profile_created_at,
  au.id AS auth_user_id,
  au.email AS auth_email,
  au.created_at AS auth_created_at,
  CASE WHEN au.id IS NULL THEN 'GHOST_PROFILE' ELSE 'REAL_AUTH_USER' END AS profile_type
FROM profiles p
LEFT JOIN auth.users au ON p.id = au.id
WHERE LOWER(p.username) IN (
  SELECT LOWER(username)
  FROM profiles
  GROUP BY LOWER(username)
  HAVING COUNT(*) > 1
)
ORDER BY LOWER(p.username), p.created_at;
```

### Query C: Inventory Related User Artifacts (Listings, Physical Copies, Comments)
Checks if any colliding profile owns active listings or comments before considering cleanup.

```sql
SELECT
  p.id AS profile_id,
  p.username,
  (SELECT COUNT(*) FROM listings l WHERE l.seller_id = p.id) AS listing_count,
  (SELECT COUNT(*) FROM physical_copies pc WHERE pc.owner_id = p.id) AS copy_count,
  (SELECT COUNT(*) FROM comments c WHERE c.author_id = p.id) AS comment_count
FROM profiles p
WHERE LOWER(p.username) IN (
  SELECT LOWER(username)
  FROM profiles
  GROUP BY LOWER(username)
  HAVING COUNT(*) > 1
);
```

---

## 3. Safe Repair Protocol (Runbook)

If Query A returns any collisions on a live target database:

1. **Classify Each Colliding Row:**
   - **Ghost Profile:** `profile_type = 'GHOST_PROFILE'` (no matching `auth.users` row) AND `listing_count = 0` AND `comment_count = 0`.
   - **Legitimate Account:** `profile_type = 'REAL_AUTH_USER'` (has a matching `auth.users` record).

2. **Formulate Proposed Resolution:**
   - For a **Ghost Profile** with zero associated listings/copies/comments, propose removal of the orphan profile row.
   - For two **Real Auth Users** with case-colliding usernames, propose renaming the secondary account's username (e.g., appending `_1`) after consulting with the account owner.

3. **Obtain Owner Approval:**
   - Present the exact output of Queries B and C along with the proposed remediation SQL to the product owner for review.

4. **Execute Approved Remediation:**
   - Execute the agreed SQL statements in a single transaction.

5. **Apply Migration:**
   - Proceed with running the database migration `0009_case_insensitive_usernames.sql` to create `profiles_username_lower_idx`.
