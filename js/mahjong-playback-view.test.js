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
  api.keepReplay(file(6, true));
  api.keepReplay(file(7, true));
  api.keepReplay(file(6, true)); // already listed: keeps its place
  const list = api.recentPlaybacks();
  assert.deepEqual(list.map((e) => e.file.moves), [7, 6, 5], 'three, newest first, the older ones dropped');
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

test('auto-play (the wind badge, with the coach on) is for local and private-network addresses only', () => {
  // The address check, run on its own.
  const src = /function isLocalHost\(host\) \{[\s\S]*?\n  \}\n/.exec(GAME_SRC)[0];
  const isLocalHost = new Function(src + '; return isLocalHost;')();
  ['localhost', '127.0.0.1', '[::1]', '192.168.1.50', '192.168.0.12', '10.0.0.7', '172.16.4.2', '172.31.255.1', 'mac.local', 'app.localhost', 'lucky.test']
    .forEach((h) => assert.equal(isLocalHost(h), true, h));
  ['luckycatmahjong.com', 'www.luckycatmahjong.com', '192.169.1.1', '172.32.0.1', '172.15.0.1', '11.0.0.1', '8.8.8.8', 'evil-192.168.1.1.com', '']
    .forEach((h) => assert.equal(isLocalHost(h), false, h));
  // It matches the pages' analytics check, so "local" means the same thing everywhere.
  const analytics = /var localHost = \/(.+)\/i\.test\(location\.hostname\);/.exec(fs.readFileSync(path.join(ROOT, 'playing-mahjong/index.html'), 'utf8'));
  const sameAsAnalytics = new RegExp(analytics[1], 'i');
  ['localhost', '127.0.0.1', '192.168.1.50', '10.0.0.7', '172.20.1.1', 'mac.local', 'luckycatmahjong.com', '192.169.1.1']
    .forEach((h) => assert.equal(isLocalHost(h), sameAsAnalytics.test(h), 'same as analytics: ' + h));
  // The badge toggles it only with the coach on, and never in a playback or the lesson.
  assert.match(GAME_SRC, /return localDev\(\) && !settings\.review && !settings\.playback && !settings\.lesson && ui\.coach !== 'off'/);
  assert.match(GAME_SRC, /if \(autoPlay \|\| canAutoPlay\(\)\) \{ toggleAutoPlay\(\); return; \}\n      copySeed\(\);/);
});

