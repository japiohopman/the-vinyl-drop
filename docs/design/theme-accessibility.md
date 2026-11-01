# Theme palettes and accessibility checks

The Options page offers six first-party palettes. **Record Shop** is the starting palette; the other five change the shared design tokens without changing page structure or content.

| Theme | Visual direction |
|---|---|
| Record Shop | The existing paper, ink, deep green and infrared identity |
| Blue Note | Cool catalogue blues |
| Soul 45 | Warm sleeve and shop-paper tones |
| Mint Press | Pressing-room greens |
| Midnight Groove | Low-light listening room |
| Purple Haze | Deep crate-digging violets |

## Contrast contract

`test/themeTokens.test.ts` reads the actual values from `public/css/themes.css` and calculates WCAG relative-luminance contrast. It is intentionally a test of the live token source, not a second hard-coded palette.

Every theme must satisfy:

- Body text (`--color-ink`) against both page paper and card/control surfaces: **at least 4.5:1**.
- Muted supporting text and accessible accent text (`--color-ink-muted`, `--color-rust-accessible`) against both surfaces: **at least 4.5:1**.
- Primary and secondary action labels (`--color-white`) against their accent backgrounds (`--color-rust` and `--color-deep-green`): **at least 4.5:1**.
- Focus indicators and primary control borders against page and card surfaces: **at least 3:1**.
- Error and success boundaries against their status surfaces: **at least 3:1**.
- Disabled buttons and form controls use the theme's card surface, muted text and primary border without opacity blending; muted text remains **at least 4.5:1** and the border **at least 3:1**.
- The four semantic condition-grade badges are tested for **at least 4.5:1** text contrast and **3:1** border contrast on their grade-specific backgrounds.

The bright original infrared is retained as `--color-rust-highlight` for palette identity; interactive text and filled controls use the contrast-safe `--color-rust-accessible` / `--color-rust` pair. Disabled controls do not rely on opacity-reduced text, so their contrast remains measurable and legible. The fair condition badge uses a darker foreground to meet the same grade-label contrast target. The dark theme reverses the role of the surface token so native controls and button labels stay legible in a dark colour scheme.



## Route-specific surface coverage

The shared token layer also covers states that previously had page-local fixed colors: the mobile Dig crate backdrop and filter sheet, translucent Dig metadata/header surfaces, selected filter cards, + DROP validation errors, mobile account-menu hover states, and outgoing message bubbles. These surfaces are checked against the active theme tokens in `test/themeTokens.test.ts`; the Dig mobile browser regression test compares resolved colors against the same theme tokens rather than pinning the original Record Shop RGB values.

Artwork-specific colors remain intentionally separate: the sleeve/cardboard material, the price-tag illustration and modal dimming/backdrop layers are not recolored as part of a theme switch.

Theme preference is applied to the document root before the CSS is parsed. The same custom-property layer therefore affects the shared shell, navigation, marketplace cards, forms, Browse/Dig, Activity and profile pages. Theme choice and interaction settings are local to the browser/device; there is no account sync or database storage.
