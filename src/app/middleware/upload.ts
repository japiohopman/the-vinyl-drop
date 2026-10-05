import { Request, Response, NextFunction } from 'express';
import Busboy from '@fastify/busboy';

export interface UploadedFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      files?: UploadedFile[];
    }
  }
}

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTOS_PER_LISTING = 5;

/**
 * Express middleware that safely streams multipart/form-data using @fastify/busboy.
 * Enforces file size, file count, and populates req.body and req.files.
 */
export function multipartUploadHandler(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  let busboy: InstanceType<typeof Busboy>;
  try {
    busboy = new Busboy({
      headers: {
        ...req.headers,
        'content-type': contentType,
      },
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: MAX_PHOTOS_PER_LISTING,
      },
    });
  } catch (err) {
    return next(err);
  }

  const files: UploadedFile[] = [];
  const fields: Record<string, string | string[]> = {};
  let fileLimitExceeded = false;
  let hasError = false;

  busboy.on('field', (fieldname: string, val: string) => {
    if (fields[fieldname]) {
      if (Array.isArray(fields[fieldname])) {
        (fields[fieldname] as string[]).push(val);
      } else {
        fields[fieldname] = [fields[fieldname] as string, val];
      }
    } else {
      fields[fieldname] = val;
    }
  });

  busboy.on('file', (fieldname: string, fileStream: NodeJS.ReadableStream, filename: string, encoding: string, mimetype: string) => {
    const chunks: Buffer[] = [];
    let fileSizeBytes = 0;

    fileStream.on('data', (chunk: Buffer) => {
      fileSizeBytes += chunk.length;
      if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
        fileLimitExceeded = true;
        fileStream.resume(); // Drain stream
      } else {
        chunks.push(chunk);
      }
    });

    fileStream.on('limit', () => {
      fileLimitExceeded = true;
    });

    fileStream.on('end', () => {
      if (!fileLimitExceeded && filename && filename.trim().length > 0) {
        files.push({
          fieldname,
          filename,
          encoding,
          mimetype,
          buffer: Buffer.concat(chunks),
        });
      }
    });
  });

  busboy.on('finish', () => {
    if (hasError) return;

    if (fileLimitExceeded) {
      res.status(400);
      return next(new Error(`File upload size exceeds maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`));
    }

    req.body = { ...req.body, ...fields };
    req.files = files;
    next();
  });

  busboy.on('error', (err: Error) => {
    hasError = true;
    next(err);
  });

  req.pipe(busboy);
}
