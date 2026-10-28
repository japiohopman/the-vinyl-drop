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

  const closeDialog = () => {
    if (!dialog.open) return;
    trigger.setAttribute('aria-expanded', 'false');
    form.reset();
    dialog.close('cancel');
  };

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
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

  dialog.addEventListener('cancel', () => {
    trigger.setAttribute('aria-expanded', 'false');
    form.reset();
  });

  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    form.reset();
    if (trigger.isConnected) trigger.focus();
  });
})();
