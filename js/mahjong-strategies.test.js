'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-lucky-cat.js');
const L = require('./mahjong-jorge-yau.js');
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
  it('lists every strategy, with lucky-cat as the coach default', () => {
    assert.deepEqual(S.ids(), ['jorge-yau', 'lucky-cat', 'only-orphans', 'dishonor']);
    assert.equal(S.DEFAULT_COACH, 'lucky-cat');
    assert.equal(S.get('lucky-cat').bot, B);
    assert.equal(S.get('jorge-yau').bot, L);
    assert.equal(S.get('lucky-cat').bot.id, 'lucky-cat');
    assert.equal(S.get('jorge-yau').bot.id, 'jorge-yau');
    S.list().forEach((s) => {
      assert.ok(s.name && s.summary && s.details.length, s.id + ' has words for the sheet');
    });
  });

  it('falls back to the default for an unknown id', () => {
    assert.equal(S.has('nope'), false);
    assert.equal(S.get('nope').id, 'lucky-cat');
  });

  it('picks a random strategy from the list', () => {
    assert.equal(S.randomId(() => 0), 'jorge-yau');
    assert.equal(S.randomId(() => 0.99), 'dishonor');
  });

  it('makes agents that play a full hand', async () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0 });
    const agents = ['jorge-yau', 'lucky-cat', 'jorge-yau', 'lucky-cat'].map(S.createAgent);
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

describe('jorge-yau opening targets', () => {
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

  it('reads Concealed Straights from evenly mixed suits', () => {
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

describe('jorge-yau decisions', () => {
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

describe('a pair stays until a chow of another suit closes All Triplets', () => {
  // Pung of 1 Character, then a lone 3 Bamboo beside a pair of 8 Bamboo.
  // Seed 2510433994 reaches this shape. Both coaches were throwing the pair.
  const hand = ['c2', 'c4', 'c4', 'c7', 'c7', 'd5', 'd7', 'b3', 'b8', 'b8', 'dr'];
  function seat(melds) {
    return table({ seats: [{ hand: hand, melds: melds }] });
  }
  function order(bot, game) {
    return bot.analyzeDiscards(game, 0).candidates.map((c) => c.tile);
  }

  it('throws the single before the pair, for both coaches', () => {
    const game = seat([pung('c1')]);
    [B, L].forEach((bot) => {
      const tiles = order(bot, game);
      assert.notEqual(tiles[0], 'b8', bot.id);
      assert.ok(tiles.indexOf('b3') < tiles.indexOf('b8'), bot.id + ' ' + tiles.join(' '));
    });
  });

  it('lets the pair go with the other suit once a different suit has been chowed', () => {
    const chow = { type: 'chow', tiles: ['c2', 'c3', 'c4'], concealed: false, from: 3 };
    const game = seat([chow]);
    [B, L].forEach((bot) => {
      const b8 = bot.analyzeDiscards(game, 0).candidates.find((c) => c.tile === 'b8');
      assert.equal(b8.priority, 0, bot.id);
    });
  });
});

describe('Concealed Straights keeps one honor pair', () => {
  const noKongs = { kongs: [] };
  it('throws every other honor first and keeps the pair', () => {
    const hand = ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b3', 'b4', 'b6', 'b7', 'wn', 'wn', 'ws', 'ww'];
    const game = table({ seats: [{ hand }], wallLeft: 80 });
    const a = L.analyzeDiscards(game, 0);
    assert.equal(a.ctx.leadPlan.id, 'straights');
    const order = a.candidates.map((x) => x.tile);
    assert.deepEqual(order.slice(0, 2).sort(), ['ws', 'ww']);
    assert.ok(order.indexOf('wn') > 2, order.join(' '));
    const hint = Coach.forStrategy(L).turnHint(game, 0, noKongs);
    assert.match(hint.tips.join(' '), /Keep your North Wind pair as the pair, and throw your other honors first/);
  });

  it('keeps a dragon or scoring-wind pair ahead of another honor pair', () => {
    const counts = E.countsOf(['wn', 'wn', 'dr', 'dr', 'c2']);
    const ctx = B.buildContext(table({ seats: [{ hand: ['c2'] }] }), 0);
    assert.equal(B.keptHonorPair(counts, ctx), E.tileIndex('dr'));
  });
});

describe('the player before you decides a close flush suit', () => {
  // Seven Bamboo and six Circles: about even.
  const hand = ['b2', 'b3', 'b4', 'b6', 'b7', 'b8', 'b9', 'd2', 'd3', 'd5', 'd6', 'd8', 'd9', 'c5'];
  // Seat 3 (on your left) has thrown no Bamboo and mostly Circles.
  const keepsBamboo = ['d1', 'd9', 'd5', 'c1', 'c9', 'wn', 'd5'];
  // A flower that isn't this seat's: Concealed Straights would fall short of
  // 3 faan, so the choice is between the two flushes.
  const at = (discards) => table({ seats: [{ hand, flowers: ['f4'] }, {}, {}, { discards }], wallLeft: 70 });

  it('reads the suit they keep and the suit they throw', () => {
    const read = B.leftRead(at(keepsBamboo), 0);
    assert.deepEqual(read, { seat: 3, keeps: 'b', feeds: 'd' });
    assert.deepEqual(B.leftRead(at([]), 0), { seat: 3, keeps: null, feeds: null });
  });

  it('lucky-cat leaves the suit they keep for a faster hand', () => {
    assert.equal(B.analyzeDiscards(at([]), 0).ctx.leadPlan.id, 'full-b');
    const a = B.analyzeDiscards(at(keepsBamboo), 0);
    assert.notEqual(a.ctx.leadPlan.id, 'full-b');
    const hint = Coach.turnHint(at(keepsBamboo), 0, { kongs: [] });
    assert.match(hint.tips.join(' '), /is collecting Bamboo, so stay out of it/);
    assert.equal(hint.tips.join(' ').split('is collecting Bamboo').length, 2);
  });

  it('the lucky-cat coach says when an opponent changes hands', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'c4', 'c6', 'c7', 'd2', 'd3', 'd5', 'd6', 'wn', 'we', 'ws', 'b5', 'b9'] }, { discards: ['c1', 'd1', 'c2', 'd2', 'b2', 'b3', 'b7', 'b8'] }], wallLeft: 60 });
    const lucky = Coach.forStrategy(B).turnHint(game, 0, { kongs: [] });
    assert.match(lucky.tips.join(' '), /has switched out of Bamboo\./);
    assert.doesNotMatch(Coach.forStrategy(L).turnHint(game, 0, { kongs: [] }).tips.join(' '), /has switched out/);
  });

  it('jorge-yau gives up a Bamboo flush target', () => {
    assert.equal(L.targetFor(at([]), 0).suit, 'b');
    assert.notEqual(L.targetFor(at(keepsBamboo), 0).suit, 'b');
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
    // The default coach is still lucky-cat's.
    assert.equal(Coach.turnHint(game, 0, { kongs: [] }).tile, claude.tile);
  });
});

