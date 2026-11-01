'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-bot.js');

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

function meld(type, tile) {
  const i = E.tileIndex(tile);
  const tiles = type === 'chow' ? [tile, E.tileId(i + 1), E.tileId(i + 2)] : Array(type === 'kong' ? 4 : 3).fill(tile);
  return { type, tiles, concealed: false, from: 2 };
}

const noKongs = { kongs: [] };

describe('bot decisions', () => {
  it('always takes a legal win', () => {
    const game = table({});
    assert.deepEqual(B.chooseClaim(game, 1, { win: { faan: 3 }, pung: true, kong: false, chows: [] }), { type: 'win' });
    assert.deepEqual(B.chooseTurnAction(game, 1, { win: { faan: 3 }, kongs: [] }), { type: 'win' });
  });

  it('keeps a ready hand whose wait reaches the 3-faan minimum', () => {
    // Discarding the 9 Circle leaves a Characters half flush waiting on 4/7 Characters.
    const game = table({
      seats: [null, { hand: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'c5', 'c6', 'd9'], flowers: ['f3'] }],
    });
    assert.deepEqual(B.chooseTurnAction(game, 1, noKongs), { type: 'discard', tile: 'd9' });
  });

  it('values each wait exactly, including which ones only win by self-draw', () => {
    // South seat holding a non-seat flower: waiting on Red Dragon or 8 Character.
    // Red Dragon (dragon pung + concealed) is 2 faan on a discard, 3 by self-draw;
    // 8 Character is a chicken hand that can never reach 3.
    const hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b6', 'b7', 'b8', 'dr', 'dr', 'c8', 'c8', 'd1'];
    const game = table({ seats: [null, { hand, flowers: ['f3'] }] });
    assert.equal(B.chooseTurnAction(game, 1, noKongs).tile, 'd1');
    const ready = B.analyzeDiscards(game, 1).candidates[0].analysis.ready;
    const dr = ready.waits.find((w) => w.tile === 'dr');
    const c8 = ready.waits.find((w) => w.tile === 'c8');
    assert.deepEqual([dr.ronOk, dr.tsumoOk], [false, true]);
    assert.deepEqual([c8.ronOk, c8.tsumoOk], [false, false]);
  });

  it('pungs a dragon that sets up a valuable half flush', () => {
    const game = table({
      seats: [null, { hand: ['dg', 'dg', 'dr', 'dr', 'c2', 'c3', 'c4', 'c6', 'c7', 'c9', 'wn', 'ww', 'b5'], flowers: ['f3'] }],
      wallLeft: 70,
    });
    const opts = E.claimOptions(game, 1, 'dg', 3, false);
    assert.equal(opts.pung, true);
    assert.equal(B.chooseClaim(game, 1, opts).type, 'pung');
  });

  it('passes on a chow that breaks a concealed ready hand', () => {
    const game = table({
      seats: [null, { hand: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'c5', 'c6'] }],
    });
    const opts = E.claimOptions(game, 1, 'c3', 0, false);
    assert.ok(opts.chows.length);
    assert.equal(B.chooseClaim(game, 1, opts).type, 'pass');
  });

  it('declares a concealed kong of a tile it has no other use for', () => {
    const game = table({
      seats: [null, { hand: ['wn', 'wn', 'wn', 'wn', 'c2', 'c3', 'c4', 'd5', 'd6', 'b2', 'b3', 'b7', 'b9', 'dr'] }],
    });
    const opts = E.turnOptions(game, 1);
    assert.ok(opts.kongs.some((k) => k.tile === 'wn' && k.kind === 'concealed'));
    assert.deepEqual(B.chooseTurnAction(game, 1, opts), { type: 'kong', tile: 'wn' });
  });

  it('folds against an obvious flush when its own hand is slow', () => {
    // East (seat 1's right) shows three Bamboo melds. Seat 0 is far from ready
    // and holds one live Bamboo and one tile East already threw.
    const game = table({
      seats: [
        { hand: ['b5', 'c1', 'c5', 'c9', 'd1', 'd4', 'd8', 'we', 'ws', 'ww', 'wn', 'dw', 'dg', 'ws'] },
        { hand: ['b4', 'b4', 'b6', 'b7'], melds: [meld('pung', 'b1'), meld('chow', 'b2'), meld('pung', 'b9')], discards: ['c5', 'd8', 'c1', 'wn', 'dw', 'd4', 'c9', 'we'] },
      ],
      wallLeft: 30,
    });
    const threat = B.opponentThreats(game, 0).find((t) => t.seat === 1);
    assert.equal(threat.flush, 'b');
    const pick = B.chooseTurnAction(game, 0, noKongs);
    assert.notEqual(pick.tile, 'b5');
  });
});

