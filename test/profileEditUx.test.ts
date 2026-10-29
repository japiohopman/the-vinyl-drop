/// <reference lib="dom" />

import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Profile edit UX (#237)', () => {
  jest.setTimeout(30000);

  const viewPath = path.join(__dirname, '../views/profiles/edit.ejs');
  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const stylesheet = readFullStylesheetSource();
  let browser: Browser;

  const profile = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username: 'crate_digger',
  };

  const form = {
    values: {
      username: 'crate_digger',
      displayName: 'Crate Digger',
      location: 'Amsterdam',
      websiteUrl: 'https://example.test',
      avatarUrl: 'https://example.test/avatar.jpg',
      bio: 'Hip-hop, soul and dusty samples.',
    },
    fieldErrors: {},
    generalErrors: [],
  };

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  async function renderView(): Promise<string> {
    return ejs.renderFile(viewPath, { getIconSvg, form, profile }, { filename: viewPath });
  }

  async function renderHeader(): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath: '/profile/edit',
      currentUser: { id: profile.id, email: 'digger@example.test' },
      currentProfile: profile,
      messagingEnabled: false,
    }, { filename: headerPath });
  }

  function documentHtml(header: string, view: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${stylesheet}</style>
</head>
<body>
  ${header}
  <main class="main-content container">${view}</main>
</body>
</html>`;
  }

  it('keeps the existing profile fields and save/cancel destinations without introducing Saved People controls', async () => {
    const html = await renderView();
    expect(html).toContain('action="/profile/edit" method="POST"');
    for (const field of ['username', 'displayName', 'location', 'websiteUrl', 'avatarUrl', 'bio']) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain('href="/profiles/crate_digger"');
    expect(html).toContain('aria-label="Save changes"');
    expect(html).toContain('aria-label="Cancel editing profile"');
    expect(html).not.toContain('Saved People');
    expect(html).not.toContain('Save person');
    expect(html).not.toContain('Follow');
    expect(html).toContain('class="profile-edit-fields"');
    expect(html).toContain('class="profile-edit-card"');
  });

  it('keeps the editor and both actions within narrow phone, tablet, and desktop viewports', async () => {
    const page: Page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    const html = documentHtml(await renderHeader(), await renderView());

    for (const viewport of [
      { width: 320, height: 740 },
      { width: 360, height: 780 },
      { width: 375, height: 812 },
      { width: 414, height: 896 },
      { width: 430, height: 932 },
      { width: 768, height: 900 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.setContent(html);

      const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        pageRight: document.querySelector('.profile-edit-page')?.getBoundingClientRect().right ?? 0,
        cardRight: document.querySelector('.profile-edit-card')?.getBoundingClientRect().right ?? 0,
        actions: Array.from(document.querySelectorAll('.profile-edit-actions .mobile-compact-action')).map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
        }),
        inputWidths: Array.from(document.querySelectorAll('.profile-edit-form .form-control')).map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
      }));

      expect(dimensions.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.bodyWidth).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.pageRight).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.cardRight).toBeLessThanOrEqual(viewport.width);
      expect(dimensions.actions).toHaveLength(2);
      for (const action of dimensions.actions) {
        expect(action.left).toBeGreaterThanOrEqual(0);
        expect(action.right).toBeLessThanOrEqual(viewport.width);
        expect(action.height).toBeGreaterThanOrEqual(44);
      }
      for (const input of dimensions.inputWidths) {
        expect(input.left).toBeGreaterThanOrEqual(0);
        expect(input.right).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.locator('#field-username').isVisible()).toBe(true);
      expect(await page.locator('#field-bio').isVisible()).toBe(true);
    }

    await page.close();
  });
});
