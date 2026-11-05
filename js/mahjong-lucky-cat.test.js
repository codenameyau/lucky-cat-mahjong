'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-lucky-cat.js');
const MahjongBot = require('./mahjong-bot.js');

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

  it('never throws a lone dragon nobody has shown, even while folding', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b3', 'dr'];
    assert.notEqual(B.chooseTurnAction(table({ seats: [{ hand }] }), 0, noKongs).tile, 'dr');
    const late = table({ seats: [{ hand }], wallLeft: 8 });
    assert.notEqual(B.chooseTurnAction(late, 0, noKongs).tile, 'dr');
    // A copy on the table means it's no longer unseen.
    const shown = table({ seats: [{ hand }, { discards: ['dr'] }] });
    assert.equal(B.chooseTurnAction(shown, 0, noKongs).tile, 'dr');
  });

  it('throws a lone dragon when that leaves the hand ready', () => {
    const only = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'b5', 'b6', 'b2', 'b2', 'dr'];
    assert.equal(B.chooseTurnAction(table({ seats: [{ hand: only }] }), 0, noKongs).tile, 'dr');
    const also = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'dr'];
    assert.equal(B.chooseTurnAction(table({ seats: [{ hand: also }] }), 0, noKongs).tile, 'dr');
  });

  it('throws a lone dragon only when nothing else is left to throw', () => {
    const game = table({ seats: [{ hand: ['dr', 'dg'], melds: [meld('pung', 'c2'), meld('pung', 'c5'), meld('pung', 'd5'), meld('pung', 'b8')] }] });
    assert.ok(['dr', 'dg'].includes(B.chooseTurnAction(game, 0, noKongs).tile));
  });

  it('drops the plain hand as a plan until it already has the minimum faan', () => {
    const c = E.countsOf(['c2', 'c3', 'c4', 'c7', 'c8', 'd2', 'd3', 'd9', 'b2', 'b5', 'b6', 'b9', 'wn']);
    const plainIn = (game) => MahjongBot.basePlans(c, B.buildContext(game, 0)).map((p) => p);
    const short = table({ seats: [{ hand: [] }] });
    const ctxShort = B.buildContext(short, 0);
    assert.equal(MahjongBot.aimablePlans(plainIn(short), c, ctxShort).some((p) => p.id === 'plain'), false);
    // Both own-seat flowers and seasons, all four of a kind: 3 faan or more before the tiles.
    const rich = table({ seats: [{ hand: [], flowers: ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'] }] });
    const ctxRich = B.buildContext(rich, 0);
    assert.equal(MahjongBot.aimablePlans(plainIn(rich), c, ctxRich).some((p) => p.id === 'plain'), true);
  });

  it('turns to a flush or All Triplets when the plain hand was all it had', () => {
    const c = E.countsOf(['c2', 'c3', 'c4', 'c7', 'c8', 'd2', 'd3', 'b5', 'b6', 'wn']);
    const game = table({ seats: [{ hand: [], melds: [meld('pung', 'c9')] }] });
    const ctx = B.buildContext(game, 0);
    const ids = MahjongBot.aimablePlans([{ id: 'plain', counts: c, shantenFn: E.standardShanten, faan: 1 }], c, ctx).map((p) => p.id);
    assert.deepEqual(ids, ['half-c', 'triplets']);
  });

  it('treats a punged honor as dead and throws a punged tile the hand does not need', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'b9'];
    const game = table({ seats: [{ hand }, { melds: [meld('pung', 'b2'), meld('pung', 'ww')] }] });
    const threats = B.opponentThreats(game, 0);
    assert.equal(B.dealInLoss(game, threats, E.tileIndex('ww')), 0);
    assert.equal(B.chooseTurnAction(game, 0, noKongs).tile, 'b2');
  });

  it('throws honors first on Concealed Straights, even early', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b3', 'dr'];
    const game = table({ seats: [{ hand }], wallLeft: 80 });
    const a = B.analyzeDiscards(game, 0);
    assert.equal(a.ctx.leadPlan.id, 'straights');
    assert.notEqual(a.candidates[0].tile, 'dr'); // a dragon nobody has shown stays
    const shown = table({ seats: [{ hand }, { discards: ['dr'] }], wallLeft: 80 });
    assert.equal(B.analyzeDiscards(shown, 0).candidates[0].tile, 'dr');
    const wind = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd6', 'd7', 'b2', 'b3', 'wn'];
    assert.equal(B.analyzeDiscards(table({ seats: [{ hand: wind }], wallLeft: 80 }), 0).candidates[0].tile, 'wn');
  });

  it('keeps a live dragon early in a hand that can\'t be Concealed Straights', () => {
    // A set of East Winds rules out an all-runs hand.
    const hand = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'b3', 'b4', 'b6', 'we', 'we', 'we', 'c9', 'dr'];
    const a = B.analyzeDiscards(table({ seats: [{ hand }] }), 0);
    assert.notEqual(a.ctx.leadPlan.id, 'straights');
    assert.notEqual(a.candidates[0].tile, 'dr');
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

  it('plays concealed straights and throws the stray honors', () => {
    const hand = ['c2', 'c3', 'c4', 'c6', 'c7', 'd3', 'd4', 'd5', 'b5', 'b6', 'b8', 'b8', 'ww', 'wn'];
    const game = table({ seats: [{ hand }] });
    const top = B.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.analysis.best.plan.id, 'straights');
    assert.ok(['ww', 'wn'].includes(top.tile), 'discarded ' + top.tile);
    const opts = E.claimOptions(game, 0, 'c5', 3, false);
    if (opts.chows.length) assert.equal(B.chooseClaim(game, 0, opts).type, 'pass');
  });

  it('keeps pairs and pungs while going for all triplets', () => {
    // Two pungs, three pairs, and two dragon singles. The dragons stay, so a
    // pair goes, not a finished pung.
    const dragons = table({ seats: [{ hand: ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'wn', 'wn', 'we', 'we', 'dr', 'dg'] }] });
    const loose = B.analyzeDiscards(dragons, 0).candidates[0];
    assert.ok(['triplets', 'concealed-triplets'].includes(loose.analysis.best.plan.id));
    assert.ok(['b8', 'wn', 'we'].includes(loose.tile), 'discarded ' + loose.tile);

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

  it('commits to the chow\'s suit unless flowers give all but one faan', () => {
    const plain = afterChow({});
    assert.equal(B.chowCommitment(B.buildContext(plain, 1)), 'b');
    // Seat 1 is South (wind 2): its flower and season are f2 and s2 and make
    // 2 faan, so All Sequences or a self-draw is enough: no flush needed.
    const rich = afterChow({});
    rich.hand.seats[1].flowers = ['f2', 's2'];
    const ctx = B.buildContext(rich, 1);
    assert.equal(B.flowerPoints(ctx), 2);
    assert.equal(B.cheapWin(ctx), true);
    assert.equal(B.chowCommitment(ctx), null);
    // Other seats' flowers are worth nothing, so they don't count.
    const other = afterChow({});
    other.hand.seats[1].flowers = ['f1', 's3'];
    assert.equal(B.chowCommitment(B.buildContext(other, 1)), 'b');
  });

  it('builds an open All Sequences hand when flowers make it 3 faan', () => {
    // A Characters chow and runs in every suit.
    const at = (flowers) => table({ seats: [null, {
      hand: ['c5', 'c6', 'd3', 'd4', 'd5', 'b6', 'b7', 'b8', 'd8', 'd8', 'wn'],
      melds: [{ type: 'chow', tiles: ['c1', 'c2', 'c3'], concealed: false, from: 0 }],
      flowers,
    }] });
    // No flowers: only a Characters flush can reach 3 faan.
    const bare = B.analyzeDiscards(at([]), 1);
    assert.equal(B.chowCommitment(bare.ctx), 'c');
    assert.ok(!/^c/.test(bare.candidates[0].tile), 'threw ' + bare.candidates[0].tile);
    // Seat flower and season: All Sequences is the third faan, honors go.
    const rich = B.analyzeDiscards(at(['f2', 's2']), 1);
    assert.equal(B.chowCommitment(rich.ctx), null);
    assert.equal(rich.ctx.leadPlan.id, 'runs');
    assert.equal(rich.candidates[0].tile, 'wn');
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

  it('chows a suit only when the hand and melds already hold 7 of it', () => {
    const kong = (tile) => ({ type: 'kong', tiles: [tile, tile, tile, tile], concealed: false, from: 2 });
    const claim = (bot, hand, melds) => {
      const game = table({ seats: [{ hand, melds }], wallLeft: 60 });
      return bot.chooseClaim(game, 0, E.claimOptions(game, 0, 'b3', 3, false)).type;
    };
    const open = [meld('pung', 'dr')];
    const five = ['b1', 'b2', 'b5', 'b6', 'b7', 'ww', 'ww', 'we', 'we', 'c9'];
    const seven = ['b1', 'b2', 'b4', 'b5', 'b6', 'b7', 'b8', 'ww', 'ww', 'we'];
    // Five Bamboo is not enough, even when the chow leaves a winning wait.
    assert.equal(claim(MahjongBot, five, open), 'pass');
    assert.equal(claim(B, five, open), 'pass');
    assert.equal(claim(MahjongBot, seven, open), 'chow');
    assert.equal(claim(B, seven, open), 'chow');
    // A kong's fourth tile does not count: 3 in hand + a kong is 6, 4 in hand + a kong is 7.
    assert.equal(claim(MahjongBot, ['b1', 'b2', 'b4', 'ww', 'ww', 'we', 'c2', 'd5'], [kong('b9')]), 'pass');
    assert.equal(claim(B, ['b1', 'b2', 'b4', 'ww', 'ww', 'we', 'c2', 'd5'], [kong('b9')]), 'pass');
    assert.equal(claim(MahjongBot, ['b1', 'b2', 'b4', 'b6', 'ww', 'ww', 'we', 'c2'], [kong('b9')]), 'chow');
    assert.equal(claim(B, ['b1', 'b2', 'b4', 'b6', 'ww', 'ww', 'we', 'c2'], [kong('b9')]), 'chow');
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

  it('commits with 7 tiles of one suit and throws the other suits before honors', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'd2', 'd5', 'b3', 'b7', 'wn', 'dr', 'b9'];
    const game = table({ seats: [{ hand }] });
    assert.equal(B.suitCommitment(B.buildContext(game, 0), E.countsOf(hand)), 'c');
    const order = B.analyzeDiscards(game, 0).candidates.map((x) => x.tile);
    ['d2', 'd5', 'b3', 'b7', 'b9'].forEach((t) => assert.ok(order.indexOf(t) < order.indexOf('wn'), order.join(' ')));
  });

  it('is the same for every strategy, with no hooks at all', () => {
    const plain = MahjongBot.createStrategy({ id: 'plain' });
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'd2', 'd5', 'b3', 'b7', 'wn', 'dr', 'b9'];
    assert.ok(['d2', 'd5', 'b3', 'b7', 'b9'].includes(plain.chooseTurnAction(table({ seats: [{ hand }] }), 0, noKongs).tile));
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

  it('counts copies left ahead of what kind of tile it is', () => {
    // A single wind with two left goes before number singles with three left.
    const hand = ['c2', 'c2', 'd5', 'd5', 'ws', 'ws', 'c7', 'we', 'b3', 'dg', 'dg'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'b8')] }, { discards: ['we'] }], wallLeft: 70 });
    assert.equal(B.analyzeDiscards(game, 0).candidates[0].tile, 'we');
  });

  it('counts copies held too: a single goes before a pair with fewer left', () => {
    const hand = ['c2', 'c2', 'd5', 'd5', 'ws', 'ws', 'c7', 'd9', 'b3', 'dg', 'dg'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'b8')] }, { discards: ['d5'] }], wallLeft: 70 });
    const order = B.analyzeDiscards(game, 0).candidates.map((x) => x.tile);
    ['c7', 'd9', 'b3'].forEach((t) => assert.ok(order.indexOf(t) < order.indexOf('d5'), order.join(' ')));
    // Among pairs, the one with the fewest left comes first.
    assert.ok(order.indexOf('d5') < order.indexOf('c2'), order.join(' '));
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

