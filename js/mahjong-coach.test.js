'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const C = require('./mahjong-coach.js');

// Seat 0 is East (dealer) in the East round. Other seats' hands are filler.
function table(opts) {
  const game = E.createGame({ seed: opts.seed || 11, humanSeat: false, dealer: 0 });
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

const meld = (type, tile) => {
  const i = E.tileIndex(tile);
  const tiles = type === 'chow' ? [tile, E.tileId(i + 1), E.tileId(i + 2)] : Array(3).fill(tile);
  return { type, tiles, concealed: false, from: 2 };
};
const text = (hint) => [hint.action].concat(hint.tips).join(' ');

describe('coach: discards', () => {
  const mixed = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'b3', 'b4', 'b6', 'b7', 'd8', 'd8', 'c9', 'dr'];

  it('keeps a live dragon and throws a lone terminal instead', () => {
    const hint = C.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'c9');
    assert.equal(hint.action, 'Discard Nine Character.');
  });

  it('lets the dragon go once two are already out', () => {
    const game = table({ seats: [{ hand: mixed }, { discards: ['dr'] }, { discards: ['dr'] }] });
    const hint = C.turnHint(game, 0, { kongs: [] });
    assert.equal(hint.tile, 'dr');
    assert.match(text(hint), /Two Red Dragons are already out/);
  });

  it('plays concealed runs when the hand is spread across suits', () => {
    // Three suits, stray non-value winds (seat and round are East), no flowers.
    const hand = ['c2', 'c3', 'c4', 'c6', 'c7', 'd3', 'd4', 'd5', 'b5', 'b6', 'b8', 'b8', 'ww', 'wn'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['ww', 'wn'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /All Sequences/);
    assert.match(text(hint), /use self-draw tiles and don't claim discards/);
  });

  it('commits to a flush and says why off-suit tiles go', () => {
    const hand = ['b1', 'b2', 'b3', 'b4', 'b5', 'b7', 'b8', 'b9', 'b9', 'dr', 'dr', 'c5', 'd7', 'ws'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['c5', 'd7'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /collecting Bamboo/);
    assert.match(text(hint), /Half Flush in Bamboo/);
  });

  it('names the waits when the discard leaves the hand ready', () => {
    const hand = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'c5', 'c6', 'd9'];
    const hint = C.turnHint(table({ seats: [{ hand, flowers: ['f1'] }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'd9');
    assert.match(hint.tips[0], /leaves you ready/);
    assert.match(hint.tips[1], /^You are ready and waiting on .*Four Character.*Seven Character/);
  });

  it('plays a tile the threatening player already threw', () => {
    // East (seat 1) shows three Bamboo melds and has thrown the Nine Circle.
    const hand = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'c6', 'c7', 'b5', 'b9', 'd9', 'd1', 'we', 'wn'];
    const game = table({
      seats: [
        { hand },
        { hand: ['b4', 'b4', 'b6', 'b7'], melds: [meld('pung', 'b1'), meld('chow', 'b2'), meld('pung', 'b9')], discards: ['d9', 'c5', 'd1', 'wn'] },
      ],
      wallLeft: 30,
    });
    const hint = C.turnHint(game, 0, { kongs: [] });
    assert.notEqual(hint.tile, 'b5');
    assert.notEqual(hint.tile, 'b9');
    assert.match(text(hint), /safe play/);
    assert.match(text(hint), /\w+ is an Extreme threat \(3 melds, Bamboo\)/);
    assert.match(text(hint), /threw it after their last meld/);
  });
});

describe('coach: claims', () => {
  it('passes on a chow that would end a concealed runs hand', () => {
    const hand = ['c2', 'c3', 'c6', 'c7', 'c8', 'd3', 'd4', 'd5', 'b5', 'b6', 'b2', 'b8', 'b8'];
    const game = table({ seats: [{ hand }] });
    const opts = E.claimOptions(game, 0, 'c4', 3, false);
    assert.ok(opts.chows.length);
    const hint = C.claimHint(game, 0, opts);
    assert.equal(hint.decision.type, 'pass');
    assert.match(text(hint), /concealed/);
  });

  it('always pungs a dragon pair', () => {
    const hand = ['dr', 'dr', 'c2', 'c3', 'c4', 'd6', 'd7', 'b2', 'b3', 'b7', 'b8', 'ws', 'wn'];
    const game = table({ seats: [{ hand }] });
    const opts = E.claimOptions(game, 0, 'dr', 2, false);
    const hint = C.claimHint(game, 0, opts);
    assert.equal(hint.decision.type, 'pung');
    assert.match(text(hint), /^Pung! A Red Dragon set is worth 1 faan/);
  });

  it('chows into a flush it is building', () => {
    const hand = ['b1', 'b2', 'b4', 'b5', 'b6', 'b8', 'b8', 'dr', 'dr', 'dg', 'ws', 'ws', 'c9'];
    const game = table({ seats: [{ hand }] });
    const opts = E.claimOptions(game, 0, 'b3', 3, false);
    const hint = C.claimHint(game, 0, opts);
    assert.equal(hint.decision.type, 'chow');
    assert.match(text(hint), /^Chow 1-2-3 Bamboo\. It fits your Bamboo flush/);
  });

  it('tells you to win when you can', () => {
    const hand = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'c5', 'c6'];
    const game = table({ seats: [{ hand }] });
    const opts = E.claimOptions(game, 0, 'c4', 2, false);
    assert.ok(opts.win);
    assert.match(text(C.claimHint(game, 0, opts)), /^Win! Four Character finishes your hand/);
  });
});

describe('coach: feedback on your last move', () => {
  const mixed = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'b3', 'b4', 'b6', 'b7', 'd8', 'd8', 'c9', 'dr'];

  it('praises the coach\'s top discard and says why', () => {
    const hint = C.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] });
    const fb = C.discardFeedback(hint, 'c9');
    assert.equal(fb.action, 'Great discard.');
    assert.match(fb.tips[0], /^Nine Character was the coach's top choice\. /);
  });

  it('says a discard slowed the hand and compares it with the coach\'s pick', () => {
    const hint = C.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] });
    const fb = C.discardFeedback(hint, 'd5');
    assert.equal(fb.action, 'That discard slows your hand.');
    assert.match(fb.tips.join(' '), /The coach would have discarded Nine Character\./);
    assert.match(fb.tips.join(' '), /Throwing Five Circle leaves you 2 tiles from ready, 1 tile further/);
  });

  it('returns nothing without a usable hint', () => {
    assert.equal(C.discardFeedback(null, 'c9'), null);
    assert.equal(C.discardFeedback({ kind: 'win', tips: [] }, 'c9'), null);
  });

  it('judges claims against what the coach would have done', () => {
    const game = table({ seats: [{ hand: ['dr', 'dr', 'c2', 'c3', 'c4', 'd6', 'd7', 'b2', 'b3', 'b7', 'b8', 'ws', 'wn'] }] });
    const hint = C.claimHint(game, 0, E.claimOptions(game, 0, 'dr', 2, false));
    assert.equal(C.claimFeedback(hint, { type: 'pung' }).action, 'Good call.');
    const missed = C.claimFeedback(hint, { type: 'pass' });
    assert.equal(missed.action, 'The coach would have called Pung.');
    assert.match(missed.tips[0], /^You passed\. /);
  });

  it('notes a claim the coach would have passed on', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'c6', 'c7', 'c8', 'd3', 'd4', 'd5', 'b5', 'b6', 'b2', 'b8', 'b8'] }] });
    const opts = E.claimOptions(game, 0, 'c4', 3, false);
    const hint = C.claimHint(game, 0, opts);
    assert.equal(C.claimFeedback(hint, { type: 'pass' }).action, 'Good pass.');
    const fb = C.claimFeedback(hint, { type: 'chow', tiles: opts.chows[0] });
    assert.equal(fb.action, 'The coach would have passed.');
    assert.match(fb.tips[0], /^You took the Chow\. /);
  });
});

