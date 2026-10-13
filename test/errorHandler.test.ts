import request from 'supertest';
import postgres from 'postgres';
import express, { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../src/app/middleware/errorHandler';
import { renderWithLayout } from '../src/app/utils/render';
import { ValidationError, AuthorizationError } from '../src/app/services/errors';

describe('Centralized Error Handler Middleware', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should render 500 HTML page when an unexpected error occurs and HTML is accepted', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.get('/error', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('Test error'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/error')
      .set('Accept', 'text/html');

    expect(response.status).toBe(500);
    expect(response.text).toContain('500 - Server Error');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return 500 JSON when an unexpected error occurs and JSON is accepted', async () => {
    const app = express();

    app.get('/error', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('Test error'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/error')
      .set('Accept', 'application/json');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should propagate view rendering errors through next(err) when renderWithLayout fails', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.get('/invalid-render', (_req: Request, res: Response, next: NextFunction) => {
      renderWithLayout(res, 'nonexistent/view', {}, next);
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/invalid-render')
      .set('Accept', 'text/html');

    expect(response.status).toBe(500);
    expect(response.text).toContain('500 - Server Error');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should render 400 HTML page with custom message for client validation/upload errors', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.get('/client-error', (_req: Request, _res: Response, next: NextFunction) => {
      next(new ValidationError('File upload size exceeds maximum limit of 5MB'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/client-error')
      .set('Accept', 'text/html');

    expect(response.status).toBe(400);
    expect(response.text).toContain('400 - Bad Request');
    expect(response.text).toContain('File upload size exceeds maximum limit of 5MB');
    expect(response.text).not.toContain('500 - Server Error');
  });

  it('should return 400 JSON with error message for client errors when JSON is accepted', async () => {
    const app = express();

    app.get('/client-error-json', (_req: Request, _res: Response, next: NextFunction) => {
      next(new ValidationError('File upload size exceeds maximum limit of 5MB'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/client-error-json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'File upload size exceeds maximum limit of 5MB' });
  });

  it('should render 403 HTML page with forbidden heading for AuthorizationError', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.get('/forbidden', (_req: Request, _res: Response, next: NextFunction) => {
      next(new AuthorizationError('You do not have permission to perform this action'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/forbidden')
      .set('Accept', 'text/html');

    expect(response.status).toBe(403);
    expect(response.text).toContain('403 - Forbidden');
    expect(response.text).toContain('You do not have permission to perform this action');
    expect(response.text).not.toContain('500 - Server Error');
  });
  it('should log safe structured metadata without exposing an error message or stack', async () => {
    const app = express();
    const secretLikeValue = 'mock-refresh-token-must-not-be-logged';
    const error = new Error(`Query failed while processing ${secretLikeValue}`) as Error & { code?: unknown };
    Object.setPrototypeOf(error, postgres.PostgresError.prototype);
    error.name = 'PostgresError';
    error.code = '42703';

    app.get('/safe-error-log', (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/safe-error-log').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(response.status).toBe(500);
    expect(logged).toContain('"event":"http_error"');
    expect(logged).toContain('"errorName":"Error"');
    expect(logged).toContain('"statusCode":500');
    expect(logged).toContain('"method":"GET"');
    expect(logged).toContain('"diagnosticCode":"42703"');
    expect(logged).not.toContain(secretLikeValue);
    expect(logged).not.toContain('Query failed');
    expect(logged).not.toContain('Error:');
  });

  it('should not log arbitrary non-SQLSTATE error codes', async () => {
    const app = express();
    const error = new Error('Sensitive diagnostic detail') as Error & { code?: unknown };
    error.code = 'secret-value-that-is-not-a-sqlstate';

    app.get('/invalid-error-code', (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);

    await request(app).get('/invalid-error-code').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(logged).not.toContain('secret-value-that-is-not-a-sqlstate');
    expect(logged).not.toContain('Sensitive diagnostic detail');
    expect(logged).not.toContain('"diagnosticCode"');
  });

  it('should not reflect an unknown client-error message in the response or logs', async () => {
    const app = express();
    const privateValue = 'example-password-or-token-that-must-not-escape';
    const error = new Error(`Bad request with private value ${privateValue}`) as Error & { statusCode?: number };
    error.statusCode = 400;

    app.get('/untrusted-client-error', (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/untrusted-client-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\\n');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Bad Request' });
    expect(response.text).not.toContain(privateValue);
    expect(logged).not.toContain(privateValue);
    expect(logged).not.toContain('Bad request with private value');
  });

  it('should not log short system codes as PostgreSQL SQLSTATE values', async () => {
    const app = express();
    const error = new Error('Connection failed') as Error & { code?: unknown };
    error.code = 'EPIPE';

    app.get('/system-code-error', (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);

    await request(app).get('/system-code-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\\n');

    expect(logged).not.toContain('"diagnosticCode"');
    expect(logged).not.toContain('EPIPE');
    expect(logged).not.toContain('Connection failed');
  });

});
