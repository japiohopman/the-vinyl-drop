(() => {
  const root = document.querySelector('[data-dig-experience]');
  const digState = window.DigModeState;
  if (!root || !digState) return;

  const viewer = root.querySelector('[data-dig-viewer]');
  const slides = Array.from(root.querySelectorAll('[data-dig-slide]'));
  const previousButton = root.querySelector('[data-dig-prev]');
  const nextButton = root.querySelector('[data-dig-next]');
  const position = root.querySelector('[data-dig-position]');
  const headerPosition = document.querySelector('[data-dig-header-position]');
  const progress = root.querySelector('[data-dig-progress]');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const transitionMs = 380;
  const swipeThreshold = 64;
  const transientClasses = [
    'is-leaving-left',
    'is-leaving-right',
    'is-leaving-up',
    'is-leaving-down',
    'is-entering-from-left',
    'is-entering-from-right',
    'is-entering-from-top',
    'is-entering-from-bottom',
  ];

  if (!viewer || slides.length === 0) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let isTransitioning = false;
  let gesture = null;
  let transitionTimer = 0;
  let cancelGestureTimer = 0;

  function setReducedMotion() {
    root.dataset.reducedMotion = motionPreference.matches ? 'true' : 'false';
  }

  function setFlipState(slide, flipped) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    const button = slide.querySelector('[data-dig-flip]');
    const front = slide.querySelector('.dig-sleeve-face-front');
    const back = slide.querySelector('.dig-sleeve-face-back');
    if (card) card.classList.toggle('is-flipped', flipped);
    if (front) front.setAttribute('aria-hidden', String(flipped));
    if (back) back.setAttribute('aria-hidden', String(!flipped));
    if (button) {
      button.setAttribute('aria-pressed', String(flipped));
      button.setAttribute('aria-label', flipped ? 'Flip cover to view the front' : 'Flip cover to view the back');
      button.textContent = flipped ? 'Flip front' : 'Flip back';
    }
  }

  function clearFlip(slide) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (card) {
      card.style.transform = '';
      card.style.transition = '';
      card.classList.remove('is-dragging');
    }
    setFlipState(slide, false);
  }

  function toggleFlip(slide) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return;
    setFlipState(slide, digState.nextFlipState(card.classList.contains('is-flipped')));
  }

  function updateNavigation() {
    const positionText = String(activeIndex + 1) + ' of ' + String(slides.length);
    if (position) position.textContent = positionText;
    if (headerPosition) headerPosition.textContent = positionText;
    if (progress) {
      progress.max = slides.length;
      progress.value = activeIndex + 1;
    }
    if (previousButton) previousButton.disabled = activeIndex === 0 || isTransitioning;
    if (nextButton) nextButton.disabled = activeIndex >= slides.length - 1 || isTransitioning;
  }

  function paintSlides() {
    slides.forEach((slide, index) => {
      slide.classList.remove('is-active', 'is-next', 'is-previous', 'is-dragging');
      transientClasses.forEach((name) => slide.classList.remove(name));
      slide.style.transform = '';
      slide.style.opacity = '';
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

  function releasePointer(stage, pointerId) {
    try {
      if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released the pointer.
    }
  }

  function navigateTo(targetIndex, leavingClass, enteringClass) {
    if (isTransitioning || !digState.isValidIndex(targetIndex, slides.length) || targetIndex === activeIndex) return;

    const previous = slides[activeIndex];
    const next = slides[targetIndex];
    const reducedMotion = motionPreference.matches;
    window.clearTimeout(transitionTimer);
    window.clearTimeout(cancelGestureTimer);
    cancelGestureTimer = 0;
    isTransitioning = true;
    updateNavigation();

    previous.classList.remove('is-active', 'is-next', 'is-previous', 'is-dragging');
    transientClasses.forEach((name) => previous.classList.remove(name));
    previous.classList.add(leavingClass);
    previous.setAttribute('aria-hidden', 'true');
    previous.inert = true;

    next.classList.remove('is-next', 'is-previous', 'is-dragging');
    transientClasses.forEach((name) => next.classList.remove(name));
    next.classList.add('is-active', enteringClass);
    next.setAttribute('aria-hidden', 'false');
    next.inert = false;

    // Capture the pointer's last dragged position before clearing its inline
    // transform, so the outgoing card continues from the finger into its exit.
    void previous.offsetHeight;
    previous.style.transform = '';
    previous.style.opacity = '';
    previous.style.transition = '';
    next.style.transform = '';
    next.style.opacity = '';
    next.style.transition = '';

    activeIndex = targetIndex;
    slides.forEach(clearFlip);
    updateNavigation();

    const finish = () => {
      window.clearTimeout(transitionTimer);
      previous.classList.remove(leavingClass, 'is-dragging');
      next.classList.remove(enteringClass, 'is-dragging');
      previous.style.transform = '';
      previous.style.opacity = '';
      previous.style.transition = '';
      next.style.transform = '';
      next.style.opacity = '';
      next.style.transition = '';
      isTransitioning = false;
      paintSlides();
    };

    if (reducedMotion) {
      finish();
      return;
    }

    // Keep the incoming card off-canvas for one frame, then draw it into the
    // single active-card position while the outgoing card exits above it.
    void next.offsetHeight;
    window.requestAnimationFrame(() => {
      if (isTransitioning) next.classList.remove(enteringClass);
    });
    transitionTimer = window.setTimeout(finish, transitionMs);
  }

  function clearDragStyles(currentGesture) {
    const current = currentGesture || gesture;
    if (!current) return;
    if (gesture === current) gesture = null;

    const { slide, stage, pointerId } = current;
    stage.classList.remove('is-gesture-active');
    slide.classList.remove('is-dragging');
    slide.style.transition = motionPreference.matches
      ? 'none'
      : 'transform 180ms ease-out, opacity 180ms ease-out';
    slide.style.transform = '';
    slide.style.opacity = '';
    releasePointer(stage, pointerId);

    window.clearTimeout(cancelGestureTimer);
    cancelGestureTimer = window.setTimeout(() => {
      slide.style.transition = '';
      paintSlides();
      cancelGestureTimer = 0;
    }, motionPreference.matches ? 0 : 190);
  }

  function handlePointerDown(event) {
    if (isTransitioning || gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    if (cancelGestureTimer) {
      window.clearTimeout(cancelGestureTimer);
      cancelGestureTimer = 0;
    }

    const stage = event.currentTarget;
    const slide = slides[activeIndex];
    if (!slide || !stage.closest('[data-dig-slide]')?.classList.contains('is-active')) return;

    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      stage,
      slide,
      width: Math.max(stage.getBoundingClientRect().width, 1),
      height: Math.max(stage.getBoundingClientRect().height, 1),
      axis: 'pending',
    };

    stage.classList.add('is-gesture-active');
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is progressive enhancement; buttons and keyboard remain available.
    }
  }

  function handlePointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || isTransitioning) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.axis === 'pending') {
      if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        gesture.axis = 'horizontal';
        gesture.slide.classList.add('is-dragging');
      } else if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        gesture.axis = 'vertical';
        gesture.slide.classList.add('is-dragging');
      }
    }

    if (gesture.axis === 'pending') return;
    event.preventDefault();
    gesture.deltaX = deltaX;
    gesture.deltaY = deltaY;

    const horizontal = gesture.axis === 'horizontal';
    const delta = horizontal ? deltaX : deltaY;
    const direction = horizontal
      ? (deltaX < 0 ? 1 : -1)
      : (deltaY < 0 ? 1 : -1);
    const adjacentIndex = digState.adjacentIndex(activeIndex, slides.length, direction);
    const targetIndex = adjacentIndex === null ? -1 : adjacentIndex;
    const hasTarget = adjacentIndex !== null;
    const dimension = horizontal ? gesture.width : gesture.height;
    const progressValue = Math.min(Math.abs(delta) / dimension, 1);
    const softenedDelta = hasTarget ? delta : delta * 0.2;
    const translate = horizontal
      ? 'translate3d(' + String(softenedDelta) + 'px, 0, 0)'
      : 'translate3d(0, ' + String(softenedDelta) + 'px, 0)';

    // Keep the sleeve at a constant, face-on size: the gesture changes only
    // its position. Metadata fades separately when the card leaves the deck. 
    gesture.slide.style.transform = translate;
  }

  function handlePointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const current = gesture;
    const { deltaX, deltaY, axis, slide, stage, pointerId } = current;
    stage.classList.remove('is-gesture-active');
    releasePointer(stage, pointerId);
    gesture = null;

    if (axis === 'horizontal' && Math.abs(deltaX) >= swipeThreshold) {
      const goingNext = deltaX < 0;
      const targetIndex = activeIndex + (goingNext ? 1 : -1);
      if (digState.isValidIndex(targetIndex, slides.length)) {
        navigateTo(
          targetIndex,
          goingNext ? 'is-leaving-left' : 'is-leaving-right',
          goingNext ? 'is-entering-from-right' : 'is-entering-from-left'
        );
        return;
      }
    }

    if (axis === 'vertical' && Math.abs(deltaY) >= swipeThreshold) {
      const discarding = deltaY < 0;
      const targetIndex = activeIndex + (discarding ? 1 : -1);
      if (digState.isValidIndex(targetIndex, slides.length)) {
        navigateTo(
          targetIndex,
          discarding ? 'is-leaving-up' : 'is-leaving-down',
          discarding ? 'is-entering-from-bottom' : 'is-entering-from-top'
        );
        return;
      }
    }

    clearDragStyles(current);
  }

  slides.forEach((slide) => {
    const flipButton = slide.querySelector('[data-dig-flip]');
    if (flipButton) {
      flipButton.addEventListener('click', () => {
        if (!slide.classList.contains('is-active')) return;
        toggleFlip(slide);
      });
    }

    const stage = slide.querySelector('[data-dig-swipe-area]');
    if (stage) {
      stage.addEventListener('pointerdown', handlePointerDown);
      stage.addEventListener('pointermove', handlePointerMove);
      stage.addEventListener('pointerup', handlePointerUp);
      stage.addEventListener('pointercancel', (event) => {
        if (gesture && event.pointerId === gesture.pointerId) clearDragStyles();
      });
      stage.addEventListener('lostpointercapture', (event) => {
        if (gesture && event.pointerId === gesture.pointerId) clearDragStyles();
      });
    }
  });

  if (previousButton) {
    previousButton.addEventListener('click', () => {
      navigateTo(activeIndex - 1, 'is-leaving-down', 'is-entering-from-top');
    });
  }
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      navigateTo(activeIndex + 1, 'is-leaving-up', 'is-entering-from-bottom');
    });
  }

  viewer.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea, summary')) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateTo(activeIndex - 1, 'is-leaving-right', 'is-entering-from-left');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      navigateTo(activeIndex + 1, 'is-leaving-left', 'is-entering-from-right');
    } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      navigateTo(activeIndex + 1, 'is-leaving-up', 'is-entering-from-bottom');
    } else if (event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      navigateTo(activeIndex - 1, 'is-leaving-down', 'is-entering-from-top');
    } else if (event.key === 'Home') {
      event.preventDefault();
      navigateTo(0, activeIndex > 0 ? 'is-leaving-down' : 'is-leaving-up', activeIndex > 0 ? 'is-entering-from-top' : 'is-entering-from-bottom');
    } else if (event.key === 'End') {
      event.preventDefault();
      navigateTo(slides.length - 1, activeIndex < slides.length - 1 ? 'is-leaving-up' : 'is-leaving-down', activeIndex < slides.length - 1 ? 'is-entering-from-bottom' : 'is-entering-from-top');
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