describe('expert playbook', () => {
  it('rates three open melds as an Extreme threat', () => {
    const game = table({ seats: [null, { hand: ['b4', 'b4', 'b6', 'b7'], melds: [meld('pung', 'b1'), meld('chow', 'b2'), meld('pung', 'b9')] }] });
    const t = B.opponentThreats(game, 0).find((x) => x.seat === 1);
    assert.equal(t.levelName, 'Extreme');
    assert.equal(t.flush, 'b');
  });

  it('treats tiles thrown since the last meld as the safest', () => {
    const m = Object.assign(meld('pung', 'dr'), { at: 2 });
    const game = table({ seats: [null, { hand: ['c1', 'c2', 'c3', 'd4', 'd5', 'd6', 'b7', 'b8', 'b9', 'c5'], melds: [m], discards: ['c4', 'd7', 'c6'] }] });
    const t = B.opponentThreats(game, 0).find((x) => x.seat === 1);
    const before = B.waitChance(game, t, E.tileIndex('c4')); // thrown before the meld
    const since = B.waitChance(game, t, E.tileIndex('c6')); // thrown after it
    assert.ok(since < before, since + ' vs ' + before);
  });

  it('counts a dead honor as safe and a fresh one as dangerous', () => {
    const game = table({ seats: [{ hand: ['wn', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd1', 'd2', 'd3'] }, { discards: ['wn', 'wn'] }, { discards: ['wn'] }] });
    const t = B.opponentThreats(game, 0).find((x) => x.seat === 3);
    assert.ok(B.waitChance(game, t, E.tileIndex('wn')) < B.waitChance(game, t, E.tileIndex('dg')) / 5);
  });

  it('uses suji: a thrown 2 makes the 5 safer', () => {
    const game = table({ seats: [null, { discards: ['b2', 'b8'] }] });
    const t = B.opponentThreats(game, 0).find((x) => x.seat === 1);
    const plain = table({ seats: [null, { discards: ['c9', 'd9'] }] });
    const t2 = B.opponentThreats(plain, 0).find((x) => x.seat === 1);
    assert.ok(B.waitChance(game, t, E.tileIndex('b5')) < B.waitChance(plain, t2, E.tileIndex('b5')));
  });

  it('always pungs a dragon', () => {
    const game = table({ seats: [{ hand: ['dr', 'dr', 'c2', 'c3', 'c4', 'd6', 'd7', 'b2', 'b3', 'b7', 'b8', 'ws', 'wn'] }] });
    assert.deepEqual(B.chooseClaim(game, 0, E.claimOptions(game, 0, 'dr', 2, false)), { type: 'pung' });
  });

  it('passes on an early chow that doesn\'t get closer to ready', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'c3', 'd5', 'd7', 'b2', 'b4', 'b8', 'b9', 'we', 'ws', 'dg', 'c9'] }] });
    const opts = E.claimOptions(game, 0, 'c4', 3, false);
    assert.ok(opts.chows.length);
    assert.equal(B.chooseClaim(game, 0, opts).type, 'pass');
  });

  it('switches to defense when the wall is nearly gone', () => {
    const game = table({ seats: [{ hand: ['c1', 'c4', 'c8', 'd2', 'd6', 'b3', 'b5', 'b9', 'we', 'ws', 'dg', 'dw', 'wn', 'd9'] }], wallLeft: 10 });
    assert.ok(B.analyzeDiscards(game, 0).defense > 1.25);
  });

  it('keeps a pair when another discard leaves the hand just as ready', () => {
    // c3 and West are pairs. c4 and c7 are singles, and throwing either one also leaves the hand ready.
    const hand = ['c3', 'c3', 'c4', 'c5', 'c6', 'c7', 'd4', 'd5', 'd6', 'b4', 'b5', 'b6', 'ww', 'ww'];
    const game = table({ seats: [{ hand }] });
    const pick = B.chooseTurnAction(game, 0, noKongs).tile;
    assert.ok(['c4', 'c7'].includes(pick), 'discarded ' + pick);
  });

  it('holds an unrevealed dragon when another tile also leaves the hand ready', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'dr'];
    const game = table({ seats: [{ hand }] });
    assert.equal(B.chooseTurnAction(game, 0, noKongs).tile, 'b2');
  });

  it('treats a punged honor as dead and throws a punged tile the hand does not need', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'b9'];
    const game = table({ seats: [{ hand }, { melds: [meld('pung', 'b2'), meld('pung', 'ww')] }] });
    const threats = B.opponentThreats(game, 0);
    assert.equal(B.dealInLoss(game, threats, E.tileIndex('ww')), 0);
    assert.equal(B.chooseTurnAction(game, 0, noKongs).tile, 'b2');
  });

  it('keeps live honors early in the hand, even in a concealed sequence hand', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b3', 'dr'];
    const game = table({ seats: [{ hand }], wallLeft: 80 });
    assert.notEqual(B.analyzeDiscards(game, 0).candidates[0].tile, 'dr');
    // A guest wind is kept early too, as long as it can still become a set.
    const wind = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b3', 'wn'];
    assert.notEqual(B.analyzeDiscards(table({ seats: [{ hand: wind }], wallLeft: 80 }), 0).candidates[0].tile, 'wn');
  });

  it('lets an early honor go once two copies are out', () => {
    const wind = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b9', 'wn'];
    const game = table({ seats: [{ hand: wind }, { discards: ['wn'] }, { discards: ['wn'] }], wallLeft: 80 });
    assert.equal(B.analyzeDiscards(game, 0).candidates[0].tile, 'wn');
  });

  it('keeps an honor pair that is the eyes when the hand is close to winning', () => {
    // Throwing Eight Bamboo leaves the hand ready. The West pair stays.
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'b5', 'b6', 'b8', 'ww', 'ww'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.tile, 'b8');
  });

  it('still counts a punged number tile as able to finish a chow', () => {
    const game = table({ seats: [{}, { melds: [meld('pung', 'b5'), meld('chow', 'b1')] }] });
    const threats = B.opponentThreats(game, 0);
    assert.ok(B.dealInLoss(game, threats, E.tileIndex('b5')) > 0);
  });

  it('plays concealed all sequences and throws the stray honors', () => {
    const hand = ['c2', 'c3', 'c4', 'c6', 'c7', 'd3', 'd4', 'd5', 'b5', 'b6', 'b8', 'b8', 'ww', 'wn'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.analysis.best.plan.id, 'straights');
    assert.ok(['ww', 'wn'].includes(top.tile), 'discarded ' + top.tile);
    const opts = E.claimOptions(game, 0, 'c5', 3, false);
    if (opts.chows.length) assert.equal(B.chooseClaim(game, 0, opts).type, 'pass');
  });

  it('keeps pairs and pungs while going for all triplets', () => {
    // Two pungs, three pairs, and two dragon singles. Breaking a pung is the
    // old recommendation; a single is the tile that can actually go.
    const dragons = table({ seats: [{ hand: ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'wn', 'wn', 'we', 'we', 'dr', 'dg'] }] });
    const loose = B.analyzeDiscards(dragons, 0).candidates[0];
    assert.ok(['triplets', 'concealed-triplets'].includes(loose.analysis.best.plan.id));
    assert.ok(['dr', 'dg'].includes(loose.tile), 'discarded ' + loose.tile);

    // No singles left: throw from a pair, not from a finished pung.
    const pairs = table({ seats: [{ hand: ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'wn', 'wn', 'we', 'we', 'ws', 'ws'] }] });
    const pair = B.analyzeDiscards(pairs, 0).candidates[0];
    assert.ok(['triplets', 'concealed-triplets'].includes(pair.analysis.best.plan.id));
    assert.equal(pairs.hand.seats[0].hand.filter((t) => t === pair.tile).length, 2);

    // Breaking the pung leaves Seven Pairs ready, so that discard still stands.
    const ready = table({ seats: [{ hand: ['c2', 'c2', 'c2', 'd5', 'd5', 'b8', 'b8', 'wn', 'wn', 'we', 'we', 'ws', 'ws', 'dr'] }] });
    assert.equal(B.chooseTurnAction(ready, 0, noKongs).tile, 'c2');
  });

  it('chases seven pairs from more than four concealed pairs and no pungs', () => {
    const hand = ['c2', 'c2', 'c5', 'c5', 'd3', 'd3', 'd8', 'd8', 'b4', 'b4', 'b9', 'we', 'ws', 'wn'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.analysis.best.plan.id, 'pairs');
    assert.ok(['b9', 'we', 'ws', 'wn'].includes(top.tile), 'discarded ' + top.tile);
  });

  it('chases thirteen orphans from nine different terminals and honors', () => {
    const hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'dr', 'c3', 'c4', 'c5', 'd2', 'd3'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.analysis.best.plan.id, 'orphans');
    assert.ok(['c3', 'c4', 'c5', 'd2', 'd3'].includes(top.tile), 'discarded ' + top.tile);
  });

  it('does not chase thirteen orphans from eight kinds, or when a missing one is dead', () => {
    const hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'c2', 'c3', 'c4', 'c5', 'd2', 'd3'];
    const game = table({ seats: [{ hand }] });
    assert.notEqual(B.analyzeDiscards(game, 0).candidates[0].analysis.best.plan.id, 'orphans');
    // Nine kinds, but all four Red Dragons are already in someone's kong.
    const nine = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'wn', 'c3', 'c4', 'c5', 'd2', 'd3'];
    const dead = table({ seats: [{ hand: nine }, { melds: [meld('kong', 'dr')] }] });
    assert.notEqual(B.analyzeDiscards(dead, 0).candidates[0].analysis.best.plan.id, 'orphans');
  });

  it('chases nine gates from eleven of the necessary tiles', () => {
    const hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9', 'c9', 'd2', 'd3', 'b2'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.analysis.best.plan.id, 'gates');
    assert.equal(top.analysis.best.plan.suit, 'c');
    assert.ok(['d2', 'd3', 'b2'].includes(top.tile), 'discarded ' + top.tile);
  });

  it('plays a flush, not nine gates, from ten of the necessary tiles', () => {
    const hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c9', 'c9', 'd2', 'd3', 'b2', 'b3'];
    const game = table({ seats: [{ hand }] });
    assert.notEqual(B.analyzeDiscards(game, 0).candidates[0].analysis.best.plan.id, 'gates');
  });

  it('breaks a pair before slowing the hand down', () => {
    // Two complete runs and four pairs: breaking a pair keeps the hand one
    // step from ready, breaking a run makes it two.
    const hand = ['c1', 'c2', 'c3', 'd4', 'd5', 'd6', 'c7', 'c7', 'd9', 'd9', 'b3', 'b3', 'b6', 'b6'];
    const game = table({ seats: [{ hand }] });
    const pick = B.chooseTurnAction(game, 0, noKongs).tile;
    assert.ok(['c7', 'd9', 'b3', 'b6'].includes(pick), 'discarded ' + pick);
  });

  it('counts flowers exactly as the scoring does', () => {
    const game = table({ seats: [{}, {}, {}, {}] });
    const ctx = B.buildContext(game, 0); // East
    ctx.flowers = []; assert.equal(B.flowerPoints(ctx), 1);
    ctx.flowers = ['f1']; assert.equal(B.flowerPoints(ctx), 1);
    ctx.flowers = ['f2']; assert.equal(B.flowerPoints(ctx), 0);
    ctx.flowers = ['f1', 'f2', 'f3', 'f4']; assert.equal(B.flowerPoints(ctx), 2);
    ctx.flowers = ['f1', 'f2', 'f3', 'f4', 's1']; assert.equal(B.flowerPoints(ctx), 3);
  });

  it('commits to the chow suit even with a dragon set and a seat flower', () => {
    const hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'b7', 'b8', 'b9'];
    const game = table({ seats: [{ hand, melds: [meld('chow', 'b1'), meld('pung', 'dr')], flowers: ['f1'] }] });
    assert.equal(B.chowCommitment(B.buildContext(game, 0)), 'b');
    const pick = B.chooseTurnAction(game, 0, noKongs).tile;
    assert.ok(['c2', 'c3', 'c4', 'd5', 'd6'].includes(pick), 'discarded ' + pick);
  });

  it('throws other suits first after a chow even while folding', () => {
    const hand = ['c2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'b9', 'we', 'ws'];
    const game = table({
      seats: [
        { hand, melds: [meld('chow', 'b1')] },
        { melds: [meld('pung', 'd2'), meld('pung', 'd5'), meld('chow', 'd7')], discards: ['b9', 'we', 'ws'] },
      ],
      wallLeft: 12,
    });
    assert.ok(B.analyzeDiscards(game, 0).folding);
    assert.equal(B.chooseTurnAction(game, 0, noKongs).tile, 'c2');
  });

  it('takes an early open kong when the hand is already open', () => {
    const hand = ['c2', 'c3', 'c4', 'b5', 'b5', 'b5', 'c8', 'c8', 'd2', 'd3'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'dr')] }], wallLeft: 80 });
    const opts = E.claimOptions(game, 0, 'b5', 2, false);
    assert.ok(opts.kong);
    assert.equal(B.chooseClaim(game, 0, opts).type, 'kong');
  });

  it('passes an early flush chow that leaves the hand two tiles from ready', () => {
    // An open Bamboo flush in the making (Red Dragon punged), still two tiles
    // from ready after a chow.
    const hand = ['b1', 'b2', 'b5', 'b6', 'b8', 'b8', 'b9', 'ws', 'ww', 'c4'];
    const melds = [meld('pung', 'dr')];
    const early = table({ seats: [{ hand, melds }], wallLeft: 80 });
    const opts = E.claimOptions(early, 0, 'b3', 3, false);
    assert.ok(opts.chows.length);
    assert.equal(B.chooseClaim(early, 0, opts).type, 'pass');
    // Later in the hand the same chow is worth it.
    const later = table({ seats: [{ hand, melds }], wallLeft: 55 });
    assert.equal(B.chooseClaim(later, 0, E.claimOptions(later, 0, 'b3', 3, false)).type, 'chow');
  });

  it('does not chase seven pairs when the hand holds a pung or only four pairs', () => {
    const pung = table({ seats: [{ hand: ['c2', 'c2', 'c5', 'c5', 'd3', 'd3', 'd8', 'd8', 'b4', 'b4', 'b4', 'we', 'ws', 'wn'] }] });
    assert.notEqual(B.analyzeDiscards(pung, 0).candidates[0].analysis.best.plan.id, 'pairs');
    const four = table({ seats: [{ hand: ['c2', 'c2', 'c5', 'c5', 'd3', 'd3', 'd8', 'd8', 'b9', 'we', 'ws', 'wn', 'c9', 'd9'] }] });
    assert.notEqual(B.analyzeDiscards(four, 0).candidates[0].analysis.best.plan.id, 'pairs');
  });
});

