-- Ranked catalogue suggestions use PostgreSQL trigram matching and accent normalization.
-- Keep extension objects outside the public Supabase Data API schema.
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE INDEX releases_artist_trgm_idx
  ON public.releases USING GIN (artist extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX releases_title_trgm_idx
  ON public.releases USING GIN (title extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX releases_label_trgm_idx
  ON public.releases USING GIN (label extensions.gin_trgm_ops);
