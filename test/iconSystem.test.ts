import path from 'path';
import ejs from 'ejs';
import { ALLOWLISTED_ICON_NAMES, getIconSvg } from '../src/app/utils/iconRegistry';

describe('SVG Icon System & Registry', () => {
  describe('Icon Allowlist and Asset Coverage', () => {
    it('should contain all 30 expected allowlisted icon names', () => {
      expect(ALLOWLISTED_ICON_NAMES.size).toBe(30);
    });

    it('should load and render every single one of the 30 allowlisted SVG assets without error', () => {
      for (const name of ALLOWLISTED_ICON_NAMES) {
        const svg = getIconSvg(name);
        expect(svg).toContain('<svg');
        expect(svg).toContain(`class="icon icon-${name}"`);
        expect(svg).toContain('viewBox="');
        expect(svg).toContain('width="1em"');
        expect(svg).toContain('height="1em"');
        expect(svg.length).toBeGreaterThan(50);
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

    it('should sanitize and escape caller-supplied inputs to prevent XSS and attribute breakouts', () => {
      const xssClass = '"><script>alert(1)</script>';
      const xssTitle = '"><img src=x onerror=alert(1)>';
      const xssStyle = '">color:red;';
      const xssSize = '24px"><script>';

      const svg = getIconSvg('close', {
        class: xssClass,
        title: xssTitle,
        style: xssStyle,
        size: xssSize,
      });

      expect(svg).not.toContain('<script>');
      expect(svg).not.toContain('<img');
      expect(svg).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(svg).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
      expect(svg).toContain('style="&quot;&gt;color:red;"');
      // Invalid unit in size falls back to default 1em
      expect(svg).toContain('width="1em"');
    });

    it('should configure accessible title and role="img" when title is supplied', () => {
      const svg = getIconSvg('close', {
        title: 'Close window',
      });

      expect(svg).toContain('<title>Close window</title>');
      expect(svg).toContain('aria-label="Close window"');
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
