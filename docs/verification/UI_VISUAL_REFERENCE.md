# UI Visual Reference Library

This directory is the durable visual reference library for The Vinyl Drop. It separates approved UI baselines, original production artwork, and short-lived automated evidence so that a screenshot is never mistaken for an editable source asset.

## Where to look

| Need | Location | Authority |
| --- | --- | --- |
| Approved screen appearance | [`ui-baselines/`](./ui-baselines/README.md) | Only reviewed, staging/test-account screenshots listed in the baseline register are visual references. |
| Original icons, artwork and illustrations | [Visual Asset Catalogue](./VISUAL_ASSET_CATALOGUE.md) | The original file in `public/` is the production source of truth. |
| Information pages | [`ui-baselines/information/`](./ui-baselines/information/README.md) | Terms, Installation, Privacy Notice, Community Rules and Contact; desktop/mobile captures are still to be added. |
| Branded error and failure states | [`ui-baselines/errors/`](./ui-baselines/errors/README.md) | Actual Express-owned 400/404/500 templates and non-page status responses; do not invent host-owned 505 pages. |
| Temporary responsive/browser evidence | GitHub Actions artifacts listed below | Diagnostic evidence only; not a replacement for a reviewed visual reference. |
| Older committed screenshots and video | Legacy evidence register below | Historical context until content, provenance and synthetic-data safety are reviewed. |

## Approved baseline register

No existing committed capture has yet been promoted to an approved baseline. The older images below are catalogued as historical evidence, but their complete route/state/theme/source-commit metadata and privacy-safe synthetic content have not been verified. Do not treat them as pixel-perfect standards or overwrite them during unrelated UI work.

When a screenshot is approved, add it under `ui-baselines/<surface>/`, record its route, viewport, state, theme and source commit here, and explain why the baseline represents intentional product behavior.

## Owner-supplied visual reference set — staging, 2 November 2026

Jaap confirms these images were captured on staging with test accounts and contain no sensitive or production data. They are the owner-supplied visual reference point for future UI issues. They document intended visual direction and states; they are **not** automatic pixel-perfect regression goldens.

The desktop/mobile pairing is intentionally **Browse on desktop + Dig on mobile**. Do not request a desktop Dig or mobile Browse capture for this same discovery experience unless a future issue introduces a distinct design that needs its own reference.

| Surface | Reference image | Viewport | Route / state | Theme | Capture metadata |
| --- | --- | ---: | --- | --- |
| Activity | [Desktop](./ui-baselines/activity/ACTIVITY_desktop.png) · [Mobile](./ui-baselines/activity/ACTIVITY_mobiel.png) | 1497×5423 · 412×7138 | Activity feed; populated community state | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Discovery — desktop | [Existing Browse list reference](./desktop_browse_list_1280x800.png) | 1280×800 | Browse (`/browse`); list view with filters | Not recorded | Legacy capture; capture method, date and deployed application SHA not recorded. Retain as historical context until a current replacement is reviewed |
| Discovery — mobile | [Dig mobile](./ui-baselines/dig/dig_mobiel.png) | 412×691 | Dig / crate experience; record card visible | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Home | [Desktop](./ui-baselines/home/home_desktop.png) · [Mobile](./ui-baselines/home/home_mobile.png) | Viewports to record from image metadata | Home / `/`; owner-supplied Home screen | Not recorded | Owner-supplied files present on PR branch; capture date, viewport and deployed application SHA still need metadata confirmation |
| Listing creation | [Desktop step 1](./ui-baselines/listing-creation/desktop_craetion_1.png) · [Desktop step 2](./ui-baselines/listing-creation/desktop_cration_screen2.png) · [Desktop step 3](./ui-baselines/listing-creation/desktop_creation_2.png) · [Desktop edit/photos](./ui-baselines/listing-creation/desktop_creation_screen3.png) · [Desktop finish](./ui-baselines/listing-creation/desktop_creation_finish.png) | 1497px wide | + DROP / release and listing creation flow | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Listing creation — mobile | [Mobile step 1](./ui-baselines/listing-creation/mobiel_creatoin_screen1.png) · [Mobile step 2](./ui-baselines/listing-creation/mobiel_creation_screen2.png) · [Mobile step 3](./ui-baselines/listing-creation/mobiel_creation_screen3.png) · [Mobile finish](./ui-baselines/listing-creation/mobiel_creation_finesh.png) | 412px wide | + DROP / release and listing creation flow | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Listing detail | [Desktop](./ui-baselines/listing-detail/album_listing_desktop.png) · [Mobile](./ui-baselines/listing-detail/album_listing_mobiel.png) | 1497×1245 · 412×1170 | Listing detail; album artwork, record/price/seller context | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Navigation / YOU | [Desktop](./ui-baselines/navigation/menu_desktop.png) · [Mobile](./ui-baselines/navigation/menu_mobiel.png) | 1497×923 · 412×725 | Signed-in account menu; direct Options entry | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Messaging | [Desktop conversations](./ui-baselines/messaging/massaging_desktop.png) · [Mobile conversations](./ui-baselines/messaging/massaging_mobile.png) · [Mobile People](./ui-baselines/messaging/masseging_mobile_people.png) | 1497×1573 · 412×1970 | Floating Messages panel; Conversations and People states | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |
| Options | [Desktop](./ui-baselines/options/desktop_options.png) · [Mobile](./ui-baselines/options/mobiel_options.png) | 1497×1573 · 412×1970 | `/options`; Sound & Interaction and all six Appearance themes, Record Shop selected | Record Shop selected | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded. Mobile full-page capture shows the fixed bottom nav at its viewport position across the long capture; use as a surface reference, not a continuous scroll-layout golden |
| Profiles | [Desktop](./ui-baselines/profiles/profiel_desktop.png) · [Mobile](./ui-baselines/profiles/profiel_mobiel.png) | 1497×923 · 412×725 | Profile header, identity, bio and Crate entry | Not recorded | Manual staging capture, 2 Nov 2026; deployed application SHA not recorded |

