import express, { Request, Response, NextFunction } from 'express';
import path from 'path';

export function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(process.cwd(), 'views'));

  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Home route
  app.get('/', (_req: Request, res: Response) => {
    res.render('home/index', {
      title: 'The Vinyl Drop — Buy. Trade. Dig.',
      message: 'Welcome to The Vinyl Drop',
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).render('errors/404', {
      title: 'Page Not Found — The Vinyl Drop',
    });
  });

  // 500 handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled application error:', err);
    res.status(500).render('errors/500', {
      title: 'Server Error — The Vinyl Drop',
    });
  });

  return app;
}
