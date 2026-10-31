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