describe('chows and committing to a suit', () => {
  // Seat 1 (South) has exposed the Bamboo chow 1-2-3 and holds ten tiles plus a draw.
  const afterChow = (extra) => table(Object.assign({
    seats: [null, {
      hand: ['b4', 'b5', 'b6', 'b8', 'b9', 'c5', 'd7', 'c2', 'd3', 'ww', 'we'],
      melds: [{ type: 'chow', tiles: ['b1', 'b2', 'b3'], concealed: false, from: 0 }],
    }],
  }, extra));

  it('treats tiles of other suits as worthless after a chow and throws them first', () => {
    const game = afterChow({});
    const pick = B.analyzeDiscards(game, 1).candidates[0].tile;
    assert.ok(['c5', 'd7', 'c2', 'd3'].includes(pick), 'discarded ' + pick);
  });

  it('commits to the chow\'s suit whatever flowers the hand holds', () => {
    const plain = afterChow({});
    assert.equal(B.chowCommitment(B.buildContext(plain, 1)), 'b');
    // Seat 1 is South (wind 2): its flower and season are f2 and s2 and make 2 faan.
    const rich = afterChow({});
    rich.hand.seats[1].flowers = ['f2', 's2'];
    assert.equal(B.flowerPoints(B.buildContext(rich, 1)), 2);
    assert.equal(B.chowCommitment(B.buildContext(rich, 1)), 'b');
  });

  it('does not commit when the open melds already span two suits', () => {
    const game = afterChow({});
    game.hand.seats[1].melds.push({ type: 'pung', tiles: ['c7', 'c7', 'c7'], concealed: false, from: 2 });
    assert.equal(B.chowCommitment(B.buildContext(game, 1)), null);
  });

  it('passes on a chow that only helps a little', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'd5', 'd7', 'b2', 'b4', 'b8', 'b9', 'we', 'ws', 'dg', 'dw', 'c9'] }] });
    const opts = E.claimOptions(game, 0, 'c4', 3, false);
    assert.ok(opts.chows.length);
    assert.equal(B.chooseClaim(game, 0, opts).type, 'pass');
  });

  it('takes a chow that makes a flush hand ready', () => {
    // An open Bamboo half flush (Red Dragon punged) that the chow makes ready.
    // (A concealed hand often does better to stay concealed: that faan
    // doubles the payout.)
    const game = table({
      seats: [{ hand: ['b1', 'b2', 'b4', 'b5', 'b6', 'b7', 'b8', 'ww', 'ww', 'we'], melds: [meld('pung', 'dr')] }],
      wallLeft: 60,
    });
    const opts = E.claimOptions(game, 0, 'b3', 3, false);
    assert.ok(opts.chows.length);
    assert.equal(B.chooseClaim(game, 0, opts).type, 'chow');
  });
});

