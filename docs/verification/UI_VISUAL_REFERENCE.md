# UI Visual Reference Library

This directory is the durable visual reference library for The Vinyl Drop. It separates approved UI baselines, original production artwork, and short-lived automated evidence so that a screenshot is never mistaken for an editable source asset.

## Where to look

| Need | Location | Authority |
| --- | --- | --- |
| Approved screen appearance | [`ui-baselines/`](./ui-baselines/README.md) | Only reviewed, privacy-safe screenshots listed in the baseline register are visual baselines. |
| Original icons, artwork and illustrations | [Visual Asset Catalogue](./VISUAL_ASSET_CATALOGUE.md) | The original file in `public/` is the production source of truth. |
| Temporary responsive/browser evidence | GitHub Actions artifacts listed below | Diagnostic evidence only; not a replacement for an approved baseline. |
| Older committed screenshots and video | Legacy evidence register below | Historical context until content, provenance and synthetic-data safety are reviewed. |

## Approved baseline register

No existing committed capture has yet been promoted to an approved baseline. The older images below are catalogued as historical evidence, but their complete route/state/theme/source-commit metadata and privacy-safe synthetic content have not been verified. Do not treat them as pixel-perfect standards or overwrite them during unrelated UI work.

When a screenshot is approved, add it under `ui-baselines/<surface>/`, record its route, viewport, state, theme and source commit here, and explain why the baseline represents intentional product behavior.

## Owner-supplied screenshot intake — received, review pending

Jaap's screenshot batch is present on this PR branch at head `fd334e6a0b022b19cd1a2d9b4bafd236589e2844`. The changed-file list contains **22 PNG paths**. A PNG-header check confirmed **21 valid PNG files and one zero-byte/empty file**. All images remain intake material, not approved baselines, until their source data, state and privacy are cleared.

