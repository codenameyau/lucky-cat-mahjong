'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const E = require('./mahjong-engine.js');
const S = require('./mahjong-strategies.js');
const F = require('./mahjong-ml-features.js');
const M = require('./mahjong-ml-model.js');
const ML = require('./mahjong-ml.js');

function dealt(seed) {
  const game = E.createGame({ seed, humanSeat: false, dealer: 0 });
  E.startHand(game);
  // Seat 0 holds 14 tiles, as on its turn.
  game.hand.seats[0].hand.push(game.hand.wall.shift());
  return game;
}

describe('ML features', () => {
  it('lays the groups out end to end', () => {
    let at = 0;
    F.LAYOUT.forEach(([name, size]) => {
      assert.equal(F.GROUPS[name].start, at);
      at += size;
      assert.equal(F.GROUPS[name].end, at);
    });
    assert.equal(F.SIZE, at);
  });

  it('builds on jorge-yau, and with top 1 plays exactly like it', async () => {
    const J = require('./mahjong-jorge-yau.js');
    assert.equal(ML.base, 'jorge-yau');
    const one = ML.create({ topK: 1 });
    for (let seed = 1; seed <= 2; seed++) {
      const play = (a) => {
        const game = E.createGame({ seed, humanSeat: false, dealer: 0, startPoints: 1e9 });
        return E.runHand(game, [a, J.createBotAgent(), J.createBotAgent(), J.createBotAgent()]).then(() => game.hand.seats[0].discards.map((d) => d.tile).join());
      };
      assert.equal(await play(one.createBotAgent()), await play(J.createBotAgent()));
    }
  });

  it('reads only what the seat can see', () => {
    const a = dealt(7);
    const b = dealt(7);
    // Another order of the wall, and the other seats' hidden hands swapped.
    b.hand.wall.reverse();
    const h1 = b.hand.seats[1].hand;
    b.hand.seats[1].hand = b.hand.seats[2].hand;
    b.hand.seats[2].hand = h1;
    const sa = F.prepare(a, 0), sb = F.prepare(b, 0);
    const i = E.tileIndex(a.hand.seats[0].hand[0]);
    assert.deepEqual(Array.from(F.encode(sa, i)), Array.from(F.encode(sb, i)));
  });

  it('gives the same features in play as in training data', () => {
    const game = dealt(11);
    const bot = ML.create({ model: M.randomModel(3) });
    const top = bot.analyzeDiscards(game, 0).candidates[0];
    const fresh = F.encode(F.prepare(game, 0, null, null, bot), top.index);
    assert.deepEqual(Array.from(top.features), Array.from(fresh));
  });

  it('keeps every feature finite and mostly in [0, 1]', () => {
    const game = dealt(19);
    const state = F.prepare(game, 0);
    const x = F.encode(state, E.tileIndex(game.hand.seats[0].hand[3]));
    x.forEach((v) => {
      assert.ok(Number.isFinite(v));
      assert.ok(v >= -0.2 && v <= 1.5, 'feature out of range: ' + v);
    });
  });
});

describe('ML model', () => {
  it('predicts outcomes and faan that sum to 1', () => {
    const model = M.randomModel(5);
    const p = model.predict(new Float32Array(F.SIZE).fill(0.3));
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sum(Object.values(p.outcome)) - 1) < 1e-6);
    assert.ok(Math.abs(sum(p.winFaan) - 1) < 1e-6);
    assert.ok(Math.abs(sum(p.payFaan) - 1) < 1e-6);
  });

  it('reads back the same weights it writes', () => {
    const w = M.randomWeights(9);
    const a = M.createModel(w);
    const b = M.createModel(JSON.parse(JSON.stringify(M.serialize(w))));
    const x = new Float32Array(F.SIZE).map((_, i) => (i % 7) / 7);
    assert.deepEqual(a.forward(x), b.forward(x));
  });

  it('refuses weights built for other features', () => {
    const w = M.randomWeights(1);
    w.featureSize = F.SIZE + 1;
    assert.throws(() => M.createModel(w), /features/);
  });

  it('ships trained weights for these features', () => {
    const W = require('./mahjong-ml-weights.js');
    assert.equal(W.featureSize, F.SIZE);
    assert.equal(W.featureVersion, F.FEATURE_VERSION);
    assert.ok(!ML.model.meta.random, 'neural-cat should load the shipped weights');
    assert.equal(ML.model.meta.name, W.meta.name);
  });

  it('values a self-draw at three payments', () => {
    const p = { outcome: { winSelf: 1, winDiscard: 0, dealIn: 0, otherSelf: 0, otherWin: 0, draw: 0 }, winFaan: M.FAAN.map((f) => (f === 5 ? 1 : 0)), payFaan: M.FAAN.map(() => 1 / 11) };
    assert.equal(M.summarize(p).ev, 3 * 32);
  });
});

