'use strict';

// Suphx's oracle features (scripts/ml/oracle.js): training only. They must
// read the hidden tiles correctly, and nothing that reads them may ship.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const E = require('../../js/mahjong-engine.js');
const N = require('../../js/mahjong-lucky-cat-net.js');
const LC = require('../../js/mahjong-lucky-cat-ml.js');
const O = require('./oracle.js');
const { ship } = require('./ship.js');

// Plays one hand with Lucky Cat in every seat, reading the oracle at each choice.
async function playReading(seed, check) {
  const bot = LC.create({ fast: true, features: (game, seat, x) => {
    check(game, seat, O.oracle(game, seat));
    return { x, record: x };
  } });
  const game = E.createGame({ seed, humanSeat: false, dealer: 0, startPoints: 1e9 });
  return E.runHand(game, [0, 1, 2, 3].map(() => bot.createBotAgent()));
}

describe('oracle features (Suphx, training only)', () => {
  it('reads every other hand, the wall and the next draw', async () => {
    let checked = 0;
    await playReading(11, (game, seat, o) => {
      assert.strictEqual(o.length, O.SIZE);
      for (let k = 1; k <= 3; k++) {
        const s = game.hand.seats[(seat + k) % 4];
        const want = s.hand.filter((t) => !E.isBonus(t)).length;
        let got = 0;
        for (let i = 0; i < 34; i++) got += o[(k - 1) * O.PER + i] * 4;
        assert.strictEqual(Math.round(got), want);
      }
      const live = game.hand.wall.filter((t) => !E.isBonus(t));
      let wall = 0;
      for (let i = 0; i < 34; i++) wall += o[3 * O.PER + i] * 4;
      assert.strictEqual(Math.round(wall), live.length);
      if (live.length) assert.strictEqual(o[3 * O.PER + 34 + E.tileIndex(live[0])], 1);
      checked++;
    });
    assert.ok(checked > 20);
  });

  it('marks exactly the discards that would deal in, with what they pay', async () => {
    let risky = 0;
    for (let seed = 1; seed <= 12; seed++) {
      await playReading(seed, (game, seat, o) => {
        new Set(game.hand.seats[seat].hand.filter((t) => !E.isBonus(t))).forEach((t) => {
          let worst = 0;
          for (let k = 1; k <= 3; k++) {
            const opts = E.claimOptions(game, (seat + k) % 4, t, seat);
            if (opts.win) worst = Math.max(worst, opts.win.points);
          }
          assert.strictEqual(Math.round(o[O.DANGER + E.tileIndex(t)] * 1024), worst);
          if (worst) risky++;
        });
      });
    }
    assert.ok(risky > 0, 'some discard in twelve hands would deal in');
  });

  it('never ships: the game model reads only the seat, and ship refuses an oracle model', () => {
    const w = require('../../js/mahjong-lucky-cat-weights.js');
    assert.ok(!(w.meta || {}).oracle);
    assert.strictEqual(w.layers[0].cols, N.SIZE);
    const oracleModel = N.zeroWeights();
    oracleModel.layers[0].cols = N.SIZE + O.SIZE;
    oracleModel.layers[0].w = new Array(oracleModel.layers[0].rows * oracleModel.layers[0].cols).fill(0);
    oracleModel.layers.slice(1).forEach((l) => { l.w = Array.from(l.w); });
    oracleModel.layers.forEach((l) => { l.b = Array.from(l.b); });
    oracleModel.meta = { name: 'oracle-test', oracle: { delta: 1, size: O.SIZE, publicSize: N.SIZE } };
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-')), 'm.json');
    fs.writeFileSync(file, JSON.stringify(oracleModel));
    assert.throws(() => ship(file, 'lucky-cat'), /hidden tiles/);
  });
});
