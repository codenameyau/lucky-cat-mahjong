/* The "dishonor" bot strategy.

   Honors go first, every one of them, every time. Then it plays one of two hands:
     - Concealed Straights: runs only, nothing claimed, for a self-draw.
     - Full Flush: once one suit has 7 or more tiles, the hand locks into that
       suit, throws the other suits next, and chows and pungs only in it.
   The one exception to honors first is a discard that leaves the hand ready
   to win for the minimum. The playbook is in docs/strategies/dishonor.md. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  var LOCK_TILES = 7;
  var SUITS = ['c', 'd', 'b'];
  var SUIT_LABELS = { c: 'Characters', d: 'Circles', b: 'Bamboos' };

  function inSuit(su) {
    return function (i) { return i < 27 && E.suitOfIndex(i) === su; };
  }

  /* ------------------------------------------------------------------ *
   * 1. Which hand
   * ------------------------------------------------------------------ */

  // The suit the hand is locked into: its melds' suit, or the suit with 7 or
  // more tiles, the one closest to ready if two qualify. Null on Concealed
  // Straights.
  function lockedSuit(c, ctx) {
    var melded = SUITS.filter(function (su) { return ctx.meldSuits[su]; });
    if (melded.length) return melded[0];
    var best = null, bestS = Infinity;
    SUITS.forEach(function (su) {
      if (B.countWhere(c, inSuit(su)) < LOCK_TILES) return;
      var s = E.standardShanten(B.restrict(c, inSuit(su)), ctx.declared);
      if (s < bestS) { best = su; bestS = s; }
    });
    return best;
  }

  function flushPlan(c, ctx, su) {
    return {
      id: 'full-' + su, suit: su, label: 'a Full Flush in ' + SUIT_LABELS[su],
      counts: B.restrict(c, inSuit(su)), shantenFn: E.standardShanten,
      faan: B.baseFaan(ctx) + (ctx.concealed ? 1 : 0) + 7, open: true,
    };
  }

  // Without its honors: Concealed plus All Sequences, and the self-draw or a
  // flower makes 3.
  function straightsPlan(c, ctx) {
    return {
      id: 'straights', label: 'Concealed Straights',
      counts: B.restrict(c, function (i) { return i < 27; }), shantenFn: E.standardShanten,
      faan: B.baseFaan(ctx) + 2, open: false,
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Hooks
   * ------------------------------------------------------------------ */

  function hand(ctx, counts) {
    ctx.lockSuit = lockedSuit(counts, ctx);
  }

  // (A claim's choice is weighed from the 13 tiles, without hand() first.)
  function plans(c, ctx) {
    var su = ctx.lockSuit !== undefined ? ctx.lockSuit : lockedSuit(c, ctx);
    return [su ? flushPlan(c, ctx, su) : straightsPlan(c, ctx)];
  }

  function winsWhenReady(x) {
    return x.shanten === 0 && x.analysis.ready &&
      x.analysis.ready.waits.some(function (w) { return w.left && (w.ronOk || w.tsumoOk); });
  }

  // A ready discard, then honors, then other suits if locked, then the shared
  // order (which is safety first while folding).
  function finalOrder(out, ctx) {
    var su = ctx.lockSuit;
    var rank = function (x) {
      if (winsWhenReady(x)) return 0;
      if (x.index >= 27) return 1;
      return su && !inSuit(su)(x.index) ? 2 : 3;
    };
    return out.map(function (x, k) { return { x: x, k: k }; }).sort(function (a, b) {
      return rank(a.x) - rank(b.x) || a.k - b.k;
    }).map(function (o) { return o.x; });
  }

  function planSteps(analysis) {
    var best = analysis && analysis.best;
    return best && best.planShanten !== undefined ? best.planShanten : Infinity;
  }

  // Concealed Straights claims nothing. A locked hand takes the chow, pung or
  // kong in its suit that brings it closest to ready.
  function claim(res, ctx, game, seat, opts) {
    var su = lockedSuit(E.countsOf(game.hand.seats[seat].hand), ctx);
    if (!su || !inSuit(su)(E.tileIndex(opts.tile))) return { type: 'pass' };
    var now = planSteps(res.stay);
    var pick = null;
    res.options.forEach(function (o) {
      var s = planSteps(o.analysis);
      if (s < now && (!pick || s < planSteps(pick.analysis))) pick = o;
    });
    return pick ? pick.decision : { type: 'pass' };
  }

  // A set of a tile can't be part of an all-runs hand or another suit's flush.
  function kongOk(kong, ctx) {
    return !!ctx.lockSuit && inSuit(ctx.lockSuit)(E.tileIndex(kong.tile));
  }

  /* ------------------------------------------------------------------ *
   * 3. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'dishonor',
    hooks: {
      hand: hand,
      plans: plans,
      finalOrder: finalOrder,
      claim: claim,
      kongOk: kongOk,
    },
  });
  bot.lockedSuit = lockedSuit;
  bot.kongOk = kongOk;

  if (node) module.exports = bot;
  else root.MahjongDishonor = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
