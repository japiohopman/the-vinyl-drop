# Application Page and Route Map

This document defines the intended public and authenticated surface before implementation.

## Public routes

| Route | Purpose | Primary data |
| --- | --- | --- |
| / | discovery feed | recent listings, local/community highlights |
| /browse | browse/search | listings + release metadata |
| /search | search results | listings + release metadata |
| /listing/:id | listing detail | listing, release, photos, seller, comments |
| /profile/:username | public profile | profile + active listings |
| /login | sign in | auth |
| /signup | account creation | auth |

## Authenticated routes

| Route | Purpose |
| --- | --- |
| /drop/new | start a listing |
| /drop/:id/edit | edit a listing |
| /drop/:id/photos | manage listing photos |
| /drop/:id/preview | preview before publishing |
| /profile/edit | edit own profile |
| /my-listings | manage own listings |
| /activity | personal/community activity |

Future routes such as messaging, favorites, wanted lists and trade requests are introduced only with their corresponding feature phases.

## EJS view map

views/
  layouts/main.ejs
  partials/header.ejs
  partials/mobile-nav.ejs
  partials/listing-card.ejs
  partials/release-meta.ejs
  partials/condition.ejs
  partials/profile-header.ejs
  partials/comment-thread.ejs
  partials/flash.ejs

  home/index.ejs
  browse/index.ejs
  search/index.ejs

  listings/show.ejs
  listings/new.ejs
  listings/edit.ejs
  listings/photos.ejs
  listings/preview.ejs

  profiles/show.ejs
  profiles/edit.ejs

  auth/login.ejs
  auth/signup.ejs

  errors/404.ejs
  errors/500.ejs

The actual folder structure may be adjusted by implementation, but shared presentation primitives should remain reusable.

## Page ownership

### Home

Owns discovery presentation only.

The home route should not become a second listing/search service. It consumes a feed/view model.

### Browse/search

Own search/filter input and result presentation.

Search behavior belongs in the data/service layer.

### Listing detail

Consumes one prepared listing view model containing:
- release metadata;
- physical-copy condition;
- price/trade state;
- ordered photos;
- seller summary;
- comments.

### Sell flow

The sell flow is one domain operation exposed through several pages/stages.

Do not create independent databases or parallel listing models for each step.

## Responsive behavior

A page must have a meaningful mobile composition before desktop enhancement is added.

Where desktop and mobile differ, they should consume the same domain/view model rather than fork business logic.

## URL principles

Public listing and profile URLs should be stable enough to share.

Do not expose internal database structure in URLs when a public identifier can provide a cleaner route.

Authorization must never depend on secrecy of a URL.
