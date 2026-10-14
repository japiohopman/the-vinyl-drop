import express, { Express } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import router from './app/routes';
import { sessionMiddleware } from './app/middleware/auth';
import { notFoundHandler, errorHandler } from './app/middleware/errorHandler';
import { config } from './config/env';

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

  // Set current path and messaging feature state for EJS views navigation
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.messagingEnabled = process.env.MESSAGING_ENABLED !== undefined
      ? process.env.MESSAGING_ENABLED.toLowerCase() === 'true' || process.env.MESSAGING_ENABLED === '1'
      : config.MESSAGING_ENABLED;
    next();
  });

  // Routes
  app.use('/', router);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
