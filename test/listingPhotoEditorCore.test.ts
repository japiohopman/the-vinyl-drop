import photoEditorCore from '../public/js/listing-photo-editor-core.js';

function createGradientImage(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = x * 50;
      data[index + 1] = y * 50;
      data[index + 2] = 100;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function createSolidImage(width: number, height: number, value: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

describe('Listing photo editor pixel core', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('creates four inset, ordered corners for a new sleeve photo', () => {
    const points = photoEditorCore.createDefaultCorners(300, 500);

    expect(points).toHaveLength(4);
    expect(points[0].x).toBeLessThan(points[1].x);
    expect(points[0].y).toBe(points[1].y);
    expect(points[2].x).toBe(points[1].x);
    expect(points[2].y).toBeGreaterThan(points[1].y);
    expect(photoEditorCore.isValidQuad(points, 300, 500)).toBe(true);
  });

  it('accepts a convex four-corner sleeve and rejects a crossing shape', () => {
    expect(photoEditorCore.isValidQuad(square, 4, 4)).toBe(true);
    expect(photoEditorCore.isValidQuad([
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ], 4, 4)).toBe(false);
  });

  it('maps a rectangular selection through an identity homography', () => {
    const transform = photoEditorCore.computeHomography(square, 4, 4);

    expect(transform[0]).toBeCloseTo(1, 8);
    expect(transform[1]).toBeCloseTo(0, 8);
    expect(transform[2]).toBeCloseTo(0, 8);
    expect(transform[3]).toBeCloseTo(0, 8);
    expect(transform[4]).toBeCloseTo(1, 8);
    expect(transform[5]).toBeCloseTo(0, 8);
    expect(transform[6]).toBeCloseTo(0, 8);
    expect(transform[7]).toBeCloseTo(0, 8);
  });

  it('keeps neutral pixel adjustments unchanged for an unskewed source', () => {
    const source = createGradientImage(4, 4);
    const result = photoEditorCore.rectifyImageData(source, square, 4, 4);

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(Array.from(result.data)).toEqual(Array.from(source.data));
  });

  it('rectifies a skewed sleeve into a square pixel output', () => {
    const source = createGradientImage(4, 4);
    const skewed = [
      { x: 1, y: 0 },
      { x: 4, y: 1 },
      { x: 3.5, y: 4 },
      { x: 0, y: 3 },
    ];
    const result = photoEditorCore.rectifyImageData(source, skewed, 8, 8);

    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
    expect(result.data).toHaveLength(8 * 8 * 4);
    expect(Array.from(result.data).filter((value) => value !== 255).length).toBeGreaterThan(0);
    for (let index = 3; index < result.data.length; index += 4) {
      expect(result.data[index]).toBe(255);
    }
  });

  it('applies exposure to saved pixel values rather than preview styling', () => {
    const source = createSolidImage(4, 4, 80);
    const neutral = photoEditorCore.rectifyImageData(source, square, 4, 4);
    const brighter = photoEditorCore.rectifyImageData(source, square, 4, 4, { exposure: 1 });

    expect(neutral.data[0]).toBe(80);
    expect(brighter.data[0]).toBe(160);
    expect(brighter.data[1]).toBe(160);
    expect(brighter.data[2]).toBe(160);
  });

  it('lifts shadow detail independently from a neutral black point', () => {
    const source = createSolidImage(4, 4, 60);
    const neutral = photoEditorCore.rectifyImageData(source, square, 4, 4);
    const lifted = photoEditorCore.rectifyImageData(source, square, 4, 4, { shadows: 100 });

    expect(neutral.data[0]).toBe(60);
    expect(lifted.data[0]).toBeGreaterThan(neutral.data[0]);
    expect(lifted.data[0]).toBeLessThan(255);
  });

  it('rejects malformed image buffers and output dimensions above the pixel budget', () => {
    expect(() => photoEditorCore.rectifyImageData(
      { data: new Uint8ClampedArray(3), width: 1, height: 1 },
      square,
      4,
      4
    )).toThrow('valid RGBA source image');

    expect(() => photoEditorCore.rectifyImageData(
      createSolidImage(4, 4, 80),
      square,
      2049,
      2049
    )).toThrow('output dimensions');
  });
});
