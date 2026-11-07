/* Play offline, on the page: registers the service worker
   (/play-mahjong/sw.js, see js/offline-cache.js) and backs the menu's
   Play offline button.

   The worker registers for everyone, so updates reach every player and the
   pages they load stay cached. The button saves everything else the game
   needs (model weights, sounds, music, the playback page), asks the browser
   to keep it (navigator.storage.persist) and shows how it went. Once it is
   on, each visit tops up anything missing, and a new version's worker saves
   the whole game before it takes over. */

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

  function isIOS() {
    var ua = nav.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function isStandalone() {
    return nav.standalone === true || !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches);
  }

  // The line under the menu's button. env: { ios, standalone }.
  function message(state, env) {
    env = env || {};
    switch (state.status) {
      case 'unsupported':
        if (state.reason === 'file') return 'Play offline needs the game opened from luckycatmahjong.com, not from a file.';
        if (state.reason === 'insecure') return 'Play offline needs a secure (https) connection.';
        return 'This browser can\'t save the game for offline play.';
      case 'checking': return 'Checking what\'s saved…';
      case 'saving': return 'Saving… ' + (state.done || 0) + ' of ' + (state.total || 0) + ' files';
      case 'ready':
        return 'Ready to play offline.' + (env.ios && !env.standalone ? ' On iPhone, Add to Home Screen to keep it saved.' : '');
      case 'partial': return 'Some files aren\'t saved yet. Connect to the internet to finish saving.';
      case 'error': return 'Couldn\'t save — check your connection.';
      default: return 'Save the game on this device to play with no connection.';
    }
  }

  function label(state) {
    if (state.status === 'saving') return 'Saving…';
    if (state.status === 'ready') return 'Saved for offline';
    return 'Play offline';
  }

  var state = { status: 'idle' };
  var listeners = [];
  var registration = null;

  function set(next) {
    state = next;
    listeners.slice().forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function version() {
    return root.MahjongEngine && root.MahjongEngine.GAME_VERSION;
  }

  function register() {
    if (unsupportedReason() || !version()) return Promise.resolve(null);
    if (registration) return registration;
    registration = nav.serviceWorker.register(C.scriptUrl(version()), { scope: C.SCOPE })
      .catch(function (err) {
        registration = null;
        if (root.console) console.warn('Play offline: the service worker did not register.', err);
        return null;
      });
    return registration;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  var saving = null;

  // Saves every file (or only the missing ones) into this version's cache.
  function save(onlyMissing) {
    var why = unsupportedReason();
    if (why) { set({ status: 'unsupported', reason: why }); return Promise.resolve(state); }
    if (saving) return saving;
    var total = C.ASSETS.length;
    set({ status: 'saving', done: 0, total: total });
    if (nav.storage && nav.storage.persist) nav.storage.persist().catch(function () {});
    saving = register().then(function (reg) {
      if (!reg) throw new Error('no service worker');
      // The worker has to be running to answer offline.
      return Promise.race([nav.serviceWorker.ready, wait(15000)]);
    }).then(function () {
      return C.setEnabled(root.caches, true);
    }).then(function () {
      return C.precache({
        caches: root.caches,
        fetch: root.fetch.bind(root),
        version: version(),
        onlyMissing: onlyMissing,
        onProgress: function (done) { set({ status: 'saving', done: done, total: total }); },
      });
    }).then(function (res) {
      set(res.ok ? { status: 'ready' } : { status: nav.onLine === false ? 'partial' : 'error', failed: res.failed });
    }, function () {
      set({ status: 'error' });
    }).then(function () {
      saving = null;
      return state;
    });
    return saving;
  }

  // What's saved now. With Play offline on and a connection, saves what's missing.
  function check() {
    var why = unsupportedReason();
    if (why) { set({ status: 'unsupported', reason: why }); return Promise.resolve(state); }
    if (saving) return saving;
    if (state.status === 'idle') set({ status: 'checking' });
    return C.isEnabled(root.caches).then(function (on) {
      if (!on) { set({ status: 'idle' }); return state; }
      return C.missing(root.caches, version()).then(function (left) {
        if (!left.length) { set({ status: 'ready' }); return state; }
        if (nav.onLine === false) { set({ status: 'partial' }); return state; }
        return save(true);
      });
    }).catch(function () { set({ status: 'idle' }); return state; });
  }

  function init() {
    if (unsupportedReason()) return;
    // After the page has loaded, so the worker doesn't compete with the game's own files.
    var go = function () { register().then(function (reg) { if (reg) check(); }); };
    if (root.document && root.document.readyState !== 'complete') root.addEventListener('load', go);
    else go();
  }

  var api = {
    get state() { return state; },
    message: function (s) { return message(s || state, { ios: isIOS(), standalone: isStandalone() }); },
    label: function (s) { return label(s || state); },
    supported: function () { return !unsupportedReason(); },
    unsupportedReason: unsupportedReason,
    subscribe: subscribe,
    register: register,
    check: check,
    enable: function () { return save(false); },
    _message: message,
    _label: label,
  };
  root.MahjongOffline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
