'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  canonicalPathFromIndexHtml,
  redirectIndexHtmlPath,
} = require('./canonical-redirect.js');

describe('canonicalPathFromIndexHtml', function () {
  it('returns null when path is already canonical', function () {
    assert.equal(canonicalPathFromIndexHtml('/'), null);
    assert.equal(canonicalPathFromIndexHtml('/events/'), null);
    assert.equal(canonicalPathFromIndexHtml('/hong-kong-mahjong-scoring/'), null);
  });

  it('maps root index.html to /', function () {
    assert.equal(canonicalPathFromIndexHtml('/index.html'), '/');
    assert.equal(canonicalPathFromIndexHtml('/INDEX.HTML'), '/');
  });

  it('maps nested index.html to the directory URL', function () {
    assert.equal(canonicalPathFromIndexHtml('/events/index.html'), '/events/');
    assert.equal(canonicalPathFromIndexHtml('/community/index.html'), '/community/');
    assert.equal(
      canonicalPathFromIndexHtml('/hong-kong-mahjong-scoring/index.html'),
      '/hong-kong-mahjong-scoring/'
    );
  });

  it('returns null for unrelated paths', function () {
    assert.equal(canonicalPathFromIndexHtml('/events'), null);
    assert.equal(canonicalPathFromIndexHtml('/about.html'), null);
    assert.equal(canonicalPathFromIndexHtml(''), null);
    assert.equal(canonicalPathFromIndexHtml(null), null);
  });
});

describe('redirectIndexHtmlPath', function () {
  it('calls replace with the clean path and preserves query/hash', function () {
    var replaced = null;
    var target = redirectIndexHtmlPath({
      pathname: '/events/index.html',
      search: '?ref=1',
      hash: '#tickets',
      replace: function (url) { replaced = url; },
    });
    assert.equal(target, '/events/?ref=1#tickets');
    assert.equal(replaced, '/events/?ref=1#tickets');
  });

  it('is a no-op for canonical paths', function () {
    var called = false;
    var target = redirectIndexHtmlPath({
      pathname: '/events/',
      search: '',
      hash: '',
      replace: function () { called = true; },
    });
    assert.equal(target, null);
    assert.equal(called, false);
  });
});
