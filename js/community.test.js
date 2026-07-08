'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  escapeHtml,
  multilineHtml,
  sortEventsByDateDesc,
  formatEventDate,
  normalizePhotos,
} = require('./community.js');

describe('Community utilities', function () {
  describe('escapeHtml', function () {
    it('escapes HTML special characters', function () {
      assert.equal(escapeHtml('Tom & Jerry <3'), 'Tom &amp; Jerry &lt;3');
      assert.equal(escapeHtml('"quotes"'), '&quot;quotes&quot;');
    });
  });

  describe('multilineHtml', function () {
    it('converts paragraph breaks and single newlines', function () {
      assert.equal(
        multilineHtml('Line one\n\nLine two'),
        'Line one<br><br>Line two'
      );
      assert.equal(multilineHtml('A\nB'), 'A<br>B');
    });

    it('escapes HTML in text', function () {
      assert.equal(multilineHtml('<script>'), '&lt;script&gt;');
    });
  });

  describe('sortEventsByDateDesc', function () {
    it('sorts events newest first without mutating input', function () {
      const events = [
        { name: 'Old', date: '2026-01-01' },
        { name: 'New', date: '2026-06-15' },
        { name: 'Mid', date: '2026-03-10' },
      ];
      const sorted = sortEventsByDateDesc(events);

      assert.deepEqual(sorted.map(function (e) { return e.name; }), ['New', 'Mid', 'Old']);
      assert.equal(events[0].name, 'Old');
    });
  });

  describe('formatEventDate', function () {
    it('formats ISO dates for display', function () {
      assert.equal(formatEventDate('2026-06-15'), 'June 15, 2026');
    });

    it('returns escaped input for invalid dates', function () {
      assert.equal(formatEventDate('not-a-date'), 'not-a-date');
    });
  });

  describe('normalizePhotos', function () {
    it('returns arrays unchanged and filters empty values', function () {
      assert.deepEqual(normalizePhotos(['/a.jpg', '', '/b.jpg']), ['/a.jpg', '/b.jpg']);
    });

    it('wraps a single photo string in an array', function () {
      assert.deepEqual(normalizePhotos('/photo.jpg'), ['/photo.jpg']);
    });

    it('returns empty array for missing photos', function () {
      assert.deepEqual(normalizePhotos(null), []);
    });
  });
});
