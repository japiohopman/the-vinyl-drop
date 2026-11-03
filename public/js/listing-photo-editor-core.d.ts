export interface PhotoEditorCorner {
  x: number;
  y: number;
}

export interface PhotoEditorImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface PhotoEditorAdjustments {
  exposure?: number;
  blackPoint?: number;
  shadows?: number;
  contrast?: number;
  highlights?: number;
  whitePoint?: number;
  gamma?: number;
  temperature?: number;
  tint?: number;
  saturation?: number;
}

declare const photoEditorCore: {
  readonly DEFAULT_ADJUSTMENTS: Readonly<Required<PhotoEditorAdjustments>>;
  createDefaultCorners(width: number, height: number): PhotoEditorCorner[];
  isValidQuad(points: PhotoEditorCorner[], width: number, height: number): boolean;
  computeHomography(points: PhotoEditorCorner[], outputWidth: number, outputHeight: number): number[];
  rectifyImageData(
    source: PhotoEditorImageData,
    points: PhotoEditorCorner[],
    outputWidth: number,
    outputHeight: number,
    adjustments?: PhotoEditorAdjustments
  ): PhotoEditorImageData;
};

export = photoEditorCore;