describe('competition', () => {
  it('adds up every seat by strategy, rotated through the seats', async () => {
    const report = await C.runMatch({ lineup: ['jorge-yau', 'lucky-cat', 'jorge-yau', 'lucky-cat'], deals: 2, seed: 5 });
    assert.equal(report.deals, 2);
    assert.equal(report.hands, 8);
    const lucky = report.strategies['jorge-yau'];
    const claude = report.strategies['lucky-cat'];
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
    const opts = { lineup: ['jorge-yau', 'lucky-cat', 'lucky-cat', 'lucky-cat'], deals: 1, seed: 9 };
    const a = await C.runMatch(opts);
    const b = await C.runMatch(opts);
    assert.deepEqual(a.strategies, b.strategies);
  });

  it('merges reports from split runs', async () => {
    const lineup = ['jorge-yau', 'lucky-cat', 'jorge-yau', 'lucky-cat'];
    const a = await C.runMatch({ lineup, deals: 1, seed: 1 });
    const b = await C.runMatch({ lineup, deals: 1, seed: 2 });
    const both = await C.runMatch({ lineup, deals: 2, seed: 1 });
    const merged = C.mergeReports(a, b);
    assert.deepEqual(merged.strategies, both.strategies);
    assert.equal(merged.hands, both.hands);
  });

  it('rejects an unknown strategy', async () => {
    await assert.rejects(C.runMatch({ lineup: ['jorge-yau', 'x', 'jorge-yau', 'jorge-yau'], deals: 1 }), /unknown strategy/);
  });
});

