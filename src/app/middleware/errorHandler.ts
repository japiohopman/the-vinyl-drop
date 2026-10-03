import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404);
  if (req.accepts('html')) {
    res.render('errors/404', { title: '404 - Page Not Found' });
    return;
  }
  if (req.accepts('json')) {
    res.json({ error: 'Not Found' });
    return;
  }
  res.type('txt').send('Not Found');
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err.stack || err.message);
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);

  if (req.accepts('html')) {
    res.render('errors/500', { title: '500 - Server Error' });
    return;
  }
  if (req.accepts('json')) {
    res.json({ error: 'Internal Server Error' });
    return;
  }
  res.type('txt').send('Internal Server Error');
}
