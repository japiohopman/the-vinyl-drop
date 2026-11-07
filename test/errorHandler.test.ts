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


  it('preserves a forwarded 503 status and offers a same-path GET retry without query data', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.get('/retry', (_req: Request, _res: Response, next: NextFunction) => {
      const error = new Error('secret provider token must not be rendered') as Error & { statusCode?: number };
      error.statusCode = 503;
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/retry?access_token=private-value')
      .set('Accept', 'text/html');

    expect(response.status).toBe(503);
    expect(response.text).toContain('data-status-code="503"');
    expect(response.text).toContain('href="/retry">Try again</a>');
    expect(response.text).not.toContain('access_token');
    expect(response.text).not.toContain('private-value');
    expect(response.text).not.toContain('secret provider token');
  });

  it('does not offer a retry link for an unsafe POST request', async () => {
    const app = express();
    app.set('views', './views');
    app.set('view engine', 'ejs');

    app.post('/submit', (_req: Request, _res: Response, next: NextFunction) => {
      next(new Error('private submission detail'));
    });
    app.use(errorHandler);

    const response = await request(app)
      .post('/submit?csrf=must-not-appear')
      .set('Accept', 'text/html');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('>Try again</a>');
    expect(response.text).not.toContain('csrf=');
    expect(response.text).not.toContain('private submission detail');
    expect(response.text).toContain('href="/browse">Browse records</a>');
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
    expect(logged).toContain('"errorName":"PostgresError"');
    expect(logged).toContain('"statusCode":500');
    expect(logged).toContain('"method":"GET"');
    expect(logged).toContain('"diagnosticCode":"42703"');
    expect(logged).not.toContain(secretLikeValue);
    expect(logged).not.toContain('Query failed');
    expect(logged).not.toContain('Error:');
  });

  it('logs a wrapped Postgres SQLSTATE and safe cause chain without private error text', async () => {
    const app = express();
    const privateValue = 'never-log-this-database-secret';
    const postgresError = new Error(`query failed: ${privateValue}`) as Error & { code?: unknown };
    Object.setPrototypeOf(postgresError, postgres.PostgresError.prototype);
    postgresError.name = 'PostgresError';
    postgresError.code = '42703';
    const wrappedError = Object.assign(new Error(`Drizzle wrapper: ${privateValue}`), { cause: postgresError });

    app.get('/wrapped-postgres-error', (_req: Request, _res: Response, next: NextFunction) => next(wrappedError));
    app.use(errorHandler);

    const response = await request(app).get('/wrapped-postgres-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\\n');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(logged).toContain('"causeChain":"Error>PostgresError"');
    expect(logged).toContain('"diagnosticCode":"42703"');
    expect(logged).not.toContain(privateValue);
    expect(logged).not.toContain('Drizzle wrapper');
    expect(logged).not.toContain('query failed');
  });

  it('stops at the configured cause-chain depth before a nested Postgres error', async () => {
    const app = express();
    const driverError = new Error('nested query detail must stay private') as Error & { code?: unknown };
    Object.setPrototypeOf(driverError, postgres.PostgresError.prototype);
    driverError.name = 'PostgresError';
    driverError.code = '42703';

    let wrappedError: Error = driverError;
    for (let depth = 0; depth < 8; depth += 1) {
      const nextError = new Error(`private wrapper ${depth}`);
      Object.defineProperty(nextError, 'cause', { value: wrappedError });
      wrappedError = nextError;
    }

    app.get('/deep-wrapped-error', (_req: Request, _res: Response, next: NextFunction) => next(wrappedError));
    app.use(errorHandler);

    const response = await request(app).get('/deep-wrapped-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(logged).toContain('"causeChain":"Error>Error>Error>Error>Error>Error>Error>Error"');
    expect(logged).not.toContain('"diagnosticCode"');
    expect(logged).not.toContain('nested query detail');
    expect(logged).not.toContain('private wrapper');
  });

  it('stops safely when a wrapped error cause chain contains a cycle', async () => {
    const app = express();
    const outer = new Error('private outer wrapper');
    const inner = new Error('private inner wrapper');
    Object.defineProperty(outer, 'cause', { value: inner });
    Object.defineProperty(inner, 'cause', { value: outer });

    app.get('/cyclic-wrapped-error', (_req: Request, _res: Response, next: NextFunction) => next(outer));
    app.use(errorHandler);

    const response = await request(app).get('/cyclic-wrapped-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal Server Error' });
    expect(logged).toContain('"causeChain":"Error>Error"');
    expect(logged).not.toContain('"diagnosticCode"');
    expect(logged).not.toContain('private outer wrapper');
    expect(logged).not.toContain('private inner wrapper');
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
    const privateValue = 'ConfidentialTokenValue';
    const error = new Error(`Bad request with private value ${privateValue}`) as Error & { statusCode?: number };
    error.name = privateValue;
    error.statusCode = 400;

    app.get('/untrusted-client-error', (_req: Request, _res: Response, next: NextFunction) => {
      next(error);
    });
    app.use(errorHandler);

    const response = await request(app).get('/untrusted-client-error').set('Accept', 'application/json');
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

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
    const logged = consoleErrorSpy.mock.calls.map(([message]) => String(message)).join('\n');

    expect(logged).not.toContain('"diagnosticCode"');
    expect(logged).not.toContain('EPIPE');
    expect(logged).not.toContain('Connection failed');
  });

});
