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

test('Complex never says "almost no chance to win": under 1% it leaves the chance out', () => {
  assert.equal(Coach.chance(0.004, 'win'), '');
  assert.equal(Coach.chance(0.05, 'win'), 'a 5% chance to win');
  assert.equal(Coach.chance(0.11, 'win'), 'an 11% chance to win');
  const pick = { tile: 'c1', ml: { ev: -30, pWin: 0.004, avgWin: 0 } };
  const rival = { tile: 'c2', ml: { ev: -45, pWin: 0.002, avgWin: 0, choice: true } };
  const said = Coach.modelLine([pick, rival], pick);
  assert.equal(said, 'The model expects −30 score on average from this discard. Next best discard is Two Character: −45 score.');
  const sure = { tile: 'c1', ml: { ev: 12, pWin: 0.08, avgWin: 1200 } };
  const likely = Coach.modelLine([sure], sure);
  assert.match(likely, /^The model expects \+12 score on average from this discard, with an 8% chance to win \(about 1,200 points\)\.$/);
});

test('Detailed leaves out the score and says why in plain words', () => {
  for (const seed of [3, 5, 9, 29]) {
    const h = hintFor('neural-cat', 'detailed', seed);
    assert.doesNotMatch(words(h), /model expects|score|chance to win/, 'seed ' + seed);
    assert.match(words(h), /I pick it because it /, 'seed ' + seed);
    assert.ok(words(h).length <= Coach.MAX_TEXT);
  }
});

test('Simple is the action and the hand to go for, with no reason and never the score', () => {
  for (const id of ['neural-cat', 'jorge-yau', 'lucky-cat', 'only-orphans']) {
    for (const seed of [3, 5, 9, 29, 41]) {
      const h = hintFor(id, 'simple', seed);
      assert.doesNotMatch(words(h), /model expects|score|chance to win|Lucky Cat (discards this|would|plays)/, id + ' ' + seed);
      assert.ok(h.tips.length <= 1, id + ' says one thing after the action at most');
      assert.doesNotMatch(words(h), /I like it because|I pick it because/, id + ' ' + seed + ' gives no reason');
      if (h.aim) assert.match(words(h), /\. Go for [^.]+, (about \d+ faan|the 13 faan limit)(, short of the \d+ faan minimum)?\.$/, id + ' ' + seed + ': ' + words(h));
      assert.ok(words(h).length <= 260, id + ' ' + seed + ': ' + words(h).length + ' characters');
    }
  }
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

test('Simple and Detailed speak as "I", never "the model"; Complex may say "the model"', () => {
  for (const detail of ['simple', 'detailed']) {
    for (const id of ['neural-cat', 'jorge-yau', 'lucky-cat', 'only-orphans']) {
      for (const seed of [3, 5, 9, 29, 41, 77, 12]) {
        assert.doesNotMatch(words(hintFor(id, detail, seed)), /\bthe model\b|\bthe network\b/i, detail + ' ' + id + ' ' + seed);
      }
    }
  }
  assert.match(words(hintFor('neural-cat', 'complex', 3)), /The model expects/);
});

// Feedback on a discard the coach did not pick: the worst-scored tile of the hint.
function feedbackFor(id, detail, seed) {
  const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
  E.startHand && E.startHand(game);
  const coach = Coach.forStrategy(S.get(id).bot, { detail });
  const hint = coach.turnHint(game, 0, E.turnOptions(game, 0));
  if (!hint || !hint.candidates || hint.candidates.length < 2) return null;
  const worst = hint.candidates[hint.candidates.length - 1].tile;
  return Coach.shapeFeedback(coach.discardFeedback(hint, worst), hint, detail);
}

function feedbackHint(id, seed) {
  const game = E.createGame({ seed, humanSeat: true, dealer: 0 });
  E.startHand && E.startHand(game);
  return Coach.forStrategy(S.get(id).bot).turnHint(game, 0, E.turnOptions(game, 0));
}

test('Feedback follows the coach setting: numbers only on Complex, "I" on Simple and Detailed', () => {
  let complexNumbers = 0;
  for (const id of ['neural-cat', 'jorge-yau', 'lucky-cat', 'only-orphans']) {
    for (const seed of [3, 5, 9, 29]) {
      const s = feedbackFor(id, 'simple', seed), d = feedbackFor(id, 'detailed', seed), c = feedbackFor(id, 'complex', seed);
      if (!s) continue;
      for (const [name, fb] of [['simple', s], ['detailed', d]]) {
        const w = words(fb);
        assert.doesNotMatch(w, /\bthe model\b|Lucky Cat (discards this|would|plays)|\bscore\b/i, name + ' ' + id + ' ' + seed + ': ' + w);
        assert.ok(w.length <= Coach.MAX_TEXT);
      }
      assert.ok(s.tips.length <= 1, 'Simple gives one reason');
      // Simple also names the hand to go for (Coach.aimSentence), which the others leave out.
      const aim = (' ' + Coach.aimSentence(feedbackHint(id, seed).aim)).trimEnd();
      assert.ok(words(s).length - aim.length <= words(d).length && words(d).length <= words(c).length + 120, id + ' ' + seed);
      if (/model expects|Lucky Cat (discards this|would|plays)/.test(words(c))) complexNumbers++;
    }
  }
  assert.ok(complexNumbers > 0, 'Complex still gives the model\'s numbers');
  // The coach is always "I", Complex too.
  for (const seed of [3, 5, 9, 29]) {
    const c = feedbackFor('neural-cat', 'complex', seed);
    if (c) assert.doesNotMatch(words(c), /The coach /);
  }
  const said = [3, 5, 9, 29].map((seed) => feedbackFor('neural-cat', 'detailed', seed)).filter(Boolean).map(words);
  assert.ok(said.some((t) => /^.*I pick .* I like it because it /.test(t)), said.join(' | '));
});

test('The table read is shorter on Simple and Detailed, and whole on Complex', () => {
  const note = { kind: 'analysis', action: 'A step slower than it needed to be.',
    detail: 'Throwing Two Bamboo leaves the hand 2 tiles from ready; throwing Nine Circles keeps it 1 tile from ready, with 6 live tiles to improve it. Tiles that help: Three and Six Bamboo. 4 are still in the wall (2 in other hands). Vivien was ready on Five Circles, and Two Bamboo was not one of the tiles. That is a step back from last turn.' };
  const s = Coach.shapeNote(note, 'simple'), d = Coach.shapeNote(note, 'detailed'), c = Coach.shapeNote(note, 'complex');
  assert.equal(c.detail, note.detail);
  assert.ok(s.detail.length <= 140 && d.detail.length <= 260 && s.detail.length < d.detail.length && d.detail.length < c.detail.length);
  assert.match(s.detail, /^Throwing Two Bamboo leaves the hand 2 tiles from ready/);
});
