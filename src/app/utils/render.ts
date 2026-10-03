import { Response } from 'express';

export function renderWithLayout(
  res: Response,
  view: string,
  locals: Record<string, unknown>
): void {
  res.render(view, locals, (err, bodyHtml) => {
    if (err) {
      if (res.req && typeof res.req.next === 'function') {
        return res.req.next(err);
      }
      return;
    }
    res.render('layouts/main', {
      ...locals,
      body: bodyHtml,
    });
  });
}
