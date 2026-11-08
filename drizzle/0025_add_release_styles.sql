ALTER TABLE public.releases
  ADD COLUMN styles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN canonical_styles text[] NOT NULL DEFAULT '{}'::text[];

--> statement-breakpoint
CREATE INDEX releases_canonical_styles_idx ON public.releases USING gin (canonical_styles);

--> statement-breakpoint
COMMENT ON COLUMN public.releases.styles IS
  'Raw provider-supplied or submitted style text; preserves unmapped values without loss.';

--> statement-breakpoint
COMMENT ON COLUMN public.releases.canonical_styles IS
  'Recognized canonical style tags; styles retains original source text.';
