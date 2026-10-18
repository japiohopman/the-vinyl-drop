declare const digState: {
  isValidIndex(index: number, total: number): boolean;
  adjacentIndex(currentIndex: number, total: number, direction: number): number | null;
  shouldCommitSwipe(deltaY: number, threshold: number, targetIndex: number, total: number, isHorizontal: boolean): boolean;
  nextFlipState(isFlipped: boolean): boolean;
};

export = digState;
