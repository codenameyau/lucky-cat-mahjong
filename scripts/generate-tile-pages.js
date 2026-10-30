#!/usr/bin/env node
/*
 * Generates the per-tile pages and link-preview images for the "Which Mahjong Tile Are You?" quiz.
 *
 *   which-mahjong-tiles-are-you/<tile-id>/index.html   copy of the quiz page with that tile's preview tags
 *   which-mahjong-tiles-are-you/images/<tile-id>.png   1200x630 preview image
 *
 * Re-run after editing which-mahjong-tiles-are-you/index.html or any tile's art or copy.
 *
 * Usage:
 *   node scripts/generate-tile-pages.js            pages and images
 *   node scripts/generate-tile-pages.js --pages    pages only (no browser needed)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const quiz = require('../js/tile-quiz.js');
const art = require('../js/tile-quiz-art.js');
const { IMAGE_DIR, IMAGE_WIDTH, IMAGE_HEIGHT, buildTilePage } = require('./tile-pages-lib.js');

const ROOT = path.join(__dirname, '..');
const QUIZ_DIR = path.join(ROOT, 'which-mahjong-tiles-are-you');
const FONT_FILE = path.join(ROOT, 'fonts', 'kn-yuanmo-sc.ttf');

function writePages() {
  const template = fs.readFileSync(path.join(QUIZ_DIR, 'index.html'), 'utf8');
  quiz.TILES.forEach((tile) => {
    const dir = path.join(QUIZ_DIR, tile.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildTilePage(template, tile));
  });
  console.log('Wrote ' + quiz.TILES.length + ' tile pages');
}

// Runs in the browser: draws one preview card and returns it as a PNG data URL.
async function drawPreview({ tile, color, svg, width, height }) {
  const heading = '"KN Yuanmo SC", sans-serif';
  const body = '"Avenir Next", Avenir, -apple-system, "Segoe UI", sans-serif';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  function fit(text, weightAndSize, maxSize, minSize, maxWidth) {
    let size = maxSize;
    do {
      ctx.font = weightAndSize(size);
      size -= 2;
    } while (ctx.measureText(text).width > maxWidth && size >= minSize);
  }

  function wrap(text, maxWidth) {
    const lines = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  ctx.fillStyle = '#FFF8F0';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(320, 315, 255, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, width, 14);
  ctx.fillRect(0, height - 14, width, 14);

  ctx.drawImage(img, 320 - 184, 315 - 230, 368, 460);

  const x = 600;
  const textWidth = width - x - 70;
  ctx.textAlign = 'left';

  ctx.fillStyle = color;
  fit(tile.name, (s) => s + 'px ' + heading, 84, 48, textWidth);
  ctx.fillText(tile.name, x, 190);

  ctx.fillStyle = '#1A1A1A';
  const title = tile.emoji + ' ' + tile.title;
  fit(title, (s) => s + 'px ' + heading, 44, 28, textWidth);
  ctx.fillText(title, x, 258);

  ctx.fillStyle = '#3D3D3D';
  ctx.font = '600 32px ' + body;
  wrap(tile.tagline, textWidth).slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, x, 330 + i * 44);
  });

  ctx.fillStyle = color;
  ctx.font = '36px ' + heading;
  ctx.fillText('Which mahjong tile are you?', x, 520);
  ctx.fillStyle = '#5C5C5C';
  ctx.font = '600 26px ' + body;
  ctx.fillText('luckycatmahjong.com', x, 562);

  return canvas.toDataURL('image/png');
}

async function writeImages() {
  const puppeteer = require('puppeteer');
  const outDir = path.join(QUIZ_DIR, IMAGE_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  // Prefer Puppeteer's bundled Chrome; fall back to a locally installed Chrome if it hasn't been downloaded.
  const browser = await puppeteer.launch().catch(() => puppeteer.launch({ channel: 'chrome' }));
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const fontBase64 = fs.readFileSync(FONT_FILE).toString('base64');
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const face = new FontFace('KN Yuanmo SC', bytes.buffer);
      document.fonts.add(await face.load());
    }, fontBase64);

    for (const tile of quiz.TILES) {
      const dataUrl = await page.evaluate(drawPreview, {
        tile: { name: tile.name, title: tile.title, emoji: tile.emoji, tagline: tile.tagline },
        color: art.colorFor(tile.id),
        svg: art.render(tile.id, { width: 368 }),
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
      });
      fs.writeFileSync(path.join(outDir, tile.id + '.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
    }
  } finally {
    await browser.close();
  }
  console.log('Wrote ' + quiz.TILES.length + ' preview images');
}

async function main() {
  writePages();
  if (!process.argv.includes('--pages')) await writeImages();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