describe('going for one suit', () => {
  it('throws other suits first once the hand is clearly one suit', () => {
    // Nine Circles and an honor: the Characters go before any Circle.
    const hand = ['c1', 'c2', 'c8', 'c9', 'd3', 'd5', 'd5', 'd6', 'd6', 'd7', 'd8', 'd8', 'd9', 'ww'];
    const game = table({ seats: [{ hand }] });
    assert.equal(B.suitCommitment(B.buildContext(game, 0), E.countsOf(hand)), 'd');
    const pick = B.chooseTurnAction(game, 0, noKongs).tile;
    assert.ok(['c1', 'c2', 'c8', 'c9'].includes(pick), 'discarded ' + pick);
  });

  it('counts sets already made toward the suit', () => {
    const hand = ['d2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b5', 'dr', 'dr', 'c9', 'c1'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'd9')] }] });
    assert.equal(B.suitCommitment(B.buildContext(game, 0), E.countsOf(hand)), 'd');
  });

  it('does not commit a hand spread across suits', () => {
    const hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b4', 'b5', 'b6', 'b7', 'd2', 'd2', 'we', 'dr'];
    const game = table({ seats: [{ hand }] });
    assert.equal(B.suitCommitment(B.buildContext(game, 0), E.countsOf(hand)), null);
  });
});

