/* The "jorge-yau" bot strategy.

   It plays the shared foundation in js/mahjong-bot.js (expected value for
   every discard, exact scoring of ready hands, the threat model, and the
   principles every bot follows: one suit after a chow or with 7 or more
   tiles of it, honors out on Concealed Straights, keep pairs and dragons).
   On top of that it decides:
     - Special hands. With more than four concealed pairs and no pung or
       kong, it plays Seven Pairs. With nine different terminals and honors
       (or eight and a pair), all still live, it plays Thirteen Orphans.
       With eleven tiles of a suit's 1112345678999 skeleton, it plays Nine
       Gates. Once locked in, every tile the hand can't use goes first.
       Otherwise it weighs the usual hands (MahjongBot.basePlans) and builds
       whichever is worth the most.
     - Chows. A chow gives up the hand's concealed faan and shows what it's
       doing, so it takes one only when it makes the hand ready, builds the
       flush it is already going for (early, only one tile from ready), or
       late in the hand saves a step.
   The playbook is written out in docs/strategies/jorge-yau.md. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  // Thirteen Orphans starts at 9 (nine different terminals and honors, or
  // eight and a pair). Nine Gates starts at 11 of its 13 tiles: short of that
  // a Full Flush keeps the same tiles and can still claim, so it's the better
  // plan.
  var ORPHANS_MIN = 9;
  var GATES_MIN = 11;
  var SUIT_LETTERS = ['c', 'd', 'b'];
  var EARLY_WALL = 60;

  /* ------------------------------------------------------------------ *
   * 1. Special hands
   * ------------------------------------------------------------------ */

  // The suit whose 1112345678999 skeleton already has GATES_MIN tiles, if any.
  function bestNineGates(c) {
    var best = null;
    for (var s = 0; s < 3; s++) {
      var progress = B.nineGatesProgress(c, s * 9);
      if (progress >= GATES_MIN && (!best || progress > best.progress)) {
        best = { suit: SUIT_LETTERS[s], start: s * 9, progress: progress };
      }
    }
    return best;
  }

  // Seven Pairs, Thirteen Orphans, or Nine Gates, whichever is closer.
  function pickSpecial(c, ctx) {
    if (ctx.declared) return null;
    var list = [];
    if (B.chaseSevenPairs(c, ctx)) list.push({ kind: 'pairs', faan: B.baseFaan(ctx) + 4 + B.pairsFlush(c), shantenFn: E.sevenPairsShanten });
    if (B.orphanProgress(c) >= ORPHANS_MIN && B.orphansAlive(c, ctx)) list.push({ kind: 'orphans', faan: 13, shantenFn: E.orphansShanten });
    var gates = bestNineGates(c);
    if (gates) list.push({ kind: 'gates', gates: gates, faan: 13, shantenFn: B.nineGatesShanten(gates.start) });
    var best = null;
    list.forEach(function (item) {
      var s = item.shantenFn(c, ctx.declared || 0);
      if (s === Infinity) return;
      if (!best || s < best.s || (s === best.s && item.faan > best.faan)) best = { s: s, item: item };
    });
    return best ? best.item : null;
  }

  function specialPlan(ctx, counts) {
    var spec = ctx.lockedSpecial || pickSpecial(counts, ctx);
    if (!spec) return null;
    return B.makeSpecialPlan(spec.kind, counts, ctx, spec.gates);
  }

  /* ------------------------------------------------------------------ *
   * 2. Hooks
   * ------------------------------------------------------------------ */

  // The special hand is picked from the 14 tiles, before any discard.
  function hand(ctx, counts) {
    ctx.lockedSpecial = pickSpecial(counts, ctx);
  }

  function plans(c, ctx) {
    var special = specialPlan(ctx, c);
    return special ? [special] : B.basePlans(c, ctx);
  }

  // Thirteen Orphans and Nine Gates throw every tile they can't use first.
  function priority(game, ctx, counts, candidate) {
    var i = candidate.index;
    var locked = ctx.lockedSpecial;
    if (locked && locked.kind === 'orphans') return B.isOrphanIndex(i) ? 4 : 0;
    if (locked && locked.kind === 'gates') return B.gatesTileNeeded(counts, locked.gates.start, i) ? 4 : 0;
    return null;
  }

  // Take a chow only when it is necessary or helps a lot: it makes the
  // hand ready (MahjongBot.chowAllowed has checked the faan), or it builds
  // the flush the hand is already going for, or it's late and gets you
  // meaningfully closer.
  function chowOk(o, res, ctx) {
    var an = o.analysis;
    var after = an.shanten, before = res.stay.shanten;
    if (after === 0) return true;
    var plan = an.best && an.best.plan;
    var flushPlan = /^(half|full)/.test(plan.id);
    // Early in the hand there's time to draw the tile instead, so a flush
    // chow must leave the hand within one tile of ready.
    var early = ctx.wallLeft > EARLY_WALL;
    if (flushPlan && after <= (early ? 1 : 2)) return true;
    // Late in the hand, a chow that saves a step is worth the cost.
    var late = ctx.turn >= 9 || ctx.wallLeft < 48;
    return late && before - after >= 1 && after <= 2;
  }

  /* ------------------------------------------------------------------ *
   * 3. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'jorge-yau',
    hooks: {
      hand: hand,
      plans: plans,
      priority: priority,
      chowOk: chowOk,
    },
  });
  bot.pickSpecial = pickSpecial;
  bot.specialPlan = specialPlan;

  if (node) module.exports = bot;
  else root.MahjongJorgeYau = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
