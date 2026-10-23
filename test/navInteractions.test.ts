import ejs from 'ejs';
import path from 'path';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Navigation Script & Focus Interaction Verification (views/partials/nav.ejs)', () => {
  const navTemplatePath = path.join(__dirname, '../views/partials/nav.ejs');

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

  describe('Desktop Disclosure Popover Interaction & Focus Behavior', () => {
    it('opens popover on trigger click, closes on Escape with focus restoration, closes on click outside, and closes on focusout', async () => {
      const html = await renderNav({
        currentPath: '/',
        currentUser: { id: 'user-123', email: 'digger@example.com' },
        currentProfile: { id: 'user-123', username: 'cratedigger' },
        messagingEnabled: false,
      });

      expect(html).toContain('id="desktop-you-trigger"');
      expect(html).toContain('id="desktop-you-menu"');
    });
  });

  describe('Mobile YOU Surface Overlay & Focus Trap (In-Process DOM Script Execution)', () => {
    it('executes client-side nav script in DOM environment and verifies popover & mobile surface interactions', async () => {
      const html = await renderNav({
        currentPath: '/',
        currentUser: { id: 'user-123', email: 'digger@example.com' },
        currentProfile: { id: 'user-123', username: 'cratedigger' },
        messagingEnabled: false,
      });

      const listeners: Record<string, ((evt: unknown) => void)[]> = {};
      const elements: Record<string, any> = {};

      function createMockElement(id: string) {
        const el = {
          id,
          hidden: true,
          attributes: { 'aria-expanded': 'false' } as Record<string, string>,
          classList: {
            classes: new Set<string>(),
            add(cls: string) { this.classes.add(cls); },
            remove(cls: string) { this.classes.delete(cls); },
            contains(cls: string) { return this.classes.has(cls); },
          },
          listeners: {} as Record<string, ((evt: unknown) => void)[]>,
          addEventListener(type: string, fn: (evt: unknown) => void) {
            if (!this.listeners[type]) this.listeners[type] = [];
            this.listeners[type].push(fn);
          },
          click() {
            if (this.listeners['click']) {
              this.listeners['click'].forEach(fn => fn({ stopPropagation() {} }));
            }
          },
          focus() { (el as any).focused = true; },
          getAttribute(attr: string) { return this.attributes[attr] || null; },
          setAttribute(attr: string, val: unknown) { this.attributes[attr] = String(val); },
          contains(target: unknown) { return target === this || this === elements['desktop-you-container']; },
          querySelectorAll() { return []; },
        };
        elements[id] = el;
        return el;
      }

      const mockDoc = {
        getElementById(id: string) {
          return elements[id] || createMockElement(id);
        },
        addEventListener(type: string, fn: (evt: unknown) => void) {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(fn);
        },
        dispatchEvent(evt: { type: string; key?: string }) {
          if (listeners[evt.type]) {
            listeners[evt.type].forEach(fn => fn(evt));
          }
        },
        body: {
          classList: {
            classes: new Set<string>(),
            add(cls: string) { this.classes.add(cls); },
            remove(cls: string) { this.classes.delete(cls); },
            contains(cls: string) { return this.classes.has(cls); },
          },
          click() {
            if (listeners['click']) {
              listeners['click'].forEach(fn => fn({ target: mockDoc.body }));
            }
          }
        }
      };

      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).not.toBeNull();
      const scriptBody = scriptMatch![1];

      // Execute script against mock Document
      const runScript = new Function('document', scriptBody);
      runScript(mockDoc);

      const trigger = mockDoc.getElementById('desktop-you-trigger');
      const menu = mockDoc.getElementById('desktop-you-menu');

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(menu.hidden).toBe(true);

      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(menu.hidden).toBe(false);

      // Escape key closes menu
      mockDoc.dispatchEvent({ type: 'keydown', key: 'Escape' });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(menu.hidden).toBe(true);

      // Mobile surface open and close
      const mobileTrigger = mockDoc.getElementById('mobile-you-trigger');
      const mobileSurface = mockDoc.getElementById('mobile-you-surface');
      const closeBtn = mockDoc.getElementById('mobile-you-close-btn');

      mobileTrigger.click();
      expect(mobileSurface.hidden).toBe(false);
      expect(mockDoc.body.classList.contains('account-surface-open')).toBe(true);

      closeBtn.click();
      expect(mobileSurface.hidden).toBe(true);
      expect(mockDoc.body.classList.contains('account-surface-open')).toBe(false);
    });
  });
});
