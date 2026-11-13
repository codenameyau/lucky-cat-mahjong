/* The rule-based Only Orphans bot: the baseline the learned Only Orphans
   (js/mahjong-only-orphans.js) is measured against. It is no longer played at
   the table; the training scripts load it as the lab strategy
   "only-orphans-rules" (npm run compete, npm run ml:orphans).

   It plays one hand: Thirteen Orphans. Every tile that isn't a 1, a 9 or an
   honor goes first, and nothing is claimed, for as long as the hand still has
   a real chance (handOdds).
   Once a tile it needs has run out, or the odds are too low, it pivots to the
   hand its 1s, 9s and honors can still make: Mixed Orphans, Seven Pairs with
   Mixed Orphans, All Terminals or All Honors, as triplets or as pairs.
   Its playbook is in docs/strategies/only-orphans.md#the-rule-based-baseline. */

(function () {
  "use strict";

  var E = require("../../../js/mahjong-engine.js");
  var B = require("../../../js/mahjong-bot.js");

  var GIVE_UP_ODDS = 0.001; // under this chance of finishing, the hand pivots
  var HOLD_TURNS = 6;       // it plays this many discards before weighing the odds
  var RON_RATE = 3;         // a ready hand's wait comes from three discards as well as a draw

  /* ------------------------------------------------------------------ *
   * 1. Is Thirteen Orphans still worth playing?
   * ------------------------------------------------------------------ */

  // The chance of finishing before the wall runs out, a go-around at a time:
  // each missing kind and the pair is one step, and the odds of each step come
  // from the copies still unseen. Zero with a meld down or a missing kind gone.
  function handOdds(c, ctx) {
    if (ctx.declared || !B.orphansAlive(c, ctx)) return 0;
    var missing = 0, copies = 0, held = 0, needPair = 1;
    B.ORPHAN_INDEXES.forEach(function (i) {
      if (c[i] >= 2) needPair = 0;
      if (c[i]) held += ctx.unseen[i];
      else { missing++; copies += ctx.unseen[i]; }
    });
    var perKind = missing ? copies / missing : 0;
    var rate = function (m, p) {
      var pool = p ? held + (missing - m) * Math.max(0, perKind - 1) : 0;
      var q = (m * perKind + pool) / ctx.unseenTotal;
      return m + p === 1 ? Math.min(1, q * (1 + RON_RATE)) : q;
    };
    // at[m][p]: the chance of being m kinds and p pairs short after each go-around.
    var at = [];
    for (var m = 0; m <= missing; m++) at.push([0, 0]);
    at[missing][needPair] = 1;
    var won = missing + needPair === 0 ? 1 : 0;
    var turns = Math.max(1, Math.round(ctx.drawsLeft));
    for (var t = 0; t < turns; t++) {
      for (var k = 0; k <= missing; k++) {
        for (var p = 0; p <= 1; p++) {
          if (!at[k][p] || k + p === 0) continue;
          var r = rate(k, p);
          var kindShare = p && k ? (k * perKind / ctx.unseenTotal) / r : 1;
          var move = at[k][p] * r;
          at[k][p] -= move;
          if (k + p === 1) won += move;
          else if (k && p) { at[k - 1][p] += move * kindShare; at[k][0] += move * (1 - kindShare); }
          else if (k) at[k - 1][p] += move;
          else at[k][0] += move;
        }
      }
    }
    return won;
  }

  function stillOrphans(c, ctx) {
    if (ctx.declared || !B.orphansAlive(c, ctx)) return false;
    // Once it has given up on Thirteen Orphans, it doesn't come back.
    if (B.leftPlan(ctx, "orphans")) return false;
    if (ctx.turn < HOLD_TURNS) return true;
    return handOdds(c, ctx) >= GIVE_UP_ODDS;
  }

  /* ------------------------------------------------------------------ *
   * 2. The hands it pivots to
   * ------------------------------------------------------------------ */

  // Mixed Orphans, All Terminals and All Honors, as triplets or as pairs, that
  // this hand's melds and live tiles can still make. These are the only hands
  // it plays, so they stay plans however few draws are left.
  function pivotPlans(c, ctx) {
    return B.setUpgrades(c, ctx, true).concat(B.pairsUpgrades(c, ctx, true)).filter(function (p) {
      p.committed = true;
      return p.shantenFn(p.counts, ctx.declared) !== Infinity;
    });
  }

  /* ------------------------------------------------------------------ *
   * 3. Hooks
   * ------------------------------------------------------------------ */

  // Decided from the 14 tiles, before any discard. The tiles these hands keep
  // can't be read as going for one suit.
  function hand(ctx, counts) {
    ctx.lockedSpecial = stillOrphans(counts, ctx) ? { kind: "orphans" } : null;
    ctx.mixedHand = !!ctx.lockedSpecial || pivotPlans(counts, ctx).length > 0;
  }

  // (A claim's choice is weighed from the 13 tiles, without hand() first.)
  function plans(c, ctx) {
    var locked = ctx.lockedSpecial === undefined ? stillOrphans(c, ctx) : ctx.lockedSpecial;
    if (locked) return [B.makeSpecialPlan("orphans", c, ctx)];
    // (The usual hands only if a meld somehow rules all of those out.)
    var pivots = pivotPlans(c, ctx);
    return pivots.length ? pivots : B.basePlans(c, ctx);
  }

  // Tiles that aren't 1s, 9s or honors always go first. On Thirteen Orphans,
  // spare copies go next. A pivot's own order comes from the shared rules for
  // a bigger hand.
  function priority(game, ctx, counts, candidate) {
    var i = candidate.index;
    if (!ctx.mixedHand) return null;
    if (!B.isOrphanIndex(i)) return 0;
    if (!ctx.lockedSpecial) return null;
    return candidate.shanten <= E.orphansShanten(counts, 0) ? 2 : 4;
  }

  // Thirteen Orphans can't use a kong, and a pivot only one of its own tiles.
  function kongOk(kong, ctx) {
    return !ctx.lockedSpecial && B.isOrphanIndex(E.tileIndex(kong.tile));
  }

  // Thirteen Orphans and Seven Pairs claim nothing. Triplets take a pung or
  // kong of any tile they keep. With no pivot left, the shared claims decide.
  function claim(res, ctx, game, seat, opts) {
    var best = res.stay.best;
    var plan = best && best.plan;
    if (!plan || plan.id === "orphans" || plan.pairs) return { type: "pass" };
    if (!plan.keep) return null;
    if (!plan.keep(E.tileIndex(opts.tile))) return { type: "pass" };
    if (opts.kong) return { type: "kong" };
    return opts.pung ? { type: "pung" } : { type: "pass" };
  }

  /* ------------------------------------------------------------------ *
   * 4. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: "only-orphans-rules",
    // A limit hand counts for much more than Mixed Orphans, but not so much
    // that it's chosen from many steps further away.
    tuning: { valuePower: 0.5, ownPlans: true },
    hooks: {
      hand: hand,
      plans: plans,
      priority: priority,
      kongOk: kongOk,
      claim: claim,
    },
  });
  bot.handOdds = handOdds;
  bot.stillOrphans = stillOrphans;
  bot.pivotPlans = pivotPlans;

  module.exports = bot;
})();
