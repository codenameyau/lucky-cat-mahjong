// Fair play: no strategy, learned or not, may know the wall or another
// player's hand. The shuffle check itself is in scripts/ml/fair-play.js
// (the benchmark's fair-play stage runs it too): every decision is made on a
// copy of the game and on one where every tile the seat can't see is
// shuffled and every hidden record throws when read, and the two must match.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const E = require("./mahjong-engine.js");
const S = require("./mahjong-strategies.js");
const ML = require("./mahjong-ml.js");
const F = require("./mahjong-ml-features.js");
const Coach = require("./mahjong-coach.js");
const fs = require("node:fs");
const path = require("node:path");
const LC = require("./mahjong-lucky-cat-ml.js");
const LCN = require("./mahjong-lucky-cat-net.js");
const Oracle = require("../scripts/ml/oracle.js");

const { playAll, said, copyGame, hiddenShuffled } = require("../scripts/ml/fair-play.js");

describe("fair play", () => {
  it("Neural Cat never sees the wall or another hand: discards, claims, kongs and the coach", async () => {
    await playAll("neural-cat", ML, Coach.forStrategy(ML), 3);
  });

  it("Neural Cat in simulations (fast) never sees them either", async () => {
    await playAll("neural-cat fast", ML.create({ model: ML.model, fast: true }), null, 3);
  });

  it("every table strategy plays only on what its seat can see", async () => {
    // Lucky Cat wins quickly, so it needs more deals for enough positions.
    for (const id of S.ids().filter((x) => x !== "neural-cat")) await playAll(id, S.get(id).bot, null, id === "lucky-cat" ? 4 : 2);
  });

  it("catches a strategy that peeks", async () => {
    const J = S.get("jorge-yau").bot;
    const cheat = (peek) => ({
      analyzeDiscards: (g, s) => ({ candidates: [{ tile: "peek", score: peek(g, s) }] }),
      chooseTurnAction: (g, s, o) => J.chooseTurnAction(g, s, o),
      decideClaim: () => ({ decision: { type: "pass" }, found: null }),
      chooseClaim: () => ({ type: "pass" }),
    });
    const peeks = {
      "the next hand": (g, s) => g.hand.seats[(s + 1) % 4].hand.join(),
      "the wall": (g) => g.hand.wall.slice(0, 4).join(),
      "the seed": (g) => g.seed,
      "the move log": (g) => g.hand.moves.length,
    };
    for (const what of Object.keys(peeks)) {
      await assert.rejects(playAll("cheat", cheat(peeks[what]), null, 1), /changed its decision|peeked/, "missed a peek at " + what);
    }
  });

  // Training records the hidden tiles beside the seat's view (Suphx's
  // oracle, scripts/ml/oracle.js) through a hook the game never sets. If a
  // Lucky Cat ever played with that hook, this is what would catch it.
  it("catches a Lucky Cat that reads the hidden tiles through the training hook", async () => {
    const w = LCN.randomWeights(5, [64, 32]);
    w.layers[0].cols = LCN.SIZE + Oracle.SIZE;
    w.layers[0].w = new Float32Array(w.layers[0].rows * w.layers[0].cols).map(() => Math.random() - 0.5);
    const peeking = LC.create({ weights: w, fast: true, features: (g, s, x) => { const f = Oracle.extend(x, g, s); return { x: f, record: f }; } });
    await assert.rejects(playAll("oracle lucky cat", peeking, null, 2), /changed its decision|peeked/);
  });

  it("the shipped Lucky Cat reads exactly its seat's features, and no page loads training code", () => {
    const w = require("./mahjong-lucky-cat-weights.js");
    assert.equal(w.featureSize, LCN.SIZE);
    assert.equal(w.layers[0].cols, LCN.SIZE, "the shipped network reads more inputs than the seat can see");
    assert.ok(!(w.meta || {}).oracle, "the shipped model is marked as an oracle model");
    const nc = require("./mahjong-ml-weights.js");
    assert.equal(nc.layers[0].cols, nc.featureSize);
    // scripts/ml/ is training code: no page and not the offline cache may load it.
    const root = path.join(__dirname, "..");
    const pages = [];
    (function walk(dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        if (e.name === "node_modules" || e.name.startsWith(".")) return;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith(".html")) pages.push(p);
      });
    })(root);
    assert.ok(pages.length > 5);
    pages.forEach((p) => {
      const html = fs.readFileSync(p, "utf8");
      const srcs = Array.from(html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)).map((m) => m[1]);
      srcs.forEach((src) => assert.ok(!/scripts\/|oracle/.test(src), path.relative(root, p) + " loads " + src));
    });
    const cache = fs.readFileSync(path.join(__dirname, "offline-cache.js"), "utf8");
    assert.ok(!/oracle|scripts\//.test(cache), "the offline cache lists training code");
  });

  it("reads another player's concealed kong as a kong, never as its tile", () => {
    const game = E.createGame({ seed: 4300, humanSeat: false, dealer: 0 });
    E.startHand(game);
    game.hand.seats[0].hand.push(game.hand.wall.shift());
    // Seat 1 has declared a concealed kong of a kind seat 0 can't see any of.
    const h = game.hand;
    const hiddenArrays = [h.seats[1].hand, h.seats[2].hand, h.seats[3].hand, h.wall];
    const all = [].concat(...hiddenArrays);
    const kind = E.TILE_IDS.filter((t) => all.filter((x) => x === t).length === 4)[0];
    hiddenArrays.forEach((arr) => { for (let k = arr.length - 1; k >= 0; k--) if (arr[k] === kind) arr.splice(k, 1); });
    h.seats[1].melds.push({ type: "kong", tiles: [kind, kind, kind, kind], concealed: true });
    const rng = E.createRng(11);
    const read = (g, bot) => said({
      threats: bot.opponentThreats(g, 0),
      discards: bot.analyzeDiscards(g, 0).candidates.map((x) => [x.tile, x.score, x.ml && x.ml.ev]),
    });
    const bots = [ML].concat(S.ids().filter((x) => x !== "neural-cat").map((id) => S.get(id).bot));
    bots.forEach((bot) => {
      const base = read(copyGame(game), bot);
      let moved = 0;
      for (let k = 0; k < 4; k++) {
        const g = hiddenShuffled(game, 0, rng, true);
        if (g.hand.seats[1].melds[0].tiles[0] !== kind) moved++;
        assert.equal(read(g, bot), base, bot.id + " read seat 1's concealed kong");
      }
      assert.ok(moved > 0, "the concealed kong never changed kind");
    });
  });

  it("builds training features only from what the seat can see", () => {
    const game = E.createGame({ seed: 4200, humanSeat: false, dealer: 0 });
    E.startHand(game);
    game.hand.seats[0].hand.push(game.hand.wall.shift());
    const rng = E.createRng(3);
    const x = F.encode(F.prepare(game, 0, null, null, ML), E.tileIndex(game.hand.seats[0].hand[0]));
    const w = ML.waitingFeatures(ML, game, 1, "pass", game.hand.seats[0].hand[0]);
    for (let k = 0; k < 5; k++) {
      const g = hiddenShuffled(game, 0, rng, true);
      assert.deepEqual(Array.from(F.encode(F.prepare(g, 0, null, null, ML), E.tileIndex(g.hand.seats[0].hand[0]))), Array.from(x));
      const g1 = hiddenShuffled(game, 1, rng, false);
      assert.deepEqual(Array.from(ML.waitingFeatures(ML, g1, 1, "pass", game.hand.seats[0].hand[0])), Array.from(w));
    }
  });
});
