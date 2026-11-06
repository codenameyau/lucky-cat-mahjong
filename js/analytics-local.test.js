'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  'index.html',
  'play-mahjong/index.html',
  'play-mahjong/playback/index.html',
  'hong-kong-mahjong-scoring/index.html',
  'events/index.html',
  'community/index.html',
  'which-mahjong-tiles-are-you/index.html',
];

// The pattern each page uses to spot a local or private address.
function localPattern(html) {
  const m = /var localHost = \/(.+)\/i\.test\(location\.hostname\);/.exec(html);
  assert.ok(m, 'page has the local-address check');
  return new RegExp(m[1], 'i');
}

test('every page that loads Google Analytics skips it on local addresses', () => {
  PAGES.forEach((page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /G-B514HH987M/, page + ' loads Google Analytics');
    assert.match(html, /if \(!localHost\) \{/, page + ' only loads it off a local address');
    assert.match(html, /function gtag\(\)\{ if \(!localHost\) dataLayer\.push\(arguments\); \}/, page + ' sends nothing from a local address');
    // The script tag isn't in the page itself: it's added only when not local.
    assert.doesNotMatch(html, /<script async src="https:\/\/www\.googletagmanager\.com/, page + ' has no always-on tag');
  });
});

test('localhost and private network addresses count as local', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const local = localPattern(html);
  ['localhost', '127.0.0.1', '::1', '[::1]', '192.168.1.20', '192.168.0.5', '10.0.0.7', '172.16.4.2', '172.31.255.1', 'my-laptop.local'].forEach((host) => {
    assert.ok(local.test(host), host + ' is local');
  });
});

test('the live site and public addresses are not local', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const local = localPattern(html);
  ['luckycatmahjong.com', 'www.luckycatmahjong.com', 'codenameyau.github.io', '172.32.0.1', '172.15.0.1', '8.8.8.8', '192.169.1.1'].forEach((host) => {
    assert.ok(!local.test(host), host + ' is not local');
  });
});
