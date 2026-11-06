/* Neural Cat: the learned strategy. It plays Jorge Yau's hooks on the shared
   foundation (js/mahjong-bot.js), which list the discards in order and read
   each one (steps from ready, live tiles, plan, risk). Then a model trained
   on simulated hands (js/mahjong-ml-model.js) scores the position each of
   the best few leaves, in expected points, and the one worth the most goes.
   Claims and kongs are Jorge Yau's.

   Each candidate gets `ml`: { ev, pWin, pDealIn, avgWin, winFaan, choice,
   ... } (choice: one of the discards the model picks from),
   and the chosen one also `ml.why`: how much each feature group (speed,
   value, safety, table, ...) put it ahead of the next best discard.

   create({ id, base, model, weights, topK, temperature, epsilon, rng })
   builds another copy, e.g. with exploration for training data:
     base         the strategy it builds on (default jorge-yau; null = the
                  shared foundation alone)
     topK         the model picks among the foundation's best topK discards
                  (default 3; 0 = every discard)
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
  var J = node ? require('./mahjong-jorge-yau.js') : root.MahjongJorgeYau;
  var F = node ? require('./mahjong-ml-features.js') : root.MahjongMLFeatures;
  var M = node ? require('./mahjong-ml-model.js') : root.MahjongMLModel;

  // How many of the foundation's best discards the model chooses among
  // (0 = all). The model alone dealt in far too often (docs/strategies/neural-cat.md).
  var TOP_K = 3;

  function shippedWeights() {
    if (!node) return root.MahjongMLWeights || null;
    try { return require('./mahjong-ml-weights.js'); } catch (err) { return null; }
  }

  function defaultModel() {
    var w = shippedWeights();
    // Weights for older features can't be used: random until retrained.
    try { if (w) return M.createModel(w); } catch (err) { /* fall through */ }
    return M.randomModel(1);
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
    var topK = options.topK != null ? options.topK : TOP_K;

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
      var state = F.prepare(game, seat, ctx, threats, bot);
      out.forEach(function (x, k) {
        x.features = F.encode(state, x.index, x.analysis, x.loss);
        x.ml = model.ev(x.features);
        x.ml.order = k; // where the foundation put it
      });
      // The model picks among the foundation's best few; the rest keep its order.
      var k0 = topK > 0 ? Math.min(topK, out.length) : out.length;
      out.forEach(function (x, j) { x.ml.choice = j < k0; }); // among the discards the model picks from
      var ranked = out.slice(0, k0).sort(function (p, q) { return q.ml.ev - p.ml.ev || p.ml.order - q.ml.order; })
        .concat(out.slice(k0));
      var k = pickIndex(ranked);
      if (k) ranked.unshift(ranked.splice(k, 1)[0]);
      ranked[0].ml.why = explain(model, ranked[0], ranked[1]);
      ranked.forEach(function (x, j) { if (j > 1) delete x.features; });
      return ranked;
    }

    // Built on another strategy's hooks and tuning (jorge-yau's by default),
    // so with topK 1 it plays exactly like that strategy.
    var base = options.base === undefined ? J : options.base;
    var hooks = {};
    if (base && base.hooks) Object.keys(base.hooks).forEach(function (k) { hooks[k] = base.hooks[k]; });
    hooks.rerank = rerank;
    var bot = B.createStrategy({ id: options.id || 'neural-cat', hooks: hooks, tuning: base ? base.tuning : undefined });
    bot.base = base ? base.id : 'base';
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
