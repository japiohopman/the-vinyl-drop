(() => {
  document.querySelectorAll('[data-youtube-preview]').forEach((section) => {
    const button = section.querySelector('[data-youtube-preview-load]');
    const frame = section.querySelector('[data-youtube-preview-frame]');
    const status = section.querySelector('[data-youtube-preview-status]');
    if (!button || !frame || !status) return;

    button.addEventListener('click', () => {
      if (frame.querySelector('iframe')) return;

      const videoId = section.getAttribute('data-video-id') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        status.textContent = 'This preview link is invalid. Open the release on YouTube instead.';
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
      player.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';
      player.allowFullscreen = true;

      frame.hidden = false;
      frame.appendChild(player);
      button.hidden = true;
      status.textContent = 'YouTube player loaded. Playback may be unavailable for some videos; use the Open on YouTube link if needed.';
    });
  });
})();
