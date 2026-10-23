import ejs from 'ejs';
import path from 'path';
import fs from 'fs';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Navigation Partial View Rendering & Script Interactions (views/partials/nav.ejs)', () => {
  const navTemplatePath = path.join(__dirname, '../views/partials/nav.ejs');
  const cssPath = path.join(__dirname, '../public/css/style.css');
  const stylesheetContent = fs.readFileSync(cssPath, 'utf8');

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

  it('renders primary desktop destinations and mobile bottom bar for unauthenticated users', async () => {
    const html = await renderNav({
      currentPath: '/',
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
    });

    expect(html).toContain('HOME');
    expect(html).toContain('BROWSE');
    expect(html).toContain('+ DROP');
    expect(html).toContain('ACTIVITY');
    expect(html).toContain('SIGN IN');
    expect(html).toContain('id="mobile-you-surface"');
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

    expect(html).toContain('href="/browse" class="nav-link active" aria-current="page"');
  });

  describe('DOM Structure and Accessibility Attributes', () => {
    it('contains embedded client script with accessibility, Escape key, focus trap, and resize listeners', async () => {
      const html = await renderNav({
        currentPath: '/',
        currentUser: null,
        currentProfile: null,
        messagingEnabled: false,
      });

      expect(html).toContain('desktop-you-trigger');
      expect(html).toContain('desktop-you-menu');
      expect(html).toContain('mobile-you-trigger');
      expect(html).toContain('mobile-you-surface');
      expect(html).toContain("e.key === 'Escape'");
      expect(html).toContain("e.key === 'Tab'");
      expect(html).toContain('min-width: 768px');
    });

    it('includes required CSS rules for desktop popover, mobile surface, and zero overflow', () => {
      expect(stylesheetContent).toContain('.desktop-you-menu');
      expect(stylesheetContent).toContain('.mobile-you-surface');
      expect(stylesheetContent).toContain('account-surface-open');
      expect(stylesheetContent).toContain('max-width: 100%');
    });
  });
});
