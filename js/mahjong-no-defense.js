/* The "no-defense" bot strategy.

   It never folds and never weighs what a discard might feed. It builds the
   fastest hand its tiles allow and keeps honors as long as it can:
     - A lone honor with every other copy on the table goes first of all.
     - Then a discard that leaves the hand able to win, then number tiles
       that cost no step, and honors only after those. Honor pairs stay longest.
     - With 8 tiles of a hand worth 7 faan or more within its first 8 turns,
       it locks onto that hand and keeps those tiles until it can't be won.
   The playbook is in docs/strategies/no-defense.md. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  var LOCK_TILES = 8, LOCK_FAAN = 7, LOCK_TURNS = 8, STEP_IN_FAAN = 1.25;
  var SUITS = ['c', 'd', 'b'];
  var SUIT_LABELS = { c: 'Characters', d: 'Circles', b: 'Bamboos' };

  function isHonor(i) { return i >= 27; }
  function isWind(i) { return i >= 27 && i < 31; }
  function isDragon(i) { return i >= 31; }
  function isTerminal(i) { return i < 27 && (i % 9 === 0 || i % 9 === 8); }
  function isOrphan(i) { return isHonor(i) || isTerminal(i); }
  function inSuit(su) {
    return function (i) { return i < 27 && E.suitOfIndex(i) === su; };
  }

  // Tiles held plus melds made, of the kind `fits` keeps.
  function tilesOf(c, ctx, fits) {
    return ctx.melds.reduce(function (n, m) {
      return n + (fits(E.tileIndex(m.tiles[0])) ? 3 : 0);
    }, B.countWhere(c, fits));
  }

  /* ------------------------------------------------------------------ *
   * 1. The hands it locks onto
   * ------------------------------------------------------------------ */

  function suitHand(su) {
    var fits = inSuit(su);
    return {
      id: 'full-' + su, fits: fits, tiles: function (c, ctx) { return tilesOf(c, ctx, fits); },
      plans: function (c, ctx) {
        if (ctx.melds.some(function (m) { return !fits(E.tileIndex(m.tiles[0])); })) return [];
        var out = [{
          id: 'full-' + su, suit: su, label: 'a Full Flush in ' + SUIT_LABELS[su],
          counts: B.restrict(c, fits), shantenFn: E.standardShanten,
          faan: B.baseFaan(ctx) + (ctx.concealed ? 1 : 0) + 7, open: true,
        }];
        var start = SUITS.indexOf(su) * 9;
        if (!ctx.declared && B.nineGatesProgress(c, start) >= LOCK_TILES) {
          out.push(B.makeSpecialPlan('gates', c, ctx, { suit: su, start: start }));
        }
        return out;
      },
    };
  }

  // Hands of sets or pairs, from the shared bigger hands. (A set of any tile
  // these keep is one more tile of the hand.)
  function setsHand(id, fits, ids) {
    return {
      id: id, fits: fits, sets: true, tiles: function (c, ctx) { return tilesOf(c, ctx, fits); },
      plans: function (c, ctx) {
        return B.setUpgrades(c, ctx, true).concat(B.pairsUpgrades(c, ctx, true)).filter(function (p) {
          return ids.indexOf(p.id) !== -1;
        });
      },
    };
  }

  function groupHand(id, fits, ids) {
    return {
      id: id, fits: fits, sets: true, tiles: function (c, ctx) { return tilesOf(c, ctx, fits); },
      plans: function (c, ctx) {
        return B.upgradePlans(c, ctx).filter(function (p) { return ids.indexOf(p.id) !== -1; });
      },
    };
  }

  var ORPHANS = {
    id: 'orphans', fits: isOrphan,
    // Thirteen Orphans uses one of each kind, and one pair.
    tiles: function (c) {
      var kinds = 0, pair = 0;
      for (var i = 0; i < 34; i++) {
        if (!isOrphan(i) || !c[i]) continue;
        kinds++;
        if (c[i] >= 2) pair = 1;
      }
      return kinds + pair;
    },
    plans: function (c, ctx) {
      return !ctx.declared && B.orphansAlive(c, ctx) ? [B.makeSpecialPlan('orphans', c, ctx)] : [];
    },
  };

  var HANDS = SUITS.map(suitHand).concat([
    ORPHANS,
    setsHand('all-honors', isHonor, ['all-honors', 'pairs-honors']),
    setsHand('all-terminals', isTerminal, ['all-terminals', 'pairs-terminals']),
    setsHand('mixed-orphans', isOrphan, ['mixed-orphans', 'pairs-orphans']),
    groupHand('winds', isWind, ['small-winds', 'big-winds']),
    groupHand('dragons', isDragon, ['small-dragons', 'big-dragons']),
  ]);

  function handById(id) {
    return HANDS.filter(function (h) { return h.id === id; })[0] || null;
  }

  // How far off and how much it's worth, counting only plans worth 7 or more.
  function measure(hand, c, ctx) {
    var out = { steps: Infinity, faan: 0, outs: 0 };
    hand.plans(c, ctx).forEach(function (p) {
      if (p.faan < LOCK_FAAN) return;
      var s = p.shantenFn(p.counts, ctx.declared);
      if (s === Infinity) return;
      out.faan = Math.max(out.faan, p.faan);
      if (s < out.steps) out.steps = s;
      out.outs += s < 0 ? 1 : B.ukeire(p.counts, p.shantenFn, ctx.declared, ctx.unseen, s).total;
    });
    return out;
  }

  // Still possible: 8 of its tiles, one that helps left, and enough wall.
  function stillPossible(hand, c, ctx) {
    var m = measure(hand, c, ctx);
    return hand.tiles(c, ctx) >= LOCK_TILES && m.steps !== Infinity && m.outs > 0 && m.steps < ctx.wallLeft;
  }

  // The best hand this one qualifies for: the most faan, less each step away.
  function pickLock(c, ctx) {
    var best = null, bestValue = -Infinity;
    HANDS.forEach(function (hand) {
      if (hand.tiles(c, ctx) < LOCK_TILES || !stillPossible(hand, c, ctx)) return;
      var m = measure(hand, c, ctx);
      var value = m.faan - STEP_IN_FAAN * m.steps;
      if (value > bestValue) { best = hand; bestValue = value; }
    });
    return best;
  }

  // The lock lives on this hand's seat, so it lasts past the eighth turn. A
  // saved game replays the bots' turns, which rebuilds theirs. The coach isn't
  // replayed, so your own hand comes back unread and is read again from its tiles.
  function savedLock(ctx) {
    return handById(ctx.game.hand.seats[ctx.seat].noDefenseLock);
  }

  // A claim being weighed looks at a hand that hasn't happened yet.
  function isActualHand(c, ctx) {
    var seat = ctx.game.hand.seats[ctx.seat];
    return ctx.melds === seat.melds && E.countsOf(seat.hand).every(function (n, i) { return n === c[i]; });
  }

  // Decided from the 14 tiles, before any discard.
  function updateLock(c, ctx) {
    if (!isActualHand(c, ctx)) return savedLock(ctx);
    var seat = ctx.game.hand.seats[ctx.seat];
    var lock = savedLock(ctx);
    if (lock && !stillPossible(lock, c, ctx)) lock = null;
    if (!lock && (ctx.turn < LOCK_TURNS || seat.noDefenseLock === undefined)) lock = pickLock(c, ctx);
    seat.noDefenseLock = lock ? lock.id : null;
    return lock;
  }

  /* ------------------------------------------------------------------ *
   * 2. Hooks
   * ------------------------------------------------------------------ */

  // The player after you doesn't change what it keeps.
  function context(ctx) {
    ctx.afterRead = null;
  }

  function hand(ctx, counts) {
    ctx.lock = updateLock(counts, ctx);
    // Faster-looking hands don't pull it off a lock or its own read.
    ctx.lockedSpecial = ctx.lock ? { kind: ctx.lock.id } : null;
    ctx.planFixed = !!ctx.lock;
  }

  // (A claim's choice is weighed from the 13 tiles, without hand() first.)
  function plans(c, ctx) {
    var lock = ctx.lock !== undefined ? ctx.lock : savedLock(ctx);
    if (lock) {
      var own = lock.plans(c, ctx).filter(function (p) {
        return p.faan >= LOCK_FAAN && p.shantenFn(p.counts, ctx.declared) !== Infinity;
      });
      if (own.length) return own;
    }
    var list = B.basePlans(c, ctx);
    if (B.chaseSevenPairs(c, ctx)) list.push(B.makeSpecialPlan('pairs', c, ctx));
    return list;
  }

  function defense() {
    return 0;
  }

  function winsNow(x) {
    return x.shanten === 0 && B.winsWhenReady(x.analysis.ready);
  }

  // A lone honor with the other three copies on the table can never be used.
  function deadHonor(c, ctx, i) {
    return isHonor(i) && c[i] === 1 && ctx.unseen[i] === 0;
  }

  function lockRank(x, c, ctx, lock) {
    var i = x.index;
    if (lock.id !== 'orphans' && deadHonor(c, ctx, i)) return 0;
    var dead = lock.sets && c[i] === 1 && ctx.unseen[i] === 0;
    if (!lock.fits(i) || dead) {
      if (winsNow(x)) return 1;
      return isHonor(i) ? 3 : 2;
    }
    return 4;
  }

  function freeRank(x, c, ctx, bestSteps) {
    var i = x.index;
    if (deadHonor(c, ctx, i)) return 0;
    if (winsNow(x)) return 1;
    var straights = ctx.leadPlan && ctx.leadPlan.id === 'straights';
    var eyes = straights ? B.keptHonorPair(c, ctx) : null;
    // The pair is already kept, so every other honor, dragon included, goes
    // before a number tile. A finished straight waits behind a loose tile.
    if (straights && eyes !== null && i >= 27 && i !== eyes) return 2;
    if (!isHonor(i)) {
      var rank = x.shanten <= bestSteps ? 2 : 4;
      if (straights && eyes !== null) rank += 1;
      if (straights && B.breaksFinishedStraight(c, i)) rank += 2;
      return rank;
    }
    if (c[i] >= 3) return 7;
    if (c[i] === 2) return 6;
    return B.loneDragon(ctx.game, c, i) ? 5 : 3;
  }

  // Lone honors with fewer copies left go first, and ones that score last.
  function honorOrder(a, b, ctx) {
    if (a.index < 27 || b.index < 27) return 0;
    return ctx.unseen[a.index] - ctx.unseen[b.index] ||
      B.valueWeight(ctx, a.index) - B.valueWeight(ctx, b.index);
  }

  function finalOrder(out, ctx, c) {
    var lock = ctx.lock;
    var bestSteps = Math.min.apply(null, out.map(function (x) { return x.shanten; }));
    var rank = function (x) { return lock ? lockRank(x, c, ctx, lock) : freeRank(x, c, ctx, bestSteps); };
    return out.map(function (x, k) { return { x: x, k: k, r: rank(x) }; }).sort(function (a, b) {
      return a.r - b.r || honorOrder(a.x, b.x, ctx) || a.k - b.k;
    }).map(function (o) { return o.x; });
  }

  function planSteps(analysis) {
    var best = analysis && analysis.best;
    return best && best.planShanten !== undefined ? best.planShanten : Infinity;
  }

  // Takes any claim that moves the hand closer and can still score. On a lock,
  // only a claim of that hand's tiles that moves it closer.
  function claim(res, ctx, game, seat, opts) {
    var lock = savedLock(ctx);
    if (lock && !lock.fits(E.tileIndex(opts.tile))) return { type: 'pass' };
    var min = game.settings.minFaan;
    var now = res.stay.shanten, pick = null;
    res.options.forEach(function (o) {
      var an = o.analysis;
      var plan = an && an.best && an.best.plan;
      if (!an || an.shanten >= now) return;
      if (an.shanten !== 0 && !(plan && plan.faan >= min)) return;
      if (lock && planSteps(an) >= planSteps(res.stay)) return;
      if (!pick || an.shanten < pick.analysis.shanten ||
        (an.shanten === pick.analysis.shanten && an.util > pick.analysis.util)) pick = o;
    });
    return pick ? pick.decision : { type: 'pass' };
  }

  function kongOk(kong, ctx) {
    return !ctx.lock || (ctx.lock.fits(E.tileIndex(kong.tile)) && ctx.lock.id !== 'orphans');
  }

  /* ------------------------------------------------------------------ *
   * 3. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'no-defense',
    hooks: {
      context: context,
      hand: hand,
      plans: plans,
      defense: defense,
      finalOrder: finalOrder,
      claim: claim,
      kongOk: kongOk,
    },
  });
  bot.pickLock = pickLock;

  if (node) module.exports = bot;
  else root.MahjongNoDefense = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
