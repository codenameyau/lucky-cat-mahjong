'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const {
  mediaWebPath,
  normalizePhotoPath,
  photosEqual,
  buildDateToWebpMap,
  updateCommunityFromMedia,
} = require('./format-media-lib.js');

describe('format-media utilities', function () {
  describe('mediaWebPath', function () {
    it('builds web paths with forward slashes', function () {
      assert.equal(mediaWebPath(path.join('2026-06-14', 'photo.webp')), '/media/2026-06-14/photo.webp');
    });
  });

  describe('normalizePhotoPath', function () {
    it('strips trailing commas and quotes from pasted paths', function () {
      assert.equal(normalizePhotoPath('"/media/2026-06-14/photo.webp",'), '/media/2026-06-14/photo.webp');
      assert.equal(normalizePhotoPath("/media/2026-06-14/photo.webp',"), '/media/2026-06-14/photo.webp');
    });

    it('trims whitespace', function () {
      assert.equal(normalizePhotoPath('  /media/photo.webp  '), '/media/photo.webp');
    });
  });

  describe('photosEqual', function () {
    it('compares photo arrays by value', function () {
      assert.equal(photosEqual(['/a.webp', '/b.webp'], ['/a.webp', '/b.webp']), true);
      assert.equal(photosEqual(['/a.webp'], ['/b.webp']), false);
    });
  });

  describe('buildDateToWebpMap', function () {
    /** @type {string} */
    let tempDir;

    beforeEach(function () {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-media-'));
    });

    afterEach(function () {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('groups webp files by date subfolder', function () {
      const dateDir = path.join(tempDir, '2026-06-14');
      fs.mkdirSync(dateDir, { recursive: true });
      fs.writeFileSync(path.join(dateDir, 'b.webp'), '');
      fs.writeFileSync(path.join(dateDir, 'a.webp'), '');
      const skipDir = path.join(tempDir, 'not-a-date');
      fs.mkdirSync(skipDir, { recursive: true });
      fs.writeFileSync(path.join(skipDir, 'skip.webp'), '');

      const map = buildDateToWebpMap(tempDir, tempDir);
      assert.deepEqual(map.get('2026-06-14'), [
        '/media/2026-06-14/a.webp',
        '/media/2026-06-14/b.webp',
      ]);
      assert.equal(map.has('not-a-date'), false);
    });
  });

  describe('updateCommunityFromMedia', function () {
    it('replaces photos for matching event dates', function () {
      const community = {
        events: [
          {
            name: 'June event',
            date: '2026-06-14',
            photos: ['/media/2026-06-14/old.webp'],
          },
          {
            name: 'Other event',
            date: '2026-05-26',
            photos: ['/media/2026-05-26/keep.webp'],
          },
        ],
      };
      const dateToPhotos = new Map([
        ['2026-06-14', ['/media/2026-06-14/new-a.webp', '/media/2026-06-14/new-b.webp']],
      ]);

      const changed = updateCommunityFromMedia(community, dateToPhotos);

      assert.equal(changed, true);
      assert.deepEqual(community.events[0].photos, [
        '/media/2026-06-14/new-a.webp',
        '/media/2026-06-14/new-b.webp',
      ]);
      assert.deepEqual(community.events[1].photos, ['/media/2026-05-26/keep.webp']);
    });

    it('cleans trailing comma artifacts before comparing paths', function () {
      const community = {
        events: [
          {
            name: 'June event',
            date: '2026-06-14',
            photos: ['"/media/2026-06-14/a.webp",'],
          },
        ],
      };
      const dateToPhotos = new Map([
        ['2026-06-14', ['/media/2026-06-14/a.webp']],
      ]);

      const changed = updateCommunityFromMedia(community, dateToPhotos);

      assert.equal(changed, false);
      assert.deepEqual(community.events[0].photos, ['"/media/2026-06-14/a.webp",']);
    });

    it('writes cleaned paths when replacing event photos', function () {
      const community = {
        events: [
          {
            name: 'June event',
            date: '2026-06-14',
            photos: ['"/media/2026-06-14/old.webp",'],
          },
        ],
      };
      const dateToPhotos = new Map([
        ['2026-06-14', ['/media/2026-06-14/new.webp']],
      ]);

      const changed = updateCommunityFromMedia(community, dateToPhotos);

      assert.equal(changed, true);
      assert.deepEqual(community.events[0].photos, ['/media/2026-06-14/new.webp']);
    });
  });
});
