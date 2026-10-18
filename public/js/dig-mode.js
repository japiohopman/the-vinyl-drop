(() => {
  const root = document.querySelector('[data-dig-experience]');
  if (!root) return;

  const viewer = root.querySelector('[data-dig-viewer]');
  const slides = Array.from(root.querySelectorAll('[data-dig-slide]'));
  const previousButton = root.querySelector('[data-dig-prev]');
  const nextButton = root.querySelector('[data-dig-next]');
  const position = root.querySelector('[data-dig-position]');
  const progress = root.querySelector('[data-dig-progress]');
  const progressLabel = root.querySelector('[data-dig-progress-label]');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const transitionMs = 440;
  const swipeThreshold = 64;

  if (!viewer || slides.length === 0) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let isTransitioning = false;
  let gesture = null;
  let transitionTimer = 0;
  let cancelGestureTimer = 0;

  function setReducedMotion() {
    root.dataset.reducedMotion = motionPreference.matches ? 'true' : 'false';
  }

  function clearFlip(slide) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    const button = slide.querySelector('[data-dig-flip]');
    if (card) card.classList.remove('is-flipped');
    if (button) {
      button.setAttribute('aria-pressed', 'false');
      button.textContent = 'Bekijk achterkant';
    }
  }

  function updateNavigation() {
    if (position) position.textContent = `${activeIndex + 1} van ${slides.length}`;
    if (progress) {
      progress.max = slides.length;
      progress.value = activeIndex + 1;
    }
    if (previousButton) previousButton.disabled = activeIndex === 0 || isTransitioning;
    if (nextButton) nextButton.disabled = activeIndex >= slides.length - 1 || isTransitioning;
    if (progressLabel) {
      if (slides.length === 1) progressLabel.textContent = 'Eén plaat in deze sessie';
      else if (activeIndex === slides.length - 1) progressLabel.textContent = 'Je bent bij de laatste plaat';
      else progressLabel.textContent = 'Omhoog voor de volgende plaat';
    }
  }

  function paintSlides() {
    slides.forEach((slide, index) => {
      slide.classList.remove('is-active', 'is-next', 'is-previous', 'is-leaving-up', 'is-leaving-down', 'is-dragging');
      slide.style.transform = '';
      slide.style.transition = '';
      if (index === activeIndex) {
        slide.classList.add('is-active');
        slide.setAttribute('aria-hidden', 'false');
        slide.inert = false;
      } else {
        slide.setAttribute('aria-hidden', 'true');
        slide.inert = true;
        if (index === activeIndex + 1) slide.classList.add('is-next');
        if (index === activeIndex - 1) slide.classList.add('is-previous');
      }
    });
    updateNavigation();
  }

  function navigateTo(targetIndex, direction) {
    if (isTransitioning || targetIndex < 0 || targetIndex >= slides.length || targetIndex === activeIndex) return;

    const previous = slides[activeIndex];
    const next = slides[targetIndex];
    const reducedMotion = motionPreference.matches;
    window.clearTimeout(transitionTimer);
    window.clearTimeout(cancelGestureTimer);
    isTransitioning = true;
    updateNavigation();

    previous.classList.remove('is-dragging', 'is-active', 'is-next', 'is-previous');
    previous.classList.add(direction > 0 ? 'is-leaving-up' : 'is-leaving-down');
    previous.setAttribute('aria-hidden', 'true');
    previous.inert = true;

    next.classList.remove('is-next', 'is-previous', 'is-leaving-up', 'is-leaving-down', 'is-dragging');
    next.classList.add('is-active');
    next.setAttribute('aria-hidden', 'false');
    next.inert = false;

    // Force the browser to capture the dragged position before returning both
    // sleeves to their transition targets. This lets the release feel connected
    // to the finger instead of restarting the animation from an arbitrary point.
    void previous.offsetHeight;
    previous.style.transform = '';
    next.style.transform = '';

    activeIndex = targetIndex;
    slides.forEach(clearFlip);
    updateNavigation();

    const finish = () => {
      window.clearTimeout(transitionTimer);
      previous.classList.remove('is-leaving-up', 'is-leaving-down', 'is-dragging');
      previous.style.transform = '';
      previous.style.transition = '';
      next.style.transform = '';
      next.style.transition = '';
      isTransitioning = false;
      paintSlides();
    };

    if (reducedMotion) {
      finish();
    } else {
      transitionTimer = window.setTimeout(finish, transitionMs);
    }
  }

  function getNeighborIndex(deltaY) {
    return activeIndex + (deltaY < 0 ? 1 : -1);
  }

  function clearDragStyles() {
    if (!gesture) return;
    const { slide, stage, neighbor } = gesture;
    slide.classList.remove('is-dragging');
    if (neighbor) neighbor.classList.remove('is-dragging');
    slide.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
    slide.style.transform = '';
    if (neighbor) {
      neighbor.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
      neighbor.style.transform = '';
    }
    try {
      if (stage.hasPointerCapture(gesture.pointerId)) stage.releasePointerCapture(gesture.pointerId);
    } catch {
      // The browser may already have released the pointer after pointercancel.
    }
    gesture = null;
    cancelGestureTimer = window.setTimeout(() => {
      slide.style.transition = '';
      if (neighbor) neighbor.style.transition = '';
      paintSlides();
    }, motionPreference.matches ? 0 : 220);
  }

  function handlePointerDown(event) {
    if (isTransitioning || gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const stage = event.currentTarget;
    const slide = slides[activeIndex];
    if (!slide || !stage.closest('[data-dig-slide]')?.classList.contains('is-active')) return;

    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaY: 0,
      stage,
      slide,
      neighbor: null,
      neighborIndex: -1,
      height: Math.max(stage.getBoundingClientRect().height, 1),
      horizontal: false,
    };

    stage.classList.add('is-gesture-active');
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a progressive enhancement; the buttons remain available.
    }
  }

  function handlePointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || isTransitioning) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      gesture.horizontal = true;
      clearDragStyles();
      return;
    }
    if (Math.abs(deltaY) < 4) return;

    event.preventDefault();
    gesture.deltaY = deltaY;
    const direction = deltaY < 0 ? 1 : -1;
    const targetIndex = activeIndex + direction;
    const neighbor = slides[targetIndex];
    gesture.neighborIndex = targetIndex;
    gesture.neighbor = neighbor || null;

    gesture.slide.classList.add('is-dragging');
    const progressValue = Math.min(Math.abs(deltaY) / gesture.height, 1);
    const softenedDelta = neighbor ? deltaY : deltaY * 0.22;
    const rotation = direction > 0 ? -progressValue * 9 : progressValue * 9;
    gesture.slide.style.transform = `translate3d(0, ${softenedDelta}px, 0) rotateX(${rotation}deg)`;

    if (neighbor) {
      neighbor.classList.add('is-dragging');
      const depth = 64 * (1 - progressValue);
      const scale = 0.94 + 0.06 * progressValue;
      const offset = direction > 0
        ? 18 + (1 - progressValue) * gesture.height * 0.2
        : -18 - (1 - progressValue) * gesture.height * 0.2;
      const neighborRotation = direction > 0
        ? -7 * (1 - progressValue)
        : 7 * (1 - progressValue);
      neighbor.style.transform = `translate3d(0, ${offset}px, -${depth}px) rotateX(${neighborRotation}deg) scale(${scale})`;
    }
  }

  function handlePointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const { deltaY, neighborIndex, slide, neighbor } = gesture;
    const shouldNavigate = !gesture.horizontal
      && Math.abs(deltaY) >= swipeThreshold
      && neighborIndex >= 0
      && neighborIndex < slides.length;

    // Store the target before releasing the pointer, because clearing a short
    // gesture also clears the gesture state.
    const targetIndex = neighborIndex;
    const direction = deltaY < 0 ? 1 : -1;
    const stage = gesture.stage;
    stage.classList.remove('is-gesture-active');

    if (shouldNavigate) {
      gesture = null;
      try {
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      } catch {
        // Already released by the browser.
      }
      navigateTo(targetIndex, direction);
      return;
    }

    clearDragStyles();
  }

  slides.forEach((slide) => {
    const flipButton = slide.querySelector('[data-dig-flip]');
    if (flipButton) {
      flipButton.addEventListener('click', () => {
        if (!slide.classList.contains('is-active')) return;
        const card = slide.querySelector('[data-dig-sleeve-card]');
        if (!card) return;
        const flipped = card.classList.toggle('is-flipped');
        flipButton.setAttribute('aria-pressed', String(flipped));
        flipButton.textContent = flipped ? 'Bekijk voorkant' : 'Bekijk achterkant';
      });
    }

    const stage = slide.querySelector('[data-dig-swipe-area]');
    if (stage) {
      stage.addEventListener('pointerdown', handlePointerDown);
      stage.addEventListener('pointermove', handlePointerMove);
      stage.addEventListener('pointerup', handlePointerUp);
      stage.addEventListener('pointercancel', handlePointerUp);
      stage.addEventListener('lostpointercapture', (event) => {
        if (gesture && event.pointerId === gesture.pointerId) clearDragStyles();
      });
    }
  });

  if (previousButton) previousButton.addEventListener('click', () => navigateTo(activeIndex - 1, -1));
  if (nextButton) nextButton.addEventListener('click', () => navigateTo(activeIndex + 1, 1));

  viewer.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea, summary')) return;

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      navigateTo(activeIndex + 1, 1);
    } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      navigateTo(activeIndex - 1, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      navigateTo(0, -1);
    } else if (event.key === 'End') {
      event.preventDefault();
      navigateTo(slides.length - 1, 1);
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      const button = slides[activeIndex].querySelector('[data-dig-flip]');
      if (button) button.click();
    }
  });

  if (typeof motionPreference.addEventListener === 'function') {
    motionPreference.addEventListener('change', setReducedMotion);
  } else if (typeof motionPreference.addListener === 'function') {
    motionPreference.addListener(setReducedMotion);
  }

  setReducedMotion();
  paintSlides();
})();
