const CACHE_NAME = 'tvd-public-static-v1';
const OFFLINE_URL = '/offline.html';

function isCacheableStaticAsset(pathname) {
  const isPublicAssetPath = /^\/(?:css|js|fonts|assets)\//.test(pathname);
  const isRootIconOrManifest = /^\/(?:site\.webmanifest|favicon\.ico|favicon-16x16\.png|favicon-32x32\.png|apple-touch-icon\.png|android-chrome-192x192\.png|android-chrome-512x512\.png)$/.test(pathname);
  const isStaticFileType = /\.(?:css|js|mjs|woff2?|ttf|otf|svg|png|jpe?g|webp|ico|json)$/i.test(pathname);
  return (isPublicAssetPath || isRootIconOrManifest) && isStaticFileType;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(OFFLINE_URL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('tvd-public-static-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML is network-only. On failure, return a static offline page, never a cached
  // home page, account page, listing, message or other user-specific response.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      return (await caches.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  if (!isCacheableStaticAsset(url.pathname)) return;

  // Public, same-origin files only. Omit cookies on these requests and never cache
  // responses that set cookies or do not return a successful same-origin response.
  event.respondWith((async () => {
    try {
      const publicRequest = new Request(request, { credentials: 'omit' });
      const response = await fetch(publicRequest);
      if (response.ok && response.status === 200 && response.type === 'basic'
        && !response.headers.has('set-cookie')) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || Response.error();
    }
  })());
});
