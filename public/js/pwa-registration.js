(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Installation guidance and standard browser installation remain available
      // even when this browser does not support service workers.
    });
  });
})();