test('playback: a double-click on an opponent\'s hand hides or shows their tiles, saved; an unfinished hand always keeps them concealed', () => {
  // The decision: a double-tap (two presses close in time and place, on the same opponent's seat).
  const tapSrc = GAME_SRC.slice(GAME_SRC.indexOf('    var lastHandTap = null;'), GAME_SRC.indexOf('    function toggleOpponentHands() {'));
  const make = (finished) => {
    const calls = [];
    const L = { opp: [null, { x: 0, y: 0, w: 100, h: 400 }, { x: 150, y: 0, w: 500, h: 100 }, { x: 700, y: 0, w: 100, h: 400 }] };
    const boxHas = (b, x, y) => !!(b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    const fn = new Function('L', 'boxHas', 'now', 'reviewFinished', 'toggleOpponentHands', tapSrc + '; return opponentHandsTap;');
    const tap = fn(L, boxHas, () => 0, () => finished, () => calls.push('toggle'));
    return { tap, calls, press: (x, y, t) => tap({ x, y }, { timeStamp: t }) };
  };
  let h = make(true);
  assert.equal(h.press(50, 200, 1000), false, 'one press is not a double-click');
  assert.equal(h.press(52, 203, 1200), true, 'a second press close by, soon after, is');
  assert.deepEqual(h.calls, ['toggle']);
  assert.equal(h.press(50, 200, 1300), false, 'a third press starts a new pair');
  h = make(true);
  h.press(50, 200, 1000);
  assert.equal(h.press(750, 200, 1100), false, 'another opponent\'s seat is not the same hand');
  h = make(true);
  h.press(50, 200, 1000);
  assert.equal(h.press(50, 200, 1600), false, 'too slow');
  h = make(true);
  h.press(50, 100, 1000);
  assert.equal(h.press(50, 300, 1100), false, 'too far apart');
  h = make(true);
  h.press(50, 200, 1000);
  h.press(400, 600, 1100); // your own hand or the pond: not an opponent
  assert.equal(h.press(50, 200, 1150), false, 'a press elsewhere in between starts over');
  h = make(true);
  h.press(400, 50, 1000);
  assert.equal(h.press(400, 55, 1100), true, 'the across opponent counts too');
  h = make(false); // an unfinished hand: always concealed, so nothing to toggle
  h.press(50, 200, 1000);
  assert.equal(h.press(50, 200, 1100), false);
  assert.deepEqual(h.calls, []);

  // The toggle: one saved preference for playback (hidden: false), applied to every opponent at once.
  const toggleSrc = /function toggleOpponentHands\(\) \{[\s\S]*?\n    \}\n/.exec(GAME_SRC)[0];
  const saved = [];
  const ui = { revealHands: true, botLift: 5 };
  const prefs = { sound: true };
  const toggle = new Function('prefs', 'writeJson', 'PREFS_KEY', 'ui', 'reviewFinished', 'sound', 'track', 'announce', 'requestRender', toggleSrc + '; return toggleOpponentHands;')(
    prefs, (k, v) => saved.push([k, JSON.stringify(v)]), 'lcm-play-prefs', ui, () => true, { play() {} }, () => {}, () => {}, () => {});
  toggle();
  assert.equal(prefs.showOpponents, false);
  assert.equal(ui.revealHands, false, 'hidden');
  assert.deepEqual(saved[0], ['lcm-play-prefs', '{"sound":true,"showOpponents":false}'], 'saved');
  toggle();
  assert.equal(prefs.showOpponents, true);
  assert.equal(ui.revealHands, true, 'shown again');
  // Where the playback decides: face up only for a finished hand, and only when not hidden.
  assert.match(GAME_SRC, /ui\.revealHands = reviewFinished\(\) && prefs\.showOpponents !== false;/);
  assert.match(GAME_SRC, /if \(settings\.review && !ui\.overlay && opponentHandsTap\(p, e\)\) \{ e\.preventDefault\(\); return; \}/);
  assert.match(GAME_SRC, /if \(!reviewFinished\(\)\) return false;/, 'an unfinished hand\'s double-click does nothing');
});

test('closing or dismissing the game over window plays no sound', () => {
  // Both paths (the Close button and a click outside) go through seeMatchHands, which is silent.
  const body = GAME_SRC.slice(GAME_SRC.indexOf('function seeMatchHands()'), GAME_SRC.indexOf('// Where See results goes while the hands are face up'));
  assert.doesNotMatch(body, /sound\.play/);
  assert.match(GAME_SRC, /button\('Close', r\.x \+ r\.w - PAD - 64, r\.y \+ PAD, 64, 28, seeMatchHands, 'ghost', 'go-close'\)/, 'Close calls it directly, with no sound of its own');
  assert.match(GAME_SRC, /if \(o\.type === 'gameover'\) \{ seeMatchHands\(\); return true; \}/, 'so does a click outside');
});

test('the game over window uses the Results window\'s look, with each player\'s avatar and strategy', () => {
  const fn = GAME_SRC.slice(GAME_SRC.indexOf('    function drawGameOver() {'), GAME_SRC.indexOf('    var overlayResolve = null;'));
  // The Results look: the green sheet with a gold edge (as the pause menu draws it), a gold title at the left, Close at the right.
  assert.match(fn, /drawSheetBg\(r\)/);
  assert.doesNotMatch(fn, /drawPanelBg/, 'not the cream panel any more');
  assert.match(fn, /text\('Game over', px, r\.y \+ 36, \{ size: 28, family: FONT_HEAD, align: 'left', color: COLORS\.goldLight \}\)/);
  assert.match(fn, /button\('Close', [^\n]*seeMatchHands, 'ghost', 'go-close'\)/);
  // No "You finished 2nd." line: your highlighted row in the standings says it.
  assert.doesNotMatch(fn, /You finished|You tied for/);
  // Each row: an avatar (the person or robot icon), the name, the strategy played, the points.
  assert.match(fn, /playerIcon\(row\.seat,/);
  assert.match(fn, /gameOverStrategy\(row\.seat\)/);
  assert.match(fn, /fmt\(row\.points\)/);
  // The same three buttons as before, and it shrinks to fit a short screen.
  // Play again is the large primary button on top (full width, taller); Results and Quit share the row under it.
  assert.match(fn, /button\('Play again', px, by - BIG - 10, innerW, BIG, [^\n]*'primary', 'go-again'\)/);
  assert.match(fn, /button\('Results', px, by, bw, BTN, openResults, 'white', 'go-results'\)/);
  assert.match(fn, /button\('Quit', px \+ bw \+ 12, by, bw, BTN, [^\n]*'white', 'go-quit'\)/);
  assert.ok(fn.indexOf("'go-again'") < fn.indexOf("'go-results'") && fn.indexOf("'go-results'") < fn.indexOf("'go-quit'"), 'Play again, then Results, then Quit');
  // See results at the end of the game shows only this window: nothing opens the Results table with it.
  const endings = GAME_SRC.split("ui.overlay = { type: 'gameover' };").slice(1);
  assert.equal(endings.length, 4, 'four places show the game over window');
  endings.forEach((tail, i) => {
    const next = tail.slice(0, tail.indexOf('return;') > 0 ? tail.indexOf('return;') : 300);
    if (i === 0 || i === 1) return; // See results (checked below) and the refresh path, which reopens a Results table that was open
    assert.doesNotMatch(next, /openResults\(\)/, 'the game-end flow does not open the Results table (' + i + ')');
    assert.match(next, /saveMatchPlayback\(\)/, 'but still keeps the match\'s playback (' + i + ')');
  });
  const see = GAME_SRC.slice(GAME_SRC.indexOf('function seeResults()'), GAME_SRC.indexOf('function seeMatchHands()'));
  assert.doesNotMatch(see, /openResults\(\)/, 'See results on the table shows only the game over window');
  assert.match(see, /saveMatchPlayback\(\)/);
  // A refresh that had the Results table open still reopens it.
  assert.match(GAME_SRC, /if \(showSavedResults\) openResults\(\);/);
  // Room between the stats and Play again (it was 14; now more, so the button doesn't crowd them).
  const room = Number(/var BEFORE_PLAY = (\d+);/.exec(fn)[1]);
  assert.ok(room >= 28, 'at least 28 px above Play again: ' + room);
  assert.match(fn, /statLines\.length \* STAT \+ BEFORE_PLAY \+ BIG/);
  // It shrinks to fit a short screen.
  assert.match(fn, /var k = Math\.min\(1, \(H - 24\) \/ h\)/);
  // Your strategy is the coach's (as in the Strategies sheet); a computer player's is its own.
  const src = /function gameOverStrategy\(seat\) \{[\s\S]*?\n    \}\n/.exec(GAME_SRC)[0];
  const make = new Function('ui', 'Strategies', src + '; return gameOverStrategy;');
  const strategies = { has: (id) => id !== 'gone', get: (id) => ({ name: { 'neural-cat': 'Neural Cat', 'lucky-cat': 'Lucky Cat' }[id] }) };
  const f = make({ strategies: { coach: 'neural-cat', seats: [null, 'lucky-cat', 'gone', null] } }, strategies);
  assert.equal(f(0), 'Coach \u00b7 Neural Cat');
  assert.equal(f(1), 'Lucky Cat');
  assert.equal(f(2), '', 'an unknown strategy shows nothing');
  assert.equal(f(3), '', 'no strategy saved shows nothing');
  // Close is counted.
  assert.match(GAME_SRC, /'go-close': 'play_end_close_click'/);
});

test('the game over window shows the longest winning streak and the times you stayed dealer', () => {
  const fn = GAME_SRC.slice(GAME_SRC.indexOf('    function drawGameOver() {'), GAME_SRC.indexOf('    var overlayResolve = null;'));
  // The lines, in order: hands played, then your biggest hand, then the rest.
  const labels = [...fn.matchAll(/^\s+\['([^']+)', /gm)].map((m) => m[1]);
  assert.deepEqual(labels, ['Hands played', 'Your biggest hand', 'Fastest win', 'Hands you won', 'Longest winning streak', 'Times you discarded the winning tile', 'Times you stayed dealer']);
  assert.match(fn, /\['Fastest win', st\.fastest == null \? '\\u2014' : st\.fastest \+ \(st\.fastest === 1 \? ' move' : ' moves'\)\]/, 'a dash when you won no hand');
  assert.match(fn, /\['Longest winning streak', streak \? streak \+ \(streak === 1 \? ' hand' : ' hands'\) : '\\u2014'\]/);
  assert.match(fn, /\['Times you discarded the winning tile', String\(st\.dealIns \|\| 0\)\]/);
  assert.match(fn, /\['Times you stayed dealer', String\(st\.stays \|\| 0\)\]/);
  assert.doesNotMatch(GAME_SRC, /Times you dealt in/, 'renamed: it says what it counts');
  // The longest run of hands you won, read from the Results table's rows.
  const src = /function longestWinStreak\(rows\) \{[\s\S]*?\n  \}\n/.exec(GAME_SRC)[0];
  const longest = new Function(src + '; return longestWinStreak;')();
  const win = (hand) => ({ hand, draw: false, faan: [4, 0, 0, 0] });
  const lose = (hand) => ({ hand, draw: false, faan: [0, 5, 0, 0] });
  const paid = (hand) => ({ hand, draw: false, faan: [-3, 3, 0, 0] }); // Practice: you paid, so your faan is below 0
  const draw = (hand) => ({ hand, draw: true, faan: [0, 0, 0, 0] });
  assert.equal(longest([]), 0);
  assert.equal(longest(undefined), 0);
  assert.equal(longest([lose(1), draw(2), paid(3)]), 0, 'no wins, no streak');
  assert.equal(longest([win(1), win(2), win(3)]), 3);
  assert.equal(longest([win(1), win(2), lose(3), win(4), win(5), win(6), draw(7), win(8)]), 3, 'the longest run, not the last');
  assert.equal(longest([win(1), draw(2), win(3)]), 1, 'a drawn hand ends a run');
  assert.equal(longest([win(3), win(1), lose(2)]), 1, 'rows are taken in hand order');
  // The count of times the deal stayed with you.
  const recSrc = /function recordStats\(res\) \{[\s\S]*?\n    \}\n/.exec(GAME_SRC)[0];
  const rec = (ui, game) => new Function('ui', 'game', recSrc + '; return recordStats;')(ui, game);
  const ui = { stats: { hands: 0, wins: 0, best: null, fastest: null, dealIns: 0, stays: 0 } };
  const game = { hand: { trace: [] } };
  // Your moves in a hand: your own discards (the others' don't count), plus the winning move.
  const hand = (mine, others) => {
    game.hand.trace = [{ a: 'draw', s: 0 }, { a: 'flower', s: 1 }]
      .concat(Array.from({ length: mine }, () => ({ a: 'discard', s: 0 })), Array.from({ length: others === undefined ? mine * 3 : others }, (_, i) => ({ a: 'discard', s: 1 + (i % 3) })), [{ a: 'win', s: 0 }]);
  };
  const record = rec(ui, game);
  assert.equal(ui.stats.fastest, null, 'no win yet: a dash');
  hand(9); record({ type: 'win', winner: 3, dealerKeeps: false, score: { faan: 3 } });  // someone else's win doesn't count
  assert.equal(ui.stats.fastest, null);
  hand(9); record({ type: 'win', winner: 0, dealerKeeps: true, score: { faan: 4 } });  // you won as dealer: the deal stays
  assert.equal(ui.stats.fastest, 10, '9 discards of yours, then the winning move');
  hand(5, 40); record({ type: 'win', winner: 0, dealerKeeps: false, score: { faan: 5 } }); // you won, but you weren't the dealer
  assert.equal(ui.stats.fastest, 6, 'the fewest moves: 5 discards and the win; the others\' 40 discards don\'t count');
  hand(12); record({ type: 'win', winner: 0, dealerKeeps: false, score: { faan: 3 } });
  assert.equal(ui.stats.fastest, 6, 'a slower win does not replace it');
  hand(0, 0); record({ type: 'win', winner: 0, dealerKeeps: false, score: { faan: 13 } }); // a win on the deal: the winning move alone
  assert.equal(ui.stats.fastest, 1, 'one move');
  hand(7); record({ type: 'draw' });
  assert.equal(ui.stats.fastest, 1, 'a draw is not a win');
  record({ type: 'win', winner: 2, dealerKeeps: true, score: { faan: 3 } });  // another dealer won and kept the deal
  record({ type: 'draw' });
  record({ type: 'win', winner: 0, dealerKeeps: true, score: { faan: 8 } });
  assert.deepEqual([ui.stats.hands, ui.stats.wins, ui.stats.best, ui.stats.stays, ui.stats.dealIns], [9, 5, 13, 2, 0]);
  // Times you discarded the winning tile: your discard was what someone else won on.
  record({ type: 'win', winner: 3, payer: 0, how: 'discard', dealerKeeps: false, score: { faan: 3 } });
  record({ type: 'win', winner: 1, payer: 0, how: 'discard', dealerKeeps: false, score: { faan: 4 } });
  record({ type: 'win', winner: 1, payer: 2, how: 'discard', dealerKeeps: false, score: { faan: 4 } });  // someone else's discard
  record({ type: 'win', winner: 1, payer: null, how: 'selfDraw', dealerKeeps: false, score: { faan: 4 } }); // a self-draw: no one discarded
  record({ type: 'win', winner: 1, payer: 0, how: 'robKong', dealerKeeps: false, score: { faan: 4 } });   // you added to a kong: not a discard
  assert.equal(ui.stats.dealIns, 2);
  // An older save has no count yet: it starts at 0.
  const old = { stats: { hands: 3, wins: 1, best: 4, dealIns: 1 } };
  hand(7);
  rec(old, game)({ type: 'win', winner: 0, dealerKeeps: true, score: { faan: 3 } });
  assert.equal(old.stats.stays, 1);
  assert.equal(old.stats.fastest, 8, 'an older save has no fastest win yet: it starts from here');
  assert.equal(old.stats.dealIns, 1, 'the old count carries on');
});

test('auto-play plays none of the tile sounds; hand results, the click and music are kept', () => {
  // Every cue is decided: a tile cue (silent in auto-play) or one of the kept ones. A new cue must be sorted.
  const start = GAME_SRC.indexOf('var CUES = {');
  const block = GAME_SRC.slice(start + 'var CUES = '.length, GAME_SRC.indexOf('\n  };', start) + 4);
  const cues = Object.keys(new Function('return (' + block + ')')());
  const tile = Object.keys(new Function('return (' + /var TILE_CUES = (\{[^}]*\});/.exec(GAME_SRC)[1] + ')')());
  assert.deepEqual(tile.sort(), ['back', 'chow', 'discard', 'draw', 'flip', 'flower', 'forward', 'kong', 'pung', 'turn']);
  assert.deepEqual(cues.filter((c) => !tile.includes(c)).sort(), ['drawgame', 'lose', 'next', 'otherwin', 'select', 'win'], 'the hand results, the next hand and the generic click stay audible');
  assert.ok(tile.every((c) => cues.includes(c)), 'every tile cue exists');
  // The sound player skips a cue the table calls quiet, and the table says so only while auto-play runs.
  assert.match(GAME_SRC, /if \(api\.isQuiet && api\.isQuiet\(name\)\) return;/);
  assert.match(GAME_SRC, /sound\.isQuiet = function \(name\) \{ return autoPlay && TILE_CUES\[name\] === 1; \};/);
});

test('auto-play skips every animation: the flights and pauses, and the declaration banners and win confetti', () => {
  assert.match(GAME_SRC, /function instantMode\(\) \{ return settings\.speed === 'off' \|\| ui\.replaying \|\| autoPlay; \}/);
  // No callouts and no confetti while it runs.
  const banner = GAME_SRC.slice(GAME_SRC.indexOf('function banner(textStr'), GAME_SRC.indexOf('function banner(textStr') + 200);
  assert.match(banner, /if \(autoPlay\) return;/, 'no declaration banners');
  const confetti = GAME_SRC.slice(GAME_SRC.indexOf('function confetti('), GAME_SRC.indexOf('function confetti(') + 120);
  assert.match(confetti, /if \(autoPlay\) return;/, 'no win confetti');
  // Turning it on lands the flights in progress, and clears any banner or particle on screen.
  assert.match(GAME_SRC, /if \(autoPlay\) finishAnimations\(\);/);
  const fin = GAME_SRC.slice(GAME_SRC.indexOf('function finishAnimations'), GAME_SRC.indexOf('function stopAutoPlay'));
  assert.match(fin, /anims\.splice\(0\)/);
  assert.match(fin, /a\.step\(1, 1\);\s+a\.done\(\);/);
  assert.match(fin, /banners\.length = 0;\s+particles\.length = 0;/);
  // The other animation gates (animate, sleep, the bots' thinking) all read instantMode.
  assert.match(GAME_SRC, /function animate\(dur, step, ease\) \{\n      if \(instantMode\(\)\)/);
  assert.match(GAME_SRC, /function sleep\(ms\) \{\n      if \(instantMode\(\)\)/);
});

test('auto-play is never kept: off on every load, and off when a frozen page is restored or left', () => {
  assert.match(GAME_SRC, /var autoPlay = false;/, 'a plain variable, never stored');
  const stores = GAME_SRC.match(/(writeJson|localStorage\.setItem|sessionStorage\.setItem)\([^)]*autoPlay/g);
  assert.equal(stores, null, 'auto-play is not saved anywhere');
  assert.match(GAME_SRC, /function stopAutoPlay\(\) \{/);
  assert.match(GAME_SRC, /if \(e\.type === 'pagehide' \|\| e\.persisted\) stopAutoPlay\(\)/);
  assert.match(GAME_SRC, /root\.addEventListener\('pageshow', onPageLife\)/);
  assert.match(GAME_SRC, /root\.addEventListener\('pagehide', onPageLife\)/);
  // And the table takes the listeners off again when it is destroyed.
  const destroy = GAME_SRC.slice(GAME_SRC.indexOf('      destroy: function () {'), GAME_SRC.indexOf('      destroy: function () {') + 400);
  assert.match(destroy, /stopAutoPlay\(\)/);
  assert.match(destroy, /removeEventListener\('pageshow', onPageLife\)/);
  assert.match(destroy, /removeEventListener\('pagehide', onPageLife\)/);
});

test('a playback that fails its signature opens the could-not-be-uploaded popup, and nothing is kept', () => {
  const html = fs.readFileSync(path.join(ROOT, 'playing-mahjong/index.html'), 'utf8');
  assert.match(html, /<dialog id="upload-error-sheet"[^>]*role="alertdialog"/);
  assert.match(html, /<h2 id="upload-error-title">Upload failed<\/h2>/);
  assert.match(html, /<p class="rules-sheet-intro">Your three most recent finished hands and your last upload are saved\.<\/p>/);
  assert.match(html, /This playback could not be uploaded\./);
  assert.doesNotMatch(html.slice(html.indexOf('id="upload-error-sheet"'), html.indexOf('id="strategies-sheet"')), /<button[^>]*upload-error-ok|>OK</, 'no OK button: Close, a click outside and Escape close it');
  assert.match(html, /<button type="button" class="rules-sheet-close" aria-label="Close">Close<\/button>[\s\S]*id="upload-error-lead"/);
  const load = GAME_SRC.slice(GAME_SRC.indexOf('function loadPlaybackText'), GAME_SRC.indexOf('function onCanvasPaste'));
  // The check runs first; a failure shows the popup and returns before anything is written.
  assert.ok(load.indexOf('showUploadError(checked)') > 0 && load.indexOf('showUploadError(checked)') < load.indexOf('writeJson(UPLOAD_KEY'), 'the popup comes before anything is stored');
  assert.match(load, /track\('play_playback_upload_failed', \{ code: checked\.code/);
  assert.match(GAME_SRC, /signature: 'Its signature doesn\\'t match, so the file was changed or damaged after it was saved/);
  // Closed by Close, a click outside, and Escape (a dialog's own).
  assert.doesNotMatch(GAME_SRC, /upload-error-ok/);
  assert.match(GAME_SRC, /onSheet\(dlg\.querySelector\('\.rules-sheet-close'\), 'click', closeUploadError\)/);
  assert.match(GAME_SRC, /playbacksOpen\(\) \|\| uploadErrorOpen\(\)(?: \|\| coachSettingsOpen\(\))?\) return;/);
});

test('Upload playback closes the Saved playbacks sheet, and a bad file\'s popup stands on its own', () => {
  const click = GAME_SRC.slice(GAME_SRC.indexOf("track('play_playback_upload_click'"), GAME_SRC.indexOf("track('play_playback_upload_click'") + 200);
  assert.match(click, /closePlaybacks\(\);\n\s+openReplayPicker\(\)/, 'the sheet closes, then the picker opens');
  const err = GAME_SRC.slice(GAME_SRC.indexOf('function showUploadError'), GAME_SRC.indexOf('function closeUploadError'));
  assert.match(err, /closePlaybacks\(\)/);
});

test('an incompatible version gets a message of its own, naming both versions', () => {
  const src = /function versionMessage\(c\) \{[\s\S]*?\n    \}\n/.exec(GAME_SRC)[0];
  const versionMessage = new Function(src + '; return versionMessage;')();
  assert.equal(versionMessage({ versionKind: 'newer', fileVersion: '2.0.0', gameVersion: '1.4.0' }),
    'It was saved by a newer version of the game (2.0.0), and this page is on 1.4.0. Reload the page to update, then upload it again.');
  assert.equal(versionMessage({ versionKind: 'older', fileVersion: '1.0.0', gameVersion: '2.1.0' }),
    'It was saved by an older version of the game (1.0.0) that this version (2.1.0) can\'t play.');
  assert.match(versionMessage({ versionKind: 'missing', fileVersion: null, gameVersion: '1.4.0' }), /^It has no game version, so this version \(1\.4\.0\) can't tell/);
  // Its own line under the heading, and the popup reads both from the failed check.
  assert.match(GAME_SRC, /version: 'This playback is from an incompatible version of the game\.'/);
  assert.match(GAME_SRC, /checked\.code === 'version' \? versionMessage\(checked\)/);
  assert.match(GAME_SRC, /UPLOAD_LEADS\[checked\.code\] \|\| 'This playback could not be uploaded\.'/);
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
  // Copy hand seed sits between Play and Download and copies payload.handSeed.
  assert.match(row, /copy\.innerHTML = ICON_COPY/);
  assert.match(row, /String\(entry\.file\.payload\.handSeed/);
  assert.match(row, /copyText\(seedText\)/);
  assert.ok(row.indexOf('li.appendChild(play)') < row.indexOf('li.appendChild(copy)') && row.indexOf('li.appendChild(copy)') < row.indexOf('li.appendChild(down)'), 'Play, Copy hand seed, Download');
  // Download's tooltip is read after its disabled state is set.
  assert.ok(row.indexOf('down.disabled = ') < row.indexOf("down.setAttribute('data-tip'"), 'the tooltip knows if Download is disabled');
  assert.match(row, /setAttribute\('aria-label', \(showing \? 'Playing now: ' : 'Play '\) \+ sum\.hand/);
  // Whatever is on screen: its Play button has a white outer border, not the words "Showing now".
  assert.match(row, /play\.classList\.toggle\('is-showing', !!showing\)/);
  assert.match(row, /setAttribute\('data-tip', showing \? 'Playing now' : 'Play'\)/);
  assert.match(row, /setAttribute\('aria-current', 'true'\)/);
  assert.doesNotMatch(GAME_SRC, /Showing now/, 'the words are gone');
  const css = fs.readFileSync(path.join(ROOT, 'css/play.css'), 'utf8');
  // A white ring outside the button (a box-shadow), so the button keeps the size of the others: no border change.
  assert.match(css, /\.playbacks-play\.is-showing \{\s*box-shadow: 0 0 0 3px #ffffff;\s*\}/);
  const rule = /\.playbacks-play\.is-showing \{([^}]*)\}/.exec(css)[1];
  assert.doesNotMatch(rule, /border|width|height|padding|margin/, 'nothing that changes its size');
  // One timestamp, no labels ("Finished", "Uploaded"): the hand's finish time, else the saved time; none if nobody kept one.
  assert.match(row, /var stamp = ended != null \? ended : entry\.savedAt;/);
  // The second line is the hand number and the time: no round ("East round").
  assert.match(row, /\[sum\.number, stamp != null \? E\.playbackWhen\(stamp\) : ''\]/);
  assert.doesNotMatch(row.slice(row.indexOf("var when = document"), row.indexOf('info.appendChild(name)')), /round/, 'the round is not in the line');
  assert.match(row, /'Play ' \)? ?\+ sum\.hand|sum\.hand \+ ', '/, 'the screen-reader labels keep the full hand');
  const stampLines = row.slice(row.indexOf("var when = document.createElement('div')"), row.indexOf('info.appendChild(name)'));
  assert.doesNotMatch(stampLines.replace(/\/\/[^\n]*/g, ''), /'Finished|'Uploaded|times\.push|lower\(/, 'only the readable time, no labels');
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

test('colour themes: green, blue and red, cycled from the menu and kept in the game prefs', () => {
  const src = fs.readFileSync(path.join(__dirname, 'mahjong-game.js'), 'utf8');
  for (const name of ['green', 'blue', 'red']) assert.match(src, new RegExp(name + ": \\{ label: '"));
  assert.match(src, /green: \{[^}]*felt: '#0b5a39', feltLight: '#127048', feltDark: '#074029'/);
  assert.match(src, /'Theme: ' \+ themeLabel/);
  assert.match(src, /prefs\.theme = applyTheme\(next\)[\s\S]{0,60}writeJson\(PREFS_KEY, prefs\)/);
  assert.match(src, /applyTheme\(prefs\.theme\)/);
  assert.doesNotMatch(src, /addColorStop\(0, '#127048'\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css/play.css'), 'utf8');
  assert.match(css, /:root\[data-theme="blue"\]/);
  assert.match(css, /:root\[data-theme="red"\]/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'playing-mahjong/index.html'), 'utf8');
  assert.match(html, /data-theme/);
});

test('a phone has no Copy hand seed button on a saved playback', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css/play.css'), 'utf8');
  assert.match(css, /@media \(max-width: 600px\)[^{]*\{\s*\.playbacks-copy \{ display: none; \}/);
});
