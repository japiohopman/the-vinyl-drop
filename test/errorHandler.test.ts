import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { errorHandler, sanitizeLogOutput } from '../src/app/middleware/errorHandler';
import { renderWithLayout } from '../src/app/utils/render';
import { ValidationError, AuthorizationError, DatabaseError } from '../src/app/services/errors';

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

  describe('Credential and Sensitive Token Log Sanitization (Finding SEC-01)', () => {
    it('should sanitize token_hash, access_token, refresh_token, code, and passwords from log strings', () => {
      const sensitiveText =
        'Error connecting to https://example.com/auth/callback?token_hash=pkce_secret123&type=recovery&access_token=jwt.fake.token&password=mysecretpassword';
      const sanitized = sanitizeLogOutput(sensitiveText);

      expect(sanitized).not.toContain('pkce_secret123');
      expect(sanitized).not.toContain('jwt.fake.token');
      expect(sanitized).not.toContain('mysecretpassword');
      expect(sanitized).toContain('token_hash=[REDACTED]');
      expect(sanitized).toContain('access_token=[REDACTED]');
      expect(sanitized).toContain('password=[REDACTED]');
    });

    it('should sanitize Bearer authorization headers and database connection URLs', () => {
      const bearerLog = 'Failed request with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret';
      const dbUrlLog = 'Connection error on postgresql://postgres:supersecretpass@aws-0.supabase.com:5432/db';

      expect(sanitizeLogOutput(bearerLog)).toBe('Failed request with header Authorization: Bearer [REDACTED]');
      expect(sanitizeLogOutput(dbUrlLog)).not.toContain('supersecretpass');
      expect(sanitizeLogOutput(dbUrlLog)).toContain('postgresql://postgres:[REDACTED]@aws-0.supabase.com:5432/db');
    });

    it('should sanitize cookies and fake session tokens when logging unexpected errors', async () => {
      const app = express();
      app.get('/leaky-error', (_req: Request, _res: Response, next: NextFunction) => {
        const error = new Error('Session failure with cookie sb-access-token=super_secret_token_value; path=/');
        next(error);
      });
      app.use(errorHandler);

      const response = await request(app).get('/leaky-error').set('Accept', 'application/json');

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedError = consoleErrorSpy.mock.calls[0][0];
      expect(loggedError).not.toContain('super_secret_token_value');
      expect(loggedError).toContain('sb-access-token=[REDACTED]');
    });

    it('should not reflect sensitive credentials into client-facing 400 error messages', async () => {
      const app = express();
      app.get('/client-leaky-error', (_req: Request, _res: Response, next: NextFunction) => {
        next(new ValidationError('Invalid parameter: token_hash=fake_hash_123456'));
      });
      app.use(errorHandler);

      const response = await request(app).get('/client-leaky-error').set('Accept', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body.error).not.toContain('fake_hash_123456');
      expect(response.body.error).toContain('token_hash=[REDACTED]');
    });
  });

  describe('Database Error Handling Boundary (Finding DB-01)', () => {
    it('should safely render 500 HTML page without leaking SQL or database internals for DatabaseError', async () => {
      const app = express();
      app.set('views', './views');
      app.set('view engine', 'ejs');

      app.get('/db-failure', (_req: Request, _res: Response, next: NextFunction) => {
        next(
          new DatabaseError('Database query failed (code: 42703)', {
            code: '42703',
            severity: 'ERROR',
            cause: new Error('column "website_url" does not exist in SELECT profiles.website_url FROM profiles'),
          })
        );
      });
      app.use(errorHandler);

      const response = await request(app).get('/db-failure').set('Accept', 'text/html');

      expect(response.status).toBe(500);
      expect(response.text).toContain('500 - Server Error');
      expect(response.text).toContain('Something went wrong on our end.');
      expect(response.text).not.toContain('website_url');
      expect(response.text).not.toContain('42703');
      expect(response.text).not.toContain('SELECT profiles');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should safely return 500 JSON without exposing SQL or database error internals', async () => {
      const app = express();

      app.get('/db-failure-json', (_req: Request, _res: Response, next: NextFunction) => {
        next(
          new DatabaseError('Database query failed (code: 42703)', {
            code: '42703',
            severity: 'ERROR',
          })
        );
      });
      app.use(errorHandler);

      const response = await request(app).get('/db-failure-json').set('Accept', 'application/json');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal Server Error' });
      expect(response.text).not.toContain('42703');
    });
  });
});

