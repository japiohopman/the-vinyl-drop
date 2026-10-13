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

function isSafeDiagnosticCode(code: unknown): code is string {
  // PostgreSQL SQLSTATE values are five uppercase alphanumeric characters; do not log arbitrary error codes.
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code);
}

export function errorHandler(
  err: Error & { statusCode?: number; status?: number; code?: unknown },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
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

  // Never log err.message, err.stack, or arbitrary error objects: they can contain credentials or SQL details.
  // Keep only bounded metadata and a validated SQLSTATE so failures remain diagnosable without echoing sensitive values.
  const logEntry: Record<string, string | number> = {
    event: 'http_error',
    errorName: /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(err.name) ? err.name : 'Error',
    statusCode,
    method: req.method,
  };
  const routePath = req.route?.path;
  if (
    typeof routePath === 'string' &&
    routePath.length <= 160 &&
    /^[A-Za-z0-9_/:.*-]+$/.test(routePath)
  ) {
    logEntry.route = routePath;
  }
  if (isSafeDiagnosticCode(err.code)) {
    logEntry.diagnosticCode = err.code;
  }
  console.error(JSON.stringify(logEntry));

  res.status(statusCode);

  const isClientError = statusCode >= 400 && statusCode < 500;
  let clientMessage = 'Internal Server Error';
  if (isClientError) {
    // Only explicitly defined application errors may supply a user-facing message.
    // Unknown errors can contain SQL, credentials, or other private diagnostics.
    if (err instanceof ValidationError) {
      clientMessage = err.message || 'Bad Request';
    } else if (err instanceof AuthorizationError) {
      clientMessage = err.message || 'Forbidden';
    } else if (err instanceof NotFoundError) {
      clientMessage = err.message || 'Not Found';
    } else if (statusCode === 403) {
      clientMessage = 'Forbidden';
    } else if (statusCode === 404) {
      clientMessage = 'Not Found';
    } else {
      clientMessage = 'Bad Request';
    }
  }

  if (req.accepts('html')) {
    if (isClientError) {
      if (statusCode === 404) {
        renderWithLayout(res, 'errors/404', {
          title: '404 - Page Not Found',
          message: clientMessage,
        });
      } else {
        const title =
          statusCode === 403
            ? '403 - Forbidden'
            : statusCode === 400
            ? '400 - Bad Request'
            : `${statusCode} - Client Error`;
        renderWithLayout(res, 'errors/400', {
          title,
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
