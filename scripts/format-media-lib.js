'use strict';

const fs = require('fs');
const path = require('path');

function mediaWebPath(relativePath) {
  return '/media/' + relativePath.split(path.sep).join('/');
}

function normalizePhotoPath(photo) {
  if (typeof photo !== 'string') return '';
  return photo.trim().replace(/^["']+|["']+$/g, '').replace(/["',]+$/g, '').trim();
}

function photosEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function buildDateToWebpMap(mediaDir, dirPath) {
  const map = new Map();

  function walk(current) {
    if (!fs.existsSync(current)) return;
    fs.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        return;
      }
      if (path.extname(entry.name).toLowerCase() !== '.webp') return;

      const rel = path.relative(mediaDir, entryPath);
      const segments = rel.split(path.sep);
      if (!segments.length) return;
      const dateKey = segments[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

      const webPath = mediaWebPath(rel);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(webPath);
    });
  }

  walk(dirPath);

  map.forEach(function (photos, dateKey) {
    map.set(dateKey, photos.sort());
  });

  return map;
}

function defaultEventName(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) return String(dateKey);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function eventDateKey(event) {
  if (!event || !event.date) return '';
  return String(event.date).slice(0, 10);
}

function updateCommunityFromMedia(community, dateToPhotos, allowedDates) {
  let changed = false;
  if (!Array.isArray(community.events)) community.events = [];

  const existingDates = new Set();
  community.events.forEach(function (event) {
    const dateKey = eventDateKey(event);
    if (!dateKey) return;
    existingDates.add(dateKey);
    if (allowedDates && !allowedDates.has(dateKey)) return;
    if (!dateToPhotos.has(dateKey)) return;

    const nextPhotos = dateToPhotos.get(dateKey).map(normalizePhotoPath).filter(Boolean);
    const currentPhotos = (event.photos || []).map(normalizePhotoPath);
    if (photosEqual(currentPhotos, nextPhotos)) return;

    event.photos = nextPhotos;
    changed = true;
  });

  const datesToAdd = [];
  dateToPhotos.forEach(function (photos, dateKey) {
    if (allowedDates && !allowedDates.has(dateKey)) return;
    if (existingDates.has(dateKey)) return;
    const nextPhotos = photos.map(normalizePhotoPath).filter(Boolean);
    if (!nextPhotos.length) return;
    datesToAdd.push(dateKey);
  });

  // Oldest first so each unshift leaves newest events at the front.
  datesToAdd.sort(function (a, b) {
    return String(a).localeCompare(String(b));
  });
  datesToAdd.forEach(function (dateKey) {
    const photos = dateToPhotos.get(dateKey).map(normalizePhotoPath).filter(Boolean);
    community.events.unshift({
      name: defaultEventName(dateKey),
      date: dateKey,
      description: '',
      photos: photos,
    });
    changed = true;
  });

  return changed;
}

module.exports = {
  mediaWebPath,
  normalizePhotoPath,
  photosEqual,
  buildDateToWebpMap,
  defaultEventName,
  updateCommunityFromMedia,
};
