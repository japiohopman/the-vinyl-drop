import sharp from 'sharp';

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number;
  height: number;
}

export const MAX_IMAGE_DIMENSION = 2048;
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

    const detectedMime = `image/${metadata.format}`;
    if (originalMimeType && !ALLOWED_MIME_TYPES.includes(originalMimeType.toLowerCase())) {
      throw new Error(`File type '${originalMimeType}' is not an allowed image format (JPEG, PNG, WebP)`);
    }

    if (!ALLOWED_MIME_TYPES.includes(detectedMime.toLowerCase())) {
      throw new Error(`Detected image format '${detectedMime}' is not allowed`);
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
    if (err instanceof Error && err.message.includes('not allowed')) {
      throw err;
    }
    throw new Error(`Image processing failed: ${(err as Error).message}`);
  }
}
