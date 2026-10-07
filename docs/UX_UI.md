# UX / UI Direction

## Design identity

The visual direction is:

**90s record shop + crate digging + local music community.**

It explicitly does not look like:
- a generic SaaS dashboard;
- a glossy e-commerce template;
- Spotify;
- eBay;
- a social-media clone.

The record cover photography and structured release metadata provide the primary visual character.

## Brand

Brand name:

**THE VINYL DROP**

The word "Drop" supports the community language of publishing new record listings and discovering fresh additions.

Brand taglines / cues:

**Buy. Trade. Dig.**

## Visual language

Principles:
- editorial;
- tactile;
- high contrast;
- restrained;
- catalog-oriented;
- image-led.

Avoid:
- rounded card Overuse;
- heavy gradients;
- decorative shadows;
- oversized SaaS hero banners;
- unnecessary pill-shaped controls.

Borders, structured typography, record photography, and precise spacing establish visual hierarchy. Design tokens and custom CSS live centrally in `public/css/style.css`.

## Color palette tokens

Custom properties defined in `public/css/style.css`:
- Paper background: `#F3EFE7`
- Ink text/borders: `#151515`
- White surface: `#FFFDF8`
- Rust accent: `#C94B2C`
- Deep green accent: `#30463D`

All color combinations satisfy WCAG AAA contrast requirements for text readability.

## Typography strategy

Typography stack defined in system styles:
- **Brand Wordmark:** `Capriola` (used exclusively for "THE VINYL DROP" logo mark).
- **Display / Headings:** `Space Grotesk` geometric sans.
- **Body / Interface:** `DM Sans` sans-serif.
- **Metadata / Catalog Values:** `IBM Plex Mono` monospace for catalog numbers, release years, prices, and condition grades.

Typography choices prioritize legibility, fast web font delivery, and catalog structure.

## Responsive strategy

Mobile is the primary design and implementation target.

Tested viewport boundaries:
- narrow phone (~360–390px);
- standard phone (~430px);
- tablet (~768px);
- desktop (~1280px+).

Essential functionality relies on touch and click interactions rather than hover states.

## Primary navigation structure

Implemented application navigation (`views/partials/nav.ejs` and `views/partials/header.ejs`):

**HOME (`/`) | BROWSE (`/browse`) | + DROP (`/drop/new`) | PROFILE (`/profile` or `/auth/login`)**

*Note on future design notes:* Early UI concept sketches mentioned an `ACTIVITY` navigation tab. The `/activity` route is **not implemented** in current code and represents a future community roadmap concept.

Desktop layout expands the same information architecture rather than creating a separate desktop view tree.

## Home view (`/`)

The home page is a discovery surface featuring recent record drops and search access.

Key sections:
- header brand mark and primary navigation;
- search bar for rapid keyword queries;
- recent drops listing card grid;
- empty state feedback when no published listings exist.

## Browse view (`/browse`) & Search view (`/search`)

Filter and search interfaces designed for one-handed phone use.

Filters:
- keyword search (artist, title, label, catalog number, description);
- genre;
- media / sleeve condition grade;
- price range (min/max in Euros);
- trade availability flag.

Listing results display clear metadata, price or trade badge, condition tags, and seller location.

## Listing detail view (`/listings/:id`)

Prioritizes listing information in logical hierarchy:
1. listing photography and image viewer;
2. artist and release title;
3. price formatted in Euros (e.g. `€34.95`) or `FOR TRADE` status;
4. Goldmine condition badges (Media condition and Sleeve condition);
5. structured release metadata (label, catalog number, year, country, format, genre);
6. seller profile card and coarse location;
7. seller's physical copy description;
8. authenticated public comment thread for buyer-seller inquiries.

## Sell flow (`/drop/new` -> `/listings/create` -> `/listings/:id/photos` -> `/listings/:id/preview`)

Mobile-first multi-step workflow:
1. **Find or create release:** Search existing releases or import/enter canonical release metadata (`/drop/new`).
2. **Describe physical copy:** Enter media condition, sleeve condition, price/trade intent, and notes (`/listings/create`).
3. **Upload photos:** Stream upload up to 5 photos with server-side validation and Sharp processing (`/listings/:id/photos`).
4. **Preview & publish:** Review draft listing before transitioning to published status (`/listings/:id/preview`).

Form fields preserve user input on validation errors using structured Zod error view models (`FormViewModel`).

## Public profile view (`/profiles/:username`)

Presents a seller's marketplace footprint:
- display name, username, coarse location, bio, and avatar;
- active published listings grid;
- edit profile trigger (visible strictly when viewed by the profile owner).

Does not expose email, auth provider IDs, or internal user keys.

## Comments component (`views/partials/comment-thread.ejs`)

Public comment threads attached to listings support pre-sale inquiries:
- requires authenticated user;
- chronological listing of comments;
- highlights comments posted by the listing seller;
- sanitized plain text rendering.

Private messaging is not supported via comments.

## Accessibility standards

Accessibility baseline verified via automated `npm run test:a11y` Playwright axe-core checks:
- semantic HTML sectioning and landmarks (`header`, `nav`, `main`, `footer`);
- accessible form labeling and `aria-describedby` error references;
- visible focus rings across all interactive controls;
- high-contrast text and badge colors;
- descriptive alt text on record photography;
- keyboard tab navigation throughout form and listing flows.

## Scope boundary reminder

Payment widgets, checkout flows, shipping calculators, and private chat interfaces are **not part of the UI** and are not implemented.
