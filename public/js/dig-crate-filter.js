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
      typeof dialog.showModal !== 'function') {
    trigger.hidden = true;
    return;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visualViewport = window.visualViewport || null;
  let closeTimer = 0;
  let viewportSyncFrame = 0;

  const clearKeyboardViewport = () => {
    dialog.classList.remove('is-keyboard-open');
    dialog.style.removeProperty('--dig-visible-viewport-top');
    dialog.style.removeProperty('--dig-visible-viewport-height');
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

    const visibleHeight = Math.max(0, (visualViewport && visualViewport.height) || window.innerHeight);
    const layoutHeight = Math.max(
      document.documentElement.clientHeight || 0,
      window.innerHeight || 0
    );
    const keyboardIsOpen = layoutHeight - visibleHeight > 120;

    if (!keyboardIsOpen) {
      clearKeyboardViewport();
      return;
    }

    dialog.style.setProperty('--dig-visible-viewport-top', Math.max(0, (visualViewport && visualViewport.offsetTop) || 0) + 'px');
    dialog.style.setProperty('--dig-visible-viewport-height', visibleHeight + 'px');
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
  dialog.addEventListener('focusin', queueKeyboardViewportSync);

  const finishClose = () => {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    if (!dialog.open) return;
    clearKeyboardViewport();
    dialog.classList.remove('is-closing');
    dialog.close('cancel');
  };

  const closeDialog = () => {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    trigger.setAttribute('aria-expanded', 'false');

    // The mobile panel slides down before leaving the top layer. Desktop and
    // reduced-motion users keep an immediate close.
    if (!window.matchMedia('(max-width: 767px)').matches || reducedMotion.matches) {
      finishClose();
      return;
    }

    dialog.classList.add('is-closing');
    closeTimer = window.setTimeout(finishClose, 360);
  };

  dialog.addEventListener('transitionend', (event) => {
    if (event.target === dialog && event.propertyName === 'transform' &&
        dialog.classList.contains('is-closing')) {
      finishClose();
    }
  });

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    dialog.classList.remove('is-closing');
    dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    const firstControl = dialog.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled])');
    if (firstControl instanceof HTMLElement) firstControl.focus();
    else closeButton.focus();
    queueKeyboardViewportSync();
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
