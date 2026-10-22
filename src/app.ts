import express, { Express } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import router from './app/routes';
import { sessionMiddleware } from './app/middleware/auth';
import { notFoundHandler, errorHandler } from './app/middleware/errorHandler';
import { config } from './config/env';
import { BETA_WELCOME_COOKIE, INVITE_ONLY_ACCESS_MESSAGE, isBetaInviteOnlyEnabled } from './app/services/betaAccess';
import { getIconSvg } from './app/utils/iconRegistry';

export function createApp(): Express {
  const app = express();

  // Configure view engine
  app.set('views', path.join(process.cwd(), 'views'));
  app.set('view engine', 'ejs');
  app.locals.getIconSvg = getIconSvg;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Session middleware
  app.use(sessionMiddleware);

  // Share pilot state with server-rendered views. The welcome cookie is display-only
  // and is consumed at the first HTML response; it never grants access.
  app.use((req, res, next) => {
    res.locals.getIconSvg = getIconSvg;
    res.locals.currentPath = req.path;
    res.locals.messagingEnabled = config.MESSAGING_ENABLED;
    res.locals.betaInviteOnly = isBetaInviteOnlyEnabled() && !req.user;
    res.locals.inviteOnlyAccessMessage = INVITE_ONLY_ACCESS_MESSAGE;

    const showBetaWelcome = Boolean(isBetaInviteOnlyEnabled() && req.accepts('html') && req.cookies?.[BETA_WELCOME_COOKIE] === '1');
    res.locals.showBetaWelcome = showBetaWelcome;
    if (showBetaWelcome) {
      res.clearCookie(BETA_WELCOME_COOKIE, { path: '/' });
    }

    next();
  });

  // Routes
  app.use('/', router);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
