/* Neural Cat: the learned strategy. The shared foundation (js/mahjong-bot.js)
   lists the discards and reads each one (steps from ready, live tiles, plan,
   risk), then a model trained on simulated hands (js/mahjong-ml-model.js)
   scores the position each discard leaves in expected points, and the
   discard worth the most goes. Claims and kongs follow the foundation.

   Each candidate gets `ml`: { ev, pWin, pDealIn, avgWin, winFaan, ... },
   and the chosen one also `ml.why`: how much each feature group (speed,
   value, safety, table, ...) put it ahead of the next best discard.

   create({ id, model, weights, temperature, epsilon, rng }) builds another
   copy, e.g. with exploration for training data:
     temperature  pick among discards with odds exp(ev / temperature),
                  in points (0 = always the best)
     epsilon      the chance of a random discard among those that don't
                  cost a step toward ready
   Until trained weights ship in js/mahjong-ml-weights.js, the model is
   random and this strategy isn't offered at the table. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var F = node ? require('./mahjong-ml-features.js') : root.MahjongMLFeatures;
  var M = node ? require('./mahjong-ml-model.js') : root.MahjongMLModel;

  function shippedWeights() {
    if (!node) return root.MahjongMLWeights || null;
    try { return require('./mahjong-ml-weights.js'); } catch (err) { return null; }
  }

  function defaultModel() {
    var w = shippedWeights();
    return w ? M.createModel(w) : M.randomModel(1);
  }

  // How much each feature group puts `a` ahead of `b`: the drop in a's
  // value when that group's features are swapped for b's.
  function explain(model, a, b) {
    if (!a || !b || !a.features || !b.features) return [];
    var base = a.ml.ev;
    return Object.keys(F.GROUPS).map(function (name) {
      var g = F.GROUPS[name];
      var x = a.features.slice();
      for (var i = g.start; i < g.end; i++) x[i] = b.features[i];
      return { group: name, points: base - model.ev(x).ev };
    }).sort(function (p, q) { return Math.abs(q.points) - Math.abs(p.points); });
  }

  function create(options) {
    options = options || {};
    var model = options.model || (options.weights ? M.createModel(options.weights) : defaultModel());
    var temperature = options.temperature || 0;
    var epsilon = options.epsilon || 0;
    var rng = options.rng || Math.random;

    function pickIndex(ranked) {
      if (epsilon && rng() < epsilon) {
        var best = Math.min.apply(null, ranked.map(function (x) { return x.shanten; }));
        var pool = ranked.filter(function (x) { return x.shanten <= best; });
        return ranked.indexOf(pool[Math.floor(rng() * pool.length)]);
      }
      if (!temperature) return 0;
      var top = ranked[0].ml.ev;
      var w = ranked.map(function (x) { return Math.exp((x.ml.ev - top) / temperature); });
      var r = rng() * w.reduce(function (s, v) { return s + v; }, 0);
      for (var k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
      return 0;
    }

    function rerank(out, ctx, counts, game, seat, threats) {
      var state = F.prepare(game, seat, ctx, threats);
      out.forEach(function (x, k) {
        x.features = F.encode(state, x.index, x.analysis, x.loss);
        x.ml = model.ev(x.features);
        x.ml.order = k; // where the foundation put it
      });
      var ranked = out.slice().sort(function (p, q) { return q.ml.ev - p.ml.ev || p.ml.order - q.ml.order; });
      var k = pickIndex(ranked);
      if (k) ranked.unshift(ranked.splice(k, 1)[0]);
      ranked[0].ml.why = explain(model, ranked[0], ranked[1]);
      ranked.forEach(function (x, j) { if (j > 1) delete x.features; });
      return ranked;
    }

    var bot = B.createStrategy({ id: options.id || 'neural-cat', hooks: { rerank: rerank } });
    bot.model = model;
    bot.explain = function (a, b) { return explain(model, a, b); };
    return bot;
  }

  var api = create();
  api.create = create;
  api.explain = explain;

  if (node) module.exports = api;
  else root.MahjongML = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
