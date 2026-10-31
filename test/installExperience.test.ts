import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';

const publicDirectory = path.join(process.cwd(), 'public');

describe('PWA installation and native sharing — Issue #52', () => {
  const app = createApp();

  it('serves a public install guide with native sharing, platform instructions and the canonical QR', async () => {
    const response = await request(app).get('/install');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('<h1 id="install-title">Take The Vinyl Drop with you.</h1>');
    expect(response.text).toContain('data-install-action');
    expect(response.text).toContain('data-share-action');
    expect(response.text).toContain('Android');
    expect(response.text).toContain('iPhone or iPad');
    expect(response.text).toContain('Safari');
    expect(response.text).toContain('Add to Home Screen');
    expect(response.text).toContain('Open as Web App');
    expect(response.text).toContain('Desktop');
    expect(response.text).toContain('href="https://thevinyldrop.nl/install"');
    expect(response.text).toContain('href="/css/install.css?v=');
    expect(response.text).toContain('/js/install-experience.js');
    expect(response.text).toContain('/js/pwa-registration.js');
    expect(response.text).toContain('href="/install"');
  });

  it('publishes a root-scoped standalone manifest with the existing 192 and 512 pixel icons', async () => {
    const response = await request(app).get('/site.webmanifest');

    expect(response.status).toBe(200);
    const manifest = JSON.parse(response.text);
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/android-chrome-192x192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/android-chrome-512x512.png', sizes: '512x512' }),
    ]));
  });

  it('serves a first-party QR asset for the canonical install URL', async () => {
    const response = await request(app).get('/assets/install-qr.svg');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/svg\+xml/);
    const qrSvg = fs.readFileSync(path.join(publicDirectory, 'assets/install-qr.svg'), 'utf8');
    expect(qrSvg).toContain('https://thevinyldrop.nl/install');
  });

  it('registers a root-scoped service worker that never caches navigations or private responses', async () => {
    const response = await request(app).get('/sw.js');

    expect(response.status).toBe(200);
    const source = response.text;
    expect(source).toContain("request.mode === 'navigate'");
    expect(source).toContain("fetch(request).catch");
    expect(source).toContain("new Request(request, { credentials: 'omit' })");
    expect(source).toContain("!response.headers.has('set-cookie')");
    expect(source).toContain("request.headers.has('authorization')");
    expect(source).toContain("return (await caches.match(OFFLINE_URL)) || Response.error()");
    const navigationHandler = source.slice(
      source.indexOf("if (request.mode === 'navigate')"),
      source.indexOf('if (!isCacheableStaticAsset(url.pathname))'),
    );
    expect(navigationHandler).not.toContain('cache.put');
    expect(source).not.toContain('caches.match(request) || fetch(request)');
    const registration = fs.readFileSync(path.join(publicDirectory, 'js/pwa-registration.js'), 'utf8');
    expect(registration).toContain("register('/sw.js', { scope: '/' })");
  });

  it('keeps the offline fallback static and free of account or listing content', async () => {
    const response = await request(app).get('/offline.html');

    expect(response.status).toBe(200);
    expect(response.text).toContain('You are offline.');
    expect(response.text).toContain('Reconnect and reload');
    expect(response.text).not.toContain('My Listings');
    expect(response.text).not.toContain('Messages');
  });

  it('uses the device share sheet where available and a copy fallback otherwise', async () => {
    const source = fs.readFileSync(path.join(publicDirectory, 'js/install-experience.js'), 'utf8');

    expect(source).toContain('navigator.share');
    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain("error.name === 'AbortError'");
    expect(source).toContain("announce('Sharing cancelled.')");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("window.addEventListener('appinstalled'");
    expect(source).not.toContain('wa.me');
    expect(source).not.toContain('mailto:');
  });
});