The former duplicate `menu/` files have been removed; `navigation/` is the single canonical home for the desktop and mobile YOU-menu references. The two zero-byte Dig placeholders were removed rather than retained as fake screenshots. `home/` and `browse/` now contain README instructions describing their expected canonical filenames.

### Remaining owner screenshot intake — core marketplace batch (#307)

Within the original core marketplace batch, one visual surface remains without a usable current reference pair:

1. **Home:** the existing `home/home_desktop.png` on `main` is a zero-byte placeholder, so it is not usable, and no Home mobile image is present. Jaap indicated Home was already prepared locally, but no valid Home image is currently visible in this PR's changed-file list. If that capture exists under another path, link/identify it; otherwise add one desktop and one mobile Home capture under `home/`.

Browse desktop is covered by the existing historical [1280×800 Browse list reference](./desktop_browse_list_1280x800.png); Dig mobile is the paired mobile reference. No extra desktop Dig or mobile Browse capture is required.

All other surfaces from the original #307 marketplace screenshot request have received usable screenshot files. The separate `information/` and `errors/` capture families introduced by #310 are tracked in the section below and still need their own representative captures. The listing-creation and messaging names retain some original spelling inconsistencies to avoid unnecessary binary churn; the index links to the exact canonical files. Long fixed-navigation screenshots remain useful as contextual references, but not as exact uninterrupted full-page layout goldens.

## Full-screen inventory and branded status pages — Issue #310

The source-audited route/view catalogue is maintained in [`docs/PAGE_MAP.md`](../PAGE_MAP.md). Screen-specific error and information-page concepts are in [`branded-status-and-information-page-direction.md`](../design/working/branded-status-and-information-page-direction.md).

### Information pages — reference captures pending

The routes and templates are confirmed, but no dedicated image baselines have been committed yet. Required references:

| Page | Route | Desktop | Mobile |
| --- | --- | --- | --- |
| Terms of Use | `/terms` | `information/terms-desktop.png` | `information/terms-mobile.png` |
| Installation | `/install` | `information/install-desktop.png` | `information/install-mobile.png` |
| Privacy Notice | `/privacy` | `information/privacy-desktop.png` | `information/privacy-mobile.png` |
| Community Rules | `/community-rules` | `information/community-rules-desktop.png` | `information/community-rules-mobile.png` |
| Contact | `/contact` | `information/contact-desktop.png` | `information/contact-mobile.png` |

These images are not prerequisites for documenting the existing route/source map, but they are required before claiming a complete visual reference set for the information family. Capture representative first-viewport states; add a separate Contact validation/success capture only when it adds useful context.

### Application error templates and current response types

