export interface ListingPhotoEditorCorner {
  x: number;
  y: number;
}

export interface ListingPhotoEditorAdjustments {
  exposure: number;
  blackPoint: number;
  shadows: number;
  contrast: number;
  highlights: number;
  whitePoint: number;
  gamma: number;
  temperature: number;
  tint: number;
  saturation: number;
}

export interface ListingPhotoEditorState {
  version: 1;
  sourceWidth: number;
  sourceHeight: number;
  corners: [
    ListingPhotoEditorCorner,
    ListingPhotoEditorCorner,
    ListingPhotoEditorCorner,
    ListingPhotoEditorCorner
  ];
  adjustments: ListingPhotoEditorAdjustments;
}
