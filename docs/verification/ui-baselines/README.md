# UI Baselines

This folder contains only a small set of reviewed, privacy-safe screenshots that document intentional application appearance. It is not a dump of Playwright output.

## Folder and filename convention

Use one folder per product surface:

- `navigation/`
- `home/`
- `browse/`
- `dig/`
- `listing-detail/`
- `listing-creation/`
- `profiles/`
- `activity/`
- `messaging/`
- `options/`

Use this filename pattern:

`<surface>-<state>-<width>x<height>-<theme>.<png|webp>`

Examples (conventions only; do not create these files without a reviewed capture):

- `browse-list-390x844-record-shop.png`
- `listing-detail-default-1280x900-record-shop.png`
- `options-blue-note-390x844-blue-note.png`

Use lowercase kebab-case. Include the theme when theme changes are relevant; use `default` only when the state has a clear default. If the actual screenshot dimensions are unknown, do not invent them.


## Owner-confirmed discovery pair

For the current discovery UI, use the **Browse desktop** reference linked in the central index (the existing historical file currently remains at `docs/verification/desktop_browse_list_1280x800.png`) and the **Dig mobile** reference in `dig/` as the paired desktop/mobile references. Do not require both route names at both viewport sizes. When a current Browse desktop capture replaces the historical one, store it in `browse/` and update the central index. This pairing may change only when a future issue explicitly separates the two experiences.

## Required metadata

Every promoted baseline must have a row in [`../UI_VISUAL_REFERENCE.md`](../UI_VISUAL_REFERENCE.md) recording:

- route and product surface;
- viewport width × height;
- meaningful UI state and theme;
- source commit SHA;
- capture script/test or documented manual capture;
- short note explaining what the reference is intended to preserve;
- confirmation that the image contains synthetic/demo data only.

## Approval and updates

- Do not promote an unreviewed legacy screenshot or a screenshot with unknown privacy/provenance status.
- Update a baseline only for an intentional visual change after human review.
- Git history preserves the prior approved image; do not add duplicate `-old`, `-final2` or timestamp copies.
- Keep full viewport/theme matrices in CI artifacts, which are temporary and currently retained for 14 days.
- Original production artwork belongs in `public/`; a screenshot is a reference, not an editable production asset.
