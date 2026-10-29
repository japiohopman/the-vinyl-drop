import express, { Express } from 'express';
import path from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import cookieParser from 'cookie-parser';
import router from './app/routes';
import { sessionMiddleware } from './app/middleware/auth';
import { flashMiddleware } from './app/middleware/flash';
import { notFoundHandler, errorHandler } from './app/middleware/errorHandler';
import { config } from './config/env';
import { BETA_WELCOME_COOKIE, INVITE_ONLY_ACCESS_MESSAGE, isBetaInviteOnlyEnabled } from './app/services/betaAccess';
import { getIconSvg } from './app/utils/iconRegistry';

const VERSIONED_CSS_ASSETS = [
  '/css/style.css',
  '/css/dig-experience.css',
  '/css/listing-detail.css',
  '/css/my-listings.css',
  '/css/style-after-features.css',
  '/css/listing-interactions.css',
  '/css/dig-mobile-crate.css',
  '/fonts/fonts.css',
] as const;

function getCssAssetVersions(publicDirectory: string): Map<string, string> {
  return new Map(
    VERSIONED_CSS_ASSETS.map((assetUrl): [string, string] => {
      const assetPath = path.join(publicDirectory, assetUrl.replace(/^\/+/, ''));
      const digest = createHash('sha256')
        .update(readFileSync(assetPath))
        .digest('hex')
        .slice(0, 12);

      return [assetUrl, digest];
    })
  );
}

/** Creates the Express application and wires its shared request middleware and routes. */
export function createApp(): Express {
  const app = express();
  const publicDirectory = path.join(process.cwd(), 'public');
  const cssAssetVersions = getCssAssetVersions(publicDirectory);

  // Content-derived URLs let browsers cache these stylesheets for a year without
  // accidentally retaining old CSS after a deploy. Unknown paths remain unchanged.
  app.locals.versionedCssAssetUrl = (assetUrl: string): string => {
    const version = cssAssetVersions.get(assetUrl);
    return version ? `${assetUrl}?v=${version}` : assetUrl;
  };

  // Configure view engine
  app.set('views', path.join(process.cwd(), 'views'));
  app.set('view engine', 'ejs');
  app.locals.getIconSvg = getIconSvg;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(express.static(publicDirectory, {
    maxAge: 0,
    setHeaders: (response) => {
      const requestUrl = new URL(response.req.originalUrl || response.req.url, 'http://localhost');
      const currentVersion = cssAssetVersions.get(requestUrl.pathname);

      // Apply immutable caching only to an explicitly versioned CSS URL whose token
      // matches the exact file content served by this application instance.
      if (currentVersion && requestUrl.searchParams.get('v') === currentVersion) {
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // Session middleware
  app.use(sessionMiddleware);
  app.use(flashMiddleware);

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