// Upgrades: bigger hands the same tiles can make (MahjongBot.upgradePlans).
describe('both strategies: special-hand upgrades', () => {
  // Pungs of 1 Character and North Wind, pairs of 9 Bamboo, 5 Circle and
  // Green Dragon: All Triplets, with Mixed Orphans in reach.
  const triplets = ['c1', 'c1', 'c1', 'wn', 'wn', 'wn', 'b9', 'b9', 'd5', 'd5', 'dg', 'dg', 'c9', 'd4'];
  const order = (bot, game) => bot.analyzeDiscards(game, 1).candidates.map((x) => x.tile);

  for (const [name, bot] of [['lucky-cat', B], ['jorge-yau', L]]) {
    it(name + ' keeps a Mixed Orphans pair over a plain pair with more copies left', () => {
      // One 9 Bamboo is out, so it has fewer left than the 5 Circle.
      const game = table({ seats: [{ discards: ['b9'] }, { hand: triplets }] });
      const found = bot.analyzeDiscards(game, 1);
      assert.equal(found.ctx.upgrade.id, 'mixed-orphans');
      const tiles = found.candidates.map((x) => x.tile);
      assert.equal(tiles[0], 'd4');
      assert.ok(tiles.indexOf('d5') < tiles.indexOf('b9'), tiles.join(' '));
      assert.ok(tiles.indexOf('d4') < tiles.indexOf('c9'), tiles.join(' '));
    });

    it(name + ' throws an orphan with no copies left first', () => {
      const game = table({ seats: [{ discards: ['c9', 'c9', 'c9'] }, { hand: triplets }] });
      assert.equal(order(bot, game)[0], 'c9');
    });

    it(name + ' builds Small Three Dragons from two dragon pairs and a single', () => {
      const hand = ['dr', 'dr', 'dg', 'dg', 'dw', 'c2', 'c3', 'c4', 'd6', 'd7', 'b1', 'b5', 'b9', 'we'];
      const found = bot.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
      assert.equal(found.ctx.upgrade.id, 'small-dragons');
      assert.ok(!['dr', 'dg', 'dw'].includes(found.candidates[0].tile));
    });
  }

  it('lucky-cat plays Seven Pairs with Mixed Orphans when the pairs are 1s, 9s and honors', () => {
    const hand = ['c1', 'c1', 'b9', 'b9', 'wn', 'wn', 'd9', 'd9', 'dr', 'dr', 'c5', 'b4', 'd3', 'ww'];
    const found = B.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
    assert.equal(found.ctx.leadPlan.id, 'pairs-orphans');
    assert.ok(['c5', 'b4', 'd3'].includes(found.candidates[0].tile));
  });

  it('the coach names the upgrade and says to aim for it', () => {
    const game = table({ seats: [{ hand: triplets }] });
    const hint = Coach.turnHint(game, 0, { kongs: [] });
    const said = [hint.action].concat(hint.tips).join(' ').replace(/[\u0001\u0002]/g, '');
    assert.match(said, /Discard Four Circle\. Mixed Orphans uses only 1s, 9s and honors\./);
    assert.match(said, /Mixed Orphans is in reach, so aim for it too: keep your 1s, 9s and honors\./);
  });

  it('the coach says to throw an upgrade tile with none left', () => {
    const game = table({ seats: [{ hand: ['c1', 'c1', 'c1', 'wn', 'wn', 'wn', 'b9', 'b9', 'd5', 'd5', 'dg', 'dg', 'c9', 'b4'] }, { discards: ['c9', 'c9', 'c9'] }] });
    const hint = Coach.turnHint(game, 0, { kongs: [] });
    assert.match([hint.action].concat(hint.tips).join(' '), /Discard Nine Character\. None are left/);
  });
});