describe('coach: after a chow', () => {
  const chowed = (flowers) => table({
    seats: [{
      hand: ['b4', 'b5', 'b6', 'b8', 'b9', 'c5', 'd7', 'c2', 'd3', 'ww', 'we'],
      melds: [{ type: 'chow', tiles: ['b1', 'b2', 'b3'], concealed: false, from: 3 }],
      flowers: flowers || [],
    }],
  });

  it('throws a tile of another suit first and says why', () => {
    const hint = C.turnHint(chowed(), 0, { kongs: [] });
    assert.ok(['c5', 'd7', 'c2', 'd3'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /You've already chowed in Bamboo, so tiles from other suits can't help you reach 3 faan/);
  });

  it('only goes for a flush in the chow\'s suit', () => {
    const hint = C.turnHint(chowed(), 0, { kongs: [] });
    assert.match(text(hint), /Your target is (Half|Full) Flush in Bamboo/);
  });

  it('keeps other suits in play once the hand holds 2 faan of flowers', () => {
    // East seat: f1 and s1 are its own flower and season.
    const v = C.look(chowed(['f1', 's1']), 0);
    assert.equal(v.committedSuit, null);
    assert.equal(C.look(chowed(), 0).committedSuit, 'b');
  });

  it('advises passing on a chow it would rather wait on', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'd5', 'd7', 'b2', 'b4', 'b8', 'b9', 'we', 'ws', 'dg', 'dw', 'c9'] }] });
    const hint = C.claimHint(game, 0, E.claimOptions(game, 0, 'c4', 3, false));
    assert.equal(hint.decision.type, 'pass');
    assert.match(text(hint), /A chow gives up your concealed hand and flexibility/);
  });
});
