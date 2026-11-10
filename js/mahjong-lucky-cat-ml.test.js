'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const S = require('./mahjong-strategies.js');
const N = require('./mahjong-lucky-cat-net.js');
const L = require('./mahjong-lucky-cat.js');
const LC = require('./mahjong-lucky-cat-ml.js');
const { winWeight } = require('../scripts/ml/lucky.js');

function dealt(seed) {
  const game = E.createGame({ seed, humanSeat: false, dealer: 0 });
  E.startHand(game);
  game.hand.seats[0].hand.push(game.hand.wall.shift());
  return game;
}

describe('Lucky Cat network', () => {
  it('starts out playing at random: every legal move gets the same share', () => {
    const m = N.createModel(N.zeroWeights());
    const game = dealt(3);
    const moves = m.policy(N.encode(game, 0), N.turnMoves(game.hand.seats[0].hand, []));
    const kinds = new Set(game.hand.seats[0].hand.filter((t) => !E.isBonus(t))).size;
    assert.equal(moves.length, kinds);
    moves.forEach((x) => assert.ok(Math.abs(x.p - 1 / kinds) < 1e-9));
  });

  it('offers only legal moves: discards of held tiles, kongs offered, and each claim', () => {
    const game = dealt(5);
    const hand = game.hand.seats[0].hand;
    N.turnMoves(hand, [{ tile: hand[0], kind: 'concealed' }]).forEach((x) => {
      if (x.decision.type === 'discard') assert.ok(hand.includes(x.decision.tile));
      else assert.equal(x.action, 34 + E.tileIndex(hand[0]));
    });
    const claim = N.claimMoves({ tile: 'c5', chows: [['c3', 'c4'], ['c4', 'c6'], ['c6', 'c7']], pung: true, kong: false });
    assert.deepEqual(claim.map((x) => N.CLAIM_NAMES[x.action - N.TURN]), ['pass', 'chow-high', 'chow-mid', 'chow-low', 'pung']);
  });

  it('is built on no rules: its moves come from the network alone', async () => {
    const bot = LC.create({ weights: N.randomWeights(4) });
    let calls = 0;
    const spy = Object.create(L);
    ['analyzeDiscards', 'chooseTurnAction', 'chooseClaim', 'decideClaim', 'buildContext', 'opponentThreats'].forEach((k) => {
      spy[k] = function () { calls++; return L[k].apply(L, arguments); };
    });
    Object.setPrototypeOf(bot, spy);
    const game = E.createGame({ seed: 8, humanSeat: false, dealer: 0, startPoints: 1e9 });
    const res = await E.runHand(game, [bot, bot, bot, bot].map((b) => b.createBotAgent()));
    assert.ok(res.type === 'win' || res.type === 'draw');
    assert.equal(calls, 0, 'played a move through the classic rules');
  });

  it('plays whole hands, at random and trained, against other strategies', async () => {
    for (let seed = 1; seed <= 3; seed++) {
      const game = E.createGame({ seed, humanSeat: false, dealer: seed % 4, startPoints: 1e9 });
      const agents = [LC.create({ temperature: 1, rng: E.createRng(seed), fast: true }).createBotAgent(), S.createAgent('neural-cat'),
        LC.create({ weights: N.randomWeights(seed) }).createBotAgent(), S.createAgent('jorge-yau')];
      const res = await E.runHand(game, agents);
      assert.ok(res.type === 'win' || res.type === 'draw');
      assert.equal(res.deltas.reduce((a, b) => a + b, 0), 0);
    }
  });

  it('records each move it makes, for training', async () => {
    const seen = [];
    const bot = LC.create({ temperature: 1, rng: E.createRng(2), fast: true, onDecision: (d) => seen.push(d) });
    await E.runHand(E.createGame({ seed: 2, humanSeat: false, dealer: 0, startPoints: 1e9 }), [0, 1, 2, 3].map(() => bot.createBotAgent()));
    assert.ok(seen.length > 20);
    seen.forEach((d) => {
      assert.equal(d.features.length, N.SIZE);
      assert.ok(d.pick >= 0 && d.pick < d.moves.length);
    });
  });

  it('learns more from a quick win than a slow one, and only a little more from a big one', () => {
    assert.ok(winWeight(6, 3) > winWeight(12, 3));
    assert.ok(winWeight(12, 3) > winWeight(18, 3));
    assert.ok(winWeight(10, 8) > winWeight(10, 3));
    assert.ok(winWeight(10, 8) < winWeight(4, 3));
  });

  it('has the coach say how often Lucky Cat makes the move', () => {
    const bot = LC.create({ weights: N.randomWeights(7) });
    const Coach = require('./mahjong-coach.js').forStrategy(bot);
    const hint = Coach.turnHint(dealt(29), 0, { win: null, kongs: [] });
    const line = hint.tips.filter((t) => /^Lucky Cat discards this/.test(t))[0];
    assert.ok(line, 'no network line in ' + JSON.stringify(hint.tips));
    assert.match(line, /\d+% of the time/);
    assert.ok(line.length <= 400);
    assert.equal(hint.tile, bot.chooseTurnAction(dealt(29), 0, { win: null, kongs: [] }).tile);
    assert.equal(Coach.discardFeedback(hint, hint.tile).action, 'Great discard.');
  });

  it('weighs claims and kongs, and the coach says its pick', async () => {
    const bot = LC.create({ weights: N.randomWeights(8) });
    const Coach = require('./mahjong-coach.js').forStrategy(bot);
    let claims = 0, kongs = 0;
    const agent = {
      turn(g, s, o) {
        const r = bot.kongChoice(g, s, o);
        if (r.choices) { kongs++; assert.equal(r.choices[0].decision.type, 'discard'); }
        return Promise.resolve(r.decision);
      },
      claim(g, s, o) {
        const d = bot.decideClaim(g, s, o);
        const read = d.found && d.found.ml;
        if (read) {
          claims++;
          assert.equal(read.choices[0].decision.type, 'pass');
          assert.deepEqual(d.decision, read.choices[read.pick].decision);
          assert.deepEqual(d.decision, bot.chooseClaim(g, s, o));
          if (claims === 1) assert.match(Coach.claimHint(g, s, o).model, /^Lucky Cat would \w.*% of the time/);
        }
        return Promise.resolve(d.decision);
      },
    };
    for (let seed = 1; seed <= 30 && !(claims && kongs); seed++) {
      await E.runHand(E.createGame({ seed, humanSeat: false, dealer: seed % 4, startPoints: 1e9 }), [agent, agent, agent, agent]);
    }
    assert.ok(claims > 0 && kongs > 0, claims + ' claims, ' + kongs + ' kongs');
  });

  it('replaces Lucky Cat on the Strategies sheet, with the classic rules kept as a lab strategy', () => {
    assert.ok(S.ids().indexOf('lucky-cat') !== -1);
    assert.equal(S.get('lucky-cat').name, 'Lucky Cat');
    assert.equal(S.get('lucky-cat').bot, LC.trained ? LC : L);
    assert.ok(S.ids().indexOf('lucky-cat-classic') === -1);
    assert.ok(S.isLab('lucky-cat-classic'));
    assert.equal(S.get('lucky-cat-classic').bot, L);
  });

  it('ships trained weights', () => {
    assert.ok(LC.trained, 'js/mahjong-lucky-cat-weights.js is missing or for other features');
  });
});

