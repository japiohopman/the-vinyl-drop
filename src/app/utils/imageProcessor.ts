import sharp from 'sharp';

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number;
  height: number;
}

export const MAX_IMAGE_DIMENSION = 2048;
export async function readImageDimensions(inputBuffer: Buffer): Promise<{ width: number; height: number }> {
  if (!inputBuffer || inputBuffer.length === 0) throw new Error('Image payload is empty');
  const metadata = await sharp(inputBuffer, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format ||
      !ALLOWED_FORMATS.includes(metadata.format.toLowerCase())) {
    throw new Error('Unsupported or unrecognized image format');
  }
  return { width: metadata.width, height: metadata.height };
}

export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Creates the private, lossless editing master. This is deliberately separate
 * from the public WebP derivative: strip EXIF/GPS data, honour orientation and
 * cap dimensions before retaining pixels for future browser-side edits.
 */
export async function preserveListingPhotoSource(
  inputBuffer: Buffer,
  originalMimeType?: string
): Promise<ProcessedImage> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error('Image payload is empty');
  }

  try {
    const pipeline = sharp(inputBuffer, { limitInputPixels: 40_000_000 });
    const metadata = await pipeline.metadata();
    if (!metadata.format) throw new Error('Unsupported or unrecognized image format');

    const detectedFormat = metadata.format.toLowerCase();
    if (!ALLOWED_FORMATS.includes(detectedFormat)) {
      throw new Error(`Detected image format '${detectedFormat}' is not an allowed image format (JPEG, PNG, WebP)`);
    }
    if (originalMimeType && !ALLOWED_MIME_TYPES.includes(originalMimeType.toLowerCase())) {
      throw new Error(`Client MIME type '${originalMimeType}' is not an allowed image format (JPEG, PNG, WebP)`);
    }

    const outputBuffer = await pipeline
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ lossless: true, effort: 4 })
      .toBuffer();

    if (outputBuffer.length > MAX_SOURCE_IMAGE_BYTES) {
      throw new Error('The private editing source exceeds the 20 MiB storage limit.');
    }

    const outputMetadata = await sharp(outputBuffer).metadata();
    if (outputMetadata.format !== 'webp' || !outputMetadata.width || !outputMetadata.height) {
      throw new Error('The private editing source could not be verified.');
    }

    return {
      buffer: outputBuffer,
      contentType: 'image/webp',
      extension: 'webp',
      width: outputMetadata.width,
      height: outputMetadata.height,
    };
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('not an allowed') ||
      err.message.includes('Image payload is empty') ||
      err.message.includes('20 MiB')
    )) throw err;
    throw new Error(`Image source preservation failed: ${(err as Error).message}`);
  }
}

