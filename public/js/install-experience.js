(() => {
  const installButton = document.querySelector('[data-install-action]');
  const shareButton = document.querySelector('[data-share-action]');
  const status = document.querySelector('[data-install-status]');
  const copyFallback = document.querySelector('[data-copy-fallback]');
  const shareUrlField = document.querySelector('[data-install-share-url]');

  if (!installButton || !shareButton || !status || !copyFallback || !shareUrlField) return;

  const installUrl = new URL('/install', window.location.origin).toString();
  let deferredInstallPrompt = null;

  function announce(message) {
    status.textContent = message;
  }

  async function copyInstallLink() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(installUrl);
        copyFallback.hidden = true;
        announce('Install link copied. Paste it into WhatsApp, email or another app.');
        return;
      }
    } catch {
      // Continue to the manual-selection fallback below.
    }

    copyFallback.hidden = false;
    shareUrlField.value = installUrl;
    shareUrlField.focus();
    shareUrlField.select();

    try {
      const copied = document.execCommand('copy');
      announce(copied
        ? 'Install link copied. Paste it into WhatsApp, email or another app.'
        : 'The link is selected. Copy it and paste it into WhatsApp, email or another app.');
    } catch {
      announce('The link is selected. Copy it and paste it into WhatsApp, email or another app.');
    }
  }

  shareButton.addEventListener('click', async () => {
    announce('');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'The Vinyl Drop',
          text: 'Buy. Trade. Dig. Open The Vinyl Drop on your device.',
          url: installUrl,
        });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          announce('Sharing cancelled.');
          return;
        }
        await copyInstallLink();
      }
      return;
    }

    await copyInstallLink();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installButton.disabled = true;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      announce(choice && choice.outcome === 'accepted'
        ? 'The Vinyl Drop is being installed.'
        : 'Installation was cancelled. You can use the browser menu to install it later.');
    } catch {
      announce('The browser could not open its install prompt. Use the browser menu to install The Vinyl Drop.');
    } finally {
      installButton.hidden = true;
      installButton.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    announce('The Vinyl Drop is installed on this device.');
  });

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) {
    announce('The Vinyl Drop is already open as an installed app.');
  }

  if (typeof navigator.share !== 'function') {
    shareButton.textContent = 'Copy install link';
  }
})();
