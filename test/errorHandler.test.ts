import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../src/app/middleware/errorHandler';
import { renderWithLayout } from '../src/app/utils/render';

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
});