describe('all triplets keeps the live tiles', () => {
  it('throws the tile with the fewest copies left first', () => {
    // Pung of Eight Bamboo; two Nine Circles and a Seven Character are already out.
    const hand = ['c2', 'c2', 'd5', 'd5', 'ws', 'ws', 'c7', 'd9', 'b3', 'dg', 'dg'];
    const game = table({
      seats: [{ hand, melds: [meld('pung', 'b8')] }, { discards: ['d9', 'd9'] }, { discards: ['c7'] }],
      wallLeft: 70,
    });
    const order = B.analyzeDiscards(game, 0).candidates.map((x) => x.tile);
    assert.equal(order[0], 'd9');
    assert.ok(order.indexOf('c7') < order.indexOf('b3'), order.join(' '));
  });

  it('near the end, counts a suit an opponent chowed as more dangerous', () => {
    const seats = [{}, { melds: [meld('chow', 'b2')] }];
    const early = table({ seats, wallLeft: 70 });
    const late = table({ seats, wallLeft: 20 });
    const i = E.tileIndex('b6');
    const tEarly = B.opponentThreats(early, 0).find((t) => t.seat === 1);
    const tLate = B.opponentThreats(late, 0).find((t) => t.seat === 1);
    assert.ok(B.waitChance(late, tLate, i) > B.waitChance(early, tEarly, i) * 1.3);
  });
});

