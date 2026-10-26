
-- Saved People is an owner-private preference, not a public Follow relationship.
CREATE TABLE public.saved_people (
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  saved_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_people_no_self_check CHECK (owner_user_id <> saved_user_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX saved_people_owner_saved_unique_idx
  ON public.saved_people (owner_user_id, saved_user_id);
--> statement-breakpoint
CREATE INDEX saved_people_owner_created_idx
  ON public.saved_people (owner_user_id, created_at);
--> statement-breakpoint
ALTER TABLE public.saved_people ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.saved_people FROM PUBLIC, anon, authenticated;
