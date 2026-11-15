---
name: listing-photo-pipeline
description: Use when changing listing-photo selection, upload, correction, editing, display, storage, ownership or cleanup in The Vinyl Drop.
---

# Listing photo pipeline — The Vinyl Drop

## Read first

- docs/AGENT_GUIDE.md, docs/PAGE_MAP.md and docs/SECURITY_PRIVACY.md.
- src/domain/listingPhotoRole.ts and src/domain/listingPhotoLimits.ts.
- views/listings/edit.ejs and the route/controller/service/repository that owns the requested behavior.
- src/app/utils/imageProcessor.ts and src/app/services/storageService.ts.
- Relevant tests: test/listingPhotoRoundTrip.test.ts, test/storage.test.ts and test/squarePhotoCropper.test.ts.

## Actual product flow

- Creation uses GET /listings/create for Details, then redirects the draft to GET /listings/:id/photos for the focused Photos step. That route reuses views/listings/edit.ejs with photoStepOnly enabled; it must not ask for Details again.
- Later editing uses GET /listings/:id/edit.
- The standard slots are front_cover and back_cover. Additional roles are inside_sleeve, insert_poster, record, detail and other. legacy_unclassified is a stored legacy state, not a new-upload choice.
- Keep seller photos of the physical copy distinct from shared catalogue/release artwork. Catalogue art is not a listing photo or Storage object.

## Upload and processing rules

- The browser upload flow enforces a 5 MiB per-file limit for the selected photo parts; inspect current route and multipart handling before changing limits.
- The browser sends the original selected image and a corrected display image as separate multipart parts when the editor produces them. Preserve the distinction and verify current field names rather than assuming one upload payload.
- Server-side validation must verify actual image format and MIME type. Do not trust browser filename or claimed content type.
- Sharp currently produces a public WebP display derivative (quality 82, max dimension 2048) and a distinct private, lossless WebP editing source (effort 4, max dimension 2048, source output cap 20 MiB). Re-check imageProcessor.ts and the lockfile on every relevant change.
- The browser editor outputs a corrected JPEG with a maximum/longer side of 1536 px. Front/back cover roles are square (1536×1536); additional roles preserve the corrected framing aspect, so a portrait detail photo remains portrait. The shorter side is calculated from the four-point framing. Verify getOutputDimensions() in public/js/square-photo-cropper.js before changing this contract.
- The public listing-photos bucket and private listing-photo-originals bucket have different visibility and owner-access requirements. Never expose private source paths in public view models or HTML.

## Required invariants

- Keep server-side listing ownership and authorization checks on every read and mutation.
- Preserve photo role, order, alt text, editor state and return destination (Photos versus Edit).
- Deleting a photo must clean up both display and private source objects; preserve orphan cleanup/recovery behavior.
- Do not let a catalogue image create a fake listing_photos row or Storage object.
- Preserve non-destructive editing and the original source for future edits.
- Never submit a form in a visual evidence test unless the test explicitly uses isolated mock services and proves no remote Storage or DB write is possible.

## Worked regression and verification

PR #415 fixed the route-specific CSS omission for GET /listings/:id/photos. The route shares EJS with /listings/:id/edit but has a distinct CSS inclusion requirement in views/layouts/main.ejs. Keep test/cssRouteBundles.test.ts aligned.

For browser evidence, use synthetic images generated in tests (for example, via Sharp in test/squarePhotoCropper.test.ts). Capture the upload dialog before selection and the interactive editor after selection. Selecting a local synthetic fixture in the browser is not a Storage upload; do not submit the form or write to Supabase for screenshot evidence.

