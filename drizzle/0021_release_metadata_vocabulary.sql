ALTER TABLE public.releases
  ADD COLUMN country_code text,
  ADD COLUMN canonical_genres text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN format_characteristics text[] NOT NULL DEFAULT '{}'::text[];

--> statement-breakpoint
ALTER TABLE public.releases
  ADD CONSTRAINT releases_country_code_check
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

--> statement-breakpoint
CREATE INDEX releases_country_code_idx ON public.releases (country_code);

--> statement-breakpoint
CREATE INDEX releases_canonical_genres_idx ON public.releases USING gin (canonical_genres);

--> statement-breakpoint
CREATE INDEX releases_format_characteristics_idx ON public.releases USING gin (format_characteristics);

--> statement-breakpoint
COMMENT ON COLUMN public.releases.country_code IS
  'Nullable ISO 3166-1 alpha-2 code; country keeps the readable source/display label.';

--> statement-breakpoint
COMMENT ON COLUMN public.releases.canonical_genres IS
  'Recognized canonical genre tags; genre retains original source text.';

--> statement-breakpoint
COMMENT ON COLUMN public.releases.format_characteristics IS
  'Explicit format characteristics only; format retains original source text.';