describe('tracking the table', () => {
  const quiet = (discards, extra) => table({ seats: [{ hand: ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4', 'd7', 'd8', 'b5', 'b5'] }, Object.assign({ discards }, extra)] });
  const read = (game) => B.readTable(game, 0, E.unseenCounts(game, 0));
  const seat1 = (game) => read(game).seats.find((r) => r.seat === 1);
  const at = (t) => E.tileIndex(t);

  it('reads a tile thrown as less wanted, and its suji a little', () => {
    const r = seat1(quiet(['c5']));
    assert.ok(r.want[at('c5')] < r.want[at('b5')]);
    assert.ok(r.want[at('c8')] < r.want[at('b8')]);
  });

  it('reads a tile they let go by from another player as less wanted', () => {
    const game = table({ seats: [{ hand: ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4', 'd7', 'd8', 'b5', 'b5'] }, {}, { discards: ['dr'] }] });
    const r = seat1(game);
    assert.ok(r.want[at('dr')] < r.want[at('dg')]);
  });

  it('reads what every opponent collects, not only the player before you', () => {
    const r = seat1(quiet(['c1', 'c9', 'd1', 'd9', 'c2', 'd8']));
    assert.equal(r.collecting, 'b');
    assert.ok(r.want[at('b5')] > r.want[at('c5')]);
  });

  it('notices a player changing hands', () => {
    assert.equal(seat1(quiet(['c1', 'd1', 'c2', 'd2', 'b2', 'b3', 'b7', 'b8'])).pivot.from, 'b');
    assert.equal(seat1(quiet(['c1', 'd1', 'b2', 'c2', 'd2', 'b3', 'c8', 'd8'])).pivot, null);
  });

  it('expects fewer copies in the wall of a suit someone is holding', () => {
    const t = read(quiet(['c1', 'c9', 'd1', 'd9', 'c2', 'd8']));
    assert.ok(t.inWall[at('b6')] < t.inWall[at('c6')]);
  });

  it('counts a closer hand ahead of a wider one further away', () => {
    assert.ok(B.raceOdds(0.2, 3, 18, 0.03) > B.raceOdds(0.35, 4, 18, 0.03));
    assert.ok(B.raceOdds(0.2, 1, 18, 0.03) > B.raceOdds(0.2, 1, 6, 0.03));
    assert.ok(B.raceOdds(0.2, 1, 18, 0.03) > B.raceOdds(0.2, 1, 18, 0.2));
  });

  it('values a wait less when an opponent is collecting its suit', () => {
    const hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'd2', 'd3', 'd4', 'd7', 'd8', 'b5', 'b5'];
    const value = (seat) => {
      const game = table({ seats: [{ hand }, seat] });
      return B.readyValue(E.countsOf(hand), B.buildContext(game, 0)).value;
    };
    const throwing = value({ discards: ['d1', 'd2', 'd3', 'd5', 'c5', 'd4'] });
    const keeping = value({ melds: [meld('pung', 'd1'), meld('pung', 'd5')], discards: ['c5', 'c9', 'b1', 'b9', 'c7', 'b3'] });
    assert.ok(keeping < throwing, keeping + ' vs ' + throwing);
  });

  it('counts feeding as worse the later it is, and only for a tile they want', () => {
    const at2 = (wallLeft) => table({ seats: [{ hand: ['b5', 'b6', 'c1'] }, { melds: [meld('pung', 'b1')], discards: ['c5', 'c8', 'd1'] }], wallLeft });
    const loss = (wallLeft, tile) => {
      const game = at2(wallLeft);
      return B.feedLoss(game, B.opponentThreats(game, 0), E.tileIndex(tile));
    };
    assert.ok(loss(12, 'b5') > loss(70, 'b5'));
    assert.ok(loss(12, 'b5') > loss(12, 'c5'));
  });

  it('never reads the wall order or another player\'s concealed tiles', () => {
    const seats = (a, b) => [
      { hand: ['c1', 'c2', 'c3', 'c5', 'c7', 'd2', 'd4', 'd6', 'b3', 'b4', 'b8', 'we', 'dr', 'dr'] },
      { hand: a, discards: ['b1', 'c9', 'wn'] },
      { hand: b, discards: ['d9', 'ws', 'b9'] },
      { discards: ['c8', 'd1', 'b2'] },
    ];
    const one = ['c4', 'c4', 'd5', 'd5', 'b5', 'b5', 'b6', 'b6', 'c6', 'c6', 'd7', 'd7', 'dg'];
    const two = ['we', 'we', 'dw', 'dw', 'b7', 'b7', 'd8', 'd8', 'c2', 'c2', 'd3', 'd3', 'ww'];
    const a = table({ seats: seats(one, two), wallLeft: 50 });
    const b = table({ seats: seats(two, one), wallLeft: 50 });
    b.hand.wall.reverse();
    const view = (g) => B.analyzeDiscards(g, 0).candidates.map((x) => [x.tile, x.util, x.loss, x.score]);
    assert.deepEqual(view(a), view(b));
  });
});
