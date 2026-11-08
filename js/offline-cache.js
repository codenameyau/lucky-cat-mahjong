/* Offline: what the interactive pages need with no connection, and how it is
   cached. Shared by the service worker (/sw.js loads it with importScripts),
   the pages (js/offline.js) and the tests.

   - Only the interactive pages are kept: the Points Guide
     (/hong-kong-mahjong-scoring/), the options page (/play-mahjong/) and the
     game (/playing-mahjong/), with every file they load, the game's lazily
     loaded model weights, sounds and music included. ASSETS lists them all,
     and tests check it against the pages and the game's code, so a new file
     can't be missed.
   - The worker answers only for those files (isSaved). Every other request,
     the rest of the site included, goes to the network untouched and is
     never saved.
   - Online, a saved file is fetched from the network first, revalidated with
     the server (cache: 'no-cache', so the browser's HTTP cache can't hand
     back an old file either), and saved again. The saved copy answers only
     when the network fails. No timeout: a slow connection waits for the
     latest file rather than getting an old one.
   - Each version (VERSION, the game's GAME_VERSION) gets its own cache
     (cacheName). A new version's service worker fills its cache, then
     deletes the older ones. */

(function (root) {
  'use strict';

  // The game's version (GAME_VERSION in js/mahjong-engine.js; a test keeps them equal).
  var VERSION = '0.57.3';
  var CACHE_PREFIX = 'lcm-play-v';
  // The old Play offline button's flag (0.45.0 builds before offline became the default), cleaned up.
  var OLD_FLAG_CACHE = 'lcm-play-offline';
  var SCOPE = '/';
  var SW_URL = '/sw.js';
  // The game's own worker before the site had one, unregistered when found.
  var OLD_SCOPE = '/play-mahjong/';

  var TILES = [
    '01-white-dragon', '02-green-dragon', '03-red-dragon',
    '04-east-wind', '05-south-wind', '06-west-wind', '07-north-wind',
    '08-characters-1', '09-characters-2', '10-characters-3', '11-characters-4', '12-characters-5',
    '13-characters-6', '14-characters-7', '15-characters-8', '16-characters-9',
    '17-circles-1', '18-circles-2', '19-circles-3', '20-circles-4', '21-circles-5',
    '22-circles-6', '23-circles-7', '24-circles-8', '25-circles-9',
    '26-bamboos-1', '27-bamboos-2', '28-bamboos-3', '29-bamboos-4', '30-bamboos-5',
    '31-bamboos-6', '32-bamboos-7', '33-bamboos-8', '34-bamboos-9',
    '35-spring', '36-summer', '37-autumn', '38-winter',
    '39-plum', '40-orchid', '41-chrysanthemum', '42-bamboo',
  ];

  var SOUNDS = [
    'draw-game', 'flower', 'gong', 'impact-chow', 'impact-kong', 'impact-pung', 'other-win',
    'tile-claim-1', 'tile-claim-2', 'tile-discard', 'tile-draw', 'tile-kong', 'tile-select',
    'tiles-reveal', 'turn',
  ];

  var MUSIC = ['guzheng-city', 'shenyang', 'ripples'];

  var SCRIPTS = [
    'nav', 'points',
    'mahjong-engine', 'mahjong-bot', 'mahjong-lucky-cat', 'mahjong-jorge-yau',
    'mahjong-ml-features', 'mahjong-ml-model', 'mahjong-ml', 'mahjong-only-orphans',
    'mahjong-lucky-cat-net', 'mahjong-lucky-cat-ml', 'mahjong-strategies', 'mahjong-coach',
    'mahjong-analysis', 'mahjong-lesson', 'mahjong-rules', 'mahjong-game',
    // Loaded later by the game (loadAssets in mahjong-game.js).
    'mahjong-ml-weights', 'mahjong-only-orphans-weights', 'mahjong-lucky-cat-weights',
    'offline-cache', 'offline', 'play-options',
  ];

  // The interactive pages, the only ones kept offline: the Points Guide, the
  // options page and the game. The rest of the site is left to the network.
  var PAGES = [
    '/hong-kong-mahjong-scoring/',
    '/play-mahjong/',
    '/playing-mahjong/',
  ];

  // The header's links (js/nav.js).
  var DATA = ['nav'];

  var STYLES = ['fonts', 'styles', 'play', 'points'];

  var ASSETS = PAGES.concat([
    '/play-mahjong/manifest.webmanifest',
    '/fonts/kn-yuanmo-sc.woff2',
    '/favicon-32.png',
    '/logo.png',
    '/logo.webp',
    '/apple-touch-icon.png',
    '/assets/icons/app-icon-192.png',
    '/assets/icons/app-icon-512.png',
  ]).concat(
    STYLES.map(function (n) { return '/css/' + n + '.css'; }),
    DATA.map(function (n) { return '/data/' + n + '.json'; }),
    SCRIPTS.map(function (n) { return '/js/' + n + '.js'; }),
    TILES.map(function (n) { return '/tiles/' + n + '.svg'; }),
    SOUNDS.map(function (n) { return '/assets/sounds/' + n + '.wav'; }),
    MUSIC.map(function (n) { return '/assets/music/' + n + '.m4a'; })
  );

  var MEDIA_EXT = /\.(svg|png|webp|jpe?g|gif|ico|wav|m4a|mp3|ogg|woff2?|ttf)$/i;

  function cacheName(version) {
    return CACHE_PREFIX + version;
  }

  // Our caches from other versions, to delete once this one is in place.
  function isStaleCache(name, version) {
    return name === OLD_FLAG_CACHE || (name.indexOf(CACHE_PREFIX) === 0 && name !== cacheName(version));
  }

  // The version the service worker was registered for: /sw.js?v=0.57.3.
  function versionFromScriptUrl(href) {
    var m = /[?&]v=([^&#]+)/.exec(String(href));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function scriptUrl(version) {
    return SW_URL + '?v=' + encodeURIComponent(version);
  }

  function isLocalHost(hostname) {
    return /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|[^.]+\.local|.+\.localhost|.+\.test)$/i.test(String(hostname));
  }

  function isMedia(pathname) {
    return MEDIA_EXT.test(pathname);
  }

  // Always 'network': the network first, the saved copy only when it fails.
  // (Media too: an unchanged file is a cheap 304, and a changed one is never missed.)
  function strategyFor() {
    return 'network';
  }

  // Where a request is kept: the path alone, so /playing-mahjong/?new=1 and
  // /playing-mahjong/index.html find the page.
  function cacheKey(url) {
    var u = typeof url === 'string' ? new URL(url, 'https://x.invalid') : url;
    var path = u.pathname.replace(/\/index\.html$/i, '/');
    return path;
  }

  // One of the files kept offline (by its cache key). Nothing else is touched.
  var SAVED = {};
  ASSETS.forEach(function (p) { SAVED[p] = true; });
  function isSaved(key) {
    return SAVED[key] === true;
  }

  // A 206 for a media element's Range request, cut from the full cached file
  // (Safari's audio needs this to play from the cache).
  function rangeResponse(full, rangeHeader) {
    var m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || '').trim());
    return full.arrayBuffer().then(function (buf) {
      var size = buf.byteLength;
      var start, end;
      if (!m || (m[1] === '' && m[2] === '')) { start = 0; end = size - 1; }
      else if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      }
      var headers = new Headers(full.headers);
      headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
      headers.set('Content-Length', String(end - start + 1));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers: headers });
    });
  }

  // Only whole, same-origin, successful responses go in the cache.
  function cacheable(res) {
    return !!res && res.status === 200 && (res.type === 'basic' || res.type === 'default');
  }

  // The listed files the version's cache doesn't have yet.
  function missing(cacheStorage, version, assets) {
    assets = assets || ASSETS;
    return cacheStorage.open(cacheName(version)).then(function (cache) {
      return Promise.all(assets.map(function (path) {
        return cache.match(path).then(function (r) { return r ? null : path; });
      }));
    }).then(function (list) { return list.filter(Boolean); });
  }

  // Fills the version's cache with every listed file, each fetched from the
  // network and revalidated (an unchanged file is a 304 from the browser's
  // HTTP cache, so this is cheap), so a new version never keeps an old file. opts: { caches, fetch, version, assets, onlyMissing, onProgress(done, total), concurrency }.
  // Resolves { ok, total, failed: [path] }.
  function precache(opts) {
    var cs = opts.caches;
    var fetchFn = opts.fetch;
    var assets = (opts.assets || ASSETS).slice();
    var total = assets.length;
    var done = 0;
    var failed = [];
    var progress = opts.onProgress || function () {};
    return cs.open(cacheName(opts.version)).then(function (cache) {
      function one(path) {
        return cache.match(path).then(function (have) {
          if (have && opts.onlyMissing) return;
          return fetchFn(path, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
            if (!cacheable(res)) throw new Error(path + ' ' + (res && res.status));
            return cache.put(path, res);
          });
        }).then(function () {}, function () { failed.push(path); }).then(function () {
          done++;
          progress(done, total);
        });
      }
      var queue = assets.slice();
      function worker() {
        if (!queue.length) return Promise.resolve();
        return one(queue.shift()).then(worker);
      }
      var workers = [];
      for (var i = 0; i < (opts.concurrency || 6); i++) workers.push(worker());
      return Promise.all(workers);
    }).then(function () {
      return { ok: failed.length === 0, total: total, failed: failed };
    });
  }

  var api = {
    CACHE_PREFIX: CACHE_PREFIX,
    OLD_FLAG_CACHE: OLD_FLAG_CACHE,
    VERSION: VERSION,
    SCOPE: SCOPE,
    SW_URL: SW_URL,
    OLD_SCOPE: OLD_SCOPE,
    PAGES: PAGES,
    isSaved: isSaved,
    ASSETS: ASSETS,
    cacheName: cacheName,
    isStaleCache: isStaleCache,
    versionFromScriptUrl: versionFromScriptUrl,
    scriptUrl: scriptUrl,
    isLocalHost: isLocalHost,
    isMedia: isMedia,
    strategyFor: strategyFor,
    cacheKey: cacheKey,
    rangeResponse: rangeResponse,
    cacheable: cacheable,
    missing: missing,
    precache: precache,
  };
  root.MahjongOfflineCache = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
