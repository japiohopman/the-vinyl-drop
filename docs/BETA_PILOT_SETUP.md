# Invite-only beta pilot setup — Issue #48

This procedure is for a small pilot of **no more than five personally known testers**. It is not a public launch.

## What the code does

- Password sign-up and password sign-in are checked against a server-side email allowlist.
- Google/OAuth and email-verification callbacks are checked after the provider verifies the identity but before the application creates a profile or grants app access.
- Existing application sessions are checked against the current allowlist too. Removing an address from the list denies its next application request.
- When invite-only mode is enabled, an empty allowlist denies everyone. Configuration validation rejects malformed addresses and more than five unique addresses.
- The first successful beta sign-in in a browser sets a first-party, HTTP-only "welcome seen" cookie for 180 days plus a one-minute display-only flash. The next HTML response shows and clears the welcome flash. The persistent marker only remembers the welcome presentation in that browser; it does not grant access. It can be reset by clearing browser cookies, and another browser/device may show the welcome once too.
- Password recovery remains privacy-neutral in its response and is only sent for an address that currently has pilot access.
- There is no public waitlist, public email form, newsletter, automatic invitation, or new email-provider integration.

## Private runtime settings

Set these only in the access-restricted runtime environment settings when the separate staging/security gate authorizes activation:

- `BETA_INVITE_ONLY_ENABLED=true`
- `BETA_ALLOWED_EMAILS` to the comma-separated addresses of manually approved pilot testers (at most five unique, valid email addresses).

Do not put real addresses in `.env.example`, GitHub Issues, PRs, source files, screenshots, logs, commits, or public documentation. The committed example values are comments only. The live runtime settings have **not** been changed as part of this code work.

## Activation order

A passing code build does not, by itself, authorize the pilot.

1. Finish the PR review and obtain the owner's merge approval.
2. Finish Issue #88's minimum accurate privacy disclosure and data-rights/contact ownership, plus the applicable staging/security requirements recorded in #49.
3. Add no more than five manually approved addresses to the restricted runtime allowlist and enable `BETA_INVITE_ONLY_ENABLED`. Never save the list in GitHub.
4. With the authorized staging process, smoke-test one approved synthetic identity and one denied synthetic identity through password and provider sign-in as applicable. Confirm the welcome appears once per browser and does not repeat after its flash is consumed.
5. Update and approve the privacy notice to disclose the first-party welcome-state cookie and its 180-day lifetime before sending real invitations.
6. Only after those checks and explicit owner approval, manually invite the real testers.

No database migration is added for the beta welcome. Do not change production settings or database as part of this pilot setup. If the staging target or provider configuration is uncertain, stop and verify it before making a change.

## Owner-operated process

Choose pilot testers manually and add their addresses only to the restricted runtime allowlist and any required provider-level tester configuration. Send invitations manually; the repository intentionally has no recipient list or invitation email automation.

To revoke access, remove the address from the runtime allowlist. Application cookies for a removed address are checked on the next request and cleared; the private beta banner is not an access credential.

Do not collect interested visitors' email addresses for this five-person pilot. A public waitlist, newsletter, or larger cohort requires separate explicit owner-approved scope and the relevant privacy and anti-abuse gates.
