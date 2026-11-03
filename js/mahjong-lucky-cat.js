/* The "lucky-cat" bot strategy.

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
       Otherwise it weighs the usual hands (MahjongBot.basePlans, with
       their upgrades: Mixed Orphans, All Terminals, All Honors, Three
       Dragons, Four Winds) and builds whichever is worth the most.
     - Chows. A chow gives up the hand's concealed faan and shows what it's
       doing, so it takes one only when it makes the hand ready, builds the
       flush it is already going for (early, only one tile from ready),
       late in the hand saves a step, or the hand's flowers and sets already
       give all but one faan (then within two tiles of ready).
     - The table. It tracks every discard by who threw it and every tile each
       opponent passed on, and estimates what each one wants and where the
       unseen copies are. From that it works out the odds of finishing each
       hand before someone else does, and it avoids feeding them, more and
       more toward the end of the hand. It only uses what this seat can see:
       never the wall's order or another player's concealed tiles.
   The playbook is written out in docs/strategies/lucky-cat.md. */

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
  var DRAGON_INDEXES = [31, 32, 33];

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

  // Whether a discard leaves this hand ready to win for the minimum, on a
  // tile that isn't used up.
  function canHoldReady(counts, ctx) {
    if (E.shanten(counts, ctx.declared) > 0) return false;
    var c = counts.slice();
    for (var i = 0; i < 34; i++) {
      if (!c[i]) continue;
      c[i]--;
      var ready = E.shanten(c, ctx.declared) === 0 && B.readyValue(c, ctx);
      c[i]++;
      if (ready && ready.waits.some(function (w) { return w.left && (w.ronOk || w.tsumoOk); })) return true;
    }
    return false;
  }

  // The special hand is picked from the 14 tiles, before any discard.
  function hand(ctx, counts) {
    ctx.lockedSpecial = pickSpecial(counts, ctx);
    ctx.holdsReady = canHoldReady(counts, ctx);
  }

  // Seven Pairs also weighs its terminal-and-honor upgrades (Mixed
  // Orphans, All Honors, All Terminals); the usual hands weigh theirs in
  // MahjongBot.basePlans.
  function plans(c, ctx) {
    var special = specialPlan(ctx, c);
    // A hand that can win now doesn't leave that for a bigger one.
    if (!special) return B.basePlans(c, ctx).filter(function (p) { return !ctx.holdsReady || !p.upgrade; });
    return special.id === 'pairs' ? [special].concat(B.pairsUpgrades(c, ctx)) : [special];
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
    // Flowers and sets already give all but one faan: a quick hand wins,
    // so a chow that brings it within two tiles of ready is worth it.
    if (B.cheapWin(ctx) && after <= 2) return true;
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
   * 3. Tracking the table
   *    Everything here comes from what this seat can see: the discards and
   *    who threw them, open melds, its own tiles and the size of the wall.
   * ------------------------------------------------------------------ */

  var WANT_MIN = 0.05, WANT_MAX = 4;
  // How much a tile they threw, or passed on, says they don't want it.
  var THROWN_SINCE_MELD = 0.2, THROWN = 0.4, THROWN_BEFORE_PIVOT = 0.65;
  var PASSED_HONOR = 0.45, PASSED_NUMBER = 0.8;
  // A thrown tile also says a little about its neighbors and its suji.
  var NEAR = { 1: 0.85, 2: 0.9, 3: 0.75 };
  var WIN_PER_TURN = 0.22; // chance a ready opponent wins in a go-around
  var CLAIM_ODDS = 0.9;    // another seat with priority sometimes takes it first
  // A step after the next one: typically this likely a go-around, and only a
  // little better for a hand that's wide right now.
  var LATER_RATE = 0.06, LATER_SHARE = 0.15, HIGHEST_RATE = 0.9;
  // Feeding a claim costs more the less of the hand is left to answer it.
  var FEED_COST = 0.012, FEED_CHOW = 0.6, FEED_PUNG = 0.25;

  function suitOf(i) { return i < 27 ? E.suitOfIndex(i) : 'z'; }

  function shares(list) {
    var by = { c: 0, d: 0, b: 0 }, total = 0;
    list.forEach(function (d) {
      var su = suitOf(E.tileIndex(d.tile));
      if (by[su] !== undefined) { by[su]++; total++; }
    });
    SUIT_LETTERS.forEach(function (su) { by[su] = total ? by[su] / total : 1 / 3; });
    return by;
  }

  // A suit they kept for the first half of their discards and throw now, or
  // the reverse: they've changed hands, and what they threw early says less.
  function readPivot(list) {
    var n = list.length;
    if (n < 8) return null;
    var half = Math.floor(n / 2);
    var early = shares(list.slice(0, half)), late = shares(list.slice(half));
    var pivot = null;
    SUIT_LETTERS.forEach(function (su) {
      if (early[su] <= 0.15 && late[su] >= 0.4) pivot = { from: su, to: null, at: half };
    });
    SUIT_LETTERS.forEach(function (su) {
      if (early[su] >= 0.4 && late[su] <= 0.1) {
        if (pivot) pivot.to = su; else pivot = { from: null, to: su, at: half };
      }
    });
    return pivot;
  }

  // The suit they're building: their melds' one suit, or one they've barely
  // thrown after six discards.
  function readCollecting(s, recent) {
    var inMelds = {};
    s.melds.forEach(function (m) {
      var su = suitOf(E.tileIndex(m.tiles[0]));
      if (su !== 'z') inMelds[su] = true;
    });
    var suits = Object.keys(inMelds);
    if (suits.length) return suits.length === 1 ? suits[0] : null;
    if (s.discards.length < 6) return null;
    var low = SUIT_LETTERS.filter(function (su) { return recent[su] <= 0.1; });
    return low.length === 1 ? low[0] : null;
  }

  // Middle tiles going out in their last four discards: they've stopped
  // needing them, so their hand is further along than its melds show.
  function readPace(list) {
    if (list.length < 6) return 1;
    var middle = list.slice(-4).filter(function (d) {
      var i = E.tileIndex(d.tile);
      return i < 27 && i % 9 >= 2 && i % 9 <= 6;
    }).length;
    return 0.85 + 0.12 * middle;
  }

  // How much one opponent wants each tile, where 1 is no read either way.
  function readSeat(game, o, unseen) {
    var s = game.hand.seats[o];
    var list = s.discards;
    var n = list.length;
    var pivot = readPivot(list);
    var recent = shares(list.slice(pivot ? pivot.at : 0));
    var collecting = readCollecting(s, recent);
    var lastMeld = s.melds.reduce(function (m, x) { return Math.max(m, x.at || 0); }, 0);
    var want = [];
    var windIndex = 26 + E.seatWind(game, o);
    for (var i = 0; i < 34; i++) {
      var w = 1;
      if (i < 27) {
        var share = recent[E.suitOfIndex(i)];
        if (n >= 4) w *= share < 0.12 ? 1.7 : share < 0.25 ? 1.25 : share > 0.5 ? 0.6 : share > 0.38 ? 0.8 : 1;
        var r = i % 9;
        w *= r >= 2 && r <= 6 ? 1.1 : r === 0 || r === 8 ? 0.85 : 1;
        if (collecting) w *= E.suitOfIndex(i) === collecting ? 2 : 0.5;
      } else {
        if (DRAGON_INDEXES.indexOf(i) !== -1 || i === windIndex || i === 26 + game.round) w *= 1.25;
        if (unseen[i] < 2) w *= 0.4;
        if (collecting) w *= 1.2;
      }
      want.push(w);
    }
    // A tile thrown counts once, by its most telling copy.
    var seen = {};
    list.forEach(function (d, idx) {
      var i = E.tileIndex(d.tile);
      var f = idx >= lastMeld && s.melds.length ? THROWN_SINCE_MELD : pivot && idx < pivot.at ? THROWN_BEFORE_PIVOT : THROWN;
      seen[i] = Math.min(seen[i] || 1, f);
    });
    Object.keys(seen).forEach(function (key) {
      var i = +key;
      want[i] *= seen[i];
      if (i >= 27) return;
      [-3, -2, -1, 1, 2, 3].forEach(function (d) {
        var j = i + d;
        if (j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(i / 9)) want[j] *= NEAR[Math.abs(d)];
      });
    });
    // A copy someone else threw that they let go by: they don't hold a pair
    // of it (or didn't then).
    var passed = {};
    game.hand.seats.forEach(function (other, k) {
      if (k === o) return;
      other.discards.forEach(function (d) { if (!d.claimed) passed[E.tileIndex(d.tile)] = true; });
    });
    Object.keys(passed).forEach(function (key) {
      want[+key] *= +key >= 27 ? PASSED_HONOR : PASSED_NUMBER;
    });
    for (var t = 0; t < 34; t++) {
      want[t] = unseen[t] ? Math.max(WANT_MIN, Math.min(WANT_MAX, want[t])) : WANT_MIN;
    }
    // The chance their next discard is each tile: a copy they don't want
    // comes out sooner than one they do.
    var weight = want.map(function (w, i) { return unseen[i] / w; });
    var total = weight.reduce(function (a, b) { return a + b; }, 0) || 1;
    return {
      seat: o,
      want: want,
      out: weight.map(function (w) { return w / total; }),
      hidden: Math.max(1, 13 - 3 * s.melds.length),
      collecting: collecting,
      pivot: pivot,
      pace: readPace(list),
    };
  }

  // Every opponent's read, and the chance each unseen copy is still in the
  // wall rather than in a hand that wants it. The wall's order is never read.
  function readTable(game, seat, unseen) {
    var seats = [];
    for (var o = 0; o < 4; o++) if (o !== seat) seats.push(readSeat(game, o, unseen));
    var wall = Math.max(1, game.hand.wall.length);
    var inWall = [];
    for (var i = 0; i < 34; i++) {
      var held = seats.reduce(function (m, r) { return m + r.hidden * r.want[i]; }, 0);
      inWall.push(wall / (wall + held));
    }
    return { seats: seats, inWall: inWall, wall: wall, left: (seat + 3) % 4, next: (seat + 1) % 4 };
  }

  // The chance a go-around brings one of these tiles: this seat's draw, or a
  // discard it may claim (`claimable(i, opponentSeat)`).
  function arrivalRate(ctx, tiles, claimable) {
    var track = ctx.track;
    var draw = 0, miss = 1;
    tiles.forEach(function (i) {
      draw += ctx.unseen[i] * track.inWall[i] / track.wall;
      track.seats.forEach(function (r) {
        if (claimable(i, r.seat)) miss *= 1 - r.out[i] * CLAIM_ODDS;
      });
    });
    return 1 - miss * (1 - Math.min(draw, 1));
  }

  // The odds of making s + 1 more steps before the wall runs out or someone
  // else wins, a go-around at a time. Only the next step's rate is known, so
  // a hand that is wide now but many steps away doesn't beat a closer one.
  function raceOdds(rate, s, turns, hazard) {
    var steps = s + 1;
    var at = [];
    for (var k = 0; k <= steps; k++) at.push(0);
    at[steps] = 1;
    var won = 0;
    var n = Math.max(1, Math.round(turns));
    for (var t = 0; t < n; t++) {
      for (var left = 1; left <= steps; left++) {
        var r = left === steps ? rate : LATER_RATE + LATER_SHARE * rate;
        var move = at[left] * Math.min(HIGHEST_RATE, r);
        at[left] -= move;
        if (left === 1) won += move; else at[left - 1] += move;
      }
      for (var j = 1; j <= steps; j++) at[j] *= 1 - hazard;
    }
    return won;
  }

  function context(ctx, game, seat) {
    ctx.track = readTable(game, seat, ctx.unseen);
    ctx.hazard = 1 - B.opponentThreats(game, seat).reduce(function (m, t) {
      return m * (1 - t.ready * WIN_PER_TURN);
    }, 1);
  }

  function finishChance(ctx, s, u, plan, counts) {
    var left = ctx.track.left;
    var noChow = B.SETS_PLANS.indexOf(plan.id) !== -1;
    var rate = arrivalRate(ctx, u.tiles, function (i, o) {
      if (s === 0) return true; // any discard wins
      if (!plan.open) return false;
      if (counts[i] >= 2) return true;
      return !noChow && o === left && i < 27 && hasNeighbor(counts, i);
    });
    return raceOdds(rate, s, ctx.drawsLeft, ctx.hazard);
  }

  function hasNeighbor(counts, i) {
    for (var d = -2; d <= 2; d++) {
      var j = i + d;
      if (d && j >= 0 && j < 27 && Math.floor(j / 9) === Math.floor(i / 9) && counts[j]) return true;
    }
    return false;
  }

  // A ready hand's exact value, with its odds taken from where its waits
  // really are: one everybody is holding is worth less than its count says.
  function readyValue(value, waits, c, ctx) {
    var usable = waits.filter(function (w) { return w.left && (w.ronOk || w.tsumoOk); });
    if (!usable.length) return value;
    var q = usable.reduce(function (m, w) {
      return m + (w.tsumoOk ? w.left : 0) + (w.ronOk ? w.left * 1.5 : 0);
    }, 0) / ctx.unseenTotal;
    var t = ctx.drawsLeft;
    var estimate = t / (t + 1 / q) * 0.7; // what the shared value assumed
    var ron = {};
    usable.forEach(function (w) { if (w.ronOk) ron[E.tileIndex(w.tile)] = true; });
    var rate = arrivalRate(ctx, usable.filter(function (w) { return w.tsumoOk || w.ronOk; }).map(function (w) { return E.tileIndex(w.tile); }), function (i) { return !!ron[i]; });
    return value * raceOdds(rate, 0, t, ctx.hazard) / estimate;
  }

  function threats(list, game, seat) {
    var unseen = E.unseenCounts(game, seat);
    var next = (seat + 1) % 4;
    list.forEach(function (t) {
      var read = readSeat(game, t.seat, unseen);
      t.want = read.want;
      t.pivot = read.pivot;
      t.collecting = read.collecting;
      t.isNext = t.seat === next;
      t.ready = Math.min(0.93, t.ready * read.pace);
    });
  }

  // Waiting on a tile is more likely the more they want it.
  function waitChance(chance, game, threat, i) {
    return chance * Math.pow(threat.want[i], 0.6);
  }

  // Feeding: a tile an opponent would claim moves their hand along even if it
  // doesn't win. It's a small cost early and a big one at the end of the hand.
  function feedLoss(game, list, i) {
    var wall = game.hand.wall.length;
    var phase = wall > 60 ? 0.3 : wall > 32 ? 0.6 : wall > 16 ? 1 : 1.5;
    return list.reduce(function (sum, t) {
      var eager = Math.max(0, t.want[i] - 1);
      var claim = (t.isNext && i < 27 ? FEED_CHOW : 0) + (t.unseen[i] >= 2 ? FEED_PUNG : 0);
      return sum + FEED_COST * phase * eager * claim * (1 + 2 * t.ready);
    }, 0);
  }

  /* ------------------------------------------------------------------ *
   * 4. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'lucky-cat',
    // A win at the 3-faan minimum comes first, so each faan above it counts
    // for much less than its payout.
    tuning: { valuePower: 0.35 },
    hooks: {
      context: context,
      hand: hand,
      plans: plans,
      priority: priority,
      chowOk: chowOk,
      finishChance: finishChance,
      readyValue: readyValue,
      threats: threats,
      waitChance: waitChance,
      extraLoss: feedLoss,
    },
  });
  bot.pickSpecial = pickSpecial;
  bot.specialPlan = specialPlan;
  bot.readTable = readTable;
  bot.raceOdds = raceOdds;
  bot.feedLoss = feedLoss;

  if (node) module.exports = bot;
  else root.MahjongLuckyCat = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
