'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-lucky-cat.js');
const { createScoringApi } = require('./points.harness.js');

const c = (ids) => E.countsOf(ids);

// A started hand with seats overridden for a test scenario.
function table(opts) {
  opts = opts || {};
  const game = E.createGame({ seed: opts.seed || 7, humanSeat: false, dealer: opts.dealer || 0, mode: opts.mode, spicy: opts.spicy });
  if (opts.round) game.round = opts.round;
  E.startHand(game);
  const h = game.hand;
  (opts.seats || []).forEach((s, i) => {
    if (!s) return;
    h.seats[i].hand = s.hand ? s.hand.slice() : h.seats[i].hand;
    h.seats[i].melds = s.melds || [];
    h.seats[i].flowers = s.flowers || [];
    h.seats[i].discards = s.discards || [];
  });
  if (opts.wall) h.wall = opts.wall.slice();
  if (opts.discardCount !== undefined) h.discardCount = opts.discardCount;
  return game;
}

function meld(type, tile, extra) {
  const i = E.tileIndex(tile);
  const tiles = type === 'chow'
    ? [tile, E.tileId(i + 1), E.tileId(i + 2)]
    : Array(type === 'kong' ? 4 : 3).fill(tile);
  return Object.assign({ type, tiles, concealed: false, from: 1 }, extra || {});
}

describe('tiles and wall', () => {
  it('builds a 144-tile wall: four of each of the 34 kinds plus 8 bonus tiles', () => {
    const wall = E.buildWall(E.createRng(1));
    assert.equal(wall.length, 144);
    const counts = c(wall);
    assert.ok(counts.every((n) => n === 4));
    assert.deepEqual(wall.filter(E.isBonus).sort(), E.BONUS_IDS.slice().sort());
  });

  it('shuffles deterministically from a seed', () => {
    assert.deepEqual(E.buildWall(E.createRng(42)), E.buildWall(E.createRng(42)));
    assert.notDeepEqual(E.buildWall(E.createRng(42)), E.buildWall(E.createRng(43)));
  });

  it('sorts suits, then winds, dragons and bonus tiles', () => {
    assert.deepEqual(E.sortTiles(['f1', 'dr', 'we', 'b1', 'd9', 'c1']), ['c1', 'd9', 'b1', 'we', 'dr', 'f1']);
  });
});

