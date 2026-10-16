# Case-Insensitive Username Collision Inventory & Repair Plan

**Status:** Read-only diagnostic plan; no remediation or migration is authorized by this document
**Last updated:** 2026-10-16
**Repository:** The Vinyl Drop
**Related issue:** [Issue #127 — prevent ghost profiles and enforce case-insensitive usernames](https://github.com/japiohopman/the-vinyl-drop/issues/127)

---

## 1. Purpose and safety rules

The observed case variants (for example, `jaapJeKentHem` and `JaapJeKentHem`) mean the database may already contain usernames that collide under `LOWER(username)`. The proposed unique index `profiles_username_lower_idx` cannot be created while such collisions remain.

This document defines a **read-only inventory and decision process**. It does not authorize executing repairs or applying migration `0009_case_insensitive_usernames.sql`.

### Non-negotiable boundaries

1. **No automatic destructive actions.** Do not automatically delete, merge, rename, or reassign profiles, Auth identities, listings, comments, messages, photos, favorites, or other marketplace artifacts.
2. **Owner approval is required.** Present exact read-only results and a concrete proposal before any change to existing data.
3. **Inventory all dependent artifacts first.** A profile with no Auth row is not, by itself, proof that deletion is safe. Foreign keys may cascade-delete records or block deletion.
4. **No migration until collisions are resolved and rechecked.** The index creation will fail if duplicate case-folded usernames remain. Resolve that condition only through a separately reviewed, explicitly approved operation.
5. **Keep diagnostics read-only.** The queries below use `SELECT` only. Do not run live migrations, cleanup SQL, or deployment commands as part of this investigation.

## 2. Read-only diagnostic inventory

Run these queries against the explicitly selected target environment using an authorized, read-only-capable database session. Save the result for human review; do not paste unnecessary personal data into public PR comments.

### Query A: Find all case-insensitive username collisions

```sql
SELECT
  LOWER(username) AS lower_username,
  COUNT(*) AS collision_count,
  array_agg(username ORDER BY username) AS username_variants,
  array_agg(id ORDER BY id) AS profile_ids
FROM public.profiles
GROUP BY LOWER(username)
HAVING COUNT(*) > 1
ORDER BY LOWER(username);
```

### Query B: Correlate colliding profiles with Supabase Auth identities

This establishes whether each profile ID has a corresponding `auth.users` row. It is an inventory signal, not permission to delete or modify anything.

```sql
SELECT
  p.id AS profile_id,
  p.username,
  p.display_name,
  p.created_at AS profile_created_at,
  au.id AS auth_user_id,
  au.email AS auth_email,
  au.created_at AS auth_created_at,
  CASE WHEN au.id IS NULL THEN 'NO_MATCHING_AUTH_USER' ELSE 'MATCHING_AUTH_USER' END AS identity_match
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE LOWER(p.username) IN (
  SELECT LOWER(username)
  FROM public.profiles
  GROUP BY LOWER(username)
  HAVING COUNT(*) > 1
)
ORDER BY LOWER(p.username), p.created_at, p.id;
```

### Query C: Inventory all known direct and listing-related dependencies

The schema has both cascading references (which can delete data indirectly) and `NO ACTION` references (which can block deletion). This query counts records directly associated with each colliding profile and records associated with that profile's listings. Counts are for triage only; they do not prove that a row can safely be removed.

```sql
SELECT
  p.id AS profile_id,
  p.username,

  (SELECT COUNT(*) FROM public.listings l
   WHERE l.seller_id = p.id) AS owned_listing_count,
  (SELECT COUNT(*) FROM public.physical_copies pc
   WHERE pc.owner_id = p.id) AS owned_physical_copy_count,
  (SELECT COUNT(*) FROM public.listing_photos lp
   JOIN public.listings l ON l.id = lp.listing_id
   WHERE l.seller_id = p.id) AS photos_on_owned_listings,

  (SELECT COUNT(*) FROM public.comments c
   WHERE c.author_id = p.id) AS authored_comment_count,
  (SELECT COUNT(*) FROM public.comments c
   JOIN public.listings l ON l.id = c.listing_id
   WHERE l.seller_id = p.id) AS comments_on_owned_listings,

  (SELECT COUNT(*) FROM public.favorites f
   WHERE f.user_id = p.id) AS favorites_created_count,
  (SELECT COUNT(*) FROM public.favorites f
   JOIN public.listings l ON l.id = f.listing_id
   WHERE l.seller_id = p.id) AS favorites_on_owned_listings,

  (SELECT COUNT(*) FROM public.activity_events ae
   WHERE ae.actor_id = p.id) AS activity_events_by_profile,
  (SELECT COUNT(*) FROM public.activity_events ae
   LEFT JOIN public.listings l ON l.id = ae.listing_id
   LEFT JOIN public.comments c ON c.id = ae.comment_id
   WHERE l.seller_id = p.id OR c.author_id = p.id) AS activity_events_on_owned_listings_or_authored_comments,

  (SELECT COUNT(*) FROM public.conversations conv
   WHERE conv.buyer_id = p.id) AS buyer_conversation_count,
  (SELECT COUNT(*) FROM public.conversations conv
   JOIN public.listings l ON l.id = conv.listing_id
   WHERE l.seller_id = p.id) AS conversations_on_owned_listings,

  (SELECT COUNT(*) FROM public.messages m
   WHERE m.sender_id = p.id) AS messages_sent_by_profile,
  (SELECT COUNT(*) FROM public.messages m
   JOIN public.conversations conv ON conv.id = m.conversation_id
   WHERE conv.buyer_id = p.id) AS messages_in_buyer_conversations,
  (SELECT COUNT(*) FROM public.messages m
   JOIN public.conversations conv ON conv.id = m.conversation_id
   JOIN public.listings l ON l.id = conv.listing_id
   WHERE l.seller_id = p.id) AS messages_in_seller_conversations

FROM public.profiles p
WHERE LOWER(p.username) IN (
  SELECT LOWER(username)
  FROM public.profiles
  GROUP BY LOWER(username)
  HAVING COUNT(*) > 1
)
ORDER BY LOWER(p.username), p.id;
```

The inventory explicitly covers the current schema's profile dependencies: `listings.seller_id`, `physical_copies.owner_id`, `comments.author_id`, `favorites.user_id`, `activity_events.actor_id`, `conversations.buyer_id`, and `messages.sender_id`, plus artifacts reached through listings and conversations (including listing photos, comments, favorites, activity events, and messages).

## 3. Human-reviewed decision process

1. **Compare Queries A–C.** Match each colliding profile ID to `auth.users` and review every non-zero artifact count. If a query fails because an environment's schema differs, stop and resolve the discrepancy before considering any changes.
2. **Do not infer that a profile is disposable.** A missing Auth row or zero counts is evidence to investigate, not an automatic deletion criterion. Consider retention, audit/history requirements, storage objects, and dependencies not represented in the current schema.
3. **Prepare a case-specific proposal.** For a profile with no matching Auth identity, document why it is believed to be an orphan and every artifact/dependency result. For two real Auth users with case-colliding usernames, propose a username resolution with the affected account owner(s); do not automatically rename either account.
4. **Obtain explicit owner approval.** Present the exact query results and proposed changes to the product owner. No deletion, merge, rename, reassignment, or data migration is permitted without that approval.
5. **Use a separate reviewed change for any approved repair.** No repair SQL belongs in this diagnostic document or in the automated application migration.
6. **Re-run Query A after any separately approved resolution.** It must return no rows before the unique index can be applied.
7. **Apply migration `0009_case_insensitive_usernames.sql` only through the project release gate.** This PR does not authorize a staging/production migration or deployment. Follow issue #49 and obtain explicit owner authorization for the target environment.

## 4. Current verification status

- The repository CI suite can validate schema migrations in an isolated in-memory PostgreSQL engine; this does not inventory live data.
- The existing case-colliding profile rows have **not** been independently correlated to `auth.users` in this PR.
- A human-operated, read-only run of Queries A–C against the intended target environment remains outstanding before the migration can be considered safe to apply.
- No existing accounts, profiles, listings, or other data should be changed as part of this PR.
