(() => {
  const dialog = document.querySelector('[data-listing-gallery-dialog]');
  const opener = document.querySelector('[data-listing-gallery-open]');
  if (!dialog || !opener || typeof dialog.showModal !== 'function') return;

  const heroImage = document.getElementById('main-photo-img');
  const activeImage = dialog.querySelector('[data-listing-gallery-active-image]');
  const counter = dialog.querySelector('[data-listing-gallery-counter]');
  const closeButton = dialog.querySelector('[data-listing-gallery-close]');
  const previousButton = dialog.querySelector('[data-listing-gallery-previous]');
  const nextButton = dialog.querySelector('[data-listing-gallery-next]');
  const photos = Array.from(dialog.querySelectorAll('[data-listing-gallery-photo]')).map((node) => ({
    url: node.getAttribute('data-photo-url') || '',
    alt: node.getAttribute('data-photo-alt') || 'Listing photo',
  })).filter((photo) => photo.url);

  if (!photos.length || !activeImage || !counter || !closeButton || !previousButton || !nextButton) return;

  let activeIndex = 0;

  function showPhoto(index) {
    activeIndex = (index + photos.length) % photos.length;
    const photo = photos[activeIndex];
    activeImage.onerror = null;
    activeImage.src = photo.url;
    activeImage.alt = photo.alt;
    activeImage.hidden = false;
    counter.textContent = (activeIndex + 1) + ' / ' + photos.length;
    previousButton.disabled = photos.length < 2;
    nextButton.disabled = photos.length < 2;

    if (heroImage) {
      if (typeof window.handleImageFallback === 'function') {
        heroImage.onerror = function() { window.handleImageFallback(this); };
      }
      heroImage.src = photo.url;
      heroImage.alt = photo.alt;
    }
  }

  opener.addEventListener('click', () => {
    const currentUrl = heroImage ? heroImage.getAttribute('src') : '';
    const currentIndex = photos.findIndex((photo) => photo.url === currentUrl);
    showPhoto(currentIndex >= 0 ? currentIndex : 0);
    dialog.showModal();
    closeButton.focus();
  });

  closeButton.addEventListener('click', () => dialog.close());
  previousButton.addEventListener('click', () => showPhoto(activeIndex - 1));
  nextButton.addEventListener('click', () => showPhoto(activeIndex + 1));

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' && photos.length > 1) {
      event.preventDefault();
      showPhoto(activeIndex - 1);
    } else if (event.key === 'ArrowRight' && photos.length > 1) {
      event.preventDefault();
      showPhoto(activeIndex + 1);
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', () => opener.focus());
})();
