(() => {
  document.querySelectorAll('[data-youtube-preview]').forEach((section) => {
    const frame = section.querySelector('[data-youtube-preview-frame]');
    if (!frame) return;

    const loadPlayer = () => {
      if (frame.querySelector('iframe')) return;

      const videoId = section.getAttribute('data-video-id') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;

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

      frame.replaceChildren(player);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadPlayer();
        }
      }, { rootMargin: '0px 0px 80px 0px' });
      observer.observe(frame);
    } else {
      loadPlayer();
    }
  });
})();
