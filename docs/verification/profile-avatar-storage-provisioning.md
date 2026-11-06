# Profile avatar Storage provisioning — Issue #351

The profile editor uses a dedicated Supabase Storage bucket named `profile-avatars`. Do not reuse `listing-photos` or `listing-photo-originals`: those buckets have different listing-specific access rules.

## One-time bucket setup

In the intended Supabase project (staging first, with production only after separate owner approval):

1. Open **Storage → New bucket**.
2. Name it exactly `profile-avatars`.
3. Enable **Public bucket** so public profile pages can render avatar images without an authenticated session.
4. Set the maximum file size to **5 MiB (5,242,880 bytes)**.
5. Allow only `image/jpeg`, `image/png`, `image/webp`, and `image/gif`.

Application code still validates the actual file bytes, MIME match, image dimensions, total decoded animation pixels, frame count and processed output size. The bucket allowlist is an additional restriction, not a substitute for server-side validation.

## Owner-scoped write/delete policies

After creating the bucket, run [profile-avatar-storage-policies.sql](./profile-avatar-storage-policies.sql) in Supabase SQL Editor with a role allowed to manage Storage policies.

The app creates immutable keys in this shape:

- `profiles/<auth-user-uuid>/<random-uuid>.webp`
- `profiles/<auth-user-uuid>/<random-uuid>.gif`

The two authenticated policies permit INSERT and DELETE only if:
- the bucket is `profile-avatars`;
- folder 1 is `profiles`;
- folder 2 is exactly the caller's `auth.uid()`.

Uploads use `upsert: false`, so no UPDATE policy is required. Public object reads come from the bucket's public setting. The application also checks that the requested Storage path belongs to the current authenticated profile before calling Supabase.

Do **not** change any of the four existing `listing-photos` policies or the three private `listing-photo-originals` policies.

## Required verification before enabling the feature on an environment

- Bucket exists, public flag is on, 5 MiB limit and four MIME types match.
- Exactly two policies named `profile-avatars-owner-insert` and `profile-avatars-owner-delete` exist.
- Each predicate binds `profile-avatars` and `profiles/<uid>/...` to the authenticated caller.
- A signed-in owner can upload/delete under their own UUID.
- A different authenticated user cannot upload/delete under that owner's UUID.
- Anonymous visitors can read a known avatar object but cannot upload or delete.
- The previous seven listing-photo/private-source policies are unchanged. The repository's exact Storage policy validator accepts only the original seven-policy set or that set plus these exact two avatar policies.

This document and SQL file only describe manual preparation. Merging the PR or running CI does not create a remote bucket, add Storage policies, upload profile images, apply a remote migration, deploy, or change any live setting.
