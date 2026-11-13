/* Lucky Cat: a neural network that plays every move itself, with no rules
   underneath. It is not built on the shared foundation in js/mahjong-bot.js
   (no steps-from-ready, plans, threat reads or claim rules): the network in
   js/mahjong-lucky-cat-net.js reads the tiles its seat can see and gives
   each legal move a share, and the move with the biggest share is played.

   It learned that from scratch. The first model played at random. Over a
   million simulated hands (scripts/ml/lucky.js and ml/train_lucky.py)
   every hand it won taught it: the moves that led to the win were made
   more likely, the quicker the win the more so (LC20: fast, cheap wins).
   Since LC21 the lab (scripts/ml/lab.js --strategy lucky-cat) trains it on
   points first and wins second: every hand it plays, won or lost, teaches
   it by the points the hand paid it, so moves from hands that scored
   better than usual get more likely and moves from hands that cost it
   less.

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
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var E = node ? require("./mahjong-engine.js") : root.MahjongEngine;
  var Base = node ? require("./mahjong-bot.js") : root.MahjongBot;
  var L = node ? require("./mahjong-lucky-cat.js") : root.MahjongLuckyCat;
  // The shared foundation (as Jorge Yau and Neural Cat play it): the plan each move builds
  // toward, for the contradiction check and the coach's words. The native simulator has it too.
  var J = node ? require("./mahjong-jorge-yau.js") : root.MahjongJorgeYau;
  var N = node ? require("./mahjong-lucky-cat-net.js") : root.MahjongLuckyCatNet;
  // The value (the stacked evaluation, self-taught): js/mahjong-lucky-cat-value.js.
  var V = node ? require("./mahjong-lucky-cat-value.js") : root.MahjongLuckyCatValue;

  function shippedWeights() {
    if (!node) return root.MahjongLuckyCatWeights || null;
    try { return require("./mahjong-lucky-cat-weights.js"); } catch (err) { return null; }
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
    // options.net: another encoder over the same network, such as features v2
    // (js/mahjong-frontier-net.js): { encode, createModel }. Lucky Cat's own by default.
    var net = options.net || N;
    var chosen = options.model || (options.weights ? net.createModel(options.weights) : null);
    function getModel() { return chosen || (chosen = trainedModel() || N.createModel(N.zeroWeights())); }
    // The value model: options.value, else the value in the weights (weights.value).
    // Null: the policy alone picks, as before.
    var valueWeights = options.value !== undefined ? options.value : null;
    var valueModel;
    function getValue() {
      if (valueModel !== undefined) return valueModel;
      var w = valueWeights;
      if (w === null && options.value === undefined) {
        var src = options.weights || (options.model ? null : shippedWeights());
        w = src && src.value ? src.value : null;
      }
      valueModel = w && V ? V.createModel(w) : null;
      return valueModel;
    }
    var temperature = options.temperature || 0;
    var epsilon = options.epsilon || 0;
    var rng = options.rng || Math.random;
    var fast = !!options.fast;

    // The coach's helpers (buildContext and the rest) come from the shared
    // foundation; every decision below is the network's, checked against
    // the plan the foundation reads for it (the contradiction check).
    var bot = Object.create(J);
    bot.id = "lucky-cat";
    Object.defineProperty(bot, "model", { get: getModel, enumerable: true });
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

    // Training only (scripts/ml/oracle.js): options.features(game, seat, x)
    // returns { x, record }: the features the model reads (the seat's view
    // plus the hidden tiles, some dropped out) and the ones recorded. The
    // game never sets it, so play sees only the seat's view.
    var features = options.features || null;

    // `check(k)` is the contradiction check: the move it settles on is the one
    // played, and the one training records.
    function decide(game, seat, x, moves, check) {
      var f = features ? features(game, seat, x) : null;
      getModel().policy(f ? f.x : x, moves);
      var k = pick(moves);
      if (check) k = check(k);
      if (bot.onDecision) bot.onDecision({ seat: seat, features: f ? f.record : x, moves: moves, pick: k });
      return k;
    }

    // With a value: the policy's best few moves (play.topK) by share, each scored by
    // the value of the position it leaves plus the win bonus; then the rest by share.
    // The first in that order the check lets through is played. score(m): its value.
    function valueDecide(game, seat, x, moves, score, ok, all) {
      var vm = getValue();
      var play = (vm.meta && vm.meta.play) || {};
      var K = all ? moves.length : play.topK || 4, bonus = play.winBonus != null ? play.winBonus : 300;
      var f = features ? features(game, seat, x) : null;
      getModel().policy(f ? f.x : x, moves);
      var byShare = moves.map(function (m, j) { return j; }).sort(function (a, b) { return moves[b].p - moves[a].p || a - b; });
      var top = byShare.slice(0, K);
      top.forEach(function (j) {
        var r = score(moves[j], vm);
        moves[j].value = r.ev + bonus * r.pWin;
        moves[j].ev = r;
      });
      var ranked = top.slice().sort(function (a, b) { return moves[b].value - moves[a].value || byShare.indexOf(a) - byShare.indexOf(b); });
      // Exploring (training data): now and then one of the best few at random.
      if (epsilon && rng() < epsilon) {
        var r0 = Math.floor(rng() * ranked.length);
        ranked.unshift(ranked.splice(r0, 1)[0]);
      }
      var order = ranked.concat(byShare.slice(K));
      var k = order[order.length - 1];
      for (var n = 0; n < order.length; n++) if (!ok || ok(moves[order[n]])) { k = order[n]; break; }
      if (bot.onDecision) bot.onDecision({ seat: seat, features: f ? f.record : x, moves: moves, pick: k });
      return k;
    }

    // A move's value: the position it leaves (a call: the best of the policy's top
    // discards after it).
    function turnScore(game, seat) {
      return function (m, vm) { return vm.ev(V.features(game, seat, V.afterTurn(game, seat, m.decision))); };
    }
    function claimScore(game, seat, opts) {
      return function (m, vm) {
        var after = V.afterCall(game, seat, opts, m.decision);
        if (m.decision.type !== "pung" && m.decision.type !== "chow") return vm.ev(V.features(game, seat, after));
        var play = (vm.meta && vm.meta.play) || {};
        var discards = N.turnMoves(after.hand, []);
        getModel().policy(N.encode(game, seat, { hand: after.hand, melds: after.melds }), discards);
        discards.sort(function (a, b) { return b.p - a.p || a.action - b.action; });
        var best = null, bonus = play.winBonus != null ? play.winBonus : 300;
        discards.slice(0, play.topK || 4).forEach(function (d) {
          var i = d.action;
          var hand = after.hand.slice();
          for (var j = hand.length - 1; j >= 0; j--) if (E.tileIndex(hand[j]) === i) { hand.splice(j, 1); break; }
          var r = vm.ev(V.features(game, seat, { hand: hand, melds: after.melds, thrown: i, kind: 0 }));
          if (!best || r.ev + bonus * r.pWin > best.ev + bonus * best.pWin) best = r;
        });
        return best;
      };
    }

    // The network's pick first, then its other moves by share; the first that
    // doesn't contradict the hand it builds toward, or the last if all do.
    function firstConsistent(moves, k, ok) {
      var order = moves.map(function (m, j) { return j; })
        .sort(function (a, b) { return moves[b].p - moves[a].p || a - b; })
        .filter(function (j) { return j !== k; });
      order.unshift(k);
      for (var n = 0; n < order.length; n++) if (ok(moves[order[n]])) return order[n];
      return order[order.length - 1];
    }

    function turnCheck(game, seat) {
      return function (k) {
        var res = J.analyzeDiscards(game, seat);
        var counts = E.countsOf(game.hand.seats[seat].hand);
        var byTile = {};
        res.candidates.forEach(function (x) { byTile[x.tile] = x; });
        return firstConsistent(this.moves, k, function (m) {
          if (m.decision.type === "kong") return !Base.kongContradicts(res.ctx.leadPlan, m.decision.tile);
          if (m.decision.type !== "discard" || res.folding) return true;
          var x = byTile[m.decision.tile];
          return !x || !Base.contradicts(game, counts, x);
        });
      };
    }

    function share(m) { return { policy: m.p, ev: m.p, choice: true }; }

    /* Own turn ------------------------------------------------------- */

    function turnRead(game, seat, opts) {
      var moves = N.turnMoves(game.hand.seats[seat].hand, opts.kongs);
      if (getValue()) {
        var res = J.analyzeDiscards(game, seat), counts = E.countsOf(game.hand.seats[seat].hand), byTile = {};
        res.candidates.forEach(function (c) { byTile[c.tile] = c; });
        var ok = function (m) {
          if (m.decision.type === "kong") return !Base.kongContradicts(res.ctx.leadPlan, m.decision.tile);
          if (m.decision.type !== "discard" || res.folding) return true;
          var c = byTile[m.decision.tile];
          return !c || !Base.contradicts(game, counts, c);
        };
        return { moves: moves, k: valueDecide(game, seat, net.encode(game, seat), moves, turnScore(game, seat), ok, false) };
      }
      var k = decide(game, seat, net.encode(game, seat), moves, turnCheck(game, seat).bind({ moves: moves }));
      return { moves: moves, k: k };
    }

    // Each kong offered against the best discard, for the coach.
    bot.kongChoice = function (game, seat, opts) {
      if (opts.win) return { decision: { type: "win" }, choices: null };
      var r = turnRead(game, seat, opts);
      var decision = r.moves[r.k].decision;
      if (!opts.kongs || !opts.kongs.length) return { decision: decision, choices: null };
      var discards = r.moves.filter(function (m) { return m.decision.type === "discard"; });
      var bestDiscard = discards.reduce(function (a, m) { return m.p > a.p ? m : a; }, discards[0]);
      var list = [bestDiscard].concat(r.moves.filter(function (m) { return m.decision.type === "kong"; }));
      var choices = list.map(function (m) { return { decision: m.decision, kind: m.kind, ml: share(m) }; });
      var at = Math.max(0, list.indexOf(r.moves[r.k]));
      return { decision: decision, choices: choices, pick: at, foundation: at };
    };

    bot.chooseTurnAction = function (game, seat, opts) {
      if (opts.win) return { type: "win" };
      var r = turnRead(game, seat, opts);
      return r.moves[r.k].decision;
    };

    /* Claims --------------------------------------------------------- */

    function claimRead(game, seat, opts) {
      var moves = N.claimMoves(opts);
      var found = J.decideClaim(game, seat, opts).found || { options: [] };
      if (getValue()) {
        var k1 = valueDecide(game, seat, net.encode(game, seat, null, opts), moves, claimScore(game, seat, opts),
          function (m) { return J.claimConsistent(game, seat, opts, found, m.decision); }, true);
        return { moves: moves, k: k1, found: found };
      }
      var k = decide(game, seat, net.encode(game, seat, null, opts), moves, function (k0) {
        return firstConsistent(moves, k0, function (m) { return J.claimConsistent(game, seat, opts, found, m.decision); });
      });
      return { moves: moves, k: k, found: found };
    }

    bot.chooseClaim = function (game, seat, opts) {
      if (opts.win) return { type: "win" };
      if (!opts.pung && !opts.kong && !(opts.chows || []).length) return { type: "pass" };
      var r = claimRead(game, seat, opts);
      return r.moves[r.k].decision;
    };

    // The network's claim, with the classic rules' read of each option for
    // the coach's words (found.ml: each choice and its share).
    bot.decideClaim = function (game, seat, opts) {
      if (opts.win) return { decision: { type: "win" }, found: null };
      if (!opts.pung && !opts.kong && !(opts.chows || []).length) return { decision: { type: "pass" }, found: null };
      var r = claimRead(game, seat, opts);
      var found = r.found;
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
      var res = J.analyzeDiscards(game, seat, ctx, hand);
      var held = hand || game.hand.seats[seat].hand;
      var moves = N.turnMoves(held, []);
      getModel().policy(net.encode(game, seat, { hand: held, melds: ctx ? ctx.melds : null }), moves);
      var byIndex = {};
      moves.forEach(function (m) { byIndex[m.action] = m; });
      res.candidates.forEach(function (x, k) {
        var m = byIndex[x.index];
        x.ml = share(m || { p: 0 });
        x.ml.order = k;
      });
      res.candidates.sort(function (a, b) { return b.ml.policy - a.ml.policy || a.ml.order - b.ml.order; });
      // No discard that goes against the hand the classic rules read for it.
      res.candidates = Base.consistentFirst(res.candidates, game, E.countsOf(held), res.folding);
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
  api.Value = V;

  if (node) module.exports = api;
  else root.MahjongLuckyCatML = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
