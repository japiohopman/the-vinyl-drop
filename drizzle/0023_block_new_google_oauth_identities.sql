-- Migration: 0023_block_new_google_oauth_identities.sql
-- A new Google identity must not be created before an app account has completed
-- email/password signup, Terms acceptance, 18+ attestation and email confirmation.
-- Existing users can still sign in with Google: Supabase Auth automatically links
-- a Google identity with the same verified email to an existing user.

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
  IF v_provider = 'google' THEN
    RETURN pg_catalog.jsonb_build_object('error', pg_catalog.jsonb_build_object(
      'http_code', 403,
      'message', 'Create your account with email and password first. After confirming your email, sign in with Google using the same email address.'
    ));
  END IF;

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
