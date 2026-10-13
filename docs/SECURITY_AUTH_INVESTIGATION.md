# Security and Auth Investigation Document (Issue #87)

*Last Updated:* October 2026

## 1. Executive Summary & Audit Context
This document records the factual investigation findings regarding runtime auth errors, database column migrations, and credential logging analysis.

## 2. Confirmed Findings & Evidence

### SEC-01 — Console / Log Credential Audit
- **Inspection:** Audited application routes, error handlers, and session helpers (`src/app/middleware/errorHandler.ts`, `src/app/controllers/authController.ts`, `src/app/services/authService.ts`).
- **Result:** Passwords, hashes, PKCE verifiers, session tokens, and recovery tokens are processed purely in memory and encrypted cookies. No passwords or credentials are logged or printed to standard error / standard output.
- **Unresolved / Limitation:** External browser console logs (e.g., local Firefox network log captures or third-party extension captures) were not independently captured in automated headless runs. Application server-side logs do not output credential material.

### AUTH-01 / AUTH-02 — Password Recovery & Session Verification
- **Current State:** Implemented on feature branch for PR #81 / Issue #79.
- **Recovery Session Marker:** Cryptographically verified HMAC-SHA256 recovery token (`sb-recovery-mode`) bound to active `req.user.id` using server-only `config.RECOVERY_SIGNING_SECRET` (minimum 32 characters required in staging/production).
- **Callback Paths:** Supports both `token_hash` + `type=recovery` and PKCE `code` + `type=recovery` callback flows without trusting arbitrary client query parameters.
- **Access Guard:** GET and POST `/auth/reset-password` strictly verify `isRecoverySessionVerified(req)`. Standard login sessions and forged or expired tokens return HTTP 400 Bad Request.
- **Breached Password Guard:** Server-side Zod validation (`resetPasswordSchema`) enforces `confirmPassword` equality. Pre-Auth HIBP range lookup (`isPasswordPwned`) rejects pwned passwords before calling `supabase.auth.updateUser({ password })`.

### DB-01 — Database Migration & Error Trace Analysis
- **Observed Trace:** `docs/chat_history/errors.md` documents a past local runtime query error (`searchListings` → `getHomeFeedListings` → `getHomePage`) caused by SQLSTATE `42703` (missing `profiles.website_url` column prior to applying migration `0004_mighty_spacker_dave.sql`).
- **Scope Distinction:** The reported listings trace belongs to the homepage feed request path, not the `POST /auth/login` authentication path. Applying migration `0004_mighty_spacker_dave.sql` resolved the `website_url` column issue for listing queries.
- **Auth Error Root Cause:** The Auth error and the listings missing-column error must not be conflated. Future runtime auth errors are handled cleanly via centralized Express error handling without exposing database schema details.

## 3. Verification Suite Evidence
- Commands executed on current branch:
  ```bash
  npm run typecheck
  npm run lint
  npm test
  npm run build
  ```
- **Results:**
  - TypeScript typecheck: 0 errors
  - ESLint: 0 errors
  - Jest Test Suite: 360/360 tests passing across 27 suites
  - Build (`tsc`): Exit code 0

## 4. Human-Only Staging Actions Remaining
- Configure mandatory `RECOVERY_SIGNING_SECRET` (>= 32 characters) in Render staging service environment.
- Configure Supabase Staging Auth Reset Password template redirect URL (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`).
- Perform live staging recovery smoke test (email delivery, token_hash callback, breached password rejection, password reset, and re-login).
