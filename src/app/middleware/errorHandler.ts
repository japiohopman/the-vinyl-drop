import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { ValidationError, AuthorizationError, NotFoundError } from '../services/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404);
  if (req.accepts('html')) {
    renderWithLayout(res, 'errors/404', { title: '404 - Page Not Found' });
    return;
  }
  if (req.accepts('json')) {
    res.json({ error: 'Not Found' });
    return;
  }
  res.type('txt').send('Not Found');
}

export function errorHandler(
  err: Error & { statusCode?: number; status?: number },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err.stack || err.message);

  let statusCode = 500;
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 600) {
    statusCode = err.statusCode;
  } else if (err.status && err.status >= 400 && err.status < 600) {
    statusCode = err.status;
  } else if (res.statusCode >= 400 && res.statusCode < 600) {
    statusCode = res.statusCode;
  } else if (err instanceof ValidationError) {
    statusCode = 400;
  } else if (err instanceof AuthorizationError) {
    statusCode = 403;
  } else if (err instanceof NotFoundError) {
    statusCode = 404;
  }

  res.status(statusCode);

  const isClientError = statusCode >= 400 && statusCode < 500;
  const clientMessage = isClientError ? err.message || 'Bad Request' : 'Internal Server Error';

  if (req.accepts('html')) {
    if (isClientError) {
      if (statusCode === 404) {
        renderWithLayout(res, 'errors/404', {
          title: '404 - Page Not Found',
          message: clientMessage,
        });
      } else {
        renderWithLayout(res, 'errors/400', {
          title: `${statusCode} - Bad Request`,
          message: clientMessage,
        });
      }
    } else {
      renderWithLayout(res, 'errors/500', { title: '500 - Server Error' });
    }
    return;
  }

  if (req.accepts('json')) {
    res.json({ error: clientMessage });
    return;
  }

  res.type('txt').send(clientMessage);
}
