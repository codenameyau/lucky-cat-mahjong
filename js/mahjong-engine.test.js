'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const B = require('./mahjong-bot.js');
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

  it('gives the same faan as the Points Calculator for concealed hands', () => {
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

  it('keeps the deal on a dealer win or draw, and advances the round wind', () => {
    const game = E.createGame({ seed: 3, humanSeat: false, dealer: 0 });
    E.startHand(game);
    E.settleDraw(game);
    assert.equal(game.dealer, 0);
    for (let k = 1; k <= 4; k++) {
      E.startHand(game);
      E.settleWin(game, (game.dealer + 1) % 4, null, null, { faan: 3, points: 8, items: [] }, 'selfDraw');
    }
    assert.equal(game.dealer, 0);
    assert.equal(game.round, 2);
  });

  it('ends the game when the human runs out, and replaces bots that bust', () => {
    const game = E.createGame({ seed: 4, dealer: 0 });
    game.players[0].points = 10;
    game.players[2].points = 10;
    E.startHand(game);
    E.settleWin(game, 1, null, null, { faan: 4, points: 16, items: [] }, 'selfDraw');
    assert.equal(game.over, true);
    const joined = E.replaceBustedBots(game);
    assert.equal(joined.length, 1);
    assert.equal(joined[0].seat, 2);
    assert.equal(game.players[2].points, E.START_POINTS);
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

describe('saving and resuming a match', () => {
  it('round-trips through JSON and keeps scores, dealer and round', () => {
    const game = E.createGame({ seed: 5, humanSeat: true, spicy: 'half', mode: 'payout' });
    game.players[0].points = 1840;
    game.players[2].points = 2210;
    game.round = 2;
    game.dealer = 3;
    game.firstDealer = 1;
    game.handNumber = 7;
    game.dealerRepeat = 2;
    const back = E.restoreGame(JSON.parse(JSON.stringify(E.serializeGame(game))));
    assert.deepEqual(back.players, game.players);
    assert.equal(back.settings.spicy, 'half');
    assert.equal(back.settings.mode, 'payout');
    assert.deepEqual([back.round, back.dealer, back.firstDealer, back.handNumber, back.dealerRepeat], [2, 3, 1, 7, 2]);
    assert.deepEqual(back.spareNames, game.spareNames);
    assert.equal(back.over, false);
  });

  it('plays on from a restored match', async () => {
    const game = E.createGame({ seed: 9, humanSeat: true });
    game.handNumber = 3;
    game.players[1].points = 1500;
    const back = E.restoreGame(E.serializeGame(game));
    const agents = [0, 1, 2, 3].map(() => B.createBotAgent());
    const res = await E.runHand(back, agents, {});
    assert.equal(back.handNumber, 4);
    assert.ok(res.type === 'win' || res.type === 'draw');
    const total = back.players.reduce((n, p) => n + p.points, 0);
    assert.equal(total, 2000 * 3 + 1500 + (game.players[0].points - 2000)); // points are only moved, never created
  });

  it('rejects data that is not a valid match', () => {
    const ok = E.serializeGame(E.createGame({ seed: 1, humanSeat: true }));
    assert.equal(E.restoreGame(null), null);
    assert.equal(E.restoreGame({}), null);
    assert.equal(E.restoreGame(Object.assign({}, ok, { v: 2 })), null);
    assert.equal(E.restoreGame(Object.assign({}, ok, { dealer: 7 })), null);
    assert.equal(E.restoreGame(Object.assign({}, ok, { round: 'East' })), null);
    assert.equal(E.restoreGame(Object.assign({}, ok, { players: ok.players.slice(0, 3) })), null);
    const bad = JSON.parse(JSON.stringify(ok));
    bad.players[2].points = 'lots';
    assert.equal(E.restoreGame(bad), null);
    const noHuman = JSON.parse(JSON.stringify(ok));
    noHuman.players[0].isHuman = false;
    assert.equal(E.restoreGame(noHuman), null);
  });
});
