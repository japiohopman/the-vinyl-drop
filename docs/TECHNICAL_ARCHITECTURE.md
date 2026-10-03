# Technical Architecture

## Planned stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js |
| Language | TypeScript |
| HTTP framework | Express |
| Rendering | EJS |
| Database | PostgreSQL |
| Database platform | Supabase |
| ORM | Drizzle ORM |
| Validation | Zod |
| Images | Supabase Storage |
| Image processing | Sharp |
| Testing | Unit/integration tests plus Playwright for browser flows |
| CI | GitHub Actions |

This is intentionally a server-rendered web application.

Express officially supports template-engine rendering, including EJS-style engines. Drizzle supports PostgreSQL and documents Supabase integration.

## Why server-rendered EJS

The product is primarily catalogue content, forms, profiles, listing pages, search/filter pages and comments.

A client-side SPA is not required for the core experience.

Benefits:
- simple routing;
- excellent initial page delivery;
- predictable HTML;
- lower client complexity;
- straightforward public listing URLs;
- less duplicated state;
- easier agentic maintenance.

Interactive islands can use small TypeScript modules where justified.

Do not introduce a frontend framework to solve a localized interaction.

## Application layers

### Routes

Map HTTP requests to application operations.

Responsibilities:
- HTTP method/path;
- parameter extraction;
- authentication middleware;
- call controller/application service;
- choose response.

Routes do not own business rules.

### Controllers

Translate HTTP requests into application inputs and responses.

Responsibilities:
- assemble input;
- handle validation failures;
- call services;
- prepare view models.

### Services

Own domain/application rules.

Examples:
- listingService;
- releaseService;
- profileService;
- commentService.

Services must be testable without EJS.

### Repositories

Own database queries and persistence operations.

Rules:
- no SQL in routes;
- no database calls in templates;
- avoid repository methods whose behavior hides unrelated side effects.

### View models

Convert domain/service results into data safe and useful for presentation.

This prevents raw database rows becoming the implicit UI API.

### EJS views

Own presentation only.

EJS must not:
- query the database;
- mutate domain state;
- contain authorization logic;
- reimplement pricing or condition rules.

## Proposed source structure

src/
  app/
    routes/
    controllers/
    services/
    repositories/
    validators/
    view-models/
  db/
    schema/
    migrations/
  auth/
  storage/
  shared/
  server.ts

views/
  layouts/
  partials/
  home/
  browse/
  listings/
  profiles/
  auth/
  errors/

public/
  css/
  js/
  icons/
  images/

tests/
  unit/
  integration/
  browser/

The exact folder structure may change once implementation begins, but architectural boundaries should not.

## EJS view structure

Views should be composed from small reusable partials.

Expected shared partials include:
- header;
- mobile navigation;
- listing card;
- release metadata;
- condition display;
- profile header;
- comment thread;
- flash/status message.

Do not build one giant page template.

## Static assets

Repository-local assets are preferred.

For record imagery uploaded by users, storage URLs come from the storage layer after authorization checks.

## Configuration

Environment values must be externalized.

Expected categories:
- database connection;
- authentication;
- storage;
- application URL;
- session/security configuration.

Never commit secrets.

Provide a documented .env.example in the implementation phase.

## Validation

Zod validates untrusted application input at boundaries.

Important boundaries:
- form input;
- query parameters;
- route parameters;
- upload metadata;
- externally sourced metadata before persistence.

Validation does not replace database constraints.

## Testing architecture

### Unit

Pure validation, domain rules and formatting.

### Integration

Services with database boundaries.

### Browser

Critical user journeys:
- browse;
- sign in;
- create listing;
- edit listing;
- upload/reorder photos;
- comment.

The exact browser matrix will be documented when the app shell exists.

## Performance principles

Start simple.

Optimize:
- database indexes;
- image sizes;
- response payloads;
- repeated queries.

Do not introduce caches or distributed infrastructure before measurements justify them.

## Accessibility

Every interactive flow must remain keyboard-accessible and have meaningful labels.

Mobile usability is a design requirement, not a later CSS pass.

## Technical references

- Express: https://expressjs.com/en/5x/guide/using-template-engines/
- Supabase Database: https://supabase.com/docs/guides/database/overview
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Storage: https://supabase.com/docs/guides/storage
- Drizzle PostgreSQL: https://orm.drizzle.team/docs/get-started/postgresql
- Drizzle Supabase: https://orm.drizzle.team/docs/get-started/supabase
- Zod: https://zod.dev/
