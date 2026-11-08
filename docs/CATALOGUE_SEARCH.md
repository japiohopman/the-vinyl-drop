# Catalogue search and suggestions

Browse and Dig retain their server-rendered, shareable GET result pages. The autocomplete is progressive enhancement: choosing an artist, release title or label fills the existing query and submits the current form, retaining genre, format, condition, price and sort filters.

Browse treats broad Genres and specific Styles as separate Release filters. The initial controlled Style vocabulary is Dancehall, Ska, Punk, House, Techno, Disco, Funk, Soul, Classic Rock, and R&B / Rhythm & Blues. Browse sends the selected style as a shareable `style` query parameter and applies it server-side alongside the existing search, genre, format, condition, price, sort, white-label, and view filters. The Catalogue Explorer groups styles beneath their associated parent genres; cross-genre styles such as Disco can appear under more than one parent. Raw provider style labels (including currently unmapped values) remain stored separately, while only recognized canonical styles are selectable through the controlled filter.

The same-origin endpoint is `GET /api/catalogue-suggestions?q=<query>`. It accepts one query string of at most 80 characters, waits for at least two normalized characters and returns at most eight ranked suggestions with `Cache-Control: no-store`. The browser debounces by 180 ms, aborts prior requests, ignores stale responses and supports Arrow Up/Down, Enter, Escape and touch. Suggestion strings are inserted as text, never HTML.

Suggestions describe only artist, release-title and label fields from releases linked to a published listing. Draft-only inventory is excluded. Seller, profile, email and private account fields are never selected. Catalogue-number matching remains available through the existing full Browse/Dig search.

Exact normalized matches rank first, then prefixes, contains matches and PostgreSQL trigram near-matches. Case, common Latin accents, whitespace and punctuation are ignored only in comparison keys; canonical names such as `AC/DC`, `P!nk` and `Björk` remain unchanged.

Migration `0020_catalogue_search_trigram` installs `pg_trgm` in the non-public `extensions` schema and adds GIN trigram indexes for artist, title and label. The endpoint falls back to exact/prefix/contains matching if a rolling deployment receives app code before the migration. Requests reuse the existing shared rate-limit service at 30 per client IP per minute when its owner-controlled global feature gate is enabled.

CI verifies the migration in isolated PGlite, fuzzy matching, punctuation/accent normalization using built-in PostgreSQL `translate`, published-only visibility, the 25,004-row trigram query plan, plus keyboard/touch behaviour, filter retention, stale-response handling and safe text rendering.

Migration `0020` is included as code only. No staging or production database migration, extension installation, environment setting or feature flag was changed.
