(() => {
  const desktopQuery = window.matchMedia('(min-width: 768px)');
  const disclosureSelector = 'details.browse-mobile-filter-panel, details.footer-links-menu';

  function syncResponsiveDisclosures() {
    const shouldBeOpen = desktopQuery.matches;
    document.querySelectorAll(disclosureSelector).forEach((element) => {
      if (!(element instanceof HTMLDetailsElement)) return;
      if (element.open !== shouldBeOpen) {
        element.open = shouldBeOpen;
      }
    });
  }

  syncResponsiveDisclosures();

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncResponsiveDisclosures);
  } else {
    // Older Safari versions use the MediaQueryList legacy listener API.
    desktopQuery.addListener(syncResponsiveDisclosures);
  }
})();