describe('shanten', () => {
  it('is -1 for a complete hand and 0 for a ready hand', () => {
    assert.equal(E.shanten(c(['c1', 'c2', 'c3', 'd4', 'd5', 'd6', 'b7', 'b8', 'b9', 'we', 'we', 'we', 'dr', 'dr']), 0), -1);
    assert.equal(E.shanten(c(['c1', 'c2', 'c3', 'd4', 'd5', 'd6', 'b7', 'b8', 'b9', 'we', 'we', 'we', 'dr']), 0), 0);
  });

  it('accounts for declared melds', () => {
    // Two melds declared: 8 tiles left that are a meld, a pair and a partial set.
    assert.equal(E.shanten(c(['c1', 'c2', 'c3', 'd5', 'd5', 'b4', 'b5', 'we']), 2), 0);
    assert.equal(E.shanten(c(['d5', 'd5']), 4), -1);
  });

  it('recognizes seven pairs and thirteen orphans', () => {
    assert.equal(E.sevenPairsShanten(c(['c1', 'c1', 'd2', 'd2', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'b8', 'b8', 'dr']), 0), 0);
    assert.equal(E.shanten(c(['c1', 'c1', 'd2', 'd2', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'b8', 'b8', 'dr', 'dr']), 0), -1);
    // Four of a kind is not two pairs.
    assert.equal(E.sevenPairsShanten(c(['c1', 'c1', 'c1', 'c1', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'b8', 'b8', 'dr', 'dr']), 0), 1);
    assert.equal(E.orphansShanten(c(['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dw', 'dg', 'dr']), 0), 0);
    assert.equal(E.sevenPairsShanten(c(['c1', 'c1']), 1), Infinity);
  });

  it('counts the all-triplets path from pungs and pairs only', () => {
    assert.equal(E.tripletsShanten(c(['c1', 'c1', 'c1', 'd2', 'd2', 'd2', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'dr']), 0), 1);
  });

  it('finds every wait, e.g. all nine tiles for a pure nine gates', () => {
    const waits = E.winningTiles(c(['c1', 'c1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c9', 'c9']), 0);
    assert.deepEqual(waits.map(E.tileId), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
  });
});

describe('scoring reuses points.js', () => {
  const api = createScoringApi();

  function calculatorFaan(tiles, opts) {
    api.resetOptions();
    api.setHand(tiles, opts.flowers || []);
    api.setOption('opt-seat', opts.seat || 1);
    api.setOption('opt-round', opts.round || 1);
    api.setOption('opt-selfdraw', !!opts.selfDraw);
    api.setOption('opt-concealed', opts.concealed !== false);
    api.setOption('opt-no-flowers', true);
    return api.evaluate().faan;
  }

  const hands = [
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'dr', 'c5', 'c5'],
    ['c2', 'c2', 'c2', 'd5', 'd5', 'd5', 'b8', 'b8', 'b8', 'ws', 'ws', 'ws', 'd2', 'd2'],
    ['c1', 'c1', 'd2', 'd2', 'b3', 'b3', 'c5', 'c5', 'd7', 'd7', 'b8', 'b8', 'dr', 'dr'],
    ['c1', 'c9', 'd1', 'd9', 'b1', 'b9', 'we', 'ws', 'ww', 'wn', 'dg', 'dw', 'dr', 'dr'],
    ['we', 'we', 'we', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'd2', 'd2'],
  ];

  it('gives the same faan as the Points Guide for concealed hands', () => {
    hands.forEach((tiles) => {
      [false, true].forEach((selfDraw) => {
        const game = E.HKScoring.scoreHand({ concealed: tiles, seat: 1, round: 1, selfDraw });
        assert.equal(game.faan, calculatorFaan(tiles, { selfDraw }), tiles.join(' '));
      });
    });
  });

  it('keeps declared chows as chows instead of re-reading them as triplets', () => {
    // c1-c2-c3 chowed three times + d5 pair would parse as three pungs if re-read.
    const res = E.HKScoring.scoreHand({
      concealed: ['dr', 'dr', 'dr', 'd5', 'd5'],
      melds: [{ type: 'chow', tile: 'c1' }, { type: 'chow', tile: 'c1' }, { type: 'chow', tile: 'c1' }],
      seat: 2, round: 1,
    });
    const names = res.items.map((i) => i.name);
    assert.ok(!names.includes('All Triplets'));
    assert.ok(names.includes('Dragon Triplet'));
    assert.ok(!names.includes('Concealed'));
  });

  it('scores flowers, seat wind, and the full and half spicy tables', () => {
    const tiles = ['ws', 'ws', 'ws', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c2', 'c2'];
    const full = E.HKScoring.scoreHand({ concealed: tiles, seat: 2, round: 1, flowers: ['f2'] });
    assert.deepEqual(full.items.map((i) => i.name).sort(), ['Concealed', 'Half Flush', 'Seat Flower', 'Seat Wind'].sort());
    assert.equal(full.faan, 6);
    assert.equal(full.points, 64);
    const half = E.HKScoring.scoreHand({ concealed: tiles, seat: 2, round: 1, flowers: ['f2'], spicy: 'half' });
    assert.equal(half.points, 32);
  });

  it('marks a complete hand under 3 faan as not winnable', () => {
    const game = table({ seats: [{ hand: ['c2', 'c3', 'c4', 'd5', 'd6', 'd7', 'b1', 'b2', 'b3', 'c8', 'c8', 'c8', 'd2'], flowers: ['f3'] }] });
    const res = E.scoreWin(game, 0, 'd2', {});
    assert.equal(res.valid, true);
    assert.ok(res.faan < 3);
    assert.equal(res.canWin, false);
    const opts = E.claimOptions(game, 0, 'd2', 3, false);
    assert.equal(opts.win, null);
    assert.ok(opts.completeButShort);
  });

  it('adds heavenly and earthly hands as limit hands', () => {
    const res = E.HKScoring.scoreHand({ concealed: hands[0], heavenly: true, selfDraw: true });
    assert.equal(res.faan, 13);
    assert.ok(res.items.some((i) => i.name === 'Heavenly Hand'));
  });
});

describe('legal options', () => {
  it('only allows a chow from the player on your left', () => {
    const game = table({ seats: [{ hand: ['c3', 'c4', 'd1', 'd1', 'd9', 'b2', 'b5', 'b8', 'we', 'ws', 'ww', 'wn', 'dr'] }] });
    assert.deepEqual(E.claimOptions(game, 0, 'c5', 3, false).chows, [['c3', 'c4']]);
    assert.deepEqual(E.claimOptions(game, 0, 'c5', 1, false).chows, []);
    assert.equal(E.claimOptions(game, 0, 'd1', 2, false).pung, true);
    assert.equal(E.claimOptions(game, 0, 'd1', 2, false).kong, false);
  });

  it('offers only a win when robbing a kong', () => {
    const game = table({ seats: [{ hand: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'dr', 'dr', 'dr', 'c5'] }] });
    const opts = E.claimOptions(game, 0, 'c5', 2, true);
    assert.ok(opts.win);
    assert.ok(opts.win.items.some((i) => i.name === 'Robbing the Kong'));
    assert.equal(opts.pung, false);
  });

  it('offers concealed and added kongs, but no win or kong right after a claim', () => {
    const game = table({ seats: [{ hand: ['c1', 'c1', 'c1', 'c1', 'd5', 'b2', 'b3', 'b4', 'ws', 'ws', 'dr'], melds: [meld('pung', 'd5')] }] });
    const kinds = E.turnOptions(game, 0).kongs.map((k) => k.kind + ':' + k.tile).sort();
    assert.deepEqual(kinds, ['added:d5', 'concealed:c1']);
    game.hand.canSelfDraw = false;
    assert.deepEqual(E.turnOptions(game, 0).kongs, []);
    assert.equal(E.turnOptions(game, 0).justClaimed, true);
  });
});

