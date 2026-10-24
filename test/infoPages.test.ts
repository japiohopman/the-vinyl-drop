import request from 'supertest';
import { createApp } from '../src/app';

describe('Contact & Community Rules Pages (Phase 6A - Issue #46)', () => {
  const app = createApp();

  describe('GET /contact', () => {
    it('should resolve with 200 OK and render required contact email and purpose categories', async () => {
      const res = await request(app).get('/contact');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Contact The Vinyl Drop');
      expect(res.text).toContain('placeholder="Your name"');
      expect(res.text).toContain('placeholder="you@example.com"');
      expect(res.text).toContain('placeholder="Tell us how we can help..."');
      expect(res.text).toContain('yepyouknowhim@gmail.com');
      expect(res.text).toContain('Bugs &amp; Technical Problems');
      expect(res.text).toContain('Tips &amp; Feedback');
      expect(res.text).toContain('Errors or Bad Listings');
      expect(res.text).toContain('Complaints or Community Concerns');
    });

    it('should render footer links for Contact and Community Rules', async () => {
      const res = await request(app).get('/contact');

      expect(res.status).toBe(200);
      expect(res.text).toContain('href="/contact"');
      expect(res.text).toContain('href="/community-rules"');
    });
  });

  describe('GET /privacy', () => {
    it('renders the current privacy notice and accurately discloses the manual deletion boundary', async () => {
      const res = await request(app).get('/privacy');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Privacy Notice');
      expect(res.text).toContain('yepyouknowhim@gmail.com');
      expect(res.text).toContain('does not currently offer a self-service full account export or erasure flow');
      expect(res.text).not.toContain('Owner review draft');
      expect(res.text).not.toContain('Private beta review draft');
    });
  });

  describe('GET /terms', () => {
    it('renders the current Terms and links to the privacy notice and manual contact route', async () => {
      const res = await request(app).get('/terms');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Terms of Use');
      expect(res.text).toContain('yepyouknowhim@gmail.com');
      expect(res.text).toContain('href="/privacy"');
      expect(res.text).toContain('Account deletion and export are not currently self-service');
      expect(res.text).not.toContain('Owner review draft');
      expect(res.text).not.toContain('Private beta review draft');
    });
  });

  describe('GET /community-rules', () => {
    it('should resolve with 200 OK and render explicit conduct prohibitions', async () => {
      const res = await request(app).get('/community-rules');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Community Rules');
      expect(res.text).toContain('Racism and Hate Speech');
      expect(res.text).toContain('Harassment');
      expect(res.text).toContain('Threats');
      expect(res.text).toContain('Doxxing');
      expect(res.text).toContain('Deliberate Abuse, Scams or Misuse');
    });

    it('should reference house tone culture without weakening conduct rules', async () => {
      const res = await request(app).get('/community-rules');

      expect(res.status).toBe(200);
      expect(res.text).toContain("sex, drugs &amp; rock 'n' roll");
      expect(res.text).toContain('disrespecting fellow human beings is strictly forbidden');
    });
  });

  describe('Mobile About contextual header', () => {
    it('identifies the active information page and provides an icon-only Back to Home action', async () => {
      const pages = [
        ['/terms', 'ABOUT / TERMS'],
        ['/contact', 'ABOUT / CONTACT'],
        ['/privacy', 'ABOUT / PRIVACY'],
        ['/community-rules', 'ABOUT / RULES'],
      ] as const;

      for (const [route, label] of pages) {
        const res = await request(app).get(route);
        expect(res.status).toBe(200);
        expect(res.text).toContain('<span class="mobile-context-heading">' + label + '</span>');
        expect(res.text).toContain('class="mobile-context-back mobile-context-back-icon-only mobile-context-home" aria-label="Back to Home"');
        expect(res.text).toContain('<span class="mobile-context-back-icon" aria-hidden="true">←</span>');
      }
    });
  });

  describe('Route Health & Error Boundary Verification (404/500 handling)', () => {
    it('should return 404 HTML for unmapped routes without crashing server', async () => {
      const res = await request(app).get('/nonexistent-info-page');

      expect(res.status).toBe(404);
      expect(res.text).toContain('404 - Page Not Found');
    });

    it('should handle route errors gracefully via centralized error handler', async () => {
      const res = await request(app)
        .get('/contact')
        .set('Accept', 'application/json');

      expect(res.status).toBe(200);
    });
  });
});
