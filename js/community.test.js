'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  escapeHtml,
  multilineHtml,
  sortEventsByDateDesc,
  formatEventDate,
  normalizePhotos,
  renderPhoto,
  renderEventSection,
  sectionId,
  photoLabel,
  photoFile,
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

    it('strips trailing commas and quotes from pasted paths', function () {
      assert.deepEqual(
        normalizePhotos(['"/media/2026-06-14/photo.webp",']),
        ['/media/2026-06-14/photo.webp']
      );
    });

    it('adds a leading slash to media paths', function () {
      assert.deepEqual(normalizePhotos(['media/2026-06-14/photo.webp']), ['/media/2026-06-14/photo.webp']);
    });
  });

  describe('renderPhoto', function () {
    it('eager-loads the first batch of photos', function () {
      var html = renderPhoto({ name: 'June Social' }, '/media/photo.webp', 0, false);
      assert.match(html, /loading="eager"/);
    });

    it('lazy-loads later batches of photos', function () {
      var html = renderPhoto({ name: 'June Social' }, '/media/photo.webp', 0, true);
      assert.match(html, /loading="lazy"/);
    });
  });

  describe('analytics labels', function () {
    var event = { name: 'August 2026 Invitational', date: '2026-08-25', photos: ['/media/2026-08-25/abc.webp', 'media/2026-08-25/def.webp'] };

    it('names each section by its date and event, and each photo by its event and place', function () {
      assert.equal(sectionId(event), '2026-08-25-august-2026-invitational');
      assert.equal(photoLabel(event, 2), 'August 2026 Invitational, photo 3');
      assert.equal(photoFile('/media/2026-08-25/abc.webp'), 'abc.webp');
    });

    it('labels a section with its name, id and place on the page', function () {
      var html = renderEventSection(event, false, 0);
      assert.match(html, /data-section="August 2026 Invitational"/);
      assert.match(html, /data-section-id="2026-08-25-august-2026-invitational"/);
      assert.match(html, /data-section-index="1"/);
    });

    it('labels every photo with its label and file, and uses the label as its alt text', function () {
      var html = renderEventSection(event, false, 0);
      assert.match(html, /data-photo-label="August 2026 Invitational, photo 1" data-photo-file="abc.webp"/);
      assert.match(html, /data-photo-label="August 2026 Invitational, photo 2" data-photo-file="def.webp"/);
      assert.match(html, /alt="August 2026 Invitational, photo 2"/);
    });

    it('escapes the labels', function () {
      var html = renderPhoto({ name: 'Tom & "Jerry"' }, '/media/x.webp', 0, false);
      assert.match(html, /data-photo-label="Tom &amp; &quot;Jerry&quot;, photo 1"/);
    });
  });
});
