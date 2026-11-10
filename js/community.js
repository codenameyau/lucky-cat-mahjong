(function () {
  'use strict';

  var BATCH_SIZE = 2;
  var DATA_PREFIX = '../data/';

  var allEvents = [];
  var renderedCount = 0;
  var observer = null;
  var lightboxEnabled = false;
  var lightboxEl = null;
  var lightboxPhotos = [];
  var lightboxIndex = 0;
  var lightboxCaption = '';
  var viewObserver = null;

  // Google Analytics, best-effort: a blocked or missing gtag never breaks the page.
  function track(name, params) {
    try {
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag('event', name, params || {});
    } catch (_) { /* analytics is best-effort */ }
  }

  // A section's label is its event name, and its id a slug of the date and name
  // ("2026-08-25-august-2026-invitational"), so two events with one name stay apart.
  function sectionId(event) {
    var slug = String(event.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var date = /^\d{4}-\d{2}-\d{2}/.exec(String(event.date || ''));
    return (date ? date[0] + '-' : '') + slug;
  }

  // A photo's label: its event and its place in that event, counted from 1 ("August 2026 Invitational, photo 3").
  function photoLabel(event, index) {
    return event.name + ', photo ' + (index + 1);
  }

  // The photo's file name without its folder, so a report can find the exact picture.
  function photoFile(photo) {
    return String(photo).split('/').pop();
  }

  // What every event about a section carries.
  function sectionParams(el) {
    return {
      section: el.getAttribute('data-section'),
      section_id: el.getAttribute('data-section-id'),
      section_index: Number(el.getAttribute('data-section-index')),
    };
  }

  // What every event about a photo carries: its section's, plus the photo's own.
  function photoParams(figure) {
    var params = sectionParams(figure.closest('.community-event'));
    params.photo = figure.getAttribute('data-photo-label');
    params.photo_index = Number(figure.getAttribute('data-photo-index')) + 1;
    params.photo_file = figure.getAttribute('data-photo-file');
    return params;
  }

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

  function normalizePhotoPath(photo) {
    if (typeof photo !== 'string') return '';
    var cleaned = photo.trim().replace(/^["']+|["']+$/g, '').replace(/["',]+$/g, '').trim();
    if (!cleaned) return '';
    if (cleaned.charAt(0) === '/') return cleaned;
    if (cleaned.indexOf('media/') === 0) return '/' + cleaned;
    return cleaned;
  }

  function normalizePhotos(photos) {
    if (!photos) return [];
    var list = Array.isArray(photos) ? photos : [photos];
    return list.map(normalizePhotoPath).filter(Boolean);
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

  function renderPhoto(event, photo, index, lazyLoad) {
    var alt = photoLabel(event, index);
    var lightboxClass = lightboxEnabled ? ' community-photo--lightbox' : '';
    var loading = lazyLoad ? 'lazy' : 'eager';
    return (
      '<figure class="community-photo' + lightboxClass + '" data-photo-index="' + index + '"' +
        ' data-photo-label="' + escapeHtml(alt) + '" data-photo-file="' + escapeHtml(photoFile(photo)) + '">' +
        '<img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(alt) + '" loading="' + loading + '" decoding="async" draggable="false">' +
      '</figure>'
    );
  }

  function renderEventSection(event, lazyLoad, sectionIndex) {
    var photos = normalizePhotos(event.photos);
    var descriptionHtml = event.description
      ? '<p class="community-event-description">' + multilineHtml(event.description) + '</p>'
      : '';

    return (
      '<section class="community-event" aria-label="' + escapeHtml(event.name) + '"' +
        ' data-section="' + escapeHtml(event.name) + '" data-section-id="' + escapeHtml(sectionId(event)) + '"' +
        ' data-section-index="' + ((sectionIndex || 0) + 1) + '">' +
        '<div class="community-event-header">' +
          '<h2 class="community-event-name">' + escapeHtml(event.name) + '</h2>' +
          '<time class="community-event-date" datetime="' + escapeHtml(event.date) + '">' +
            formatEventDate(event.date) +
          '</time>' +
        '</div>' +
        descriptionHtml +
        '<div class="community-photo-grid">' +
          photos.map(function (photo, i) { return renderPhoto(event, photo, i, lazyLoad); }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function hydrateVisibleImages(root) {
    root.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
      var rect = img.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
        img.loading = 'eager';
      }
    });
  }

  function renderBatch() {
    var gallery = document.getElementById('community-gallery');
    if (!gallery) return;

    var end = Math.min(renderedCount + BATCH_SIZE, allEvents.length);
    var html = '';
    var lazyLoad = renderedCount > 0;

    for (var i = renderedCount; i < end; i++) {
      html += renderEventSection(allEvents[i], lazyLoad, i);
    }

    gallery.insertAdjacentHTML('beforeend', html);
    renderedCount = end;

    hydrateVisibleImages(gallery);
    setupImageProtection(gallery);
    observeViews(gallery);
    if (lazyLoad) track('community_load_more', { sections_shown: renderedCount, sections_total: allEvents.length });
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

  // Each section and each photo sends one view event, once. A photo counts when half of it is on
  // screen; a section when it reaches the middle of the screen, since a tall one may never be half in view.
  var sectionObserver = null;

  function viewObserverFor(eventName, paramsOf, options) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        track(eventName, paramsOf(entry.target));
      });
    }, options);
    return observer;
  }

  function observeViews(root) {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (!viewObserver) {
      viewObserver = viewObserverFor('community_photo_view', photoParams, { threshold: 0.5 });
      sectionObserver = viewObserverFor('community_section_view', sectionParams, { rootMargin: '0px 0px -50% 0px' });
    }
    root.querySelectorAll('.community-event, .community-photo').forEach(function (el) {
      if (el.dataset.viewObserved) return;
      el.dataset.viewObserved = '1';
      (el.classList.contains('community-event') ? sectionObserver : viewObserver).observe(el);
    });
  }

  // A click or tap on a photo, whether or not it opens the viewer (phones have none).
  function setupPhotoClicks(gallery) {
    gallery.addEventListener('click', function (e) {
      var figure = e.target.closest && e.target.closest('.community-photo');
      if (!figure || !gallery.contains(figure)) return;
      var params = photoParams(figure);
      params.lightbox = lightboxEnabled;
      track('community_photo_click', params);
    });
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

    lightboxEl.querySelector('.community-lightbox-close').addEventListener('click', function () { closeLightbox('button'); });
    lightboxEl.querySelector('.community-lightbox-prev').addEventListener('click', function () { showPrevPhoto('button'); });
    lightboxEl.querySelector('.community-lightbox-next').addEventListener('click', function () { showNextPhoto('button'); });
    lightboxEl.querySelector('.community-lightbox-image').addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    lightboxEl.addEventListener('click', function (e) {
      if (e.target === lightboxEl) closeLightbox('backdrop');
    });

    document.addEventListener('keydown', function (e) {
      if (lightboxEl.hidden) return;
      if (e.key === 'Escape') closeLightbox('key');
      if (e.key === 'ArrowLeft') showPrevPhoto('key');
      if (e.key === 'ArrowRight') showNextPhoto('key');
    });

    return lightboxEl;
  }

  var lightboxSection = null;
  var lightboxSeen = 0;

  // The viewer's current photo, with its section's labels.
  function lightboxParams() {
    var params = lightboxSection ? sectionParams(lightboxSection) : {};
    params.photo = lightboxCaption + ', photo ' + (lightboxIndex + 1);
    params.photo_index = lightboxIndex + 1;
    params.photo_file = photoFile(lightboxPhotos[lightboxIndex]);
    return params;
  }

  function openLightbox(photos, index, caption, section) {
    createLightbox();
    lightboxSection = section || null;
    lightboxSeen = 1;
    lightboxPhotos = photos;
    lightboxIndex = index;
    lightboxCaption = caption;
    updateLightboxImage();
    lightboxEl.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxEl.querySelector('.community-lightbox-close').focus();
  }

  function closeLightbox(method) {
    if (!lightboxEl || lightboxEl.hidden) return;
    var params = lightboxParams();
    params.method = method || 'button';
    params.photos_seen = lightboxSeen;
    track('community_lightbox_close', params);
    lightboxEl.hidden = true;
    document.body.style.overflow = '';
  }

  function updateLightboxImage() {
    var img = lightboxEl.querySelector('.community-lightbox-image');
    var cap = lightboxEl.querySelector('.community-lightbox-caption');
    img.src = lightboxPhotos[lightboxIndex];
    img.alt = lightboxCaption + ', photo ' + (lightboxIndex + 1);
    cap.textContent = (lightboxIndex + 1) + ' / ' + lightboxPhotos.length;
    lightboxEl.querySelector('.community-lightbox-prev').hidden = lightboxPhotos.length <= 1;
    lightboxEl.querySelector('.community-lightbox-next').hidden = lightboxPhotos.length <= 1;
  }

  function stepLightbox(step, method) {
    if (lightboxPhotos.length <= 1) return;
    lightboxIndex = (lightboxIndex + step + lightboxPhotos.length) % lightboxPhotos.length;
    lightboxSeen += 1;
    updateLightboxImage();
    var params = lightboxParams();
    params.direction = step < 0 ? 'previous' : 'next';
    params.method = method || 'button';
    track('community_lightbox_navigate', params);
  }

  function showPrevPhoto(method) { stepLightbox(-1, method); }

  function showNextPhoto(method) { stepLightbox(1, method); }

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
          openLightbox(photos, index, eventName, section);
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

    loadJSON(DATA_PREFIX + 'community.json').then(function (community) {
      applyPageCopy(community);
      allEvents = sortEventsByDateDesc(community.events || []);

      if (!allEvents.length) {
        renderEmptyState();
        return;
      }

      setupPhotoClicks(document.getElementById('community-gallery'));
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
      normalizePhotoPath: normalizePhotoPath,
      normalizePhotos: normalizePhotos,
      renderPhoto: renderPhoto,
      renderEventSection: renderEventSection,
      sectionId: sectionId,
      photoLabel: photoLabel,
      photoFile: photoFile,
    };
  } else if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
