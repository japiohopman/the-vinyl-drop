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

/**
 * Redacts credential-bearing data (tokens, passwords, database credentials, recovery URLs)
 * from logged strings and user-facing error messages.
 */
export function sanitizeLogOutput(text: string): string {
  if (!text) return text;
  return text
    // Redact query parameter or key-value credentials: token_hash, access_token, refresh_token, token, code, password
    .replace(
      /(?:([?&]|\b)(token_hash|access_token|refresh_token|token|code|password)\s*=\s*)[^&\s;,]+/gi,
      (_match, prefix, key) => `${prefix}${key}=[REDACTED]`
    )
    // Redact Authorization headers: Bearer <token>
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    // Redact database connection URLs containing user:password@
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@[^\s/:]+)/gi, '$1[REDACTED]$2')
    // Redact auth cookies: sb-access-token, sb-refresh-token, sb-recovery-mode
    .replace(/(sb-(?:access-token|refresh-token|recovery-mode)=)[^;\s&]+/gi, '$1[REDACTED]');
}

export function errorHandler(
  err: Error & { statusCode?: number; status?: number },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(sanitizeLogOutput(err.stack || err.message));

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
  const clientMessage = isClientError
    ? sanitizeLogOutput(err.message || 'Bad Request')
    : 'Internal Server Error';

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
