import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';

/**
 * Validates that state-changing requests (POST, PUT, DELETE, PATCH) originate from the trusted application origin.
 */
export function validateSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const expectedOrigin = new URL(config.APP_BASE_URL).origin;
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  if (originHeader) {
    try {
      if (new URL(originHeader).origin !== expectedOrigin) {
        res.status(403).json({ error: 'CSRF Forbidden: Origin mismatch' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'CSRF Forbidden: Invalid Origin header' });
      return;
    }
  } else if (refererHeader) {
    try {
      if (new URL(refererHeader).origin !== expectedOrigin) {
        res.status(403).json({ error: 'CSRF Forbidden: Referer mismatch' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'CSRF Forbidden: Invalid Referer header' });
      return;
    }
  }

  next();
}
