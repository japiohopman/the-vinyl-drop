import path from 'path';
import ejs from 'ejs';
import { ALLOWLISTED_ICON_NAMES, getIconSvg } from '../src/app/utils/iconRegistry';

describe('SVG Icon System & Registry', () => {
  describe('Icon Allowlist and Asset Presence', () => {
    it('should contain all 30 expected allowlisted icon names', () => {
      expect(ALLOWLISTED_ICON_NAMES.size).toBe(30);
      expect(ALLOWLISTED_ICON_NAMES.has('home')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('search')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('close')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('edit')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('logout')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('user')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('round-star')).toBe(true);
      expect(ALLOWLISTED_ICON_NAMES.has('boombox')).toBe(true);
    });
  });

  describe('getIconSvg Registry Function', () => {
    it('should render SVG for a known allowlisted icon with default aria-hidden="true"', () => {
      const svg = getIconSvg('user');
      expect(svg).toContain('<svg');
      expect(svg).toContain('class="icon icon-user"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('viewBox="0 0 512 512"');
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