| State | Actual application source | Reference status |
| --- | --- | --- |
| Generic 400 / client error | `views/errors/400.ejs` | Pending desktop/mobile capture. Inline form-validation states remain in their owning form view. |
| 404 / not found | `views/errors/404.ejs` | Pending branded desktop/mobile capture; empty-sleeve concept is documented but not implemented. |
| 500 / internal error | `views/errors/500.ejs` | Pending desktop/mobile capture; turntable-paused concept is documented but not implemented. |
| 403 | Currently reuses `400.ejs` in generic error handling; some listing controller branches use `500.ejs` with status 403. | No separate 403 template; inconsistency is recorded in PAGE_MAP. |
| 429 | Shared rate limiter emits plain text/JSON; Contact's per-email cooldown re-renders Contact. | Not a standalone HTML screenshot until an HTML response is implemented. |
| 503 | Shared rate-limit failure emits plain text/JSON; Contact provider failure renders Contact; generic Express errors may use `500.ejs`. | No single standalone 503 screen. |
| 502 / 504 / 505 | No dedicated application route/template; may be generated by the host/reverse proxy. | No application baseline. Only map/brand if the deployed edge supports a custom error document. |

Do not trigger an actual production failure to capture an error. Use a controlled staging/test state; preserve the real HTTP status and never expose stack traces, SQL or provider diagnostics.

## How future issues and PRs must use this library

This index is the **single entry point** for the visual reference library. Do not copy the full screenshot inventory into every issue.

### When creating a UI issue

- Link this index and only the one or two images relevant to the surface/state being changed.
- State the route, viewport (desktop/mobile), visible state and theme that the issue must preserve or intentionally change.
- Add a short `Visual reference` section to the issue body. Example:

```md
## Visual reference
- Library: [UI Visual Reference](https://github.com/japiohopman/the-vinyl-drop/blob/main/docs/verification/UI_VISUAL_REFERENCE.md)
- Relevant baseline: [Options — mobile](https://github.com/japiohopman/the-vinyl-drop/blob/main/docs/verification/ui-baselines/options/mobiel_options.png)
- Preserve: page hierarchy, six theme choices and touch-friendly controls.
- Intentional visual changes: describe them here, or write “none”.
```

### When implementing a UI issue

1. Find the relevant image(s) in this index before changing the layout.
2. Compare the changed route/state at the matching viewport and theme. Do not compare a desktop screenshot to a mobile state.
3. Update a committed reference only when the UI change is intentional and the new screenshot is reviewed. Replace the canonical file at the same path when it represents the same state; add a new descriptive state filename only for a genuinely new state.
4. In the **same PR**, update the corresponding row in this index (path, route, viewport, state, theme, capture date and source application commit SHA) and mention the baseline change in the PR description.
5. Record the **application commit deployed to staging when the screenshot was captured**, not the documentation/screenshot upload commit. If the deployed SHA cannot be confirmed, explicitly write `not recorded`; never guess.
6. Keep full viewport/theme/interaction matrices in CI artifacts. Promote only the small number of reviewed representative references into this library.
7. If the UI did not intentionally change, leave the reference untouched and say which existing baseline was checked.

### When a new surface or asset is introduced

- Create the matching `ui-baselines/<surface>/` folder and use the filename format documented in [`ui-baselines/README.md`](./ui-baselines/README.md).
- Add the image and its metadata row to this index in the same PR.
- For original icons, illustrations or artwork, update the [Visual Asset Catalogue](./VISUAL_ASSET_CATALOGUE.md) with the authoritative `public/` source path. Never replace an editable source asset with a screenshot.
- Ask for owner confirmation only when the screenshot's intended surface/state/source is genuinely ambiguous. Do not ask for confirmation of details already recorded here.

## Existing committed visual evidence

These files already exist in `docs/verification/`; this index does not duplicate or move them.

| File | What the filename/content label establishes | Missing provenance / next step |
| --- | --- | --- |
| [`desktop_browse_list_1280x800.png`](./desktop_browse_list_1280x800.png) | Visually inspected historical desktop Browse/list capture (1280×800); shows a populated listing and seller handle. | Exact route, theme and source commit are unrecorded; synthetic identity provenance is unverified. Keep historical; do not promote without confirming/redacting the account identity. |
| [`listing_detail_context.png`](./listing_detail_context.png) | Visually inspected historical listing-detail desktop capture (1280×800), including release, price, condition and seller context. | Route variant, theme, source commit and synthetic-data provenance are unrecorded. Keep historical; verify fixture identity and current UI relevance before promotion. |
| [`mobile_menu_390x844.png`](./mobile_menu_390x844.png) | Visually inspected mobile Browse capture (390×844) with the compact top MENU control. | It does not document the current nested YOU/Options surface. Route, state, theme and source commit are unrecorded; keep historical rather than using it as the current navigation baseline. |
| [`phase6b_verification.webm`](./phase6b_verification.webm) | Historical Phase 6B verification recording. | Treat as a recording, not a baseline; inspect its content and provenance before sharing or reusing. |

