(() => {
  const trigger = document.querySelector('[data-dig-filter-open]');
  const dialog = document.querySelector('[data-dig-filter-dialog]');
  if (!(trigger instanceof HTMLButtonElement) || !(dialog instanceof HTMLDialogElement)) return;

  const form = dialog.querySelector('[data-dig-filter-form]');
  const closeButton = dialog.querySelector('[data-dig-filter-close]');
  const cancelButton = dialog.querySelector('[data-dig-filter-cancel]');
  if (!(form instanceof HTMLFormElement) ||
      !(closeButton instanceof HTMLButtonElement) ||
      !(cancelButton instanceof HTMLButtonElement) ||
      typeof dialog.show !== 'function' || typeof dialog.showModal !== 'function') {
    trigger.hidden = true;
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visualViewport = window.visualViewport || null;
  let closeTimer = 0;
  let viewportSyncFrame = 0;
  // Keep the last non-keyboard layout height so Android browsers that resize
  // both the layout and visual viewports still expose the keyboard obstruction.
  let stableLayoutHeight = Math.max(
    document.documentElement.clientHeight || 0,
    window.innerHeight || 0
  );

  const clearKeyboardViewport = () => {
    dialog.classList.remove('is-keyboard-open');
    dialog.style.removeProperty('--dig-visible-viewport-top');
    dialog.style.removeProperty('--dig-visible-viewport-height');
    dialog.style.removeProperty('--dig-visible-viewport-bottom-inset');
  };

  const keepFocusedControlVisible = () => {
    const activeControl = document.activeElement;
    if (!(activeControl instanceof HTMLElement) || !dialog.contains(activeControl)) return;

    const dialogRect = dialog.getBoundingClientRect();
    const controlRect = activeControl.getBoundingClientRect();
    const visibleTop = dialogRect.top + 8;
    const visibleBottom = dialogRect.bottom - 8;

    if (controlRect.top < visibleTop) {
      dialog.scrollTop -= visibleTop - controlRect.top + 8;
    } else if (controlRect.bottom > visibleBottom) {
      dialog.scrollTop += controlRect.bottom - visibleBottom + 8;
    }
  };

  const syncKeyboardViewport = () => {
    if (!dialog.open || !window.matchMedia('(max-width: 767px)').matches) {
      clearKeyboardViewport();
      return;
    }

    const currentLayoutHeight = Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0
    );
    const layoutHeight = Math.max(stableLayoutHeight, currentLayoutHeight);
    const visibleHeight = Math.max(0, visualViewport ? visualViewport.height : currentLayoutHeight);
    const viewportTop = Math.max(0, visualViewport ? visualViewport.offsetTop : 0);
    const bottomInset = Math.max(0, layoutHeight - viewportTop - visibleHeight);
    const keyboardIsOpen = bottomInset > 120;

    if (!keyboardIsOpen) {
      stableLayoutHeight = currentLayoutHeight;
      clearKeyboardViewport();
      return;
    }

    dialog.style.setProperty('--dig-visible-viewport-top', viewportTop + 'px');
    dialog.style.setProperty('--dig-visible-viewport-height', visibleHeight + 'px');
    dialog.style.setProperty('--dig-visible-viewport-bottom-inset', bottomInset + 'px');
    dialog.classList.add('is-keyboard-open');
    keepFocusedControlVisible();
  };

  const queueKeyboardViewportSync = () => {
    if (viewportSyncFrame) return;
    viewportSyncFrame = window.requestAnimationFrame(() => {
      viewportSyncFrame = 0;
      syncKeyboardViewport();
    });
  };

  if (visualViewport) {
    visualViewport.addEventListener('resize', queueKeyboardViewportSync);
    visualViewport.addEventListener('scroll', queueKeyboardViewportSync);
  }
  window.addEventListener('resize', queueKeyboardViewportSync);
  window.addEventListener('orientationchange', () => {
    stableLayoutHeight = Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0
    );
    queueKeyboardViewportSync();
  });
  dialog.addEventListener('focusin', queueKeyboardViewportSync);

  const finishClose = () => {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    if (!dialog.open) return;
    clearKeyboardViewport();
    dialog.classList.remove('is-open', 'is-closing');
    dialog.close('cancel');
  };

  const closeDialog = () => {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    trigger.setAttribute('aria-expanded', 'false');

    // The mobile panel slides down in the page layer; desktop keeps its
    // existing modal behavior and reduced-motion users close immediately.
    if (!window.matchMedia('(max-width: 767px)').matches || reducedMotion.matches) {
      finishClose();
      return;
    }

    dialog.classList.remove('is-open');
    dialog.classList.add('is-closing');
    closeTimer = window.setTimeout(finishClose, 420);
  };

  dialog.addEventListener('transitionend', (event) => {
    if (event.target === dialog && event.propertyName === 'transform' &&
        dialog.classList.contains('is-closing')) {
      finishClose();
    }
  });

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    const mobilePanel = window.matchMedia('(max-width: 767px)').matches;
    dialog.classList.remove('is-open', 'is-closing');

    // The mobile filter is an in-context app panel, not a modal overlay:
    // show() deliberately avoids the browser-managed ::backdrop/top layer.
    // Desktop retains showModal() and its existing focus/inert behavior.
    if (mobilePanel) {
      dialog.show();
      // Commit the translated starting position before applying .is-open.
      // This makes the vertical slide deterministic without @starting-style.
      dialog.getBoundingClientRect();
    } else {
      dialog.showModal();
    }

    trigger.setAttribute('aria-expanded', 'true');
    const firstControl = dialog.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled])');
    if (firstControl instanceof HTMLElement) firstControl.focus();
    else closeButton.focus();

    if (mobilePanel) {
      window.requestAnimationFrame(() => {
        if (!dialog.open) return;
        dialog.classList.add('is-open');
        queueKeyboardViewportSync();
      });
    } else {
      queueKeyboardViewportSync();
    }
  });

  closeButton.addEventListener('click', closeDialog);
  cancelButton.addEventListener('click', closeDialog);

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog.open) {
      event.preventDefault();
      closeDialog();
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });

  dialog.addEventListener('close', () => {
    clearKeyboardViewport();
    trigger.setAttribute('aria-expanded', 'false');
    form.reset();
    if (trigger.isConnected) trigger.focus();
  });
})();
