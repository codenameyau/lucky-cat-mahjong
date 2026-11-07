/* The site's service worker, registered by js/offline.js on every page as
   /sw.js?v=<VERSION>. Its scope is the whole site: the pages, the options
   page (/play-mahjong/) and the game (/playing-mahjong/).

   Latest first, always:
   - Online, every request goes to the network first, revalidated with the
     server (cache: 'no-cache'), and the answer is saved. The saved copy is
     used only when the network fails: offline, or a server error. There is
     no timeout, so a slow connection still gets the latest file.
   - The worker is never stale for long: pages register it with
     updateViaCache 'none' and check for an update on every load and when
     they come back online, so the browser compares /sw.js and its import
     (js/offline-cache.js) with the server each time. A new version installs,
     takes over at once (skipWaiting, clients.claim), and tells open pages,
     which reload if they run older code.
   - Back online, the pages ask the worker to fetch every saved file again
     (a 'refresh' message).

   Offline:
   - Installing saves every page and every file they need
     (js/offline-cache.js), so the site and the game work offline after one
     visit. Event photos are kept as they're seen. For an update (an older
     version's cache is here) the new version takes over only once all of it
     is saved; if that fails, the old version stays, still network first.
   - A page that was never saved gets the saved 404 page. */

importScripts('/js/offline-cache.js');

(function () {
  'use strict';

  var C = self.MahjongOfflineCache;
  // The imported list's version, so an update check alone (which refetches
  // the imports) moves an old worker to a new version.
  var VERSION = C.VERSION || C.versionFromScriptUrl(self.location.href) || 'dev';
  var CACHE = C.cacheName(VERSION);

  self.addEventListener('install', function (event) {
    event.waitUntil(caches.keys().then(function (names) {
      var update = names.some(function (n) { return n.indexOf(C.CACHE_PREFIX) === 0 && n !== CACHE; });
      return C.precache({ caches: caches, fetch: fetch.bind(self), version: VERSION }).then(function (res) {
        if (!res.ok && update) throw new Error('Offline play: could not save ' + res.failed.join(', '));
      });
    }).then(function () { return self.skipWaiting(); }));
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return C.isStaleCache(n, VERSION); }).map(function (n) {
        return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); }).then(function () {
      // Tell open pages which version now answers: a page on older code reloads.
      return self.clients.matchAll({ type: 'window' }).then(function (list) {
        list.forEach(function (client) { client.postMessage({ type: 'version', version: VERSION }); });
      });
    }));
  });

  // Every saved file fetched again from the network; a file that fails keeps its saved copy.
  var refreshing = null;
  function refreshAll() {
    if (refreshing) return refreshing;
    refreshing = caches.open(CACHE).then(function (cache) {
      return cache.keys().then(function (reqs) {
        var queue = reqs.map(function (r) { return new URL(r.url).pathname; });
        var updated = 0;
        function worker() {
          if (!queue.length) return Promise.resolve();
          var key = queue.shift();
          return fetch(key, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
            if (!C.cacheable(res)) return;
            updated++;
            return cache.put(key, res);
          }).catch(function () {}).then(worker);
        }
        var workers = [];
        for (var i = 0; i < 6; i++) workers.push(worker());
        return Promise.all(workers).then(function () { return updated; });
      });
    }).then(function (n) { refreshing = null; return n; }, function () { refreshing = null; return 0; });
    return refreshing;
  }

  self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
    if (data.type === 'refresh') {
      event.waitUntil(refreshAll().then(function (n) {
        if (event.source) event.source.postMessage({ type: 'refreshed', updated: n, version: VERSION });
      }));
    }
  });

  // The cached copy: this version's cache first, then any of ours.
  function fromCache(key) {
    return caches.open(CACHE).then(function (cache) { return cache.match(key); }).then(function (hit) {
      return hit || caches.match(key);
    });
  }

  function store(key, res) {
    if (!C.cacheable(res)) return Promise.resolve();
    var copy = res.clone();
    return caches.open(CACHE).then(function (cache) { return cache.put(key, copy); }).catch(function () {});
  }

  // A navigation can't be answered with a redirected response.
  function clean(res) {
    if (!res || !res.redirected) return res;
    return res.blob().then(function (body) {
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    });
  }

  // The network first, revalidated, and saved; the saved copy only when the network fails.
  function networkFirst(event, req, key) {
    // A navigation's own request can't take options, so its URL is fetched.
    var network = req.mode === 'navigate'
      ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      : fetch(req, { cache: 'no-cache' });
    return network.then(function (res) {
      // Registered before the page reads the body, so the copy is taken first.
      event.waitUntil(store(key, res));
      if (res.ok || res.status === 304) return res;
      // A server error: the saved copy, if there is one.
      return res.status >= 500 ? fromCache(key).then(function (cached) { return cached || res; }) : res;
    }, function () {
      return fromCache(key).then(function (cached) {
        if (cached) return cached;
        // A page that was never saved: the saved 404 page.
        if (req.mode === 'navigate') {
          return fromCache(C.OFFLINE_PAGE).then(function (page) { return page || Promise.reject(new Error('offline')); });
        }
        return Promise.reject(new Error('offline'));
      });
    });
  }

  self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    var key = C.cacheKey(url);
    var range = req.headers.get('range');
    if (range) {
      // Audio asks for byte ranges: the network's own answer, or, when it
      // fails, a range cut from the saved file (a partial response isn't saved).
      var sliced = function () {
        return fromCache(key).then(function (cached) {
          return cached ? C.rangeResponse(cached, range) : fetch(req);
        });
      };
      event.respondWith(fetch(req).catch(sliced));
      return;
    }
    event.respondWith(networkFirst(event, req, key).then(clean));
  });
})();
