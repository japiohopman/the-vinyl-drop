import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import * as listingService from '../src/app/services/listingService';

jest.mock('../src/app/services/listingService');

const app = createApp();

describe('App Routes and Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listingService.getHomeFeedListings as jest.Mock).mockResolvedValue([]);
  });

  describe('GET /contact', () => {
    it('shows the private operator and public contact route', async () => {
      const response = await request(app).get('/contact').set('Accept', 'text/html');
      expect(response.status).toBe(200);
      expect(response.text).toContain('run by Jaap Hopman as a private individual, not by a company');
      expect(response.text).toContain('yepyouknowhim@gmail.com');
    });
  });

  describe('GET /', () => {
    it('should render the home page with 200 OK and HTML content', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('The Vinyl Drop');
      expect(response.text).toContain('Welcome to The Vinyl Drop');
    });

    it('should render brand logo cartridge asset, Capriola font link, and correct active nav item', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/href="\/fonts\/fonts\.css\?v=[a-f0-9]{12}"/);
      expect(response.text).not.toContain('fonts.googleapis.com');
      expect(response.text).not.toContain('fonts.gstatic.com');
      expect(response.text).toContain('src="/assets/brand/vinyl-drop-cartridge.svg"');
      expect(response.text).toContain('href="/" class="nav-link active" aria-current="page">HOME</a>');
      expect(response.text).toContain('href="/dig" class="nav-link">DIG</a>');
      expect(response.text).toContain('href="/drop/new" class="nav-link nav-link-action">+ DROP</a>');
      expect(response.text).toContain('href="/activity" class="nav-link">ACTIVITY</a>');
      expect(response.text).toContain('SIGN IN');
    });
  });

  describe('GET /dig trailing slash', () => {
    it('normalizes the route before selecting Dig stylesheets', async () => {
      (listingService.hasExplicitWhiteLabelInventory as jest.Mock).mockResolvedValue(false);
      (listingService.searchBrowseListings as jest.Mock).mockResolvedValue({
        items: [], totalCount: 0, page: 1, limit: 12, totalPages: 1,
      });
      (listingService.searchDigListings as jest.Mock).mockResolvedValue({
        items: [], totalCount: 0, hasMore: false,
      });

      const response = await request(app).get('/dig/').set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/href="\/css\/dig-experience\.css\?v=[a-f0-9]{12}"/);
      expect(response.text).toMatch(/href="\/css\/dig-mobile-session\.css\?v=[a-f0-9]{12}"/);
    });
  });

  describe('CSS asset caching', () => {
    it('versions stylesheet URLs by content and only immutably caches the matching version', async () => {
      const cssPath = path.join(process.cwd(), 'public/css/style.css');
      const expectedVersion = createHash('sha256')
        .update(readFileSync(cssPath))
        .digest('hex')
        .slice(0, 12);

      const page = await request(app).get('/').set('Accept', 'text/html');
      expect(page.status).toBe(200);
      expect(page.text).toContain(`href="/css/style.css?v=${expectedVersion}"`);

      const versionedResponse = await request(app).get(`/css/style.css?v=${expectedVersion}`);
      expect(versionedResponse.status).toBe(200);
      expect(versionedResponse.headers['content-type']).toMatch(/text\/css/);
      expect(versionedResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');

      const staleVersion = `${expectedVersion[0] === '0' ? '1' : '0'}${expectedVersion.slice(1)}`;
      const staleResponse = await request(app).get(`/css/style.css?v=${staleVersion}`);
      expect(staleResponse.status).toBe(200);
      expect(staleResponse.headers['cache-control']).not.toContain('immutable');
      expect(staleResponse.headers['cache-control']).not.toContain('max-age=31536000');

      const malformedResponse = await request(app).get('/css/style.css?v=not-a-valid-hash');
      expect(malformedResponse.status).toBe(200);
      expect(malformedResponse.headers['cache-control']).not.toContain('immutable');
      expect(malformedResponse.headers['cache-control']).not.toContain('max-age=31536000');

      const unversionedResponse = await request(app).get('/css/style.css');
      expect(unversionedResponse.status).toBe(200);
      expect(unversionedResponse.headers['cache-control']).not.toContain('immutable');
      expect(unversionedResponse.headers['cache-control']).not.toContain('max-age=31536000');

      const unrelatedAssetResponse = await request(app).get('/favicon.ico');
      expect(unrelatedAssetResponse.status).toBe(200);
      expect(unrelatedAssetResponse.headers['cache-control']).not.toContain('immutable');
      expect(unrelatedAssetResponse.headers['cache-control']).not.toContain('max-age=31536000');
    });
  });

    it('versions each extracted route-specific CSS bundle by its own content hash', async () => {
      const routeStylesheets = [
        '/css/dig-experience.css',
        '/css/listing-detail.css',
        '/css/my-listings.css',
        '/css/style-after-features.css',
        '/css/activity-release-selection.css',
        '/css/browse-dig-controls.css',
        '/css/style-after-activity.css',
        '/css/release-selection-overrides.css',
        '/css/style-after-release-selection.css',
        '/css/dig-mobile-session.css',
        '/css/listing-forms.css',
        '/css/style-after-listing-forms.css',
        '/css/profile-pages.css',
        '/css/style-after-profile-pages.css',
        '/css/profile-editor.css',
        '/css/style-after-profile-editor.css',
        '/css/listing-interactions.css',
        '/css/listing-detail-polish.css',
      ];

      for (const assetUrl of routeStylesheets) {
        const cssPath = path.join(process.cwd(), 'public', assetUrl.slice(1));
        const expectedVersion = createHash('sha256')
          .update(readFileSync(cssPath))
          .digest('hex')
          .slice(0, 12);
        const response = await request(app).get(`${assetUrl}?v=${expectedVersion}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/css/);
        expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      }
    });

  describe('GET /privacy', () => {
    it('renders the current privacy notice and links to it from the footer', async () => {
      const response = await request(app)
        .get('/privacy')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('Privacy Notice');
      expect(response.text).not.toContain('Owner review draft');
      expect(response.text).not.toContain('Private beta review draft');
      expect(response.text).toContain('handled manually by the operator');
      expect(response.text).not.toContain('migration must be separately applied and verified before the updated registration flow is deployed');
      expect(response.text).toContain('href="/privacy"');
      expect(response.text).toContain('yepyouknowhim@gmail.com');
      expect(response.text).toContain('tvd-registration-consent');
      expect(response.text).toContain('up to 10 minutes');
      expect(response.text).toContain('waitlist addresses');
      expect(response.text).toContain('responsible operator');
      expect(response.text).toContain('Your privacy rights');
      expect(response.text).toContain('Contact form messages:');
      expect(response.text).toContain('GDPR Article 6(1)(b)');
      expect(response.text).toContain('Article 6(1)(f)');
      expect(response.text).not.toContain('Legal-basis review remains open');
      expect(response.text).toContain('through the configured Resend API');
      expect(response.text).toContain('stored in the United States');
      expect(response.text).toContain('EU-West (Ireland) region');
      expect(response.text).toContain('workspace plan');
      expect(response.text).toContain('href="https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen"');
      expect(response.text).toContain('normally due within one month under GDPR');
    });
  });

  describe('GET /terms', () => {
    it('renders separate Terms and links to them from the footer', async () => {
      const response = await request(app).get('/terms').set('Accept', 'text/html');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Terms of Use');
      expect(response.text).not.toContain('Owner review draft');
      expect(response.text).not.toContain('Private beta review draft');
      expect(response.text).toContain('Account deletion and export are not currently self-service');
      expect(response.text).toContain('beta-terms-2026-10-19-v2');
      expect(response.text).toContain('at least 18 years old');
      expect(response.text).toContain('To report a listing, comment, suspected illegal content');
      expect(response.text).toContain('governed by the laws of the Netherlands');
      expect(response.text).toContain('href="/terms"');
    });
  });

  describe('GET /health', () => {
    it('should return health status JSON with 200 OK', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 HTML response for non-existent route when HTML requested', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .set('Accept', 'text/html');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('404 - Page Not Found');
    });

    it('should return 404 JSON response for non-existent route when JSON requested', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .set('Accept', 'application/json');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toEqual({ error: 'Not Found' });
    });
  });
});
