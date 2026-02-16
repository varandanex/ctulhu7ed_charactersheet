/*
  Placeholder service worker to avoid 404 noise in development logs.
  If you later enable MSW, replace this file with `npx msw init public/ --save`.
*/
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // No-op placeholder: does not intercept requests.
});
