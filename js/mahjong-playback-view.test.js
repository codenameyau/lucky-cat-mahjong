'use strict';
// The playback view lives on the game page (/playing-mahjong/): switching to it
// and back needs no page load, ?playback=1 brings it back on a refresh, and
// Back always returns to the game. The options page (/play-mahjong/) is a page
// of its own. The page's wiring (init) runs here on a small fake DOM, with
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
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
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
// opts.realTables: the game's own tables, on a canvas that draws nothing.
function loadPage(url, store, opts) {
  opts = opts || {};
  const browser = fakeBrowser(url, store || {});
  const els = {};
  ['play-stage', 'play-canvas', 'play-live', 'playback-canvas', 'playback-live'].forEach((id) => { els[id] = fakeElement(id); });
  // The page's sheets, each with its Close button.
  ['rules-sheet', 'strategies-sheet', 'results-sheet'].forEach((id) => {
    const dlg = fakeElement(id);
    dlg.closeButton = fakeElement(id + '-close');
    dlg.querySelector = (sel) => (sel === '.rules-sheet-close' ? dlg.closeButton : null);
    els[id] = dlg;
  });
  // A 2D context that takes every call and draws nothing.
  const noop = new Proxy(function () {}, {
    get: (t, k) => (k === 'width' ? 10 : k === Symbol.toPrimitive ? () => 0 : noop),
    apply: () => noop,
    set: () => true,
  });
  ['play-canvas', 'playback-canvas'].forEach((id) => {
    els[id].getContext = () => noop;
    els[id].getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
  });
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
  if (opts.realTables) {
    // The game page's scripts, in its order (the ones before mahjong-game.js).
    const html = fs.readFileSync(path.join(ROOT, 'playing-mahjong/index.html'), 'utf8');
    const srcs = [...html.matchAll(/<script src="\/js\/([^"]+)" defer><\/script>/g)].map((m) => m[1])
      .filter((f) => f !== 'nav.js' && f !== 'mahjong-game.js');
    delete window.MahjongEngine;
    Object.assign(window, { navigator: {}, crypto: globalThis.crypto, TextEncoder, TextDecoder, Math, JSON, Date, Array, Object });
    srcs.forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), window, { filename: f }));
  }
  vm.runInContext(GAME_SRC, window);
  const api = window.MahjongGame;
  if (opts.realTables) {
    window.requestAnimationFrame = () => 0;
    window.performance = { now: () => Date.now() };
    const real = api.createTable;
    api.createTable = function () { const t = real.apply(this, arguments); made.push(t); return t; };
    ready();
    return { browser, els, made, flush: () => new Promise((r) => setImmediate(r)) };
  }
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

test('Start game on the options page opens the game page on a new game', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1', { 'lcm-play-autosave': SAVE, 'lcm-play-settings': '{"mode":"payout"}' });
  assert.equal(page.made.length, 1);
  assert.equal(page.made[0].canvas, 'play-canvas');
  assert.equal(page.made[0].saved, undefined, 'a new game, not the save');
  assert.equal(page.made[0].settings.mode, 'payout');
  assert.equal(page.browser.location.search, '', '?new=1 is dropped, so a refresh resumes');
});

test('the game page with no query resumes the saved game, or starts one', async () => {
  const saved = loadPage('http://localhost/playing-mahjong/', { 'lcm-play-autosave': SAVE });
  await saved.flush();
  assert.equal(saved.made.length, 1);
  assert.ok(saved.made[0].saved, 'from the save');
  const none = loadPage('http://localhost/playing-mahjong/');
  assert.equal(none.made.length, 1);
  assert.ok(!none.made[0].saved);
  const lesson = loadPage('http://localhost/playing-mahjong/?learn=1');
  assert.equal(lesson.made[0].settings.lesson, true);
});

test('Quit goes back to the options page', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1&sound=0');
  page.made[0].callbacks.quit();
  assert.ok(page.made[0].destroyed);
  assert.equal(page.browser.loads(), 1, 'the options page loads');
});

test('View playback opens the view in place and Back returns to the same game', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1');
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
  assert.equal(page.els['play-canvas'].hidden, false);
  assert.equal(page.els['playback-canvas'].hidden, true);
  assert.match(page.intro.textContent, /random strategy/);
  assert.equal(page.browser.loads(), 0, 'no page load');
});

