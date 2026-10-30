'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const quiz = require('../js/tile-quiz.js');
const { IMAGE_DIR, IMAGE_WIDTH, IMAGE_HEIGHT, buildTilePage, tilePageUrl } = require('./tile-pages-lib.js');

const QUIZ_DIR = path.join(__dirname, '..', 'which-mahjong-tiles-are-you');

function meta(html, attr, name) {
  const match = html.match(new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)">'));
  return match && match[1];
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('tile share pages', () => {
  it('keeps the Lucky Cat logo as the quiz page preview', () => {
    const quizPage = fs.readFileSync(path.join(QUIZ_DIR, 'index.html'), 'utf8');
    assert.equal(meta(quizPage, 'property', 'og:image'), 'https://luckycatmahjong.com/logo.png');
  });

  it('points each tile page preview at that tile', () => {
    const tile = quiz.getTile('red-dragon');
    const html = buildTilePage(tile);
    assert.equal(meta(html, 'property', 'og:image'), 'https://luckycatmahjong.com/which-mahjong-tiles-are-you/images/red-dragon.png');
    assert.equal(meta(html, 'name', 'twitter:image'), 'https://luckycatmahjong.com/which-mahjong-tiles-are-you/images/red-dragon.png');
    assert.equal(meta(html, 'property', 'og:url'), tilePageUrl(tile));
    assert.equal(meta(html, 'property', 'og:title'), 'Red Dragon: The Final Boss');
  });

  it('redirects each tile page to the quiz showing that tile', () => {
    const html = buildTilePage(quiz.getTile('nine-dot'));
    assert.match(html, /<meta http-equiv="refresh" content="0; url=\/which-mahjong-tiles-are-you\/\?tile=nine-dot">/);
    assert.match(html, /location\.replace\('\/which-mahjong-tiles-are-you\/\?tile=nine-dot'\)/);
  });

  it('escapes quotes in tile copy', () => {
    const html = buildTilePage(quiz.getTile('nine-character'));
    assert.match(meta(html, 'property', 'og:description'), /^&quot;It was on sale\.&quot;/);
  });

  it('has an up-to-date page for every tile (run `npm run generate-tile-pages`)', () => {
    quiz.TILES.forEach((tile) => {
      const file = path.join(QUIZ_DIR, tile.id, 'index.html');
      assert.ok(fs.existsSync(file), tile.id + ' page is missing');
      assert.equal(fs.readFileSync(file, 'utf8'), buildTilePage(tile), tile.id + ' page is out of date');
    });
  });

  it('has a preview image for every tile', () => {
    quiz.TILES.forEach((tile) => {
      const file = path.join(QUIZ_DIR, IMAGE_DIR, tile.id + '.png');
      assert.ok(fs.existsSync(file), tile.id + ' image is missing');
      assert.deepEqual(pngSize(file), { width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    });
  });
});