Diagnostic text files and operational traces are intentionally not catalogued as visual references. Never copy secrets, tokens, email addresses, tester identities, private account details or production data into a baseline or this index.

## Automated browser evidence

The CI workflow captures representative screens with synthetic fixtures and stores the full viewport matrices as temporary GitHub Actions artifacts. The workflow currently sets a **14-day retention** for the artifacts below. Download useful evidence from the corresponding workflow run before that retention expires; do not commit the entire matrix to the repository.

| Coverage | Capture source | Views / viewport sizes | Artifact |
| --- | --- | --- | --- |
| General responsive UI (Issue #292) | [`scripts/generate-issue-292-evidence.ts`](../../scripts/generate-issue-292-evidence.ts), invoked by `npm run test:ui-evidence` | Browse `/browse`, Dig `/dig`, + DROP release selection `/drop/new`, listing create, listing edit, profile edit and Activity; 360×800, 390×844, 430×932, 768×1024 and 1280×900. | `issue-292-playwright-evidence` |
| Desktop and responsive Browse (Issue #293) | [`scripts/generate-issue-293-evidence.ts`](../../scripts/generate-issue-293-evidence.ts), invoked by `npm run test:browse-evidence` | Browse; 360×800, 430×932, 768×1024, 1024×900, 1280×900 and 1440×1000. | `issue-293-browse-playwright-evidence` |
| Options and six themes (Issue #300) | [`test/optionsPage.test.ts`](../../test/optionsPage.test.ts), run by the CI workflow with `OPTIONS_EVIDENCE_DIR` set | Six themes at 390px mobile and 1280px desktop (12 full-page captures). | `issue-300-options-playwright-evidence` |

The workflow configuration is [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Artifact names and retention are defined there; when that workflow changes, update this table in the same PR. CI artifact filenames are evidence outputs, not committed baseline filenames. The Issue #300 Options screenshot test temporarily moves the fixed mobile bottom navigation to the end of the document for a legible full-page capture. Those captures therefore do not represent the normal fixed-nav position and should not be used as a navigation baseline.

## UI reference update policy

The issue author points to the relevant row/image in this index. The PR author updates that same image path and its metadata row when an intentional visual change is accepted. This creates a clear chain:

`Issue → UI Visual Reference row/image → implementation PR → updated reference row/image`.

A PR that changes a visual surface must state one of:
- `Visual baseline updated:` link the new/updated image and record the staging app SHA.
- `Visual baseline unchanged:` link the existing image and explain that the change does not alter the referenced state.
- `No existing reference:` add a representative capture and a new row, or explicitly explain why no screenshot is appropriate.

Do not silently move a reference, add duplicate folders, or overwrite an unrelated state.

## UI pull request checklist

For every PR that changes a visible interface:

- [ ] Capture the affected route and meaningful state at the relevant mobile and desktop widths.
- [ ] Compare against the approved baseline for that surface; explain any intentional visual departure.
- [ ] Check keyboard focus, touch targets, empty/error/success states and reduced motion where applicable.
- [ ] Attach the relevant CI artifact or screenshots to the PR. Do not paste screenshots containing real user/tester data.
- [ ] Promote or update a committed baseline only when the visual change is intentional, reviewed and based on synthetic/demo content.
- [ ] Record the route, viewport, state, theme, source commit and capture/test source in this index.
- [ ] Keep the original production asset untouched when adding a screenshot or crop as a visual reference.

## Adding Jaap's supplied references

When new screenshots/reference images arrive:

1. Keep the supplied original filename and source/provenance information in the intake notes. Do not infer the screen, route or purpose from the image alone.
2. Identify whether each image is a **screen baseline** or a **reference to a source asset**. Store screen baselines under `ui-baselines/<surface>/`; place supporting asset-reference images under `asset-references/<category>/`.
3. Confirm the image contains only synthetic/demo content. Redact or exclude real identities, email addresses, private account details, tokens and production data.
4. Record who/what the image represents, its known route or source asset path, state, viewport/theme where applicable, and any unknown metadata explicitly.
5. Link it from this index or the Visual Asset Catalogue. The original production SVG/PNG/WebP remains authoritative; a screenshot must never silently replace it.

Do not add every viewport, theme or interaction permutation to Git. Keep large matrices in the expiring CI artifacts and retain only a small, reviewed set of representative baselines.
