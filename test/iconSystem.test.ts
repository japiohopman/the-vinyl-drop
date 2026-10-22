import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { ALLOWLISTED_ICON_NAMES, getIconSvg } from '../src/app/utils/iconRegistry';

describe('SVG Icon System & Registry', () => {
  describe('Icon Allowlist and Source File Verification', () => {
    it('should contain all 30 expected allowlisted icon names', () => {
      expect(ALLOWLISTED_ICON_NAMES.size).toBe(30);
    });

    it('should verify that all 30 allowlisted SVG files physically exist on disk with valid drawable geometry', () => {
      const svgDir = path.join(__dirname, '../public/assets/svg');

      for (const name of ALLOWLISTED_ICON_NAMES) {
        const filePath = path.join(svgDir, `${name}.svg`);

        // 1. Physical existence assertion
        expect(fs.existsSync(filePath)).toBe(true);

        // 2. File content validity assertion — must contain root <svg, viewBox, </svg>, and drawable geometry element
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('<svg');
        expect(content).toContain('viewBox="');
        expect(content).toContain('</svg>');
        expect(content).toMatch(/<(path|circle|rect|line|polyline|polygon|g|ellipse|defs)\b/);

        // 3. Registry rendering assertion — must NOT produce fallback icon
        const svg = getIconSvg(name);
        expect(svg).toContain(`class="icon icon-${name}"`);
        expect(svg).not.toContain('class="icon icon-unknown"');
        expect(svg).not.toContain('<circle cx="12" cy="12" r="10"');
      }
    });
  });

  describe('getIconSvg Registry Function', () => {
    it('should render SVG for a known allowlisted icon with default aria-hidden="true" and 1em dimensions', () => {
      const svg = getIconSvg('user');
      expect(svg).toContain('<svg');
      expect(svg).toContain('class="icon icon-user"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('viewBox="0 0 512 512"');
      expect(svg).toContain('width="1em"');
      expect(svg).toContain('height="1em"');
    });

    it('should return safe fallback icon when an unknown icon name is requested', () => {
      const svg = getIconSvg('non_existent_icon_123');
      expect(svg).toContain('<svg');
      expect(svg).toContain('class="icon icon-unknown"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('<circle cx="12" cy="12" r="10"');
    });

    it('should apply size, custom classes, and inline style when provided', () => {
      const svg = getIconSvg('search', {
        size: 24,
        class: 'custom-search-class',
        style: 'color: var(--color-rust);',
      });

      expect(svg).toContain('width="24px"');
      expect(svg).toContain('height="24px"');
      expect(svg).toContain('class="icon icon-search custom-search-class"');
      expect(svg).toContain('style="color: var(--color-rust);"');
    });

    it('should sanitize and escape caller-supplied inputs including ampersands, script tags, and breakouts', () => {
      const xssClass = '"><script>alert(1)</script>';
      const xssTitle = 'Rock & Roll "><img src=x onerror=alert(1)>';
      const xssSize = '24px"><script>';

      const svg = getIconSvg('close', {
        class: xssClass,
        title: xssTitle,
        size: xssSize,
      });

      expect(svg).not.toContain('<script>');
      expect(svg).not.toContain('<img');
      expect(svg).toContain('Rock &amp; Roll');
      expect(svg).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
      expect(svg).toContain('aria-label="Rock &amp; Roll &quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
      // Invalid unit in size falls back to default 1em
      expect(svg).toContain('width="1em"');
    });

    it('should configure aria-label and role="img" when ariaLabel is supplied without title, with HTML escaping', () => {
      const svg = getIconSvg('close', {
        ariaLabel: 'Rhythm & Blues "><script>alert(1)</script>',
      });

      expect(svg).not.toContain('<title>');
      expect(svg).not.toContain('<script>');
      expect(svg).toContain('aria-label="Rhythm &amp; Blues &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
      expect(svg).toContain('role="img"');
      expect(svg).not.toContain('aria-hidden="true"');
    });

    it('should enforce safe CSS style policy and strip unsafe URL or expression properties', () => {
      const safeSvg = getIconSvg('user', { style: 'color: var(--color-rust); fill: currentColor;' });
      expect(safeSvg).toContain('style="color: var(--color-rust); fill: currentColor;"');

      const unsafeSvg = getIconSvg('user', { style: 'background: url(javascript:alert(1)); color: red;' });
      expect(unsafeSvg).not.toContain('style=');
      expect(unsafeSvg).not.toContain('url(');
    });

    it('should configure accessible title and role="img" when title is supplied', () => {
      const svg = getIconSvg('close', {
        title: 'Close & dismiss',
      });

      expect(svg).toContain('<title>Close &amp; dismiss</title>');
      expect(svg).toContain('aria-label="Close &amp; dismiss"');
      expect(svg).toContain('role="img"');
      expect(svg).not.toContain('aria-hidden="true"');
    });

    it('should preserve gradient fills for complex artwork like round-star.svg', () => {
      const svg = getIconSvg('round-star');
      expect(svg).toContain('url(#delapouite-round-star-gradient-1)');
      expect(svg).toContain('<defs>');
    });
  });

  describe('views/partials/icon.ejs Template Rendering', () => {
    const iconTemplatePath = path.resolve(__dirname, '../views/partials/icon.ejs');

    it('should render icon partial correctly via EJS', async () => {
      const html = await ejs.renderFile(iconTemplatePath, {
        getIconSvg,
        name: 'home',
        size: 20,
        className: 'nav-icon',
      });

      expect(html).toContain('class="icon icon-home nav-icon"');
      expect(html).toContain('width="20px"');
      expect(html).toContain('height="20px"');
      expect(html).toContain('aria-hidden="true"');
    });

    it('should render unknown name fallback safely when included via EJS', async () => {
      const html = await ejs.renderFile(iconTemplatePath, {
        getIconSvg,
        name: 'invalid-name',
      });

      expect(html).toContain('class="icon icon-unknown"');
      expect(html).toContain('aria-hidden="true"');
    });
  });
});
