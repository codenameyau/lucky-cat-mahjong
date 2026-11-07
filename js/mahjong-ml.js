/* Neural Cat: the learned strategy. It plays Jorge Yau's hooks on the shared
   foundation (js/mahjong-bot.js), which list the discards in order and read
   each one (steps from ready, live tiles, plan, risk). Then a model trained
   on simulated hands (js/mahjong-ml-model.js) scores the position each of
   the best few leaves, in expected points, and the one worth the most goes.
   Claims and kongs are weighed the same way: the position each choice
   leaves (passing, each call and its best discard, a kong before its
   replacement tile) is scored in expected points, and the model overrules
   Jorge Yau's call when its pick is worth CLAIM_MARGIN points more.

   Each candidate gets `ml`: { ev, pWin, pDealIn, avgWin, winFaan, choice,
   ... } (choice: one of the discards the model picks from; best: the most
   any of those is worth), and the chosen one also `ml.why`: how much each
   feature group (speed, value, safety, table, ...) put it ahead of the next
   best discard.

   decideClaim(...).found.ml and kongChoice(game, seat, opts).choices list
   each choice with its `ml` read, `pick` (the model's) and `foundation`
   (Jorge Yau's).

   create({ id, base, model, weights, topK, temperature, epsilon, rng,
            claims, claimMargin, winBonus, fast })
   builds another copy, e.g. with exploration for training data:
     base         the strategy it builds on (default jorge-yau; null = the
                  shared foundation alone)
     topK         the model picks among the foundation's best topK discards
                  (default 3; 0 = every discard)
     temperature  pick among discards with odds exp(ev / temperature),
                  in points (0 = always the best)
     epsilon      the chance of a random discard among those that don't
                  cost a step toward ready (or a random claim choice)
     claims       false leaves claims and kongs to the base strategy
     fast         read only the discards it picks from, and skip `why`
                  (the same choices, for simulations)
     winBonus     points added for each 100% of win chance when choosing
                  (default 0): above 0 it leans toward winning more often,
                  at some cost in points. Shown values stay expected points.
     claimMargin  points the model's claim or kong choice must beat the
                  base strategy's by (default CLAIM_MARGIN)
   Until trained weights ship in js/mahjong-ml-weights.js, the model is
   random and this strategy isn't offered at the table. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var J = node ? require('./mahjong-jorge-yau.js') : root.MahjongJorgeYau;
  var F = node ? require('./mahjong-ml-features.js') : root.MahjongMLFeatures;
  var M = node ? require('./mahjong-ml-model.js') : root.MahjongMLModel;

  // How many of the foundation's best discards the model chooses among
  // (0 = all). The model alone dealt in far too often (docs/strategies/neural-cat.md).
  var TOP_K = 3;
  // Points the model's claim or kong must be worth over the base strategy's
  // choice before it overrules it.
  var CLAIM_MARGIN = 0;

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

  function lastThrown(game, seat, fallback) {
    var d = game.hand.seats[seat].discards;
    return d.length ? E.tileIndex(d[d.length - 1].tile) : fallback;
  }

  function copyCtx(ctx) {
    var next = {};
    Object.keys(ctx).forEach(function (k) { next[k] = ctx[k]; });
    next.mlSynced = false;
    return next;
  }

  // The features of a position waiting for a tile, as `bot` reads it:
  //   'pass'      passing the tile on offer
  //   'kong'      an exposed kong of the tile on offer
  //   'concealed' a concealed kong of `tile`, from the hand
  //   'added'     adding `tile` to a pung
  // A kong is read before its replacement tile is drawn. The same function
  // builds training data (scripts/ml/generate.js).
  function waitingFeatures(bot, game, seat, kind, tile) {
    var ctx = bot.buildContext(game, seat);
    var c = E.countsOf(game.hand.seats[seat].hand);
    var i = E.tileIndex(tile);
    var four = [tile, tile, tile, tile];
    if (kind === 'kong') {
      c[i] -= 3;
      ctx = bot.withMeld(ctx, { type: 'kong', tiles: four, concealed: false });
    } else if (kind === 'concealed') {
      c[i] -= 4;
      ctx = bot.withMeld(ctx, { type: 'kong', tiles: four, concealed: true });
    } else if (kind === 'added') {
      c[i] -= 1;
      ctx = copyCtx(ctx);
      ctx.melds = ctx.melds.map(function (m) {
        return m.type === 'pung' && E.tileIndex(m.tiles[0]) === i ? { type: 'kong', tiles: four, concealed: false } : m;
      });
    }
    ctx.mlSynced = false;
    var state = F.prepare(game, seat, ctx, null, bot, c);
    return F.encodeWaiting(state, lastThrown(game, seat, i), 0);
  }

  function create(options) {
    options = options || {};
    // The shipped weights are a large file the Play page loads after its
    // scripts, so the default model is built on first use, not here.
    var chosen = options.model || (options.weights ? M.createModel(options.weights) : null);
    function getModel() { return chosen || (chosen = defaultModel()); }
    var temperature = options.temperature || 0;
    var epsilon = options.epsilon || 0;
    var rng = options.rng || Math.random;
    // Play settings: an option, else the model's own (meta.play, set by
    // the lab when it trains or tunes a model), else the defaults.
    function setting(name, dflt) {
      if (options[name] != null) return options[name];
      var play = getModel().meta && getModel().meta.play;
      return play && play[name] != null ? play[name] : dflt;
    }
    // What a choice is worth when choosing: its expected points, plus the
    // win bonus for its chance to win.
    function value(ml) { return ml.ev + setting('winBonus', 0) * ml.pWin; }
    var claims = options.claims !== false;
    var fast = !!options.fast;

    // Exploring: a random discard that costs no step (epsilon), or one of
    // the discards the model picks from, by value (temperature).
    function pickIndex(ranked, k0) {
      if (epsilon && rng() < epsilon) {
        var best = Math.min.apply(null, ranked.map(function (x) { return x.shanten; }));
        var pool = ranked.filter(function (x) { return x.shanten <= best; });
        return ranked.indexOf(pool[Math.floor(rng() * pool.length)]);
      }
      if (!temperature) return 0;
      var top = value(ranked[0].ml);
      var w = ranked.slice(0, k0).map(function (x) { return Math.exp((value(x.ml) - top) / temperature); });
      var r = rng() * w.reduce(function (s, v) { return s + v; }, 0);
      for (var k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
      return 0;
    }

    function rerank(out, ctx, counts, game, seat, threats, folding) {
      var state = F.prepare(game, seat, ctx, threats, bot, counts);
      // The model picks among the foundation's best few; the rest keep its order.
      var topK = setting('topK', TOP_K);
      var k0 = topK > 0 ? Math.min(topK, out.length) : out.length;
      out.forEach(function (x, k) {
        if (fast && k >= k0) return; // only the ones it picks from
        x.features = F.encode(state, x.index, x.analysis, x.loss);
        x.ml = getModel().ev(x.features);
        x.ml.order = k; // where the foundation put it
      });
      out.forEach(function (x, j) { if (x.ml) x.ml.choice = j < k0; }); // among the discards the model picks from
      var ranked = out.slice(0, k0).sort(function (p, q) { return value(q.ml) - value(p.ml) || p.ml.order - q.ml.order; })
        .concat(out.slice(k0));
      // Between tied honors the shared order still decides (honorTieOrder):
      // the model weighs everything else.
      if (bot.tuning.honorOrder && !folding) ranked = B.honorTieOrder(ranked, ctx, counts);
      var k = pickIndex(ranked, k0);
      if (k) ranked.unshift(ranked.splice(k, 1)[0]);
      if (!ranked[0].ml) { // a random discard the fast mode didn't read
        ranked[0].features = F.encode(state, ranked[0].index, ranked[0].analysis, ranked[0].loss);
        ranked[0].ml = getModel().ev(ranked[0].features);
        ranked[0].ml.order = out.indexOf(ranked[0]);
        ranked[0].ml.choice = false;
      }
      ranked[0].ml.why = fast ? [] : explain(getModel(), ranked[0], ranked[1]);
      ranked[0].ml.best = Math.max.apply(null, out.slice(0, k0).map(function (x) { return x.ml.ev; }));
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

    function read(x) {
      var ml = getModel().ev(x);
      ml.features = x;
      return ml;
    }

    // Picks among choices ({ ml }) the one worth the most, unless it beats
    // the base strategy's choice (index `at`) by less than claimMargin.
    function pickChoice(choices, at) {
      if (epsilon && rng() < epsilon) return Math.floor(rng() * choices.length);
      if (temperature) {
        var w = choices.map(function (x) { return Math.exp((value(x.ml) - value(choices[at].ml)) / temperature); });
        var r = rng() * w.reduce(function (a, v) { return a + v; }, 0);
        for (var k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
        return at;
      }
      var top = 0;
      choices.forEach(function (x, k) { if (value(x.ml) > value(choices[top].ml)) top = k; });
      return value(choices[top].ml) > value(choices[at].ml) + setting('claimMargin', CLAIM_MARGIN) ? top : at;
    }

    function sameDecision(a, b) {
      return a.type === b.type && (a.type !== 'chow' || a.tiles.join() === b.tiles.join()) &&
        (!a.tile || !b.tile || a.tile === b.tile);
    }

    function finish(choices, at, k) {
      choices.forEach(function (x) { delete x.ml.features; });
      return { choices: choices, pick: k, foundation: at };
    }

    // Claims: pass, or each call and the best discard after it.
    var baseDecide = bot.decideClaim;
    bot.decideClaim = function (game, seat, opts) {
      var d = baseDecide(game, seat, opts);
      var found = d.found;
      if (!claims || !found || !found.options.length || d.decision.type === 'win') return d;
      var choices = [{ decision: { type: 'pass' }, ml: read(waitingFeatures(bot, game, seat, 'pass', opts.tile)) }];
      found.options.forEach(function (o) {
        var ml = o.decision.type === 'kong' ? read(waitingFeatures(bot, game, seat, 'kong', opts.tile)) : o.ml;
        if (!ml) return;
        if (ml.best != null) ml = Object.assign({}, ml, { ev: ml.best });
        choices.push({ decision: o.decision, discard: o.discard, ml: ml });
      });
      var at = 0;
      choices.forEach(function (x, k) { if (sameDecision(x.decision, d.decision)) at = k; });
      var k = pickChoice(choices, at);
      found.ml = finish(choices, at, k);
      return { decision: choices[k].decision, found: found };
    };
    bot.chooseClaim = function (game, seat, opts) { return bot.decideClaim(game, seat, opts).decision; };

    // Kongs on your own turn: each kong, or the best discard.
    var baseTurn = bot.chooseTurnAction;
    bot.kongChoice = function (game, seat, opts) {
      var d = baseTurn(game, seat, opts);
      if (!claims || opts.win || !opts.kongs || !opts.kongs.length) return { decision: d, choices: null };
      var keep = bot.analyzeDiscards(game, seat).candidates[0];
      var discard = d.type === 'discard' ? d : { type: 'discard', tile: keep.tile };
      var choices = [{ decision: discard, ml: Object.assign({}, keep.ml, { ev: keep.ml.best != null ? keep.ml.best : keep.ml.ev }) }];
      opts.kongs.forEach(function (kong) {
        choices.push({ decision: { type: 'kong', tile: kong.tile }, kind: kong.kind, ml: read(waitingFeatures(bot, game, seat, kong.kind, kong.tile)) });
      });
      var at = 0;
      choices.forEach(function (x, k) { if (sameDecision(x.decision, d)) at = k; });
      var k = pickChoice(choices, at);
      var out = finish(choices, at, k);
      out.decision = choices[k].decision;
      return out;
    };
    bot.chooseTurnAction = function (game, seat, opts) { return bot.kongChoice(game, seat, opts).decision; };
    // (createBotAgent plays these: it calls bot.chooseTurnAction and bot.chooseClaim.)
    Object.defineProperty(bot, 'model', { get: getModel, enumerable: true });
    bot.explain = function (a, b) { return explain(getModel(), a, b); };
    return bot;
  }

  var api = create();
  api.create = create;
  api.explain = explain;
  api.waitingFeatures = waitingFeatures;
  api.CLAIM_MARGIN = CLAIM_MARGIN;

  if (node) module.exports = api;
  else root.MahjongML = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
