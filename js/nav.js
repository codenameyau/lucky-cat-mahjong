/* Shared site header: nav links from data/nav.json, mobile hamburger menu, scroll shadow. */

(function () {
  'use strict';

  var NAV_JSON = '/data/nav.json';

  var DEFAULT_LINKS = [
    { label: 'Our Services', href: '/' },
    { label: 'Points Calculator', href: '/hong-kong-mahjong-scoring/' },
    { label: 'Community', href: '/community/' },
    { label: 'Events', href: '/events/' },
  ];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePath(path) {
    if (!path || path === '/') return '/';
    return path.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  }

  function linkIsActive(href) {
    var path = normalizePath(window.location.pathname);
    if (href.indexOf('/#') === 0) return path === '/';
    var linkPath = normalizePath(href.split('#')[0]);
    return path === linkPath;
  }

  function renderListItems(links) {
    return links.map(function (item) {
      var active = linkIsActive(item.href) ? ' is-active' : '';
      return '<li><a href="' + escapeHtml(item.href) + '" class="nav-link' + active + '">' +
        escapeHtml(item.label) + '</a></li>';
    }).join('');
  }

  function renderHeader(links) {
    return (
      '<nav class="nav container">' +
        '<a href="/" class="header-brand" aria-label="Lucky Cat Mahjong home">' +
          '<picture>' +
            '<source srcset="/logo.webp" type="image/webp">' +
            '<img src="/logo.png" alt="" class="header-logo" width="36" height="37" decoding="async" draggable="false">' +
          '</picture>' +
          '<span class="header-brand-name">Lucky Cat Mahjong</span>' +
        '</a>' +
        '<button type="button" class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">' +
          '<span></span>' +
          '<span></span>' +
          '<span></span>' +
        '</button>' +
        '<ul class="nav-links">' +
          renderListItems(links) +
        '</ul>' +
      '</nav>'
    );
  }

  function applyActiveStates(list) {
    list.querySelectorAll('a.nav-link').forEach(function (a) {
      a.classList.toggle('is-active', linkIsActive(a.getAttribute('href') || ''));
    });
  }

  function getLinksFromList(list) {
    return Array.prototype.map.call(list.querySelectorAll('a.nav-link'), function (a) {
      return { label: a.textContent, href: a.getAttribute('href') || '' };
    });
  }

  function linksEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].label !== b[i].label || a[i].href !== b[i].href) return false;
    }
    return true;
  }

  function measureNavLinksHeight(links) {
    var wasOpen = links.classList.contains('open');
    links.classList.add('open');
    var previous = links.style.maxHeight;
    links.style.maxHeight = 'none';
    var height = links.scrollHeight;
    links.style.maxHeight = previous;
    if (!wasOpen) links.classList.remove('open');
    return height;
  }

  function syncMobileNavHeight(header, links) {
    if (!header || !links) return;
    if (!links.classList.contains('open')) {
      header.style.setProperty('--mobile-nav-height', '0px');
      return;
    }
    header.style.setProperty('--mobile-nav-height', measureNavLinksHeight(links) + 'px');
  }

  function setMobileNavOpen(header, links, toggle, open) {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    syncMobileNavHeight(header, links);
  }

  function setupLinkCloseHandlers(header) {
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (!toggle || !links) return;

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMobileNavOpen(header, links, toggle, false);
      });
    });
  }

  function setupMenu(header) {
    var toggle = document.querySelector('.nav-toggle');
    var links = document.querySelector('.nav-links');
    if (!toggle || !links || toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';

    toggle.addEventListener('click', function () {
      setMobileNavOpen(header, links, toggle, !links.classList.contains('open'));
    });

    window.addEventListener('resize', function () {
      syncMobileNavHeight(header, links);
    });

    setupLinkCloseHandlers(header);
  }

  function setupScrollShadow(header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function setupBrandProtection() {
    document.querySelectorAll('.header-logo, .header-brand picture').forEach(function (el) {
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  function loadNavConfig() {
    return fetch(NAV_JSON)
      .then(function (res) {
        if (!res.ok) throw new Error('nav.json ' + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.links) ? data.links : [];
      });
  }

  function init() {
    var header = document.getElementById('site-header');
    if (!header) return;

    var list = header.querySelector('.nav-links');
    if (!list) {
      header.innerHTML = renderHeader(DEFAULT_LINKS);
      list = header.querySelector('.nav-links');
    }

    if (!list) return;

    applyActiveStates(list);
    setupMenu(header);
    setupScrollShadow(header);
    setupBrandProtection();

    loadNavConfig()
      .then(function (links) {
        if (!links.length) return;
        if (!linksEqual(links, getLinksFromList(list))) {
          list.innerHTML = renderListItems(links);
          setupLinkCloseHandlers(header);
        }
        applyActiveStates(list);
        syncMobileNavHeight(header, list);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
