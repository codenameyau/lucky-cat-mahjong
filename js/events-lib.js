'use strict';

function slugifyTitle(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeEventDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim());
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function buildEventSlug(date, title) {
  const normalizedDate = normalizeEventDate(date);
  const titleSlug = slugifyTitle(title);
  if (!normalizedDate || !titleSlug) return '';
  return `${normalizedDate}-${titleSlug}`;
}

function parseEventDate(dateStr) {
  const normalized = normalizeEventDate(dateStr);
  if (!normalized) return null;
  const parts = normalized.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isUpcoming(event, today) {
  const eventDate = parseEventDate(event.date);
  if (!eventDate) return false;
  return eventDate >= (today || startOfToday());
}

function sortUpcoming(events) {
  return events.slice().sort(function (a, b) {
    return parseEventDate(a.date) - parseEventDate(b.date);
  });
}

function sortPast(events) {
  return events.slice().sort(function (a, b) {
    return parseEventDate(b.date) - parseEventDate(a.date);
  });
}

function partitionEvents(events, today) {
  const reference = today || startOfToday();
  const upcoming = [];
  const past = [];

  events.forEach(function (event) {
    if (isUpcoming(event, reference)) upcoming.push(event);
    else past.push(event);
  });

  return {
    upcoming: sortUpcoming(upcoming),
    past: sortPast(past),
  };
}

function formatEventDate(dateStr, timeStr) {
  const date = parseEventDate(dateStr);
  if (!date) return escapeHtml(dateStr || '');
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (timeStr) return `${formatted} · ${escapeHtml(timeStr)}`;
  return formatted;
}

function eventDetailUrl(slug) {
  return `/events/${slug}/`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c];
  });
}

function multilineHtml(text) {
  return escapeHtml(text)
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function truncateText(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1).trim() + '…';
}

function absoluteUrl(path, siteOrigin) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const origin = siteOrigin || 'https://luckycatmahjong.com';
  return origin + (path.startsWith('/') ? path : '/' + path);
}

function enrichEvent(event, filenameSlug) {
  const slug = filenameSlug || buildEventSlug(event.date, event.title);
  return Object.assign({}, event, { slug: slug });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    slugifyTitle: slugifyTitle,
    normalizeEventDate: normalizeEventDate,
    buildEventSlug: buildEventSlug,
    parseEventDate: parseEventDate,
    startOfToday: startOfToday,
    isUpcoming: isUpcoming,
    sortUpcoming: sortUpcoming,
    sortPast: sortPast,
    partitionEvents: partitionEvents,
    formatEventDate: formatEventDate,
    eventDetailUrl: eventDetailUrl,
    escapeHtml: escapeHtml,
    multilineHtml: multilineHtml,
    truncateText: truncateText,
    absoluteUrl: absoluteUrl,
    enrichEvent: enrichEvent,
  };
}

if (typeof window !== 'undefined') {
  window.EventsLib = {
    buildEventSlug: buildEventSlug,
    partitionEvents: partitionEvents,
    formatEventDate: formatEventDate,
    eventDetailUrl: eventDetailUrl,
    escapeHtml: escapeHtml,
    multilineHtml: multilineHtml,
    truncateText: truncateText,
    isUpcoming: isUpcoming,
    startOfToday: startOfToday,
    absoluteUrl: absoluteUrl,
  };
}
