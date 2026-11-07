/* Lucky Cat: a neural network that plays every move itself, with no rules
   underneath. It is not built on the shared foundation in js/mahjong-bot.js
   (no steps-from-ready, plans, threat reads or claim rules): the network in
   js/mahjong-lucky-cat-net.js reads the tiles its seat can see and gives
   each legal move a share, and the move with the biggest share is played.

   It learned that from scratch. The first model played at random. Over
   millions of simulated hands (scripts/ml/lucky-generate.js and
   ml/train_lucky.py) every hand it won taught it: the discards, chows,
   pungs, kongs and passes that led to the win were made more likely, the
   quicker the win the more so. Hands it didn't win teach it nothing, so it
   plays to win as many hands as it can, as fast as it can; the size of the
   win counts for only a little.

   A win (3 faan or more) is always declared. Everything else, the network
   decides.

   create({ model, weights, temperature, rng, fast, onDecision })
     temperature  0 plays the biggest share; 1 plays each move with its
                  share (training); between sharpens the shares
     fast         decisions only (simulations): decideClaim and
                  analyzeDiscards skip the coach's reads
     onDecision   called with { seat, features, moves, pick } for every
                  move the network makes (training data)
   Until trained weights ship in js/mahjong-lucky-cat-weights.js, the
   Strategies sheet plays the classic Lucky Cat rules (js/mahjong-lucky-cat.js).

   The coach's words (plans, waits, threats) come from the classic rules'
   reads of the hand, and say which move the network picks and its share. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var L = node ? require('./mahjong-lucky-cat.js') : root.MahjongLuckyCat;
  var N = node ? require('./mahjong-lucky-cat-net.js') : root.MahjongLuckyCatNet;

  function shippedWeights() {
    if (!node) return root.MahjongLuckyCatWeights || null;
    try { return require('./mahjong-lucky-cat-weights.js'); } catch (err) { return null; }
  }

  function trainedModel() {
    var w = shippedWeights();
    try { if (w) return N.createModel(w); } catch (err) { /* weights for other features */ }
    return null;
  }

  function create(options) {
    options = options || {};
    // Built on first use: on the Play page the weights load after this
    // script, when a game starts (js/mahjong-game.js loadAssets).
    var chosen = options.model || (options.weights ? N.createModel(options.weights) : null);
    function getModel() { return chosen || (chosen = trainedModel() || N.createModel(N.zeroWeights())); }
    var temperature = options.temperature || 0;
    var rng = options.rng || Math.random;
    var fast = !!options.fast;

    // The coach's helpers (buildContext and the rest) come from the
    // classic rules; every decision below is the network's.
    var bot = Object.create(L);
    bot.id = 'lucky-cat';
    Object.defineProperty(bot, 'model', { get: getModel, enumerable: true });
    bot.learned = true;
    bot.onDecision = options.onDecision || null;

    function pick(moves) {
      if (temperature) {
        var w = moves.map(function (m) { return Math.pow(m.p, 1 / temperature); });
        var r = rng() * w.reduce(function (a, v) { return a + v; }, 0);
        for (var k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
        return w.length - 1;
      }
      var top = 0;
      moves.forEach(function (m, k) { if (m.p > moves[top].p) top = k; });
      return top;
    }

    function decide(game, seat, x, moves) {
      getModel().policy(x, moves);
      var k = pick(moves);
      if (bot.onDecision) bot.onDecision({ seat: seat, features: x, moves: moves, pick: k });
      return k;
    }

    function share(m) { return { policy: m.p, ev: m.p, choice: true }; }

    /* Own turn ------------------------------------------------------- */

    function turnRead(game, seat, opts) {
      var moves = N.turnMoves(game.hand.seats[seat].hand, opts.kongs);
      var k = decide(game, seat, N.encode(game, seat), moves);
      return { moves: moves, k: k };
    }

    // Each kong offered against the best discard, for the coach.
    bot.kongChoice = function (game, seat, opts) {
      if (opts.win) return { decision: { type: 'win' }, choices: null };
      var r = turnRead(game, seat, opts);
      var decision = r.moves[r.k].decision;
      if (!opts.kongs || !opts.kongs.length) return { decision: decision, choices: null };
      var discards = r.moves.filter(function (m) { return m.decision.type === 'discard'; });
      var bestDiscard = discards.reduce(function (a, m) { return m.p > a.p ? m : a; }, discards[0]);
      var list = [bestDiscard].concat(r.moves.filter(function (m) { return m.decision.type === 'kong'; }));
      var choices = list.map(function (m) { return { decision: m.decision, kind: m.kind, ml: share(m) }; });
      var at = Math.max(0, list.indexOf(r.moves[r.k]));
      return { decision: decision, choices: choices, pick: at, foundation: at };
    };

    bot.chooseTurnAction = function (game, seat, opts) {
      if (opts.win) return { type: 'win' };
      var r = turnRead(game, seat, opts);
      return r.moves[r.k].decision;
    };

    /* Claims --------------------------------------------------------- */

    function claimRead(game, seat, opts) {
      var moves = N.claimMoves(opts);
      var k = decide(game, seat, N.encode(game, seat, null, opts), moves);
      return { moves: moves, k: k };
    }

    bot.chooseClaim = function (game, seat, opts) {
      if (opts.win) return { type: 'win' };
      if (!opts.pung && !opts.kong && !(opts.chows || []).length) return { type: 'pass' };
      var r = claimRead(game, seat, opts);
      return r.moves[r.k].decision;
    };

    // The network's claim, with the classic rules' read of each option for
    // the coach's words (found.ml: each choice and its share).
    bot.decideClaim = function (game, seat, opts) {
      if (opts.win) return { decision: { type: 'win' }, found: null };
      if (!opts.pung && !opts.kong && !(opts.chows || []).length) return { decision: { type: 'pass' }, found: null };
      var r = claimRead(game, seat, opts);
      var found = fast ? { options: [] } : (L.decideClaim(game, seat, opts).found || { options: [] });
      found.ml = {
        choices: r.moves.map(function (m) { return { decision: m.decision, ml: share(m) }; }),
        pick: r.k,
        foundation: r.k,
      };
      return { decision: r.moves[r.k].decision, found: found };
    };

    /* Discards, as the coach reads them ------------------------------ */

    // The classic rules' read of every discard (for the coach's words),
    // in the order of the network's shares.
    bot.analyzeDiscards = function (game, seat, ctx, hand) {
      var res = L.analyzeDiscards(game, seat, ctx, hand);
      var held = hand || game.hand.seats[seat].hand;
      var moves = N.turnMoves(held, []);
      getModel().policy(N.encode(game, seat, { hand: held, melds: ctx ? ctx.melds : null }), moves);
      var byIndex = {};
      moves.forEach(function (m) { byIndex[m.action] = m; });
      res.candidates.forEach(function (x, k) {
        var m = byIndex[x.index];
        x.ml = share(m || { p: 0 });
        x.ml.order = k;
      });
      res.candidates.sort(function (a, b) { return b.ml.policy - a.ml.policy || a.ml.order - b.ml.order; });
      return res;
    };

    bot.createBotAgent = function () {
      return {
        turn: function (game, seat, opts) { return Promise.resolve(bot.chooseTurnAction(game, seat, opts)); },
        claim: function (game, seat, opts) { return Promise.resolve(bot.chooseClaim(game, seat, opts)); },
      };
    };
    return bot;
  }

  // The shipped strategy: the network, with the shipped weights (read when
  // it first plays). `trained` says whether weights ship with the game.
  var api = create();
  api.trained = !!shippedWeights() || !node;
  api.create = create;
  api.classic = L;
  api.Net = N;

  if (node) module.exports = api;
  else root.MahjongLuckyCatML = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
