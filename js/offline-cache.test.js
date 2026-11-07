'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const C = require('./offline-cache.js');
const Offline = require('./offline.js');
const E = require('./mahjong-engine.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const listed = new Set(C.ASSETS);

function fileFor(url) {
  const p = url.replace(/^\//, '');
  return path.join(ROOT, p.endsWith('/') ? p + 'index.html' : p);
}

// Same-origin files a page loads: scripts, styles, icons, images, the manifest,
// preloads. Relative paths are read from the page's own address.
function pageRefs(html, page) {
  const base = 'https://x.invalid/' + page;
  const refs = [];
  const add = (u) => {
    if (/^(https?:|\/\/|data:|mailto:|tel:|javascript:|#)/.test(u)) return;
    refs.push(new URL(u, base).pathname);
  };
  const re = /<(?:script[^>]*\ssrc|link[^>]*\shref|img[^>]*\ssrc|source[^>]*\ssrc)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    if (/<link[^>]*rel="canonical"/.test(m[0])) continue;
    add(m[1]);
  }
  (html.match(/srcset="[^"]+"/g) || []).forEach((attr) => attr.slice(8, -1).split(',').forEach((part) => add(part.trim().split(' ')[0])));
  return refs;
}

// Every page of the site (docs, ml and the tools aren't served pages).
function sitePages() {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((d) => {
      const rel = dir ? dir + '/' + d.name : d.name;
      if (d.isDirectory()) {
        if (!/^(node_modules|ml|docs|scripts|\.|media)/.test(d.name)) walk(rel);
      } else if (d.name === 'index.html' || (!dir && d.name.endsWith('.html'))) out.push(rel);
    });
  })('');
  return out;
}

function pageUrl(file) {
  return '/' + file.replace(/index\.html$/, '');
}

describe('the offline file list', function () {
  it('lists only files that exist, each once', function () {
    assert.equal(listed.size, C.ASSETS.length);
    C.ASSETS.forEach(function (url) {
      assert.ok(fs.existsSync(fileFor(url)), url + ' is missing on disk');
    });
  });

  it('keeps only the interactive pages, and every file each of them loads', function () {
    assert.deepEqual(C.PAGES.slice().sort(), ['/hong-kong-mahjong-scoring/', '/play-mahjong/', '/playing-mahjong/']);
    C.PAGES.forEach(function (url) {
      const page = url.replace(/^\//, '') + 'index.html';
      pageRefs(read(page), page).forEach(function (ref) {
        assert.ok(listed.has(ref), page + ' loads ' + ref);
      });
    });
    assert.ok(pageRefs(read('playing-mahjong/index.html'), 'playing-mahjong/index.html').length > 10);
    ['/', '/community/', '/events/', '/which-mahjong-tiles-are-you/', '/404.html', '/play-mahjong/playback/']
      .forEach((p) => assert.ok(!listed.has(p), p + ' is not kept'));
  });

  it('has the header\'s links', function () {
    assert.ok(listed.has('/data/nav.json'));
    assert.match(read('js/nav.js'), /\/data\/nav\.json/);
  });

  it('is registered from the interactive pages only', function () {
    sitePages().forEach(function (page) {
      const html = read(page);
      const kept = C.PAGES.includes(pageUrl(page));
      assert.equal(/src="\/js\/offline-cache\.js"/.test(html), kept, page);
      assert.equal(/src="\/js\/offline\.js"/.test(html), kept, page);
    });
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
    ['css/fonts.css', 'css/styles.css', 'css/play.css', 'css/points.css'].forEach(function (css) {
      const urls = read(css).match(/url\(["']?[^)"']+["']?\)/g) || [];
      urls.forEach(function (u) {
        const ref = u.replace(/^url\(["']?|["']?\)$/g, '');
        if (/^(data:|https?:)/.test(ref)) return;
        const abs = path.posix.normalize(path.posix.join('/' + path.posix.dirname(css), ref));
        assert.ok(listed.has(abs), css + ' uses ' + abs);
      });
    });
    const manifest = JSON.parse(read('play-mahjong/manifest.webmanifest'));
    assert.equal(manifest.scope, C.SCOPE);
    assert.ok(listed.has(manifest.start_url));
    manifest.icons.forEach(function (icon) { assert.ok(listed.has(icon.src), icon.src); });
  });
});

describe('cache names and versions', function () {
  it('keys the cache by GAME_VERSION, and keeps its own copy of it', function () {
    assert.equal(C.VERSION, E.GAME_VERSION);
    assert.equal(C.cacheName(E.GAME_VERSION), 'lcm-play-v' + E.GAME_VERSION);
    assert.equal(C.versionFromScriptUrl('https://x.com' + C.scriptUrl(E.GAME_VERSION)), E.GAME_VERSION);
    assert.equal(C.versionFromScriptUrl('/sw.js'), null);
    assert.equal(C.SW_URL, '/sw.js');
    assert.equal(C.SCOPE, '/');
  });

  it('deletes only our caches from other versions, and the old Play offline flag', function () {
    assert.equal(C.isStaleCache('lcm-play-v0.44.7', '0.44.8'), true);
    assert.equal(C.isStaleCache('lcm-play-v0.44.8', '0.44.8'), false);
    assert.equal(C.isStaleCache(C.OLD_FLAG_CACHE, '0.44.8'), true);
    assert.equal(C.isStaleCache('someone-else', '0.44.8'), false);
  });

  it('always goes to the network first, for every kind of file', function () {
    ['/js/mahjong-game.js', '/play-mahjong/', '/playing-mahjong/', '/data/community.json', '/css/play.css',
      '/tiles/01-white-dragon.svg', '/assets/music/ripples.m4a', '/fonts/kn-yuanmo-sc.woff2', '/media/2026-03-15/a.webp']
      .forEach((p) => assert.equal(C.strategyFor(p), 'network', p));
  });

  it('knows the dev hosts', function () {
    ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'lucky.test'].forEach((h) => assert.equal(C.isLocalHost(h), true, h));
    ['luckycatmahjong.com', 'staging.luckycatmahjong.com'].forEach((h) => assert.equal(C.isLocalHost(h), false, h));
  });

  it('keys pages by path, without the query or index.html', function () {
    assert.equal(C.cacheKey('https://x.com/playing-mahjong/?new=1'), '/playing-mahjong/');
    assert.equal(C.cacheKey('https://x.com/playing-mahjong/index.html'), '/playing-mahjong/');
    assert.equal(C.cacheKey('https://x.com/?x=1'), '/');
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
      match: async (key) => (m.has(key) ? m.get(key).clone() : undefined),
      put: async (key, res) => { m.set(key, res); },
      keys: async () => [...m.keys()].map((k) => ({ url: 'https://site.example' + k })),
    };
  };
  return {
    stores,
    open,
    delete: async (name) => stores.delete(name),
    keys: async () => [...stores.keys()],
    match: async (key) => {
      for (const m of stores.values()) if (m.has(key)) return m.get(key).clone();
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

  it('fetches every file again for a new version, media too, so no old file is kept', async function () {
    const cs = fakeCaches();
    await C.precache({ caches: cs, version: '1.0.0', assets, fetch: async (p) => new Response(p) });
    const fetched = [];
    const res = await C.precache({ caches: cs, version: '1.1.0', assets, fetch: async (p, init) => { fetched.push([p, init.cache]); return new Response(p); } });
    assert.equal(res.ok, true);
    assert.deepEqual(fetched.map((f) => f[0]).sort(), assets.slice().sort());
    assert.ok(fetched.every((f) => f[1] === 'no-cache'), 'revalidated with the server');
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

  it('installs the whole site for everyone, and only an update must save it all', function () {
    const sw = read('sw.js');
    assert.ok(!/isEnabled/.test(sw));
    assert.match(sw, /if \(!res\.ok && update\) throw/);
  });

  it('checks for a newer worker on every load and back online, bypassing the HTTP cache', function () {
    const page = read('js/offline.js');
    assert.match(page, /updateViaCache: 'none'/);
    assert.match(page, /reg\.update\(\)/);
    assert.match(page, /addEventListener\('online', refreshOnline\)/);
    assert.match(page, /postMessage\(\{ type: 'refresh' \}\)/);
  });

  it('reloads a page on older code once a newer version answers, once per version', function () {
    assert.equal(Offline.newer('0.46.0', '0.45.9'), true);
    assert.equal(Offline.newer('0.46.0', '0.46.0'), false);
    assert.equal(Offline.newer('0.45.10', '0.46.0'), false);
    assert.equal(Offline.newer('1.0.0', '0.99.99'), true);
  });

  it('keeps the old /play-mahjong/ worker\'s script as one that removes itself', function () {
    const old = read('play-mahjong/sw.js');
    assert.match(old, /skipWaiting\(\)/);
    assert.match(old, /registration\.unregister\(\)/);
    assert.doesNotMatch(old, /addEventListener\('fetch'/, 'answers nothing: every request goes to the network');
    assert.doesNotMatch(old, /caches\.delete/, 'leaves the caches to /sw.js');
  });


});

// The real /sw.js, run on a fake worker global: what it answers, online and offline.
describe('the service worker', function () {
  const vm = require('node:vm');
  const ORIGIN = 'https://site.example';

  function loadWorker(net) {
    const listeners = {};
    const cs = fakeCaches();
    const posted = [];
    const self = {
      location: new URL(ORIGIN + '/sw.js?v=' + C.VERSION),
      navigator: { onLine: true },
      addEventListener: (t, fn) => { listeners[t] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [{ postMessage: (m) => posted.push(m) }] },
      MahjongOfflineCache: C,
    };
    const ctx = vm.createContext({
      self, caches: cs, URL, Response, Headers, Promise, setTimeout, clearTimeout, console,
      importScripts: () => {},
      fetch: async (input, init) => net(typeof input === 'string' ? input : input.url, init || {}),
    });
    vm.runInContext(read('sw.js'), ctx);
    async function request(path, opts) {
      opts = opts || {};
      let answer = null;
      const waits = [];
      const req = { url: ORIGIN + path, method: 'GET', mode: opts.navigate ? 'navigate' : 'cors', headers: new Headers(opts.headers || {}) };
      listeners.fetch({ request: req, respondWith: (p) => { answer = p; }, waitUntil: (p) => waits.push(p) });
      if (!answer) return null;
      const res = await answer;
      await Promise.all(waits);
      return res;
    }
    async function lifecycle(type) {
      const waits = [];
      listeners[type]({ waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    }
    return { cs, self, request, lifecycle, posted, listeners };
  }

  const serve = (version) => async (url) => new Response(version + ' ' + new URL(url, ORIGIN).pathname);
  const down = async () => { throw new TypeError('Failed to fetch'); };

  it('online, answers with the network\'s latest file, never an older saved copy', async function () {
    let net = serve('old');
    const w = loadWorker((u, i) => net(u, i));
    assert.equal(await (await w.request('/js/mahjong-game.js')).text(), 'old /js/mahjong-game.js');
    net = serve('new');
    for (const p of ['/js/mahjong-game.js', '/playing-mahjong/', '/tiles/01-white-dragon.svg', '/assets/music/ripples.m4a', '/css/play.css']) {
      assert.equal(await (await w.request(p)).text(), 'new ' + p, p);
    }
    assert.equal(await (await w.request('/playing-mahjong/?new=1', { navigate: true })).text(), 'new /playing-mahjong/');
  });

  it('revalidates every request with the server, so the HTTP cache can\'t serve an old file', async function () {
    const seen = [];
    const w = loadWorker(async (u, init) => { seen.push(init.cache); return new Response('x'); });
    await w.request('/js/mahjong-game.js');
    await w.request('/play-mahjong/', { navigate: true });
    await w.request('/tiles/01-white-dragon.svg');
    assert.deepEqual(seen, ['no-cache', 'no-cache', 'no-cache']);
  });

  it('waits for a slow network rather than serving an old saved copy', async function () {
    let net = serve('old');
    const w = loadWorker((u, i) => net(u, i));
    await w.request('/js/mahjong-game.js');
    net = (u) => new Promise((r) => setTimeout(() => r(new Response('new /js/mahjong-game.js')), 30));
    assert.equal(await (await w.request('/js/mahjong-game.js')).text(), 'new /js/mahjong-game.js');
  });

  it('offline, answers with the saved copy', async function () {
    let net = serve('v1');
    const w = loadWorker((u, i) => net(u, i));
    await w.request('/js/mahjong-game.js');
    await w.request('/playing-mahjong/', { navigate: true });
    await w.request('/hong-kong-mahjong-scoring/', { navigate: true });
    net = down;
    assert.equal(await (await w.request('/js/mahjong-game.js')).text(), 'v1 /js/mahjong-game.js');
    assert.equal(await (await w.request('/playing-mahjong/?new=1', { navigate: true })).text(), 'v1 /playing-mahjong/');
    assert.equal(await (await w.request('/hong-kong-mahjong-scoring/', { navigate: true })).text(), 'v1 /hong-kong-mahjong-scoring/');
  });

  it('leaves the rest of the site alone: not answered, not saved', async function () {
    const w = loadWorker(serve('v1'));
    for (const p of ['/', '/community/', '/events/', '/js/main.js', '/media/2026-03-15/a.webp', '/data/community.json']) {
      assert.equal(await w.request(p, { navigate: p.endsWith('/') }), null, p + ' goes to the network untouched');
    }
    const saved = [...(await w.cs.keys())];
    for (const name of saved) assert.equal((await (await w.cs.open(name)).keys()).length, 0);
  });

  it('a server error falls back to the saved copy; a 404 stays a 404', async function () {
    let net = serve('v1');
    const w = loadWorker((u, i) => net(u, i));
    await w.request('/js/mahjong-game.js');
    net = async () => new Response('oops', { status: 503 });
    assert.equal(await (await w.request('/js/mahjong-game.js')).text(), 'v1 /js/mahjong-game.js');
    net = async () => new Response('gone', { status: 404 });
    assert.equal((await w.request('/js/mahjong-game.js')).status, 404);
  });

  it('audio ranges: the network\'s own answer online, a slice of the saved file offline', async function () {
    let net = async () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5]));
    const w = loadWorker((u, i) => net(u, i));
    await w.request('/assets/music/ripples.m4a');
    net = down;
    const res = await w.request('/assets/music/ripples.m4a', { headers: { range: 'bytes=2-3' } });
    assert.equal(res.status, 206);
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3]);
  });

  it('back online, a refresh fetches every saved file again', async function () {
    let net = serve('old');
    const w = loadWorker((u, i) => net(u, i));
    await w.request('/js/mahjong-game.js');
    await w.request('/tiles/01-white-dragon.svg');
    net = serve('new');
    const replies = [];
    const waits = [];
    w.listeners.message({ data: { type: 'refresh' }, source: { postMessage: (m) => replies.push(m) }, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.equal(replies[0].type, 'refreshed');
    assert.equal(replies[0].updated, 2);
    net = down;
    assert.equal(await (await w.request('/js/mahjong-game.js')).text(), 'new /js/mahjong-game.js');
    assert.equal(await (await w.request('/tiles/01-white-dragon.svg')).text(), 'new /tiles/01-white-dragon.svg');
  });

  it('takes over at once, deletes older versions\' caches and tells open pages its version', async function () {
    const w = loadWorker(serve('v'));
    await w.cs.open('lcm-play-v0.45.0');
    await w.cs.open(C.cacheName(C.VERSION));
    await w.lifecycle('activate');
    assert.deepEqual(await w.cs.keys(), [C.cacheName(C.VERSION)]);
    assert.deepEqual(JSON.parse(JSON.stringify(w.posted)), [{ type: 'version', version: C.VERSION }]);
  });
});
