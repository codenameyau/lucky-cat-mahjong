/* Retired. Version 0.45.0 registered the game's own service worker here,
   scoped to /play-mahjong/. The site now has one worker for every page,
   /sw.js (see js/offline.js). This file stays so the old worker removes
   itself: browsers check a worker's script for updates on their own (on
   navigation, and when the page calls update()), and a missing script (a 404)
   would leave the old worker in place, so this replaces it with one that:

   - takes over at once (skipWaiting) and answers nothing (no fetch handler),
     so every request goes straight to the network;
   - unregisters itself, so /sw.js (scope /) controls these pages from now on;
   - reloads its open pages onto the network's latest version.

   Its old caches are left for /sw.js, which deletes stale versions when it
   takes over. Never delete this file: a browser that hasn't visited since
   0.45.0 still needs it. */

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.registration.unregister().then(function () {
    return self.clients.matchAll({ type: 'window' });
  }).then(function (clients) {
    clients.forEach(function (client) {
      if (client.navigate) client.navigate(client.url).catch(function () {});
    });
  }));
});
