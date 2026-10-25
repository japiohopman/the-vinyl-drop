(() => {
  const PLACEHOLDER = '/assets/vinyl-placeholder.svg';

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;

    if (image.hasAttribute('data-avatar-image')) {
      image.hidden = true;
      const fallback = image.nextElementSibling;
      if (fallback instanceof HTMLElement) fallback.hidden = false;
      return;
    }
    if (!image.hasAttribute('data-artwork-image')) return;

    const currentSource = image.getAttribute('src') || '';
    const preferredFallback = image.dataset.artworkFallback || '';

    if (!image.dataset.artworkFallbackTried && preferredFallback && preferredFallback !== currentSource) {
      image.dataset.artworkFallbackTried = 'true';
      image.src = preferredFallback;
      return;
    }

    if (currentSource !== PLACEHOLDER) {
      image.dataset.artworkFallbackTried = 'true';
      image.removeAttribute('data-artwork-fallback');
      image.src = PLACEHOLDER;
      return;
    }

    // Activity provides an accessible terminal fallback if even the local
    // placeholder cannot load. Do not hide images on other surfaces unless
    // they explicitly provide this fallback element.
    const terminalFallback = image.parentElement?.querySelector('[data-artwork-terminal-fallback]');
    if (terminalFallback instanceof HTMLElement) {
      image.hidden = true;
      terminalFallback.hidden = false;
    }
  }, true);
})();