describe('a big hand in reach keeps its tiles', () => {
  // From hand seed 919942249-NE: eight terminals, All Terminals five steps away.
  const SEED_TURNS = [
    ['c1', 'c2', 'c3', 'c3', 'c5', 'd1', 'd1', 'd5', 'd9', 'b1', 'b8', 'b9', 'b9', 'b9'],
    ['c1', 'c2', 'c3', 'c3', 'c5', 'c8', 'd1', 'd1', 'd5', 'd9', 'b1', 'b9', 'b9', 'b9'],
  ];
  const terminal = (t) => /^[cdb][19]$/.test(t);
  const plainText = (hint) => [hint.action].concat(hint.tips).join(' ').replace(/[\u0001\u0002]/g, '');

  for (const [name, bot] of [['lucky-cat', B], ['jorge-yau', L]]) {
    it(name + ' throws every other tile before a terminal', () => {
      for (const hand of SEED_TURNS) {
        const found = bot.analyzeDiscards(table({ seats: [null, { hand }] }), 1);
        const order = found.candidates.map((x) => x.tile);
        const firstKept = order.findIndex(terminal);
        assert.equal(firstKept, order.filter((t) => !terminal(t)).length, order.join(' '));
      }
    });
  }

  it('the coach aims for All Terminals and recommends a non-terminal', () => {
    for (const hand of SEED_TURNS) {
      const said = plainText(Coach.turnHint(table({ seats: [{ hand }] }), 0, { kongs: [] }));
      assert.match(said, /Aim for All Terminals/);
      assert.ok(!/Discard (One|Nine) /.test(said), said);
    }
  });

  it('a terminal with no copies left to finish goes, and a late hand stops chasing it', () => {
    const hand = SEED_TURNS[0];
    const dead = table({ seats: [{ discards: ['d9', 'd9', 'd9'] }, { hand }] });
    assert.equal(B.analyzeDiscards(dead, 1).candidates[0].tile, 'd9');
    const late = B.analyzeDiscards(table({ wallLeft: 12, seats: [null, { hand }] }), 1);
    assert.ok(!late.ctx.upgrade);
    assert.notEqual((late.ctx.leadPlan || {}).id, 'all-terminals');
  });

  it('stays with a ready hand instead of breaking it', () => {
    const hand = ['c1', 'c1', 'c1', 'd1', 'd1', 'd2', 'd3', 'd4', 'b9', 'b9', 'b9', 'c9', 'c9', 'd8'];
    const top = B.analyzeDiscards(table({ seats: [null, { hand }] }), 1).candidates[0];
    assert.equal(top.shanten, 0);
  });

  it('claims only what the target uses', () => {
    const hand = SEED_TURNS[0].filter((t) => t !== 'b8');
    const game = table({ seats: [null, { hand }] });
    assert.deepEqual(B.chooseClaim(game, 1, { tile: 'd1', pung: true, kong: false, chows: [] }), { type: 'pung' });
    assert.deepEqual(B.chooseClaim(game, 1, { tile: 'c4', pung: false, kong: false, chows: [['c3', 'c5']] }), { type: 'pass' });
  });
});

