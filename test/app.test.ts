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
      expect(response.text).toContain('href="/fonts/fonts.css"');
      expect(response.text).not.toContain('fonts.googleapis.com');
      expect(response.text).not.toContain('fonts.gstatic.com');
      expect(response.text).toContain('src="/assets/brand/vinyl-drop-cartridge.svg"');
      expect(response.text).toContain('href="/" class="nav-link active" aria-current="page">HOME</a>');
      expect(response.text).toContain('href="/browse" class="nav-link">BROWSE</a>');
      expect(response.text).toContain('href="/drop/new" class="nav-link nav-link-action">+ DROP</a>');
      expect(response.text).toContain('href="/activity" class="nav-link">ACTIVITY</a>');
      expect(response.text).toContain('href="/profile" class="nav-link">YOU</a>');
    });
  });

  describe('GET /privacy', () => {
    it('renders the owner-review privacy draft and links to it from the footer', async () => {
      const response = await request(app)
        .get('/privacy')
        .set('Accept', 'text/html');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
      expect(response.text).toContain('Privacy Notice');
      expect(response.text).toContain('Owner review draft — not approved for publication');
      expect(response.text).not.toContain('migration must be separately applied and verified before the updated registration flow is deployed');
      expect(response.text).toContain('href="/privacy"');
      expect(response.text).toContain('yepyouknowhim@gmail.com');
      expect(response.text).toContain('tvd-registration-consent');
      expect(response.text).toContain('up to 10 minutes');
      expect(response.text).toContain('waitlist addresses');
      expect(response.text).toContain('responsible operator');
      expect(response.text).toContain('Your privacy rights');
      expect(response.text).toContain('href="https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/rechten-van-betrokkenen"');
      expect(response.text).toContain('normally due within one month under GDPR');
    });
  });

  describe('GET /terms', () => {
    it('renders separate Terms and links to them from the footer', async () => {
      const response = await request(app).get('/terms').set('Accept', 'text/html');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Terms of Use');
      expect(response.text).toContain('Owner review draft — not approved for the external beta');
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
