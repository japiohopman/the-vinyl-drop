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
  let closeTimer = 0;

  const finishClose = () => {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    if (!dialog.open) return;
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
    trigger.setAttribute('aria-expanded', 'false');
    form.reset();
    if (trigger.isConnected) trigger.focus();
  });
})();