describe('settlement', () => {
  it('charges every opponent on a self-draw and only the discarder otherwise', () => {
    const game = E.createGame({ seed: 1, humanSeat: false });
    assert.deepEqual(E.payments(game, 2, null, 16), [-16, -16, 48, -16]);
    assert.deepEqual(E.payments(game, 2, 0, 16), [-16, 0, 16, 0]);
    const practice = E.createGame({ seed: 1, mode: 'practice' });
    assert.deepEqual(E.payments(practice, 2, null, 16), [0, 0, 0, 0]);
  });

  const win = (game, seat) => {
    E.startHand(game);
    E.settleWin(game, seat, null, null, { faan: 3, points: 8, items: [] }, 'selfDraw');
  };
  const draw = (game) => {
    E.startHand(game);
    E.settleDraw(game);
  };

  it('in a full game keeps the deal only on a dealer win, and advances the round wind', () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0 });
    win(game, 0);
    assert.equal(game.dealer, 0);
    draw(game);
    assert.equal(game.dealer, 1);
    win(game, 3);
    assert.equal(game.dealer, 2);
    win(game, 0);
    assert.equal(game.dealer, 3);
    assert.equal(game.round, 1);
    win(game, 1);
    assert.equal(game.dealer, 0);
    assert.equal(game.round, 2);
  });

  it('in practice keeps the deal only on a dealer win, and the rounds never end', () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0, mode: 'practice' });
    win(game, 0);
    assert.equal(game.dealer, 0);
    draw(game);
    assert.equal(game.dealer, 1);
    for (let k = 0; k < 20; k++) win(game, (game.dealer + 1) % 4);
    assert.equal(game.over, false);
    assert.equal(game.round, 2);
  });

  it('ends a full game after 16 dealer rotations, with extra hands for dealer wins', () => {
    const game = E.createGame({ seed: 5, humanSeat: false, dealer: 2 });
    win(game, 2); // the dealer wins, so this hand doesn't count as a rotation
    for (let k = 1; k <= 16; k++) {
      assert.equal(game.over, false, 'rotation ' + k);
      assert.equal(game.round, Math.ceil(k / 4));
      win(game, (game.dealer + 1) % 4);
    }
    assert.equal(game.over, true);
    assert.equal(game.round, 4);
    assert.equal(game.handNumber, 17);
  });

  it('does not end a full game when someone goes negative', () => {
    const game = E.createGame({ seed: 4, dealer: 0 });
    game.players[0].points = 10;
    game.players[2].points = 10;
    const names = game.players.map((p) => p.name);
    win(game, 1);
    assert.equal(game.over, false);
    assert.equal(game.players[0].points, 2);
    win(game, 3);
    assert.equal(game.over, false);
    assert.equal(game.players[0].points, -6);
    assert.equal(game.players[2].points, -6);
    assert.deepEqual(game.players.map((p) => p.name), names);
  });

  it('records the winner\'s faan and the points each seat gained or lost', () => {
    const game = E.createGame({ seed: 1, humanSeat: false });
    E.startHand(game);
    const selfDraw = E.settleWin(game, 2, null, null, { faan: 4, points: 16, items: [] }, 'selfDraw');
    assert.deepEqual(E.resultsRow(selfDraw), {
      hand: 1,
      draw: false,
      faan: [0, 0, 4, 0],
      points: [-16, -16, 48, -16],
    });
    E.startHand(game);
    const discard = E.settleWin(game, 0, 3, 'c1', { faan: 3, points: 8, items: [] }, 'discard');
    assert.deepEqual(E.resultsRow(discard), {
      hand: 2,
      draw: false,
      faan: [3, 0, 0, 0],
      points: [8, 0, 0, -8],
    });
    E.startHand(game);
    const drawn = E.settleDraw(game);
    assert.deepEqual(E.resultsRow(drawn), {
      hand: 3,
      draw: true,
      faan: [0, 0, 0, 0],
      points: [0, 0, 0, 0],
    });
    const practice = E.createGame({ seed: 1, mode: 'practice', humanSeat: false });
    E.startHand(practice);
    const quiet = E.settleWin(practice, 1, null, null, { faan: 6, points: 32, items: [] }, 'selfDraw');
    // Practice has no points, so the hand's faan moves: each other seat pays it.
    assert.deepEqual(E.resultsRow(quiet).faan, [-6, 18, -6, -6]);
    assert.deepEqual(E.resultsRow(quiet).points, [0, 0, 0, 0]);
    E.startHand(practice);
    const fed = E.settleWin(practice, 0, 2, 'c1', { faan: 3, points: 8, items: [] }, 'discard');
    assert.deepEqual(E.resultsRow(fed).faan, [3, 0, -3, 0]);
  });

  it('ranks the final standings, with ties sharing a place', () => {
    const game = E.createGame({ seed: 6, dealer: 0 });
    [2100, -40, 2100, 1800].forEach((n, k) => { game.players[k].points = n; });
    assert.deepEqual(E.finalStandings(game).map((r) => [r.seat, r.place]), [[0, 1], [2, 1], [3, 3], [1, 4]]);
  });
});

