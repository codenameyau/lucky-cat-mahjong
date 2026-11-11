#!/usr/bin/env node
/* Fails if a change to the game doesn't raise GAME_VERSION.

   node scripts/check-game-version.js [base]    (base: origin/master)

   Compares this branch with where it left the base. CI runs it on every PR. */

'use strict';

const { execFileSync } = require('node:child_process');

const ENGINE = 'js/mahjong-engine.js';

// What the game is made of: its scripts, its two pages and what they load.
function isGameFile(file) {
  if (/\.(test|harness)\.js$/.test(file) || file.endsWith('.md')) return false;
  return /^js\/mahjong-.*\.js$/.test(file) ||
    /^js\/(points|play-options|offline|offline-cache)\.js$/.test(file) ||
    file === 'css/play.css' ||
    /^(play-mahjong|playing-mahjong|assets\/sounds|assets\/music|tiles)\//.test(file);
}

function versionIn(source) {
  const m = /var GAME_VERSION = '(\d+)\.(\d+)\.(\d+)';/.exec(source);
  if (!m) throw new Error('no GAME_VERSION in ' + ENGINE);
  return m.slice(1).map(Number);
}

function isHigher(now, before) {
  for (let i = 0; i < 3; i++) if (now[i] !== before[i]) return now[i] > before[i];
  return false;
}

// The problem with a change, or null. `files` are the changed paths.
function problem(files, before, now) {
  const game = files.filter(isGameFile);
  if (!game.length || isHigher(now, before)) return null;
  return 'These game files changed, but GAME_VERSION is still ' + now.join('.') + ' (it was ' + before.join('.') + '):\n' +
    game.map((f) => '  ' + f).join('\n') +
    '\nBump GAME_VERSION in ' + ENGINE + ' and VERSION in js/offline-cache.js to the same higher version, ' +
    'and update the assertion in js/mahjong-strategies.test.js.';
}

function main(base, head) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const from = git('merge-base', base, head).trim();
  const files = git('diff', '--name-only', from, head).split('\n').filter(Boolean);
  const found = problem(files, versionIn(git('show', from + ':' + ENGINE)), versionIn(git('show', head + ':' + ENGINE)));
  if (found) { console.error(found); process.exitCode = 1; return; }
  console.log(files.some(isGameFile) ? 'GAME_VERSION was bumped' : 'No game files changed');
}

if (require.main === module) main(process.argv[2] || 'origin/master', process.argv[3] || 'HEAD');

module.exports = { isGameFile, versionIn, isHigher, problem };