describe('Neural Cat strategy', () => {
  it('throws the discard the model values most, and says why', () => {
    const game = dealt(23);
    const res = ML.analyzeDiscards(game, 0);
    // Among the foundation's best three, the model's favourite goes first.
    const evs = res.candidates.slice(0, 3).map((x) => x.ml.ev);
    assert.deepEqual(evs, evs.slice().sort((a, b) => b - a));
    const free = ML.create({ model: ML.model, topK: 0 }).analyzeDiscards(dealt(23), 0).candidates.map((x) => x.ml.ev);
    assert.deepEqual(free, free.slice().sort((a, b) => b - a));
    const why = res.candidates[0].ml.why;
    assert.equal(why.length, Object.keys(F.GROUPS).length);
    assert.deepEqual(ML.chooseTurnAction(game, 0, { win: null, kongs: [] }), { type: 'discard', tile: res.candidates[0].tile });
  });

  it('plays whole hands against the table strategies', async () => {
    for (let seed = 1; seed <= 3; seed++) {
      const game = E.createGame({ seed, humanSeat: false, dealer: seed % 4, startPoints: 1e9 });
      const agents = [ML.createBotAgent(), S.createAgent('jorge-yau'), S.createAgent('lucky-cat'), ML.create({ temperature: 200, epsilon: 0.2, rng: E.createRng(seed) }).createBotAgent()];
      const res = await E.runHand(game, agents);
      assert.ok(res.type === 'win' || res.type === 'draw');
      assert.equal(res.deltas.reduce((a, b) => a + b, 0), 0);
    }
  });

  it('has the coach say what the model expects', () => {
    const Coach = require('./mahjong-coach.js');
    const game = dealt(29);
    const hint = Coach.forStrategy(ML).turnHint(game, 0, { win: null, kongs: [] });
    const line = hint.tips.filter((t) => /^The model expects/.test(t))[0];
    assert.ok(line, 'no model line in ' + JSON.stringify(hint.tips));
    assert.match(line, /to win/);
    assert.match(line, /to deal in/);
  });

  it('gives feedback in expected points', () => {
    const Coach = require('./mahjong-coach.js').forStrategy(ML);
    const game = dealt(29);
    const hint = Coach.turnHint(game, 0, { win: null, kongs: [] });
    const top = Coach.discardFeedback(hint, hint.tile);
    assert.equal(top.action, 'Great discard.');
    assert.ok(top.tips.some((t) => /^The model expects/.test(t)));
    const worst = hint.candidates.slice().sort((a, b) => a.ml.ev - b.ml.ev)[0];
    if (hint.candidates[0].ml.ev - worst.ml.ev > 20) {
      const fb = Coach.discardFeedback(hint, worst.tile);
      assert.notEqual(fb.action, 'Great discard.');
      assert.ok(fb.tips.some((t) => /points from/.test(t)));
    }
  });

  it('is on the Strategies sheet', () => {
    assert.ok(S.ids().indexOf('neural-cat') !== -1);
    assert.ok(!S.isLab('neural-cat'));
    assert.equal(S.get('neural-cat').bot, ML);
  });
});
