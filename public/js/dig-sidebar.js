(() => {
  const sidebar = document.querySelector('[data-dig-sidebar]');
  if (!(sidebar instanceof HTMLElement)) return;

  const drawerTriggers = Array.from(document.querySelectorAll('[data-dig-drawer-open]'))
    .filter((element) => element instanceof HTMLButtonElement);
  const drawerCloseTrigger = sidebar.querySelector('[data-dig-drawer-close]');

  // Apply the enhanced drawer only after its required controls have been found.
  if (drawerTriggers.length === 0 || !(drawerCloseTrigger instanceof HTMLButtonElement)) return;

  const drawerMedia = window.matchMedia('(max-width: 1023px)');
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let backdrop = null;
  let activeTrigger = null;
  let previousFocus = null;
  let previousBodyOverflow = '';

  /** Return visible sidebar controls in their DOM keyboard-focus order. */
  function getFocusableElements() {
    return Array.from(sidebar.querySelectorAll(focusableSelector)).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.tabIndex < 0) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  /** Keep the open drawer inside the visual viewport as the mobile keyboard changes its size. */
  function syncDrawerViewport() {
    if (!sidebar.classList.contains('is-drawer-open') || !drawerMedia.matches || !window.visualViewport) {
      sidebar.style.removeProperty('--dig-sidebar-viewport-top');
      sidebar.style.removeProperty('--dig-sidebar-viewport-height');
      return;
    }
    const viewport = window.visualViewport;
    sidebar.style.setProperty('--dig-sidebar-viewport-top', Math.max(0, viewport.offsetTop) + 'px');
    sidebar.style.setProperty('--dig-sidebar-viewport-height', Math.max(0, viewport.height) + 'px');
  }

  /** Close the drawer, restore the named sidebar landmark, and return focus to its opener. */
  function closeDrawer(options = {}) {
    if (!sidebar.classList.contains('is-drawer-open')) return;
    const restoreFocus = options.restoreFocus !== false;

    sidebar.classList.remove('is-drawer-open');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.setAttribute('aria-label', 'Dig sidebar');
    sidebar.removeAttribute('tabindex');
    sidebar.style.removeProperty('--dig-sidebar-viewport-top');
    sidebar.style.removeProperty('--dig-sidebar-viewport-height');
    drawerTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = previousBodyOverflow;

    if (restoreFocus) {
      const target = activeTrigger?.isConnected && activeTrigger.getClientRects().length > 0
        ? activeTrigger
        : previousFocus;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    }
    activeTrigger = null;
    previousFocus = null;
  }

  /** Open the enhanced drawer and move keyboard focus into its modal surface. */
  function openDrawer(trigger) {
    if (!drawerMedia.matches || sidebar.classList.contains('is-drawer-open')) return;
    activeTrigger = trigger instanceof HTMLElement ? trigger : drawerTriggers[0] || null;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;

    sidebar.classList.add('is-drawer-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Dig filters');
    sidebar.setAttribute('tabindex', '-1');
    drawerTriggers.forEach((item) => item.setAttribute('aria-expanded', 'true'));

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'dig-drawer-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.addEventListener('click', () => closeDrawer());
      document.body.appendChild(backdrop);
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    syncDrawerViewport();
    if (drawerCloseTrigger instanceof HTMLElement) drawerCloseTrigger.focus();
    else sidebar.focus();
  }

  drawerTriggers.forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => openDrawer(trigger));
  });
  if (drawerCloseTrigger instanceof HTMLElement) {
    drawerCloseTrigger.addEventListener('click', () => closeDrawer());
  }

  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-drawer-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      sidebar.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !sidebar.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !sidebar.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', syncDrawerViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncDrawerViewport);
    window.visualViewport.addEventListener('scroll', syncDrawerViewport);
  }
  if (typeof drawerMedia.addEventListener === 'function') {
    drawerMedia.addEventListener('change', (event) => {
      if (!event.matches) closeDrawer({ restoreFocus: false });
    });
  }

  // Mark the document enhanced only after the drawer controls and handlers are ready.
  document.documentElement.classList.add('dig-sidebar-enhanced');
})();
