/* Offline play, on the page: registers the service worker
   (/play-mahjong/sw.js, see js/offline-cache.js) for every player, with no
   button to press.

   The worker saves every file the game needs (code, model weights, tiles,
   sounds, music) when it installs, so after one visit the game loads and
   plays with no connection. Online, code is fetched fresh each time, so the
   latest JS runs. The page also tops up anything still missing, and when the
   connection comes back it checks for a new worker and saves what's missing. */

(function (root) {
  'use strict';

  var C = root.MahjongOfflineCache || (typeof require === 'function' ? require('./offline-cache.js') : null);
  var nav = root.navigator || {};
  var loc = root.location || { protocol: 'file:', hostname: '' };

  // null when it can work here, or why not: 'file', 'insecure' or 'browser'.
  function unsupportedReason() {
    if (!/^https?:$/.test(loc.protocol)) return 'file';
    if (root.isSecureContext === false) return 'insecure';
    if (!nav.serviceWorker || !root.caches) return 'browser';
    return null;
  }

  var state = { status: 'idle' };
  var registration = null;
  var saving = null;

  function version() {
    return root.MahjongEngine && root.MahjongEngine.GAME_VERSION;
  }

  function register() {
    if (unsupportedReason() || !version()) return Promise.resolve(null);
    if (registration) return registration;
    registration = nav.serviceWorker.register(C.scriptUrl(version()), { scope: C.SCOPE })
      .catch(function (err) {
        registration = null;
        if (root.console) console.warn('Offline play: the service worker did not register.', err);
        return null;
      });
    return registration;
  }

  // Saves what this version's cache is still missing, when there's a connection.
  function topUp() {
    if (unsupportedReason()) { state = { status: 'unsupported', reason: unsupportedReason() }; return Promise.resolve(state); }
    if (saving) return saving;
    if (nav.onLine === false) return Promise.resolve(state);
    saving = C.missing(root.caches, version()).then(function (left) {
      if (!left.length) return { ok: true, failed: [] };
      state = { status: 'saving' };
      return C.precache({ caches: root.caches, fetch: root.fetch.bind(root), version: version(), onlyMissing: true });
    }).then(function (res) {
      state = res.ok ? { status: 'ready' } : { status: 'partial', failed: res.failed };
      return state;
    }, function () {
      state = { status: 'partial' };
      return state;
    }).then(function (s) { saving = null; return s; });
    return saving;
  }

  function init() {
    if (unsupportedReason()) return;
    // After the page has loaded, so the worker doesn't compete with the game's own files.
    var go = function () {
      register().then(function (reg) {
        if (!reg) return;
        // Ask the browser to keep the saved game (it may say no; nothing changes then).
        if (nav.storage && nav.storage.persist) nav.storage.persist().catch(function () {});
        topUp();
      });
    };
    if (root.document && root.document.readyState !== 'complete') root.addEventListener('load', go);
    else go();
    // Back online: look for a newer worker, and save whatever is missing.
    root.addEventListener('online', function () {
      register().then(function (reg) {
        if (!reg) return;
        if (reg.update) reg.update().catch(function () {});
        topUp();
      });
    });
  }

  var api = {
    get state() { return state; },
    supported: function () { return !unsupportedReason(); },
    unsupportedReason: unsupportedReason,
    register: register,
    topUp: topUp,
  };
  root.MahjongOffline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
