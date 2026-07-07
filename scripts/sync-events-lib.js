'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildEventSlug,
  enrichEvent,
} = require('../js/events-lib.js');

function loadEventsFromEntries(entries) {
  const warnings = [];
  const events = entries.map(function (entry) {
    const data = entry.data;
    const expectedSlug = buildEventSlug(data.date, data.title);
    if (expectedSlug && entry.slug !== expectedSlug) {
      warnings.push(
        `Slug mismatch for ${entry.filename}: file is "${entry.slug}" but date+title produce "${expectedSlug}"`
      );
    }
    return enrichEvent(data, entry.slug);
  });

  events.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  });

  return { events: events, warnings: warnings };
}

function listEventFiles(eventsDir) {
  if (!fs.existsSync(eventsDir)) return [];
  return fs.readdirSync(eventsDir)
    .filter(function (name) {
      return name.endsWith('.json') && name !== 'events-index.json';
    })
    .map(function (name) {
      return {
        filename: name,
        slug: name.replace(/\.json$/, ''),
        filePath: path.join(eventsDir, name),
      };
    });
}

function loadEvents(eventsDir) {
  const entries = listEventFiles(eventsDir).map(function (entry) {
    return {
      filename: entry.filename,
      slug: entry.slug,
      data: JSON.parse(fs.readFileSync(entry.filePath, 'utf8')),
    };
  });
  return loadEventsFromEntries(entries);
}

module.exports = {
  loadEventsFromEntries: loadEventsFromEntries,
  loadEvents: loadEvents,
};
