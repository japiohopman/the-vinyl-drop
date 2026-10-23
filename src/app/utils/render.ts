import { Response, NextFunction } from 'express';

/** Renders a view and carries middleware-provided locals, including flash messages, into the shared layout. */
export function renderWithLayout(
  res: Response,
  view: string,
  locals: Record<string, unknown>,
  next?: NextFunction
): void {
  const mergedLocals = {
    ...res.locals,
    ...locals,
  };

  res.render(view, mergedLocals, (err, bodyHtml) => {
    if (err) {
      if (next) {
        return next(err);
      }
      return res.status(500).send(`Render Error: ${err.message}`);
    }
    res.render('layouts/main', {
      ...mergedLocals,
      body: bodyHtml,
    });
  });
}