| Surface / submitted path | Image size (px) | Review result |
| --- | ---: | --- |
| Activity — [`activity/ACTIVITY_desktop.png`](./ui-baselines/activity/ACTIVITY_desktop.png) | 1497 × 5423 | Hold: feed entries expose profile/account names and listing activity; synthetic-data provenance is unconfirmed. |
| Activity — [`activity/ACTIVITY_mobiel.png`](./ui-baselines/activity/ACTIVITY_mobiel.png) | 412 × 7138 | Hold: same live-looking feed/account content and unconfirmed fixture provenance. |
| Dig — [`dig/dig_desktop.png`](./ui-baselines/dig/dig_desktop.png) | 0 bytes | Invalid/empty PNG. Replace with an actual desktop capture. |
| Dig — [`dig/dig_mobiel.png`](./ui-baselines/dig/dig_mobiel.png) | 412 × 691 | Candidate only: valid image, but route/state and synthetic/demo provenance still need recording. |
| Listing creation — [`listing-creation/desktop_craetion_1.png`](./ui-baselines/listing-creation/desktop_craetion_1.png) | 1497 × 923 | Hold: sample release/form context and seller account context need synthetic-data confirmation; filename typo. |
| Listing creation — [`listing-creation/desktop_cration_screen2.png`](./ui-baselines/listing-creation/desktop_cration_screen2.png) | 1497 × 1420 | Hold: form state includes release metadata and seller account context; filename typo and provenance need review. |
| Listing creation — [`listing-creation/desktop_creation_2.png`](./ui-baselines/listing-creation/desktop_creation_2.png) | 1497 × 1533 | Hold: release/listing preview content includes a seller handle; synthetic fixture not confirmed. |
| Listing creation — [`listing-creation/desktop_creation_finish.png`](./ui-baselines/listing-creation/desktop_creation_finish.png) | 1497 × 1200 | Hold: listing completion state includes seller identity; confirm fixture or replace with anonymized data. |
| Listing creation — [`listing-creation/desktop_creation_screen3.png`](./ui-baselines/listing-creation/desktop_creation_screen3.png) | 1497 × 2561 | Hold: seller/listing context visible and fixed navigation appears mid-capture; check capture framing. |
| Listing creation — [`listing-creation/mobiel_creation_finesh.png`](./ui-baselines/listing-creation/mobiel_creation_finesh.png) | 412 × 1366 | Hold: seller/listing details visible; filename typo and synthetic-data provenance need review. |
| Listing creation — [`listing-creation/mobiel_creation_screen2.png`](./ui-baselines/listing-creation/mobiel_creation_screen2.png) | 412 × 1343 | Hold: fixed mobile navigation crosses the full-page capture; verify capture framing and fixture data. |
| Listing creation — [`listing-creation/mobiel_creation_screen3.png`](./ui-baselines/listing-creation/mobiel_creation_screen3.png) | 412 × 2387 | Hold: long page capture has fixed navigation over content and seller context; verify framing and fixture data. |
| Listing creation — [`listing-creation/mobiel_creatoin_screen1.png`](./ui-baselines/listing-creation/mobiel_creatoin_screen1.png) | 412 × 2017 | Hold: release-entry values visible; filename typo and synthetic-data provenance need review. |
| Listing detail — [`listing-detail/album_listing_desktop.png`](./ui-baselines/listing-detail/album_listing_desktop.png) | 1497 × 1245 | Hold: account handle is visible in the shared header; confirm listing is synthetic and anonymize the account. |
| Listing detail — [`listing-detail/album_listing_mobiel.png`](./ui-baselines/listing-detail/album_listing_mobiel.png) | 412 × 1170 | Hold: account handle is visible in the shared header; confirm listing is synthetic and anonymize the account. |
| Navigation — [`menu/menu_desktop.png`](./ui-baselines/menu/menu_desktop.png) | 1497 × 923 | Hold: open account menu exposes account/profile details and an email address. Do not promote or merge this image unredacted. |
| Navigation — [`menu/menu_mobiel.png`](./ui-baselines/menu/menu_mobiel.png) | 412 × 725 | Candidate after route/theme/source provenance and synthetic background are confirmed. This is the current mobile YOU menu with direct Options entry. Folder name is `menu/`, not the planned `navigation/`. |
| Messaging — [`messaging/massaging_desktop.png`](./ui-baselines/messaging/massaging_desktop.png) | 1497 × 1573 | Hold: private conversation previews and participant/account identifiers are visible. Replace with synthetic, non-private conversation fixtures before committing as a baseline. |
| Messaging — [`messaging/massaging_mobile.png`](./ui-baselines/messaging/massaging_mobile.png) | 412 × 1970 | Hold: private conversation previews and participant/account identifiers are visible. Replace with synthetic fixtures. |
| Messaging — [`messaging/masseging_mobile_people.png`](./ui-baselines/messaging/masseging_mobile_people.png) | 412 × 1970 | Hold: People view shows participant/account identifiers and an underlying profile; replace with synthetic fixtures. |
| Profiles — [`profiles/profiel_desktop.png`](./ui-baselines/profiles/profiel_desktop.png) | 1497 × 923 | Hold: profile image/avatar, display name, username, location and bio are visible. Use a synthetic profile/avatar before baseline approval. |
| Profiles — [`profiles/profiel_mobiel.png`](./ui-baselines/profiles/profiel_mobiel.png) | 412 × 725 | Hold: profile image/avatar, display name, username, location and bio are visible. Use a synthetic profile/avatar before baseline approval. |

### Missing or mismatched surface folders

The requested `home/`, `browse/`, `options/` and `navigation/` image folders are not present in the PR's changed-file list. A `menu/` folder was supplied instead; its mobile screenshot is a useful navigation candidate, but the desktop menu capture contains account details and must be replaced/redacted. The Options page is only partially visible behind a messaging overlay in one image, so it is not a clean Options baseline.

The submitted root README's planned `drop/` and `profile/` names also differ from the actual `listing-creation/` and `profiles/` directories. Align these names before calling the structure final. Several filenames contain inconsistent spelling/locale; normalize them to the documented lowercase kebab-case convention when the final files are selected.

**Privacy gate:** the desktop account-menu image contains an email address, messaging captures contain private conversation text/participant details, and profile/activity/listing captures expose account-linked information. Treat those as real/private unless they are replaced with clearly synthetic fixtures or redacted before merge. Do not use these unredacted files as approved references.

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
