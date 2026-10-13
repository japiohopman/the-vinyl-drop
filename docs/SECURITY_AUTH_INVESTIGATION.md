# Security and Authentication Investigation

**Status:** Open investigation — password recovery passed staging; credential-logging source and homepage database-query root cause remain unresolved  
**Last updated:** 2026-10-13  
**Repository:** The Vinyl Drop  
**Related work:** [Issue #85 — this investigation handoff document](https://github.com/japiohopman/the-vinyl-drop/issues/85), [Issue #87 — root-cause investigation and remediation](https://github.com/japiohopman/the-vinyl-drop/issues/87), [Issue #79 — password recovery](https://github.com/japiohopman/the-vinyl-drop/issues/79), [PR #81 — recovery implementation](https://github.com/japiohopman/the-vinyl-drop/pull/81), [Issue #82 — Supabase Auth email branding](https://github.com/japiohopman/the-vinyl-drop/issues/82)

## Purpose

Preserve the history and resolution of the password-recovery failure, and track the still-unresolved credential-related browser Console output and development homepage database error in one place for the CLI agent and reviewers.

This is an evidence log, not a claim that a root cause has been found. Confirmed observations, hypotheses, and outstanding work are separated below. Update this document as investigation and tests produce evidence.

> **Security rule:** Never add passwords, access tokens, refresh tokens, recovery-cookie values, OTPs, token hashes, full recovery URLs, authorization headers, database connection strings, or other secrets to this document, issues, pull requests, screenshots, test output, or logs. Refer to credential names only.

## Current summary

| ID | Area | Observed result | Status |
| --- | --- | --- | --- |
| SEC-01 | Credential exposure | Authentication cookie values from a local test session were included in a troubleshooting message. The user also reported seeing a token/code as a log entry in the browser Console. | Treat shared session credentials as compromised; exact Console log source remains unknown. |
| AUTH-01 | Password reset | The operator completed the full staging recovery tests, including login with the new password and rejection of the old password. | **Required email/password-recovery tests passed on 2026-10-13.** The recovery feature works end-to-end; the independent credential-logging audit remains open under SEC-01. |
| AUTH-02 | Reset email link | The operator confirmed the staging Supabase URL configuration/template, requested a fresh email, followed the staging callback, completed the password update, rejected the old password, and then successfully signed in using the new password. | Manual staging verification of the required email/recovery tests passed on 2026-10-13. Never copy a full recovery URL or token into the record. |
| DB-01 | Homepage listings | The published-listings query fails in development while loading the homepage. Captured output includes SQL and a stack trace but no underlying PostgreSQL error code/message. | Root cause unknown. |

## SEC-01 — Authentication credentials potentially exposed

### Observations

- During troubleshooting, the user shared the Network details of a request to `http://localhost:3000/auth/reset-password`.
- The copied request included cookie names `sb-access-token`, `sb-refresh-token`, and `sb-recovery-mode`, **along with their values**. Those values are intentionally not reproduced here.
- The user confirmed that a token/code was visible in a log entry in the browser Console, rather than only in Firefox Network request headers.
- The exact Console source file and line number have not yet been identified.
- The repository search below was run from the project root:

  ```powershell
  git grep -n -I -E 'console\.(log|debug|info|warn|error)|token_hash|access_token|refresh_token|PASSWORD_RECOVERY'
  ```

  The reported results included logging in `.github/workflows/phase-safety-gate.yml`, recovery-template documentation in `docs/STAGING_BETA_DEPLOYMENT.md`, and diagnostic logging references in `docs/last_chat.md`. This search did not identify an explicit authentication-token logging statement in application source. **That is not proof that no leak exists:** indirect object logging, request loggers, dependencies, built assets, runtime middleware, and ignored or untracked files still need to be considered.

### Impact and containment

Treat the shared authentication cookie values as disclosed bearer credentials, even though this was a test account and the application was running locally.

- Invalidate/revoke the affected test session as far as the available Supabase Auth session controls allow.
- Clear the affected `localhost:3000` cookies before repeating the test.
- If investigation finds that an actual account password was exposed in a log or shared artefact, reset that password as well. The shared Network excerpt contained authentication cookies; it did not establish that a plaintext password itself was logged.
- Do not assume that deleting a user or clearing local cookies alone invalidates every token already issued. Confirm the session-revocation outcome and account for any unexpired access token.
- Record the containment action and verification result here once completed. They are not confirmed complete at the time of writing.

### Required investigation

1. In Firefox Console, click the source link and line number displayed next to the sensitive log entry. Record only the source file and line number; do not copy the token or the whole log value into chat/issues.
2. Search tracked and untracked application sources, browser bundles/source maps where applicable, and relevant request/error logging configuration.
3. Inspect all authentication-related logging, including logging of `req`, `req.headers`, `req.cookies`, `req.query`, `req.body`, Supabase `session`/user objects, and complete authentication error objects.
4. Check whether callback URLs, referrer headers, request logs, HTML responses, analytics, or third-party assets can expose recovery query parameters.
5. Replace sensitive logging with structured, sanitized events: event name, route, status/error category and a safe correlation identifier. Do not serialize credential-bearing objects. Preserve actionable diagnostics rather than silently swallowing errors.
6. Audit `docs/last_chat.md` and other committed diagnostic artefacts for actual credentials, secret connection strings, or sensitive query output. Remove or redact any real secrets found; do not copy such values into a new issue.
7. Add regression tests that verify credentials are not included in application-generated logs or user-facing error responses where the logging layer can be tested reliably.

### Distinguish browser tooling from application logging

Firefox DevTools can display cookies and headers under Network even when the application never logs those values. In this case, the user separately confirmed seeing a Console log entry, so the source must be traced. Do not conclude that the logging vulnerability is fixed until that entry is identified and the relevant code/configuration is tested.

## AUTH-01 — Historical reset failure, corrected in PR #81

> **Current status (2026-10-13):** the corrected recovery flow has passed the required staging email/password tests, including rejection of a known-breached password, rejection of the old password, and successful sign-in with the new password. The report below records the original failure before the fix; it is not the current staging result.

### Historical reproduction (before the PR #81 correction)

1. Request a password recovery email using the local application and test account.
2. Open the reset link. The browser reaches `/auth/reset-password`.
3. Submit the new password.
4. `POST /auth/reset-password` returns **HTTP 400 Bad Request** with the error `Auth session missing!`.

The inspected request included the three cookie names listed in SEC-01, but that alone did not prove that the server validated the session successfully, that middleware attached a user/session, or that Supabase's client used by the password-update operation had the expected session. The missing-session path was corrected by the `setSession()` change in merged PR #81 and the corrected recovery flow passed staging verification on 2026-10-13.

### Relevant code paths

- `src/app/controllers/authController.ts` — callback handling and GET/POST reset handlers.
- `src/app/services/authService.ts` — callback verification and password update.
- `src/app/middleware/auth.ts` — session extraction, refresh, and recovery-marker verification.
- `src/app/routes/authRoutes.ts` — route registration and middleware ordering.
- `test/auth.test.ts`, `test/authCookieFlags.test.ts`, and relevant recovery tests.
- `docs/STAGING_BETA_DEPLOYMENT.md` — staging instructions and recovery-email template.

### Historical diagnostic checklist and ongoing security invariants

The diagnostic steps below document the original investigation. The successful staging email/reset/login test is now confirmed; unresolved work in this document concerns SEC-01 and DB-01. Preserve all security invariants in any future change.

1. Trace the request end-to-end when investigating any future regression: reset email request → callback → OTP/token verification → session cookie response → redirect → session middleware → reset POST → Supabase password update → cookie/session cleanup.
2. Inspect the callback response status and redirect, whether it sets the expected cookies, cookie attributes, and whether the following POST sends them. Record only cookie **names and attributes**, never values.
3. Inspect server-side state at the POST and the actual sanitized Supabase error. Determine why the session is missing despite cookie names being present in the request.
4. Verify the local environment's cookie flags, host, path, SameSite, and Secure behaviour. Do not change production configuration to debug a local flow.
5. Keep recovery state cryptographically verified and bound to the authenticated user. A `type=recovery` query parameter, an ordinary login session, or a user-forged recovery cookie must not authorize a password change.
6. Return safe, actionable errors to the user without reflecting tokens, passwords, cookie values, SQL, or stack traces.
7. Test successful recovery and rejection of missing, expired, invalid, or forged recovery state. Verify logout/cookie cleanup after a successful reset.

**Do not weaken or bypass `isRecoverySessionVerified` or the server-side verification requirement to make the test pass.**

## AUTH-02 — Historical email-link issue, corrected and verified on staging

> **Current status (2026-10-13):** the staging URL configuration and custom token-hash template were verified, and the operator confirmed the complete recovery email/password test sequence passed. The observations below preserve the earlier local/redirect problem and are not a current blocker.

### Historical observations (before staging configuration was corrected)

- The received message used a custom callback-style link targeting the local app at `/auth/callback`, with a recovery destination and recovery-related query parameters.
- The `token_hash` value observed in the link appeared to start with `pkce_`. The value itself is deliberately omitted.
- The user initially reached the reset-password page, but submitting the form failed as described in the historical AUTH-01 report.
- The runbook documents the custom Supabase Reset Password template using `{{ .RedirectTo }}`, `{{ .TokenHash }}`, and `type=recovery`; this template and the corrected staging callback were subsequently verified in the successful staging test.

### Historical diagnostic checklist

- Inspect the actual configured Supabase template and the actual link structure locally without copying the complete URL into logs, documentation, or chat.
- Confirm that the variable and link format produce the token type expected by the application's callback.
- Confirm which verification method is used by the running code and verify the token server-side using the supported Supabase Auth flow.
- Check whether a redirect URL already contains query parameters and whether the template appends additional parameters correctly.
- Distinguish a real OTP/token-verification failure from a session persistence/middleware failure.
- Document a safe template example only after it is verified against the implementation and a successful staging end-to-end test.

These bullets preserve the original diagnostic questions; the configured staging link/callback has since passed the manual recovery test. Never log or expose the token.

## DB-01 — Homepage published-listings query failure

### Observations

The local server reports startup on port 3000 in development mode, then the homepage listings query fails.

Reported stack trace:

- `src/app/repositories/listingRepository.ts:247` — `searchListings`
- `src/app/services/listingService.ts:194` — `getHomeFeedListings`
- `src/app/controllers/homeController.ts:9` — `getHomePage`

The failing query selects listing details and related physical-copy, release, and seller profile fields. It joins `listings`, `physical_copies`, `releases`, and `profiles`, filters to published listings, orders by creation time descending, and limits the result to six.

The captured error includes the SQL and parameters (published status and limit) but does not reveal the underlying database error code or server diagnostic. No root cause is confirmed.

### Required investigation

1. Capture the underlying PostgreSQL error code, sanitized message, and relevant constraint/relation/column detail without logging connection strings or user data.
2. Inspect `searchListings` and compare its selected fields/joins to the current Drizzle schema and migrations.
3. Verify which local database the application is connected to, without printing `DATABASE_URL`, `DATABASE_DIRECT_URL`, or credentials.
4. Determine whether the cause is a schema mismatch, missing relation/column, migration state, data issue, or another query/database problem. Do not assume one in advance.
5. Improve error reporting so developer logs retain the PostgreSQL code and safe diagnostic context, while production responses never expose SQL, filesystem paths, stack traces, credentials, or database internals.
6. Add/adjust tests for the intended query and safe handling of query failure.

Keep this investigation separate from password recovery unless evidence establishes a common cause.

## Supabase email delivery and branding dependency

Issue [#82 — brand and polish Supabase Auth email templates](https://github.com/japiohopman/the-vinyl-drop/issues/82) tracks the wider email presentation work: product identity, clear explanatory text, primary action, accessible responsive HTML, and a useful footer.

In the reported setup, Resend's testing mode rejected email delivery to recipients other than the configured test recipient until a sending domain was verified. No custom domain was available at the time of the report.

Keep the following concerns separate:

- **Delivery infrastructure:** SMTP credentials, sender identity, and provider/domain verification.
- **Template presentation:** branding, text, layout, footer, and accessibility.
- **Recovery correctness/security:** token variables, callback URL, server-side verification, session lifecycle.

Do not weaken the provider's sending restrictions or change production Auth configuration during this investigation. Test changes in staging first.

## Remaining investigation closure checklist

The recovery-specific items below are checked because the merged fix, the required staging email/password tests, and automated session-cleanup coverage are confirmed. Issue #87 remains open until the independent security-logging and database-query findings are resolved.

- [ ] Identify the exact source file/line responsible for the reported credential-related Console log entry (SEC-01).
- [ ] Revoke/contain the affected test session as far as possible and record the outcome (SEC-01).
- [ ] Confirm no passwords, access tokens, refresh tokens, recovery cookies, OTPs, or complete recovery links are logged by application code or exposed in responses (SEC-01).
- [x] Explain and fix the historical `Auth session missing!` failure without weakening server-side recovery verification (PR #81; staging retest passed).
- [x] Verify the email-template link format and successful recovery end-to-end in staging (operator-confirmed 2026-10-13).
- [x] Confirm the password changes, old-password login is rejected, new-password login succeeds, and recovery-session sign-out/cookie-clearing behavior is covered by the implementation and regression tests.
- [ ] Capture the underlying PostgreSQL error and resolve or document the homepage listings query failure (DB-01).
- [ ] Audit `docs/last_chat.md` and related diagnostic artefacts for accidental secret exposure.
- [x] Run relevant recovery unit/integration tests and record CI results: [CI #38378272942](https://github.com/japiohopman/the-vinyl-drop/actions/runs/38378272942) and [Phase Safety Gate #38378269653](https://github.com/japiohopman/the-vinyl-drop/actions/runs/38378269653). The independent DB-01 tests still depend on diagnosis.
- [x] No production settings were changed as part of the recovery fix or this documentation update.

## CLI agent hand-off

Start with a read-only inspection and a concise root-cause report. Then propose focused changes and tests. Preserve the current recovery security invariant, never print secrets, do not modify `CHATGPT.md`, do not bypass repository safety gates, and do not merge any pull request. Update this document with confirmed findings, remediation, and test evidence after the implementation has been reviewed.


## Evidence update — 2026-10-13 (PR #81 follow-up)

This update records the current state without marking Issue #87 complete.
The operator-confirmed staging password-update result below supersedes the earlier pending-manual-retest statements for the live password-update step only; it does not resolve the separate Console-source or DB-01 findings.

### AUTH-01 / AUTH-02 — Password recovery session

- The operator reproduced `Auth session missing!` when submitting a new password on the reset page at prior PR HEAD `e9b373bab378eb377c2a73b60307c90a54fd8253`. At that revision, `updatePassword()` did not explicitly initialize the Supabase client session immediately before calling `updateUser({ password })`.
- A follow-up commit `5265f45c891ac2d7c2d007e0c38d7346bb55dfe1` on PR #81 restores an explicit `supabase.auth.setSession({ access_token, refresh_token })` step and fails safely before `updateUser` if tokens are absent or session setup fails. Automated regression tests now cover successful session setup and failure/missing-session behavior.
- GitHub Actions CI passed on that commit: [CI run #38372794718](https://github.com/japiohopman/the-vinyl-drop/actions/runs/38372794718) (lint, typecheck, unit/integration tests, build). The Phase Safety Gate passed on the same commit: [run #38372791640](https://github.com/japiohopman/the-vinyl-drop/actions/runs/38372791640).
- **Manual staging result — 2026-10-13:** the operator confirms all required recovery email tests passed: fresh recovery email delivered, corrected staging callback reached, a known-breached password rejected, a strong new password accepted, the old password rejected, and sign-in with the new password succeeded. This confirms the required recovery flow end-to-end. The code and automated tests cover local recovery-session sign-out and auth/recovery-cookie clearing after a successful password update.
- The current implementation grants recovery-only state only after successful server-side `verifyOtp({ token_hash, type: 'recovery' })`. A regular PKCE `code` exchange is deliberately not sufficient because the callback query's `type`/destination can be user-controlled. The reset email must therefore use the custom token-hash link documented for PR #81; the ordinary Supabase `/auth/v1/verify?token=...` route that returns a PKCE `code` is not accepted as recovery proof by this implementation.
- The absence of the prior credential-related Console output was reported by the operator, but the exact former Console source is still not independently identified. Do not mark SEC-01 resolved based on that observation alone.

### DB-01 — Separate listings-query finding

The homepage `searchListings` failure remains a separate investigation from password recovery. Retain the prior database evidence and do not infer that a passing auth CI run or the recovery-session change resolves DB-01. Verify the intended database/schema only if this failure recurs; no live database operation is authorized by this note.

### Complete staging recovery test — 2026-10-13

- **Correction to the earlier interim report:** all required recovery email tests passed, as the operator clarified: fresh recovery email delivered, staging callback worked, known-breached password was rejected, a strong new password was accepted, the old password was rejected, and sign-in with the new password succeeded. The earlier mention of failed login was a misunderstanding in the conversation, not a verified product defect.
- The implementation revokes the recovery session and clears the auth/recovery cookies after a successful password update; automated regression coverage checks the session cleanup call and the route's cookie-clearing behavior.
- The recovery flow no longer needs additional email/password tests. Issue #87 remains open for the unrelated credential-related Console source/containment (SEC-01) and homepage listings-query investigation (DB-01). Do not share passwords, full recovery URLs, tokens, cookies, API keys, or secret values.

- Keep Issue #87 open until SEC-01 Console-source/containment and DB-01 root-cause evidence are resolved and recorded. AUTH-01/AUTH-02 recovery testing passed on staging and is no longer an outstanding blocker.
