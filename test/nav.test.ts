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
  const messagingWidgetScriptContent = fs.readFileSync(path.join(__dirname, '../public/js/messaging-widget.js'), 'utf8');

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
        <base href="http://127.0.0.1/">
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${stylesheetContent}</style>
      </head>
      <body>
        <div id="outside-element" style="padding: 20px;">Outside Element</div>
        <div id="app">${navHtml}</div>
        <script>${messagingWidgetScriptContent}</script>
      </body>
      </html>
    `;
  }

  async function renderProfilePage(view: 'show' | 'crate', isOwner = false): Promise<string> {
    const templatePath = path.join(__dirname, '../views/profiles', view === 'show' ? 'show.ejs' : 'crate.ejs');
    const renderedView = await ejs.renderFile(templatePath, {
      getIconSvg,
      title: 'Profile layout test',
      profile: {
        id: 'test-profile',
        username: 'a_very_long_username_for_small_screens',
        displayName: 'The Extraordinarily Long Collector Name',
        avatarUrl: null,
        websiteUrl: 'https://example.test',
        bio: 'A long but realistic profile bio about finding rare soul, jazz and funk records in local crates.',
        location: 'Amsterdam Oost',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      isOwner,
      crateTotalCount: 12,
      listings: [],
      pagination: { totalCount: 12, page: 1, limit: 12, totalPages: 1 },
    }, { filename: templatePath });

    return `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${stylesheetContent}</style>
      </head>
      <body>
        <main class="main-content container">${renderedView}</main>
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
    const mobileTrigger = html.slice(html.indexOf('id="mobile-you-trigger"'), html.indexOf('>', html.indexOf('id="mobile-you-trigger"')));
    expect(mobileTrigger).toContain('aria-label="Me"');
    expect(html).toContain('id="mobile-you-about-trigger"');
    expect(html).toContain('id="mobile-you-about-view" aria-hidden="true"');
    expect(html).toContain('<h2 class="mobile-you-title" id="mobile-you-title">Me</h2>');
    expect(html).not.toContain('class="mobile-you-email"');
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
    expect(html).not.toContain('class="mobile-you-email"');
    expect(html.indexOf('id="mobile-you-views"')).toBeLessThan(html.indexOf('class="mobile-you-footer"'));
    expect(html.indexOf('class="mobile-you-footer"')).toBeGreaterThan(html.indexOf('id="mobile-you-about-view"'));
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

    expect(htmlEnabled).not.toContain('href="/messages"');
    expect(htmlEnabled).toContain('data-messaging-widget-trigger');
    expect(htmlEnabled).toContain('<button type="button" class="desktop-you-menu-item messaging-widget-trigger"');
    expect(htmlEnabled).toContain('<button type="button" class="mobile-you-action-link messaging-widget-trigger"');
    expect(htmlEnabled).toContain('Messages');

    const htmlDisabled = await renderNav({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: false,
    });

    expect(htmlDisabled).not.toContain('/messages');
    expect(htmlDisabled).not.toContain('messaging-floating-window');
  });

  it('opens a desktop conversation without navigating away or marking it read implicitly', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    let unreadCount = 2;
    const requests: Array<{ path: string; method: string }> = [];
    await page.route('**/messages/**', async (route) => {
      const requestInfo = route.request();
      const pathname = new URL(requestInfo.url()).pathname;
      requests.push({ path: pathname, method: requestInfo.method() });

      if (pathname === '/messages/widget/unread-count') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unreadCount }) });
        return;
      }
      if (pathname === '/messages/widget/data') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            unreadCount,
            conversations: [{
              id: 'conversation-1',
              releaseArtist: 'Pink Floyd',
              releaseTitle: 'The Dark Side of the Moon',
              otherParticipant: 'Seller User',
              lastMessage: 'Hi from seller',
              lastMessageAt: '2026-10-25T10:00:00.000Z',
              unreadCount,
            }],
          }),
        });
        return;
      }
      if (pathname === '/messages/widget/conversation-1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conversation-1',
            release: { artist: 'Pink Floyd', title: 'The Dark Side of the Moon' },
            listing: { id: 'listing-1' },
            userRole: 'buyer',
            unreadCount,
            otherParticipant: { username: 'seller_user', displayName: 'Seller User' },
            messages: [{
              id: 'message-1',
              isOwnMessage: false,
              body: 'Hi from seller',
              createdAt: '2026-10-25T10:00:00.000Z',
            }],
          }),
        });
        return;
      }
      if (pathname === '/messages/conversation-1/read' && requestInfo.method() === 'POST') {
        unreadCount = 0;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    const html = await renderFullHtmlPage({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: true,
    });
    await page.setContent(html);
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as {
        document: { querySelector(selector: string): { hasAttribute(name: string): boolean; textContent: string | null } | null };
      };
      const badge = browser.document.querySelector('[data-messaging-unread-count]');
      return Boolean(badge && !badge.hasAttribute('hidden') && badge.textContent === '2');
    });

    await page.click('#desktop-you-trigger');
    await page.click('#desktop-you-menu [data-messaging-widget-trigger]');
    expect(await page.locator('#messaging-floating-window').isVisible()).toBe(true);
    expect(page.url()).not.toContain('/messages');
    await page.locator('.messaging-widget-conversation').click();
    await page.waitForSelector('.messaging-widget-message');
    expect(await page.locator('.messaging-widget-message').textContent()).toContain('Hi from seller');
    expect(await page.locator('.messaging-widget-toolbar button').count()).toBe(1);
    expect(await page.locator('.messaging-widget-toolbar button').getAttribute('aria-label')).toBe('Back to conversations');
    expect(await page.locator('.messaging-widget-toolbar a').count()).toBe(0);
    expect(requests.some((item) => item.method === 'POST' && item.path.endsWith('/read'))).toBe(false);

    const initialLeft = await page.locator('#messaging-floating-window').evaluate((el) => el.getBoundingClientRect().left);
    await page.locator('[data-message-drag-handle]').focus();
    await page.keyboard.press('ArrowLeft');
    const movedLeft = await page.locator('#messaging-floating-window').evaluate((el) => el.getBoundingClientRect().left);
    expect(movedLeft).toBeLessThan(initialLeft);

    const dragBox = await page.locator('[data-message-drag-handle]').boundingBox();
    expect(dragBox).not.toBeNull();
    await page.mouse.move(dragBox!.x + dragBox!.width / 2, dragBox!.y + dragBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(2000, 1500, { steps: 5 });
    await page.mouse.up();
    const bounds = await page.locator('#messaging-floating-window').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const browser = globalThis as unknown as { window: { innerWidth: number; innerHeight: number; getComputedStyle: (element: unknown) => { position: string } } };
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: browser.window.innerWidth, height: browser.window.innerHeight };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);

    await page.click('[data-message-minimize]');
    expect(await page.locator('#messaging-floating-window').evaluate((el) => el.classList.contains('is-minimized'))).toBe(true);
    await page.click('[data-message-minimize]');
    expect(await page.locator('#messaging-floating-window').evaluate((el) => el.classList.contains('is-minimized'))).toBe(false);
    await page.click('[data-message-close]');
    await page.waitForSelector('#messaging-floating-window[hidden]');
    expect(await page.locator('#messaging-floating-window').getAttribute('hidden')).not.toBeNull();
    expect(page.url()).not.toContain('/messages');
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { activeElement: { id: string } | null } };
      return browser.document.activeElement?.id;
    })).toBe('desktop-you-trigger');
    expect(requests.some((item) => item.method === 'POST' && item.path.endsWith('/read'))).toBe(false);
    expect(requests.some((item) => item.method === 'POST' && item.path.endsWith('/archive'))).toBe(false);

    await page.click('#desktop-you-trigger');
    await page.click('#desktop-you-menu [data-messaging-widget-trigger]');
    await page.locator('.messaging-widget-conversation').click();
    await page.locator('.messaging-widget-action').filter({ hasText: 'Mark as read' }).click();
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as {
        document: { querySelector(selector: string): { hasAttribute(name: string): boolean } | null };
      };
      const badge = browser.document.querySelector('[data-messaging-unread-count]');
      return Boolean(badge && badge.hasAttribute('hidden'));
    });
    expect(requests.filter((item) => item.method === 'POST' && item.path.endsWith('/read'))).toHaveLength(1);
  });

  it('opens the shared messaging widget as a full-screen messenger on mobile', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    let unreadCount = 2;
    const requests: Array<{ path: string; method: string }> = [];

    await page.route('**/messages/**', async (route) => {
      const requestInfo = route.request();
      const pathname = new URL(requestInfo.url()).pathname;
      requests.push({ path: pathname, method: requestInfo.method() });

      if (pathname === '/messages/widget/unread-count') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unreadCount }) });
        return;
      }
      if (pathname === '/messages/profile/saved-profile-1' && requestInfo.method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'direct-1' }) });
        return;
      }
      if (pathname === '/messages/widget/direct-1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'direct-1',
            conversationType: 'direct',
            title: 'Direct conversation with @saved_digger',
            unreadCount: 0,
            otherParticipant: { username: 'saved_digger', displayName: 'Saved Digger' },
            messages: [],
          }),
        });
        return;
      }
      if (pathname === '/messages/widget/data') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            unreadCount,
            savedPeople: [{ id: 'saved-profile-1', username: 'saved_digger', displayName: 'Saved Digger', avatarUrl: null }],
            conversations: [{
              id: 'conversation-1',
              conversationType: 'listing',
              releaseArtist: 'Pink Floyd',
              releaseTitle: 'The Dark Side of the Moon',
              otherParticipant: 'Seller User',
              otherParticipantUsername: 'seller_user',
              lastMessage: 'Hi from seller',
              lastMessageAt: '2026-10-25T10:00:00.000Z',
              unreadCount,
            }],
          }),
        });
        return;
      }
      if (pathname === '/messages/widget/conversation-1') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conversation-1',
            conversationType: 'listing',
            title: 'Pink Floyd — The Dark Side of the Moon',
            release: { artist: 'Pink Floyd', title: 'The Dark Side of the Moon' },
            listing: { id: 'listing-1' },
            userRole: 'buyer',
            unreadCount,
            otherParticipant: { username: 'seller_user', displayName: 'Seller User' },
            messages: [{
              id: 'message-1',
              messageSeq: 1,
              isOwnMessage: false,
              body: 'Hi from seller',
              createdAt: '2026-10-25T10:00:00.000Z',
            }],
          }),
        });
        return;
      }
      if (pathname === '/messages/conversation-1/read' && requestInfo.method() === 'POST') {
        unreadCount = 0;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    const html = await renderFullHtmlPage({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: true,
    });
    await page.setContent(html);
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as {
        document: { querySelector(selector: string): { hasAttribute(name: string): boolean; textContent: string | null } | null };
      };
      const badge = browser.document.querySelector('[data-messaging-unread-count]');
      return Boolean(badge && !badge.hasAttribute('hidden') && badge.textContent === '2');
    });

    await page.click('#mobile-you-trigger');
    const mobileMessagesTrigger = page.locator('#mobile-you-surface [data-messaging-widget-trigger]');
    expect(await mobileMessagesTrigger.textContent()).toContain('Messages & People');
    expect(await mobileMessagesTrigger.getAttribute('aria-haspopup')).toBe('dialog');
    await mobileMessagesTrigger.click();

    const panel = page.locator('#messaging-floating-window');
    const backdrop = page.locator('#messaging-mobile-backdrop');
    expect(await panel.isVisible()).toBe(true);
    expect(await backdrop.isVisible()).toBe(true);
    expect(await panel.getAttribute('aria-modal')).toBe('true');
    expect(page.url()).not.toContain('/messages');
    // The inbox separates current conversations from private Saved People in accessible tabs.
    await page.waitForSelector('[role="tablist"][aria-label="Messages and people"]', { state: 'visible' });
    expect(await page.locator('#messaging-widget-tab-conversations').getAttribute('aria-selected')).toBe('true');
    await page.locator('#messaging-widget-tab-people').click();
    await page.waitForSelector('.messaging-widget-person-list', { state: 'visible' });
    expect(await page.locator('.messaging-widget-person-list').textContent()).toContain('Saved Digger');
    expect(await page.locator('.messaging-widget-person-profile').getAttribute('href')).toBe('/profiles/saved_digger');
    expect(await page.locator('.messaging-widget-person-message').getAttribute('aria-label')).toBe('Message @saved_digger');

    const panelLayout = await panel.evaluate((element) => {
      const browser = globalThis as unknown as {
        window: { getComputedStyle: (target: unknown) => { position: string } };
      };
      const rect = element.getBoundingClientRect();
      const styles = browser.window.getComputedStyle(element);
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height, position: styles.position };
    });
    expect(panelLayout.position).toBe('fixed');
    expect(panelLayout.top).toBeGreaterThanOrEqual(12);
    expect(panelLayout.top).toBeLessThan(14);
    expect(panelLayout.left).toBeGreaterThanOrEqual(12);
    expect(panelLayout.left).toBeLessThan(14);
    expect(panelLayout.width).toBeCloseTo(351, 0);
    expect(panelLayout.height).toBeGreaterThan(760);
    expect(await panel.evaluate((element) => {
      const browser = globalThis as unknown as { window: { getComputedStyle: (target: unknown) => { borderRadius: string } } };
      return browser.window.getComputedStyle(element).borderRadius;
    })).toBe('5px');

    // Starting a conversation from People returns to People, not to a duplicate /messages page.
    await page.locator('.messaging-widget-person-message').click();
    await page.waitForSelector('.messaging-widget-message-list');
    expect(await page.locator('.messaging-floating-title').textContent()).toContain('@saved_digger');
    expect(await page.locator('.messaging-widget-toolbar button').getAttribute('aria-label')).toBe('Back to people');
    await page.locator('.messaging-widget-toolbar button').click();
    await page.waitForSelector('.messaging-widget-person-list');
    expect(page.url()).not.toContain('/messages');

    await page.locator('#messaging-widget-tab-conversations').click();
    await page.locator('.messaging-widget-conversation').click();
    await page.waitForSelector('.messaging-widget-message');
    expect(await page.locator('.messaging-widget-message').textContent()).toContain('Hi from seller');
    expect(await page.locator('.messaging-widget-compose textarea').isVisible()).toBe(true);
    expect(await page.locator('.messaging-widget-send img').getAttribute('src')).toBe('/assets/svg/send.svg');
    expect(await page.locator('.messaging-widget-toolbar a').count()).toBe(0);
    expect(await page.locator('.messaging-widget-toolbar button').getAttribute('aria-label')).toBe('Back to conversations');

    // Pulling the same widget header down minimizes it; pulling the launcher up restores it.
    const dragBox = await page.locator('[data-message-drag-handle]').boundingBox();
    expect(dragBox).not.toBeNull();
    await page.mouse.move(dragBox!.x + 22, dragBox!.y + 20);
    await page.mouse.down();
    await page.mouse.move(dragBox!.x + 22, dragBox!.y + 130, { steps: 4 });
    await page.mouse.up();
    expect(await panel.evaluate((element) => element.classList.contains('is-minimized'))).toBe(true);
    expect(await backdrop.isVisible()).toBe(false);
    const bodyOverflow = await page.locator('body').evaluate((element) => {
      const browser = globalThis as unknown as {
        window: { getComputedStyle: (target: unknown) => { overflow: string } };
      };
      return browser.window.getComputedStyle(element).overflow;
    });
    expect(bodyOverflow).not.toBe('hidden');

    const minimizedHeader = await page.locator('[data-message-drag-handle]').boundingBox();
    expect(minimizedHeader).not.toBeNull();
    await page.mouse.move(minimizedHeader!.x + 22, minimizedHeader!.y + 22);
    await page.mouse.down();
    await page.mouse.move(minimizedHeader!.x + 22, minimizedHeader!.y - 90, { steps: 4 });
    await page.mouse.up();
    expect(await panel.evaluate((element) => element.classList.contains('is-minimized'))).toBe(false);
    expect(await backdrop.isVisible()).toBe(true);

    await page.locator('[data-message-close]').click();
    await page.waitForSelector('#messaging-floating-window[hidden]');
    expect(await panel.getAttribute('hidden')).not.toBeNull();
    expect(await backdrop.isVisible()).toBe(false);
    expect(page.url()).not.toContain('/messages');
    const activeFocusId = await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { activeElement: { id: string } | null } };
      return browser.document.activeElement?.id;
    });
    expect(activeFocusId).toBe('mobile-you-trigger');
    expect(requests.some((item) => item.method === 'POST' && (item.path.endsWith('/read') || item.path.endsWith('/archive')))).toBe(false);

    // Closing through the backdrop also stays on the current page and releases the scroll lock.
    await page.click('#mobile-you-trigger');
    await page.locator('#mobile-you-surface [data-messaging-widget-trigger]').click();
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as { document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null } };
      return browser.document.querySelector('#messaging-floating-window')?.getAttribute('aria-modal') === 'true';
    });
    await page.locator('#messaging-mobile-backdrop').click({ position: { x: 4, y: 4 } });
    expect(await panel.evaluate((element) => element.classList.contains('is-closing'))).toBe(true);
    await page.waitForSelector('#messaging-floating-window[hidden]');
    expect(page.url()).not.toContain('/messages');
    expect(await page.locator('body').evaluate((element) => element.classList.contains('messaging-mobile-panel-open'))).toBe(false);

    // Reduced motion closes immediately instead of playing the fade.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#mobile-you-trigger');
    await page.locator('#mobile-you-surface [data-messaging-widget-trigger]').click();
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as { document: { querySelector(selector: string): { getAttribute(name: string): string | null } | null } };
      return browser.document.querySelector('#messaging-floating-window')?.getAttribute('aria-modal') === 'true';
    });
    await page.locator('[data-message-close]').click();
    expect(await panel.getAttribute('hidden')).not.toBeNull();
    expect(await panel.evaluate((element) => element.classList.contains('is-closing'))).toBe(false);
  });

  it('keeps profile landing and empty Crate usable without horizontal overflow across phone, tablet, and desktop widths', async () => {
    const viewports = [320, 360, 375, 414, 768, 1280];

    for (const view of ['show', 'crate'] as const) {
      const html = await renderProfilePage(view, view === 'crate');
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 820 });
        await page.setContent(html);

        const measurements = await page.evaluate(() => {
          const browser = globalThis as unknown as {
            document: {
              querySelector: (selector: string) => {
                getBoundingClientRect: () => { right: number; height: number };
              } | null;
              documentElement: { scrollWidth: number };
              querySelectorAll: (selector: string) => ArrayLike<{
                tagName: string;
                id: string;
                className: unknown;
                scrollWidth: number;
                clientWidth: number;
                getBoundingClientRect: () => { left: number; right: number; width: number };
              }>;
            };
            window: { innerWidth: number };
          };
          const root = browser.document.querySelector('.profile-landing-page, .profile-crate-page');
          const crateLink = browser.document.querySelector('.profile-crate-entry');
          const bounds = root?.getBoundingClientRect();
          const linkBounds = crateLink?.getBoundingClientRect();
          const overflowingElements = Array.from(browser.document.querySelectorAll('*'))
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tagName: element.tagName,
                id: element.id,
                className: String(element.className),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
              };
            })
            .filter((element) => element.right > browser.window.innerWidth + 1 || element.left < -1)
            .sort((a, b) => b.right - a.right)
            .slice(0, 12);
          return {
            viewportWidth: browser.window.innerWidth,
            documentWidth: browser.document.documentElement.scrollWidth,
            rootRight: bounds?.right ?? 0,
            crateLinkHeight: linkBounds?.height ?? 0,
            crateLinkRight: linkBounds?.right ?? 0,
            overflowingElements,
          };
        });

        if (measurements.documentWidth > measurements.viewportWidth) {
          throw new Error(
            `Horizontal overflow for ${view} at ${width}px: ${JSON.stringify(measurements)}`
          );
        }
        expect(measurements.rootRight).toBeLessThanOrEqual(measurements.viewportWidth);
        if (view === 'show') {
          expect(measurements.crateLinkHeight).toBeGreaterThanOrEqual(44);
          expect(measurements.crateLinkRight).toBeLessThanOrEqual(measurements.viewportWidth);
          expect(await page.locator('.profile-crate-entry').getAttribute('href')).toBe('/profiles/a_very_long_username_for_small_screens/crate');
          expect(await page.locator('.listing-grid').count()).toBe(0);
        } else {
          expect(await page.locator('.profile-crate-empty').isVisible()).toBe(true);
          expect(await page.locator('a[href="/drop/new"]').count()).toBe(1);
        }
      }
    }
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
      expect(await page.locator('#mobile-you-title').textContent()).toBe('About');
      expect(await page.locator('#mobile-you-about-back').evaluate((el) => el.closest('.mobile-you-header') !== null)).toBe(true);
      expect(await isFocused('#mobile-you-about-back')).toBe(true);

      const aboutLinks = await page.locator('#mobile-you-about-view .mobile-you-info-links a').evaluateAll((els) => els.map((el) => (el as { getAttribute: (name: string) => string | null }).getAttribute('href')));
      expect(aboutLinks).toEqual(['/community-rules', '/terms', '/privacy', '/contact']);

      await page.click('#mobile-you-about-back');
      expect(await isElementVisible('#mobile-you-main-view')).toBe(true);
      expect(await isElementVisible('#mobile-you-about-view')).toBe(false);
      expect(await getAttribute('#mobile-you-about-trigger', 'aria-expanded')).toBe('false');
      expect(await isFocused('#mobile-you-about-trigger')).toBe(true);
      expect(await isElementVisible('#mobile-you-surface')).toBe(true);
    });

    it('keeps Me/About panel height stable and honors reduced-motion preferences', async () => {
      const fullHtml = await renderFullHtmlPage({
        currentPath: '/',
        currentUser: { id: 'user-123', email: 'digger@example.com' },
        currentProfile: { id: 'user-123', username: 'cratedigger' },
        messagingEnabled: false,
      });

      await page.setViewportSize({ width: 375, height: 667 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setContent(fullHtml);
      await page.click('#mobile-you-trigger');
      await page.waitForTimeout(200);

      const normalMotion = await page.evaluate(String.raw`(() => {
        const selectors = [
          '.mobile-you-surface',
          '.mobile-you-surface-backdrop',
          '.mobile-you-surface-content',
          '.mobile-you-view',
        ];
        return selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, durations: '0s', transform: 'none' };
          const style = window.getComputedStyle(element);
          return { selector, durations: style.transitionDuration, transform: style.transform };
        });
      })()`) as Array<{ selector: string; durations: string; transform: string }>;

      expect(normalMotion).toHaveLength(4);
      expect(normalMotion.every(({ durations }) =>
        durations.split(',').some((duration) => Number.parseFloat(duration.trim()) > 0)
      )).toBe(true);

      const mainHeight = await page.locator('.mobile-you-surface-content').evaluate(
        (element) => Math.round(element.getBoundingClientRect().height)
      );
      await page.click('#mobile-you-about-trigger');
      await page.waitForTimeout(180);
      expect(await page.locator('#mobile-you-title').textContent()).toBe('About');
      const aboutHeight = await page.locator('.mobile-you-surface-content').evaluate(
        (element) => Math.round(element.getBoundingClientRect().height)
      );
      expect(Math.abs(aboutHeight - mainHeight)).toBeLessThanOrEqual(1);

      await page.keyboard.press('Escape');
      expect(await page.locator('#mobile-you-surface').evaluate((element) => element.classList.contains('is-closing'))).toBe(true);
      await page.waitForTimeout(220);
      expect(await page.locator('#mobile-you-surface').getAttribute('hidden')).not.toBeNull();
      expect(await isFocused('#mobile-you-trigger')).toBe(true);
      expect(await isBodyScrollLocked()).toBe(false);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setContent(fullHtml);
      await page.click('#mobile-you-trigger');

      const reducedMotion = await page.evaluate(String.raw`(() => {
        const selectors = [
          '.mobile-you-surface',
          '.mobile-you-surface-backdrop',
          '.mobile-you-surface-content',
          '.mobile-you-view',
        ];
        return selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, durations: '0s', transform: 'none' };
          const style = window.getComputedStyle(element);
          return { selector, durations: style.transitionDuration, transform: style.transform };
        });
      })()`) as Array<{ selector: string; durations: string; transform: string }>;

      expect(reducedMotion).toHaveLength(4);
      expect(reducedMotion.every(({ durations }) =>
        durations.split(',').every((duration) => Number.parseFloat(duration.trim()) === 0)
      )).toBe(true);
      expect(reducedMotion.every(({ transform }) => transform === 'none')).toBe(true);

      const reducedMainHeight = await page.locator('.mobile-you-surface-content').evaluate(
        (element) => Math.round(element.getBoundingClientRect().height)
      );
      await page.click('#mobile-you-about-trigger');
      const reducedAboutHeight = await page.locator('.mobile-you-surface-content').evaluate(
        (element) => Math.round(element.getBoundingClientRect().height)
      );
      expect(reducedAboutHeight).toBe(reducedMainHeight);

      await page.keyboard.press('Escape');
      expect(await page.locator('#mobile-you-surface').getAttribute('hidden')).not.toBeNull();
      expect(await isFocused('#mobile-you-trigger')).toBe(true);
      expect(await isBodyScrollLocked()).toBe(false);
    });

    it('prevents horizontal page overflow on information pages at narrow mobile widths', async () => {
      const contactForm = {
        values: { name: '', email: '', message: '' },
        fieldErrors: {},
        feedback: undefined,
      };
      const pageSpecs = [
        { name: 'contact.ejs', locals: { contactEmail: 'support@example.com', contactForm } },
        { name: 'privacy.ejs', locals: { contactEmail: 'support@example.com', noticeStatus: 'current' } },
        { name: 'terms.ejs', locals: { contactEmail: 'support@example.com', termsVersion: 'test-version' } },
        { name: 'community-rules.ejs', locals: {} },
      ];
      const viewports = [320, 360, 375, 414];

      for (const spec of pageSpecs) {
        const templatePath = path.join(__dirname, '../views/info', spec.name);
        const content = await ejs.renderFile(templatePath, spec.locals, { filename: templatePath });
        const html = `<!DOCTYPE html>
          <html lang="en"><head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>${stylesheetContent}</style>
          </head><body>${content}</body></html>`;

        for (const width of viewports) {
          await page.setViewportSize({ width, height: 780 });
          await page.setContent(html);
          const overflow = await page.evaluate(String.raw`(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }))()`) as { viewport: number; document: number; body: number };
          expect(overflow.document).toBeLessThanOrEqual(width + 1);
          expect(overflow.body).toBeLessThanOrEqual(width + 1);
        }
      }
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
      const backdrop = await page.evaluate(String.raw`(() => {
        const el = document.querySelector('.mobile-you-surface-backdrop');
        if (!el) return null;
        const color = getComputedStyle(el).backgroundColor;
        const alphaMatch = color.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/);
        return { color, alpha: Number(alphaMatch?.[1] ?? 1) };
      })()`) as { color: string; alpha: number } | null;
      expect(backdrop).not.toBeNull();
      expect(backdrop!.alpha).toBeGreaterThanOrEqual(0.85);

      await page.click('#mobile-you-trigger');
      const insets = await page.evaluate(String.raw`(() => {
        const panel = document.querySelector('.mobile-you-surface-content');
        if (!panel) return null;
        const rect = panel.getBoundingClientRect();
        return { left: rect.left, right: window.innerWidth - rect.right };
      })()`) as { left: number; right: number } | null;
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

      // Open surface with opacity fade.
      await page.click(mobileTriggerSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(true);
      expect(stylesheetContent).toContain('transition: opacity 180ms ease, visibility 0s linear 180ms;');
      expect(stylesheetContent).toContain('transition: opacity 180ms ease;');
      expect(await isBodyScrollLocked()).toBe(true);
      expect(await getAttribute(mobileTriggerSel, 'aria-expanded')).toBe('true');
      expect(await isFocused(closeBtnSel)).toBe(true);

      // Close button
      await page.click(closeBtnSel);
      expect(await isElementVisible(mobileSurfaceSel)).toBe(false);
      expect(await getAttribute(mobileSurfaceSel, 'aria-hidden')).toBe('true');
      expect(await page.locator(mobileSurfaceSel).evaluate((el) => el.classList.contains('is-closing'))).toBe(true);
      expect(await isBodyScrollLocked()).toBe(false);
      await page.waitForTimeout(220);
      expect(await page.locator(mobileSurfaceSel).getAttribute('hidden')).not.toBeNull();
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
      expect(await isFocused('.mobile-you-logout-btn')).toBe(true);

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
