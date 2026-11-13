// Features v2 (js/mahjong-frontier-net.js), the frontier plan's phase 1:
// what they read, that they read only the seat's view, and that lc32
// widened to them plays exactly as lc32.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./mahjong-engine.js");
const N = require("./mahjong-lucky-cat-net.js");
const F = require("./mahjong-frontier-net.js");
const LC = require("./mahjong-lucky-cat-ml.js");
const { playAll, copyGame, hiddenShuffled } = require("../scripts/ml/fair-play.js");

function randomV2(seed) {
  const w = F.zeroWeights([64, 32]);
  const rng = E.createRng(seed);
  w.layers.forEach((l) => { for (let i = 0; i < l.w.length; i++) l.w[i] = (rng() * 2 - 1) * Math.sqrt(2 / l.cols) * 1.7; });
  return w;
}

async function midHand(seed, moves) {
  const game = E.createGame({ seed, humanSeat: false, dealer: 0, startPoints: 1e9 });
  const bot = LC.create({ weights: randomV2(3), net: F, fast: true });
  let n = 0, at = null;
  const agent = bot.createBotAgent();
  const spy = {
    turn: (g, s, o) => { if (n++ === moves && !at) at = { game: copyGame(g), seat: s }; return agent.turn(g, s, o); },
    claim: (g, s, o) => agent.claim(g, s, o),
  };
  await E.runHand(game, [spy, spy, spy, spy]);
  return at;
}

describe("features v2", () => {
  it("starts with Lucky Cat's features and adds who threw what, after claims, and the engine's facts", async () => {
    assert.equal(F.BASE, N.SIZE);
    assert.equal(F.SIZE, N.SIZE + 3 * 3 * 34 + 3 * 34 + 34 + 34 + 2);
    const at = await midHand(21, 30);
    const x = F.encode(at.game, at.seat);
    assert.deepEqual(Array.from(x.slice(0, N.SIZE)), Array.from(N.encode(at.game, at.seat)));
    // Every discard of the player on the right is in its piles, by kind.
    const right = at.game.hand.seats[(at.seat + 1) % 4];
    const piles = F.GROUPS.piles.start;
    right.discards.forEach((d) => {
      const i = E.tileIndex(d.tile);
      assert.ok(x[piles + i] + x[piles + 34 + i] + x[piles + 68 + i] > 0);
    });
    // On its turn, every tile kind it holds has a shanten-after, and only those.
    const c = E.countsOf(at.game.hand.seats[at.seat].hand.filter((t) => !E.isBonus(t)));
    for (let i = 0; i < 34; i++) assert.equal(x[F.GROUPS.shantenAfter.start + i] > 0, c[i] > 0, "tile " + i);
  });

  it("reads nothing the seat can't see", async () => {
    const rng = E.createRng(5);
    for (const seed of [31, 32, 33]) {
      const at = await midHand(seed, 25);
      const a = F.encode(copyGame(at.game), at.seat);
      const b = F.encode(hiddenShuffled(at.game, at.seat, rng, true), at.seat);
      assert.deepEqual(Array.from(b), Array.from(a));
    }
  });

  it("a v2 Lucky Cat plays only on what its seat can see", async () => {
    await playAll("lucky cat v2", LC.create({ weights: randomV2(9), net: F, fast: true }), null, 4);
  });

  it("lc32 widened to v2 plays exactly as lc32", async () => {
    const w1 = require("./mahjong-lucky-cat-weights.js");
    const m1 = N.createModel(w1);
    const m2 = F.createModel(F.widen(w1));
    for (const seed of [41, 42]) {
      const at = await midHand(seed, 20);
      assert.deepEqual(m2.forward(F.encode(at.game, at.seat)), m1.forward(N.encode(at.game, at.seat)));
    }
    assert.throws(() => N.createModel(F.widen(w1)), /expects 854 features/);
  });
});
