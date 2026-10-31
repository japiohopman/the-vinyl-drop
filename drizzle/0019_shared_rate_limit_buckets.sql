-- Shared, privacy-preserving fixed-window rate-limit counters.
-- The application connects directly to PostgreSQL; the Supabase Data API roles
-- must never be able to inspect or mutate these private counters.

CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
CREATE TABLE private.rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT rate_limit_buckets_key_check
    CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT rate_limit_buckets_count_check
    CHECK (hit_count > 0),
  CONSTRAINT rate_limit_buckets_expiry_check
    CHECK (expires_at > window_start),
  CONSTRAINT rate_limit_buckets_pkey
    PRIMARY KEY (bucket_key, window_start)
);
--> statement-breakpoint
CREATE INDEX rate_limit_buckets_expiry_idx
  ON private.rate_limit_buckets (expires_at);
--> statement-breakpoint
ALTER TABLE private.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE private.rate_limit_buckets
  FROM PUBLIC, anon, authenticated, supabase_auth_admin;
