import { Response, NextFunction } from 'express';

export function renderWithLayout(
  res: Response,
  view: string,
  locals: Record<string, unknown>,
  next?: NextFunction
): void {
  res.render(view, locals, (err, bodyHtml) => {
    if (err) {
      if (next) {
        return next(err);
      }
      return res.status(500).send(`Render Error: ${err.message}`);
    }
    res.render('layouts/main', {
      ...locals,
      body: bodyHtml,
    });
  });
}
