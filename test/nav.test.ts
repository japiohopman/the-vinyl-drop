import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Navigation Partial View Rendering & Script Interactions (views/partials/nav.ejs)', () => {
  jest.setTimeout(30000);

  const navTemplatePath = path.join(__dirname, '../views/partials/nav.ejs');
  const cssPath = path.join(__dirname, '../public/css/style.css');
  const stylesheetContent = fs.readFileSync(cssPath, 'utf8');

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  async function renderNav(locals: Record<string, unknown>): Promise<string> {
    return ejs.renderFile(
      navTemplatePath,
      {
        getIconSvg,
        ...locals,
      },
      {
        filename: navTemplatePath,
      }
    ) as unknown as Promise<string>;
  }

  async function renderFullHtmlPage(locals: Record<string, unknown>): Promise<string> {
    const navHtml = await renderNav(locals);
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${stylesheetContent}</style>
      </head>
      <body>
        <div id="outside-element" style="padding: 20px;">Outside Element</div>
        <div id="app">${navHtml}</div>
      </body>
      </html>
    `;
  }

  it('renders primary desktop destinations and mobile bottom bar for unauthenticated users', async () => {
    const html = await renderNav({
      currentPath: '/',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    });

    expect(html).toContain('HOME');
    expect(html).toContain('DIG');
    expect(html).toContain('+ DROP');
    expect(html).toContain('ACTIVITY');
    expect(html).toContain('SIGN IN');
    expect(html).toContain('id="mobile-you-surface"');
    expect(html).toContain('<span>ME</span>');
    expect(html).toContain('aria-label="Me"');
    expect(html).toContain('id="mobile-you-about-trigger"');
    expect(html).toContain('id="mobile-you-about-view" hidden');
    expect(html).toContain('class="mobile-you-info-section"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/community-rules"');
    expect(html).not.toContain('/messages');
    expect(html).not.toContain('LOG OUT');
  });

  it('renders authenticated user desktop dropdown and mobile You surface with profile and logout', async () => {
    const html = await renderNav({
      currentPath: '/browse',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: false,
    });

    expect(html).toContain('@cratedigger');
    expect(html).toContain('View Profile');
    expect(html).toContain('Edit Profile');
    expect(html).toContain('My Listings');
    expect(html).toContain('/auth/logout');
    expect(html).toContain('LOG OUT');
    expect(html).toContain('class="mobile-you-info-section"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/community-rules"');
    expect(html).not.toContain('/messages');
  });

  it('handles authenticated user with null currentProfile safely without email fallback username or bad links', async () => {
    const html = await renderNav({
      currentPath: '/',
      currentUser: { id: 'user-454', email: 'john.doe@example.com' },
      currentProfile: null,
      messagingEnabled: false,
    });

    expect(html).toContain('<span class="desktop-you-label">YOU</span>');
    expect(html).toContain('<strong>Account</strong>');
    expect(html).not.toContain('@john.doe');
    expect(html).not.toContain('/profiles/john.doe');
    expect(html).toContain('href="/profile" class="desktop-you-menu-item"');
  });

  it('renders Messages link strictly when authenticated and messagingEnabled is true', async () => {
    const htmlEnabled = await renderNav({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: true,
    });

    expect(htmlEnabled).toContain('/messages');
    expect(htmlEnabled).toContain('Messages');

    const htmlDisabled = await renderNav({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: false,
    });

    expect(htmlDisabled).not.toContain('/messages');
  });

  it('sets aria-current="page" on active route links', async () => {
    const html = await renderNav({
      currentPath: '/browse',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    });

    expect(html).toContain('href="/dig" class="nav-link active" aria-current="page"');
  });

  describe('Real Playwright Browser Script & Focus Interactions', () => {
    async function isElementVisible(selector: string): Promise<boolean> {
      return page.evaluate((sel) => {
        const g = globalThis as unknown as { document: { querySelector(s: string): { hasAttribute(a: string): boolean; getAttribute(a: string): string | null } | null } };
        const el = g.document.querySelector(sel);
        if (!el) return false;
        return !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true';
      }, selector);
    }

    async function getAttribute(selector: string, attr: string): Promise<string | null> {
      return page.evaluate(({ sel, a }) => {
        const g = globalThis as unknown as { document: { querySelector(s: string): { getAttribute(attrName: string): string | null } | null } };
        const el = g.document.querySelector(sel);
        return el ? el.getAttribute(a) : null;
      }, { sel: selector, a: attr });
    }

    async function isFocused(selector: string): Promise<boolean> {
      return page.evaluate((sel) => {
        const g = globalThis as unknown as { document: { querySelector(s: string): unknown; activeElement: unknown } };
        const el = g.document.querySelector(sel);
        return g.document.activeElement === el;
      }, selector);
    }

    async function isBodyScrollLocked(): Promise<boolean> {
      return page.evaluate(() => {
        const g = globalThis as unknown as { document: { body: { classList: { contains(cls: string): boolean } } } };
        return g.document.body.classList.contains('account-surface-open');
      });
    }

    it('executes desktop disclosure open/close, click outside, focusout, and Escape key focus return', async () => {
      const fullHtml = await renderFullHtmlPage({
        currentPath: '/',
        currentUser: { id: 'user-123', email: 'digger@example.com' },
        currentProfile: { id: 'user-123', username: 'cratedigger' },
        messagingEnabled: false,
      });

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.setContent(fullHtml);

      const triggerSel = '#desktop-you-trigger';
      const menuSel = '#desktop-you-menu';

      expect(await getAttribute(triggerSel, 'aria-expanded')).toBe('false');
      expect(await isElementVisible(menuSel)).toBe(false);

      // Open disclosure popover
      await page.click(triggerSel);
      expect(await getAttribute(triggerSel, 'aria-expanded')).toBe('true');
      expect(await isElementVisible(menuSel)).toBe(true);

      // Escape key closes popover & restores focus
      await page.keyboard.press('Escape');
      expect(await getAttribute(triggerSel, 'aria-expanded')).toBe('false');
      expect(await isElementVisible(menuSel)).toBe(false);
      expect(await isFocused(triggerSel)).toBe(true);

      // Click outside closes popover
      await page.click(triggerSel);
      expect(await isElementVisible(menuSel)).toBe(true);
      await page.click('#outside-element');
      expect(await isElementVisible(menuSel)).toBe(false);

      // Tab focusout closes popover
      await page.click(triggerSel);
      expect(await isElementVisible(menuSel)).toBe(true);
      await page.evaluate(() => {
        const g = globalThis as unknown as { document: { createElement(tag: string): { id: string; focus(): void }; body: { appendChild(el: unknown): void } } };
        const extInput = g.document.createElement('input');
        extInput.id = 'external-input';
        g.document.body.appendChild(extInput);
        extInput.focus();
      });
      expect(await isElementVisible(menuSel)).toBe(false);
    });

    it('opens About as a nested view and returns to Me without closing the overlay', async () => {
      const fullHtml = await renderFullHtmlPage({
        currentPath: '/',
        currentUser: null,
        currentProfile: null,
        messagingEnabled: false,
      });

      await page.setViewportSize({ width: 320, height: 700 });
      await page.setContent(fullHtml);
      await page.click('#mobile-you-trigger');

      expect(await isElementVisible('#mobile-you-main-view')).toBe(true);
      expect(await isElementVisible('#mobile-you-about-view')).toBe(false);

      await page.click('#mobile-you-about-trigger');
      expect(await isElementVisible('#mobile-you-main-view')).toBe(false);
      expect(await isElementVisible('#mobile-you-about-view')).toBe(true);
      expect(await getAttribute('#mobile-you-about-trigger', 'aria-expanded')).toBe('true');
      expect(await isFocused('#mobile-you-about-back')).toBe(true);

      const aboutLinks = await page.locator('#mobile-you-about-view .mobile-you-info-links a').evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href')));
      expect(aboutLinks).toEqual(['/contact', '/privacy', '/terms', '/community-rules']);

      await page.click('#mobile-you-about-back');
      expect(await isElementVisible('#mobile-you-main-view')).toBe(true);
      expect(await isElementVisible('#mobile-you-about-view')).toBe(false);
      expect(await getAttribute('#mobile-you-about-trigger', 'aria-expanded')).toBe('false');
      expect(await isFocused('#mobile-you-about-trigger')).toBe(true);
      expect(await isElementVisible('#mobile-you-surface')).toBe(true);
    });

    it('uses a near-opaque backdrop while keeping the mobile account panel inset from the viewport', async () => {
      const fullHtml = await renderFullHtmlPage({
        currentPath: '/',
        currentUser: null,
        currentProfile: null,
        messagingEnabled: false,
      });

      await page.setViewportSize({ width: 320, height: 700 });
      await page.setContent(fullHtml);
      const backdrop = await page.evaluate(() => {
        const el = document.querySelector('.mobile-you-surface-backdrop');
        if (!el) return null;
        const color = getComputedStyle(el).backgroundColor;
        const alphaMatch = color.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/);
        return { color, alpha: Number(alphaMatch?.[1] ?? 1) };
      });
      expect(backdrop).not.toBeNull();
      expect(backdrop!.alpha).toBeGreaterThanOrEqual(0.85);

      await page.click('#mobile-you-trigger');
      const insets = await page.evaluate(() => {
        const panel = document.querySelector('.mobile-you-surface-content') as HTMLElement | null;
        if (!panel) return null;
        const rect = panel.getBoundingClientRect();
        return { left: rect.left, right: window.innerWidth - rect.right };
      });
      expect(insets).not.toBeNull();
      expect(insets!.left).toBeGreaterThanOrEqual(8);
      expect(insets!.right).toBeGreaterThanOrEqual(8);
    });

    it('executes mobile YOU surface open, scroll-lock, close, backdrop click, Escape key, Shift+Tab focus trap, and resize breakpoint cleanup', async () => {
      const fullHtml = await renderFullHtmlPage({
        currentPath: '/',
        currentUser: { id: 'user-123', email: 'digger@example.com' },
        currentProfile: { id: 'user-123', username: 'cratedigger' },
        messagingEnabled: false,
      });

      await page.setViewportSize({ width: 375, height: 667 });
      await page.setContent(fullHtml);

      const mobileTriggerSel = '#mobile-you-trigger';
      const mobileSurfaceSel = '#mobile-you-surface';
      const closeBtnSel = '#mobile-you-close-btn';
      const backdropSel = '#mobile-you-backdrop';

      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);
      expect(await isBodyScrollLocked()).toBe(false);

      // Open surface
      await page.click(mobileTriggerSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(true);
      expect(await isBodyScrollLocked()).toBe(true);
      expect(await getAttribute(mobileTriggerSel, 'aria-expanded')).toBe('true');
      expect(await isFocused(closeBtnSel)).toBe(true);

      // Close button
      await page.click(closeBtnSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);
      expect(await isBodyScrollLocked()).toBe(false);
      expect(await getAttribute(mobileTriggerSel, 'aria-expanded')).toBe('false');

      // Backdrop click
      await page.click(mobileTriggerSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(true);
      await page.dispatchEvent(backdropSel, 'click');
      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);
      expect(await isBodyScrollLocked()).toBe(false);

      // Shift+Tab focus trap wrap
      await page.click(mobileTriggerSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(true);
      expect(await isFocused(closeBtnSel)).toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await isFocused('.mobile-you-about-trigger')).toBe(true);

      // Escape key
      await page.keyboard.press('Escape');
      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);

      // Breakpoint resize cleanup (resizing to >= 768px closes surface & unlocks scroll without focus errors)
      await page.click(mobileTriggerSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(true);
      expect(await isBodyScrollLocked()).toBe(true);
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(100);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);
      expect(await isBodyScrollLocked()).toBe(false);
    });

    it('asserts zero page-level horizontal overflow across required viewports (360, 390, 430, 768, 1280px)', async () => {
      const viewports = [
        { width: 360, height: 640 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 768, height: 1024 },
        { width: 1280, height: 800 },
      ];

      const fullHtml = await renderFullHtmlPage({
        currentPath: '/browse',
        currentUser: null,
        currentProfile: null,
        messagingEnabled: false,
      });

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.setContent(fullHtml);

        const scrollWidth = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
        const innerWidth = await page.evaluate(() => (globalThis as unknown as { window: { innerWidth: number } }).window.innerWidth);

        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      }
    });
  });
});
