declare const digState: {
  isValidIndex(index: number, total: number): boolean;
  adjacentIndex(currentIndex: number, total: number, direction: number): number | null;
  nextFlipState(isFlipped: boolean): boolean;
};

export = digState;
