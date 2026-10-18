-- Migration: 0013_add_listing_photo_roles.sql
-- Record what each seller photo depicts; gallery order remains independent.
-- Existing rows become legacy_unclassified, never guessed front/back.

ALTER TABLE public.listing_photos
  ADD COLUMN role text NOT NULL DEFAULT 'legacy_unclassified';
--> statement-breakpoint
ALTER TABLE public.listing_photos
  ADD CONSTRAINT listing_photos_role_check
  CHECK (role IN ('front_cover', 'back_cover', 'inside_sleeve', 'insert_poster', 'record', 'detail', 'other', 'legacy_unclassified'));
--> statement-breakpoint
CREATE UNIQUE INDEX listing_photos_front_cover_unique_idx
  ON public.listing_photos (listing_id)
  WHERE role = 'front_cover';
--> statement-breakpoint
CREATE UNIQUE INDEX listing_photos_back_cover_unique_idx
  ON public.listing_photos (listing_id)
  WHERE role = 'back_cover';
