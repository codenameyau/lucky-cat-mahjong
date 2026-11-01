'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-bot.js');
const L = require('./mahjong-lucky-cat.js');
const S = require('./mahjong-strategies.js');
const Coach = require('./mahjong-coach.js');
const C = require('./mahjong-competition.js');

function table(opts) {
  const game = E.createGame({ seed: opts.seed || 11, humanSeat: false, dealer: opts.dealer || 0 });
  if (opts.round) game.round = opts.round;
  E.startHand(game);
  const h = game.hand;
  for (let i = 0; i < 4; i++) {
    const s = (opts.seats || [])[i] || {};
    h.seats[i].hand = s.hand ? s.hand.slice() : h.seats[i].hand.filter((t) => !E.isBonus(t)).slice(0, 13);
    h.seats[i].melds = s.melds || [];
    h.seats[i].flowers = s.flowers || [];
    h.seats[i].discards = (s.discards || []).map((t) => ({ tile: t, claimed: false }));
  }
  if (opts.wallLeft !== undefined) h.wall = h.wall.slice(0, opts.wallLeft);
  return game;
}

function pung(tile) {
  return { type: 'pung', tiles: [tile, tile, tile], concealed: false, from: 2 };
}

function targetOf(hand, extra) {
  const game = table(Object.assign({ seats: [null, { hand }] }, extra));
  return L.targetFor(game, 1);
}

describe('strategy registry', () => {
  it('lists lucky-cat and claude-cat, with lucky-cat as the coach default', () => {
    assert.deepEqual(S.ids(), ['lucky-cat', 'claude-cat']);
    assert.equal(S.DEFAULT_COACH, 'lucky-cat');
    assert.equal(S.get('claude-cat').bot, B);
    assert.equal(S.get('lucky-cat').bot, L);
    S.list().forEach((s) => {
      assert.ok(s.name && s.summary && s.details.length, s.id + ' has words for the sheet');
    });
  });

  it('falls back to the default for an unknown id', () => {
    assert.equal(S.has('nope'), false);
    assert.equal(S.get('nope').id, 'lucky-cat');
  });

  it('picks a random strategy from the list', () => {
    assert.equal(S.randomId(() => 0), 'lucky-cat');
    assert.equal(S.randomId(() => 0.99), 'claude-cat');
  });

  it('makes agents that play a full hand', async () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0 });
    const agents = ['lucky-cat', 'claude-cat', 'lucky-cat', 'claude-cat'].map(S.createAgent);
    const res = await E.runHand(game, agents);
    assert.ok(res.type === 'win' || res.type === 'draw');
  });

  it('keeps each strategy\'s tuning to itself', () => {
    const before = B.setTuning({}).defenseScale;
    L.setTuning({ defenseScale: 9 });
    assert.equal(B.setTuning({}).defenseScale, before);
    L.setTuning({ defenseScale: before });
  });
});

