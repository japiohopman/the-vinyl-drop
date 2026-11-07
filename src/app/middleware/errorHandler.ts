import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { getSafeErrorTypeChain, getSafeSqlState } from '../utils/safeErrorDiagnostics';
import { ValidationError, AuthorizationError, NotFoundError } from '../services/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404);
  if (req.accepts('html')) {
    renderWithLayout(res, 'errors/404', {
      title: '404 - Page Not Found',
      isStatusPage: true,
    });
    return;
  }
  if (req.accepts('json')) {
    res.json({ error: 'Not Found' });
    return;
  }
  res.type('txt').send('Not Found');
}

function getSafeErrorType(error: Error): string {
  if (error instanceof ValidationError) return 'ValidationError';
  if (error instanceof AuthorizationError) return 'AuthorizationError';
  if (error instanceof NotFoundError) return 'NotFoundError';
  return getSafeErrorTypeChain(error)[0] || 'Error';
}

function getSafeDiagnosticCode(error: Error): string | undefined {
  // Only a validated SQLSTATE from a real postgres.js driver error is exposed.
  // The shared helper safely follows Drizzle's bounded cause chain.
  return getSafeSqlState(error);
}

function getGenericClientErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 405: return 'Method Not Allowed';
    case 408: return 'Request Timeout';
    case 409: return 'Conflict';
    case 413: return 'Payload Too Large';
    case 415: return 'Unsupported Media Type';
    case 422: return 'Unprocessable Entity';
    case 429: return 'Too Many Requests';
    default: return 'Client Error';
  }
}

function getSafeRetryHref(req: Request): string | null {
  if (req.method.toUpperCase() !== 'GET') return null;

  // req.path excludes the query string. Only return a same-origin absolute path;
  // never copy form data, tokens, or arbitrary request headers into the retry URL.
  const requestPath = req.path;
  if (
    typeof requestPath !== 'string' ||
    !requestPath.startsWith('/') ||
    requestPath.startsWith('//') ||
    requestPath.includes(String.fromCharCode(92)) ||
    Array.from(requestPath).some((character) => character.charCodeAt(0) < 32)
  ) {
    return null;
  }
  return requestPath;
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
    errorName: getSafeErrorType(err),
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
  const safeCauseTypes = getSafeErrorTypeChain(err);
  if (safeCauseTypes.length > 1) {
    logEntry.causeTypes = safeCauseTypes.join('>');
  }
  const diagnosticCode = getSafeDiagnosticCode(err);
  if (diagnosticCode) {
    logEntry.diagnosticCode = diagnosticCode;
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
    } else {
      clientMessage = getGenericClientErrorMessage(statusCode);
    }
  }

  if (req.accepts('html')) {
    if (isClientError) {
      if (statusCode === 404) {
        renderWithLayout(res, 'errors/404', {
          title: '404 - Page Not Found',
          message: clientMessage,
          isStatusPage: true,
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
      renderWithLayout(res, 'errors/500', {
        title: `${statusCode} - Server Error`,
        statusCode,
        retryHref: getSafeRetryHref(req),
        isStatusPage: true,
      });
    }
    return;
  }

  if (req.accepts('json')) {
    res.json({ error: clientMessage });
    return;
  }

  res.type('txt').send(clientMessage);
}
