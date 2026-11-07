/* The play page's service worker, registered by js/play-offline.js for every player as
   /play-mahjong/sw.js?v=<GAME_VERSION>, so each version is a new worker with
   its own cache. Its scope is /play-mahjong/ (the game and its playback);
   the rest of the site is left alone.

   - Code (pages, scripts, styles, data): network first, so online play runs
     the latest JS. Offline, or when the network takes longer than
     NETWORK_TIMEOUT_MS, the cached copy.
   - Media (tiles, sounds, music, fonts, images): cache first.
   - On localhost and other dev hosts everything is network first.
   - Installing saves every file the game needs, for every player, so the
     game plays offline after one visit. For an update (an older version's
     cache is here) the new version takes over only once all of it is saved;
     if that fails (offline, say), the old version stays and keeps working
     offline. A first install keeps what it could save, and the page tops up
     the rest when it's online. */

importScripts('/js/offline-cache.js');

(function () {
  'use strict';

  var C = self.MahjongOfflineCache;
  var VERSION = C.versionFromScriptUrl(self.location.href) || 'dev';
  var CACHE = C.cacheName(VERSION);
  var LOCAL = C.isLocalHost(self.location.hostname);

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
    }).then(function () { return self.clients.claim(); }));
  });

  self.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
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

  function networkFirst(event, req, key) {
    // Revalidated, so the HTTP cache can't hand back an old script. A
    // navigation's own request can't take options, so its URL is fetched.
    var network = req.mode === 'navigate'
      ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      : fetch(req, { cache: 'no-cache' });
    // Registered first, so the copy is taken before the page reads the body.
    event.waitUntil(network.then(function (res) { return store(key, res); }, function () {}));
    return fromCache(key).then(function (cached) {
      if (!cached) return network;
      if (self.navigator && self.navigator.onLine === false) {
        network.catch(function () {});
        return cached;
      }
      // Whichever comes first: the network, or the cache after a timeout.
      // A network error falls back to the cache at once.
      return new Promise(function (resolve) {
        var settled = false;
        var finish = function (res) { if (!settled) { settled = true; resolve(res); } };
        var timer = LOCAL ? null : setTimeout(function () { finish(cached); }, C.NETWORK_TIMEOUT_MS);
        network.then(function (res) {
          clearTimeout(timer);
          finish(res.ok ? res : cached);
        }, function () {
          clearTimeout(timer);
          finish(cached);
        });
      });
    });
  }

  function cacheFirst(event, req, key) {
    return fromCache(key).then(function (cached) {
      if (cached) return cached;
      var network = fetch(req);
      event.waitUntil(network.then(function (res) { return store(key, res); }, function () {}));
      return network;
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
      // Audio asks for byte ranges. They are cut from the cached file (a
      // partial response from the network isn't cached). On a dev host the
      // network answers first.
      var sliced = function () {
        return fromCache(key).then(function (cached) {
          return cached ? C.rangeResponse(cached, range) : fetch(req);
        });
      };
      event.respondWith(LOCAL
        ? fetch(req).catch(sliced)
        : sliced().catch(function () { return fetch(req); }));
      return;
    }
    var handle = C.strategyFor(url.pathname, LOCAL) === 'cache' ? cacheFirst : networkFirst;
    event.respondWith(Promise.resolve(handle(event, req, key)).then(clean));
  });
})();