test('the browser Back from playback goes to the game, not an earlier move', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1');
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
    { url: 'http://localhost/playing-mahjong/', state: null },
    { url: 'http://localhost/playing-mahjong/?playback=1', state: { lcmPlayback: true, lcmFromGame: true } },
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

test('a refresh of View playback on a hand in progress brings that hand back, not a stored or uploaded one', async () => {
  const inProgress = JSON.stringify({ payload: { game: { settings: { mode: 'practice' }, hand: { seed: 7, moves: [] } } } });
  const page = loadPage([
    { url: 'http://localhost/playing-mahjong/', state: null },
    { url: 'http://localhost/playing-mahjong/?playback=1', state: { lcmPlayback: true, lcmFromGame: true } },
  ], { 'lcm-play-autosave': inProgress, 'lcm-play-replay': '"old"', 'lcm-play-upload': '"uploaded"' });
  await page.flush();
  assert.equal(page.made.length, 1, 'the game comes back first');
  const game = page.made[0];
  assert.equal(game.canvas, 'play-canvas');
  assert.ok(game.saved, 'from its save');
  assert.equal(game.settings.openPlayback, true, 'told to open its playback once the hand is back');
  // The table, its hand replayed, opens View playback: on this same entry.
  const entries = page.browser.entries().length;
  game.callbacks.playback();
  assert.equal(page.made.length, 2);
  assert.equal(page.made[1].canvas, 'playback-canvas');
  assert.equal(page.browser.entries().length, entries, 'no second playback entry');
  // Back returns to that game.
  page.made[1].callbacks.back();
  assert.ok(page.made[1].destroyed);
  assert.deepEqual(game.log, ['start', 'suspend', 'resume']);
});

test('a refresh while an upload shows keeps showing the upload', async () => {
  const inProgress = JSON.stringify({ payload: { game: { settings: { mode: 'practice' }, hand: { seed: 7, moves: [] } } } });
  const page = loadPage([
    { url: 'http://localhost/playing-mahjong/', state: null },
    { url: 'http://localhost/playing-mahjong/?playback=1', state: { lcmPlayback: true, lcmFromGame: true, lcmUpload: true } },
  ], { 'lcm-play-autosave': inProgress });
  assert.equal(page.made.length, 1);
  assert.equal(page.made[0].canvas, 'playback-canvas', 'straight to the playback view, which reads the upload');
});

test('uploads have their own place, so they never replace the game\'s playback', () => {
  assert.match(GAME_SRC, /var UPLOAD_KEY = 'lcm-play-upload'/);
  const load = GAME_SRC.slice(GAME_SRC.indexOf('function loadPlaybackText'), GAME_SRC.indexOf('function onCanvasPaste'));
  assert.match(load, /if \(!mark\) writeJson\(UPLOAD_KEY, \{ savedAt: Date\.now\(\), file: file \}\)/);
  assert.doesNotMatch(load, /keepReplay|REPLAY_KEY|RECENT_KEY/, 'an upload never writes the game\'s playbacks');
});

test('the View playback sheet keeps the three most recent hands, newest first, and one upload', () => {
  // The storage helpers, run on their own with a fake localStorage.
  const store = {};
  const ctx = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    Date, JSON, Array };
  const E = { playbackFinished: (p) => p.done };
  const start = GAME_SRC.indexOf('  function readJson(');
  const end = GAME_SRC.indexOf('  // Each strategy\'s hints for the game in progress');
  const fns = GAME_SRC.slice(start, GAME_SRC.indexOf('\n  }\n', GAME_SRC.indexOf('function removeJson')) + 4) +
    GAME_SRC.slice(GAME_SRC.indexOf('  var REPLAY_KEY'), end);
  const run = new Function('localStorage', 'E', fns + '; return { keepReplay, recentPlaybacks, uploadedPlayback, playbackId };');
  const api = run(ctx.localStorage, E);
  const file = (n, done) => ({ moves: n, payload: { handSeed: 's' + n, handNumber: n, done } });
  api.keepReplay(file(1, true));
  api.keepReplay(file(2, true));
  api.keepReplay(file(3, false)); // unfinished: never stored
  api.keepReplay(file(4, true));
  api.keepReplay(file(5, true));
  api.keepReplay(file(4, true)); // already listed: keeps its place
  const list = api.recentPlaybacks();
  assert.deepEqual(list.map((e) => e.file.moves), [5, 4, 2]);
  assert.ok(list.every((e) => typeof e.savedAt === 'number'), 'each with the time it was saved');
  assert.equal(api.uploadedPlayback(), null);
  store['lcm-play-upload'] = JSON.stringify({ savedAt: 123, file: file(9, true) });
  assert.equal(api.uploadedPlayback().file.moves, 9);
  // An upload stored before the time was kept still shows.
  store['lcm-play-upload'] = JSON.stringify(file(8, true));
  assert.deepEqual(api.uploadedPlayback(), { savedAt: null, file: file(8, true) });
});

