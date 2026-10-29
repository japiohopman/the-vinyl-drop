(() => {
  document.querySelectorAll('[data-youtube-preview]').forEach((section) => {
    const frame = section.querySelector('[data-youtube-preview-frame]');
    const loadButton = section.querySelector('[data-youtube-preview-load]');
    if (!frame || !loadButton) return;

    loadButton.addEventListener('click', () => {
      // Activation is idempotent; a repeated click can never create a second player.
      if (frame.querySelector('iframe')) return;

      const videoId = section.getAttribute('data-video-id') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        loadButton.disabled = true;
        const label = loadButton.querySelector('span:last-child');
        if (label) label.textContent = 'Preview unavailable';
        return;
      }

      const title = section.getAttribute('data-release-title') || 'this release';
      const player = document.createElement('iframe');
      player.title = 'YouTube music preview for ' + title;
      // Autoplay is requested only as a direct result of the visitor's Play click.
      // The browser or YouTube player may still require its own Play control.
      player.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?playsinline=1&autoplay=1';
      player.width = '640';
      player.height = '360';
      player.loading = 'eager';
      player.referrerPolicy = 'strict-origin-when-cross-origin';
      player.allow = 'autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';
      player.allowFullscreen = true;

      frame.hidden = false;
      frame.replaceChildren(player);
      section.classList.add('is-loaded');
      loadButton.hidden = true;
    });
  });
})();
