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
const text = (hint) => [hint.action].concat(hint.tips).join(' ').replace(/[\u0001\u0002]/g, '');

describe('highlightPatterns', () => {
  it('marks hand pattern names without their faan, and leaves "your target is" alone', () => {
    const s = C.highlightPatterns('Your target is Concealed Straights. A flush, all triplets or Thirteen Orphans.');
    assert.equal(s, 'Your target is \u0001Concealed Straights\u0002. A flush, \u0001all triplets\u0002 or \u0001Thirteen Orphans\u0002.');
    assert.equal(C.highlightPatterns('Half Flush in Bamboo'), '\u0001Half Flush\u0002 in Bamboo');
    // A faan written after a hand name is dropped; it's on the Rules sheet.
    assert.equal(C.highlightPatterns('Half Flush (3 faan) in Bamboo'), '\u0001Half Flush\u0002 in Bamboo');
    assert.equal(C.highlightPatterns('a chicken hand (0 faan)'), 'a \u0001chicken hand\u0002');
  });
});

describe('coach: discards', () => {
  const mixed = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'b3', 'b4', 'b6', 'b7', 'd8', 'd8', 'c9', 'dr'];

  it('keeps a pair when another discard leaves the hand just as ready', () => {
    const hand = ['c3', 'c3', 'c4', 'c5', 'c6', 'c7', 'd4', 'd5', 'd6', 'b4', 'b5', 'b6', 'ww', 'ww'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['c4', 'c7'].includes(hint.tile), 'discarded ' + hint.tile);
  });

  it('on Concealed Straights, drops a dragon even when another tile also leaves the hand ready', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'dr'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'dr');
  });

  it('drops a punged tile first when the hand does not need it', () => {
    const hand = ['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'b2', 'b9'];
    const game = table({ seats: [{ hand }, { melds: [meld('pung', 'b2')] }] });
    const hint = C.turnHint(game, 0, { kongs: [] });
    assert.equal(hint.tile, 'b2');
    assert.match(text(hint), /Pung/);
  });

  it('does not tell an all-triplets hand to break a pung or a pair next', () => {
    const hand = ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'wn', 'wn', 'we', 'we', 'ws', 'dr'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'ws');
    assert.match(text(hint), /Triplets/);
    assert.match(text(hint), /Red Dragon goes next/);
    assert.doesNotMatch(text(hint), /(Two Character|Five Circle|Eight Bamboo) goes next/);
  });

  it('aims for seven pairs once the hand has more than four concealed pairs and no pung', () => {
    const hand = ['c2', 'c2', 'c5', 'c5', 'd3', 'd3', 'd8', 'd8', 'b4', 'b4', 'b9', 'we', 'ws', 'wn'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['b9', 'we', 'ws', 'wn'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /Seven Pairs/);
  });

  it('aims for thirteen orphans once nine different terminals and honors are in hand', () => {
    const hand = ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'dr', 'c3', 'c4', 'c5', 'd2', 'd3'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['c3', 'c4', 'c5', 'd2', 'd3'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /Thirteen Orphans/);
  });

  it('aims for nine gates once eleven necessary tiles are in one suit', () => {
    const hand = ['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9', 'c9', 'd2', 'd3', 'b2'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['d2', 'd3', 'b2'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /Nine Gates in Characters/);
  });

  it('does not aim for seven pairs when the hand already holds a pung', () => {
    const hand = ['c2', 'c2', 'c5', 'c5', 'd3', 'd3', 'd8', 'd8', 'b4', 'b4', 'b4', 'we', 'ws', 'wn'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.doesNotMatch(text(hint), /Seven Pairs/);
  });

  it('on Concealed Straights, throws a live dragon before a lone terminal', () => {
    const hint = C.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'dr');
    assert.equal(hint.action, 'Discard Red Dragon.');
    assert.match(text(hint), /Honors break All Sequences\./);
  });

  it('lets the dragon go once two are already out', () => {
    const game = table({ seats: [{ hand: mixed }, { discards: ['dr'] }, { discards: ['dr'] }] });
    const hint = C.turnHint(game, 0, { kongs: [] });
    assert.equal(hint.tile, 'dr');
    assert.match(text(hint), /Two are out, so it can't make a set/);
  });

  it('plays concealed runs when the hand is spread across suits', () => {
    // Three suits, stray non-value winds (seat and round are East), no flowers.
    const hand = ['c2', 'c3', 'c4', 'c6', 'c7', 'd3', 'd4', 'd5', 'b5', 'b6', 'b8', 'b8', 'ww', 'wn'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['ww', 'wn'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /All Sequences/);
    assert.match(text(hint), /Don't claim/);
  });

  it('commits to a flush and says why off-suit tiles go', () => {
    const hand = ['b2', 'b3', 'b4', 'b5', 'b6', 'b6', 'b7', 'b8', 'b8', 'dr', 'dr', 'c5', 'd7', 'ws'];
    const hint = C.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] });
    assert.ok(['c5', 'd7'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /You're going for Bamboo, so other suits go first/);
    assert.match(text(hint), /(Half|Full) Flush in Bamboo/);
  });

  it('names the waits when the discard leaves the hand ready', () => {
    const hand = ['c2', 'c3', 'c4', 'd2', 'd3', 'd4', 'b5', 'b6', 'b7', 'dr', 'dr', 'c5', 'c6', 'd9'];
    const hint = C.turnHint(table({ seats: [{ hand, flowers: ['f1'] }] }), 0, { kongs: [] });
    assert.equal(hint.tile, 'd9');
    assert.match(hint.tips[0], /^Ready, waiting on .*Four Character.*Seven Character/);
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
    // Folding against an Extreme Bamboo flush: a tile East has already thrown
    // is the safest. (The punged Nine Bamboo could still finish a 7-8 chow.)
    assert.ok(['d1', 'd9', 'wn'].includes(hint.tile), 'discarded ' + hint.tile);
    assert.match(text(hint), /\w+ has three melds down, all Bamboo\./);
    assert.doesNotMatch(text(hint), /\b(High|Extreme|Medium)\b/);
  });

  it('says "Play safe" only on the last wall, when a win is unlikely', () => {
    const hand = ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'c6', 'c7', 'b5', 'b9', 'd9', 'd1', 'we', 'wn'];
    const at = (wallLeft) => table({
      seats: [
        { hand },
        { hand: ['b4', 'b4', 'b6', 'b7'], melds: [meld('pung', 'b1'), meld('chow', 'b2'), meld('pung', 'b9')], discards: ['d9', 'c5', 'd1', 'wn'] },
      ],
      wallLeft,
    });
    // Folding early against an Extreme player: no "Play safe", no "close to winning".
    const early = text(C.turnHint(at(80), 0, { kongs: [] }));
    assert.doesNotMatch(early, /Play safe|close to winning/);
    // Two from ready with the last wall under way: now it says so.
    assert.match(text(C.turnHint(at(30), 0, { kongs: [] })), /Play safe\. The wall is nearly gone and a win is unlikely\./);
  });
});

describe('coach: all triplets', () => {
  it('says why the tile with the fewest left goes', () => {
    const hand = ['c2', 'c2', 'd5', 'd5', 'ws', 'ws', 'c7', 'd9', 'b3', 'dg', 'dg'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'b8')] }, { discards: ['d9', 'd9'] }] });
    const hint = C.turnHint(game, 0, { kongs: [] });
    assert.equal(hint.tile, 'd9');
    assert.match(text(hint), /Only one is left, fewer than any other single you hold, so it's the least likely to become a set/);
  });

  it('never calls a tile the fewest left when another tile has as few', () => {
    // Every single still has three copies out: no "fewest" claim.
    const hand = ['c2', 'c2', 'd5', 'd5', 'ws', 'ws', 'c7', 'd9', 'b3', 'dg', 'dg'];
    const hint = C.turnHint(table({ seats: [{ hand, melds: [meld('pung', 'b8')] }] }), 0, { kongs: [] });
    assert.doesNotMatch(text(hint), /fewest|fewer than any other|least likely/);
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
    assert.match(text(hint), /^Pung! A Red Dragon set is 1 faan/);
  });

  it('chows into a flush it is building', () => {
    // Already open (Red Dragon punged), so the chow gives up nothing.
    const hand = ['b1', 'b2', 'b4', 'b5', 'b6', 'b8', 'b8', 'dg', 'ws', 'ws'];
    const game = table({ seats: [{ hand, melds: [meld('pung', 'dr')] }] });
    const opts = E.claimOptions(game, 0, 'b3', 3, false);
    const hint = C.claimHint(game, 0, opts);
    assert.equal(hint.decision.type, 'chow');
    assert.match(text(hint), /^Chow 1-2-3 Bamboo\. It builds your (Half|Full) Flush in Bamboo/);
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
    const fb = C.discardFeedback(hint, 'dr');
    assert.equal(fb.action, 'Great discard.');
    assert.match(fb.tips[0], /^Red Dragon was the top choice\. /);
  });

  it('says a discard slowed the hand and compares it with the coach\'s pick', () => {
    const hint = C.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] });
    const fb = C.discardFeedback(hint, 'd5');
    assert.equal(fb.action, 'That discard slows your hand.');
    assert.match(fb.tips.join(' '), /The coach picks Red Dragon\./);
    assert.match(fb.tips.join(' '), /Five Circle leaves you 2 tiles from ready, 1 more than Red Dragon/);
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
    assert.match(text(hint), /You chowed Bamboo, so other suits are dead weight/);
  });

  it('only goes for a flush in the chow\'s suit', () => {
    const hint = C.turnHint(chowed(), 0, { kongs: [] });
    assert.match(text(hint), /Aim for (Half|Full) Flush in Bamboo/);
  });

  it('commits to the chow suit even when the hand holds 2 faan of flowers', () => {
    // East seat: f1 and s1 are its own flower and season.
    assert.equal(C.look(chowed(['f1', 's1']), 0).committedSuit, 'b');
    assert.equal(C.look(chowed(), 0).committedSuit, 'b');
  });

  it('advises passing on a chow it would rather wait on', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'd5', 'd7', 'b2', 'b4', 'b8', 'b9', 'we', 'ws', 'dg', 'dw', 'c9'] }] });
    const hint = C.claimHint(game, 0, E.claimOptions(game, 0, 'c4', 3, false));
    assert.equal(hint.decision.type, 'pass');
    assert.match(text(hint), /Stay concealed, and save chows for a ready hand or a flush/);
  });
});