describe('saving and loading a game', () => {
  // Seat 0 plays as the human (its moves are recorded); the others are bots.
  const agents = () => [B.createBotAgent(), L.createBotAgent(), B.createBotAgent(), L.createBotAgent()];
  const summary = (res) => JSON.stringify([res.type, res.winner, res.payer, res.deltas, res.concealed]);
  const newGame = () => {
    const game = E.createGame({ seed: 4242, mode: 'payout' });
    assert.equal(game.players[0].isHuman, true);
    return game;
  };
  // Plays a hand, keeping the save record after every discard.
  async function playSaving(game) {
    const records = [];
    const ui = { emit: (name) => { if (name === 'discard') records.push(JSON.stringify(E.gameRecord(game))); } };
    const res = await E.runHand(game, agents(), ui);
    return { res, records };
  }

  it('deals a hand again from its seed and replays your moves to the same result', async () => {
    const game = newGame();
    const first = await playSaving(game);
    const mid = first.records.filter((r) => JSON.parse(r).hand.moves.length > 0);
    assert.ok(mid.length > 4);
    for (const at of [mid[0], mid[Math.floor(mid.length / 2)], mid[mid.length - 1]]) {
      const record = JSON.parse(at);
      const restored = E.restoreGame(record);
      let ended = 0;
      const res = await E.runHand(restored, agents(), {}, { seed: record.hand.seed, replay: record.hand.moves, onReplayEnd: () => ended++ });
      assert.equal(summary(res), summary(first.res));
      assert.equal(ended, 1);
      assert.deepEqual(restored.players.map((p) => p.points), game.players.map((p) => p.points));
      assert.equal(restored.handNumber, game.handNumber);
    }
  });

  it('keeps the same walls as before hands had their own seeds', () => {
    const a = E.createGame({ seed: 99 });
    const b = E.createGame({ seed: 99 });
    E.startHand(a);
    const wall = E.buildWall(b.rng);
    assert.deepEqual(a.hand.wall.concat([]).length, 144 - 53);
    assert.equal(wall.slice(53).join(), a.hand.wall.join());
    E.startHand(a, a.hand.seed);
    assert.equal(wall.slice(53).join(), a.hand.wall.join());
  });

  it('saves no hidden tiles: only the hand\'s seed and your moves', async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records[records.length - 1]);
    assert.deepEqual(Object.keys(record.hand).sort(), ['moves', 'seed']);
    assert.ok(!/"wall"|"discards"|"flowers"/.test(records[records.length - 1]));
    assert.ok(record.hand.moves.every((m) => m.k === 'turn' || m.k === 'claim'));
  });

  it('refuses a replayed move the hand doesn\'t allow', async () => {
    const game = newGame();
    const { records } = await playSaving(game);
    const record = JSON.parse(records.find((r) => JSON.parse(r).hand.moves.length > 0));
    record.hand.moves[0] = { k: 'turn', d: { type: 'discard', tile: 'zz' } };
    await assert.rejects(E.runHand(E.restoreGame(record), agents(), {}, { seed: record.hand.seed, replay: record.hand.moves }));
  });

  it('signs saves, and refuses changed, foreign or incompatible ones', async () => {
    const game = newGame();
    await playSaving(game);
    const file = await E.makeSave({ game: E.gameRecord(game) });
    assert.equal(file.version, E.GAME_VERSION);
    assert.match(file.signature, /^[0-9a-f]{64}$/);
    assert.deepEqual(await E.checkSave(JSON.parse(JSON.stringify(file))), { ok: true, reason: null });
    const edited = JSON.parse(JSON.stringify(file));
    edited.payload.game.players[0].points += 1000;
    assert.match((await E.checkSave(edited)).reason, /changed or damaged/);
    assert.match((await E.checkSave({ app: 'other', payload: {} })).reason, /isn't a Lucky Cat Mahjong save/);
    assert.match((await E.checkSave(Object.assign({}, file, { version: '1.0.0' }))).reason, /newer/);
  });

  it('deals your starting hand from the hand seed your wind badge copies', async () => {
    for (const dealer of [0, 1, 2, 3]) {
      const game = E.createGame({ seed: 777 + dealer, dealer, mode: 'payout' });
      let first = null;
      const ui = { emit: (name) => { if (name === 'turn' && !first) first = { hand: E.sortTiles(game.hand.seats[0].hand.slice()), flowers: game.hand.seats[0].flowers.slice(), text: E.handSeedText(game, 0) }; } };
      await E.runHand(game, agents(), ui);
      const parsed = E.parseHandSeed(first.text);
      assert.equal(parsed.seat, ((0 - dealer + 4) % 4) + 1);
      assert.equal(parsed.round, 1);
      assert.deepEqual(E.dealtHand(parsed.seed, parsed.seat), { hand: first.hand, flowers: first.flowers });
    }
    assert.equal(E.parseHandSeed('458555827'), null);
    assert.equal(E.parseHandSeed('99999999999-EE'), null);
    assert.deepEqual(E.parseHandSeed(' 12-nw '), { seed: 12, seat: 4, round: 3 });
  });

  it('signs the same without Web Crypto (plain http on a phone), so saves load either way', async () => {
    const game = newGame();
    await playSaving(game);
    const payload = { game: E.gameRecord(game) };
    const withCrypto = await E.makeSave(payload);
    const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      const without = await E.makeSave(payload);
      assert.equal(without.signature, withCrypto.signature);
      assert.deepEqual(await E.checkSave(JSON.parse(JSON.stringify(withCrypto))), { ok: true, reason: null });
    } finally {
      Object.defineProperty(globalThis, 'crypto', real);
    }
  });

  it('loads saves from any minor or patch version of the same major version', () => {
    assert.equal(E.GAME_VERSION, '0.19.53');
    for (const v of ['0.1.0', '0.2.0', '0.2.7', '0.0.9', '0.9.3']) assert.equal(E.saveCompatibility(v).ok, true, v);
    assert.match(E.saveCompatibility('1.0.0').reason, /newer/);
    assert.equal(E.saveCompatibility('0.1').ok, false);
    assert.throws(() => E.restoreGame({ players: [] }), /not a saved game/);
  });
});

