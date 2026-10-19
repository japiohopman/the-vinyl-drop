-- Migration 0013: minimum Terms acceptance and 18+ attestation audit.
-- Source only until a separately authorized staging migration.

CREATE TABLE IF NOT EXISTS private.registration_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  age_attested_at timestamptz NOT NULL,
  CONSTRAINT registration_consents_terms_version_check CHECK (length(btrim(terms_version)) BETWEEN 1 AND 80),
  CONSTRAINT registration_consents_timestamps_check CHECK (age_attested_at <= terms_accepted_at + INTERVAL '30 seconds')
);
--> statement-breakpoint
ALTER TABLE private.registration_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE private.registration_consents FROM PUBLIC, anon, authenticated, supabase_auth_admin;
