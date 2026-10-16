-- Migration: 0011_password_checked_signup_hook.sql
-- Email signup requires a short-lived one-time approval issued after the app HIBP check.
-- Configure this as Supabase Auth's Before User Created hook only after authorized staging migration.

CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS private.password_checked_signup_approvals (
  approval_id uuid PRIMARY KEY,
  email_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT password_checked_signup_approvals_email_normalized_check
    CHECK (email_normalized = pg_catalog.lower(pg_catalog.btrim(email_normalized))),
  CONSTRAINT password_checked_signup_approvals_expiry_check
    CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '5 minutes')
);
--> statement-breakpoint
ALTER TABLE private.password_checked_signup_approvals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE private.password_checked_signup_approvals FROM PUBLIC, anon, authenticated, supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE private.password_checked_signup_approvals TO supabase_auth_admin;
--> statement-breakpoint
GRANT UPDATE (consumed_at) ON TABLE private.password_checked_signup_approvals TO supabase_auth_admin;
--> statement-breakpoint
CREATE POLICY password_checked_signup_hook_read
  ON private.password_checked_signup_approvals FOR SELECT TO supabase_auth_admin USING (true);
--> statement-breakpoint
CREATE POLICY password_checked_signup_hook_consume
  ON private.password_checked_signup_approvals FOR UPDATE TO supabase_auth_admin
  USING (consumed_at IS NULL AND expires_at > pg_catalog.clock_timestamp())
  WITH CHECK (consumed_at IS NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS password_checked_signup_approvals_pending_expiry_idx
  ON private.password_checked_signup_approvals (expires_at)
  WHERE consumed_at IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.enforce_password_checked_signup(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_provider text := COALESCE(event #>> '{user,app_metadata,provider}', '');
  v_email text := pg_catalog.lower(pg_catalog.btrim(COALESCE(event #>> '{user,email}', '')));
  v_approval_id uuid;
  v_rows_updated integer := 0;
BEGIN
  IF v_provider = 'google' THEN RETURN '{}'::jsonb; END IF;
  IF v_provider <> 'email' THEN
    RETURN pg_catalog.jsonb_build_object('error', pg_catalog.jsonb_build_object(
      'http_code', 403,
      'message', 'Sign-up must use an enabled The Vinyl Drop authentication method.'
    ));
  END IF;
  BEGIN
    v_approval_id := NULLIF(event #>> '{user,user_metadata,signup_approval_id}', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_approval_id := NULL;
  END;
  IF v_approval_id IS NOT NULL AND v_email <> '' THEN
    UPDATE private.password_checked_signup_approvals
      SET consumed_at = pg_catalog.clock_timestamp()
      WHERE approval_id = v_approval_id AND email_normalized = v_email
        AND consumed_at IS NULL AND expires_at > pg_catalog.clock_timestamp();
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  END IF;
  IF v_rows_updated <> 1 THEN
    RETURN pg_catalog.jsonb_build_object('error', pg_catalog.jsonb_build_object(
      'http_code', 403,
      'message', 'Email sign-up must use The Vinyl Drop password-security check.'
    ));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.enforce_password_checked_signup(jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.enforce_password_checked_signup(jsonb) TO supabase_auth_admin;
