'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const E = require('../js/mahjong-engine.js');
const R = require('./review-lib.js');

const SEED = '3764864992-EE';
const SPEC = { seed: SEED, coach: 'lucky-cat' };
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'strategies', 'feedback.json'), 'utf8'));

describe('reviewing a hand from its seed', () => {
  it('deals the hand the seed says', async () => {
    const run = await R.replay(Object.assign({}, SPEC, { until: 1 }));
    assert.deepEqual(run.turns[0].hand, E.sortTiles(E.dealtHand(3764864992, 1).hand));
  });

  it('plays your moves, then follows the coach', async () => {
    const run = await R.replay(Object.assign({}, SPEC, { moves: ['dr'], until: 2 }));
    assert.equal(run.turns[0].played, 'dr');
    const second = run.turns.find((t) => t.kind === 'turn' && t.number === 2);
    assert.ok(!second.hand.includes('dr'));
    assert.equal(second.played, second.top);
  });

  it('says so when a move isn\'t in your hand', async () => {
    await assert.rejects(R.replay(Object.assign({}, SPEC, { moves: ['b1'] })), /b1 isn't in your hand/);
  });

  it('gets back to a turn from the moves that reached it', async () => {
    const first = await R.replay(SPEC);
    const turn = first.turns.filter((t) => t.kind === 'turn')[4];
    const again = await R.replay(Object.assign({}, SPEC, { moves: turn.movesSoFar, until: turn.number }));
    assert.deepEqual(again.turns.find((t) => t.number === turn.number && t.kind === 'turn').hand, turn.hand);
  });

  it('reads a save file\'s exact hand', async () => {
    const first = await R.replay(Object.assign({}, SPEC, { moves: ['d4', 'c1', 'd9'], until: 4 }));
    const payload = {
      game: Object.assign(E.gameRecord(first.game)),
      strategies: { seats: [null, 'lucky-cat', 'lucky-cat', 'lucky-cat'], coach: 'lucky-cat' },
    };
    const spec = R.specFromSave({ payload });
    assert.equal(spec.seed, SEED);
    const again = await R.replay(Object.assign({}, spec, { until: 4 }));
    const hand = (run) => run.turns.find((t) => t.kind === 'turn' && t.number === 4).hand;
    assert.deepEqual(hand(again), hand(first));
  });

  it('finds a turn where the coach throws a tile', async () => {
    const hits = await R.find(SPEC, 'dg', 1);
    assert.equal(hits[0].number, 1);
    assert.equal(hits[0].top, 'dg');
  });
});

describe('feedback', () => {
  it('reads a saved turn just as the replay did', async () => {
    const run = await R.replay(SPEC);
    run.turns.filter((t) => t.kind === 'turn' && !t.canWin).slice(0, 8).forEach((turn) => {
      const entry = R.caseFrom(SPEC, turn, { keep: ['xx'] });
      assert.equal(R.checkCase(entry).top, turn.top, 'turn ' + turn.number);
    });
  });

  it('passes only when the coach\'s choice fits', async () => {
    const run = await R.replay(Object.assign({}, SPEC, { until: 1 }));
    const turn = run.turns[0];
    assert.equal(R.checkCase(R.caseFrom(SPEC, turn, { keep: [turn.top] })).pass, false);
    assert.equal(R.checkCase(R.caseFrom(SPEC, turn, { drop: [turn.top] })).pass, true);
    assert.equal(R.checkCase(R.caseFrom(SPEC, turn, { drop: ['xx'] })).pass, false);
  });

  it('every saved case is well formed', () => {
    const ids = cases.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of cases) {
      assert.ok(E.parseHandSeed(c.seed), c.id);
      assert.ok(['open', 'fixed'].includes(c.status), c.id);
      assert.ok(c.keep.length || c.drop.length, c.id);
    }
  });

  for (const c of cases.filter((x) => x.status === 'fixed')) {
    it('still gets ' + c.id + ' right', () => {
      assert.ok(R.checkCase(c).pass, c.note);
    });
  }
});
