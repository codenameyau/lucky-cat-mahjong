/* Visitor and session IDs for Google Analytics, and the cookie choice.

   Each page loads this file just before its Google Analytics snippet, and the
   snippet calls lcmAnalytics.start(gtag) before gtag('config'), so the page
   view and every event after it carry the same IDs.

   - lcm_vid: a random visitor ID (a UUID, never a name or email: Google's
     terms forbid personal information as a User-ID), with the number of
     sessions this browser has had: "<uuid>.<sessions>". Kept 400 days (the
     longest Chrome allows a cookie), renewed on each visit.
   - lcm_sid: the current session's random ID. It lasts 7 hours 55 minutes and
     is renewed on each page and click, so that long without either starts a
     new session: the longest session timeout GA4 allows (set GA4's own session
     timeout to match, in Admin › Data streams › Configure tag settings).
   - lcm_consent: "granted" or "denied", only once the visitor picks one in the
     cookie banner or on the privacy page. Kept 400 days.

   Sent to GA4 with gtag('set'): user_id and visitor_id (the visitor ID),
   visitor_session_id and visitor_session_number.

   Consent:
   - In Europe (the EEA, the UK and Switzerland, told by the browser's time
     zone), nothing is set or sent until the visitor accepts in the banner.
     Google's own consent defaults are denied there too, by Google's IP region.
   - Elsewhere analytics is on unless the visitor turns it off (Decline in
     cookie settings, or the privacy page) or the browser sends Global Privacy
     Control. Off means no lcm_vid or lcm_sid, Google's _ga cookies cleared, and
     window['ga-disable-G-B514HH987M'] so gtag sends nothing at all.
   - The banner opens by itself only in Europe, until the visitor chooses.
     Anywhere, a footer element with class js-cookie-settings (Cookie
     Settings) opens it, to turn analytics on or off. */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.lcmAnalytics = api.create({ window: root, document: root.document });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GA_ID = 'G-B514HH987M';
  var VISITOR_COOKIE = 'lcm_vid';
  var SESSION_COOKIE = 'lcm_sid';
  var CONSENT_COOKIE = 'lcm_consent';
  // The longest a cookie can last: Chrome caps every cookie at 400 days.
  var YEAR_SECONDS = 400 * 24 * 60 * 60;
  // GA4's longest session timeout, 7 hours 55 minutes.
  var SESSION_SECONDS = (7 * 60 + 55) * 60;
  var RENEW_MS = 60 * 1000;

  // Countries whose law needs consent before analytics cookies: the EEA, the UK and Switzerland
  // (ISO 3166 codes, for gtag's consent region).
  var CONSENT_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
    'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    'IS', 'LI', 'NO', 'GB', 'CH',
  ];

  // The same places by time zone, so the page can tell before anything is set.
  // Every Europe/ zone counts (a few more countries than needed, never fewer),
  // and the EU's Atlantic islands.
  var CONSENT_ZONES = /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe))/;

  var GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' };
  var DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

  function copy(obj, extra) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  function uuid(cryptoObj, random) {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    var bytes = new Array(16);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      var arr = new Uint8Array(16);
      cryptoObj.getRandomValues(arr);
      for (var i = 0; i < 16; i++) bytes[i] = arr[i];
    } else {
      for (var j = 0; j < 16; j++) bytes[j] = Math.floor((random || Math.random)() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function parseVisitor(value) {
    var m = /^([0-9a-f-]{36})\.(\d{1,9})$/.exec(value || '');
    if (!m || !UUID_RE.test(m[1])) return null;
    return { id: m[1], sessions: parseInt(m[2], 10) };
  }

  function create(env) {
    var win = env.window || {};
    var doc = env.document;
    var nav = env.navigator || win.navigator || {};
    var loc = env.location || win.location || {};
    var cryptoObj = env.crypto || win.crypto;
    var now = env.now || function () { return Date.now(); };
    var timeZone = env.timeZone;
    if (timeZone === undefined) {
      try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { timeZone = ''; }
    }

    var gtag = null;
    var ids = null;
    var lastRenew = 0;
    var sentWhileOff = false;

    // Cookies

    function readCookie(name) {
      if (!doc) return '';
      var parts = String(doc.cookie || '').split(/;\s*/);
      for (var i = 0; i < parts.length; i++) {
        var eq = parts[i].indexOf('=');
        if (eq > 0 && parts[i].slice(0, eq) === name) {
          try { return decodeURIComponent(parts[i].slice(eq + 1)); } catch (e) { return ''; }
        }
      }
      return '';
    }

    function writeCookie(name, value, maxAge, domain) {
      if (!doc) return;
      var c = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax';
      if (domain) c += '; Domain=' + domain;
      if (loc.protocol === 'https:') c += '; Secure';
      doc.cookie = c;
    }

    function clearCookie(name, domain) { writeCookie(name, '', 0, domain); }

    // Google's own cookies (_ga, _ga_<stream>), on this host and on the parent domain gtag uses.
    function clearGoogleCookies() {
      if (!doc) return;
      var host = String(loc.hostname || '');
      var domains = [null];
      var labels = host.split('.');
      for (var i = 0; i < labels.length - 1; i++) domains.push('.' + labels.slice(i).join('.'));
      String(doc.cookie || '').split(/;\s*/).forEach(function (part) {
        var name = part.split('=')[0];
        if (name === '_ga' || name.indexOf('_ga_') === 0 || name === '_gid' || name === '_gat') {
          domains.forEach(function (d) { clearCookie(name, d); });
        }
      });
    }

    // Consent

    function needsConsentFirst() { return CONSENT_ZONES.test(timeZone || ''); }

    function globalPrivacyControl() { return nav.globalPrivacyControl === true; }

    // granted | denied (a choice), or, with no choice: denied with Global Privacy Control,
    // pending where consent comes first, granted elsewhere.
    function consentState() {
      var choice = readCookie(CONSENT_COOKIE);
      if (choice === 'granted' || choice === 'denied') return choice;
      if (globalPrivacyControl()) return 'denied';
      if (needsConsentFirst()) return 'pending';
      return 'granted';
    }

    function hasChoice() {
      var choice = readCookie(CONSENT_COOKIE);
      return choice === 'granted' || choice === 'denied';
    }

    // IDs

    function ensureIds() {
      var visitor = parseVisitor(readCookie(VISITOR_COOKIE));
      var session = readCookie(SESSION_COOKIE);
      if (!UUID_RE.test(session)) session = '';
      if (!visitor) visitor = { id: uuid(cryptoObj), sessions: 0 };
      if (!session) {
        session = uuid(cryptoObj);
        visitor.sessions += 1;
      }
      if (visitor.sessions < 1) visitor.sessions = 1;
      writeCookie(VISITOR_COOKIE, visitor.id + '.' + visitor.sessions, YEAR_SECONDS);
      writeCookie(SESSION_COOKIE, session, SESSION_SECONDS);
      lastRenew = now();
      ids = { visitorId: visitor.id, sessionId: session, sessionNumber: visitor.sessions };
      return ids;
    }

    // Keeps the session open while the visitor is active (at most once a minute).
    function renew() {
      if (!ids || consentState() !== 'granted') return;
      if (now() - lastRenew < RENEW_MS) return;
      var before = ids.sessionId;
      ensureIds();
      if (ids.sessionId !== before && gtag) gtag('set', fields());
    }

    function fields() {
      if (!ids) return {};
      return {
        user_id: ids.visitorId,
        visitor_id: ids.visitorId,
        visitor_session_id: ids.sessionId,
        visitor_session_number: ids.sessionNumber,
      };
    }

    function turnOff() {
      ids = null;
      clearCookie(VISITOR_COOKIE);
      clearCookie(SESSION_COOKIE);
      clearGoogleCookies();
      win['ga-disable-' + GA_ID] = true;
    }

    // Called by each page's snippet, before gtag('config').
    function start(gtagFn) {
      gtag = gtagFn;
      var state = consentState();
      gtag('consent', 'default', copy(DENIED, { region: CONSENT_REGIONS.slice() }));
      gtag('consent', 'default', state === 'granted' ? copy(GRANTED) : copy(DENIED));
      if (state === 'granted') {
        win['ga-disable-' + GA_ID] = false;
        ensureIds();
        gtag('set', fields());
      } else {
        turnOff();
        sentWhileOff = true;
      }
      if (doc && doc.addEventListener) {
        doc.addEventListener('click', onClick, true);
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', onReady);
        else onReady();
      }
      return state;
    }

    // granted | denied, from the banner or the privacy page.
    function setConsent(choice) {
      if (choice !== 'granted' && choice !== 'denied') return;
      writeCookie(CONSENT_COOKIE, choice, YEAR_SECONDS);
      if (choice === 'granted') {
        win['ga-disable-' + GA_ID] = false;
        ensureIds();
        if (gtag) {
          gtag('consent', 'update', copy(GRANTED));
          gtag('set', fields());
          // The page view was held back while analytics was off: send it now.
          if (sentWhileOff) gtag('event', 'page_view');
        }
        sentWhileOff = false;
      } else {
        if (gtag) gtag('consent', 'update', copy(DENIED));
        turnOff();
        sentWhileOff = true;
      }
      hideBanner();
      updateStatus();
    }

    // The banner

    var banner = null;

    function onReady() {
      if (consentState() === 'pending') showBanner();
      updateStatus();
    }

    function onClick(e) {
      var el = e.target && e.target.closest ? e.target.closest('.js-cookie-settings, [data-consent]') : null;
      if (el && el.classList.contains('js-cookie-settings')) {
        e.preventDefault();
        showBanner(true);
        return;
      }
      if (el && el.hasAttribute('data-consent')) {
        setConsent(el.getAttribute('data-consent'));
        return;
      }
      renew();
    }

    function bannerText() {
      return 'We use cookies to count visits and learn how the site is used, so we can plan mahjong events where people are. ' +
        'We never sell your information.';
    }

    function showBanner(focus) {
      if (!doc || !doc.body) return;
      if (!banner) {
        banner = doc.createElement('div');
        banner.className = 'cookie-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Cookie Settings');
        banner.innerHTML =
          '<p class="cookie-banner-text">' + bannerText() +
          ' <a href="/privacy/#cookies">Privacy Policy</a></p>' +
          '<div class="cookie-banner-actions">' +
          '<button type="button" class="cookie-banner-btn" data-consent="denied">Decline</button>' +
          '<button type="button" class="cookie-banner-btn cookie-banner-accept" data-consent="granted">Accept</button>' +
          '</div>';
        doc.body.appendChild(banner);
      }
      banner.hidden = false;
      if (focus) {
        var accept = banner.querySelector('.cookie-banner-accept');
        if (accept && accept.focus) accept.focus();
      }
    }

    function hideBanner() { if (banner) banner.hidden = true; }

    // The privacy page's status line (any element with data-consent-status).
    function updateStatus() {
      if (!doc || !doc.querySelectorAll) return;
      var state = consentState();
      var text = state === 'granted'
        ? 'Analytics cookies are on in this browser.'
        : state === 'pending'
          ? 'Analytics cookies are off in this browser until you choose.'
          : 'Analytics cookies are off in this browser.';
      if (state === 'denied' && !hasChoice() && globalPrivacyControl()) {
        text = 'Analytics cookies are off in this browser, because it sends Global Privacy Control.';
      }
      Array.prototype.forEach.call(doc.querySelectorAll('[data-consent-status]'), function (el) {
        el.textContent = text;
      });
    }

    return {
      GA_ID: GA_ID,
      start: start,
      setConsent: setConsent,
      consentState: consentState,
      needsConsentFirst: needsConsentFirst,
      fields: fields,
      ids: function () { return ids ? copy(ids) : null; },
      openSettings: function () { showBanner(true); },
      renew: renew,
    };
  }

  return {
    create: create,
    uuid: uuid,
    parseVisitor: parseVisitor,
    CONSENT_REGIONS: CONSENT_REGIONS,
    CONSENT_ZONES: CONSENT_ZONES,
    COOKIES: { visitor: VISITOR_COOKIE, session: SESSION_COOKIE, consent: CONSENT_COOKIE },
  };
});