describe('full hands with four bots', () => {
  async function playSeed(seed) {
    const game = E.createGame({ seed, humanSeat: false });
    const agents = [0, 1, 2, 3].map(() => B.createBotAgent());
    const before = game.players.map((p) => p.points);
    const res = await E.runHand(game, agents, {});
    return { game, res, before };
  }

  it('keeps all 144 tiles accounted for and settles zero-sum results', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { game, res } = await playSeed(seed);
      const h = game.hand;
      const all = h.wall.slice();
      h.seats.forEach((s) => {
        all.push(...s.hand, ...s.flowers);
        s.melds.forEach((m) => all.push(...m.tiles));
        s.discards.forEach((d) => { if (!d.claimed) all.push(d.tile); });
      });
      if (res.type === 'win' && res.how !== 'selfDraw' && res.how !== 'flowers') all.push(res.tile);
      assert.equal(all.length, 144, 'seed ' + seed);
      assert.ok(c(all).every((n) => n === 4), 'seed ' + seed);
      assert.equal(res.deltas.reduce((a, b) => a + b, 0), 0);
      // Every flower and kong takes one replacement tile from the back of the wall.
      const replacements = h.seats.reduce((n, st) => n + st.flowers.length + st.melds.filter((m) => m.type === 'kong').length, 0);
      assert.equal(h.backDrawn, replacements, 'seed ' + seed);
      if (res.type === 'win') {
        assert.ok(res.score.faan >= 3, 'wins need 3 faan');
        assert.equal(res.score.valid, true);
      }
      h.seats.forEach((s, i) => {
        if (res.type === 'win' && i === res.winner) return;
        const kongs = s.melds.filter((m) => m.type === 'kong').length;
        assert.equal(s.hand.length + s.melds.length * 3, 13, 'seat ' + i + ' seed ' + seed + ' kongs ' + kongs);
      });
    }
  });
});

