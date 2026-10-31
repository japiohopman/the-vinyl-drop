(() => {
  const dialog = document.querySelector('[data-listing-gallery-dialog]');
  const opener = document.querySelector('[data-listing-gallery-open]');
  if (!dialog || !opener || typeof dialog.showModal !== 'function') return;

  const heroImage = document.getElementById('main-photo-img');
  const sleeveReflection = document.querySelector('[data-listing-sleeve-reflection]');
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

  if (heroImage && sleeveReflection) {
    heroImage.addEventListener('load', () => {
      const activeSource = heroImage.getAttribute('src');
      if (activeSource && sleeveReflection.getAttribute('src') !== activeSource) {
        sleeveReflection.style.visibility = 'visible';
        sleeveReflection.src = activeSource;
      }
    });
    sleeveReflection.onerror = () => {
      sleeveReflection.style.visibility = 'hidden';
    };
  }

  let activeIndex = 0;

  function showPhoto(index) {
    activeIndex = (index + photos.length) % photos.length;
    const photo = photos[activeIndex];
    activeImage.onerror = function() {
      this.onerror = null;
      this.src = '/assets/vinyl-placeholder.svg';
      this.alt = photo.alt + ' (image unavailable)';
    };
    activeImage.src = photo.url;
    activeImage.alt = photo.alt;
    activeImage.hidden = false;
    counter.textContent = (activeIndex + 1) + ' / ' + photos.length;
    previousButton.disabled = photos.length < 2;
    nextButton.disabled = photos.length < 2;

    if (heroImage) {
      heroImage.style.display = 'block';
      const wrapper = heroImage.closest('.primary-photo-wrapper');
      const fallbackBadge = wrapper ? wrapper.querySelector('.terminal-fallback-badge') : null;
      if (fallbackBadge) fallbackBadge.remove();
      if (typeof window.handleImageFallback === 'function') {
        heroImage.onerror = function() { window.handleImageFallback(this); };
      }
      heroImage.src = photo.url;
      heroImage.alt = photo.alt;
      if (sleeveReflection) {
        sleeveReflection.style.visibility = 'visible';
        sleeveReflection.src = photo.url;
      }
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
