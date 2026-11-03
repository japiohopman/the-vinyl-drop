(() => {
  document.querySelectorAll('[data-activity-youtube-preview]').forEach((section) => {
    const frame = section.querySelector('[data-activity-youtube-frame]');
    const loadButton = section.querySelector('[data-activity-youtube-load]');
    if (!frame || !loadButton) return;

    loadButton.addEventListener('click', () => {
      if (frame.querySelector('iframe')) return;

      const videoId = section.getAttribute('data-video-id') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        loadButton.disabled = true;
        return;
      }

      const title = section.getAttribute('data-release-title') || 'this release';
      const player = document.createElement('iframe');
      player.title = 'YouTube music preview for ' + title;
      player.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?playsinline=1';
      player.width = '640';
      player.height = '360';
      player.loading = 'eager';
      player.referrerPolicy = 'strict-origin-when-cross-origin';
      player.allow = 'encrypted-media; gyroscope; picture-in-picture; web-share';
      player.allowFullscreen = true;

      frame.hidden = false;
      frame.replaceChildren(player);
      section.classList.add('is-loaded');
      loadButton.hidden = true;
    });
  });
})();