describe('playback seed', () => {
  function discarders() {
    return [0, 1, 2, 3].map(() => ({
      turn: (g, seat) => ({ type: 'discard', tile: g.hand.seats[seat].hand[0] }),
      claim: () => ({ type: 'pass' }),
    }));
  }

  it('encodes the deal, every action, and every hand', async () => {
    const game = E.createGame({ seed: 11, humanSeat: false, dealer: 0 });
    const seen = [];
    const ui = { emit: (name, data) => { if (name === 'discard') seen.push(data.seat + ':' + data.tile); } };
    await E.runHand(game, discarders(), ui);
    const text = E.playbackText(game, { seat: 0, strategies: [null, 'lucky-cat', 'base', 'jorge-yau'] });
    assert.equal(text.split('\n')[0], E.handSeedText(game, 0).replace(/[ESWN][ESWN]$/, 'EE'));
    const rec = E.parsePlayback(text);
    assert.equal(rec.seed, game.hand.seed >>> 0);
    assert.deepEqual(rec.actions.filter((a) => a.a === 'discard').map((a) => a.s + ':' + a.t), seen);
    assert.ok(seen.some((row) => !row.startsWith('0:')), 'bot discards are in the seed');
    rec.players.forEach((p, i) => {
      assert.deepEqual(p.hand, game.hand.seats[i].hand);
      assert.deepEqual(p.flowers, game.hand.seats[i].flowers);
    });
    assert.equal(rec.players[1].strategy, 'lucky-cat');
    const lines = E.playbackLines(rec);
    assert.equal(lines.length, rec.actions.length);
    const first = rec.actions.find((a) => a.a === 'discard');
    assert.match(lines[rec.actions.indexOf(first)], new RegExp(E.tileName(first.t)));
    assert.match(lines[rec.actions.indexOf(first)], new RegExp(rec.players[first.s].name));
    // In the past tense: "You discarded Four Circle." or "Katie discarded ...".
    assert.equal(lines[rec.actions.indexOf(first)], rec.players[first.s].name + ' discarded ' + E.tileName(first.t) + '.');
    lines.forEach((l) => assert.doesNotMatch(l, / (discards|draws|wins|sets aside|chows|pungs|kongs|adds|declares) /));
    assert.equal(E.parsePlayback('nope'), null);
    assert.equal(E.parsePlayback(E.handSeedText(game, 0)), null);
  });

  it('captions the flower replacements before the first discard as Replacing flowers', async () => {
    // A deal where someone starts with a flower.
    let game = null;
    for (let seed = 1; seed < 200 && !game; seed++) {
      const g = E.createGame({ seed, humanSeat: false, dealer: 0 });
      await E.runHand(g, discarders(), { emit() {} });
      const rec = E.parsePlayback(E.playbackText(g, { seat: 0 }));
      const firstDiscard = rec.actions.findIndex((a) => a.a === 'discard');
      if (rec.actions.slice(0, firstDiscard).filter((a) => a.a === 'flower').length) game = rec;
    }
    assert.ok(game, 'a deal with an opening flower');
    const rec = game;
    const firstDiscard = rec.actions.findIndex((a) => a.a === 'discard');
    assert.equal(E.playbackCaption(rec, 0, 0), 'The deal.');
    // Partway through the opening replacements (more than one step from the deal).
    const flowerAt = rec.actions.findIndex((a) => a.a === 'flower');
    const midway = Math.max(flowerAt + 1, 2);
    if (midway <= firstDiscard) assert.equal(E.playbackCaption(rec, 0, midway), 'Replacing flowers.');
    // The first move, up to and including its discard, names the discard.
    assert.match(E.playbackCaption(rec, 0, firstDiscard + 1), / discarded /);
    // A deal with no flowers before its first discard still reads as the deal.
    const plain = { actions: [{ a: 'draw', s: 0, t: 'c1' }, { a: 'draw', s: 1, t: 'c2' }, { a: 'discard', s: 0, t: 'c1' }], players: rec.players };
    assert.equal(E.playbackCaption(plain, 0, 2), 'The deal.');
  });

  it('names a playback\'s winner and winning hand, scored the same as the game scored it', async () => {
    require('./mahjong-bot.js'); require('./mahjong-lucky-cat.js'); require('./mahjong-jorge-yau.js');
    const S = require('./mahjong-strategies.js');
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const game = E.createGame({ seed, humanSeat: false, dealer: seed % 4 });
      await E.runHand(game, [0, 1, 2, 3].map(() => S.createAgent('jorge-yau')), { emit() {} });
      const r = game.hand.result;
      const rec = E.checkPlayback(E.makePlayback(game, { seat: 0 })).record;
      const sum = E.playbackSummary(rec);
      assert.match(sum.hand, /^Hand \d+ · (East|South|West|North) round$/);
      assert.match(sum.number, /^Hand \d+$/, 'the short form, for a row');
      assert.equal(sum.hand, sum.number + sum.hand.slice(sum.number.length), 'the full form starts with it');
      if (r.type !== 'win') {
        assert.equal(E.playbackWinner(rec), null);
        assert.equal(sum.result, 'No winner: the wall ran out');
        continue;
      }
      wins++;
      const w = E.playbackWinner(rec);
      assert.equal(w.seat, r.winner, 'seed ' + seed);
      assert.equal(w.faan, r.score.faan, 'seed ' + seed);
      // Only the most important pattern: the one worth the most faan, not how it was won or the flowers.
      assert.doesNotMatch(w.hand, / \+ /, 'one pattern only');
      assert.doesNotMatch(w.hand, /Self-Draw|No Flowers|Seat Flower|Concealed$/);
      const real = r.score.items.filter((it) => !['Self-Draw', 'Concealed', 'Win on Last Tile', 'Robbing the Kong', 'Win by Kong', 'Win by Double Kong', 'Heavenly Hand', 'Earthly Hand', 'No Flowers', 'Seat Flower', 'Seat Season', 'Four Flowers', 'Four Seasons', 'Seven Robbing One', 'Eight Immortals Crossing the Sea'].includes(it.name));
      const best = Math.max(...(real.length ? real : r.score.items).map((it) => it.faan || 0));
      assert.ok((real.length ? real : r.score.items).some((it) => it.name === w.hand && (it.faan || 0) === best), 'the highest-faan pattern: ' + w.hand);
      assert.equal(w.patterns[0], w.hand);
      assert.equal(sum.result.indexOf(w.name + ' won with ' + w.hand + ' · ' + w.faan + ' faan'), 0, sum.result);
    }
    assert.ok(wins >= 5, wins + ' wins');
    const game = E.createGame({ seed: 1, humanSeat: false, dealer: 0 });
    await E.runHand(game, discarders(), { emit() {} });
    const rec = E.checkPlayback(E.makePlayback(game, { seat: 0 })).record;
    assert.equal(E.playbackSummary(Object.assign({}, rec, { actions: rec.actions.slice(0, 3), moves: 3 })).result, 'Still being played');
  });

  it('a finished hand\'s playback says when it ended, signed with the rest', async () => {
    const game = E.createGame({ seed: 1, humanSeat: false, dealer: 0 });
    const before = Date.now();
    await E.runHand(game, discarders(), { emit() {} });
    const file = E.makePlayback(game, { seat: 0 });
    const rec = E.checkPlayback(file).record;
    assert.ok(rec.endedAt >= before && rec.endedAt <= Date.now());
    const changed = JSON.parse(JSON.stringify(file));
    changed.payload.endedAt = 1;
    assert.equal(E.checkPlayback(changed).ok, false, 'the time can\'t be changed');
  });

  it('rebuilds a playback\'s result exactly as the game settled it (all but the payments)', async () => {
    require('./mahjong-bot.js'); require('./mahjong-lucky-cat.js'); require('./mahjong-jorge-yau.js');
    const S = require('./mahjong-strategies.js');
    let wins = 0, draws = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const game = E.createGame({ seed, humanSeat: false, dealer: seed % 4 });
      await E.runHand(game, [0, 1, 2, 3].map((_, i) => S.createAgent(i % 2 ? 'lucky-cat' : 'jorge-yau')), { emit() {} });
      const r = game.hand.result;
      const p = E.playbackResult(E.checkPlayback(E.makePlayback(game, { seat: 0 })).record);
      if (r.type === 'draw') { draws++; assert.equal(p.type, 'draw'); continue; }
      wins++;
      ['winner', 'payer', 'how', 'tile', 'concealed', 'melds', 'flowers', 'seatWind', 'round'].forEach((k) => {
        assert.deepEqual(p[k], r[k], 'seed ' + seed + ': ' + k);
      });
      assert.deepEqual(p.score.items, r.score.items, 'seed ' + seed + ': the same patterns, Win on Last Tile included');
      assert.equal(p.score.faan, r.score.faan);
    }
    assert.ok(wins >= 10, wins + ' wins');
    const unfinished = E.checkPlayback(E.makePlayback((() => { const g = E.createGame({ seed: 1, humanSeat: false, dealer: 0 }); return g; })(), { seat: 0 }) || 'x');
    assert.equal(unfinished.ok ? E.playbackResult(unfinished.record) : null, null);
  });

  it('says why a playback file failed its check: not a playback, a version it can\'t load, a signature that doesn\'t match, or damaged contents', async () => {
    const game = E.createGame({ seed: 1, humanSeat: false, dealer: 0 });
    await E.runHand(game, discarders(), { emit() {} });
    const file = E.makePlayback(game, { seat: 0 });
    assert.equal(E.checkPlayback(file).ok, true);
    assert.equal(E.checkPlayback(file).code, null);
    const copy = () => JSON.parse(JSON.stringify(file));
    const edited = copy();
    edited.payload.handNumber = 99; // changed after it was signed
    assert.deepEqual([E.checkPlayback(edited).ok, E.checkPlayback(edited).code], [false, 'signature']);
    const badSignature = copy();
    badSignature.signature = 'f'.repeat(64);
    assert.equal(E.checkPlayback(badSignature).code, 'signature');
    const noSignature = copy();
    delete noSignature.signature;
    assert.equal(E.checkPlayback(noSignature).code, 'signature');
    const newer = copy();
    newer.version = '99.0.0';
    assert.equal(E.checkPlayback(newer).code, 'version');
    // A version failure says which way it is wrong, and names both versions.
    const c = E.checkPlayback(newer);
    assert.deepEqual([c.versionKind, c.fileVersion, c.gameVersion], ['newer', '99.0.0', E.GAME_VERSION]);
    const unversioned = copy();
    delete unversioned.version;
    const u = E.checkPlayback(unversioned);
    assert.deepEqual([u.code, u.versionKind, u.fileVersion], ['version', 'missing', null]);
    assert.equal(E.saveCompatibility('0.0.1').ok, true, 'any minor or patch of the same major loads');
    assert.equal(E.saveCompatibility('99.0.0').kind, 'newer');
    assert.equal(E.checkPlayback('not json at all').code, 'notFile');
    assert.equal(E.checkPlayback({ hello: 'world' }).code, 'notFile');
    const broken = copy();
    broken.payload.players = [];
    assert.equal(E.checkPlayback(broken).code, 'damaged');
  });

  it('says when a playback was saved, for people', () => {
    const now = new Date(2026, 10, 7, 15, 0).getTime();
    assert.equal(E.playbackWhen(new Date(2026, 10, 7, 14, 30).getTime(), now), 'Today, 2:30 PM');
    assert.equal(E.playbackWhen(new Date(2026, 10, 6, 9, 5).getTime(), now), 'Yesterday, 9:05 AM');
    assert.equal(E.playbackWhen(new Date(2026, 10, 5, 14, 30).getTime(), now), 'Thu, Nov 5, 2:30 PM');
    assert.equal(E.playbackWhen(new Date(2025, 11, 31, 8, 0).getTime(), now), 'Wed, Dec 31, 2025, 8:00 AM');
    assert.equal(E.playbackWhen(null, now), 'Earlier');
  });

  it('rebuilds that log when a saved hand is played back to the same moment', async () => {
    const game = E.createGame({ seed: 11, dealer: 0 });
    let saved = null;
    let snapshot = null;
    const play = () => ({
      turn: (g, seat) => {
        if (seat === 0 && !saved && g.hand.moves.length === 2) {
          saved = E.gameRecord(g);
          snapshot = E.playbackText(g, { seat: 0 });
        }
        return { type: 'discard', tile: g.hand.seats[seat].hand[0] };
      },
      claim: () => ({ type: 'pass' }),
    });
    await E.runHand(game, [0, 1, 2, 3].map(play), {});
    const restored = E.restoreGame(saved);
    let resumed = null;
    const again = [0, 1, 2, 3].map((seat) => ({
      turn: (g, s) => {
        if (s === 0) throw new Error('past the snapshot');
        return { type: 'discard', tile: g.hand.seats[s].hand[0] };
      },
      claim: () => ({ type: 'pass' }),
    }));
    await assert.rejects(E.runHand(restored, again, {}, {
      seed: saved.hand.seed,
      replay: saved.hand.moves,
      onReplayEnd: () => { resumed = E.playbackText(restored, { seat: 0 }); },
    }), /past the snapshot/);
    const before = E.parsePlayback(snapshot);
    const after = E.parsePlayback(resumed);
    assert.deepEqual(after.actions, before.actions);
    assert.deepEqual(after.players.map((p) => p.hand), before.players.map((p) => p.hand));
  });

  it('asks the table to rebuild each replayed decision before that move is played', async () => {
    const game = E.createGame({ seed: 11, dealer: 0 });
    let saved = null;
    const play = () => ({
      turn: (g, seat) => {
        if (seat === 0 && !saved && g.hand.moves.length === 2) saved = E.gameRecord(g);
        return { type: 'discard', tile: g.hand.seats[seat].hand[0] };
      },
      claim: () => ({ type: 'pass' }),
    });
    await E.runHand(game, [0, 1, 2, 3].map(play), {});
    const restored = E.restoreGame(saved);
    const seen = [];
    await assert.rejects(E.runHand(restored, [0, 1, 2, 3].map(() => ({
      turn: (g, seat) => {
        if (seat === 0) throw new Error('past the snapshot');
        return { type: 'discard', tile: g.hand.seats[seat].hand[0] };
      },
      claim: () => ({ type: 'pass' }),
    })), {
      replayDecision(kind, opts, decision) {
        const hand = restored.hand.seats[0].hand;
        seen.push({ kind, decision, stillHeld: !decision.tile || hand.includes(decision.tile), opts: !!opts });
      },
    }, {
      seed: saved.hand.seed,
      replay: saved.hand.moves,
    }), /past the snapshot/);
    assert.equal(seen.length, saved.hand.moves.length);
    assert.ok(seen.length >= 2);
    seen.forEach((row, i) => {
      assert.equal(row.kind, saved.hand.moves[i].k);
      assert.deepEqual(row.decision, saved.hand.moves[i].d);
      assert.equal(row.stillHeld, true);
      assert.equal(row.opts, true);
    });
  });

  it('rebuilds the table at every move', async () => {
    const game = E.createGame({ seed: 11, humanSeat: false, dealer: 0 });
    const agents = [0, 1, 2, 3].map(() => ({
      turn: (g, seat, opts) => {
        if (opts.kongs && opts.kongs[0]) return { type: 'kong', tile: opts.kongs[0].tile };
        return { type: 'discard', tile: g.hand.seats[seat].hand[0] };
      },
      claim: (g, seat, opts) => {
        if (opts.kong) return { type: 'kong' };
        if (opts.pung) return { type: 'pung' };
        if (opts.chows && opts.chows[0]) return { type: 'chow', tiles: opts.chows[0] };
        return { type: 'pass' };
      },
    }));
    await E.runHand(game, agents, {});
    const rec = E.parsePlayback(E.playbackText(game, { seat: 0, strategies: [null, 'lucky-cat', 'base', 'jorge-yau'] }));
    assert.ok(rec.actions.some((a) => a.a === 'claim' || a.a === 'kong'), 'the hand makes a meld');
    for (let i = 0; i <= rec.actions.length; i++) E.playbackGame(rec, i);
    const deal = E.playbackGame(rec, 0);
    assert.equal(deal.dealer, rec.dealer);
    assert.equal(deal.round, rec.round);
    assert.equal(deal.handNumber, rec.handNumber);
    assert.equal(deal.players[2].name, rec.players[2].name);
    assert.equal(deal.hand.seats[rec.dealer].hand.length, 14);
    assert.equal(deal.hand.seats[(rec.dealer + 1) % 4].hand.length, 13);
    assert.ok(deal.hand.seats.every((s) => s.discards.length === 0 && s.melds.length === 0));
    const at = rec.actions.findIndex((a) => a.a === 'discard');
    const ev = rec.actions[at];
    const before = E.playbackGame(rec, at);
    const after = E.playbackGame(rec, at + 1);
    const thrown = after.hand.seats[ev.s].discards;
    assert.equal(thrown.length, before.hand.seats[ev.s].discards.length + 1);
    assert.equal(thrown[thrown.length - 1].tile, ev.t);
    assert.equal(after.hand.review.mark.where, 'pond');
    const end = E.playbackGame(rec);
    rec.players.forEach((p, i) => {
      const s = end.hand.seats[i];
      assert.deepEqual(s.hand, p.hand);
      assert.deepEqual(s.flowers, p.flowers);
      assert.deepEqual(s.melds.map((m) => ({
        type: m.type, tiles: m.tiles, from: m.from == null ? null : m.from, concealed: !!m.concealed,
      })), p.melds);
      assert.deepEqual(s.discards.map((d) => ({ tile: d.tile, claimed: !!d.claimed })), p.discards);
    });
  });

  it('replays the tile drawn to replace a kong', async () => {
    const game = E.createGame({ seed: 15, humanSeat: false, dealer: 0 });
    const agents = [0, 1, 2, 3].map(() => ({
      turn: (g, seat, opts) => {
        if (opts.kongs && opts.kongs[0]) return { type: 'kong', tile: opts.kongs[0].tile };
        return { type: 'discard', tile: g.hand.seats[seat].hand[0] };
      },
      claim: (g, seat, opts) => {
        if (opts.kong) return { type: 'kong' };
        if (opts.pung) return { type: 'pung' };
        return { type: 'pass' };
      },
    }));
    await E.runHand(game, agents, {});
    const rec = E.parsePlayback(E.playbackText(game, { seat: 0 }));
    const at = rec.actions.findIndex((a) => a.a === 'kong');
    assert.ok(at >= 0, 'the hand declares a kong');
    assert.equal(rec.actions[at + 1].a, 'draw');
    assert.equal(rec.actions[at + 1].k, 'kong');
    assert.equal(rec.actions[at + 1].s, rec.actions[at].s);
    for (let i = 0; i <= rec.actions.length; i++) E.playbackGame(rec, i);
    const end = E.playbackGame(rec);
    rec.players.forEach((p, i) => {
      assert.deepEqual(end.hand.seats[i].hand, p.hand);
    });
  });

  it('says a playback is finished only once its hand has a result', async () => {
    const game = E.createGame({ seed: 11, humanSeat: false, dealer: 0 });
    await E.runHand(game, discarders(), {});
    const rec = E.checkPlayback(E.makePlayback(game, { seat: 0 })).record;
    assert.equal(E.playbackFinished(rec), true);
    const early = JSON.parse(JSON.stringify(rec));
    early.actions = early.actions.slice(0, Math.floor(early.actions.length / 2));
    early.moves = early.actions.length;
    assert.equal(E.playbackFinished(early), false, 'half the moves is a hand still being played');
    assert.equal(E.playbackFinished(null), false);
  });

  it('signs a playback file and stops at the moves it names', async () => {
    const game = E.createGame({ seed: 11, humanSeat: false, dealer: 0 });
    await E.runHand(game, discarders(), {});
    const file = E.makePlayback(game, { seat: 0 });
    assert.equal(file.moves, file.payload.actions.length);
    assert.equal(file.payload.handSeed, file.payload.seed + '-EE');
    assert.match(file.signature, /^[0-9a-f]{64}$/);
    const checked = E.checkPlayback(JSON.stringify(file, null, 2));
    assert.equal(checked.ok, true);
    assert.equal(checked.record.moves, file.moves);
    const edited = JSON.parse(JSON.stringify(file));
    edited.payload.actions.push({ a: 'drawGame' });
    edited.moves = edited.payload.actions.length;
    assert.match(E.checkPlayback(edited).reason, /changed or damaged/);
    edited.payload.actions.pop();
    edited.moves = file.moves - 1;
    assert.match(E.checkPlayback(edited).reason, /changed or damaged/);
    assert.match(E.checkPlayback(E.playbackText(game, { seat: 0 })).reason, /isn't a playback file/);
    const copied = E.checkPlayback(file.payload.handSeed + '\n' + JSON.stringify(file));
    assert.equal(copied.ok, true);
    assert.equal(copied.record.handSeed, file.payload.handSeed);
    assert.equal(copied.record.actions.length, file.moves);
    const full = JSON.parse(JSON.stringify(checked.record));
    delete full.moves;
    const capped = JSON.parse(JSON.stringify(checked.record));
    capped.moves = 2;
    const snap = (g) => g.hand.seats.map((s) => ({
      hand: s.hand, flowers: s.flowers, discards: s.discards.map((d) => d.tile),
    }));
    assert.deepEqual(snap(E.playbackGame(capped)), snap(E.playbackGame(full, 2)));
    assert.notDeepEqual(snap(E.playbackGame(capped)), snap(E.playbackGame(full)));
  });
});