describe('coach: risk words need a reason', () => {
  const C2 = require('./mahjong-coach.js');

  it('never calls a tile risky at a quiet table', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = table({ seed });
      game.hand.seats[0].hand.push(game.hand.wall.shift());
      const hint = C2.turnHint(game, 0, { kongs: [] });
      assert.doesNotMatch(text(hint), /risky|some risk|Hold /, 'seed ' + seed);
    }
  });

  it('names what makes a tile risky', () => {
    const extreme = { hand: ['b4', 'b4', 'b6', 'b7'], melds: [meld('pung', 'b1'), meld('chow', 'b2'), meld('pung', 'b9')], discards: ['d9', 'c5', 'd1', 'wn'] };
    const game = table({ seats: [{ hand: ['c2', 'c3', 'c4', 'd4', 'd5', 'd6', 'c6', 'c7', 'b5', 'b8', 'd9', 'd1', 'we', 'wn'] }, extreme], wallLeft: 60 });
    const list = C2.rankDiscards(C2.look(game, 0), game.hand.seats[0].hand);
    const b5 = list.find((x) => x.tile === 'b5');
    assert.match(b5.evidence, /melds are all Bamboo/);
    // A tile they already threw is never risky.
    assert.equal(list.find((x) => x.tile === 'd9').evidence, null);
    const said = text(C2.turnHint(game, 0, { kongs: [] }));
    if (/risky|some risk/.test(said)) assert.match(said, /: \w+('s melds are all| has 3 melds)/);
  });
});
