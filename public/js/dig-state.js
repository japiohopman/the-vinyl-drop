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

    nextFlipState(isFlipped) {
      return !Boolean(isFlipped);
    },

  });

  if (typeof module === 'object' && module.exports) {
    module.exports = state;
  }
  if (root) {
    root.DigModeState = state;
  }
})(typeof window !== 'undefined' ? window : null);
