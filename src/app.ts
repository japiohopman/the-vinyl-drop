import express, { Express } from 'express';
import path from 'path';
import router from './app/routes';
import { notFoundHandler, errorHandler } from './app/middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Configure view engine
  app.set('views', path.join(process.cwd(), 'views'));
  app.set('view engine', 'ejs');

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Routes
  app.use('/', router);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
