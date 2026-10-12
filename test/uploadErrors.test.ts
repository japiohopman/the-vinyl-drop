import request from 'supertest';
import express, { Request, Response } from 'express';
import { multipartUploadHandler } from '../src/app/middleware/upload';
import { errorHandler } from '../src/app/middleware/errorHandler';

describe('Listing Photo Upload Error Handling', () => {
  let app: express.Express;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.post('/upload', multipartUploadHandler, (_req: Request, res: Response) => {
      res.status(200).send('Upload succeeded');
    });

    app.post('/unexpected-error', (_req: Request, _res: Response) => {
      throw new Error('Database connection failed');
    });

    app.use(errorHandler);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should return 400 Bad Request and user-friendly error message when file exceeds 5MB limit', async () => {
    // Generate buffer exceeding 5 MB (5 * 1024 * 1024 + 1024 bytes)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 'a');

    const response = await request(app)
      .post('/upload')
      .set('Accept', 'text/html')
      .attach('photo', oversizedBuffer, {
        filename: 'large_photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain('400 - Bad Request');
    expect(response.text).toContain('File upload size exceeds maximum limit of 5MB');
    expect(response.text).not.toContain('500 - Server Error');
  });

  it('should return 400 Bad Request when header content-type specifies invalid/malformed boundary', async () => {
    const response = await request(app)
      .post('/upload')
      .set('Accept', 'text/html')
      .set('Content-Type', 'multipart/form-data; boundary=')
      .send('invalid body stream');

    expect(response.status).toBe(400);
    expect(response.text).toContain('400 - Bad Request');
    expect(response.text).toContain('Malformed multipart upload request.');
    expect(response.text).not.toContain('Unexpected end of multipart data');
    expect(response.text).not.toContain('500 - Server Error');
  });

  it('should return 500 Server Error for unexpected internal failures', async () => {
    const response = await request(app)
      .post('/unexpected-error')
      .set('Accept', 'text/html');

    expect(response.status).toBe(500);
    expect(response.text).toContain('500 - Server Error');
    expect(response.text).toContain('Something went wrong on our end');
  });
});
