'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createEventsApi } = require('./events.harness.js');

describe('Events utilities', function () {
  const { api } = createEventsApi();

  describe('buildEventSlug', function () {
    it('combines date and kebab-case title', function () {
      assert.equal(
        api.buildEventSlug('2026-07-25', 'Mahjong in the Park'),
        '2026-07-25-mahjong-in-the-park'
      );
    });

    it('handles punctuation in titles', function () {
      assert.equal(
        api.buildEventSlug('2026-08-15', 'Summer Mahjong Night!'),
        '2026-08-15-summer-mahjong-night'
      );
    });
  });

  describe('partitionEvents', function () {
    const today = new Date(2026, 6, 7);

    it('sorts upcoming events soonest first', function () {
      const events = [
        { title: 'Later', date: '2026-09-01', slug: '2026-09-01-later' },
        { title: 'Soon', date: '2026-08-01', slug: '2026-08-01-soon' },
      ];
      const groups = api.partitionEvents(events, today);
      assert.deepEqual(groups.upcoming.map(function (e) { return e.slug; }), [
        '2026-08-01-soon',
        '2026-09-01-later',
      ]);
    });

    it('sorts past events most recent first', function () {
      const events = [
        { title: 'Old', date: '2026-01-01', slug: '2026-01-01-old' },
        { title: 'Recent', date: '2026-05-10', slug: '2026-05-10-recent' },
      ];
      const groups = api.partitionEvents(events, today);
      assert.deepEqual(groups.past.map(function (e) { return e.slug; }), [
        '2026-05-10-recent',
        '2026-01-01-old',
      ]);
    });

    it('treats today as upcoming', function () {
      const events = [{ title: 'Today', date: '2026-07-07', slug: '2026-07-07-today' }];
      const groups = api.partitionEvents(events, today);
      assert.equal(groups.upcoming.length, 1);
      assert.equal(groups.past.length, 0);
    });
  });

  describe('eventDetailUrl', function () {
    it('builds detail paths', function () {
      assert.equal(api.eventDetailUrl('2026-07-25-mahjong-in-the-park'), '/events/2026-07-25-mahjong-in-the-park/');
    });
  });

  describe('escapeHtml', function () {
    it('escapes HTML special characters', function () {
      assert.equal(api.escapeHtml('<b>"\'&</b>'), '&lt;b&gt;&quot;&#39;&amp;&lt;/b&gt;');
    });
  });

  describe('formatEventDate', function () {
    it('includes optional time and year', function () {
      const formatted = api.formatEventDate('2026-08-15', '7:00 PM');
      assert.match(formatted, /Aug 15/);
      assert.match(formatted, /2026/);
      assert.match(formatted, /7:00 PM/);
    });
  });
});

describe('sync-events slug validation', function () {
  const { loadEventsFromEntries } = require('../scripts/sync-events-lib.js');

  it('detects slug mismatches', function () {
    const result = loadEventsFromEntries([
      {
        filename: 'wrong-slug.json',
        slug: 'wrong-slug',
        data: { title: 'Mahjong Night', date: '2026-08-15' },
      },
    ]);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /Slug mismatch/);
  });
});
