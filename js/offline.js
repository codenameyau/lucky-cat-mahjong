/* Offline, on every page: registers the site's service worker (/sw.js, see
   js/offline-cache.js), with no button to press.

   The worker saves every page of the site and every file they need, the
   game's code, model weights, tiles, sounds and music included, when it
   installs. So after one visit the site and the game load with no
   connection. Online, code is fetched fresh each time, so the latest JS
   runs. The page also tops up anything still missing, and when the
   connection comes back it checks for a new worker and saves what's missing.
   The game's own worker from before (scope /play-mahjong/) is retired. */

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
    return C && C.VERSION;
  }

  // The game's own worker from 0.45 and 0.46 (scope /play-mahjong/). Unregistering
  // it from here wouldn't do: it keeps control of open pages, reloads included,
  // until every tab closes. So it is told to update instead: its script is now
  // a retired worker (play-mahjong/sw.js) that answers nothing, so every
  // request goes to the network at once, and it removes itself and reloads
  // its pages onto /sw.js. If that update can't run (offline), it is unregistered.
  function dropOldWorker() {
    if (!nav.serviceWorker.getRegistrations) return Promise.resolve();
    return nav.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.filter(function (r) {
        return new URL(r.scope).pathname === C.OLD_SCOPE;
      }).map(function (r) {
        return (r.update ? r.update() : Promise.reject()).catch(function () { return r.unregister(); });
      }));
    }).catch(function () {});
  }

  function register() {
    if (unsupportedReason() || !version()) return Promise.resolve(null);
    if (registration) return registration;
    registration = dropOldWorker().then(function () {
      // updateViaCache 'none': update checks fetch the worker and its imports fresh.
      return nav.serviceWorker.register(C.scriptUrl(version()), { scope: C.SCOPE, updateViaCache: 'none' });
    })
      .catch(function (err) {
        registration = null;
        if (root.console) console.warn('Offline: the service worker did not register.', err);
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
    // After the page has loaded, so the worker doesn't compete with the page's own files.
    var go = function () {
      register().then(function (reg) {
        if (!reg) return;
        // Every load asks the server for a newer worker (updateViaCache 'none'
        // makes the browser compare /sw.js and its import, fresh).
        if (reg.update && nav.onLine !== false) reg.update().catch(function () {});
        // Ask the browser to keep the saved site and game (it may say no; nothing changes then).
        if (nav.storage && nav.storage.persist) nav.storage.persist().catch(function () {});
        topUp();
      });
    };
    // A newer version took over (or answered a refresh): reload onto its code.
    nav.serviceWorker.addEventListener('message', function (event) {
      var data = event.data || {};
      if (data.type === 'version' || data.type === 'refreshed') reloadIfNewer(data.version);
    });
    if (root.document && root.document.readyState !== 'complete') root.addEventListener('load', go);
    else go();
    // Back online: look for a newer worker, fetch every saved file again so
    // nothing stays stale, and save whatever is missing.
    root.addEventListener('online', refreshOnline);
  }

  // The page runs older code than the worker now answering: reload once, so
  // the latest code runs. Once per version, so a mismatch can never loop.
  function reloadIfNewer(workerVersion) {
    if (!workerVersion || !newer(workerVersion, version())) return false;
    var key = 'lcm-reloaded-for';
    try {
      if (root.sessionStorage.getItem(key) === workerVersion) return false;
      root.sessionStorage.setItem(key, workerVersion);
    } catch (e) { return false; }
    if (root.location && root.location.reload) root.location.reload();
    return true;
  }

  // a > b, as versions (0.46.0 > 0.45.9).
  function newer(a, b) {
    var x = String(a).split('.').map(Number);
    var y = String(b || '0').split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  }

  function refreshOnline() {
    return register().then(function (reg) {
      if (!reg) return;
      var check = reg.update ? reg.update().catch(function () {}) : Promise.resolve();
      return check.then(function () {
        var worker = reg.active || (nav.serviceWorker && nav.serviceWorker.controller);
        if (worker && worker.postMessage) worker.postMessage({ type: 'refresh' });
        return topUp();
      });
    });
  }

  var api = {
    get state() { return state; },
    supported: function () { return !unsupportedReason(); },
    unsupportedReason: unsupportedReason,
    register: register,
    topUp: topUp,
    refreshOnline: refreshOnline,
    newer: newer,
    reloadIfNewer: reloadIfNewer,
  };
  root.MahjongOffline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
