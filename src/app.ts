import express, { Express } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import router from './app/routes';
import { sessionMiddleware } from './app/middleware/auth';
import { notFoundHandler, errorHandler } from './app/middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Configure view engine
  app.set('views', path.join(process.cwd(), 'views'));
  app.set('view engine', 'ejs');

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Session middleware
  app.use(sessionMiddleware);

  // Set current path for EJS views navigation state
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
  });

  // Routes
  app.use('/', router);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
