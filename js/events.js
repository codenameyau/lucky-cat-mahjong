(function () {
  'use strict';

  var lib = window.EventsLib || {};
  var buildEventSlug = lib.buildEventSlug;
  var partitionEvents = lib.partitionEvents;
  var formatEventDate = lib.formatEventDate;
  var eventDetailUrl = lib.eventDetailUrl;
  var escapeHtml = lib.escapeHtml;
  var multilineHtml = lib.multilineHtml;
  var truncateText = lib.truncateText;
  var isUpcoming = lib.isUpcoming;
  var startOfToday = lib.startOfToday;
  var absoluteUrl = lib.absoluteUrl;

  var GOOGLE_FONTS = new Set([
    'DM Sans', 'Inter', 'Lato', 'Open Sans', 'Roboto', 'Source Sans 3',
    'Nunito', 'Poppins', 'Work Sans', 'Playfair Display', 'Merriweather',
    'Lora', 'Libre Baskerville', 'Cormorant Garamond', 'DM Serif Display',
    'Fraunces', 'Bitter',
  ]);

  var FONT_FALLBACKS = {
    'Avenir Medium': '"Avenir Next Medium", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'KN Yuanmo SC': 'sans-serif',
  };

  var SITE_ORIGIN = 'https://luckycatmahjong.com';
  var contactInfo = { email: '', igHandle: '', igUrl: '', igDmUrl: '' };

  function loadJSON(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error('Failed to load ' + path);
      return res.json();
    });
  }

  function hexToRgbTriplet(hex) {
    var match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return null;
    var h = match[1];
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var int = parseInt(h, 16);
    return ((int >> 16) & 255) + ', ' + ((int >> 8) & 255) + ', ' + (int & 255);
  }

  function applyStyleguide(styleguide) {
    var root = document.documentElement;
    var colors = styleguide.colors;
    var fontFamily = styleguide.fontFamily;
    var headingFont = styleguide.headingFont;

    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-surface', colors.surface);
    root.style.setProperty('--color-text', colors.text);
    root.style.setProperty('--color-text-muted', colors.textMuted);

    var primaryRgb = hexToRgbTriplet(colors.primary);
    var secondaryRgb = hexToRgbTriplet(colors.secondary);
    if (primaryRgb) root.style.setProperty('--color-primary-rgb', primaryRgb);
    if (secondaryRgb) root.style.setProperty('--color-secondary-rgb', secondaryRgb);

    var bodyFallback = FONT_FALLBACKS[fontFamily] || 'system-ui, sans-serif';
    var headingFallback = FONT_FALLBACKS[headingFont] || 'sans-serif';
    root.style.setProperty('--font-body', '"' + fontFamily + '", ' + bodyFallback);
    root.style.setProperty('--font-heading', '"' + headingFont + '", ' + headingFallback);

    var googleFonts = [fontFamily, headingFont].filter(function (f) { return GOOGLE_FONTS.has(f); });
    var fontsLink = document.getElementById('google-fonts');
    if (googleFonts.length) {
      if (!fontsLink) {
        fontsLink = document.createElement('link');
        fontsLink.id = 'google-fonts';
        fontsLink.rel = 'stylesheet';
        document.head.appendChild(fontsLink);
      }
      fontsLink.href = 'https://fonts.googleapis.com/css2?family=' +
        googleFonts.map(function (f) { return f.replace(/ /g, '+') + ':wght@400;500;600;700'; }).join('&family=') +
        '&display=swap';
    } else if (fontsLink) {
      fontsLink.remove();
    }
  }

  function applyContact(site) {
    if (!site) return;
    contactInfo.email = site.contact_email || '';
    var ig = site.instagram || {};
    contactInfo.igHandle = ig.handle ? '@' + ig.handle : '';
    contactInfo.igUrl = ig.url || '';
    contactInfo.igDmUrl = ig.handle ? 'https://ig.me/m/' + ig.handle : '';
  }

  function renderFlyer(event, className, options) {
    options = options || {};
    var linked = options.linked !== false;
    var url = eventDetailUrl(event.slug);
    var imageHtml;

    if (event.flyer) {
      imageHtml = '<img src="' + escapeHtml(event.flyer) + '" alt="' + escapeHtml(event.title) + ' flyer" class="' + className + '" loading="lazy" decoding="async" width="1080" height="1350">';
    } else {
      imageHtml = '<div class="' + className + ' event-flyer--placeholder" aria-hidden="true"><span>Mahjong Event</span></div>';
    }

    if (!linked) return imageHtml;

    return '<a href="' + escapeHtml(url) + '" class="event-flyer-link' + (event.flyer ? '' : ' event-flyer-link--placeholder') + '">' +
      imageHtml +
      '</a>';
  }

  function renderEventCard(event, options) {
    options = options || {};
    var past = !!options.past;
    var url = eventDetailUrl(event.slug);
    var cardClass = 'event-card' + (past ? ' event-card--past' : '');
    var dateLabel = formatEventDate(event.date, event.time);
    var description = event.description ? truncateText(event.description, 120) : '';

    var html = '<article class="' + cardClass + '">';
    html += renderFlyer(event, 'event-flyer');
    html += '<div class="event-card-body">';
    html += '<h3 class="event-card-title"><a href="' + escapeHtml(url) + '">' + escapeHtml(event.title) + '</a></h3>';
    html += '<p class="event-meta"><time datetime="' + escapeHtml(event.date) + '">' + dateLabel + '</time></p>';
    html += '<p class="event-meta event-meta--compact"><span class="event-meta-price">' + escapeHtml(event.price) + '</span>';
    html += '<span class="event-meta-sep" aria-hidden="true">·</span>';
    html += '<span class="event-meta-location">' + escapeHtml(event.location) + '</span></p>';
    if (past) html += '<span class="event-past-badge">Past</span>';
    if (description) html += '<p class="event-card-description">' + escapeHtml(description) + '</p>';
    html += '<a href="' + escapeHtml(url) + '" class="event-card-link">View details<span aria-hidden="true"> →</span></a>';
    html += '</div></article>';
    return html;
  }

  function renderListingCards(events, past) {
    return events.map(function (event) {
      return renderEventCard(event, { past: past });
    }).join('');
  }

  function setupPastToggle(pastCount) {
    var wrap = document.getElementById('past-events-wrap');
    var toggle = document.getElementById('past-events-toggle');
    var panel = document.getElementById('past-events-panel');
    if (!wrap || !toggle || !panel || pastCount === 0) return;

    wrap.hidden = false;
    toggle.textContent = 'View past events (' + pastCount + ')';

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Hide past events' : 'View past events (' + pastCount + ')';
      panel.hidden = !open;
    }

    toggle.addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    if (window.location.hash === '#past') setOpen(true);
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#past') setOpen(true);
    });
  }

  function injectListingJsonLd(upcoming) {
    if (!upcoming.length) return;
    var graph = upcoming.map(function (event) {
      var item = {
        '@type': 'Event',
        name: event.title,
        startDate: event.date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: event.location,
        },
      };
      if (event.flyer) item.image = absoluteUrl(event.flyer, SITE_ORIGIN);
      if (event.description) item.description = event.description;
      if (event.registration_url) item.offers = { '@type': 'Offer', url: event.registration_url, price: event.price };
      return item;
    });

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    document.head.appendChild(script);
  }

  function initListing() {
    Promise.all([
      loadJSON('/data/events-index.json'),
      loadJSON('/data/styleguide.json'),
      loadJSON('/data/site.json').catch(function () { return null; }),
    ]).then(function (results) {
      var indexData = results[0];
      applyStyleguide(results[1]);
      applyContact(results[2]);

      var events = (indexData.events || []).filter(function (event) { return event.slug; });
      var groups = partitionEvents(events);
      var upcomingEl = document.getElementById('upcoming-events');
      var pastEl = document.getElementById('past-events');
      var emptyEl = document.getElementById('upcoming-empty');

      if (upcomingEl) {
        if (groups.upcoming.length) {
          upcomingEl.innerHTML = renderListingCards(groups.upcoming, false);
        } else {
          upcomingEl.innerHTML = '';
          if (emptyEl) emptyEl.hidden = false;
        }
      }

      if (pastEl) pastEl.innerHTML = renderListingCards(groups.past, true);
      setupPastToggle(groups.past.length);
      injectListingJsonLd(groups.upcoming);
    }).catch(function (err) {
      console.warn('Could not load events listing:', err);
    });
  }

  function renderDetail(event) {
    var past = !isUpcoming(event, startOfToday());
    var dateLabel = formatEventDate(event.date, event.time);
    var html = '';

    html += '<a href="/events/" class="event-back-link">← All events</a>';
    if (past) html += '<span class="event-past-badge event-past-badge--detail">Past event</span>';
    html += renderFlyer(event, 'event-detail-flyer', { linked: false });
    html += '<h1 class="event-detail-title">' + escapeHtml(event.title) + '</h1>';
    html += '<dl class="event-detail-meta">';
    html += '<div class="event-detail-meta-row"><dt>Date</dt><dd><time datetime="' + escapeHtml(event.date) + '">' + dateLabel + '</time></dd></div>';
    html += '<div class="event-detail-meta-row"><dt>Price</dt><dd>' + escapeHtml(event.price) + '</dd></div>';
    html += '<div class="event-detail-meta-row"><dt>Location</dt><dd>' + escapeHtml(event.location) + '</dd></div>';
    html += '</dl>';

    if (event.description) {
      html += '<div class="event-detail-description">' + multilineHtml(event.description) + '</div>';
    }

    html += '<div class="event-detail-actions">';
    if (event.registration_url) {
      html += '<a href="' + escapeHtml(event.registration_url) + '" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Register</a>';
    } else if (contactInfo.igDmUrl) {
      html += '<a href="' + escapeHtml(contactInfo.igDmUrl) + '" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Message us on Instagram</a>';
    } else if (contactInfo.email) {
      html += '<a href="mailto:' + escapeHtml(contactInfo.email) + '" class="btn btn-primary">Email us</a>';
    }
    html += '</div>';

    return html;
  }

  function injectDetailJsonLd(event) {
    var data = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      startDate: event.date,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@type': 'Place', name: event.location },
      url: absoluteUrl(eventDetailUrl(event.slug), SITE_ORIGIN),
    };
    if (event.flyer) data.image = absoluteUrl(event.flyer, SITE_ORIGIN);
    if (event.description) data.description = event.description;
    if (event.registration_url) data.offers = { '@type': 'Offer', url: event.registration_url, price: event.price };

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function getDetailSlug() {
    var fromBody = document.body && document.body.getAttribute('data-event-slug');
    if (fromBody) return fromBody;

    var match = /^\/events\/([^/]+)\/?$/.exec(window.location.pathname);
    if (!match || match[1] === 'index.html') return '';
    return decodeURIComponent(match[1]);
  }

  function initDetail(slug) {
    Promise.all([
      loadJSON('/data/events/' + slug + '.json'),
      loadJSON('/data/styleguide.json'),
      loadJSON('/data/site.json').catch(function () { return null; }),
    ]).then(function (results) {
      var event = results[0];
      applyStyleguide(results[1]);
      applyContact(results[2]);

      event.slug = slug;
      var host = document.getElementById('event-detail');
      if (host) host.innerHTML = renderDetail(event);
      injectDetailJsonLd(event);
    }).catch(function () {
      var host = document.getElementById('event-detail');
      if (host) {
        host.innerHTML = '<p class="events-empty">This event could not be found. <a href="/events/">Back to all events</a></p>';
      }
    });
  }

  function init() {
    if (document.body.getAttribute('data-events-mode') === 'listing') {
      initListing();
      return;
    }

    var slug = getDetailSlug();
    if (slug) initDetail(slug);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
