/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Forecast JSON: network first (fresh when online), last good copy when offline.
registerRoute(
  ({ url }) => /\/(summary[^/]*|grid|calibration)\.json$/.test(url.pathname) || url.pathname.includes('/spot/'),
  new NetworkFirst({ cacheName: 'forecast', networkTimeoutSeconds: 4, plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 14 * 86400 })] }),
);
// Optional detailed map tiles
registerRoute(({ url }) => url.hostname.endsWith('openfreemap.org'), new StaleWhileRevalidate({ cacheName: 'tiles', plugins: [new ExpirationPlugin({ maxEntries: 800 })] }));

self.addEventListener('push', (event) => {
  const d = event.data?.json() ?? { title: 'Swell Sul', body: 'Condições boas chegando' };
  event.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon.svg', badge: 'icon.svg', data: { url: d.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.registration.scope.replace(/\/$/, '') + '/').href;
  event.waitUntil(self.clients.openWindow(url));
});