describe('bot strength', () => {
  // Baseline: discards purely for shanten and live tiles, never claims.
  function efficiencyAgent() {
    return {
      turn: async (g, s, o) => {
        if (o.win) return { type: 'win' };
        const c = E.countsOf(g.hand.seats[s].hand);
        const un = E.unseenCounts(g, s);
        const d = g.hand.seats[s].melds.length;
        let best = null;
        for (let i = 0; i < 34; i++) {
          if (!c[i]) continue;
          c[i]--;
          const sh = E.shanten(c, d);
          let u = 0;
          for (let j = 0; j < 34; j++) {
            if (!un[j] || c[j] >= 4) continue;
            c[j]++;
            if (E.shanten(c, d) < sh) u += un[j];
            c[j]--;
          }
          c[i]++;
          const score = -sh * 1000 + u;
          if (!best || score > best.score) best = { score, tile: E.tileId(i) };
        }
        return { type: 'discard', tile: best.tile };
      },
      claim: async (g, s, o) => (o.win ? { type: 'win' } : { type: 'pass' }),
    };
  }

  it('outscores three tile-efficiency players over a fixed set of hands', async () => {
    // Faan won minus faan paid (capped at 8 so one limit hand can't decide it).
    const net = [0, 0];
    const hands = 48;
    for (let n = 0; n < hands; n++) {
      const botSeat = n % 4;
      const game = E.createGame({ seed: 5000 + n, humanSeat: false, dealer: 0 });
      const agents = [0, 1, 2, 3].map((i) => (i === botSeat ? B.createBotAgent() : efficiencyAgent()));
      const res = await E.runHand(game, agents, {});
      if (res.type !== 'win') continue;
      const f = Math.min(res.score.faan, 8);
      for (let i = 0; i < 4; i++) {
        let d = 0;
        if (i === res.winner) d = res.payer == null ? 3 * f : f;
        else if (res.payer == null || res.payer === i) d = -f;
        net[i === botSeat ? 0 : 1] += i === botSeat ? d : d / 3;
      }
    }
    assert.ok(net[0] > net[1], 'bot ' + net[0] + ' vs baseline average ' + net[1].toFixed(1));
  });
});
