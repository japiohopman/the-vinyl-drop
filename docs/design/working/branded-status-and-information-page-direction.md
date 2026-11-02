# Branded Status and Information Page Direction

**Governing issue:** [#310 — map all screens, information pages and branded error states](https://github.com/japiohopman/the-vinyl-drop/issues/310)

**Status:** design direction only. No templates, status handling, HTTP behavior, legal copy or application assets are changed by this document.

## Shared visual foundation

Keep the same system visible across main marketplace, account, information and error screens:

- The Vinyl Drop's independent 90s record-shop / crate-digging character.
- Paper background, dark ink, strong square borders and restrained infrared accent.
- Existing display/body/metadata typography roles and CSS theme tokens; don't introduce a separate color system for errors.
- The shared header/footer and recognizable navigation where the route/layout supports them.
- Direct, human copy. Clear recovery actions. No generic SaaS illustration style, gradients, oversized rounded cards or fake social-media language.
- Preserve all existing keyboard, focus, screen-reader, reduced-motion and contrast requirements.

## 404 — “Not in this crate”

### Visual concept

An empty vinyl sleeve (or empty CD case as a secondary reference) with the record missing. The empty sleeve is the metaphor: the requested page or record cannot be found. Make it unmistakably a record-shop image, not a generic broken-file icon.

Suggested short copy direction (not final copy):
- Eyebrow: `MISSING FROM THE CRATE`
- Heading: `This record isn't here.`
- Supporting line: `The page or listing may have moved, sold, or slipped out of the crate.`

### Recovery actions

- Primary: `Browse records` → `/browse`.
- Secondary: `Back to Home` → `/`.
- For a listing/profile that no longer exists, keep the message generic and do not reveal whether a private/draft object exists.

### Layout and asset direction

- One large, original empty-sleeve illustration with enough negative space to remain readable at 360px.
- Desktop: balanced editorial composition, illustration alongside or above the message.
- Mobile: stacked sleeve then heading and actions; no horizontal overflow.
- The source should be an editable SVG or WebP in `public/assets/`, catalogued in the Visual Asset Catalogue. Never make the screenshot the artwork source.
- Treat illustration alt text as meaningful only if the artwork conveys information; otherwise use an empty alt and let the heading carry the meaning.

## 500 — “The turntable stopped”

### Visual concept

A record/turntable moment that feels paused rather than destroyed: the needle lifted, the tonearm resting, or the record waiting to be played again. Avoid flames, warning dashboards, cracked-screen clichés or visual panic.

Suggested short copy direction (not final copy):
- Eyebrow: `A QUICK PAUSE`
- Heading: `We hit a skip.`
- Supporting line: `Something interrupted the spin. Your details are safe to retry; please try again in a moment.`

### Recovery actions

- Primary: `Try again` (reload the current safe GET page only).
- Secondary: `Back to Home` → `/`.
- Do not promise that a failed form submission was saved or processed. Use the owning form's existing truthful feedback where it already has one.

### Security and semantics

- Keep server diagnostics, stack traces, SQL/provider errors and secrets out of the page.
- Keep the actual HTTP status (500 or the application-provided 5xx status); never render a “success” page with 200.
- A generic 500 template must stay safe when rendering failures themselves occur; don't add database/service dependencies to the error view.

## Other 4xx and service failure direction

- **400 / validation:** Prefer inline field-level feedback in the form that owns the error. A generic 400 should share the 404/500 visual family but remain calm and explain what can be corrected.
- **403:** A distinct restricted/private-press treatment may be appropriate later, but the existing app mostly redirects to sign-in or reuses a shared template. Do not design an independent page until the status/view mapping is made consistent.
- **429:** The current shared limiter sends plain text/JSON, not branded HTML. A future issue must deliberately add an HTML-safe response path before a visual page can exist. Keep the retry timing truthful and respect `Retry-After`.
- **503:** Differentiate temporary service unavailability from user input. The shared limiter currently sends text/JSON; Contact's provider failure stays in the Contact form.
- **502 / 504 / 505:** The hosting/edge layer may generate these before Express sees the request. Only brand them if the actual deployed platform offers a supported custom error-document facility. Do not fake them as app routes.

## Information pages — one family, clear hierarchy

The public information family belongs together under `ui-baselines/information/`:

- **Terms of Use:** long-form legal hierarchy and clear section headings; do not rewrite legal clauses or version/certification semantics.
- **Installation:** platform steps, install/share action and QR panel; make platform-specific instructions easy to scan on mobile.
- **Privacy Notice:** long-form content with clear section rhythm, readable text width and stable anchors; do not hide material disclosures or retention caveats.
- **Community Rules:** concise house rules and report/contact action; preserve the actual rules and reporting route.
- **Contact:** same family, with a clearly usable form, field errors, success feedback and provider-failure state.

Use a shared informational layout rhythm (heading, updated/version metadata where present, section spacing, cross-links and footer). Do not collapse important content into accordions by default or change legal copy as a visual side effect. The current page content remains authoritative.

## Approval boundary

These concepts are prompts for visual design and a later implementation issue. Jaap retains final visual and wording approval. A future implementation PR must include representative desktop/mobile screenshots and update `docs/verification/UI_VISUAL_REFERENCE.md` plus the asset catalogue if it adds artwork.
