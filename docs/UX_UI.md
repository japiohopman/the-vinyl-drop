# UX / UI Direction

## Design identity

The visual direction is:

**90s record shop + crate digging + local music community.**

It should not look like:
- a generic SaaS dashboard;
- a glossy ecommerce template;
- Spotify;
- eBay;
- a social-media clone.

The content itself should provide the visual character.

## Brand

Working name:

**THE VINYL DROP**

The word "Drop" supports the community language of publishing new records and discovering fresh listings.

Possible supporting line:

**Buy. Trade. Dig.**

This is a brand direction, not a hard implementation requirement yet.

## Visual language

Principles:
- editorial;
- tactile;
- high contrast;
- restrained;
- catalogue-oriented;
- image-led.

Avoid:
- excessive rounded cards;
- gradients;
- decorative shadows everywhere;
- oversized SaaS-style hero sections;
- unnecessary pill-shaped controls.

Borders, typography, record photography and spacing should do most of the visual work.

## Initial palette direction

These are starting tokens, not immutable final colors:
- Paper: #F3EFE7
- Ink: #151515
- White: #FFFDF8
- Rust accent: #C94B2C
- Deep green: #30463D

The implementation phase should turn them into CSS custom properties and verify contrast.

## Typography direction

Suggested roles:
- Display/headings: Space Grotesk or comparable geometric sans.
- Body: system sans or DM Sans.
- Metadata/catalogue values: IBM Plex Mono or another readable monospace.

Typography choices must prioritize readability and available web delivery over brand novelty.

## Responsive strategy

Mobile is the primary design target.

Minimum design checkpoints:
- narrow phone around 360–390px;
- larger phone around 430px;
- tablet around 768px;
- desktop around 1280px.

The UI should not rely on hover for essential functionality.

## Primary navigation

Mobile concept:

HOME | BROWSE | + DROP | ACTIVITY | YOU

The exact labels may change during implementation, but the information architecture should preserve:
- discovery;
- browsing;
- primary listing action;
- community activity;
- personal area.

Desktop should expand the same information architecture rather than create a second product.

## Home

The home page is a discovery surface, not a marketing landing page.

Likely blocks:
- newest drops;
- nearby/community listings;
- for trade;
- genre highlights;
- seller/community activity later.

The listing feed is the hero content.

## Browse

Search and filtering must work comfortably with one hand.

Core filters:
- artist;
- title;
- label;
- year;
- price;
- condition;
- sale/trade;
- location when supported.

Results should expose enough metadata to distinguish similar pressings.

## Listing detail

The listing page prioritizes:
1. photos;
2. artist/title;
3. price/trade status;
4. condition;
5. release metadata;
6. seller;
7. description;
8. comments.

The actual physical copy must remain visually and semantically distinct from generic release metadata.

## Sell flow

Mobile-first four-step flow:
1. Find release
2. Describe your copy
3. Add photos
4. Preview and publish

The form should preserve entered information across validation errors.

A final preview is required before publication.

## Profile

A profile should feel like a crate profile, not a social-feed profile.

Show:
- name/username;
- coarse location;
- short bio;
- current listings;
- future wanted list;
- later community/trade signals.

Do not expose:
- email address;
- private address;
- authentication data.

## Listing cards

A listing card should typically show:
- cover image;
- artist;
- title;
- price or TRADE;
- condition;
- seller location/name at the appropriate context level.

Do not cram every metadata field into the card.

## Comments

Comments should be:
- authenticated;
- readable;
- chronologically predictable;
- visually secondary to the listing itself.

Seller identity should remain clear.

## Empty states

Empty states should explain what happened and provide a useful next action.

Examples:
- no search results;
- no current listings;
- no comments;
- no photos yet.

## Accessibility

Requirements:
- semantic HTML;
- proper form labels;
- keyboard navigation;
- visible focus;
- sufficient color contrast;
- meaningful alt text for listing photography;
- no critical information communicated only by color.

## Motion

Use little motion.

Acceptable:
- image/lightbox transition;
- focus feedback;
- small success/error state transitions.

Avoid:
- decorative animation;
- autoplay video;
- large parallax effects.

## House style rule

When a visual change is not requested by the Issue, do not invent a new visual pattern.

The UI specialist must preserve the established token/component language once it exists.