describe('only-orphans', () => {
  const O = require('./mahjong-only-orphans.js');
  const far = ['c1', 'c9', 'd1', 'd9', 'we', 'dr', 'c4', 'c5', 'd4', 'd6', 'b3', 'b5', 'b7', 'd5'];
  const seven = ['c1', 'c9', 'd1', 'd9', 'b1', 'we', 'ws', 'dr', 'dg', 'c4', 'c5', 'd4', 'b5', 'b6'];
  const pung = (t) => ({ type: 'pung', tiles: [t, t, t], concealed: false, from: 2 });
  const planIds = (a) => a.candidates[0].analysis.best.plan.id;
  // All four Bamboo 9s on the table: Thirteen Orphans can't be finished.
  const noB9 = { discards: ['b9', 'b9', 'b9', 'b9'] };

  it('plays Thirteen Orphans from any hand, throwing other tiles first', () => {
    const a = O.analyzeDiscards(table({ seats: [{ hand: far }] }), 0);
    assert.ok(a.ctx.lockedSpecial);
    assert.equal(planIds(a), 'orphans');
    assert.ok(!E.isTerminalOrHonorIndex(a.candidates[0].index), 'threw ' + a.candidates[0].tile);
  });

  it('claims nothing on Thirteen Orphans, but takes a win', () => {
    const hand = seven.slice(0, 13);
    hand[9] = 'dr';
    const game = table({ seats: [{ hand }] });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'dr', pung: true, kong: false, chows: [] }), { type: 'pass' });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'c1', win: { faan: 13 }, pung: false, kong: false, chows: [] }), { type: 'win' });
  });

  it('declares no kong on Thirteen Orphans', () => {
    const hand = ['dr', 'dr', 'dr', 'dr', 'c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn'];
    const game = table({ seats: [{ hand }] });
    assert.equal(O.chooseTurnAction(game, 0, E.turnOptions(game, 0)).type, 'discard');
  });

  it('pivots once a tile it needs has run out', () => {
    const a = O.analyzeDiscards(table({ seats: [{ hand: far }, noB9] }), 0);
    assert.equal(a.ctx.lockedSpecial, null);
    assert.ok(['mixed-orphans', 'all-terminals', 'all-honors', 'pairs-orphans', 'pairs-honors', 'pairs-terminals'].includes(planIds(a)), planIds(a));
    assert.ok(!E.isTerminalOrHonorIndex(a.candidates[0].index), 'threw ' + a.candidates[0].tile);
  });

  it('holds on for its first discards, then gives up when the odds are too low', () => {
    const c = E.countsOf(far);
    const early = table({ seats: [{ hand: far }], wallLeft: 24 });
    assert.equal(O.stillOrphans(c, O.buildContext(early, 0)), true);
    const discards = ['b2', 'b3', 'b4', 'b5', 'b6', 'b7'];
    assert.equal(O.stillOrphans(c, O.buildContext(table({ seats: [{ hand: far, discards }], wallLeft: 24 }), 0)), false);
    assert.equal(O.stillOrphans(E.countsOf(seven), O.buildContext(table({ seats: [{ hand: seven, discards }], wallLeft: 60 }), 0)), true);
  });

  it('rates the hand lower with fewer tiles held or fewer draws left', () => {
    const odds = (hand, wallLeft) => O.handOdds(E.countsOf(hand), O.buildContext(table({ seats: [{ hand }], wallLeft }), 0));
    assert.ok(odds(seven, 60) > odds(far, 60));
    assert.ok(odds(seven, 70) > odds(seven, 20));
  });

  it('as triplets, pungs the tiles it keeps and passes everything else', () => {
    const hand = ['c1', 'c1', 'd9', 'd9', 'we', 'we', 'dr', 'dr', 'b1', 'b9', 'ws', 'wn', 'c9'];
    const game = table({ seats: [{ hand, melds: [pung('c9')] }, noB9] });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'dr', pung: true, kong: false, chows: [] }), { type: 'pung' });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'c5', pung: false, kong: false, chows: [['c4', 'c6']] }), { type: 'pass' });
  });

  it('as pairs, claims nothing', () => {
    const hand = ['c1', 'c1', 'd9', 'd9', 'we', 'we', 'dr', 'dr', 'b1', 'b1', 'ws', 'ws', 'c9'];
    const game = table({ seats: [{ hand }, noB9] });
    const ctx = O.buildContext(game, 0);
    assert.ok(O.pivotPlans(E.countsOf(hand), ctx).some((p) => p.id === 'pairs-orphans'));
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'dg', pung: false, kong: false, chows: [] }), { type: 'pass' });
    assert.deepEqual(O.chooseClaim(game, 0, { tile: 'dr', pung: true, kong: false, chows: [] }), { type: 'pass' });
  });

  it('only ever finishes on a pivot hand it can use, with no usual hands in the list', () => {
    const ctx = O.buildContext(table({ seats: [{ hand: far }, noB9] }), 0);
    const ids = O.pivotPlans(E.countsOf(far), ctx).map((p) => p.id);
    assert.deepEqual(ids.slice().sort(), ['all-honors', 'all-terminals', 'mixed-orphans', 'pairs-honors', 'pairs-orphans', 'pairs-terminals']);
  });

  it('the coach names the hand it is on', () => {
    const coach = Coach.forStrategy(O);
    assert.match(coach.turnHint(table({ seats: [{ hand: far }] }), 0, { kongs: [] }).tips.join(' '), /Thirteen Orphans/);
    assert.match(coach.turnHint(table({ seats: [{ hand: far }, noB9] }), 0, { kongs: [] }).tips.join(' '), /Mixed Orphans|All Terminals|All Honors/);
  });

  it('plays full hands against the other strategies', async () => {
    for (let n = 0; n < 8; n++) {
      const game = E.createGame({ seed: 31000 + n, humanSeat: false, dealer: 0 });
      const ids = ['only-orphans', 'lucky-cat', 'only-orphans', 'jorge-yau'];
      const res = await E.runHand(game, ids.map((id) => S.createAgent(id)), {});
      assert.ok(res.type === 'win' || res.type === 'draw', res.type);
    }
  });
});

