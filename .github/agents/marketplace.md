# Marketplace Specialist Contract

## Mission and starting context

Own seller listing lifecycle, physical-copy offers, seller photo upload/edit/display, listing comments and the services that connect these capabilities.

Read the relevant sections of:
- docs/DOMAIN_MODEL.md and docs/PRODUCT_VISION.md for seller/buyer and physical-copy contracts.
- docs/PAGE_MAP.md and docs/AGENT_GUIDE.md for current listing routes, views, services and repositories.
- docs/SECURITY_PRIVACY.md for seller ownership, visibility, upload and data handling.
- docs/UX_UI.md and docs/verification/UI_VISUAL_REFERENCE.md when changing a visible listing or photo workflow.

## Ownership and invariants

- Routes: src/app/routes/listingRoutes.ts; controller: src/app/controllers/listingController.ts.
- Listing lifecycle and photo behavior: src/app/services/listingService.ts and src/app/repositories/listingPhotoRepository.ts.
- Image processing and Storage: src/app/utils/imageProcessor.ts and src/app/services/storageService.ts.
- Validation/domain rules: src/validators/ and src/domain/listingPhotoRole.ts / src/domain/listingPhotoLimits.ts.
- Preserve draft, preview, published, sold and archived lifecycle semantics; publication must not bypass the intended preview step.
- A listing references a real Release and seller-owned Physical Copy. Catalogue art is not a seller photo.
- Public display derivatives and private editing sources remain separate; private object paths never leak into public view models or HTML.
- Every photo/listing mutation enforces seller ownership server-side and preserves cleanup/orphan recovery.
- Comments support community discussion only; payments, escrow and simulated trade settlement remain out of scope.

## Skill routing

- Seller photo, upload, cropper, Sharp, Storage, source-image or cleanup work: .github/skills/listing-photo-pipeline/SKILL.md.
- Route/EJS/CSS/JS changes: .github/skills/express-route-asset-audit/SKILL.md.
- Add performance-investigation only for measured upload, image encode, request, database or Storage performance.

## Deliverables and handoffs

- Trace the seller journey and mutation path, including return destination (Photos versus later Edit), ownership and validation.
- State the photo role, public/private object effect and cleanup behavior for every image-pipeline change.
- Preserve original editing sources and non-destructive state unless an Issue explicitly approves another behavior backed by quality evidence.
- Hand release/condition contracts to Data / Catalog, typed view models to UI and cross-layer authorization/service boundaries to Architecture.
- Add focused ownership, lifecycle, upload-limit, role, Storage-cleanup and browser-editor tests as relevant.

## Verification

Run npm run lint, npm run typecheck, npm test and npm run build. Use synthetic images for browser evidence. Never submit real listing photos or write to staging/production Storage merely to capture screenshots or benchmark quality.
