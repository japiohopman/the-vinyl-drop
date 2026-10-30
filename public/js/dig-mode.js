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
  const transitionMs = 520;
  const swipeThreshold = 64;

  if (!viewer || slides.length === 0) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let isTransitioning = false;
  let gesture = null;
  let pinchGesture = null;
  const touchPointers = new Map();
  let transitionTimer = 0;
  let cancelGestureTimer = 0;
  let flipSettleTimer = 0;
  let pendingFlipSettle = null;
  let zoomIdleTimer = 0;
  let zoomIdleSlide = null;
  let zoomIdleAfterTouchSlide = null;
  let zoomResetTimer = 0;

  function setReducedMotion() {
    root.dataset.reducedMotion = motionPreference.matches ? 'true' : 'false';
  }

  function requestDigHapticPulse() {
    const vibration = navigator.vibrate;
    if (typeof vibration !== 'function') return;

    try {
      vibration.call(navigator, 10);
    } catch {
      // Haptics are optional progressive enhancement; never block Dig.
    }
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

  function clearMetadataOverrides(slide) {
    ['.dig-listing-meta', '.dig-card-actions'].forEach((selector) => {
      const element = slide.querySelector(selector);
      if (element) element.style.opacity = '';
    });
  }


  function settleFlipCard(card, restingAngle) {
    card.style.transition = 'none';
    card.style.transform = 'rotateY(' + restingAngle + 'deg)';
    void card.offsetHeight;
    card.style.transform = '';
    void card.offsetHeight;
    card.style.transition = '';
    card.classList.remove('is-dragging');
  }

  function finishPendingFlipSettle(expectedPending) {
    const pending = expectedPending || pendingFlipSettle;
    if (!pending || pendingFlipSettle !== pending) return;

    if (flipSettleTimer) window.clearTimeout(flipSettleTimer);
    flipSettleTimer = 0;
    pendingFlipSettle = null;
    settleFlipCard(pending.card, pending.restingAngle);
  }

  function flushPendingFlipSettle() {
    finishPendingFlipSettle(pendingFlipSettle);
  }

  function getZoomState(slide) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return { scale: 1, panX: 0, panY: 0 };
    return {
      scale: Number.parseFloat(card.style.getPropertyValue('--dig-zoom-scale')) || 1,
      panX: Number.parseFloat(card.style.getPropertyValue('--dig-zoom-pan-x')) || 0,
      panY: Number.parseFloat(card.style.getPropertyValue('--dig-zoom-pan-y')) || 0,
    };
  }

  function getRenderedZoomState(slide) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    const state = getZoomState(slide);
    if (!card || !card.classList.contains('is-zoom-resetting')) return state;

    const visibleFace = card.classList.contains('is-flipped') ? '.dig-sleeve-face-back' : '.dig-sleeve-face-front';
    const artwork = card.querySelector(
      visibleFace + ' .dig-sleeve-image, ' +
      visibleFace + ' .dig-missing-front, ' +
      visibleFace + ' .dig-missing-back'
    );
    if (!artwork) return state;

    const transform = window.getComputedStyle(artwork).transform;
    const Matrix = window.DOMMatrixReadOnly || window.DOMMatrix;
    if (!transform || transform === 'none' || !Matrix) return state;

    try {
      const matrix = new Matrix(transform);
      const scale = Math.sqrt(matrix.m11 * matrix.m11 + matrix.m12 * matrix.m12);
      return {
        scale: scale || state.scale,
        panX: matrix.m41,
        panY: matrix.m42,
      };
    } catch {
      return state;
    }
  }

  function clearZoomIdleTimer() {
    if (zoomIdleTimer) window.clearTimeout(zoomIdleTimer);
    zoomIdleTimer = 0;
    zoomIdleSlide = null;
  }

  function clearZoomResetTimer() {
    if (zoomResetTimer) window.clearTimeout(zoomResetTimer);
    zoomResetTimer = 0;
  }

  function setZoomState(slide, scale, panX, panY) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return;
    clearZoomResetTimer();

    if (scale <= 1.01) {
      card.style.removeProperty('--dig-zoom-scale');
      card.style.removeProperty('--dig-zoom-pan-x');
      card.style.removeProperty('--dig-zoom-pan-y');
      card.classList.remove('is-zoomed');
      return;
    }

    card.style.setProperty('--dig-zoom-scale', String(Math.min(2.5, Math.max(1, scale))));
    card.style.setProperty('--dig-zoom-pan-x', panX.toFixed(2) + 'px');
    card.style.setProperty('--dig-zoom-pan-y', panY.toFixed(2) + 'px');
    card.classList.add('is-zoomed');
  }

  function resetZoom(slide, animate) {
    clearZoomIdleTimer();
    const card = slide && slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return;
    const wasZoomed = card.classList.contains('is-zoomed');
    card.classList.remove('is-zooming');

    if (animate && wasZoomed && !motionPreference.matches) {
      card.classList.add('is-zoom-resetting');
      card.style.removeProperty('--dig-zoom-scale');
      card.style.removeProperty('--dig-zoom-pan-x');
      card.style.removeProperty('--dig-zoom-pan-y');
      card.classList.remove('is-zoomed');
      clearZoomResetTimer();
      zoomResetTimer = window.setTimeout(() => {
        card.classList.remove('is-zoom-resetting');
        zoomResetTimer = 0;
      }, 360);
      return;
    }

    clearZoomResetTimer();
    card.classList.remove('is-zoomed', 'is-zoom-resetting');
    card.style.removeProperty('--dig-zoom-scale');
    card.style.removeProperty('--dig-zoom-pan-x');
    card.style.removeProperty('--dig-zoom-pan-y');
  }

  function scheduleZoomReset(slide) {
    clearZoomIdleTimer();
    const { scale } = getZoomState(slide);
    if (scale <= 1.01) return;

    zoomIdleSlide = slide;
    zoomIdleTimer = window.setTimeout(() => {
      const target = zoomIdleSlide;
      zoomIdleTimer = 0;
      zoomIdleSlide = null;
      if (!target || !target.isConnected) return;
      if (pinchGesture && pinchGesture.slide === target) {
        scheduleZoomReset(target);
        return;
      }
      resetZoom(target, true);
    }, 5000);
  }

  function clampZoomPan(value, scale, dimension) {
    const limit = Math.max(0, (scale - 1) * dimension / 2);
    return Math.max(-limit, Math.min(limit, value));
  }

  function finishTrackedTouchPointer(pointerId) {
    touchPointers.delete(pointerId);
    if (!zoomIdleAfterTouchSlide) return;

    const pendingSlide = zoomIdleAfterTouchSlide;
    const pendingStage = pendingSlide.querySelector('[data-dig-swipe-area]');
    const stillTouching = Array.from(touchPointers.values()).some((pointer) => pointer.stage === pendingStage);
    if (!stillTouching) {
      zoomIdleAfterTouchSlide = null;
      scheduleZoomReset(pendingSlide);
    }
  }

  function startPinch(slide, stage, firstPointer, secondPointer, firstPointerId, secondPointerId) {
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return;
    const renderedZoomState = getRenderedZoomState(slide);

    // A first touch may already have begun a one-finger flip/deck drag. Cancel
    // that provisional gesture without releasing its pointer capture so the
    // same two contacts can transition cleanly into pinch mode.
    if (gesture) {
      const interrupted = gesture;
      gesture = null;
      interrupted.stage.classList.remove('is-gesture-active');
      interrupted.slide.classList.remove('is-dragging');
      clearMetadataOverrides(interrupted.slide);
      const interruptedCard = interrupted.slide.querySelector('[data-dig-sleeve-card]');
      const movingStage = interrupted.slide.querySelector('.dig-sleeve-interaction');
      if (interruptedCard) {
        interruptedCard.classList.remove('is-dragging');
        interruptedCard.style.transition = '';
        interruptedCard.style.transform = '';
      }
      if (movingStage) {
        movingStage.style.transition = '';
        movingStage.style.transform = '';
        movingStage.style.visibility = '';
      }
      if (interrupted.neighbor) {
        interrupted.neighbor.classList.remove('is-dragging');
        clearMetadataOverrides(interrupted.neighbor);
        const interruptedNeighborStage = interrupted.neighbor.querySelector('.dig-sleeve-interaction');
        if (interruptedNeighborStage) {
          interruptedNeighborStage.style.transition = '';
          interruptedNeighborStage.style.transform = '';
          interruptedNeighborStage.style.visibility = '';
        }
        interrupted.neighbor.style.transition = '';
        interrupted.neighbor.style.transform = '';
        interrupted.neighbor.style.visibility = '';
        interrupted.neighbor.style.opacity = '';
      }
      interrupted.slide.style.transition = '';
      interrupted.slide.style.transform = '';
      interrupted.slide.style.opacity = '';
      interrupted.slide.style.visibility = '';
    }

    window.clearTimeout(cancelGestureTimer);
    cancelGestureTimer = 0;
    clearZoomIdleTimer();
    clearZoomResetTimer();
    zoomIdleAfterTouchSlide = null;
    card.classList.remove('is-zoom-resetting');
    card.classList.add('is-zooming');
    setZoomState(slide, renderedZoomState.scale, renderedZoomState.panX, renderedZoomState.panY);
    stage.classList.add('is-gesture-active');

    const bounds = stage.getBoundingClientRect();
    const midpointX = (firstPointer.x + secondPointer.x) / 2 - bounds.left;
    const midpointY = (firstPointer.y + secondPointer.y) / 2 - bounds.top;
    const { scale, panX, panY } = renderedZoomState;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    const startDistance = Math.max(1, Math.hypot(
      secondPointer.x - firstPointer.x,
      secondPointer.y - firstPointer.y
    ));

    pinchGesture = {
      slide,
      stage,
      card,
      pointerIds: [firstPointerId, secondPointerId],
      startDistance,
      startScale: scale,
      startPanX: panX,
      startPanY: panY,
      startContentX: (midpointX - centerX - panX) / scale,
      startContentY: (midpointY - centerY - panY) / scale,
    };

    try {
      stage.setPointerCapture(firstPointerId);
      stage.setPointerCapture(secondPointerId);
    } catch {
      // Pointer capture is progressive enhancement; the stage still owns the events.
    }
  }

  function updatePinch(event) {
    if (!pinchGesture || !pinchGesture.pointerIds.includes(event.pointerId)) return;
    event.preventDefault();
    const current = touchPointers.get(event.pointerId);
    if (!current) return;
    touchPointers.set(event.pointerId, { ...current, x: event.clientX, y: event.clientY });

    const first = touchPointers.get(pinchGesture.pointerIds[0]);
    const second = touchPointers.get(pinchGesture.pointerIds[1]);
    if (!first || !second) return;

    const midpointX = (first.x + second.x) / 2 - pinchGesture.stage.getBoundingClientRect().left;
    const midpointY = (first.y + second.y) / 2 - pinchGesture.stage.getBoundingClientRect().top;
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const scale = Math.min(2.5, Math.max(1, pinchGesture.startScale * distance / pinchGesture.startDistance));

    if (scale <= 1.01) {
      setZoomState(pinchGesture.slide, 1, 0, 0);
      pinchGesture.card.classList.add('is-zooming');
      return;
    }

    // Keep the sleeve artwork point that began beneath the fingers beneath
    // their moving midpoint, then clamp the pan to the enlarged square face.
    const bounds = pinchGesture.stage.getBoundingClientRect();
    const panX = clampZoomPan(
      midpointX - bounds.width / 2 - scale * pinchGesture.startContentX,
      scale,
      Math.max(1, pinchGesture.card.clientWidth)
    );
    const panY = clampZoomPan(
      midpointY - bounds.height / 2 - scale * pinchGesture.startContentY,
      scale,
      Math.max(1, pinchGesture.card.clientHeight)
    );
    setZoomState(pinchGesture.slide, scale, panX, panY);
    pinchGesture.card.classList.add('is-zooming');
  }

  function finishPinch(event) {
    if (!pinchGesture || !pinchGesture.pointerIds.includes(event.pointerId)) return false;
    const completed = pinchGesture;
    pinchGesture = null;
    completed.stage.classList.remove('is-gesture-active');
    completed.card.classList.remove('is-zooming');

    // The other finger may still be resting on the sleeve after the first
    // finger lifts. Keep tracking it and do not start the idle timer yet.
    const otherPointersStillDown = completed.pointerIds.some((pointerId) =>
      pointerId !== event.pointerId && touchPointers.get(pointerId)?.stage === completed.stage
    );
    finishTrackedTouchPointer(event.pointerId);
    try {
      if (completed.stage.hasPointerCapture(event.pointerId)) {
        completed.stage.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released this pointer.
    }

    if (otherPointersStillDown) {
      zoomIdleAfterTouchSlide = completed.slide;
      clearZoomIdleTimer();
    } else {
      zoomIdleAfterTouchSlide = null;
      scheduleZoomReset(completed.slide);
    }
    return true;
  }

  function resetAllZoom() {
    clearZoomIdleTimer();
    clearZoomResetTimer();
    zoomIdleAfterTouchSlide = null;
    if (pinchGesture) {
      const activePinch = pinchGesture;
      pinchGesture = null;
      activePinch.card.classList.remove('is-zooming', 'is-zoom-resetting');
      activePinch.stage.classList.remove('is-gesture-active');
    }
    touchPointers.forEach((pointer, pointerId) => {
      try {
        if (pointer.stage.hasPointerCapture(pointerId)) {
          pointer.stage.releasePointerCapture(pointerId);
        }
      } catch {
        // The page may already have released this pointer during lifecycle cleanup.
      }
    });
    touchPointers.clear();
    slides.forEach((slide) => resetZoom(slide, false));
  }

  function toggleFlip(slide) {
    flushPendingFlipSettle();
    const card = slide.querySelector('[data-dig-sleeve-card]');
    if (!card) return;
    setFlipState(slide, digState.nextFlipState(card.classList.contains('is-flipped')));
    scheduleZoomReset(slide);
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
      slide.style.opacity = '';
      slide.style.visibility = '';
      clearMetadataOverrides(slide);
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
    flushPendingFlipSettle();
    resetAllZoom();

    const previous = slides[activeIndex];
    const next = slides[targetIndex];
    const reducedMotion = motionPreference.matches;
    const previousStage = previous.querySelector('.dig-sleeve-interaction');
    const nextStage = next.querySelector('.dig-sleeve-interaction');
    const nextHasDragPose = Boolean(nextStage && nextStage.style.transform);
    window.clearTimeout(transitionTimer);
    window.clearTimeout(cancelGestureTimer);
    cancelGestureTimer = 0;
    isTransitioning = true;
    updateNavigation();

    if (!reducedMotion && !nextHasDragPose) {
      if (nextStage) {
        const originalTransition = nextStage.style.transition;
        nextStage.style.transition = 'none';
        nextStage.style.transform = direction > 0
          ? 'translate3d(0, 84%, -155px) rotateX(-76deg)'
          : 'translate3d(0, -84%, -155px) rotateX(76deg)';
        void nextStage.offsetHeight;
        nextStage.style.transition = originalTransition;
      }
    }

    previous.classList.remove('is-dragging', 'is-active', 'is-next', 'is-previous');
    previous.classList.add(direction > 0 ? 'is-leaving-up' : 'is-leaving-down');
    previous.setAttribute('aria-hidden', 'true');
    previous.inert = true;

    next.classList.remove('is-next', 'is-previous', 'is-leaving-up', 'is-leaving-down', 'is-dragging');
    next.classList.add('is-active');
    next.setAttribute('aria-hidden', 'false');
    next.inert = false;

    // Capture both current card poses first. A pointer-driven release continues
    // from the exact drag position; button/keyboard navigation enters from depth.
    void previous.offsetHeight;
    void next.offsetHeight;
    if (previousStage) {
      previousStage.style.transform = '';
      previousStage.style.visibility = '';
    }
    previous.style.visibility = '';
    clearMetadataOverrides(previous);
    clearMetadataOverrides(next);

    if (nextHasDragPose || reducedMotion) {
      if (nextStage) nextStage.style.transform = '';
      next.style.visibility = '';
    } else {
      window.requestAnimationFrame(() => {
        if (isTransitioning && next.classList.contains('is-active')) {
          if (nextStage) nextStage.style.transform = '';
          next.style.visibility = '';
        }
      });
    }

    activeIndex = targetIndex;
    clearFlip(next);
    updateNavigation();

    const finish = () => {
      window.clearTimeout(transitionTimer);
      previous.classList.remove('is-leaving-up', 'is-leaving-down', 'is-dragging');
      if (previousStage) {
        previousStage.style.transform = '';
        previousStage.style.transition = '';
        previousStage.style.visibility = '';
      }
      previous.style.opacity = '';
      previous.style.visibility = '';
      clearFlip(previous);
      if (nextStage) {
        nextStage.style.transform = '';
        nextStage.style.transition = '';
        nextStage.style.visibility = '';
      }
      next.style.opacity = '';
      next.style.visibility = '';
      clearMetadataOverrides(previous);
      clearMetadataOverrides(next);
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
    const { slide, stage, neighbor, pointerId } = gesture;
    stage.classList.remove('is-gesture-active');
    slide.classList.remove('is-dragging');
    clearMetadataOverrides(slide);
    if (neighbor) {
      neighbor.classList.remove('is-dragging');
      clearMetadataOverrides(neighbor);
      neighbor.style.visibility = '';
      neighbor.style.opacity = '';
    }
    const sleeveCard = slide.querySelector('[data-dig-sleeve-card]');
    const movingStage = slide.querySelector('.dig-sleeve-interaction');
    if (sleeveCard) {
      sleeveCard.classList.remove('is-dragging');
      sleeveCard.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
      sleeveCard.style.transform = '';
    }
    if (movingStage) {
      movingStage.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
      movingStage.style.transform = '';
      movingStage.style.visibility = '';
    }
    slide.style.opacity = '';
    slide.style.visibility = '';
    if (neighbor) {
      const neighborStage = neighbor.querySelector('.dig-sleeve-interaction');
      if (neighborStage) {
        neighborStage.style.transition = motionPreference.matches ? 'none' : 'transform 200ms ease-out';
        neighborStage.style.transform = '';
        neighborStage.style.visibility = '';
      }
      neighbor.style.transition = '';
      neighbor.style.visibility = '';
      neighbor.style.opacity = '';
    }
    try {
      if (stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released the pointer after pointercancel.
    }
    gesture = null;
    window.clearTimeout(cancelGestureTimer);
    cancelGestureTimer = window.setTimeout(() => {
      slide.style.transition = '';
      if (neighbor) neighbor.style.transition = '';
      paintSlides();
      cancelGestureTimer = 0;
    }, motionPreference.matches ? 0 : 220);
  }

  function handlePointerDown(event) {
    const stage = event.currentTarget;
    if (isTransitioning) return;
    const pointer = { stage, x: event.clientX, y: event.clientY };

    if (pinchGesture) {
      if (event.pointerType === 'touch') touchPointers.set(event.pointerId, pointer);
      return;
    }

    if (event.pointerType === 'touch') {
      const firstTouch = Array.from(touchPointers.entries()).find(([pointerId, value]) =>
        pointerId !== event.pointerId && value.stage === stage
      );

      const activeSlide = slides[activeIndex];
      const stageBelongsToActiveSlide = Boolean(
        activeSlide && activeSlide.querySelector('[data-dig-swipe-area]') === stage
      );
      const canResumePinch = Boolean(
        firstTouch &&
        activeSlide &&
        zoomIdleAfterTouchSlide === activeSlide &&
        firstTouch[1].stage === stage
      );
      const canStartPinch = Boolean(
        firstTouch &&
        stageBelongsToActiveSlide &&
        (!gesture || gesture.stage === stage) &&
        ((gesture && gesture.stage === stage) || canResumePinch || !gesture)
      );

      if (canStartPinch) {
        touchPointers.set(event.pointerId, pointer);
        startPinch(
          activeSlide,
          stage,
          firstTouch[1],
          pointer,
          firstTouch[0],
          event.pointerId
        );
        event.preventDefault();
        return;
      }

      touchPointers.set(event.pointerId, pointer);
    }

    // Keep non-primary contacts scoped to their stage. They may be the first
    // of two touches that can form a pinch even without a one-finger gesture.
    if (gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    flushPendingFlipSettle();

    // A previous cancelled gesture may still have a delayed paintSlides reset queued.
    // Cancel it before a new drag starts so it cannot snap the sleeve back mid-gesture.
    if (cancelGestureTimer) {
      window.clearTimeout(cancelGestureTimer);
      cancelGestureTimer = 0;
    }

    const slide = slides[activeIndex];
    if (!slide || !stage.closest('[data-dig-slide]')?.classList.contains('is-active')) return;

    clearZoomIdleTimer();
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
    if (pinchGesture && pinchGesture.pointerIds.includes(event.pointerId)) {
      updatePinch(event);
      return;
    }
    if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
      const pointer = touchPointers.get(event.pointerId);
      touchPointers.set(event.pointerId, { ...pointer, x: event.clientX, y: event.clientY });
    }
    if (!gesture || gesture.pointerId !== event.pointerId || isTransitioning) return;
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
      const previousNeighborStage = gesture.neighbor.querySelector('.dig-sleeve-interaction');
      if (previousNeighborStage) {
        previousNeighborStage.style.transform = '';
        previousNeighborStage.style.transition = '';
        previousNeighborStage.style.visibility = '';
      }
      gesture.neighbor.style.transition = '';
      gesture.neighbor.style.visibility = '';
      gesture.neighbor.style.opacity = '';
      clearMetadataOverrides(gesture.neighbor);
    }
    gesture.neighborIndex = targetIndex;
    gesture.neighbor = neighbor || null;

    gesture.slide.classList.add('is-dragging');
    const progressValue = Math.min(Math.abs(deltaY) / gesture.height, 1);
    if (motionPreference.matches) return;
    const softenedDelta = neighbor ? deltaY : deltaY * 0.22;
    const effectProgress = neighbor ? progressValue : progressValue * 0.22;
    const depth = -effectProgress * 150;
    // The card starts face-on; as it is drawn up/down, it tips toward the
    // horizontal deck plane and recedes in Z. Perspective creates the depth.
    const rotation = direction > 0 ? effectProgress * 78 : -effectProgress * 78;
    const movingStage = gesture.slide.querySelector('.dig-sleeve-interaction');
    if (movingStage) {
      movingStage.style.transform = `translate3d(0, ${softenedDelta}px, ${depth}px) rotateX(${rotation}deg)`;
    }

    const outgoingMetadataOpacity = String(Math.max(0, 1 - effectProgress * 1.12));
    ['.dig-listing-meta', '.dig-card-actions'].forEach((selector) => {
      const element = gesture.slide.querySelector(selector);
      if (element) element.style.opacity = outgoingMetadataOpacity;
    });

    if (neighbor) {
      neighbor.classList.add('is-dragging');
      neighbor.style.visibility = 'visible';
      neighbor.style.opacity = '1';
      const neighborDepth = 155 * (1 - progressValue);
      const offset = direction > 0
        ? 18 + (1 - progressValue) * gesture.height * 0.3
        : -18 - (1 - progressValue) * gesture.height * 0.3;
      const neighborRotation = direction > 0
        ? -76 * (1 - progressValue)
        : 76 * (1 - progressValue);
      const neighborStage = neighbor.querySelector('.dig-sleeve-interaction');
      if (neighborStage) {
        neighborStage.style.transform = `translate3d(0, ${offset}px, -${neighborDepth}px) rotateX(${neighborRotation}deg)`;
      }
      const incomingMetadataOpacity = String(Math.min(1, progressValue * 1.25));
      ['.dig-listing-meta', '.dig-card-actions'].forEach((selector) => {
        const element = neighbor.querySelector(selector);
        if (element) element.style.opacity = incomingMetadataOpacity;
      });
    }
  }

  function handlePointerUp(event) {
    if (finishPinch(event)) return;
    finishTrackedTouchPointer(event.pointerId);
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
          scheduleZoomReset(slide);
          if (shouldFlip && event.pointerType === 'touch') requestDigHapticPulse();
          return;
        }

        card.style.transition = 'transform 260ms cubic-bezier(.2, .75, .25, 1)';
        card.style.transform = draggedTransform;
        void card.offsetHeight;
        const angles = digState.flipSwipeAngles(wasFlipped, deltaX, shouldFlip);
        if (shouldFlip) setFlipState(slide, !wasFlipped);
        card.style.transform = 'rotateY(' + angles.animationAngle + 'deg)';
        scheduleZoomReset(slide);
        if (shouldFlip && event.pointerType === 'touch') requestDigHapticPulse();

        if (flipSettleTimer) window.clearTimeout(flipSettleTimer);
        const pending = { card, restingAngle: angles.restingAngle };
        pendingFlipSettle = pending;
        // The fallback is deliberately longer than the 260ms transition. A
        // stale callback must not clear or settle a newer flip's pending pose.
        flipSettleTimer = window.setTimeout(() => {
          finishPendingFlipSettle(pending);
        }, 360);
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
      if (event.pointerType === 'touch') requestDigHapticPulse();
      return;
    }

    clearDragStyles();
    scheduleZoomReset(slide);
  }

  function handleKeyboardZoom(event) {
    const slide = slides[activeIndex];
    if (!slide) return false;

    const { scale, panX, panY } = getZoomState(slide);
    let nextScale = scale;
    let nextPanX = panX;
    let nextPanY = panY;
    const panStep = 32;

    if (event.key === '+' || event.key === '=') {
      nextScale = Math.min(2.5, scale + 0.25);
    } else if (event.key === '-') {
      if (scale <= 1.01) return false;
      nextScale = Math.max(1, scale - 0.25);
    } else if (event.key === '0') {
      if (scale <= 1.01) return false;
      event.preventDefault();
      resetZoom(slide, true);
      return true;
    } else if (scale > 1.01 && event.key.startsWith('Arrow')) {
      const card = slide.querySelector('[data-dig-sleeve-card]');
      if (!card) return false;
      if (event.key === 'ArrowLeft') nextPanX -= panStep;
      else if (event.key === 'ArrowRight') nextPanX += panStep;
      else if (event.key === 'ArrowUp') nextPanY -= panStep;
      else if (event.key === 'ArrowDown') nextPanY += panStep;
      else return false;

      nextPanX = clampZoomPan(nextPanX, scale, Math.max(1, card.clientWidth));
      nextPanY = clampZoomPan(nextPanY, scale, Math.max(1, card.clientHeight));
      nextScale = scale;
    } else {
      return false;
    }

    event.preventDefault();
    setZoomState(slide, nextScale, nextPanX, nextPanY);
    scheduleZoomReset(slide);
    return true;
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
        if (finishPinch(event)) return;
        finishTrackedTouchPointer(event.pointerId);
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const cancelledSlide = gesture.slide;
        stage.classList.remove('is-gesture-active');
        clearDragStyles();
        scheduleZoomReset(cancelledSlide);
      });
      stage.addEventListener('lostpointercapture', (event) => {
        if (pinchGesture && finishPinch(event)) return;
        finishTrackedTouchPointer(event.pointerId);
        if (gesture && event.pointerId === gesture.pointerId) {
          const cancelledSlide = gesture.slide;
          clearDragStyles();
          scheduleZoomReset(cancelledSlide);
        }
      });
    }
  });

  if (previousButton) previousButton.addEventListener('click', () => navigateTo(activeIndex - 1, -1));
  if (nextButton) nextButton.addEventListener('click', () => navigateTo(activeIndex + 1, 1));

  viewer.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea, summary')) return;
    if (handleKeyboardZoom(event)) return;

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') resetAllZoom();
  });
  window.addEventListener('pagehide', () => {
    resetAllZoom();
    touchPointers.clear();
  });

  setReducedMotion();
  paintSlides();
})();