describe('dishonor', () => {
  const D = require('./mahjong-dishonor.js');
  const mixed = ['c2', 'c3', 'c4', 'd4', 'd5', 'd7', 'b3', 'b4', 'b8', 'c7', 'dr', 'dr', 'we', 'd1'];
  const flush = ['b1', 'b2', 'b3', 'b5', 'b6', 'b8', 'b9', 'c2', 'c7', 'd4', 'd8', 'dr', 'wn', 'we'];
  const first = (hand, extra) => D.analyzeDiscards(table(Object.assign({ seats: [{ hand }] }, extra)), 0);

  it('throws every honor first, even a lone dragon nobody has shown or a pair', () => {
    const lone = mixed.slice();
    lone[11] = 'c8';
    assert.equal(first(lone).candidates[0].index >= 27, true);
    assert.equal(first(lone).candidates[1].index >= 27, true);
    const a = first(mixed);
    assert.ok(a.candidates.slice(0, 2).every((x) => x.index >= 27), a.candidates.slice(0, 2).map((x) => x.tile).join());
  });

  it('keeps honors first while folding', () => {
    const game = table({
      seats: [
        { hand: mixed },
        { melds: [{ type: 'pung', tiles: ['b1', 'b1', 'b1'], concealed: false, from: 2 }, { type: 'pung', tiles: ['b5', 'b5', 'b5'], concealed: false, from: 2 }, { type: 'pung', tiles: ['b9', 'b9', 'b9'], concealed: false, from: 2 }] },
      ],
      wallLeft: 12,
    });
    const a = D.analyzeDiscards(game, 0);
    assert.ok(a.folding);
    assert.ok(a.candidates[0].index >= 27);
  });

  it('plays Concealed Straights and claims nothing with no suit at 7', () => {
    const a = first(mixed);
    assert.equal(D.lockedSuit(E.countsOf(mixed), a.ctx), null);
    assert.equal(a.candidates[0].analysis.best.plan.id, 'straights');
    const hand = mixed.slice(0, 13);
    const game = table({ seats: [{ hand }] });
    assert.deepEqual(D.chooseClaim(game, 0, { tile: 'dr', pung: true, kong: false, chows: [] }), { type: 'pass' });
    assert.deepEqual(D.chooseClaim(game, 0, { tile: 'd6', pung: false, kong: false, chows: [['d4', 'd5'], ['d5', 'd7']] }), { type: 'pass' });
    assert.deepEqual(D.chooseClaim(game, 0, { tile: 'd6', win: { faan: 3 }, pung: false, kong: false, chows: [] }), { type: 'win' });
  });

  it('locks into a suit with 7 tiles: honors, then other suits, then that suit', () => {
    const a = first(flush);
    assert.equal(D.lockedSuit(E.countsOf(flush), a.ctx), 'b');
    assert.equal(a.candidates[0].analysis.best.plan.id, 'full-b');
    const kinds = a.candidates.map((x) => (x.index >= 27 ? 'h' : E.suitOfIndex(x.index) === 'b' ? 'b' : 'o')).join('');
    assert.match(kinds, /^h+o+b+$/);
  });

  it('once locked, chows and pungs in its suit and passes the rest', () => {
    const hand = flush.slice(0, 13);
    const game = table({ seats: [{ hand }] });
    assert.equal(D.chooseClaim(game, 0, { tile: 'b4', pung: false, kong: false, chows: [['b2', 'b3'], ['b5', 'b6']] }).type, 'chow');
    assert.equal(D.chooseClaim(game, 0, { tile: 'b5', pung: false, kong: false, chows: [] }).type, 'pass');
    assert.equal(D.chooseClaim(game, 0, { tile: 'c3', pung: false, kong: false, chows: [['c2', 'c4']] }).type, 'pass');
    const paired = ['b1', 'b1', 'b2', 'b3', 'b5', 'b6', 'b8', 'b9', 'c2', 'c7', 'd4', 'dr', 'wn'];
    assert.equal(D.chooseClaim(table({ seats: [{ hand: paired }] }), 0, { tile: 'b1', pung: true, kong: false, chows: [] }).type, 'pung');
  });

  it('lets a tile other than an honor go when that leaves the hand ready', () => {
    const hand = ['c1', 'c2', 'c3', 'd4', 'd5', 'd6', 'b2', 'b3', 'b4', 'c6', 'c7', 'dr', 'dr', 'b9'];
    const game = table({ seats: [{ hand, flowers: ['f1'] }] });
    const top = D.analyzeDiscards(game, 0).candidates[0];
    assert.equal(top.tile, 'b9');
    assert.equal(top.shanten, 0);
  });

  it('declares a kong only in its locked suit', () => {
    assert.equal(D.kongOk({ tile: 'c5' }, { lockSuit: 'c' }), true);
    assert.equal(D.kongOk({ tile: 'd5' }, { lockSuit: 'c' }), false);
    assert.equal(D.kongOk({ tile: 'dr' }, { lockSuit: 'c' }), false);
    assert.equal(D.kongOk({ tile: 'c5' }, { lockSuit: null }), false);
    const hand = ['c5', 'c5', 'c5', 'c5', 'd1', 'd2', 'd3', 'd7', 'd8', 'b1', 'b2', 'b9', 'wn', 'we'];
    const game = table({ seats: [{ hand }] });
    assert.equal(D.chooseTurnAction(game, 0, E.turnOptions(game, 0)).type, 'discard');
  });

  it('the coach names the hand it is on', () => {
    const coach = Coach.forStrategy(D);
    assert.match(coach.turnHint(table({ seats: [{ hand: mixed }] }), 0, { kongs: [] }).tips.join(' '), /Concealed Straights/);
    assert.match(coach.turnHint(table({ seats: [{ hand: flush }] }), 0, { kongs: [] }).tips.join(' '), /Full Flush in Bamboo/);
  });

  it('plays full hands against the other strategies', async () => {
    for (let n = 0; n < 8; n++) {
      const game = E.createGame({ seed: 32000 + n, humanSeat: false, dealer: 0 });
      const res = await E.runHand(game, ['dishonor', 'lucky-cat', 'only-orphans', 'jorge-yau'].map((id) => S.createAgent(id)), {});
      assert.ok(res.type === 'win' || res.type === 'draw', res.type);
    }
  });
});

