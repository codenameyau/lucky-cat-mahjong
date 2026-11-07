'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const C = require('./offline-cache.js');
const Offline = require('./play-offline.js');
const E = require('./mahjong-engine.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const listed = new Set(C.ASSETS);

function fileFor(url) {
  const p = url.replace(/^\//, '');
  return path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
}

// Same-origin files a page loads: scripts, styles, icons, the manifest, preloads.
function pageRefs(html) {
  const refs = [];
  const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="(\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (/<link[^>]*rel="canonical"/.test(m[0])) continue;
    refs.push(m[1]);
  }
  return refs;
}

describe('the offline file list', function () {
  it('lists only files that exist, each once', function () {
    assert.equal(listed.size, C.ASSETS.length);
    C.ASSETS.forEach(function (url) {
      assert.ok(fs.existsSync(fileFor(url)), url + ' is missing on disk');
    });
  });

  it('has every file the play page and the old playback address load', function () {
    // Playback is a view of the play page; /play-mahjong/playback/ only
    // redirects there, so it loads little more than its icon.
    assert.ok(pageRefs(read('play-mahjong/index.html')).length > 10);
    ['play-mahjong/index.html', 'play-mahjong/playback/index.html'].forEach(function (page) {
      pageRefs(read(page)).forEach(function (ref) { assert.ok(listed.has(ref), page + ' loads ' + ref); });
    });
    assert.ok(listed.has('/play-mahjong/'));
    assert.ok(listed.has('/play-mahjong/playback/'));
  });

  it('has the scripts the game loads later, like the model weights', function () {
    const src = read('js/mahjong-game.js');
    const scripts = src.match(/'\/js\/[\w.-]+\.js'/g).map((s) => s.slice(1, -1));
    assert.ok(scripts.includes('/js/mahjong-lucky-cat-weights.js'));
    assert.ok(scripts.includes('/js/mahjong-ml-weights.js'));
    assert.ok(scripts.includes('/js/mahjong-only-orphans-weights.js'));
    scripts.forEach(function (s) { assert.ok(listed.has(s), s); });
  });

  it('has every tile, sound and music file', function () {
    Object.values(E.HKScoring.TILE_BY_ID).forEach(function (t) {
      assert.ok(listed.has('/tiles/' + t.file), t.file);
    });
    const src = read('js/mahjong-game.js');
    const cues = src.slice(src.indexOf('var CUES'), src.indexOf('var MUSIC_DIR'));
    const clips = new Set();
    (cues.match(/clips: \[[^\]]*\]/g) || []).forEach((m) => (m.match(/'([\w-]+)'/g) || []).forEach((q) => clips.add(q.slice(1, -1))));
    (cues.match(/\['([\w-]+)',/g) || []).forEach((m) => clips.add(m.slice(2, -2)));
    assert.ok(clips.size > 10);
    clips.forEach(function (c) { assert.ok(listed.has('/assets/sounds/' + c + '.wav'), c); });
    const music = src.match(/file: '([\w-]+\.m4a)'/g).map((m) => m.slice(7, -1));
    assert.equal(music.length, 3);
    music.forEach(function (f) { assert.ok(listed.has('/assets/music/' + f), f); });
  });

  it('has the fonts the styles use and the manifest icons', function () {
    ['css/fonts.css', 'css/styles.css', 'css/play.css'].forEach(function (css) {
      const urls = read(css).match(/url\(["']?[^)"']+["']?\)/g) || [];
      urls.forEach(function (u) {
        const ref = u.replace(/^url\(["']?|["']?\)$/g, '');
        if (/^(data:|https?:)/.test(ref)) return;
        const abs = path.posix.normalize(path.posix.join('/' + path.posix.dirname(css), ref));
        assert.ok(listed.has(abs), css + ' uses ' + abs);
      });
    });
    const manifest = JSON.parse(read('play-mahjong/manifest.webmanifest'));
    assert.equal(manifest.start_url, C.SCOPE);
    manifest.icons.forEach(function (icon) { assert.ok(listed.has(icon.src), icon.src); });
  });
});

describe('cache names and versions', function () {
  it('keys the cache by GAME_VERSION', function () {
    assert.equal(C.cacheName(E.GAME_VERSION), 'lcm-play-v' + E.GAME_VERSION);
    assert.equal(C.versionFromScriptUrl('https://x.com' + C.scriptUrl(E.GAME_VERSION)), E.GAME_VERSION);
    assert.equal(C.versionFromScriptUrl('/play-mahjong/sw.js'), null);
  });

  it('deletes only our caches from other versions, and the old Play offline flag', function () {
    assert.equal(C.isStaleCache('lcm-play-v0.44.7', '0.44.8'), true);
    assert.equal(C.isStaleCache('lcm-play-v0.44.8', '0.44.8'), false);
    assert.equal(C.isStaleCache(C.OLD_FLAG_CACHE, '0.44.8'), true);
    assert.equal(C.isStaleCache('someone-else', '0.44.8'), false);
  });

  it('serves code network first and media cache first, and all network first on a dev host', function () {
    assert.equal(C.strategyFor('/js/mahjong-game.js', false), 'network');
    assert.equal(C.strategyFor('/play-mahjong/', false), 'network');
    assert.equal(C.strategyFor('/css/play.css', false), 'network');
    assert.equal(C.strategyFor('/tiles/01-white-dragon.svg', false), 'cache');
    assert.equal(C.strategyFor('/assets/music/ripples.m4a', false), 'cache');
    assert.equal(C.strategyFor('/fonts/kn-yuanmo-sc.woff2', false), 'cache');
    assert.equal(C.strategyFor('/tiles/01-white-dragon.svg', true), 'network');
  });

  it('knows the dev hosts', function () {
    ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'lucky.test'].forEach((h) => assert.equal(C.isLocalHost(h), true, h));
    ['luckycatmahjong.com', 'staging.luckycatmahjong.com'].forEach((h) => assert.equal(C.isLocalHost(h), false, h));
  });

  it('keys pages by path, without the query or index.html', function () {
    assert.equal(C.cacheKey('https://x.com/play-mahjong/?opened=1'), '/play-mahjong/');
    assert.equal(C.cacheKey('https://x.com/play-mahjong/index.html'), '/play-mahjong/');
    assert.equal(C.cacheKey('https://x.com/play-mahjong/playback/?replay=1'), '/play-mahjong/playback/');
    assert.equal(C.cacheKey('https://x.com/js/mahjong-game.js'), '/js/mahjong-game.js');
  });
});

describe('range requests', function () {
  const full = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), { headers: { 'Content-Type': 'audio/mp4' } });

  it('cuts the asked bytes from the cached file', async function () {
    const res = await C.rangeResponse(full(), 'bytes=2-5');
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('Content-Range'), 'bytes 2-5/10');
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5]);
  });

  it('handles open and suffix ranges, and refuses one past the end', async function () {
    assert.equal((await C.rangeResponse(full(), 'bytes=0-')).headers.get('Content-Range'), 'bytes 0-9/10');
    assert.equal((await C.rangeResponse(full(), 'bytes=-3')).headers.get('Content-Range'), 'bytes 7-9/10');
    assert.equal((await C.rangeResponse(full(), 'bytes=20-')).status, 416);
  });
});

