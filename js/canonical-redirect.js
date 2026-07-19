/* Redirect /path/index.html → /path/ so GitHub Pages URL variants share one canonical. */

(function (root) {
  'use strict';

  function canonicalPathFromIndexHtml(pathname) {
    if (typeof pathname !== 'string' || !/\/index\.html$/i.test(pathname)) {
      return null;
    }
    var clean = pathname.replace(/\/index\.html$/i, '/');
    return clean === '' ? '/' : clean;
  }

  function redirectIndexHtmlPath(locationLike) {
    var loc = locationLike || (typeof location !== 'undefined' ? location : null);
    if (!loc || typeof loc.pathname !== 'string') return null;

    var targetPath = canonicalPathFromIndexHtml(loc.pathname);
    if (!targetPath) return null;

    var target = targetPath + (loc.search || '') + (loc.hash || '');
    if (typeof loc.replace === 'function') {
      loc.replace(target);
    }
    return target;
  }

  var api = {
    canonicalPathFromIndexHtml: canonicalPathFromIndexHtml,
    redirectIndexHtmlPath: redirectIndexHtmlPath,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LuckyCatCanonical = api;
    redirectIndexHtmlPath();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