describe('lucky-cat opening targets', () => {
  it('reads Thirteen Orphans from 8 different terminals and honors', () => {
    assert.equal(targetOf(['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'c2', 'c3', 'd4', 'd5', 'b6']).id, 'orphans');
  });

  it('reads Nine Gates from 7 tiles of a suit\'s 1112345678999', () => {
    const t = targetOf(['c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c9', 'd2', 'd5', 'b3', 'b7', 'ws', 'dr']);
    assert.deepEqual([t.id, t.suit], ['gates', 'c']);
  });

  it('reads Four Winds from 8 winds', () => {
    assert.equal(targetOf(['we', 'we', 'ws', 'ws', 'ww', 'ww', 'wn', 'wn', 'c2', 'c5', 'd3', 'b7', 'b8']).id, 'winds');
  });

  it('reads All Terminals from 8 ones and nines', () => {
    assert.equal(targetOf(['c1', 'c1', 'c9', 'c9', 'd1', 'd9', 'd9', 'b1', 'b9', 'c4', 'd5', 'b6', 'dr']).id, 'terminals');
  });

  it('reads an honors hand from 8 honors', () => {
    assert.equal(targetOf(['we', 'we', 'ws', 'dr', 'dr', 'dg', 'dg', 'dw', 'c2', 'c3', 'd4', 'b5', 'b6']).id, 'honors');
  });

  it('reads Seven Pairs from 4 pairs', () => {
    assert.equal(targetOf(['c2', 'c2', 'd4', 'd4', 'b6', 'b6', 'c7', 'c7', 'd1', 'b3', 'b9', 'we', 'dr']).id, 'pairs');
  });

  it('reads a Full Flush from 8 tiles of one suit', () => {
    const t = targetOf(['b2', 'b2', 'b2', 'b4', 'b4', 'b4', 'b6', 'b7', 'c3', 'd6', 'we', 'dr', 'c9']);
    assert.deepEqual([t.id, t.suit], ['full', 'b']);
  });

  it('reads Concealed Triplets from 1 to 3 sets in hand, in its main suit', () => {
    const t = targetOf(['c2', 'c2', 'c2', 'd5', 'd6', 'd7', 'b1', 'b4', 'b8', 'c5', 'c8', 'we', 'dr']);
    assert.deepEqual([t.id, t.suit], ['triplets', 'c']);
    // Pairs alone don't make it.
    assert.notEqual(targetOf(['c2', 'c2', 'd5', 'd5', 'd7', 'b1', 'b4', 'b8', 'c5', 'c8', 'we', 'ws', 'dr']).id, 'triplets');
  });

  it('throws a single of another suit first on Concealed Triplets', () => {
    const hand = ['c2', 'c2', 'c2', 'c4', 'c5', 'dr', 'dr', 'we', 'ws', 'c9', 'b4', 'd6', 'b7', 'd9'];
    const game = table({ seats: [null, { hand }] });
    assert.equal(L.targetFor(game, 1).id, 'triplets');
    assert.ok(['b4', 'd6', 'b7', 'd9'].includes(L.chooseTurnAction(game, 1, { kongs: [] }).tile));
  });

  it('reads a Half Flush from one main suit and honors', () => {
    const t = targetOf(['c1', 'c3', 'c4', 'c6', 'c8', 'c9', 'we', 'ws', 'dr', 'd2', 'b5', 'd8', 'b9']);
    assert.deepEqual([t.id, t.suit], ['half', 'c']);
  });

  it('reads Concealed All Sequences from evenly mixed suits', () => {
    assert.equal(targetOf(['c1', 'c3', 'c5', 'c7', 'd2', 'd4', 'd6', 'd8', 'b3', 'b5', 'b7', 'b9', 'we']).id, 'sequences');
  });

  it('gives up Thirteen Orphans once a missing tile is all out', () => {
    const hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'c2', 'c3', 'd4', 'd5', 'b6'];
    const game = table({ seats: [null, { hand }, { discards: ['dr', 'dr', 'dr', 'dr'] }] });
    assert.notEqual(L.targetFor(game, 1).id, 'orphans');
  });

  it('plays for speed with a seat wind or a seat flower', () => {
    // Dealer is seat 0, so seat 1 is South.
    const windy = table({ seats: [null, { hand: ['c2', 'c3', 'c4', 'd5', 'd6', 'b1', 'b4', 'b8', 'c8', 'we', 'dr'], melds: [pung('ws')] }] });
    assert.equal(L.buildContext(windy, 1).fast, true);
    const flower = table({ seats: [null, { hand: ['c2', 'c3', 'c4', 'd5', 'd6', 'b1', 'b4', 'b8', 'c8', 'we', 'dr', 'd9', 'd1'], flowers: ['f2'] }] });
    assert.equal(L.buildContext(flower, 1).fast, true);
    const plain = table({ seats: [null, { hand: ['c2', 'c3', 'c4', 'd5', 'd6', 'b1', 'b4', 'b8', 'c8', 'we', 'dr', 'd9', 'd1'], flowers: ['f3'] }] });
    assert.equal(L.buildContext(plain, 1).fast, false);
  });
});

describe('lucky-cat decisions', () => {
  it('throws a tile the honors hand can\'t use first', () => {
    const hand = ['we', 'we', 'ws', 'ws', 'dr', 'dr', 'dg', 'dg', 'dw', 'c5', 'd4', 'b6', 'ww', 'wn'];
    const game = table({ seats: [null, { hand }] });
    const tile = L.chooseTurnAction(game, 1, { kongs: [] }).tile;
    assert.ok(['c5', 'd4', 'b6'].includes(tile), tile);
  });

  it('claims nothing on Seven Pairs', () => {
    const hand = ['c2', 'c2', 'd4', 'd4', 'b6', 'b6', 'c7', 'c7', 'd1', 'b3', 'b9', 'we', 'c5'];
    const game = table({ seats: [null, { hand }] });
    game.hand.seats[0].discards.push({ tile: 'd4', claimed: false });
    assert.deepEqual(L.chooseClaim(game, 1, { tile: 'd4', from: 0, pung: true, kong: false, chows: [] }), { type: 'pass' });
  });

  it('pungs a dragon', () => {
    const hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'b1', 'b4', 'b8', 'c8', 'we', 'dr', 'dr', 'd9'];
    const game = table({ seats: [null, { hand }] });
    assert.deepEqual(L.chooseClaim(game, 1, { tile: 'dr', from: 0, pung: true, kong: false, chows: [] }), { type: 'pung' });
  });

  it('won\'t chow early into a suit it barely holds', () => {
    // Two Bamboos in hand: the 3-4-5 chow is passed even though it's a step closer.
    const hand = ['b3', 'b4', 'c2', 'c3', 'c4', 'c6', 'c7', 'd5', 'd6', 'd7', 'dr', 'dr', 'c9'];
    const game = table({ seats: [{}, { hand }] });
    assert.deepEqual(L.chooseClaim(game, 1, { tile: 'b5', from: 0, pung: false, kong: false, chows: [['b3', 'b4']] }), { type: 'pass' });
  });
});

describe('coach for a strategy', () => {
  it('speaks for the strategy it is given', () => {
    const hand = ['we', 'we', 'ws', 'ws', 'dr', 'dr', 'dg', 'dg', 'dw', 'c5', 'd4', 'b6', 'ww', 'wn'];
    const game = table({ seats: [{ hand }] });
    const lucky = Coach.forStrategy(L).turnHint(game, 0, { kongs: [] });
    assert.equal(lucky.tile, L.chooseTurnAction(game, 0, { kongs: [] }).tile);
    const claude = Coach.forStrategy(B).turnHint(game, 0, { kongs: [] });
    assert.equal(claude.tile, B.chooseTurnAction(game, 0, { kongs: [] }).tile);
    // The default coach is still claude-cat's.
    assert.equal(Coach.turnHint(game, 0, { kongs: [] }).tile, claude.tile);
  });
});

describe('competition', () => {
  it('adds up every seat by strategy, rotated through the seats', async () => {
    const report = await C.runMatch({ lineup: ['lucky-cat', 'claude-cat', 'lucky-cat', 'claude-cat'], deals: 2, seed: 5 });
    assert.equal(report.deals, 2);
    assert.equal(report.hands, 8);
    const lucky = report.strategies['lucky-cat'];
    const claude = report.strategies['claude-cat'];
    assert.equal(lucky.hands, 16);
    assert.equal(claude.hands, 16);
    // Points only move between players.
    assert.equal(lucky.points + claude.points, 0);
    [lucky, claude].forEach((st) => {
      assert.equal(st.wins, st.selfDraws + st.discardWins + st.robKongWins + st.flowerWins);
    });
    const wins = lucky.wins + claude.wins;
    assert.equal(wins + report.draws, report.hands);
    assert.match(C.formatReport(report), /Points per hand/);
  });

  it('plays the same deals the same way for the same seed', async () => {
    const opts = { lineup: ['lucky-cat', 'claude-cat', 'claude-cat', 'claude-cat'], deals: 1, seed: 9 };
    const a = await C.runMatch(opts);
    const b = await C.runMatch(opts);
    assert.deepEqual(a.strategies, b.strategies);
  });

  it('merges reports from split runs', async () => {
    const lineup = ['lucky-cat', 'claude-cat', 'lucky-cat', 'claude-cat'];
    const a = await C.runMatch({ lineup, deals: 1, seed: 1 });
    const b = await C.runMatch({ lineup, deals: 1, seed: 2 });
    const both = await C.runMatch({ lineup, deals: 2, seed: 1 });
    const merged = C.mergeReports(a, b);
    assert.deepEqual(merged.strategies, both.strategies);
    assert.equal(merged.hands, both.hands);
  });

  it('rejects an unknown strategy', async () => {
    await assert.rejects(C.runMatch({ lineup: ['lucky-cat', 'x', 'lucky-cat', 'lucky-cat'], deals: 1 }), /unknown strategy/);
  });
});
