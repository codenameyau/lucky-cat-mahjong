/* Features v2 for the frontier models (docs/machine-learning/suphx-plan.md,
   phase 1): what Lucky Cat's 376 features leave out, read only from what a
   seat can see. Both lineages read it: Lucky Cat fine-tuned from lc32 (its
   first layer gains these columns, starting at zero) and Sphinx from random
   weights.

   encode(game, seat, view, offer) is Lucky Cat's encode (the first 376,
   js/mahjong-lucky-cat-net.js) followed by:

     piles      3 x 3 x 34  each other player's own discards (claimed ones
                            too: they still threw them), in turn order
                            (right, opposite, left), split by when: their
                            last 3, the 3 before, and earlier (copies / 2)
     afterClaim 3 x 34      the tile each other player threw right after
                            each of their claims: what they no longer needed
     shantenAfter 34        for each tile kind held, on its own turn: how far
                            from ready the hand is after discarding it,
                            1 - (shanten + 1) / 8 (higher is closer)
     wavesAfter 34          for each discard that leaves the hand ready: the
                            live copies of the tiles that would complete it
                            (copies this seat hasn't seen, / 16)
     now         2          shanten of the hand as it is, and its live waits
                            when ready (claims read these)

   Shanten and waits are the engine's rules of the game (E.shanten,
   E.winningTiles), not a bot's opinion: nothing from js/mahjong-bot.js.
   Every count of what's live is of tiles this seat hasn't seen, so the wall
   and the other hands never enter (js/mahjong-fair-play.test.js).

   The network is Lucky Cat's: the same MLP, the same 74 outputs, read by
   its forward pass (N.createModel with this size). The game doesn't load
   this file yet: a frontier model plays in the lab until it earns a place. */

(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var E = node ? require("./mahjong-engine.js") : root.MahjongEngine;
  var N = node ? require("./mahjong-lucky-cat-net.js") : root.MahjongLuckyCatNet;

  var FEATURE_VERSION = 2;
  var EXTRA_LAYOUT = [
    ["piles", 3 * 3 * 34],
    ["afterClaim", 3 * 34],
    ["shantenAfter", 34],
    ["wavesAfter", 34],
    ["now", 2],
  ];
  var GROUPS = {};
  var SIZE = N.SIZE;
  EXTRA_LAYOUT.forEach(function (p) { GROUPS[p[0]] = { start: SIZE, end: SIZE + p[1] }; SIZE += p[1]; });

  function liveWaits(c, declared, unseen) {
    var n = 0;
    E.winningTiles(c, declared).forEach(function (t) { n += unseen[t]; });
    return Math.min(1, n / 16);
  }

  // The extra features, written into x (whose first N.SIZE are Lucky Cat's).
  function extend(x, game, seat, view, offer) {
    view = view || {};
    var h = game.hand;
    var me = h.seats[seat];
    var hand = view.hand || me.hand;
    var melds = view.melds || me.melds;
    var out = new Float32Array(SIZE);
    out.set(x.subarray ? x.subarray(0, N.SIZE) : x.slice(0, N.SIZE));
    var r, i;
    for (r = 1; r <= 3; r++) {
      var s = h.seats[(seat + r) % 4];
      var len = s.discards.length;
      s.discards.forEach(function (d, idx) {
        var back = len - 1 - idx;
        var bucket = back < 3 ? 0 : back < 6 ? 1 : 2;
        var at = GROUPS.piles.start + ((r - 1) * 3 + bucket) * 34 + E.tileIndex(d.tile);
        out[at] = Math.min(1, out[at] + 0.5);
      });
      s.melds.forEach(function (m) {
        if (m.concealed || m.at == null || m.at >= len) return;
        out[GROUPS.afterClaim.start + (r - 1) * 34 + E.tileIndex(s.discards[m.at].tile)] = 1;
      });
    }
    // Copies this seat hasn't seen: Lucky Cat's own `unseen` group, * 4.
    var unseen = new Array(34);
    var ug = N.GROUPS.unseen.start;
    for (i = 0; i < 34; i++) unseen[i] = Math.round(x[ug + i] * 4);
    var c = E.countsOf(hand.filter(function (t) { return !E.isBonus(t); }));
    var declared = melds.length;
    var held = c.reduce(function (a, b) { return a + b; }, 0);
    if (held % 3 === 2) {
      // Own turn: each discard's shanten and live waits after it.
      for (i = 0; i < 34; i++) {
        if (!c[i]) continue;
        c[i]--;
        var sh = E.shanten(c, declared);
        out[GROUPS.shantenAfter.start + i] = Math.max(0, 1 - (sh + 1) / 8);
        if (sh === 0) out[GROUPS.wavesAfter.start + i] = liveWaits(c, declared, unseen);
        c[i]++;
      }
    } else {
      var now = E.shanten(c, declared);
      out[GROUPS.now.start] = Math.max(0, 1 - (now + 1) / 8);
      if (now === 0) out[GROUPS.now.start + 1] = liveWaits(c, declared, unseen);
    }
    return out;
  }

  function encode(game, seat, view, offer) {
    return extend(N.encode(game, seat, view, offer), game, seat, view, offer);
  }

  var EXPECT = { size: SIZE, version: FEATURE_VERSION };
  function createModel(weights) { return N.createModel(weights, EXPECT); }

  function zeroWeights(hidden) {
    var w = N.zeroWeights(hidden);
    var first = w.layers[0];
    first.cols = SIZE;
    first.w = new Float32Array(first.rows * SIZE);
    w.featureVersion = FEATURE_VERSION;
    w.featureSize = SIZE;
    return w;
  }

  // A Lucky Cat model (version 1) as a v2 model that plays exactly as it
  // did: the new inputs' columns start at zero. How the Lucky Cat lineage
  // starts phase 1 from lc32. Weights must be plain arrays or Float32Arrays.
  function widen(w1) {
    if (w1.featureVersion !== N.FEATURE_VERSION) throw new Error("widen takes a version " + N.FEATURE_VERSION + " model");
    N.createModel(w1); // refuses anything that isn't a Lucky Cat model
    var dtype = w1.dtype;
    var layers = w1.layers.map(function (l, k) {
      var w = N.floats ? N.floats(l.w, dtype) : l.w, b = N.floats ? N.floats(l.b, dtype) : l.b;
      if (k) return { rows: l.rows, cols: l.cols, w: Array.from(w), b: Array.from(b) };
      var out = new Array(l.rows * SIZE).fill(0);
      for (var r = 0; r < l.rows; r++) for (var c = 0; c < l.cols; c++) out[r * SIZE + c] = w[r * l.cols + c];
      return { rows: l.rows, cols: SIZE, w: out, b: Array.from(b) };
    });
    var meta = Object.assign({}, w1.meta || {}, { widenedFrom: (w1.meta || {}).name || null });
    return { featureVersion: FEATURE_VERSION, featureSize: SIZE, layers: layers, meta: meta };
  }

  // For lucky-cat-ml's training hook: Lucky Cat's features in, v2 out.
  function features(game, seat, x) { var v = extend(x, game, seat); return { x: v, record: v }; }

  var api = {
    FEATURE_VERSION: FEATURE_VERSION,
    SIZE: SIZE,
    BASE: N.SIZE,
    GROUPS: GROUPS,
    EXTRA_LAYOUT: EXTRA_LAYOUT,
    encode: encode,
    extend: extend,
    features: features,
    createModel: createModel,
    zeroWeights: zeroWeights,
    widen: widen,
  };

  if (node) module.exports = api;
  else root.MahjongFrontierNet = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
