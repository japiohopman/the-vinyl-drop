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
      button.textContent = flipped ? 'Flip cover to front' : 'Flip cover to back';
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
    if (isTransitioning || !digState.isValidIndex(targetIndex, slides.length) || targetIndex === activeIndex) return;

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

  function clearDragStyles() {
    if (!gesture) return;
    const { slide, stage, neighbor } = gesture;
    stage.classList.remove('is-gesture-active');
    slide.classList.remove('is-dragging');
    if (neighbor) neighbor.classList.remove('is-dragging');
    const sleeveCard = slide.querySelector('[data-dig-sleeve-card]');
    if (sleeveCard) {
      sleeveCard.classList.remove('is-dragging');
      sleeveCard.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
      sleeveCard.style.transform = '';
    }
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

    // A previous cancelled gesture may still have a delayed paintSlides reset queued.
    // Cancel it before a new drag starts so it cannot snap the sleeve back mid-gesture.
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
      neighbor: null,
      neighborIndex: -1,
      height: Math.max(stage.getBoundingClientRect().height, 1),
      width: Math.max(stage.getBoundingClientRect().width, 1),
      axis: 'pending',
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

    if (gesture.axis === 'pending' && Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      gesture.horizontal = true;
      gesture.axis = 'horizontal';
      const card = gesture.slide.querySelector('[data-dig-sleeve-card]');
      gesture.slide.classList.add('is-dragging');
      if (card) {
        card.classList.add('is-dragging');
        card.style.transition = 'none';
      }
    } else if (gesture.axis === 'pending' && Math.abs(deltaY) > 4) {
      gesture.axis = 'vertical';
    }

    if (gesture.horizontal) {
      gesture.deltaX = deltaX;
      event.preventDefault();
      const card = gesture.slide.querySelector('[data-dig-sleeve-card]');
      if (card && !motionPreference.matches) {
        const startingAngle = card.classList.contains('is-flipped') ? 180 : 0;
        const deltaAngle = Math.max(-180, Math.min(180, (deltaX / gesture.width) * 180));
        card.style.transform = 'rotateY(' + (startingAngle + deltaAngle) + 'deg)';
      }
      return;
    }
    if (Math.abs(deltaY) < 4) return;

    event.preventDefault();
    gesture.deltaY = deltaY;
    const direction = deltaY < 0 ? 1 : -1;
    const adjacent = digState.adjacentIndex(activeIndex, slides.length, direction);
    const targetIndex = adjacent === null ? -1 : adjacent;
    const neighbor = adjacent === null ? null : slides[adjacent];
    if (gesture.neighbor && gesture.neighbor !== neighbor) {
      gesture.neighbor.classList.remove('is-dragging');
      gesture.neighbor.style.transform = '';
      gesture.neighbor.style.transition = '';
    }
    gesture.neighborIndex = targetIndex;
    gesture.neighbor = neighbor || null;

    gesture.slide.classList.add('is-dragging');
    const progressValue = Math.min(Math.abs(deltaY) / gesture.height, 1);
    if (motionPreference.matches) return;
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
    const { deltaX, deltaY, neighborIndex, slide, stage, horizontal } = gesture;

    if (horizontal) {
      const card = slide.querySelector('[data-dig-sleeve-card]');
      const shouldFlip = Math.abs(deltaX) >= swipeThreshold;
      stage.classList.remove('is-gesture-active');
      gesture = null;
      try {
        if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      } catch {
        // Already released by the browser.
      }

      if (card) {
        const wasFlipped = card.classList.contains('is-flipped');
        const draggedTransform = card.style.transform;
        card.classList.remove('is-dragging');
        slide.classList.remove('is-dragging');
        slide.style.transform = '';
        slide.style.transition = '';

        if (motionPreference.matches) {
          if (shouldFlip) setFlipState(slide, !wasFlipped);
          card.style.transform = '';
          card.style.transition = '';
          return;
        }

        card.style.transition = 'transform 260ms cubic-bezier(.2, .75, .25, 1)';
        card.style.transform = draggedTransform;
        void card.offsetHeight;
        if (shouldFlip) {
          setFlipState(slide, !wasFlipped);
          const endAngle = wasFlipped
            ? (deltaX > 0 ? 360 : 0)
            : (deltaX > 0 ? 180 : -180);
          card.style.transform = 'rotateY(' + endAngle + 'deg)';
        } else {
          card.style.transform = 'rotateY(' + (wasFlipped ? 180 : 0) + 'deg)';
        }
        window.setTimeout(() => {
          card.style.transition = '';
          card.style.transform = '';
          card.classList.remove('is-dragging');
        }, 280);
      }
      return;
    }

    const shouldNavigate = digState.shouldCommitSwipe(
      deltaY,
      swipeThreshold,
      neighborIndex,
      slides.length,
      false
    );

    // Store the target before releasing the pointer, because clearing a short
    // gesture also clears the gesture state.
    const targetIndex = neighborIndex;
    const direction = deltaY < 0 ? 1 : -1;
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
        toggleFlip(slide);
      });
    }

    const stage = slide.querySelector('[data-dig-swipe-area]');
    if (stage) {
      stage.addEventListener('pointerdown', handlePointerDown);
      stage.addEventListener('pointermove', handlePointerMove);
      stage.addEventListener('pointerup', handlePointerUp);
      stage.addEventListener('pointercancel', (event) => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        stage.classList.remove('is-gesture-active');
        clearDragStyles();
      });
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