// A Cache Storage in memory, enough for precache, missing and the flag.
function fakeCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (key) => m.get(key),
      put: async (key, res) => { m.set(key, res); },
    };
  };
  return {
    stores,
    open,
    delete: async (name) => stores.delete(name),
    keys: async () => [...stores.keys()],
    match: async (key) => {
      for (const m of stores.values()) if (m.has(key)) return m.get(key);
      return undefined;
    },
  };
}

describe('precache', function () {
  const assets = ['/play-mahjong/', '/js/a.js', '/tiles/x.svg', '/assets/music/m.m4a'];

  it('saves every file and reports progress', async function () {
    const cs = fakeCaches();
    const fetched = [];
    const progress = [];
    const res = await C.precache({
      caches: cs, version: '1.0.0', assets,
      fetch: async (p, init) => { fetched.push([p, init.cache]); return new Response(p); },
      onProgress: (done, total) => progress.push(done + '/' + total),
    });
    assert.deepEqual(res, { ok: true, total: 4, failed: [] });
    assert.equal(fetched.length, 4);
    assert.ok(fetched.every((f) => f[1] === 'no-cache'));
    assert.equal(progress[progress.length - 1], '4/4');
    assert.deepEqual(await C.missing(cs, '1.0.0', assets), []);
    assert.deepEqual(await C.missing(cs, '2.0.0', assets), assets);
  });

  it('refetches code for a new version but keeps the media it already has', async function () {
    const cs = fakeCaches();
    await C.precache({ caches: cs, version: '1.0.0', assets, fetch: async (p) => new Response(p) });
    const fetched = [];
    const res = await C.precache({ caches: cs, version: '1.1.0', assets, fetch: async (p) => { fetched.push(p); return new Response(p); } });
    assert.equal(res.ok, true);
    assert.deepEqual(fetched.sort(), ['/js/a.js', '/play-mahjong/']);
    assert.deepEqual(await C.missing(cs, '1.1.0', assets), []);
  });

  it('only fetches what is missing when asked', async function () {
    const cs = fakeCaches();
    await C.precache({ caches: cs, version: '1.0.0', assets: assets.slice(0, 2), fetch: async (p) => new Response(p) });
    const fetched = [];
    await C.precache({ caches: cs, version: '1.0.0', assets, onlyMissing: true, fetch: async (p) => { fetched.push(p); return new Response(p); } });
    assert.deepEqual(fetched.sort(), ['/assets/music/m.m4a', '/tiles/x.svg']);
  });

  it('reports the files it could not save', async function () {
    const cs = fakeCaches();
    const res = await C.precache({
      caches: cs, version: '1.0.0', assets,
      fetch: async (p) => {
        if (p === '/js/a.js') throw new TypeError('offline');
        if (p === '/tiles/x.svg') return new Response('nope', { status: 404 });
        return new Response(p);
      },
    });
    assert.equal(res.ok, false);
    assert.deepEqual(res.failed.sort(), ['/js/a.js', '/tiles/x.svg']);
  });

});

describe('offline by default', function () {
  it('has no button: the menu has no Play offline, and the page registers the worker itself', function () {
    const game = read('js/mahjong-game.js');
    assert.ok(!/Play offline|MahjongOffline/.test(game));
    // In node there is no service worker and no web page.
    assert.equal(Offline.supported(), false);
    assert.equal(Offline.unsupportedReason(), 'file');
  });

  it('installs the whole game for everyone, and only an update must save it all', function () {
    const sw = read('play-mahjong/sw.js');
    assert.ok(!/isEnabled/.test(sw));
    assert.match(sw, /if \(!res\.ok && update\) throw/);
  });

  it('tops up what is missing when it is back online', function () {
    assert.match(read('js/play-offline.js'), /addEventListener\('online'/);
  });
});
