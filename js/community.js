(function () {
  'use strict';

  var BATCH_SIZE = 2;
  var DATA_PREFIX = '../data/';

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

  var allEvents = [];
  var renderedCount = 0;
  var observer = null;
  var lightboxEnabled = false;
  var lightboxEl = null;
  var lightboxPhotos = [];
  var lightboxIndex = 0;
  var lightboxCaption = '';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function multilineHtml(text) {
    return escapeHtml(text)
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function formatEventDate(dateStr) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
    if (!match) return escapeHtml(dateStr);
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function normalizePhotos(photos) {
    if (!photos) return [];
    if (Array.isArray(photos)) return photos.filter(Boolean);
    return [photos];
  }

  function sortEventsByDateDesc(events) {
    return events.slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
  }

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
    var colors = styleguide.colors || {};

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

    var bodyFallback = FONT_FALLBACKS[styleguide.fontFamily] || 'system-ui, sans-serif';
    var headingFallback = FONT_FALLBACKS[styleguide.headingFont] || 'sans-serif';
    root.style.setProperty('--font-body', '"' + styleguide.fontFamily + '", ' + bodyFallback);
    root.style.setProperty('--font-heading', '"' + styleguide.headingFont + '", ' + headingFallback);

    var googleFonts = [styleguide.fontFamily, styleguide.headingFont].filter(function (f) {
      return GOOGLE_FONTS.has(f);
    });
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

  function renderPhoto(event, photo, index) {
    var alt = event.name + ' photo ' + (index + 1);
    var lightboxClass = lightboxEnabled ? ' community-photo--lightbox' : '';
    return (
      '<figure class="community-photo' + lightboxClass + '" data-photo-index="' + index + '">' +
        '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async" draggable="false">' +
      '</figure>'
    );
  }

  function renderEventSection(event) {
    var photos = normalizePhotos(event.photos);
    var descriptionHtml = event.description
      ? '<p class="community-event-description">' + multilineHtml(event.description) + '</p>'
      : '';

    return (
      '<section class="community-event" aria-label="' + escapeHtml(event.name) + '">' +
        '<div class="community-event-header">' +
          '<h2 class="community-event-name">' + escapeHtml(event.name) + '</h2>' +
          '<time class="community-event-date" datetime="' + escapeHtml(event.date) + '">' +
            formatEventDate(event.date) +
          '</time>' +
        '</div>' +
        descriptionHtml +
        '<div class="community-photo-grid">' +
          photos.map(function (photo, i) { return renderPhoto(event, photo, i); }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function renderBatch() {
    var gallery = document.getElementById('community-gallery');
    if (!gallery) return;

    var end = Math.min(renderedCount + BATCH_SIZE, allEvents.length);
    var html = '';

    for (var i = renderedCount; i < end; i++) {
      html += renderEventSection(allEvents[i]);
    }

    gallery.insertAdjacentHTML('beforeend', html);
    renderedCount = end;

    setupImageProtection(gallery);
    if (lightboxEnabled) setupLightboxHandlers(gallery);

    updateSentinel();
  }

  function updateSentinel() {
    var sentinel = document.getElementById('community-load-sentinel');
    if (!sentinel) return;

    if (renderedCount >= allEvents.length) {
      sentinel.hidden = true;
      if (observer) observer.disconnect();
      return;
    }

    sentinel.hidden = false;
  }

  function setupInfiniteScroll() {
    var sentinel = document.getElementById('community-load-sentinel');
    if (!sentinel || !('IntersectionObserver' in window)) {
      while (renderedCount < allEvents.length) renderBatch();
      return;
    }

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && renderedCount < allEvents.length) {
          renderBatch();
        }
      });
    }, { rootMargin: '200px 0px' });

    observer.observe(sentinel);
  }

  function setupImageProtection(root) {
    root.querySelectorAll('.community-photo-grid img').forEach(function (img) {
      if (img.dataset.protected) return;
      img.dataset.protected = '1';
      img.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  function createLightbox() {
    if (lightboxEl) return lightboxEl;

    lightboxEl = document.createElement('div');
    lightboxEl.className = 'community-lightbox';
    lightboxEl.hidden = true;
    lightboxEl.setAttribute('role', 'dialog');
    lightboxEl.setAttribute('aria-modal', 'true');
    lightboxEl.setAttribute('aria-label', 'Photo viewer');
    lightboxEl.innerHTML =
      '<button type="button" class="community-lightbox-close" aria-label="Close">&times;</button>' +
      '<button type="button" class="community-lightbox-prev" aria-label="Previous photo">&#8249;</button>' +
      '<img class="community-lightbox-image" alt="" draggable="false">' +
      '<button type="button" class="community-lightbox-next" aria-label="Next photo">&#8250;</button>' +
      '<p class="community-lightbox-caption"></p>';

    document.body.appendChild(lightboxEl);

    lightboxEl.querySelector('.community-lightbox-close').addEventListener('click', closeLightbox);
    lightboxEl.querySelector('.community-lightbox-prev').addEventListener('click', showPrevPhoto);
    lightboxEl.querySelector('.community-lightbox-next').addEventListener('click', showNextPhoto);
    lightboxEl.querySelector('.community-lightbox-image').addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    lightboxEl.addEventListener('click', function (e) {
      if (e.target === lightboxEl) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (lightboxEl.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPrevPhoto();
      if (e.key === 'ArrowRight') showNextPhoto();
    });

    return lightboxEl;
  }

  function openLightbox(photos, index, caption) {
    createLightbox();
    lightboxPhotos = photos;
    lightboxIndex = index;
    lightboxCaption = caption;
    updateLightboxImage();
    lightboxEl.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxEl.querySelector('.community-lightbox-close').focus();
  }

  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.hidden = true;
    document.body.style.overflow = '';
  }

  function updateLightboxImage() {
    var img = lightboxEl.querySelector('.community-lightbox-image');
    var cap = lightboxEl.querySelector('.community-lightbox-caption');
    img.src = lightboxPhotos[lightboxIndex];
    img.alt = lightboxCaption + ' photo ' + (lightboxIndex + 1);
    cap.textContent = (lightboxIndex + 1) + ' / ' + lightboxPhotos.length;
    lightboxEl.querySelector('.community-lightbox-prev').hidden = lightboxPhotos.length <= 1;
    lightboxEl.querySelector('.community-lightbox-next').hidden = lightboxPhotos.length <= 1;
  }

  function showPrevPhoto() {
    if (lightboxPhotos.length <= 1) return;
    lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
    updateLightboxImage();
  }

  function showNextPhoto() {
    if (lightboxPhotos.length <= 1) return;
    lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
    updateLightboxImage();
  }

  function setupLightboxHandlers(root) {
    root.querySelectorAll('.community-event').forEach(function (section) {
      if (section.dataset.lightboxBound) return;
      section.dataset.lightboxBound = '1';

      var eventName = section.getAttribute('aria-label') || '';
      var photos = [];
      section.querySelectorAll('.community-photo img').forEach(function (img) {
        photos.push(img.getAttribute('src'));
      });

      section.querySelectorAll('.community-photo--lightbox').forEach(function (figure) {
        figure.addEventListener('click', function () {
          var index = Number(figure.getAttribute('data-photo-index')) || 0;
          openLightbox(photos, index, eventName);
        });
      });
    });
  }

  function applyPageCopy(page) {
    var heading = document.getElementById('community-heading');
    var subheading = document.getElementById('community-subheading');
    if (heading && page.heading) heading.textContent = page.heading;
    if (subheading && page.subheading) subheading.textContent = page.subheading;
  }

  function renderEmptyState() {
    var gallery = document.getElementById('community-gallery');
    if (gallery) {
      gallery.innerHTML = '<p class="community-empty">Event photos coming soon — check back after our next gathering!</p>';
    }
    var sentinel = document.getElementById('community-load-sentinel');
    if (sentinel) sentinel.hidden = true;
  }

  function init() {
    lightboxEnabled = window.matchMedia('(min-width: 769px) and (hover: hover)').matches;

    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    Promise.all([
      loadJSON(DATA_PREFIX + 'styleguide.json'),
      loadJSON(DATA_PREFIX + 'community.json'),
    ]).then(function (results) {
      applyStyleguide(results[0]);
      var community = results[1];
      applyPageCopy(community);
      allEvents = sortEventsByDateDesc(community.events || []);

      if (!allEvents.length) {
        renderEmptyState();
        return;
      }

      renderBatch();
      setupInfiniteScroll();
    }).catch(function () {
      renderEmptyState();
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      escapeHtml: escapeHtml,
      multilineHtml: multilineHtml,
      sortEventsByDateDesc: sortEventsByDateDesc,
      formatEventDate: formatEventDate,
      normalizePhotos: normalizePhotos,
    };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
