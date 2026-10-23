import ejs from 'ejs';
import path from 'path';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Navigation Partial View Rendering & Script Interactions (views/partials/nav.ejs)', () => {
  const navTemplatePath = path.join(__dirname, '../views/partials/nav.ejs');

  function renderNav(locals: Record<string, unknown>): string {
    return ejs.renderFile(
      navTemplatePath,
      {
        getIconSvg,
        ...locals,
      },
      {
        filename: navTemplatePath,
      }
    ) as unknown as string;
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

    expect(html).toContain('YOU');
    expect(html).toContain('Account');
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

  it('includes client-side interaction script handling disclosure popover, Escape key, focus restoration, and mobile focus trap', async () => {
    const html = await renderNav({
      currentPath: '/',
      currentUser: { id: 'user-123', email: 'digger@example.com' },
      currentProfile: { id: 'user-123', username: 'cratedigger' },
      messagingEnabled: false,
    });

    expect(html).toContain("document.getElementById('desktop-you-container')");
    expect(html).toContain("document.getElementById('desktop-you-trigger')");
    expect(html).toContain("document.getElementById('desktop-you-menu')");
    expect(html).toContain("document.getElementById('mobile-you-trigger')");
    expect(html).toContain("document.getElementById('mobile-you-surface')");
    expect(html).toContain("document.getElementById('mobile-you-close-btn')");
    expect(html).toContain("document.body.classList.add('account-surface-open')");
    expect(html).toContain("e.key === 'Escape'");
    expect(html).toContain("e.key === 'Tab'");
    expect(html).toContain("focusin");
  });
});
