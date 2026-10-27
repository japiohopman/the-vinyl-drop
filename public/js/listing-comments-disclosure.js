(() => {
  document.querySelectorAll('.listing-comments-disclosure').forEach((details) => {
    const summary = details.querySelector('summary');
    if (!summary) return;

    const syncExpandedState = () => {
      summary.setAttribute('aria-expanded', String(details.open));
    };

    details.addEventListener('toggle', () => {
      syncExpandedState();
      if (!details.open && details.contains(document.activeElement) && document.activeElement !== summary) {
        summary.focus();
      }
    });

    syncExpandedState();
  });
})();