test('a playback that reaches its last move shows its results, with Watch again and Close', () => {
  const step = GAME_SRC.slice(GAME_SRC.indexOf('function showReviewStep'), GAME_SRC.indexOf('function stepReview'));
  assert.match(step, /reviewStep >= reviewMoves\(\) && reviewFinished\(\)/);
  assert.match(step, /showPlaybackResult\(\)/);
  assert.match(GAME_SRC, /ui\.overlay = \{ type: 'summary', result: res, hasPlayback: false, playback: true \}/);
  assert.match(GAME_SRC, /var res = E\.playbackResult\(settings\.review\)/);
  assert.match(GAME_SRC, /button\('Watch again'/);
  assert.match(GAME_SRC, /button\('Close', cx/);
});

test('the playback bar opens the View playback sheet, and its rows play, download and upload', () => {
  const game = fs.readFileSync(path.join(ROOT, 'playing-mahjong/index.html'), 'utf8');
  assert.match(game, /<dialog id="playbacks-sheet"/);
  ['playbacks-recent', 'playbacks-uploaded', 'playbacks-upload'].forEach((id) => assert.match(game, new RegExp('id="' + id + '"')));
  assert.match(GAME_SRC, /button\(words \? 'Saved playbacks' : '', vpX, 7, vpW, 28, openPlaybacks, 'ghost', 'review-list'\)/);
  assert.doesNotMatch(GAME_SRC, /'Upload'/, 'no Upload button on the bar');
  assert.doesNotMatch(GAME_SRC, /review-download|downloadReplay/, 'no Download button on the bar: each row in the sheet has its own');
  assert.match(GAME_SRC, /button\('Saved playbacks', \(W - bw\) \/ 2, by, bw, bh, openPlaybacks/);
  assert.match(game, /<h2 id="playbacks-sheet-title">Saved playbacks<\/h2>/);
  const row = GAME_SRC.slice(GAME_SRC.indexOf('function playbackRow'), GAME_SRC.indexOf('function fillList'));
  assert.match(row, /loadPlaybackText\(entry\.file, mark\)/);
  assert.match(row, /saveFile\(entry\.file, entry\.savedAt\)/);
  // Icon buttons, named for screen readers; each row says when its hand finished.
  assert.match(row, /play\.innerHTML = ICON_PLAY/);
  assert.match(row, /down\.innerHTML = ICON_DOWNLOAD/);
  assert.match(row, /setAttribute\('aria-label', 'Play '/);
  assert.match(row, /'Finished ' \+ lower\(E\.playbackWhen\(ended/);
  assert.match(row, /'Uploaded ' \+ lower\(E\.playbackWhen\(entry\.savedAt\)\)/);
  const build = GAME_SRC.slice(GAME_SRC.indexOf('function buildPlaybacks'), GAME_SRC.indexOf('var replayFileInput'));
  assert.match(build, /up \? \[up\] : \[\]/, 'at most one uploaded row');
});

test('a link straight to ?playback=1 goes back to the game, or the options page with none', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?playback=1');
  assert.equal(page.made.length, 1);
  assert.equal(page.made[0].canvas, 'playback-canvas');
  const entries = page.browser.entries().length;
  page.made[0].callbacks.back();
  await page.flush();
  assert.equal(page.browser.entries().length, entries, 'the entry is replaced, not stepped back over');
  assert.doesNotMatch(page.browser.location.search, /playback=1/);
  assert.equal(page.browser.loads(), 1, 'no saved game: the options page');
});

test('Forward after Back opens the playback view again', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1');
  page.made[0].callbacks.playback();
  page.popBack();
  // Forward: the history moves on to the playback entry and fires popstate.
  page.browser.history.pushState({ lcmGame: true, lcmPlayback: true, lcmFromGame: true }, '', '/playing-mahjong/?playback=1');
  page.browser.winListeners.popstate.forEach((fn) => fn({}));
  assert.equal(page.made.length, 3);
  assert.equal(page.made[2].canvas, 'playback-canvas');
  assert.deepEqual(page.made[0].log, ['start', 'suspend', 'resume', 'suspend']);
});

test('the options page and the game are two pages, and playback is part of the game', () => {
  const game = fs.readFileSync(path.join(ROOT, 'playing-mahjong/index.html'), 'utf8');
  const options = fs.readFileSync(path.join(ROOT, 'play-mahjong/index.html'), 'utf8');
  assert.match(game, /id="play-canvas"/);
  assert.match(game, /id="playback-canvas"/);
  assert.match(game, /id="playback-live"/);
  assert.match(game, /src="\/js\/mahjong-game\.js"/);
  assert.doesNotMatch(game, /id="play-settings"/);
  assert.match(options, /id="play-settings"/);
  assert.match(options, /src="\/js\/play-options\.js"/);
  assert.doesNotMatch(options, /id="play-stage"|mahjong-game\.js/);
  assert.ok(!fs.existsSync(path.join(__dirname, 'playback-page.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'play-mahjong/playback')));
  assert.doesNotMatch(GAME_SRC, /opened=1|opened: '1'|'opened'/, 'no ?opened=1');
  assert.doesNotMatch(GAME_SRC, /\/play-mahjong\/playback\//, 'nothing links to the old page');
});

test('the options page sends each button to the game page', () => {
  const O = require('./play-options.js');
  assert.equal(O.gameUrl({ new: 1 }, ''), '/playing-mahjong/?new=1');
  assert.equal(O.gameUrl({}, '?sound=0&instant=1'), '/playing-mahjong/?sound=0&instant=1');
  assert.equal(O.gameUrl({ learn: 1 }, '?x=1'), '/playing-mahjong/?learn=1');
});

test('opening playback again and again leaves one set of listeners on each sheet', async () => {
  const page = loadPage('http://localhost/playing-mahjong/?new=1', {}, { realTables: true });
  const count = (el) => Object.values(el.listeners).reduce((n, list) => n + list.length, 0);
  const ids = ['rules-sheet', 'strategies-sheet', 'results-sheet'];
  // The game's own table is open the whole time: its listeners are the baseline.
  const base = {};
  ids.forEach((id) => { base[id] = [count(page.els[id]), count(page.els[id].closeButton), page.els[id].listeners.click.length, page.els[id].listeners.close.length, page.els[id].closeButton.listeners.click.length]; });
  for (let i = 0; i < 4; i++) {
    // Forward onto the playback entry, then Back off it.
    page.browser.history.pushState({ lcmPlayback: true }, '', '/playing-mahjong/?playback=1');
    page.browser.winListeners.popstate.forEach((fn) => fn({}));
    assert.equal(page.made.length, i + 2);
    page.browser.history.back();
    assert.equal(page.els['playback-canvas'].hidden, true, 'the view is closed');
  }
  ids.forEach((id) => {
    const dlg = page.els[id];
    assert.equal(count(dlg), base[id][0], id + ': a closed playback view leaves nothing behind');
    assert.equal(count(dlg.closeButton), base[id][1], id + ' Close: nothing left behind');
  });
  // Open once more: exactly one more table's worth (Close, backdrop click, close).
  page.browser.history.pushState({ lcmPlayback: true }, '', '/playing-mahjong/?playback=1');
  page.browser.winListeners.popstate.forEach((fn) => fn({}));
  ids.forEach((id) => {
    const dlg = page.els[id];
    assert.equal(dlg.listeners.click.length, base[id][2] + 1, id + ': one more backdrop click listener');
    assert.equal(dlg.listeners.close.length, base[id][3] + 1, id + ': one more close listener');
    assert.equal(dlg.closeButton.listeners.click.length, base[id][4] + 1, id + ': one more Close listener');
  });
});
