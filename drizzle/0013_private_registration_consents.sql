-- Migration 0013: minimum Terms acceptance and 18+ attestation audit.
-- Source only until a separately authorized staging migration.
-- In Supabase, auth.users exists and receives the deletion FK below. Test fixtures without
-- a Supabase Auth schema may still apply application migrations without modelling Auth.

CREATE TABLE IF NOT EXISTS private.registration_consents (
  user_id uuid PRIMARY KEY,
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  age_attested_at timestamptz NOT NULL,
  CONSTRAINT registration_consents_terms_version_check
    CHECK (length(btrim(terms_version)) BETWEEN 1 AND 80),
  CONSTRAINT registration_consents_timestamps_check
    CHECK (age_attested_at <= terms_accepted_at + INTERVAL '30 seconds')
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'private.registration_consents'::regclass
         AND conname = 'registration_consents_user_id_fkey'
     ) THEN
    ALTER TABLE private.registration_consents
      ADD CONSTRAINT registration_consents_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE private.registration_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE private.registration_consents FROM PUBLIC, anon, authenticated, supabase_auth_admin;
