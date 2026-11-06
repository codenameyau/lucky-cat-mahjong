'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./mahjong-engine.js');
const S = require('./mahjong-strategies.js');
const A = require('./mahjong-analysis.js');

async function recording(seed, dealer, passes) {
  const game = E.createGame({ seed, humanSeat: false, dealer });
  const agents = ['only-orphans', 'jorge-yau', 'lucky-cat', 'jorge-yau'].map((id) => S.createAgent(id));
  if (passes) agents[0].claim = () => ({ type: 'pass' });
  await E.runHand(game, agents, {});
  return E.parsePlayback(E.playbackText(game, { seat: 0 }));
}

describe('playback analysis', () => {
  it('writes notes in step order, each with words and a step', async () => {
    const rec = await recording(7, 0, false);
    const notes = A.analyze(rec);
    assert.ok(notes.length > 3);
    assert.equal(notes[0].step, 0);
    notes.forEach((n, k) => {
      assert.equal(n.kind, 'analysis');
      assert.ok(n.action && n.detail, 'note ' + k + ' has an action and a detail');
      assert.doesNotMatch(n.action + n.detail, /undefined|NaN|null/);
      if (k) assert.ok(n.step >= notes[k - 1].step, 'in order');
    });
    assert.match(notes[notes.length - 1].action, /won by|wall ran out/);
  });

  it('can be run in pieces and ends with the same notes', async () => {
    const rec = await recording(7, 0, false);
    const whole = A.analyze(rec);
    const part = A.createAnalyst(rec);
    while (part.run(part.index() + 5, 0)) { /* keep going */ }
    part.run(rec.actions.length + 1, 0);
    assert.deepEqual(part.notes(), whole);
  });

  it('names a discard that dealt in, and a win that was passed over', async () => {
    const text = [];
    for (let seed = 100; seed < 260 && text.length < 2; seed++) {
      const notes = A.analyze(await recording(seed, seed % 4, true));
      if (!text.some((t) => /Dealt in/.test(t)) && notes.some((n) => /^Dealt in to/.test(n.action))) text.push('Dealt in');
      if (!text.some((t) => /Missed/.test(t)) && notes.some((n) => /^Missed win/.test(n.action))) text.push('Missed');
    }
    assert.ok(text.indexOf('Dealt in') !== -1, 'a deal-in is named');
    assert.ok(text.indexOf('Missed') !== -1, 'a missed win is named');
  });

  it('says who is ready and which of your tiles would win for them', async () => {
    let found = null;
    for (let seed = 1; seed < 80 && !found; seed++) {
      found = A.analyze(await recording(seed, seed % 4, false)).filter((n) => / is ready\.$/.test(n.action))[0];
    }
    assert.ok(found, 'someone is ready in some hand');
    assert.match(found.detail, /Waiting on .* for up to \d+ faan/);
    assert.match(found.detail, /safe against|would deal in/);
  });

  it('knows the wait: the tiles that finish a ready hand', () => {
    const game = E.createGame({ seed: 5, humanSeat: false, dealer: 0 });
    E.startHand(game, 5);
    const s = game.hand.seats[1];
    s.hand = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'dr', 'we'];
    s.melds = [];
    s.flowers = [];
    const w = A.waitsOf(game, 1);
    assert.ok(w.waits.length === 1 && w.waits[0].i === 27, 'single-tile wait on the East Wind');
  });
});
