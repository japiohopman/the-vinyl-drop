/// <reference lib="dom" />

import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Profile edit UX (#351)', () => {
  jest.setTimeout(30000);

  const viewPath = path.join(__dirname, '../views/profiles/edit.ejs');
  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const publicProfileViewPath = path.join(__dirname, '../views/profiles/show.ejs');
  const stylesheet = readFullStylesheetSource();
  let browser: Browser;

  const profile = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    username: 'crate_digger',
    avatarStoragePath: 'profiles/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/current-avatar.webp',
  };

  const publicProfile = {
    id: profile.id,
    username: profile.username,
    displayName: 'Crate Digger',
    avatarUrl: 'https://storage.example/avatar.gif',
    avatarStoragePath: null,
    websiteUrl: 'https://example.test',
    soundcloudUrl: 'https://soundcloud.com/crate-digger',
    mixcloudUrl: 'https://www.mixcloud.com/crate-digger',
    bio: 'Hip-hop, soul and dusty samples.',
    location: 'Amsterdam',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };

  const form = {
    values: {
      username: 'crate_digger',
      displayName: 'Crate Digger',
      location: 'Amsterdam',
      websiteUrl: 'https://example.test',
      avatarUrl: '',
      soundcloudUrl: 'https://soundcloud.com/crate-digger',
      mixcloudUrl: 'https://mixcloud.com/crate-digger',
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
    for (const field of ['username', 'displayName', 'location', 'websiteUrl', 'avatarUrl', 'soundcloudUrl', 'mixcloudUrl', 'bio']) {
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
    expect(html).toContain('action="/profile/avatar" method="POST" enctype="multipart/form-data"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp,image/gif');
    expect(html).toContain('action="/profile/avatar/remove"');
  });

  async function renderPublicProfileView(): Promise<string> {
    return ejs.renderFile(publicProfileViewPath, {
      getIconSvg,
      profile: publicProfile,
      user: null,
      isOwner: false,
      messagingEnabled: false,
      crateTotalCount: 3,
      avatarPublicUrl: null,
    }, { filename: publicProfileViewPath });
  }

  async function renderPublicHeader(): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath: '/profiles/crate_digger',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    }, { filename: headerPath });
  }

  it('previews a selected local image immediately and labels animated GIF input', async () => {
    const page: Page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(documentHtml(await renderHeader(), await renderView()));
    await page.addScriptTag({ path: path.join(__dirname, '../public/js/profile-avatar-upload.js') });

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    await page.locator('#profile-avatar-file').setInputFiles({
      name: 'crate-digger.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const preview = page.locator('[data-profile-avatar-preview]');
    expect(await preview.isVisible()).toBe(true);
    expect(await preview.getAttribute('src')).toMatch(/^blob:/);
    expect(await page.locator('[data-profile-avatar-file-name]').textContent()).toBe('crate-digger.png');

    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    await page.locator('#profile-avatar-file').setInputFiles({
      name: 'crate-digger.gif',
      mimeType: 'image/gif',
      buffer: gif,
    });
    expect(await page.locator('[data-profile-avatar-file-name]').textContent()).toContain('animated GIF');
    await page.close();
  });

  it('keeps the public avatar and provider cards inside the four required responsive viewports', async () => {
    const page: Page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(documentHtml(await renderPublicHeader(), await renderPublicProfileView()));

    for (const viewport of [
      { width: 360, height: 780 },
      { width: 430, height: 932 },
      { width: 768, height: 900 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.setContent(documentHtml(await renderPublicHeader(), await renderPublicProfileView()));

      const layout = await page.evaluate(() => {
        const profilePage = document.querySelector('.profile-landing-page')?.getBoundingClientRect();
        const avatar = document.querySelector('.profile-landing-avatar');
        const avatarRect = avatar?.getBoundingClientRect();
        const avatarImage = avatar?.querySelector('img');
        const cards = Array.from(document.querySelectorAll('.profile-music-link')).map((element) => {
          const rect = element.getBoundingClientRect();
          const link = element as HTMLAnchorElement;
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            target: link.target,
            rel: link.rel,
          };
        });
        return {
          documentWidth: document.documentElement.scrollWidth,
          pageLeft: profilePage?.left ?? 0,
          pageRight: profilePage?.right ?? 0,
          avatarWidth: avatarRect?.width ?? 0,
          avatarHeight: avatarRect?.height ?? 0,
          avatarRadius: avatar ? getComputedStyle(avatar).borderRadius : '',
          avatarFit: avatarImage ? getComputedStyle(avatarImage).objectFit : '',
          cards,
        };
      });

      expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(layout.pageLeft).toBeGreaterThanOrEqual(0);
      expect(layout.pageRight).toBeLessThanOrEqual(viewport.width);
      expect(layout.avatarWidth).toBeGreaterThan(0);
      expect(layout.avatarWidth).toBe(layout.avatarHeight);
      expect(layout.avatarRadius).not.toBe('50%');
      expect(layout.avatarFit).toBe('contain');
      expect(layout.cards).toHaveLength(2);
      for (const card of layout.cards) {
        expect(card.left).toBeGreaterThanOrEqual(0);
        expect(card.right).toBeLessThanOrEqual(viewport.width);
        expect(card.target).toBe('_blank');
        expect(card.rel).toContain('noopener');
        expect(card.rel).toContain('noreferrer');
      }

      const evidenceDirectory = process.env.PROFILE_EVIDENCE_DIR;
      if (evidenceDirectory) {
        fs.mkdirSync(evidenceDirectory, { recursive: true });
        await page.screenshot({
          path: path.join(evidenceDirectory, `profile-public-${viewport.width}.png`),
          fullPage: true,
        });
      }
    }

    await page.close();
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
        avatarPreview: (() => {
          const preview = document.querySelector('.profile-avatar-editor-preview');
          const rect = preview?.getBoundingClientRect();
          const img = preview?.querySelector('img');
          return {
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            borderRadius: preview ? getComputedStyle(preview).borderRadius : '',
            objectFit: img ? getComputedStyle(img).objectFit : '',
          };
        })(),
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
      expect(dimensions.avatarPreview.width).toBe(dimensions.avatarPreview.height);
      expect(dimensions.avatarPreview.borderRadius).not.toBe('50%');
      expect(dimensions.avatarPreview.objectFit).toBe('contain');
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

      const evidenceWidths = new Set([360, 430, 768, 1280]);
      const evidenceDirectory = process.env.PROFILE_EVIDENCE_DIR;
      if (evidenceDirectory && evidenceWidths.has(viewport.width)) {
        fs.mkdirSync(evidenceDirectory, { recursive: true });
        await page.screenshot({
          path: path.join(evidenceDirectory, `profile-edit-${viewport.width}.png`),
          fullPage: true,
        });
      }
    }

    await page.close();
  });
});
