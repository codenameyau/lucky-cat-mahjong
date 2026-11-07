'use strict';
// The playback view lives on the game page: switching to it and back needs no
// page load, ?playback=1 brings it back on a refresh, and Back always returns
// to the game. The page's wiring (init) runs here on a small fake DOM, with
// stand-in tables that record what is done to them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const GAME_SRC = fs.readFileSync(path.join(__dirname, 'mahjong-game.js'), 'utf8');

function fakeElement(id) {
  const listeners = {};
  const classes = new Set();
  return {
    id,
    hidden: false,
    textContent: '',
    open: false,
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    close() { this.open = false; },
    appendChild: (c) => c,
    insertBefore: () => {},
    parentNode: null,
    listeners,
  };
}

// A browser's session history, enough for pushState, replaceState, back and popstate.
function fakeBrowser(start, store) {
  // start: a URL, or the entries a page left behind (a refresh), the last one current.
  const entries = Array.isArray(start) ? start.map((e) => ({ url: e.url, state: e.state })) : [{ url: start, state: null }];
  let at = entries.length - 1;
  let loads = 0;
  const winListeners = {};
  const location = {
    get href() { return entries[at].url; },
    get search() { return new URL(entries[at].url).search; },
    get pathname() { return new URL(entries[at].url).pathname; },
    get hostname() { return 'localhost'; },
    get origin() { return 'http://localhost'; },
    assign() { loads++; },
    replace() { loads++; },
  };
  const abs = (u) => new URL(String(u), entries[at].url).href;
  const history = {
    get state() { return entries[at].state; },
    get length() { return entries.length; },
    pushState(state, _t, url) {
      entries.splice(at + 1);
      entries.push({ url: abs(url), state: state == null ? null : JSON.parse(JSON.stringify(state)) });
      at++;
    },
    replaceState(state, _t, url) {
      entries[at] = { url: url == null ? entries[at].url : abs(url), state: state == null ? null : JSON.parse(JSON.stringify(state)) };
    },
    back() {
      if (at === 0) return;
      at--;
      (winListeners.popstate || []).forEach((fn) => fn({ state: entries[at].state }));
    },
  };
  return {
    entries: () => entries.slice(0, at + 1),
    loads: () => loads,
    location,
    history,
    winListeners,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
}

// Loads mahjong-game.js on a page at `url` (or on a history, see fakeBrowser)
// and runs its init with stand-in tables.
function loadPage(url, store) {
  const browser = fakeBrowser(url, store || {});
  const els = {};
  ['play-settings', 'play-stage', 'play-canvas', 'play-live', 'playback-canvas', 'playback-live'].forEach((id) => { els[id] = fakeElement(id); });
  els['play-stage'].hidden = true;
  els['playback-canvas'].hidden = true;
  const intro = fakeElement('intro');
  intro.textContent = 'Each computer player gets a random strategy every game.';
  const docEl = fakeElement('html');
  let ready = null;
  const document = {
    readyState: 'loading',
    documentElement: docEl,
    head: fakeElement('head'),
    hidden: false,
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (sel === '#strategies-sheet .rules-sheet-intro' ? intro : null),
    querySelectorAll: () => [],
    createElement: () => fakeElement('el'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') ready = fn; },
    removeEventListener: () => {},
  };
  const made = [];
  const window = {
    document,
    location: browser.location,
    history: browser.history,
    localStorage: browser.localStorage,
    URL,
    URLSearchParams,
    Promise,
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    Image: function () {},
    addEventListener: (type, fn) => { (browser.winListeners[type] = browser.winListeners[type] || []).push(fn); },
    removeEventListener: () => {},
    MahjongEngine: {
      TILE_IDS: [], BONUS_IDS: [], HKScoring: { TILE_BY_ID: {} },
      checkSave: () => Promise.resolve({ ok: true }),
    },
    MahjongMLWeights: {}, MahjongOnlyOrphansWeights: {}, MahjongLuckyCatWeights: {},
  };
  window.globalThis = window;
  window.window = window;
  vm.createContext(window);
  vm.runInContext(GAME_SRC, window);
  const api = window.MahjongGame;
  api.createTable = function (canvas, live, settings, callbacks, saved) {
    const t = {
      canvas: canvas.id, settings, callbacks, saved,
      log: [],
      start() { this.log.push('start'); },
      suspend() { this.log.push('suspend'); },
      resume() { this.log.push('resume'); },
      destroy() { this.log.push('destroy'); this.destroyed = true; },
    };
    made.push(t);
    return t;
  };
  ready();
  const flush = () => new Promise((r) => setImmediate(r));
  return { browser, els, made, intro, flush, popBack: () => browser.history.back() };
}

const SAVE = JSON.stringify({ payload: { game: { settings: { mode: 'practice' } } } });

test('View playback opens the view in place and Back returns to the same game', async () => {
  const page = loadPage('http://localhost/play-mahjong/');
  page.els['play-settings'].listeners.submit[0]({ preventDefault() {} });
  assert.equal(page.made.length, 1);
  const game = page.made[0];
  assert.equal(game.canvas, 'play-canvas');

  game.callbacks.playback();
  assert.equal(page.made.length, 2);
  const view = page.made[1];
  assert.equal(view.canvas, 'playback-canvas');
  assert.equal(view.settings.playback, true);
  assert.deepEqual(game.log, ['start', 'suspend']);
  assert.equal(page.els['play-canvas'].hidden, true);
  assert.equal(page.els['playback-canvas'].hidden, false);
  assert.match(page.browser.location.search, /playback=1/);
  assert.match(page.intro.textContent, /How each strategy chooses a discard/);

  // The playback bar's Back: one step back in history, onto the game's entry.
  view.callbacks.back();
  assert.ok(view.destroyed);
  assert.deepEqual(game.log, ['start', 'suspend', 'resume']);
  assert.ok(!game.destroyed, 'the same game, not a new one');
  assert.equal(page.made.length, 2);
  assert.doesNotMatch(page.browser.location.search, /playback=1/);
  assert.match(page.browser.location.search, /opened=1/);
  assert.equal(page.els['play-canvas'].hidden, false);
  assert.equal(page.els['playback-canvas'].hidden, true);
  assert.match(page.intro.textContent, /random strategy/);
  assert.equal(page.browser.loads(), 0, 'no page load');
});

test('the browser Back from playback goes to the game, not an earlier move', async () => {
  const page = loadPage('http://localhost/play-mahjong/');
  page.els['play-settings'].listeners.submit[0]({ preventDefault() {} });
  const game = page.made[0];
  const before = page.browser.entries().length;
  game.callbacks.playback();
  assert.equal(page.browser.entries().length, before + 1, 'one entry for the view');
  page.popBack();
  assert.ok(page.made[1].destroyed);
  assert.deepEqual(game.log, ['start', 'suspend', 'resume']);
  assert.doesNotMatch(page.browser.location.search, /playback=1/);
});

test('a refresh on ?playback=1 opens the playback view, and Back opens the saved game', async () => {
  const store = { 'lcm-play-autosave': SAVE };
  // The entries a game, View playback, then a refresh leave behind.
  const refreshed = loadPage([
    { url: 'http://localhost/play-mahjong/', state: null },
    { url: 'http://localhost/play-mahjong/?opened=1', state: { lcmGame: true } },
    { url: 'http://localhost/play-mahjong/?opened=1&playback=1', state: { lcmGame: true, lcmPlayback: true, lcmFromGame: true } },
  ], store);
  assert.equal(refreshed.made.length, 1);
  assert.equal(refreshed.made[0].canvas, 'playback-canvas');
  assert.equal(refreshed.els['play-stage'].hidden, false);

  refreshed.made[0].callbacks.back();
  await refreshed.flush();
  assert.ok(refreshed.made[0].destroyed);
  assert.equal(refreshed.made.length, 2, 'the saved game opens');
  assert.equal(refreshed.made[1].canvas, 'play-canvas');
  assert.ok(refreshed.made[1].saved, 'from the save');
  assert.doesNotMatch(refreshed.browser.location.search, /playback=1/);
  assert.match(refreshed.browser.location.search, /results=1/);
});

test('a link straight to ?playback=1 goes back to the game page, not off the site', async () => {
  const page = loadPage('http://localhost/play-mahjong/?playback=1');
  assert.equal(page.made.length, 1);
  assert.equal(page.made[0].canvas, 'playback-canvas');
  const entries = page.browser.entries().length;
  page.made[0].callbacks.back();
  await page.flush();
  assert.equal(page.browser.entries().length, entries, 'the entry is replaced, not stepped back over');
  assert.doesNotMatch(page.browser.location.search, /playback=1/);
  assert.equal(page.els['play-stage'].hidden, true, 'no saved game: the page shows');
});

test('Forward after Back opens the playback view again', async () => {
  const page = loadPage('http://localhost/play-mahjong/');
  page.els['play-settings'].listeners.submit[0]({ preventDefault() {} });
  page.made[0].callbacks.playback();
  page.popBack();
  // Forward: the history moves on to the playback entry and fires popstate.
  page.browser.history.pushState({ lcmGame: true, lcmPlayback: true, lcmFromGame: true }, '', '/play-mahjong/?opened=1&playback=1');
  page.browser.winListeners.popstate.forEach((fn) => fn({}));
  assert.equal(page.made.length, 3);
  assert.equal(page.made[2].canvas, 'playback-canvas');
  assert.deepEqual(page.made[0].log, ['start', 'suspend', 'resume', 'suspend']);
});

test('playback is part of the game page: no page of its own, no scripts of its own', () => {
  const game = fs.readFileSync(path.join(ROOT, 'play-mahjong/index.html'), 'utf8');
  assert.match(game, /id="playback-canvas"/);
  assert.match(game, /id="playback-live"/);
  assert.ok(!fs.existsSync(path.join(__dirname, 'playback-page.js')));
  // The old address still works: it sends you to the game page's view.
  const old = fs.readFileSync(path.join(ROOT, 'play-mahjong/playback/index.html'), 'utf8');
  assert.match(old, /location\.replace\('\/play-mahjong\/\?'/);
  assert.match(old, /params\.set\('playback', '1'\)/);
  assert.doesNotMatch(old, /<script src=/);
  assert.doesNotMatch(GAME_SRC, /\/play-mahjong\/playback\//, 'nothing links to the old page');
});
