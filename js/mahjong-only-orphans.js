/* Only Orphans: a learned strategy that only plays hands of 1s, 9s and honors.

   What makes it Only Orphans is a few fixed rules, the same ones the
   rule-based bot had (now the baseline in scripts/ml/baselines/):
     - every tile that isn't a 1, a 9 or an honor goes first (folding too),
     - it never chows, and only pungs or kongs a 1, a 9 or an honor,
     - the hands it reads are Thirteen Orphans while it's alive, and Mixed
       Orphans, All Terminals and All Honors, as triplets or as pairs.
   Everything else is the model's (js/mahjong-only-orphans-weights.js),
   trained by self-play like Neural Cat (npm run ml:orphans): which of those
   tiles goes, when Thirteen Orphans is given up and for which hand, which
   pungs and kongs to take, and when to play safe. It scores each choice in
   expected points and plays the one worth the most.

   It is built on the shared foundation (js/mahjong-bot.js) through
   MahjongML.create, so its features are read through these hooks. A model
   trained on them must be used with them, so changing a hook needs new data
   and a new model.

   create({ weights, model, temperature, epsilon, rng, fast }) builds another
   copy (training data, the league). The playbook and its training are in
   docs/strategies/only-orphans.md. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var ML = node ? require('./mahjong-ml.js') : root.MahjongML;

  var ID = 'only-orphans';

  function shippedWeights() {
    if (!node) return root.MahjongOnlyOrphansWeights || null;
    try { return require('./mahjong-only-orphans-weights.js'); } catch (err) { return null; }
  }

  /* ------------------------------------------------------------------ *
   * 1. The hands it reads
   * ------------------------------------------------------------------ */

  // Mixed Orphans, All Terminals and All Honors, as triplets or as pairs, that
  // this hand's melds and live tiles can still make.
  function pivotPlans(c, ctx) {
    return B.setUpgrades(c, ctx, true).concat(B.pairsUpgrades(c, ctx, true)).filter(function (p) {
      p.committed = true;
      return p.shantenFn(p.counts, ctx.declared) !== Infinity;
    });
  }

  // Thirteen Orphans while no meld is down and no tile it needs has run out,
  // beside every pivot. Which to play for is the model's call.
  function plans(c, ctx) {
    var out = !ctx.declared && B.orphansAlive(c, ctx) ? [B.makeSpecialPlan('orphans', c, ctx)] : [];
    out = out.concat(pivotPlans(c, ctx));
    // (The usual hands only if a meld somehow rules all of those out.)
    return out.length ? out : B.basePlans(c, ctx);
  }

  /* ------------------------------------------------------------------ *
   * 2. The fixed rules
   * ------------------------------------------------------------------ */

  // Its 1s, 9s and honors can't be read as going for one suit.
  function hand(ctx) { ctx.mixedHand = true; }

  // Tiles that aren't 1s, 9s or honors always go first, even while folding.
  function priority(game, ctx, counts, candidate) {
    return B.isOrphanIndex(candidate.index) ? null : 0;
  }

  function orphanTile(tile) { return B.isOrphanIndex(E.tileIndex(tile)); }

  // Only a kong of a 1, a 9 or an honor.
  function kongOk(kong) { return orphanTile(kong.tile); }

  // It passes unless the model takes a pung or kong of a tile it keeps.
  function claim() { return { type: 'pass' }; }

  var hooks = { hand: hand, plans: plans, priority: priority, kongOk: kongOk, claim: claim };
  var tuning = { valuePower: 0.5, ownPlans: true };

  // The model picks only among the discards the rules allow: the tiles that
  // aren't 1s, 9s or honors while it holds any. Then any tile, but a lone
  // dragon nobody has shown only when it leaves the hand ready or nothing
  // else is left (the shared rule every bot keeps).
  function allow(candidates, ctx, counts, game) {
    var other = candidates.filter(function (x) { return !B.isOrphanIndex(x.index); });
    if (other.length) return other;
    return candidates.filter(function (x) { return x.shanten <= 0 || !B.loneDragon(game, counts, x.index); });
  }
  function claimOk(option, opts) { return option.decision.type !== 'chow' && orphanTile(opts.tile); }
  function kongAllowed(kong) { return orphanTile(kong.tile); }

  /* ------------------------------------------------------------------ *
   * 3. The strategy
   * ------------------------------------------------------------------ */

  function create(options) {
    options = options || {};
    var base = B.createStrategy({ id: ID + '-rules', hooks: hooks, tuning: tuning });
    var bot = ML.create({
      id: options.id || ID,
      base: base,
      model: options.model,
      weights: options.weights,
      loadWeights: shippedWeights,
      topK: 0,
      temperature: options.temperature,
      epsilon: options.epsilon,
      rng: options.rng,
      fast: options.fast,
      allow: allow,
      claimOk: claimOk,
      kongOk: kongAllowed,
    });
    bot.base = ID;
    return bot;
  }

  var api = create();
  api.create = create;
  api.pivotPlans = pivotPlans;
  api.plans = plans;
  api.hasWeights = function () { return !!shippedWeights(); };

  if (node) module.exports = api;
  else root.MahjongOnlyOrphans = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
