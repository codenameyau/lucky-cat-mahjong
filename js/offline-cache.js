/* Offline play: what the play page needs with no connection, and how it is
   cached. Shared by the service worker (/play-mahjong/sw.js loads it with
   importScripts), the page (js/play-offline.js) and the tests.

   - ASSETS lists every file the game, its lazily loaded model weights, its
     sounds and music fetch (playback is a view of the game page, and
     /play-mahjong/playback/ is kept as the old address's redirect). Tests check the list
     against the pages and the game's code, so a new file can't be missed.
   - Each GAME_VERSION gets its own cache (cacheName). A new version's
     service worker fills its cache, then deletes the older ones.
   - Code (pages, scripts, styles, data) is network first, so an online
     visit always runs the latest JS. Media (tiles, sounds, music, fonts,
     images) is cache first: it doesn't change between versions. On a local
     dev host everything is network first, so a cache never hides a change. */

(function (root) {
  'use strict';

  var CACHE_PREFIX = 'lcm-play-v';
  // The old Play offline button's flag (0.45.0 builds before offline became the default), cleaned up.
  var OLD_FLAG_CACHE = 'lcm-play-offline';
  var SCOPE = '/play-mahjong/';
  var SW_URL = '/play-mahjong/sw.js';
  // A slow network falls back to the cached copy after this long.
  var NETWORK_TIMEOUT_MS = 4000;

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
    'offline-cache', 'play-offline',
  ];

  var ASSETS = [
    '/play-mahjong/',
    '/play-mahjong/playback/',
    '/play-mahjong/manifest.webmanifest',
    '/data/nav.json',
    '/css/fonts.css',
    '/css/styles.css',
    '/css/play.css',
    '/fonts/kn-yuanmo-sc.woff2',
    '/favicon-32.png',
    '/logo.png',
    '/logo.webp',
    '/apple-touch-icon.png',
    '/assets/icons/app-icon-192.png',
    '/assets/icons/app-icon-512.png',
  ].concat(
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

  // The version the service worker was registered for: /play-mahjong/sw.js?v=0.44.8.
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

  // 'cache' (cache first) or 'network' (network first, cache when offline).
  function strategyFor(pathname, local) {
    if (local) return 'network';
    return isMedia(pathname) ? 'cache' : 'network';
  }

  // Where a request is kept: the path alone, so /play-mahjong/?opened=1 and
  // /play-mahjong/index.html find the page.
  function cacheKey(url) {
    var u = typeof url === 'string' ? new URL(url, 'https://x.invalid') : url;
    var path = u.pathname.replace(/\/index\.html$/i, '/');
    return path;
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

  // Fills the version's cache with every listed file. Code is fetched again
  // (revalidated); media already cached, in this version or an older one,
  // is kept. opts: { caches, fetch, version, assets, onlyMissing, onProgress(done, total), concurrency }.
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
          if (have && (opts.onlyMissing || isMedia(path))) return;
          var reuse = isMedia(path) ? cs.match(path) : Promise.resolve(null);
          return reuse.then(function (old) {
            if (old) return cache.put(path, old);
            return fetchFn(path, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
              if (!cacheable(res)) throw new Error(path + ' ' + (res && res.status));
              return cache.put(path, res);
            });
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
    SCOPE: SCOPE,
    SW_URL: SW_URL,
    NETWORK_TIMEOUT_MS: NETWORK_TIMEOUT_MS,
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
