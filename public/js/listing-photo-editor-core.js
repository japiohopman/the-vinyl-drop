(function exposePhotoEditorCore(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.TVDPhotoEditorCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPhotoEditorCore() {
  const DEFAULT_ADJUSTMENTS = Object.freeze({
    exposure: 0,
    blackPoint: 0,
    shadows: 0,
    contrast: 0,
    highlights: 0,
    whitePoint: 255,
    gamma: 1,
    temperature: 0,
    tint: 0,
    saturation: 0,
  });

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function createDefaultCorners(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
      throw new RangeError('Image dimensions must be at least 2 × 2 pixels.');
    }

    const insetX = Math.max(2, width * 0.045);
    const insetY = Math.max(2, height * 0.045);

    return [
      { x: insetX, y: insetY },
      { x: width - insetX, y: insetY },
      { x: width - insetX, y: height - insetY },
      { x: insetX, y: height - insetY },
    ];
  }

  function isValidQuad(points, width, height) {
    if (!Array.isArray(points) || points.length !== 4 ||
        !Number.isFinite(width) || !Number.isFinite(height) ||
        width < 2 || height < 2) {
      return false;
    }

    for (const point of points) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
        return false;
      }
    }

    let direction = 0;
    let twiceArea = 0;

    for (let index = 0; index < 4; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % 4];
      const afterNext = points[(index + 2) % 4];
      const cross = (next.x - current.x) * (afterNext.y - next.y) -
        (next.y - current.y) * (afterNext.x - next.x);

      if (Math.abs(cross) < 0.01) return false;
      const currentDirection = Math.sign(cross);
      if (direction !== 0 && currentDirection !== direction) return false;
      direction = currentDirection;
      twiceArea += current.x * next.y - next.x * current.y;
    }

    return Math.abs(twiceArea) >= width * height * 0.02;
  }

  function solveLinearSystem(matrix, values) {
    const size = values.length;
    const rows = matrix.map((row, index) => row.slice().concat(values[index]));

    for (let column = 0; column < size; column += 1) {
      let pivotRow = column;
      let pivotMagnitude = Math.abs(rows[column][column]);

      for (let candidate = column + 1; candidate < size; candidate += 1) {
        const magnitude = Math.abs(rows[candidate][column]);
        if (magnitude > pivotMagnitude) {
          pivotMagnitude = magnitude;
          pivotRow = candidate;
        }
      }

      if (pivotMagnitude < 1e-10) {
        throw new RangeError('The selected sleeve corners do not form a usable perspective.');
      }

      if (pivotRow !== column) {
        const swap = rows[column];
        rows[column] = rows[pivotRow];
        rows[pivotRow] = swap;
      }

      const pivot = rows[column][column];
      for (let entry = column; entry <= size; entry += 1) {
        rows[column][entry] /= pivot;
      }

      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = rows[row][column];
        if (factor === 0) continue;
        for (let entry = column; entry <= size; entry += 1) {
          rows[row][entry] -= factor * rows[column][entry];
        }
      }
    }

    return rows.map((row) => row[size]);
  }

  /**
   * Returns a destination-to-source homography. Each point in the output
   * rectangle is mapped back into the selected source quadrilateral.
   */
  function computeHomography(points, outputWidth, outputHeight) {
    if (!Array.isArray(points) || points.length !== 4 ||
        !Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) ||
        outputWidth < 2 || outputHeight < 2) {
      throw new TypeError('Four source corners and valid output dimensions are required.');
    }

    const destinations = [
      { x: 0, y: 0 },
      { x: outputWidth, y: 0 },
      { x: outputWidth, y: outputHeight },
      { x: 0, y: outputHeight },
    ];
    const matrix = [];
    const values = [];

    for (let index = 0; index < 4; index += 1) {
      const destination = destinations[index];
      const source = points[index];
      const x = Number(source.x);
      const y = Number(source.y);
      const u = destination.x;
      const v = destination.y;

      matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
      values.push(x);
      matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
      values.push(y);
    }

    return solveLinearSystem(matrix, values);
  }

  function normalizedAdjustments(input) {
    const values = { ...DEFAULT_ADJUSTMENTS, ...(input || {}) };
    return {
      exposure: clamp(Number(values.exposure) || 0, -2, 2),
      blackPoint: clamp(Number(values.blackPoint) || 0, 0, 80),
      shadows: clamp(Number(values.shadows) || 0, -100, 100),
      contrast: clamp(Number(values.contrast) || 0, -100, 100),
      highlights: clamp(Number(values.highlights) || 0, -100, 100),
      whitePoint: clamp(Number(values.whitePoint) || 255, 160, 255),
      gamma: clamp(Number(values.gamma) || 1, 0.5, 2),
      temperature: clamp(Number(values.temperature) || 0, -100, 100),
      tint: clamp(Number(values.tint) || 0, -100, 100),
      saturation: clamp(Number(values.saturation) || 0, -100, 100),
    };
  }

  function rectifyImageData(source, points, outputWidth, outputHeight, adjustments) {
    if (!source || !source.data || !Number.isInteger(source.width) ||
        !Number.isInteger(source.height) ||
        source.data.length !== source.width * source.height * 4) {
      throw new TypeError('A valid RGBA source image is required.');
    }
    if (!isValidQuad(points, source.width, source.height)) {
      throw new RangeError('Move the four corners so they form a complete sleeve shape.');
    }
    if (!Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) ||
        outputWidth < 2 || outputHeight < 2 ||
        outputWidth * outputHeight > 4_194_304) {
      throw new RangeError('The requested output dimensions are not supported.');
    }

    const transform = computeHomography(points, outputWidth, outputHeight);
    const [h0, h1, h2, h3, h4, h5, h6, h7] = transform;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const sourceData = source.data;
    const outputData = new Uint8ClampedArray(outputWidth * outputHeight * 4);
    const tone = normalizedAdjustments(adjustments);
    const contrast = (259 * (tone.contrast + 255)) / (255 * (259 - tone.contrast));
    const exposure = Math.pow(2, tone.exposure);
    const range = Math.max(1, tone.whitePoint - tone.blackPoint);
    const saturation = 1 + tone.saturation / 100;

    for (let outputY = 0; outputY < outputHeight; outputY += 1) {
      const v = outputY + 0.5;
      for (let outputX = 0; outputX < outputWidth; outputX += 1) {
        const u = outputX + 0.5;
        const denominator = h6 * u + h7 * v + 1;
        const destinationIndex = (outputY * outputWidth + outputX) * 4;

        if (Math.abs(denominator) < 1e-10) {
          outputData[destinationIndex] = 255;
          outputData[destinationIndex + 1] = 255;
          outputData[destinationIndex + 2] = 255;
          outputData[destinationIndex + 3] = 255;
          continue;
        }

        const sourceX = (h0 * u + h1 * v + h2) / denominator;
        const sourceY = (h3 * u + h4 * v + h5) / denominator;

        if (sourceX < 0 || sourceY < 0 ||
            sourceX > sourceWidth - 1 || sourceY > sourceHeight - 1) {
          outputData[destinationIndex] = 255;
          outputData[destinationIndex + 1] = 255;
          outputData[destinationIndex + 2] = 255;
          outputData[destinationIndex + 3] = 255;
          continue;
        }

        // ImageData pixels occupy unit squares; sample around their centres.
        // Subtracting 0.5 prevents an identity transform from blending neighbours.
        const sampleX = clamp(sourceX - 0.5, 0, sourceWidth - 1);
        const sampleY = clamp(sourceY - 0.5, 0, sourceHeight - 1);
        const x0 = Math.floor(sampleX);
        const y0 = Math.floor(sampleY);
        const x1 = Math.min(sourceWidth - 1, x0 + 1);
        const y1 = Math.min(sourceHeight - 1, y0 + 1);
        const xWeight = sampleX - x0;
        const yWeight = sampleY - y0;
        const topLeft = (y0 * sourceWidth + x0) * 4;
        const topRight = (y0 * sourceWidth + x1) * 4;
        const bottomLeft = (y1 * sourceWidth + x0) * 4;
        const bottomRight = (y1 * sourceWidth + x1) * 4;

        let red = bilinear(sourceData, topLeft, topRight, bottomLeft, bottomRight, 0, xWeight, yWeight);
        let green = bilinear(sourceData, topLeft, topRight, bottomLeft, bottomRight, 1, xWeight, yWeight);
        let blue = bilinear(sourceData, topLeft, topRight, bottomLeft, bottomRight, 2, xWeight, yWeight);

        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const shadowMask = Math.pow(1 - luminance / 255, 2);
        const highlightMask = Math.pow(luminance / 255, 2);

        red = ((red - tone.blackPoint) / range) * 255;
        green = ((green - tone.blackPoint) / range) * 255;
        blue = ((blue - tone.blackPoint) / range) * 255;

        red = ((red - 128) * contrast + 128) * exposure;
        green = ((green - 128) * contrast + 128) * exposure;
        blue = ((blue - 128) * contrast + 128) * exposure;

        red += tone.shadows * 0.7 * shadowMask + tone.highlights * 0.55 * highlightMask;
        green += tone.shadows * 0.7 * shadowMask + tone.highlights * 0.55 * highlightMask;
        blue += tone.shadows * 0.7 * shadowMask + tone.highlights * 0.55 * highlightMask;

        red = 255 * Math.pow(clamp(red, 0, 255) / 255, 1 / tone.gamma);
        green = 255 * Math.pow(clamp(green, 0, 255) / 255, 1 / tone.gamma);
        blue = 255 * Math.pow(clamp(blue, 0, 255) / 255, 1 / tone.gamma);

        red += tone.temperature * 0.28;
        blue -= tone.temperature * 0.28;
        green += tone.tint * 0.22;

        const adjustedLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        red = adjustedLuminance + (red - adjustedLuminance) * saturation;
        green = adjustedLuminance + (green - adjustedLuminance) * saturation;
        blue = adjustedLuminance + (blue - adjustedLuminance) * saturation;

        outputData[destinationIndex] = clamp(red, 0, 255);
        outputData[destinationIndex + 1] = clamp(green, 0, 255);
        outputData[destinationIndex + 2] = clamp(blue, 0, 255);
        outputData[destinationIndex + 3] = 255;
      }
    }

    return { data: outputData, width: outputWidth, height: outputHeight };
  }

  function bilinear(data, topLeft, topRight, bottomLeft, bottomRight, channel, xWeight, yWeight) {
    const top = data[topLeft + channel] * (1 - xWeight) + data[topRight + channel] * xWeight;
    const bottom = data[bottomLeft + channel] * (1 - xWeight) + data[bottomRight + channel] * xWeight;
    return top * (1 - yWeight) + bottom * yWeight;
  }

  return Object.freeze({
    DEFAULT_ADJUSTMENTS,
    createDefaultCorners,
    isValidQuad,
    computeHomography,
    rectifyImageData,
  });
}));
