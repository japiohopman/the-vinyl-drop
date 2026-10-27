(function attachDigState(root) {
  const state = Object.freeze({
    isValidIndex(index, total) {
      return Number.isInteger(index) && Number.isInteger(total) && total > 0 && index >= 0 && index < total;
    },

    adjacentIndex(currentIndex, total, direction) {
      if (!Number.isInteger(direction) || Math.abs(direction) !== 1) return null;
      const candidate = currentIndex + direction;
      return this.isValidIndex(candidate, total) ? candidate : null;
    },

    shouldCommitSwipe(deltaY, threshold, targetIndex, total, isHorizontal) {
      return !isHorizontal
        && Number.isFinite(deltaY)
        && Number.isFinite(threshold)
        && Math.abs(deltaY) >= threshold
        && this.isValidIndex(targetIndex, total);
    },

    nextFlipState(isFlipped) {
      return !Boolean(isFlipped);
    },

    flipSwipeAngles(wasFlipped, deltaX, shouldFlip) {
      const currentlyFlipped = Boolean(wasFlipped);
      const endsFlipped = shouldFlip ? !currentlyFlipped : currentlyFlipped;
      const restingAngle = endsFlipped ? 180 : 0;
      let animationAngle = restingAngle;

      if (shouldFlip) {
        animationAngle = currentlyFlipped
          ? (deltaX > 0 ? 360 : 0)
          : (deltaX > 0 ? 180 : -180);
      }

      return { animationAngle, restingAngle };
    },
  });

  if (typeof module === 'object' && module.exports) {
    module.exports = state;
  }
  if (root) {
    root.DigModeState = state;
  }
})(typeof window !== 'undefined' ? window : null);