describe('Lucky Cat with a value (js/mahjong-lucky-cat-value.js)', () => {
  const V = require('./mahjong-lucky-cat-value.js');
  // A small random value network, the same every run.
  function randomValue(seed) {
    let s = seed;
    const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
    const sizes = [V.SIZE, 32, 28], layers = [];
    for (let i = 1; i < sizes.length; i++) {
      layers.push({ rows: sizes[i], cols: sizes[i - 1], w: Array.from({ length: sizes[i] * sizes[i - 1] }, () => r() * 0.3), b: Array.from({ length: sizes[i] }, () => r() * 0.1) });
    }
    return { featureVersion: V.VALUE_VERSION, featureSize: V.SIZE, meta: { play: { topK: 4, winBonus: 300 } }, layers };
  }

  it("reads the position a move leaves, the tile it throws and the move's kind", () => {
    const game = E.createGame({ seed: 77, humanSeat: false, dealer: 0 });
    E.startHand(game);
    const seat = 0, hand = game.hand.seats[seat].hand;
    const tile = hand[0];
    const after = V.afterTurn(game, seat, { type: 'discard', tile });
    assert.equal(after.hand.length, hand.length - 1);
    const x = V.features(game, seat, after);
    assert.equal(x.length, V.SIZE);
    assert.equal(x[N.SIZE + E.tileIndex(tile)], 1);
    assert.equal(x[N.SIZE + 34], 1);
    // The policy's features of the hand it keeps, first.
    assert.deepEqual(Array.from(x.slice(0, N.SIZE)), Array.from(N.encode(game, seat, { hand: after.hand, melds: after.melds })));
  });

  it('plays legal hands, its moves from the policy\'s best few', async () => {
    const w = Object.assign({}, require('./mahjong-lucky-cat-weights.js'), { value: randomValue(3) });
    const bot = LC.create({ weights: w, fast: true });
    let picks = 0;
    bot.onDecision = (d) => { picks++; assert.ok(d.pick >= 0 && d.pick < d.moves.length); };
    for (let d = 0; d < 3; d++) {
      const game = E.createGame({ seed: 500 + d, humanSeat: false, dealer: d % 4, startPoints: 1e9 });
      const res = await E.runHand(game, [0, 1, 2, 3].map(() => bot.createBotAgent()));
      assert.ok(res.type === 'win' || res.type === 'draw');
    }
    assert.ok(picks > 20);
  });

  it('plays fair: nothing it does changes when the hidden tiles move', async () => {
    const w = Object.assign({}, require('./mahjong-lucky-cat-weights.js'), { value: randomValue(5) });
    await require('../scripts/ml/fair-play.js').playAll('lucky-cat value', LC.create({ weights: w, fast: true }), null, 3);
  });
});
