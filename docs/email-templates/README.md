# The Vinyl Drop — Supabase Auth Email Templates

These are the branded HTML drafts for the Supabase Auth email templates owned by [Issue #82](https://github.com/japiohopman/the-vinyl-drop/issues/82). They follow the existing 90s record-shop look in [UX_UI.md](../UX_UI.md) and the actual tokens in `public/css/style.css`: paper, ink, and the infrared / 90s pink accent.

## Where to use them

In the **staging** Supabase project, open **Authentication → Email Templates**.

| Supabase template | HTML source | Suggested subject |
| --- | --- | --- |
| Confirm signup | [confirm-sign-up.html](./confirm-sign-up.html) | Confirm your email address — The Vinyl Drop |
| Reset password | [reset-password.html](./reset-password.html) | Reset your password — The Vinyl Drop |

Do not make changes to production Auth templates as part of this issue.

## Important link contracts

- **Reset Password:** preserve `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery`. The existing recovery implementation expects this server-verifiable token-hash flow. Do not replace it with `{{ .ConfirmationURL }}` or a PKCE `code` link.
- **Confirm Sign Up:** the final draft uses `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email`. **Do not save this Confirm Sign Up template in staging until Issue #109's `emailRedirectTo` callback code and automated tests are merged and deployed**, and the staging callback URL is allow-listed. The redirect value needs to arrive with the application's intended, safe `next` destination. A template change by itself does not implement the callback.
- Keep template links and token variables exactly as written. Do not log, paste into issues, or share real confirmation/reset links or token hashes.

## Visual approach

- Existing brand mark: `public/assets/brand/vinyl-drop-cartridge.svg`, referenced from `https://thevinyldrop.nl/assets/brand/vinyl-drop-cartridge.svg`. The HTML always shows a text wordmark too, so the brand still reads if an email client blocks the SVG.
- Colors: paper `#F3EFE7`, white surface `#FFFDF8`, ink `#151515`, infrared pink `#f60f4b`, and darker infrared `#d6003b` for text links.
- Layout uses simple table markup, inline styles, square edges, high-contrast borders, and one clear action. It does not load the website's CSS or rely on web fonts, JavaScript, remote fonts, or background images.
- Image rendering varies by email client. The wordmark and action copy remain understandable if images or custom fonts are unavailable.

## Staging verification

1. Save the Reset Password template in staging and keep its link contract unchanged. Its existing successful staging recovery run remains the baseline; rerun the flow only if a change to its link or behavior makes that necessary.
2. Complete, merge, and deploy Issue #109 before saving the Confirm Sign Up template.
3. Check Auth state before creating/retrying a signup identity so a failed attempt does not create duplicate test accounts.
4. Send one permitted staging confirmation email. Verify receipt, that the link reaches the staging `/auth/callback` with `token_hash` and `type=email`, and that the account becomes confirmed.
5. Inspect both email renders on desktop and mobile: image fallback, text wrapping, CTA readability, links, footer, and dark/light client behavior where available.
6. Confirm that no production template/SMTP setting was changed and that authentication URL tracking or third-party rewriting has not been enabled.

The files in this directory are source-of-truth drafts and documentation; they do not update the Supabase dashboard automatically.
