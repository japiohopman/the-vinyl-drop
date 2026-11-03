# Visual Asset Catalogue

This catalogue records authoritative production asset paths and separates them from screenshots used only as visual references. Add an entry when a source asset is inspected, introduced or materially reused. Do not infer that a screenshot is the source file.

## Confirmed source paths

| Source path | Asset class | Intended use / boundary | Change guidance |
| --- | --- | --- | --- |
| [`public/assets/svg/`](../../public/assets/svg/) | Functional SVG icon collection (25 files, per [`docs/UX_UI.md`](../UX_UI.md)) | Source files for interface icons, rendered through the shared [`views/partials/icon.ejs`](../../views/partials/icon.ejs) mechanism. | Inspect each SVG individually. Preserve its `viewBox`, paths, fills, gradients and negative space; do not globally rewrite fills or replace artwork with a screenshot. |
| [`public/assets/brand/vinyl-drop-cartridge.svg`](../../public/assets/brand/vinyl-drop-cartridge.svg) | Brand artwork | The Vinyl Drop's brand/cartridge artwork; distinct from functional UI icons. | Preserve brand geometry and fills. Do not convert it into a generic icon or use a screenshot as a replacement. |
| [`public/assets/UI/dig_crate.webp`](../../public/assets/UI/dig_crate.webp) | Interface illustration / background | Top-down crate artwork for the **mobile Dig experience only**, as specified in [`docs/UX_UI.md`](../UX_UI.md). | Keep the original aspect ratio and full-bleed mobile behavior. Do not repurpose it as album/release artwork. |
| [`public/assets/UI/price_tag.svg`](../../public/assets/UI/price_tag.svg) | Interface illustration | Price-tag visual asset. Confirm its current consuming view and placement before changing its shape, scale or color. | Keep the SVG source editable; any screenshot/crop belongs in the reference folder, not in `public/`. |
| [`public/assets/UI/error-empty-sleeve.svg`](../../public/assets/UI/error-empty-sleeve.svg) | Original status-page illustration | Decorative empty record sleeve used only by the branded Express 404 page (Issue #315). | Preserve as editable SVG source; page text and recovery links carry the meaning, so the image is decorative and uses empty alt text. |
| [`public/assets/UI/error-paused-turntable.svg`](../../public/assets/UI/error-paused-turntable.svg) | Original status-page illustration | Decorative paused turntable used only by the branded Express 5xx page (Issue #315). | Preserve as editable SVG source; do not recolor through theme tokens or use the artwork as a substitute for status text. |

## Shared rendering and visual contracts

| Path | Role |
| --- | --- |
| [`views/partials/icon.ejs`](../../views/partials/icon.ejs) | Shared EJS icon-rendering mechanism; it is not itself an artwork asset. |
| [`docs/UX_UI.md`](../UX_UI.md) | Visual and interaction contracts, including SVG handling, brand distinction and mobile Dig crate behavior. |
| [`docs/design/theme-accessibility.md`](../design/theme-accessibility.md) | Six theme palettes and contrast requirements; theme tokens must not recolor artwork-specific materials unless explicitly intended. |

## Adding supplied visual references

When Jaap supplies a screenshot/crop of an image or icon:

1. Keep the original repository asset path as the canonical source when known.
2. Add the reference image under `docs/verification/asset-references/<category>/` only after confirming it contains no private or production data.
3. Record the exact source path, intended product use, the reference's purpose and any uncertainty here.
4. Never use a reference screenshot to overwrite an SVG/PNG/WebP production asset. Make any actual visual edit to the original source file and review it in its consuming UI.

## Inventory boundary

The confirmed entries above are the source paths specifically identified by current UI contracts and the visual-reference audit; this is not a claim that every artwork file in `public/assets/` has been visually inspected. Expand the catalogue as additional source paths and intended uses are verified.