export const ALLOWED_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function processAndValidateImage(
  inputBuffer: Buffer,
  originalMimeType?: string
): Promise<ProcessedImage> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error('Image payload is empty');
  }

  try {
    const pipeline = sharp(inputBuffer);
    const metadata = await pipeline.metadata();

    if (!metadata.format) {
      throw new Error('Unsupported or unrecognized image format');
    }

    const detectedFormat = metadata.format.toLowerCase();

    // Enforce strict server-side format verification (JPEG, PNG, WebP only)
    if (!ALLOWED_FORMATS.includes(detectedFormat)) {
      throw new Error(`Detected image format '${detectedFormat}' is not an allowed image format (JPEG, PNG, WebP)`);
    }

    if (originalMimeType && !ALLOWED_MIME_TYPES.includes(originalMimeType.toLowerCase())) {
      throw new Error(`Client MIME type '${originalMimeType}' is not an allowed image format (JPEG, PNG, WebP)`);
    }

    let imagePipeline = pipeline.rotate(); // Auto-rotate based on EXIF orientation

    // Resize if width or height exceeds maximum dimensions
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      imagePipeline = imagePipeline.resize({
        width: width > height ? MAX_IMAGE_DIMENSION : undefined,
        height: height >= width ? MAX_IMAGE_DIMENSION : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to WebP with 82% quality (sharp strips EXIF metadata by default during format conversion)
    const outputBuffer = await imagePipeline
      .webp({ quality: 82 })
      .toBuffer();

    const outputMetadata = await sharp(outputBuffer).metadata();

    return {
      buffer: outputBuffer,
      contentType: 'image/webp',
      extension: 'webp',
      width: outputMetadata.width || width,
      height: outputMetadata.height || height,
    };
  } catch (err) {
    if (err instanceof Error && (err.message.includes('not an allowed') || err.message.includes('Image payload is empty'))) {
      throw err;
    }
    throw new Error(`Image processing failed: ${(err as Error).message}`);
  }
}


export interface ProcessedProfileAvatar {
  buffer: Buffer;
  contentType: 'image/webp' | 'image/gif';
  extension: 'webp' | 'gif';
  width: number;
  height: number;
  animated: boolean;
  pages: number;
}

export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_PROFILE_AVATAR_DIMENSION = 512;
export const MAX_PROFILE_AVATAR_FRAMES = 30;
export const MAX_PROFILE_AVATAR_TOTAL_PIXELS = 32_000_000;

/**
 * Validate profile avatars independently from listing photos. GIF input is
 * decoded in animated mode and re-encoded as GIF, preserving frame delays,
 * transparency and looping. Static inputs become square transparent WebP
 * canvases with contain-fit so the source artwork is never cropped.
 */
export async function processProfileAvatar(
  inputBuffer: Buffer,
  originalMimeType?: string
): Promise<ProcessedProfileAvatar> {
  if (!inputBuffer || inputBuffer.length === 0) throw new Error('Profile avatar file is empty.');
  if (inputBuffer.length > MAX_PROFILE_AVATAR_BYTES) {
    throw new Error('Profile avatar must be 5 MiB or smaller.');
  }

  try {
    const preliminary = await sharp(inputBuffer, {
      limitInputPixels: MAX_PROFILE_AVATAR_TOTAL_PIXELS,
    }).metadata();
    const format = preliminary.format?.toLowerCase();
    const expectedMime: Record<string, string> = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    if (!format || !expectedMime[format]) {
      throw new Error('Only JPEG, PNG, WebP and GIF profile images are supported.');
    }
    if (originalMimeType && originalMimeType.toLowerCase() !== expectedMime[format]) {
      throw new Error('The selected file contents do not match the supplied image type.');
    }

    const animated = format === 'gif';
    const input = sharp(inputBuffer, {
      animated,
      limitInputPixels: MAX_PROFILE_AVATAR_TOTAL_PIXELS,
    });
    const metadata = await input.metadata();
    const pages = Math.max(1, metadata.pages || 1);
    const width = metadata.width || 0;
    const frameHeight = metadata.pageHeight || Math.floor((metadata.height || 0) / pages);
    const totalDecodedPixels = width * frameHeight * pages;

    if (!width || !frameHeight || totalDecodedPixels > MAX_PROFILE_AVATAR_TOTAL_PIXELS) {
      throw new Error('Profile avatar dimensions or total animation size exceed the safe processing limit.');
    }
    if (animated && pages > MAX_PROFILE_AVATAR_FRAMES) {
      throw new Error('Animated profile GIFs may contain at most ' + MAX_PROFILE_AVATAR_FRAMES + ' frames.');
    }

    let output: Buffer;
    if (animated) {
      const gifOptions: { loop?: number; delay?: number | number[]; keepDuplicateFrames?: boolean } = {
        // Do not let Sharp coalesce visually identical input frames and their independent delays.
        keepDuplicateFrames: true,
      };
      if (metadata.loop !== undefined) gifOptions.loop = metadata.loop;
      if (metadata.delay !== undefined) gifOptions.delay = metadata.delay;
      output = await input
        .resize({
          width: MAX_PROFILE_AVATAR_DIMENSION,
          height: MAX_PROFILE_AVATAR_DIMENSION,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .gif(gifOptions)
        .toBuffer();
    } else {
      output = await input
        .rotate()
        .resize({
          width: MAX_PROFILE_AVATAR_DIMENSION,
          height: MAX_PROFILE_AVATAR_DIMENSION,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
    }

    if (output.length > MAX_PROFILE_AVATAR_BYTES) {
      throw new Error('The processed profile avatar exceeds the 5 MiB storage limit.');
    }
    const outputMetadata = await sharp(output, { animated }).metadata();
    if (!outputMetadata.width || !outputMetadata.height) {
      throw new Error('The processed profile avatar could not be verified.');
    }
    if (animated) {
      const outputPages = outputMetadata.pages || 1;
      const outputFrameHeight = outputMetadata.pageHeight || Math.floor(outputMetadata.height / outputPages);
      const timingPreserved = metadata.delay === undefined ||
        JSON.stringify(outputMetadata.delay || []) === JSON.stringify(metadata.delay);
      const loopPreserved = metadata.loop === undefined
        ? outputMetadata.loop === undefined
        : outputMetadata.loop === metadata.loop;
      const transparencyPreserved = !metadata.hasAlpha || outputMetadata.hasAlpha === true;
      if (outputMetadata.format !== 'gif') {
        throw new Error('The animated GIF output format could not be preserved.');
      }
      if (outputPages !== pages) {
        throw new Error('The animated GIF frame count could not be preserved.');
      }
      if (!timingPreserved) {
        throw new Error('The animated GIF frame timing could not be preserved.');
      }
      if (!loopPreserved) {
        throw new Error('The animated GIF loop setting could not be preserved.');
      }
      if (!transparencyPreserved) {
        throw new Error('The animated GIF transparency could not be preserved.');
      }
      if (
        outputMetadata.width > MAX_PROFILE_AVATAR_DIMENSION ||
        outputFrameHeight > MAX_PROFILE_AVATAR_DIMENSION
      ) {
        throw new Error('The processed animated GIF exceeds the maximum avatar dimensions.');
      }
    }
    if (!animated && outputMetadata.format !== 'webp') {
      throw new Error('The static profile avatar could not be converted to WebP.');
    }

    return {
      buffer: output,
      contentType: animated ? 'image/gif' : 'image/webp',
      extension: animated ? 'gif' : 'webp',
      width: outputMetadata.width,
      height: animated
        ? (outputMetadata.pageHeight || Math.floor(outputMetadata.height / (outputMetadata.pages || 1)))
        : outputMetadata.height,
      animated,
      pages: outputMetadata.pages || 1,
    };
  } catch (error) {
    if (error instanceof Error && (
      error.message.startsWith('Only ') ||
      error.message.startsWith('The selected file') ||
      error.message.startsWith('Profile avatar') ||
      error.message.startsWith('Animated profile') ||
      error.message.startsWith('The processed profile avatar') ||
      error.message.startsWith('The animated GIF')
    )) throw error;
    throw new Error('Profile avatar processing failed. Use a valid JPEG, PNG, WebP or GIF file.');
  }
}
