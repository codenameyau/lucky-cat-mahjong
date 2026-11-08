'use strict';
// Coach settings: Simple (the default), Detailed and Complex.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('./mahjong-engine.js');
const Coach = require('./mahjong-coach.js');
const S = require('./mahjong-strategies.js');

function hintFor(id, detail, seed) {
  const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
  E.startHand && E.startHand(game);
  return Coach.forStrategy(S.get(id).bot, { detail }).turnHint(game, 0, E.turnOptions(game, 0));
}
const words = (h) => [h.action].concat(h.tips).join(' ');

test('Complex says everything: the model\'s score stays', () => {
  const h = hintFor('neural-cat', 'complex', 29);
  assert.match(words(h), /The model expects [+−]?\d/);
  // No detail given is Complex too, so every other caller is unchanged.
  const game = E.createGame({ seed: 29, humanSeat: true, dealer: 0 });
  E.startHand && E.startHand(game);
  const plain = Coach.forStrategy(S.get('neural-cat').bot).turnHint(game, 0, E.turnOptions(game, 0));
  assert.equal(words(plain), words(h));
});

test('Detailed leaves out the score and says why in plain words', () => {
  for (const seed of [3, 5, 9, 29]) {
    const h = hintFor('neural-cat', 'detailed', seed);
    assert.doesNotMatch(words(h), /model expects|score|chance to win/, 'seed ' + seed);
    assert.match(words(h), /The model picks it because it /, 'seed ' + seed);
    assert.ok(words(h).length <= Coach.MAX_TEXT);
  }
});

test('Simple is the action and a short reason, never the score', () => {
  for (const id of ['neural-cat', 'jorge-yau', 'lucky-cat', 'only-orphans']) {
    for (const seed of [3, 5, 9, 29, 41]) {
      const h = hintFor(id, 'simple', seed);
      assert.doesNotMatch(words(h), /model expects|score|chance to win|network plays/, id + ' ' + seed);
      assert.ok(h.tips.length <= 1, id + ' has one reason at most');
      assert.ok(words(h).length <= 260, id + ' ' + seed + ': ' + words(h).length + ' characters');
    }
  }
  // A learned strategy says what it likes about the pick, with the words above.
  const said = [3, 5, 9, 29, 41, 77, 12].map((seed) => words(hintFor('neural-cat', 'simple', seed)));
  assert.ok(said.some((t) => /The model likes it because it /.test(t)), said.join(' | '));
});

test('Simple is shorter than Detailed, and Detailed shorter than Complex', () => {
  let n = 0;
  for (const seed of [3, 5, 9, 29, 41]) {
    const a = words(hintFor('neural-cat', 'simple', seed)).length;
    const b = words(hintFor('neural-cat', 'detailed', seed)).length;
    const c = words(hintFor('neural-cat', 'complex', seed)).length;
    assert.ok(a <= b && b <= c, seed + ': ' + [a, b, c]);
    if (a < c) n++;
  }
  assert.ok(n >= 3);
});

test('a win declaration reads the same at every level', () => {
  const win = { faan: 6, items: [{ name: 'Half Flush', faan: 3 }] };
  for (const d of ['simple', 'detailed', 'complex']) {
    const shaped = Coach.shape({ kind: 'win', action: 'Mahjong! Win by self-draw.', tips: [] }, d);
    assert.equal(shaped.action, 'Mahjong! Win by self-draw.');
  }
  assert.ok(win);
});

test('the game keeps the choice in the game prefs and has Coach settings on the menu', () => {
  const game = fs.readFileSync(path.join(__dirname, 'mahjong-game.js'), 'utf8');
  assert.match(game, /prefs\.coachDetail = id;\s*writeJson\(PREFS_KEY, prefs\)/);
  assert.match(game, /COACH_DETAILS\.indexOf\(prefs\.coachDetail\) !== -1 \? prefs\.coachDetail : 'simple'/, 'Simple is the default');
  assert.match(game, /button\('Coach settings'/);
  assert.match(game, /Coach\.forStrategy\(Strategies\.get\(id\)\.bot, \{ detail: coachDetail\(\) \}\)/);
  assert.doesNotMatch(game, /Coach\.forStrategy\(Strategies\.get\([^)]*\)\.bot\)/, 'every coach is built with the chosen detail');
  const html = fs.readFileSync(path.join(__dirname, '..', 'playing-mahjong/index.html'), 'utf8');
  assert.match(html, /id="coach-settings-sheet"/);
  for (const name of ['Simple', 'Detailed', 'Complex']) assert.match(game, new RegExp("name: '" + name + "'"));
});
