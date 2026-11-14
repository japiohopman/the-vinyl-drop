(() => {
  'use strict';

  document.querySelectorAll('[data-special-pressing-toggle]').forEach((toggle) => {
    if (!(toggle instanceof HTMLInputElement)) return;

    const panelId = toggle.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!(panel instanceof HTMLElement)) return;

    const syncPanel = () => {
      const expanded = toggle.checked;
      panel.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));

      if (!expanded) {
        panel.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          if (input instanceof HTMLInputElement) input.checked = false;
        });
        panel.querySelectorAll('textarea').forEach((textarea) => {
          if (textarea instanceof HTMLTextAreaElement) textarea.value = '';
        });
      }
    };

    toggle.addEventListener('change', syncPanel);
    syncPanel();
  });
})();
