# Invite-only beta pilot setup — Issues #48 and #290

This runbook prepares the application for a **private, manually invited cohort of up to 13 testers**. It is not a public launch, public waitlist, or permission to expand the live cohort.

## Capacity versus activation

- Source configuration accepts at most **13 unique, valid email addresses** in `BETA_ALLOWED_EMAILS`.
- Duplicate addresses are counted case-insensitively after trimming whitespace.
- This is a technical ceiling only. It does **not** change the active runtime allowlist, invite anyone, or authorize a wider cohort.
- Keep the currently active cohort at no more than five until the separate wider-cohort release gates below are complete and Jaap explicitly authorizes expansion.
- Keep the server-side invite-only gate enabled whenever real beta access is active.

## What the code does

- Password sign-up and password sign-in are checked against a server-side email allowlist.
- Google/OAuth and email-verification callbacks are checked after the provider verifies the identity but before the application creates a profile or grants app access.
- Existing application sessions are checked against the current allowlist too. Removing an address from the list denies its next application request.
- When invite-only mode is enabled, an empty allowlist denies everyone. Configuration validation rejects malformed addresses and more than 13 unique addresses.
- The first successful beta sign-in in a browser sets a first-party, HTTP-only "welcome seen" cookie for 180 days plus a one-minute display-only flash. The next HTML response shows and clears the welcome flash. The persistent marker only remembers the welcome presentation in that browser; it does not grant access. It can be reset by clearing browser cookies, and another browser/device may show the welcome once too.
- Password recovery remains privacy-neutral in its response and is only sent for an address that currently has pilot access.
- There is no public waitlist, public email form, newsletter, automatic invitation, or new email-provider integration.

## Private runtime settings

Only change these in the access-restricted runtime environment after the applicable release gates and separate owner authorization permit activation or expansion:

- `BETA_INVITE_ONLY_ENABLED=true`
- `BETA_ALLOWED_EMAILS` to the comma-separated addresses of manually approved testers (at most 13 unique, valid email addresses, once expansion is authorized).

The live allowlist and provider-level tester lists are separate controls. Do not put real addresses in `.env.example`, GitHub Issues, PRs, source files, screenshots, logs, commits, or public documentation. The committed example values are comments only. This code change does **not** alter live runtime or provider settings.

## Wider-cohort release gates

Before increasing the live cohort beyond five:

1. Complete and reconcile the before-expansion security and release work in [#89](https://github.com/japiohopman/the-vinyl-drop), [#118](https://github.com/japiohopman/the-vinyl-drop), and the applicable privacy/data-handling requirements in [#88](https://github.com/japiohopman/the-vinyl-drop) / [#154](https://github.com/japiohopman/the-vinyl-drop).
2. Confirm the production boundary and release requirements in [#278](https://github.com/japiohopman/the-vinyl-drop) before any production access change.
3. Obtain Jaap's explicit authorization for the exact cohort expansion and runtime/provider edits.
4. Only then update the private runtime allowlist and the separate Google OAuth test-user list consistently. Keep `BETA_INVITE_ONLY_ENABLED=true`; never add addresses to Git.
5. With the separately authorized staging process, smoke-test one approved synthetic identity and one denied synthetic identity through password and provider sign-in as applicable. Confirm the welcome appears once per browser and does not repeat after its flash is consumed.
6. Update and approve the privacy notice to disclose the first-party welcome-state cookie and its 180-day lifetime before sending real invitations.
7. Only after those checks and explicit owner approval, manually invite the approved real testers.

A passing source build does not, by itself, authorize any runtime change or invitation. Keep `MESSAGING_ENABLED=false` and `SHARED_RATE_LIMITS_ENABLED=false` unless their own separately approved procedures authorize activation. No database migration is added for the beta welcome. Do not change production settings or database as part of this source-only preparation. If the target or provider configuration is uncertain, stop and verify it before a separately authorized change.

## Owner-operated process

Choose testers manually and add their addresses only to the restricted runtime allowlist and any required provider-level tester configuration after the gates above. Send invitations manually; the repository intentionally has no recipient list or invitation email automation.

To revoke access, remove the address from the runtime allowlist. Application cookies for a removed address are checked on the next request and cleared; the private beta banner is not an access credential.

Do not collect interested visitors' email addresses for this private pilot. A public waitlist, newsletter, or broader public registration requires separate explicit owner-approved scope and the relevant privacy and anti-abuse gates.
