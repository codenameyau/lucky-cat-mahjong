/* The shared foundation every bot strategy is built on (MahjongBot).

   Every decision is an expected-value estimate built from information the
   seat could legally see (own tiles, the pond, exposed melds, wall count):
     - offense: for each hand "plan" (plain, half/full flush, all triplets,
       seven pairs, thirteen orphans) the shanten and live improving tiles
       (ukeire) give a chance to finish, and the plan's likely faan gives a
       value. Hands that can't reach the 3-faan minimum are worth little.
       Ready hands are valued exactly by scoring every wait with points.js.
     - defense: each opponent gets a ready-hand probability (melds, turn,
       flush signals) and every tile a deal-in probability; the expected
       loss is subtracted from the discard's value, so bots fold when
       their hand is slow and an opponent looks ready.
   On top of that, the principles every strategy shares:
     A. speed vs value: early on, bigger hands are worth chasing; mid and
        late game, or when an opponent shows a big hand, speed matters more.
     B. dead waits (3+ copies visible) are worth little; middle tiles keep
        a hand flexible.
     C. each opponent gets a threat level (Low, Medium, High, Extreme) from
        their melds, one-suit signals and how late it is. When someone is
        High or Extreme and our hand is slow, defense takes over. Tile safety
        follows the usual order: thrown since their last meld, dead honors,
        suji, kabe (a neighbor with all 4 visible), then everything else,
        with fresh honors and middle tiles the most dangerous.
     D. with under 16 tiles left in the wall, play safe unless already ready
        with a big hand. Pung dragons and own/round winds freely; a kong is
        fine at any point. A chow must get the hand closer to ready and
        still able to reach the minimum faan, and only in a suit you
        already hold 7 of, counting the hand and each meld as 3 (a kong's
        fourth tile does not count).
     E. one suit. After a chow, keep that suit and the honors: every tile
        of another suit goes first, even while folding. With 7 or more tiles
        of one suit (sets count), the other suits go first the same way,
        unless the hand is going for Concealed Straights: then the honors go
        first instead, all but one honor pair, which can be the hand's pair
        (but while folding, safety decides). (Seven Pairs, Thirteen Orphans, Nine Gates and the
        hands of honors or terminals need their tiles from every suit, so
        they keep their own order.)
     F. keep pairs. Break one only after every non-pair is gone.
     G. keep dragons until at least one copy is already visible. A lone
        dragon with all three other copies unseen is never thrown, even
        while folding, unless that leaves the hand ready (loneDragon).
        A pair of them stays on a flush while another suit still has a
        tile to throw (keepDragonPair). A tile someone has Punged or
        Konged is the first discard when the hand
        does not need it. A punged honor is safe for the whole table; a
        punged number tile can still finish a chow.
     H. Seven Pairs, Thirteen Orphans, Nine Gates and Concealed Straights
        claim nothing but a scoring honor (Concealed Straights only).
     I. the player before you (on your left, the only one you can chow
        from) shows the suit they're collecting and the one they're
        feeding. A flush in the suit they collect is left alone when
        another of yours is about even with it; between close suits, the
        one they feed wins (leftRead, avoidSuit, suitLean).
     J. never aim for a chicken hand: a plain hand is only a plan once it
        has the minimum faan already (aimablePlans).
     K. the player after you (on your right, the only one who can chow
        your discard) is read by the fifth discard, and a chow of theirs
        locks that suit at once (afterRead). Their suit is not fed. Each
        chow or pung they show holds it longer, and when the hand can use
        it the flush pivots onto it. Late, the tile that wins for them waits.
     L. among the suits you hold the fewest of, a loose terminal goes
        first, then the tile that connects the least (shortSuitDiscard).
        A pair or triplet of that terminal stays, and so does a 1 or 9
        already in a 1-2-3 or 7-8-9. It also stays when it belongs to
        All Terminals, Mixed Orphans or Thirteen Orphans and the hand
        already holds 7 other majors (1s, 9s and honors). A tile of the
        shortest suit goes before a 1 or 9 of the longest suit. A ready
        discard and a risky one stay with the usual order, and while
        folding, safety decides.
     Apart from the lone dragon, the keep-pairs and keep-dragons orders never cost a step toward ready,
     and while folding, safety decides and they only break ties.

   A strategy is createStrategy(def): `def.hooks` adds its own plans,
   discard order, claims and reads, and `def.tuning` its own knobs (section
   9). lucky-cat (js/mahjong-lucky-cat.js) and jorge-yau
   (js/mahjong-jorge-yau.js) are built this way. The coach in
   js/mahjong-coach.js says a strategy's decision in words. See
   docs/strategies/. */

(function (root) {
  'use strict';

  var E = (typeof module !== 'undefined' && module.exports)
    ? require('./mahjong-engine.js')
    : root.MahjongEngine;

  var DRAGONS = [31, 32, 33];
  var EARLY_WALL = 60;
  var LATE_WALL = 32; // fewer tiles than this left is the end of the hand // more tiles than this left in the wall is the early part of the hand
  var SUIT_LABELS = { c: 'Characters', d: 'Circles', b: 'Bamboos' };
  var ESTIMATE_FAAN_CAP = 10;
  var VALUE_SLOPE = 0.6; // value of each faan above the minimum

  var COMPETITION = 0.7; // chance nobody else finishes first, roughly
  var STEP = 0.42; // each extra tile from ready roughly multiplies the win chance by this
  var SELF_DRAW_PAYS = 3; // every opponent pays on a self-draw
  var SELF_DRAW_CHANCE = 0.4; // expected extra faan from winning by self-draw

  /* ------------------------------------------------------------------ *
   * 1. Context
   * ------------------------------------------------------------------ */

  function meldSuit(m) {
    return E.suitOfIndex(E.tileIndex(m.tiles[0]));
  }

  function valueWeight(ctx, i) {
    var w = 0;
    if (DRAGONS.indexOf(i) !== -1) w += 1;
    if (i === 26 + ctx.seatWind) w += 1;
    if (i === 26 + ctx.round) w += 1;
    return w;
  }

  // The player before you (on your left: the only one whose discards you
  // can chow). After six discards their pond says which suit they're
  // collecting (`keeps`: at most a tenth of their discards while they've
  // thrown at least two of each other suit, or the one suit their melds
  // are in) and which they're giving away (`feeds`: the suit they've
  // thrown the most, three or more and more than any other).
  function leftRead(game, seat) {
    var o = (seat + 3) % 4;
    var s = game.hand.seats[o];
    var n = s.discards.length;
    var by = { c: 0, d: 0, b: 0 };
    s.discards.forEach(function (d) {
      var su = E.suitOfIndex(E.tileIndex(d.tile));
      if (by[su] !== undefined) by[su]++;
    });
    var meldSuits = {};
    s.melds.forEach(function (m) { var su = meldSuit(m); if (su !== 'z') meldSuits[su] = true; });
    var inMelds = Object.keys(meldSuits);
    var keeps = inMelds.length === 1 ? inMelds[0] : null;
    if (!keeps && !inMelds.length && n >= 6) {
      SUIT_LETTERS.forEach(function (su) {
        var others = SUIT_LETTERS.filter(function (x) { return x !== su; });
        if (by[su] <= Math.floor(n * 0.1) && others.every(function (x) { return by[x] >= 2; })) keeps = su;
      });
    }
    var feeds = null;
    if (n >= 6) {
      var top = 0, tie = false;
      SUIT_LETTERS.forEach(function (su) {
        if (su === keeps) return;
        if (by[su] > top) { top = by[su]; feeds = su; tie = false; } else if (by[su] === top) tie = true;
      });
      if (tie || top < 3) feeds = null;
    }
    return { seat: o, keeps: keeps, feeds: feeds };
  }

  // The player after you (on your right: the only one who can chow your
  // discard). A chow in one number suit locks that suit immediately: they
  // need it to win. Otherwise, by the fifth discard, a suit they haven't
  // thrown while the others have gone is the one they're keeping. Each
  // chow or pung of that suit (`melds`) holds it more tightly.
  function afterRead(game, seat) {
    var o = (seat + 1) % 4;
    var s = game.hand.seats[o];
    var n = s.discards.length;
    var by = { c: 0, d: 0, b: 0 };
    s.discards.forEach(function (d) {
      var su = E.suitOfIndex(E.tileIndex(d.tile));
      if (by[su] !== undefined) by[su]++;
    });
    var danger = { c: 0, d: 0, b: 0 };
    var chowSuits = {};
    s.melds.forEach(function (m) {
      var su = meldSuit(m);
      if (su === 'z') return;
      danger[su]++;
      if (m.type === 'chow') chowSuits[su] = true;
    });
    var chowList = Object.keys(chowSuits);
    var numberSuits = SUIT_LETTERS.filter(function (su) { return danger[su]; });
    var keeps = null;
    var locked = false;
    if (chowList.length === 1 && numberSuits.length === 1) {
      keeps = chowList[0];
      locked = true;
    }
    if (!keeps && numberSuits.length <= 1 && n >= 5) {
      SUIT_LETTERS.forEach(function (su) {
        if (keeps) return;
        if (numberSuits.length && numberSuits[0] !== su) return;
        var others = SUIT_LETTERS.filter(function (x) { return x !== su; });
        var otherThrown = others.reduce(function (m, x) { return m + by[x]; }, 0);
        var clear = by[su] === 0 && otherThrown >= 3 && others.some(function (x) { return by[x] >= 2; });
        var sixth = n >= 6 && by[su] <= Math.floor(n * 0.1) && others.every(function (x) { return by[x] >= 2; });
        if (clear || sixth) keeps = su;
      });
    }
    return { seat: o, keeps: keeps, locked: locked, melds: keeps ? danger[keeps] : 0 };
  }

  // Tiles per number suit, counting sets already made (3 each).
  function suitCounts(counts, ctx) {
    var out = {};
    SUIT_LETTERS.forEach(function (su) {
      var inSuit = function (i) { return i < 27 && E.suitOfIndex(i) === su; };
      out[su] = countWhere(counts, inSuit) +
        ctx.melds.filter(function (m) { return inSuit(E.tileIndex(m.tiles[0])); }).length * 3;
    });
    return out;
  }

  // The suit to stay out of: the one the left player is collecting, when
  // another of your suits is about even with it (six or more, within a
  // tile). They won't throw its tiles, and they'd claim what you need.
  // Read from the whole hand before a discard, so every discard is weighed
  // against the same choice.
  function avoidSuit(counts, ctx) {
    var read = ctx.leftRead;
    if (!read || !read.keeps) return null;
    var n = suitCounts(counts, ctx);
    if (n[read.keeps] < 6) return null;
    var other = SUIT_LETTERS.some(function (su) {
      return su !== read.keeps && n[su] >= 6 && n[su] >= n[read.keeps] - 1;
    });
    return other ? read.keeps : null;
  }

  // How much to prefer a flush plan in one suit over another, given the
  // left player's read: their suit is one to stay out of (they'll keep its
  // tiles), and the suit they throw is one they'll feed you. Only the
  // choice between close plans changes; a plan's value doesn't. Together
  // they're worth about a tile (a step toward ready is ~2.4x), so between
  // two suits a tile apart, the read decides.
  var LEAN_AWAY = 0.6, LEAN_TOWARD = 1.5;
  function suitLean(plan, ctx) {
    var lean = ownLean(plan, ctx);
    if (!plan.suit || !/^(half|full)-/.test(plan.id)) return lean;
    var read = ctx.leftRead;
    if (read) {
      if (plan.suit === read.keeps) lean *= LEAN_AWAY;
      else if (plan.suit === read.feeds) lean *= LEAN_TOWARD;
    }
    // The player after you can chow this suit, so a flush in it is a way
    // to keep the tiles. It never overrides the left player's suit.
    var after = ctx.afterRead;
    if (after && after.keeps === plan.suit && (!read || read.keeps !== plan.suit)) {
      lean *= 1 + 0.2 * (1 + after.melds) + (after.locked ? 0.25 : 0);
    }
    return lean;
  }

  // What your own discards say you're building. After four, a suit you've
  // barely thrown is a suit you're keeping, a suit you've thrown a lot of is
  // one you've left, and honors going out point to a hand of runs.
  var OWN_KEEP = 1.25, OWN_LEFT = 0.75, OWN_RUNS = 1.15;
  function readOwnDiscards(list) {
    var by = { c: 0, d: 0, b: 0, z: 0 };
    list.forEach(function (d) {
      var i = E.tileIndex(d.tile);
      by[i < 27 ? E.suitOfIndex(i) : 'z']++;
    });
    return { n: list.length, by: by };
  }

  function ownLean(plan, ctx) {
    var own = ctx.ownRead;
    if (!own || own.n < 4) return 1;
    if (plan.id === 'straights') return own.by.z / own.n >= 0.4 ? OWN_RUNS : 1;
    if (!plan.suit || !/^(half|full)-/.test(plan.id)) return 1;
    var share = own.by[plan.suit] / own.n;
    return share <= 0.1 ? OWN_KEEP : share >= 0.4 ? OWN_LEFT : 1;
  }

  function buildContext(game, seat) {
    var s = game.hand.seats[seat];
    var melds = s.melds;
    var ctx = {
      game: game,
      seat: seat,
      seatWind: E.seatWind(game, seat),
      round: game.round,
      melds: melds,
      declared: melds.length,
      concealed: melds.every(function (m) { return m.concealed; }),
      hasChow: melds.some(function (m) { return m.type === 'chow'; }),
      meldSuits: {},
      flowers: s.flowers,
      unseen: E.unseenCounts(game, seat),
      wallLeft: game.hand.wall.length,
    };
    melds.forEach(function (m) { ctx.meldSuits[meldSuit(m)] = true; });
    ctx.unseenTotal = ctx.unseen.reduce(function (a, b) { return a + b; }, 0) || 1;
    ctx.drawsLeft = Math.max(1, ctx.wallLeft / 4);
    ctx.turn = s.discards.length;
    ctx.commit = readCommit(s);
    ctx.slope = valueSlope(game, seat);
    ctx.isDealer = seat === game.dealer;
    ctx.leftRead = leftRead(game, seat);
    ctx.afterRead = afterRead(game, seat);
    ctx.ownRead = readOwnDiscards(s.discards);
    ctx.track = readTable(game, seat, ctx.unseen);
    ctx.hazard = 1 - opponentThreats(game, seat).reduce(function (m, t) {
      return m * (1 - t.ready * WIN_PER_TURN);
    }, 1);
    if (H.context) H.context(ctx, game, seat);
    return ctx;
  }

  // Context after hypothetically adding a meld (for claim decisions).
  function withMeld(ctx, meld) {
    var next = {};
    Object.keys(ctx).forEach(function (k) { next[k] = ctx[k]; });
    next.melds = ctx.melds.concat([meld]);
    next.declared = ctx.declared + 1;
    next.concealed = ctx.concealed && !!meld.concealed;
    next.hasChow = ctx.hasChow || meld.type === 'chow';
    next.meldSuits = {};
    Object.keys(ctx.meldSuits).forEach(function (k) { next.meldSuits[k] = true; });
    next.meldSuits[meldSuit(meld)] = true;
    return next;
  }

  /* ------------------------------------------------------------------ *
   * 2. Value model
   *    Values are in "3-faan wins": a minimum hand won off a discard is 1,
   *    and a bigger hand is worth its real payout relative to that (each
   *    faan doubles it), so the bots play for the most points, not the most
   *    wins. Over 16,000 simulated hands this beat the old compressed scale
   *    (a 7-faan hand worth 3.4 instead of 16) by about 13 points a hand.
   * ------------------------------------------------------------------ */

  // Strategy knobs, so simulations can compare play styles (see setTuning).
  //   valuePower: a hand is valued at its real payout relative to a 3-faan
  //     hand, raised to this power (1 = the payout itself); null uses the
  //     old compressed straight line.
  //   defenseScale: how much more than that to weigh deal-in risk.
  //   lateFold: extra weight on safety once the wall is under lateFoldWall
  //     tiles and the hand is still 2 or more tiles from ready (unlikely to win).
  // Chosen by simulation for the most points per hand (see docs/strategies/lucky-cat.md).
  //   tripletsLive: on All Triplets, throw the tile with fewest copies left.
  //   chowSuitLate: near the end, how much more dangerous each chow an
  //     opponent has in a suit makes that suit's tiles.
  var BASE_TUNING = { valuePower: 1, defenseScale: 1.5, lateFold: 1.5, lateFoldWall: 45, tripletsLive: true, chowSuitLate: 0.5, keepLive: 0.01 };
  var DEFAULT_T = copy(BASE_TUNING);
  var T = DEFAULT_T;

  // The strategy's hooks (see createStrategy). The default strategy has none.
  var NO_HOOKS = {};
  var H = NO_HOOKS;

  function copy(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  function setTuning(next) {
    Object.keys(next || {}).forEach(function (k) { DEFAULT_T[k] = next[k]; });
    return DEFAULT_T;
  }

  // Payout of `f` faan relative to a 3-faan hand, on the full-spicy table
  // (each faan doubles it up to the 13-faan limit).
  function payoutRatio(f) {
    return Math.pow(2, Math.min(f, 13) - 3);
  }

  function handValue(f, slope) {
    if (f < 3) return Math.pow(0.45, 3 - f);
    if (T.valuePower !== null) {
      // Early in the hand a big hand is worth more of its payout; later less.
      var power = T.valuePower * ((slope || VALUE_SLOPE) / VALUE_SLOPE);
      return Math.pow(payoutRatio(Math.min(f, ESTIMATE_FAAN_CAP)), power);
    }
    return 1 + (slope || VALUE_SLOPE) * (Math.min(f, ESTIMATE_FAAN_CAP) - 3);
  }

  // Axis A: how much extra faan is worth right now. Early in the hand a
  // bigger hand is worth building toward; later, or when an opponent shows a
  // big hand, finishing first matters more.
  function valueSlope(game, seat) {
    var turn = game.hand.seats[seat].discards.length;
    var slope = turn <= 5 ? 0.75 : turn <= 9 ? 0.6 : 0.45;
    var bigThreat = game.hand.seats.some(function (o, k) {
      if (k === seat) return false;
      return o.melds.length >= 2 && o.melds.some(function (m) {
        var i = E.tileIndex(m.tiles[0]);
        return m.type !== 'chow' && i >= 27;
      });
    });
    return bigThreat ? Math.min(slope, 0.45) : slope;
  }

  /* ------------------------------------------------------------------ *
   * 3. Plans and faan estimates
   * ------------------------------------------------------------------ */

  function baseFaan(ctx) {
    var f = flowerPoints(ctx);
    ctx.melds.forEach(function (m) {
      if (m.type === 'chow') return;
      f += valueWeight(ctx, E.tileIndex(m.tiles[0]));
    });
    return f;
  }

  function handYaku(ctx, c) {
    var f = 0;
    var dragonSets = 0, dragonPairs = 0;
    ctx.melds.forEach(function (m) {
      if (m.type !== 'chow' && DRAGONS.indexOf(E.tileIndex(m.tiles[0])) !== -1) dragonSets++;
    });
    for (var i = 27; i < 34; i++) {
      var w = valueWeight(ctx, i);
      if (c[i] >= 3) {
        f += w;
        if (DRAGONS.indexOf(i) !== -1) dragonSets++;
      } else if (c[i] === 2) {
        if (w) f += w * (ctx.unseen[i] >= 1 ? 0.45 : 0.1);
        if (DRAGONS.indexOf(i) !== -1) dragonPairs++;
      }
    }
    if (dragonSets === 3) f += 5;
    else if (dragonSets === 2 && dragonPairs >= 1) f += 2.5;
    return f;
  }

  function restrict(c, keep) {
    var out = c.slice();
    for (var i = 0; i < 34; i++) if (!keep(i)) out[i] = 0;
    return out;
  }

  function countWhere(c, keep) {
    var n = 0;
    for (var i = 0; i < 34; i++) if (keep(i)) n += c[i];
    return n;
  }

  // Faan a hand already holds from its flowers, scored as points.js does:
  // No Flowers is 1; otherwise your seat's flower and season are 1 each, and
  // a full set of four flowers (or seasons) is 2 in place of the seat one.
  function flowerPoints(ctx) {
    var f = ctx.flowers;
    if (!f.length) return 1;
    var seat = ctx.seatWind;
    var has = function (id) { return f.indexOf(id) !== -1; };
    var group = function (letter) {
      var all = [1, 2, 3, 4].every(function (n) { return has(letter + n); });
      return all ? 2 : has(letter + seat) ? 1 : 0;
    };
    return group('f') + group('s');
  }

  // Faan a hand is sure of however it finishes: its flowers and seasons
  // (or No Flowers) and the dragon or scoring-wind sets already shown
  // (baseFaan). A cheap hand wins when that already reaches the minimum,
  // or falls one short while every meld is a chow: All Sequences (runs, no
  // honors) still adds the last faan, off a discard too. (With a pung down
  // only a self-draw could, which isn't enough to build on.)
  function cheapWin(ctx) {
    var min = ctx.game.settings.minFaan;
    var sure = baseFaan(ctx);
    if (sure >= min) return true;
    var runsOnly = ctx.melds.every(function (m) { return m.type === 'chow'; });
    return sure >= min - 1 && runsOnly;
  }

  // Once you've exposed a chow, a hand of mixed suits usually can't reach
  // the 3-faan minimum (it has given up Concealed, and All Sequences needs
  // the rest from somewhere else), so the way forward is a flush in the
  // chow's suit and every tile of another suit is worth nothing. Not when
  // flowers and sets already give all but one faan (cheapWin): then a mixed
  // hand still wins. Open melds in two number suits (where no flush is
  // left) don't commit either. Returns that suit, or null.
  function chowCommitment(ctx) {
    if (!ctx.hasChow) return null;
    if (cheapWin(ctx)) return null;
    var suits = Object.keys(ctx.meldSuits).filter(function (k) { return k !== 'z'; });
    return suits.length === 1 ? suits[0] : null;
  }

  // Hands that need their tiles from more than one suit, or a fixed shape:
  // the one-suit rule leaves their discard order alone.
  var MIXED_PLANS = ['pairs', 'orphans', 'gates', 'terminals', 'honors', 'winds'];
  var SUIT_MAJORITY = 7;

  // Tiles of one suit already yours: the hand, plus 3 for each meld of it.
  // A kong's fourth tile is not counted.
  function suitHeld(ctx, counts, su) {
    var n = countWhere(counts, function (i) { return i < 27 && E.suitOfIndex(i) === su; });
    ctx.melds.forEach(function (m) {
      var ti = E.tileIndex(m.tiles[0]);
      if (ti < 27 && E.suitOfIndex(ti) === su) n += 3;
    });
    return n;
  }

  function chowSuitReady(ctx, counts, su) {
    return suitHeld(ctx, counts, su) >= SUIT_MAJORITY;
  }

  // The suit the hand is clearly going for, if any: after a chow, the chow's
  // suit; otherwise one suit holding 7 or more of the hand's tiles, more than
  // any other suit (sets already made count). Tiles of the other two suits
  // are then thrown first. Not while the hand is going for Concealed
  // Straights (it drops honors instead), a hand in MIXED_PLANS, or a strategy's
  // own hand of 1s, 9s and honors (ctx.mixedHand).
  function suitCommitment(ctx, counts) {
    var chow = chowCommitment(ctx);
    if (chow) return chow;
    if (ctx.mixedHand) return null;
    var lead = ctx.leadPlan;
    if (lead && (lead.id === 'straights' || MIXED_PLANS.indexOf(lead.id) !== -1)) return null;
    var other = Object.keys(ctx.meldSuits).filter(function (k) { return k !== 'z'; });
    if (other.length > 1) return null;
    var best = null, bestN = 0, tie = false, bySuit = {};
    for (var s = 0; s < 3; s++) {
      var su = SUIT_LETTERS[s];
      var n = suitHeld(ctx, counts, su);
      bySuit[su] = n;
      if (n > bestN) { best = su; bestN = n; tie = false; } else if (n === bestN) tie = true;
    }
    // Two suits about even (within a tile): the flush the hand is building
    // decides, which leans away from the suit the left player keeps.
    var leadSuit = lead && /^(half|full)-/.test(lead.id) ? lead.suit : null;
    if (leadSuit && bestN >= SUIT_MAJORITY && bySuit[leadSuit] >= SUIT_MAJORITY - 1 && bySuit[leadSuit] >= bestN - 1) {
      best = leadSuit;
      bestN = bySuit[leadSuit];
      tie = false;
    }
    if (!best || tie || bestN < SUIT_MAJORITY) return null;
    if (other.length && other[0] !== best) return null;
    return best;
  }

  // On Concealed Straights the hand keeps at most one honor pair, as its
  // pair (eyes); every other honor goes. A dragon or scoring-wind pair is
  // kept ahead of another. Returns that pair's index, or null.
  function keptHonorPair(counts, ctx) {
    var best = null;
    for (var i = 27; i < 34; i++) {
      if (counts[i] !== 2) continue;
      if (best === null || valueWeight(ctx, i) > valueWeight(ctx, best)) best = i;
    }
    return best;
  }

  // A dragon nobody has shown can still become the pair, so Concealed
  // Straights holds it until an honor pair is already kept.
  function holdsDragon(game, i, shanten) {
    return DRAGONS.indexOf(i) !== -1 && revealedCopies(game, i) === 0 && shanten > 0;
  }

  // A single dragon with the other three copies still unseen: the most
  // versatile tile in the game, so it's only thrown to make the hand ready.
  function loneDragon(game, counts, i) {
    return DRAGONS.indexOf(i) !== -1 && counts[i] === 1 && revealedCopies(game, i) === 0;
  }

  // A chow in some other suit has already given up All Triplets, so this
  // pair is no longer an eye you can pivot with. No such chow, and the pair
  // stays until the singles are gone.
  function chowOfAnotherSuit(ctx, i) {
    if (i >= 27) return false;
    var suit = E.suitOfIndex(i);
    return ctx.melds.some(function (m) {
      if (m.type !== 'chow') return false;
      return E.suitOfIndex(E.tileIndex(m.tiles[0])) !== suit;
    });
  }

  // The discard rules every strategy follows, ahead of its own order: after
  // a chow, or with most of the hand in one suit, other suits go first
  // (group 0: even while folding). A pair of another suit waits behind those
  // singles: it is still an eye, and a pung if the hand pivots to All
  // Triplets, unless a chow of a different suit has closed that hand. On
  // Concealed Straights, every honor but one pair and a dragon nobody has
  // shown goes first (group -1: while folding, safety decides). Null when
  // neither applies.
  function sharedPriority(game, ctx, counts, candidate) {
    var i = candidate.index;
    var lead = ctx.leadPlan;
    if (lead && lead.id === 'straights' && !ctx.hasChow) {
      var eyes = keptHonorPair(counts, ctx);
      return i >= 27 && i !== eyes && !holdsDragon(game, i, candidate.shanten) ? -1 : null;
    }
    var committed = suitCommitment(ctx, counts);
    if (committed && i < 27 && E.suitOfIndex(i) !== committed) {
      if (counts[i] === 2 && !chowOfAnotherSuit(ctx, i)) return null;
      return 0;
    }
    return null;
  }

  // Exact concealed pairs, and whether a concealed pung or kong is in hand.
  function concealedShape(c) {
    var pairs = 0;
    var hasSet = false;
    for (var i = 0; i < 34; i++) {
      if (c[i] >= 3) hasSet = true;
      else if (c[i] === 2) pairs++;
    }
    return { pairs: pairs, hasSet: hasSet };
  }

  // Seven Pairs once the concealed hand holds more than four pairs and no
  // pung or kong. Any meld, including a chow, makes the pattern impossible.
  function chaseSevenPairs(c, ctx) {
    // A hand that still holds a pung or kong is not on this plan, even if
    // shedding one tile would leave five pairs.
    if (ctx.blockSevenPairs) return false;
    if (ctx.declared) return false;
    if (ctx.melds.some(function (m) { return m.type === 'pung' || m.type === 'kong'; })) return false;
    var shape = concealedShape(c);
    return !shape.hasSet && shape.pairs > 4;
  }

  var ORPHAN_INDEXES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  var GATES_NEED = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  var SUIT_LETTERS = ['c', 'd', 'b'];

  function isOrphanIndex(i) {
    return ORPHAN_INDEXES.indexOf(i) !== -1;
  }

  // Progress toward Thirteen Orphans: one for each different terminal or
  // honor, plus one for a pair. (13 minus this is the hand's shanten.)
  function orphanProgress(c) {
    var kinds = 0, pair = 0;
    ORPHAN_INDEXES.forEach(function (i) {
      if (c[i]) kinds++;
      if (c[i] >= 2) pair = 1;
    });
    return kinds + pair;
  }

  // Worth chasing only while every missing terminal and honor is still live.
  function orphansAlive(c, ctx) {
    return ORPHAN_INDEXES.every(function (i) { return c[i] || ctx.unseen[i] > 0; });
  }

  function nineGatesProgress(c, start) {
    var n = 0;
    for (var r = 0; r < 9; r++) n += Math.min(c[start + r] || 0, GATES_NEED[r]);
    return n;
  }

  function nineGatesShanten(start) {
    return function (counts, declared) {
      if (declared) return Infinity;
      var have = 0;
      var junk = 0;
      var total = 0;
      for (var i = 0; i < 34; i++) {
        var n = counts[i];
        if (!n) continue;
        total += n;
        var offset = i - start;
        if (offset < 0 || offset > 8) { junk += n; continue; }
        have += Math.min(n, GATES_NEED[offset]);
      }
      if (have >= 13 && junk === 0 && total >= 14) return -1;
      return 13 - have;
    };
  }

  // This copy is one of the 1112345678999 tiles, not a spare and not another suit.
  function gatesTileNeeded(counts, start, i) {
    var offset = i - start;
    if (offset < 0 || offset > 8) return false;
    return counts[i] <= GATES_NEED[offset];
  }

  function makeSpecialPlan(kind, c, ctx, gates) {
    if (kind === 'pairs') {
      return {
        id: 'pairs', label: 'Seven Pairs', counts: c, shantenFn: E.sevenPairsShanten,
        faan: baseFaan(ctx) + 4 + pairsFlush(c), open: false,
      };
    }
    if (kind === 'orphans') {
      return {
        id: 'orphans', label: 'Thirteen Orphans', counts: c, shantenFn: E.orphansShanten,
        faan: 13, open: false,
      };
    }
    return {
      id: 'gates', suit: gates.suit, start: gates.start, label: 'Nine Gates',
      counts: c, shantenFn: nineGatesShanten(gates.start), faan: 13, open: false,
    };
  }

  // Seven Pairs scores a flush too: 3 for one suit with honors, 7 for one
  // suit alone, once the pairs already held are all in it.
  function pairsFlush(c) {
    var suits = {}, honors = false;
    for (var i = 0; i < 34; i++) {
      if (c[i] < 2) continue;
      if (i >= 27) honors = true; else suits[E.suitOfIndex(i)] = true;
    }
    var n = Object.keys(suits).length;
    if (n !== 1) return 0;
    return honors ? 3 : 7;
  }

  // Copies already on the table: the pond, and every open meld.
  function revealedCopies(game, i) {
    var n = 0;
    game.hand.seats.forEach(function (s) {
      s.discards.forEach(function (d) {
        if (!d.claimed && E.tileIndex(d.tile) === i) n++;
      });
      s.melds.forEach(function (m) {
        if (m.concealed) return;
        m.tiles.forEach(function (id) {
          if (E.tileIndex(id) === i) n++;
        });
      });
    });
    return n;
  }

  // An open pung or kong of this tile is on the table. The last copy can't be
  // punged or paired by anyone. For an honor that makes it completely safe;
  // a number tile can still finish someone's chow (see deadTile).
  function isPungTile(game, i) {
    var id = E.tileId(i);
    for (var s = 0; s < 4; s++) {
      var melds = game.hand.seats[s].melds;
      for (var m = 0; m < melds.length; m++) {
        var meld = melds[m];
        if (meld.concealed) continue;
        if ((meld.type === 'pung' || meld.type === 'kong') && meld.tiles[0] === id) return true;
      }
    }
    return false;
  }

  // Lower is thrown first. The shared one-suit rules (sharedPriority) come
  // before everything, then the strategy's own order (H.priority), then
  // this one: a punged tile the hand does not need, ordinary tiles, pairs,
  // and an unrevealed dragon longer still, unless the hand is chasing Seven
  // Pairs and that dragon is only a single. All Triplets keeps every pair
  // and every pung: those wait behind any single, and a finished pung waits
  // behind a pair.
  function discardPriority(game, ctx, counts, candidate, bestShanten) {
    var shared = sharedPriority(game, ctx, counts, candidate);
    if (shared !== null) return shared;
    if (H.priority) {
      var own = H.priority(game, ctx, counts, candidate, bestShanten);
      if (own !== null && own !== undefined) return own;
    }
    var i = candidate.index;
    if (isPungTile(game, i) && counts[i] < 2 && candidate.shanten <= bestShanten) return 1;
    var best = candidate.analysis && candidate.analysis.best;
    var plan = best && best.plan;
    if (plan && !best.readyBest && SETS_PLANS.indexOf(plan.id) !== -1 && counts[i] >= 2) {
      return counts[i] >= 3 ? 7 : 6;
    }
    // Early in the hand, an honor that can still become a set is one of the
    // hand's most valuable tiles: it waits like a pair, and a dragon or your
    // own or the round's wind waits longer still. (Seven Pairs only needs
    // its pairs, so singles can go there.)
    if (i >= 27 && ctx.wallLeft > EARLY_WALL && revealedCopies(game, i) < 2 && !chaseSevenPairs(counts, ctx)) {
      var value = valueWeight(ctx, i) > 0;
      if (counts[i] >= 2) return value ? 5 : 4;
      return value ? 4 : 3;
    }
    var dragon = DRAGONS.indexOf(i) !== -1 && revealedCopies(game, i) < 1;
    var pair = counts[i] === 2;
    if (dragon && pair) return 5;
    if (dragon) return chaseSevenPairs(counts, ctx) ? 3 : 4;
    if (pair) return 3;
    return 2;
  }

  // Candidate plans for a 13-tile (waiting to draw) concealed portion.
  // Fundamentals' own hands: the usual ones, and Seven Pairs when it's close.
  function foundationPlans(c, ctx) {
    var list = basePlans(c, ctx);
    if (chaseSevenPairs(c, ctx)) list.push(makeSpecialPlan('pairs', c, ctx));
    return list;
  }

  function plansFor(c, ctx) {
    var list = aimablePlans(H.plans ? H.plans(c, ctx) : foundationPlans(c, ctx), c, ctx);
    // The plan the hand committed to stays on the table until it's justified
    // to leave it, whatever else a strategy's list reaches for this turn.
    var key = ctx.commit && ctx.commit.key;
    if (!key || T.ownPlans || ctx.planFixed || list.some(function (p) { return planFamily(p.id) === key; })) return list;
    return list.concat(plansOfFamily(c, ctx, key));
  }

  // No strategy aims for a chicken hand: the plain hand only stays a plan
  // once flowers, sets and the like already give it the minimum faan. If
  // nothing else can be finished, a flush or All Triplets takes its place.
  // (With melds that rule those out too, the plain hand is all that's left.)
  function aimablePlans(plans, c, ctx) {
    var min = ctx.game.settings.minFaan;
    var scoring = plans.filter(function (p) { return p.id !== 'plain' || p.faan >= min; });
    if (scoring.length === plans.length) return plans;
    var finishable = function (p) { return !p.upgrade && p.shantenFn(p.counts, ctx.declared) !== Infinity; };
    if (scoring.some(finishable)) return scoring;
    var forced = scoringPlans(c, ctx);
    return forced.length ? scoring.concat(forced) : plans;
  }

  // The flush in the hand's best open suit, and All Triplets, however far off.
  function scoringPlans(c, ctx) {
    var base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var out = [];
    var suitN = suitCounts(c, ctx);
    var open = ['c', 'd', 'b'].filter(function (su) {
      return !Object.keys(ctx.meldSuits).some(function (k) { return k !== su && k !== 'z'; });
    });
    if (open.length) {
      var su = open.reduce(function (m, x) { return suitN[x] > suitN[m] ? x : m; }, open[0]);
      var kept = restrict(c, function (i) { return E.suitOfIndex(i) === su || i >= 27; });
      out.push({
        id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su],
        counts: kept, shantenFn: E.standardShanten,
        faan: base + 3 + handYaku(ctx, kept), open: true,
      });
    }
    if (!ctx.hasChow) {
      out.push({ id: 'triplets', label: 'All Triplets', counts: c, shantenFn: E.tripletsShanten, faan: base + 3 + handYaku(ctx, c), open: true });
    }
    return out;
  }

  // The usual hands: standard, Concealed Straights, the flushes and All
  // Triplets. (Seven Pairs, Thirteen Orphans and Nine Gates are up to each
  // strategy: see makeSpecialPlan.)
  function basePlans(c, ctx) {
    var base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var yaku = handYaku(ctx, c);
    var plans = [];

    var committed = chowCommitment(ctx, c);
    if (committed) {
      // Only the chow's suit (and honors) count. Tiles of other suits fall
      // out of every plan, so they're the first to go.
      var inSuitHalf = function (i) { return E.suitOfIndex(i) === committed || i >= 27; };
      var inSuitFull = function (i) { return E.suitOfIndex(i) === committed; };
      plans.push({
        id: 'half-' + committed, suit: committed, label: 'a Half Flush in ' + SUIT_LABELS[committed],
        counts: restrict(c, inSuitHalf), shantenFn: E.standardShanten,
        faan: base + 3 + handYaku(ctx, restrict(c, inSuitHalf)), open: true,
      });
      if (!ctx.meldSuits.z) {
        plans.push({
          id: 'full-' + committed, suit: committed, label: 'a Full Flush in ' + SUIT_LABELS[committed],
          counts: restrict(c, inSuitFull), shantenFn: E.standardShanten,
          faan: base + 7, open: true,
        });
      }
      return plans;
    }

    plans.push({ id: 'plain', label: 'a standard hand', counts: c, shantenFn: E.standardShanten, faan: base + yaku, open: true });
    // After chows (and no sets), All Sequences is still a faan: runs only,
    // no honors. With flowers that's often the last faan a hand needs.
    var allChows = ctx.declared > 0 && ctx.melds.every(function (m) { return m.type === 'chow'; });
    if (allChows) {
      plans.push({
        id: 'runs', label: 'All Sequences', counts: restrict(c, function (i) { return i < 27; }),
        shantenFn: E.standardShanten, faan: base + 1, open: true,
      });
    }
    // Concealed Straights: runs only, and nothing claimed. Honors are
    // discarded, except one honor pair, which can be the hand's pair (it
    // then scores Concealed but not All Sequences).
    // (Not while the hand holds a set of honors, which can never be thrown
    // away to make an all-runs hand.)
    var honorSet = false;
    for (var hs = 27; hs < 34; hs++) if (c[hs] >= 3) honorSet = true;
    if (!ctx.declared && !honorSet) {
      var eyes = keptHonorPair(c, ctx);
      plans.push({
        id: 'straights',
        label: 'Concealed Straights',
        counts: restrict(c, function (i) { return i < 27 || i === eyes; }),
        shantenFn: E.standardShanten,
        faan: base + (eyes === null ? 1 : 0),
        open: false,
      });
    }

    // Sets already made count toward "most of the hand" (3 tiles each).
    var setTiles = function (fits) {
      return ctx.melds.filter(function (m) { return fits(E.tileIndex(m.tiles[0])); }).length * 3;
    };
    var suitN = suitCounts(c, ctx);
    var topN = Math.max(suitN.c, suitN.d, suitN.b);
    // The left player's read (leftRead): no flush in the suit they're
    // collecting when another is about even (avoidSuit), and the other
    // suit, or the one they're throwing, counts from six tiles when close.
    var read = ctx.leftRead;
    var avoid = ctx.avoidSuit !== undefined ? ctx.avoidSuit : avoidSuit(c, ctx);
    var close = function (su) { return suitN[su] >= 6 && suitN[su] >= topN - 1; };
    ['c', 'd', 'b'].forEach(function (su) {
      var offSuit = Object.keys(ctx.meldSuits).some(function (k) { return k !== su && k !== 'z'; });
      if (offSuit || su === avoid) return;
      var inHalf = function (i) { return E.suitOfIndex(i) === su || i >= 27; };
      var inFull = function (i) { return E.suitOfIndex(i) === su; };
      var afterKeep = ctx.afterRead && ctx.afterRead.keeps === su;
      var min = close(su) && (avoid || (read && read.feeds === su) || afterKeep) ? 6 : 7;
      if (countWhere(c, inHalf) + setTiles(inHalf) >= 7) {
        plans.push({
          id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su],
          counts: restrict(c, inHalf), shantenFn: E.standardShanten,
          faan: base + 3 + handYaku(ctx, restrict(c, inHalf)), open: true,
        });
      }
      if (!ctx.meldSuits.z && countWhere(c, inFull) + setTiles(inFull) >= min) {
        plans.push({
          id: 'full-' + su, suit: su, label: 'a Full Flush in ' + SUIT_LABELS[su],
          counts: restrict(c, inFull), shantenFn: E.standardShanten,
          faan: base + 7, open: true,
        });
      }
    });

    if (!ctx.hasChow) {
      var pairish = 0;
      for (var i = 0; i < 34; i++) if (c[i] >= 2) pairish++;
      if (pairish + ctx.declared >= 3) {
        plans.push({ id: 'triplets', label: 'All Triplets', counts: c, shantenFn: E.tripletsShanten, faan: base + 3 + yaku, open: true });
        var pungsHeld = 0;
        for (var q = 0; q < 34; q++) if (c[q] >= 3) pungsHeld++;
        if (ctx.declared === 0 && pungsHeld >= 2) {
          plans.push({ id: 'concealed-triplets', label: 'Concealed Triplets', counts: c, shantenFn: E.tripletsShanten, faan: base - 1 + 10, open: false });
        }
      }
    }

    return plans.concat(upgradePlans(c, ctx));
  }

  /* ------------------------------------------------------------------ *
   * 3b. Upgrades: bigger hands made of the same tiles
   *    A hand of sets can often score more by keeping only certain tiles:
   *    Mixed Orphans (terminals and honors, +1 on All Triplets), All
   *    Terminals, All Honors, Small or Big Three Dragons, and Small or Big
   *    Four Winds; Seven Pairs the same way. Each is a plan of its own, and
   *    while one is within a step of the hand's best shape its tiles are
   *    kept ahead of tiles it can't use (even with fewer copies left), unless
   *    no copy is left to finish it (see upgradeOrder).
   * ------------------------------------------------------------------ */

  var TERMINALS = [0, 8, 9, 17, 18, 26];
  var WINDS = [27, 28, 29, 30];
  var LIMIT = 13;
  var isTerminal = function (i) { return TERMINALS.indexOf(i) !== -1; };
  var isHonor = function (i) { return i >= 27; };
  var isDragon = function (i) { return DRAGONS.indexOf(i) !== -1; };
  var isWind = function (i) { return WINDS.indexOf(i) !== -1; };

  // A restricted plan can't be ready with fewer than 13 of its tiles.
  function filled(fn) {
    return function (c, declared) {
      var held = 0;
      for (var i = 0; i < 34; i++) held += c[i];
      return Math.max(fn(c, declared), 3 * (4 - (declared || 0)) + 1 - held);
    };
  }

  // Tiles held plus sets made, of the kind `fits` keeps.
  function tilesOf(c, ctx, fits) {
    var n = countWhere(c, fits);
    ctx.melds.forEach(function (m) { if (fits(E.tileIndex(m.tiles[0]))) n += 3; });
    return n;
  }

  // Held or melded copies of a tile (a set counts as three).
  function setCount(c, ctx, i) {
    var n = c[i];
    ctx.melds.forEach(function (m) { if (m.type !== 'chow' && E.tileIndex(m.tiles[0]) === i) n = 3; });
    return n;
  }

  // A tile a hand of sets can't finish: a single with no copy left, or a
  // pair with no copy left while another pair can be the hand's pair.
  function deadForSets(c, ctx, i, fits) {
    if (c[i] >= 3 || ctx.unseen[i] > 0) return false;
    if (c[i] === 1) return true;
    for (var j = 0; j < 34; j++) if (j !== i && c[j] === 2 && fits(j)) return true;
    return false;
  }

  function liveOnly(c, ctx, fits) {
    var out = restrict(c, fits);
    for (var i = 0; i < 34; i++) if (out[i] && deadForSets(out, ctx, i, fits)) out[i] = 0;
    return out;
  }

  // Shanten for a hand that needs sets of particular honors (all of
  // `group` but `pairs` as pungs, the rest as the pair) plus anything for
  // the remaining sets. Infinity when a needed tile has run out.
  function groupShanten(ctx, group, pungs, pair) {
    var done = ctx.melds.filter(function (m) { return m.type !== 'chow' && group.indexOf(E.tileIndex(m.tiles[0])) !== -1; });
    var doneIdx = done.map(function (m) { return E.tileIndex(m.tiles[0]); });
    return function (c, declared) {
      var open = group.filter(function (i) { return doneIdx.indexOf(i) === -1; })
        .sort(function (a, b) { return c[b] - c[a]; });
      var needPungs = pungs - doneIdx.length;
      if (needPungs < 0 || needPungs > open.length) return Infinity;
      var deficit = 0;
      var rest = c.slice();
      group.forEach(function (i) { rest[i] = 0; });
      for (var k = 0; k < needPungs; k++) {
        var i = open[k];
        if (c[i] + ctx.unseen[i] < 3) return Infinity;
        deficit += Math.max(0, 3 - c[i]);
      }
      if (pair) {
        var p = open[needPungs];
        if (p === undefined || c[p] + ctx.unseen[p] < 2) return Infinity;
        deficit += Math.max(0, 2 - c[p]);
        rest[p] = 2; // stands in for the pair, so the rest needs only sets
      }
      var sets = (declared || 0) + needPungs;
      if (sets > 4) return Infinity;
      return deficit + E.standardShanten(rest, sets);
    };
  }

  // Mixed Orphans, All Terminals and All Honors as triplets. As a bigger hand
  // from the same tiles, each needs eight of its tiles and two pairs already;
  // with `any`, a strategy that sets out for them gets them from any hand.
  function setUpgrades(c, ctx, any) {
    var base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var plans = [];
    if (ctx.hasChow) return plans;
    var meldsFit = function (fits) {
      return ctx.melds.every(function (m) { return m.type !== 'chow' && fits(E.tileIndex(m.tiles[0])); });
    };
    var orphan = function (i) { return isTerminal(i) || isHonor(i); };
    var pairsOf = function (fits) {
      var n = ctx.declared;
      for (var i = 0; i < 34; i++) if (fits(i) && c[i] >= 2) n++;
      return n;
    };
    var fitsHand = function (fits) {
      return meldsFit(fits) && (any || (tilesOf(c, ctx, fits) >= 8 && pairsOf(fits) >= 2));
    };
    var setsPlan = function (id, label, fits, faan, reason, hint) {
      var kept = liveOnly(c, ctx, fits);
      plans.push({
        id: id, label: label, counts: kept, shantenFn: filled(E.tripletsShanten),
        faan: Math.min(LIMIT, faan(kept)), open: true, keep: fits, favors: fits, reason: reason, hint: hint, upgrade: true,
      });
    };
    // (With no honors it's All Terminals; with no terminals, All Honors.)
    var both = tilesOf(c, ctx, isHonor) > 0 && tilesOf(c, ctx, isTerminal) > 0;
    if (fitsHand(orphan) && both) {
      setsPlan('mixed-orphans', 'Mixed Orphans', orphan, function (k) { return base + 3 + 1 + handYaku(ctx, k); },
        'Mixed Orphans uses only 1s, 9s and honors.', 'keep your 1s, 9s and honors');
    }
    if (fitsHand(isTerminal)) {
      setsPlan('all-terminals', 'All Terminals', isTerminal, function () { return LIMIT; },
        'All Terminals uses only 1s and 9s.', 'keep your 1s and 9s');
    }
    if (fitsHand(isHonor)) {
      setsPlan('all-honors', 'All Honors', isHonor, function (k) { return base + 10 + handYaku(ctx, k); },
        'All Honors uses only honors.', 'keep your honors');
    }
    return plans;
  }

  // The upgrades this hand could still make, as plans.
  function upgradePlans(c, ctx) {
    var base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var plans = setUpgrades(c, ctx);
    // Three Dragons and Four Winds: sets of those honors, the rest anything.
    var groupPlan = function (id, label, group, pungs, pair, faan, hint) {
      var fn = groupShanten(ctx, group, pungs, pair);
      if (fn(c, ctx.declared) === Infinity) return;
      plans.push({
        id: id, label: label, counts: c, shantenFn: fn, faan: Math.min(LIMIT, faan), open: true,
        favors: function (i) { return group.indexOf(i) !== -1; }, hint: hint, upgrade: true,
      });
    };
    var have = function (group, n) {
      return group.filter(function (i) { return setCount(c, ctx, i) >= n; }).length;
    };
    var windYaku = handYaku(ctx, restrict(c, isWind));
    var dragonYaku = handYaku(ctx, restrict(c, isDragon));
    var dragons = tilesOf(c, ctx, isDragon);
    if (dragons >= 5 && have(DRAGONS, 2) >= 2) {
      groupPlan('small-dragons', 'Small Three Dragons', DRAGONS, 2, true, base + 5 + windYaku, 'keep your dragons');
    }
    if (dragons >= 6 && have(DRAGONS, 2) === 3) {
      groupPlan('big-dragons', 'Big Three Dragons', DRAGONS, 3, false, base + 8 + windYaku, 'pung all three dragons');
    }
    var winds = tilesOf(c, ctx, isWind);
    if (winds >= 8 && have(WINDS, 2) >= 3) {
      groupPlan('small-winds', 'Small Four Winds', WINDS, 3, true, base + 6 + dragonYaku, 'keep your winds');
    }
    if (winds >= 9 && have(WINDS, 2) === 4) {
      groupPlan('big-winds', 'Big Four Winds', WINDS, 4, false, LIMIT, 'pung all four winds');
    }
    return plans;
  }

  // Seven Pairs of terminals and honors: Mixed Orphans on top of the pairs,
  // or a limit hand in honors alone or terminals alone. As with setUpgrades,
  // `any` drops what they need in hand already.
  function pairsUpgrades(c, ctx, any) {
    if (ctx.declared) return [];
    var out = [];
    var pairs = function (fits) {
      var n = 0;
      for (var i = 0; i < 34; i++) if (fits(i) && c[i] >= 2) n++;
      return n;
    };
    var add = function (id, label, fits, faan, reason, hint) {
      if (!any && (countWhere(c, fits) < 8 || pairs(fits) < 3)) return;
      out.push({
        id: id, label: label, counts: restrict(c, fits), shantenFn: filled(E.sevenPairsShanten),
        faan: Math.min(LIMIT, faan), open: false, keep: fits, favors: fits, reason: reason, hint: hint, upgrade: true, pairs: true,
      });
    };
    var orphan = function (i) { return isTerminal(i) || isHonor(i); };
    add('pairs-orphans', 'Seven Pairs with Mixed Orphans', orphan, baseFaan(ctx) + 4 + 1,
      'Mixed Orphans uses only 1s, 9s and honors.', 'pair your 1s, 9s and honors');
    add('pairs-honors', 'Seven Pairs in All Honors', isHonor, LIMIT, 'All Honors uses only honors.', 'pair your honors');
    add('pairs-terminals', 'Seven Pairs in All Terminals', isTerminal, LIMIT, 'All Terminals uses only 1s and 9s.', 'pair your 1s and 9s');
    return out;
  }

  // The upgrade the hand still has (the best within a step of its best
  // shape), from its 14 tiles. Null when there's none.
  function liveUpgrade(c, ctx) {
    var list = upgradePlans(c, ctx);
    if (chaseSevenPairs(c, ctx)) list = list.concat(pairsUpgrades(c, ctx));
    if (!list.length) return null;
    var best = Math.min(E.standardShanten(c, ctx.declared), E.tripletsShanten(c, ctx.declared),
      ctx.declared ? Infinity : E.sevenPairsShanten(c, 0));
    var pick = null, pickValue = -Infinity;
    list.forEach(function (p) {
      var s = p.shantenFn(p.counts, ctx.declared);
      p.hard = isHardTarget(p, s, best, c, ctx);
      if (s > best + (p.hard ? HARD_REACH : 1)) return;
      // Each faan doubles the payout; each step away is worth about 0.42x.
      var value = p.faan - STEP_IN_FAAN * s;
      if (value > pickValue) { pick = p; pickValue = value; }
    });
    return pick;
  }

  // A big hand made of only certain tiles (All Terminals, All Honors) is
  // worth playing for from further away than a small upgrade, so while one
  // can still be made it becomes the hand's target (see upgradeOrder). Not
  // once the hand is ready, late in the wall, or with too few of its tiles
  // live. Strategies with targets of their own (ctx.target, ctx.lockedSpecial)
  // already commit, and one that won't leave a ready hand sets ctx.holdsReady.
  var HARD_FAAN = 10, HARD_REACH = 3, STEP_IN_FAAN = 1.25;
  function isHardTarget(p, s, best, c, ctx) {
    if (!p.keep || p.faan < HARD_FAAN || ctx.target || ctx.lockedSpecial || ctx.holdsReady) return false;
    if (s === Infinity || s > best + HARD_REACH || ctx.drawsLeft < 2 * s) return false;
    if (best <= 0 && s > 1) return false;
    var sets = 0, pairs = 0;
    for (var i = 0; i < 34; i++) {
      if (!p.keep(i)) continue;
      var n = c[i] + ctx.unseen[i];
      if (n >= 3) sets++;
      if (n >= 2) pairs++;
    }
    if (p.pairs) return pairs >= 7;
    return sets >= 4 - ctx.declared && pairs >= 5 - ctx.declared;
  }

  // The restricted hand the discards serve: a big one the hand has set out
  // for, or any the best discard is already building toward.
  function discardTarget(ctx) {
    var up = ctx.upgrade, lead = ctx.leadPlan;
    if (up && up.hard) return up;
    return lead && lead.upgrade && lead.keep && !ctx.leadReady ? lead : null;
  }

  // While an upgrade is live, its tiles wait behind tiles it can't use
  // (half a group), and a tile of it with no copy left to finish goes early.
  // A target (discardTarget) is stricter: its dead tiles go first, then the
  // tiles it can't use, even at a step's cost, and its live tiles wait.
  function upgradeOrder(ctx, counts, i, group) {
    var target = discardTarget(ctx);
    if (target) {
      if (!target.keep(i)) return Math.min(group, -1);
      if (isDeadFor(target, counts, ctx, i)) return -2;
      return Math.max(group, 1) + 0.5;
    }
    var up = ctx.upgrade;
    if (!up || group <= 0 || group >= 10 || !up.favors(i)) return group;
    var lead = ctx.leadPlan && ctx.leadPlan.id;
    if (lead === 'straights' || lead === 'runs') return group;
    if (/^(half|full)-/.test(lead || '') && !isHonor(i)) return group;
    if (isDeadFor(up, counts, ctx, i)) return Math.min(group, 1);
    return group + 0.5;
  }

  function isDeadFor(plan, counts, ctx, i) {
    return plan.pairs ? counts[i] === 1 && ctx.unseen[i] === 0 : deadForSets(counts, ctx, i, plan.favors);
  }

  function ukeire(counts, shantenFn, declared, unseen, current) {
    var total = 0;
    var tiles = [];
    for (var i = 0; i < 34; i++) {
      if (!unseen[i] || counts[i] >= 4) continue;
      counts[i]++;
      if (shantenFn(counts, declared) < current) {
        total += unseen[i];
        tiles.push(i);
      }
      counts[i]--;
    }
    return { total: total, tiles: tiles };
  }

  /* ------------------------------------------------------------------ *
   * 2b. Tracking the table (every strategy)
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
        if (DRAGONS.indexOf(i) !== -1 || i === windIndex || i === 26 + game.round) w *= 1.25;
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

  function liveOuts(ctx, u) {
    var inWall = ctx.track.inWall;
    var mean = inWall.reduce(function (m, x) { return m + x; }, 0) / inWall.length;
    return u.tiles.reduce(function (m, i) { return m + ctx.unseen[i] * inWall[i] / mean; }, 0);
  }

  // The odds of finishing a plan: expected draws to win against the draws left,
  // counting a tile the others are collecting as fewer outs. Open plans also
  // improve from claims. (T.race plays out the race itself, turn by turn.)
  function finishChance(ctx, s, u, plan, counts) {
    if (!T.race) {
      var outs = liveOuts(ctx, u);
      var expected = ctx.unseenTotal / (Math.max(outs, 0.5) * (plan.open ? 1.33 : 1));
      return ctx.drawsLeft / (ctx.drawsLeft + expected) * Math.pow(STEP, s) * COMPETITION;
    }
    var left = ctx.track.left;
    var noChow = SETS_PLANS.indexOf(plan.id) !== -1;
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
  function readyOdds(value, waits, ctx) {
    var usable = waits.filter(function (w) { return w.left && (w.ronOk || w.tsumoOk); });
    if (!T.race || !usable.length) return value;
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
   * 4. Exact value of a ready hand
   * ------------------------------------------------------------------ */

  function concealedIdsFromCounts(c) {
    var ids = [];
    for (var i = 0; i < 34; i++) for (var n = 0; n < c[i]; n++) ids.push(E.tileId(i));
    return ids;
  }

  function scoreIfWin(ctx, ids, selfDraw) {
    var res = E.HKScoring.scoreHand({
      concealed: ids,
      melds: ctx.melds.map(function (m) { return { type: m.type, tile: m.tiles[0], concealed: m.concealed }; }),
      flowers: ctx.flowers,
      seat: ctx.seatWind,
      round: ctx.round,
      selfDraw: selfDraw,
      lastTile: ctx.wallLeft <= 1,
      spicy: ctx.game.settings.spicy,
    });
    return res.valid ? res.faan : -1;
  }

  function readyValue(c, ctx) {
    var waits = E.winningTiles(c, ctx.declared);
    if (!waits.length) return null;
    var ids = concealedIdsFromCounts(c);
    var tsumo = 0, ron = 0, evSum = 0;
    var details = [];
    var min = ctx.game.settings.minFaan;
    waits.forEach(function (w) {
      var r = ctx.unseen[w];
      var withTile = ids.concat([E.tileId(w)]);
      var fr = scoreIfWin(ctx, withTile, false);
      var ft = scoreIfWin(ctx, withTile, true);
      var pr = fr >= min ? handValue(fr, ctx.slope) : 0;
      var pt = ft >= min ? handValue(ft, ctx.slope) : 0;
      details.push({ tile: E.tileId(w), left: r, ronFaan: fr, tsumoFaan: ft, ronOk: fr >= min, tsumoOk: ft >= min });
      if (!r) return;
      if (pt) { tsumo += r; evSum += r * pt * SELF_DRAW_PAYS; }
      if (pr) { ron += r * 1.5; evSum += r * 1.5 * pr; }
    });
    var q = (tsumo + ron) / ctx.unseenTotal;
    var value = 0;
    if (q > 0) {
      var avg = evSum / (tsumo + ron);
      var t = ctx.drawsLeft;
      value = avg * (t / (t + 1 / q)) * COMPETITION;
    }
    // Axis B: a wait with at most one live tile is close to dead.
    if (tsumo <= 1) value *= 0.5;
    value = readyOdds(value, details, ctx);
    if (H.readyValue) value = H.readyValue(value, details, c, ctx);
    var best = 0;
    details.forEach(function (d) { if (d.left && d.ronOk) best = Math.max(best, d.ronFaan); });
    return { value: value, waits: details, live: tsumo + ron / 1.5, bestFaan: best };
  }

  /* ------------------------------------------------------------------ *
   * 5. Hand utility (expected points from a waiting-to-draw hand)
   * ------------------------------------------------------------------ */

  // A wait that isn't used up and scores the minimum, by discard or self-draw.
  function winsWhenReady(ready) {
    return !!ready && ready.waits.some(function (w) { return w.left && (w.ronOk || w.tsumoOk); });
  }

  // Steps for ranking a discard. A complete shape worth under the minimum
  // isn't ready: it's as far off as the hand that would score.
  function stepsToWin(shape, best, ready) {
    if (shape > 0 || winsWhenReady(ready)) return shape;
    return best && best.plan && !best.readyBest ? Math.max(1, best.planShanten) : 1;
  }

  /* ------------------------------------------------------------------ *
   * 5a. Sticking to a plan
   *     For its first 3 discards a hand keeps its options open. After that
   *     it commits to the plan it's on and pivots only for a reason: more
   *     points without falling behind, or a plan that has become hopeless
   *     while another has real odds. A plan it has left needs more to come
   *     back to. The record is per seat and per strategy, for this hand.
   * ------------------------------------------------------------------ */

  var COMMIT_TURN = 3, PIVOT_MARGIN = 1.1, HOPELESS_STEPS = 2, HOPELESS_RATIO = 3, BACKUP_SHARE = 0.12;

  // Hands built from the same tiles are one plan: moving from a Half Flush to
  // a Full Flush in that suit refines the hand, it doesn't change direction.
  function planFamily(id) {
    if (/^(half|full)-/.test(id)) return 'flush-' + id.slice(5);
    if (id === 'half' || id === 'full') return 'flush';
    if (id === 'triplets' || id === 'concealed-triplets') return 'sets';
    if (id === 'plain' || id === 'runs' || id === 'straights' || id === 'sequences') return 'runs';
    if (id === 'pairs' || /^pairs-/.test(id)) return 'pairs';
    if (id === 'mixed-orphans' || id === 'all-terminals' || id === 'all-honors') return 'majors';
    if (/-dragons$/.test(id)) return 'dragons';
    if (/-winds$/.test(id)) return 'winds';
    return id;
  }

  function planMemo(seatState) {
    var byBot = seatState.planMemo || (seatState.planMemo = {});
    var id = T.id || 'base';
    return byBot[id] || (byBot[id] = { turn: -1, base: null, now: null, left: {}, pivot: null });
  }

  // The plan this turn is measured against. (The turn's own first read has
  // already moved `now`, so a second read this turn still uses `base`.)
  function readCommit(seatState) {
    var memo = planMemo(seatState);
    return { key: memo.turn === seatState.discards.length ? memo.base : memo.now, left: memo.left };
  }

  function updateCommit(seatState, pick, folding) {
    var memo = planMemo(seatState);
    var turn = seatState.discards.length;
    if (memo.turn !== turn) { memo.base = memo.now; memo.turn = turn; }
    if (folding || !pick) return;
    var best = pick.analysis.best;
    var plan = best && best.plan;
    if (!plan || turn < COMMIT_TURN) return;
    var family = planFamily(plan.id);
    memo.now = family;
    if (memo.base && memo.base !== family) {
      memo.left[memo.base] = turn;
      memo.pivot = { turn: turn, from: memo.base, why: best.pivotWhy || 'gone' };
    } else if (memo.pivot && memo.pivot.turn === turn) {
      memo.pivot = null;
    }
  }

  // The pivot this hand made on this turn: { from, why }, or null.
  function planPivot(game, seat) {
    var seatState = game.hand.seats[seat];
    var memo = planMemo(seatState);
    return memo.pivot && memo.pivot.turn === seatState.discards.length ? memo.pivot : null;
  }

  function leftPlan(ctx, key) {
    return !!(ctx.commit && ctx.commit.left[key] !== undefined);
  }

  // Why `alt` may replace the committed `cur`: 'hopeless', 'points', or null.
  function pivotWhy(alt, cur, ctx) {
    // No tile helps it, there aren't the draws left to fill it, or it has
    // fallen well behind a hand with far better odds.
    if (cur.ukeire === 0 || cur.planShanten + 1 > ctx.drawsLeft * 1.5) return 'hopeless';
    if (alt.planShanten + HOPELESS_STEPS <= cur.planShanten && alt.chance >= cur.chance * HOPELESS_RATIO) return 'hopeless';
    var back = leftPlan(ctx, planFamily(alt.plan.id));
    if (alt.pick === Infinity && !back) return 'points';
    var more = alt.plan.faan >= cur.plan.faan + (back ? 2 : 1);
    var near = alt.planShanten <= cur.planShanten + (back ? 0 : 1);
    return more && near && alt.pick > cur.pick * PIVOT_MARGIN ? 'points' : null;
  }

  // The committed plan if it's still alive and nothing justifies leaving it.
  function chooseEntry(entries, ctx) {
    var key = ctx.commit && ctx.commit.key;
    var own = key ? entries.filter(function (e) { return planFamily(e.plan.id) === key; }) : [];
    var cur = own.reduce(function (m, e) { return !m || e.pick > m.pick ? e : m; }, null);
    var best = cur;
    if (cur) {
      entries.forEach(function (e) {
        if (own.indexOf(e) !== -1) return;
        var why = pivotWhy(e, cur, ctx);
        if (why && e.pick > best.pick) { best = e; best.pivotWhy = why; }
      });
      return best;
    }
    entries.forEach(function (e) { if (!best || e.pick > best.pick) best = e; });
    // (A strategy that lists its own plans has given up on this one.)
    if (best && key) best.pivotWhy = T.ownPlans ? 'hopeless' : 'gone';
    return best;
  }

  // The other plans these tiles could still become, worst first left out:
  // a discard that keeps them alive leaves somewhere to go.
  function backupValue(entries, best) {
    var others = entries.filter(function (e) { return e !== best && e.pick !== Infinity; })
      .map(function (e) { return e.util; })
      .sort(function (a, b) { return b - a; });
    return (others[0] || 0) + (others[1] || 0);
  }

  // The plans of this family, when a strategy's list for this hand left them out.
  function plansOfFamily(c, ctx, id) {
    var pool = basePlans(c, ctx).concat(scoringPlans(c, ctx), setUpgrades(c, ctx, true), pairsUpgrades(c, ctx, true), upgradePlans(c, ctx));
    // A flush keeps going below the tiles that would first suggest it, unless
    // a meld in another suit has ruled it out.
    var su = /^flush-/.test(id) ? id.slice(6) : null;
    if (su && !Object.keys(ctx.meldSuits).some(function (k) { return k !== su && k !== 'z'; })) {
      var kept = restrict(c, function (i) { return E.suitOfIndex(i) === su || i >= 27; });
      pool.push({
        id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su], counts: kept, shantenFn: E.standardShanten,
        faan: baseFaan(ctx) + (ctx.concealed ? 1 : 0) + 3 + handYaku(ctx, kept), open: true,
      });
    }
    if (!ctx.declared) {
      pool.push(makeSpecialPlan('pairs', c, ctx));
      if (orphansAlive(c, ctx)) pool.push(makeSpecialPlan('orphans', c, ctx));
    }
    var min = ctx.game.settings.minFaan;
    return pool.filter(function (p) {
      return planFamily(p.id) === id && (p.id !== 'plain' || p.faan >= min) && p.shantenFn(p.counts, ctx.declared) !== Infinity;
    });
  }

  // A special hand a strategy reaches for must be a justified pivot too.
  function gateSpecial(ctx, counts) {
    var locked = ctx.lockedSpecial;
    var key = ctx.commit && ctx.commit.key;
    if (!locked || !key || T.ownPlans || ctx.planFixed || planFamily(locked.kind) === key) return;
    var cur = plansOfFamily(counts, ctx, key)[0];
    if (!cur) return;
    var plan = makeSpecialPlan(locked.kind, counts, ctx, locked.gates);
    var alt = { plan: plan, planShanten: plan.shantenFn(plan.counts, ctx.declared), pick: 1, chance: 1 };
    var now = { plan: cur, planShanten: cur.shantenFn(cur.counts, ctx.declared), pick: 0, chance: 1, ukeire: 1 };
    if (!pivotWhy(alt, now, ctx)) ctx.lockedSpecial = null;
  }

  function handUtility(c, ctx) {
    var plans = plansFor(c, ctx);
    var entries = [];
    var shantenAll = E.shanten(c, ctx.declared);
    plans.forEach(function (p) {
      var s = p.shantenFn(p.counts, ctx.declared);
      if (s === Infinity) return;
      // Too few draws left to fill an upgrade: it isn't a plan any more
      // (unless it's the only kind of hand a strategy plays: plan.committed).
      if (p.upgrade && !p.committed && ctx.drawsLeft < 2 * s) return;
      var pc = p.counts.slice();
      var u = ukeire(pc, p.shantenFn, ctx.declared, ctx.unseen, s);
      var chance = H.finishChance ? H.finishChance(ctx, s, u, p, pc) : finishChance(ctx, s, u, p, pc);
      var util = handValue(p.faan + SELF_DRAW_CHANCE, ctx.slope) * 1.8 * chance;
      // A strategy can prefer a plan (plan.weight) without inflating its value.
      var entry = { plan: p, shanten: s, planShanten: s, ukeire: u.total, ukeireTiles: u.tiles, util: util, chance: chance, pick: util * (p.weight || 1) * suitLean(p, ctx) };
      // The hand's target (isHardTarget) is the plan it's on, whatever else pays now.
      if (ctx.upgrade && ctx.upgrade.hard && ctx.upgrade.id === p.id) entry.pick = Infinity;
      entries.push(entry);
    });
    var best = chooseEntry(entries, ctx);
    var backup = backupValue(entries, best);
    var ready = null;
    if (shantenAll === 0) {
      ready = readyValue(c, ctx);
      if (winsWhenReady(ready) && (!best || ready.value >= best.util)) {
        best = {
          plan: best ? best.plan : null,
          shanten: 0,
          planShanten: best ? best.planShanten : 0,
          ukeire: ready.live,
          util: ready.value,
          readyBest: true,
          pivotWhy: best ? best.pivotWhy : null,
        };
      }
    }
    var plainS = E.standardShanten(c, ctx.declared);
    return {
      util: best ? best.util : 0,
      best: best,
      backup: backup,
      shanten: stepsToWin(shantenAll, best, ready),
      shapeShanten: shantenAll,
      plainShanten: plainS,
      ready: ready,
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. Defense
   * ------------------------------------------------------------------ */

  var THREAT_LEVELS = ['Low', 'Medium', 'High', 'Extreme'];

  function threatLevel(p) {
    return p >= 0.55 ? 3 : p >= 0.3 ? 2 : p >= 0.12 ? 1 : 0;
  }

  function opponentThreats(game, seat) {
    var out = [];
    var unseenMe = E.unseenCounts(game, seat);
    for (var o = 0; o < 4; o++) {
      if (o === seat) continue;
      var s = game.hand.seats[o];
      var k = s.melds.length;
      var n = s.discards.length;
      // Axis C: 2 melds is cautious, 3 is extreme; after turn 10 any hand,
      // melded or not, may be ready.
      var p = [0.02, 0.1, 0.32, 0.6, 0.92][Math.min(k, 4)] + Math.min(0.25, n * 0.008);
      var shown = p; // what their melds alone say, for the label
      if (n >= 10) p = Math.max(p, 0.2 + (n - 10) * 0.05);

      // Suit isolation: melds in one suit (plus honors) and other suits
      // thrown means a flush.
      var flush = null;
      var suitsInMelds = {};
      s.melds.forEach(function (m) { suitsInMelds[meldSuit(m)] = true; });
      var numSuits = Object.keys(suitsInMelds).filter(function (x) { return x !== 'z'; });
      if (k >= 1 && numSuits.length === 1) flush = numSuits[0];
      if (!flush && n >= 6) {
        var bySuit = { c: 0, d: 0, b: 0 };
        s.discards.forEach(function (d) {
          var su = E.suitOfIndex(E.tileIndex(d.tile));
          if (bySuit[su] !== undefined) bySuit[su]++;
        });
        ['c', 'd', 'b'].forEach(function (su) {
          if (!flush && bySuit[su] === 0 && numSuits.every(function (x) { return x === su; })) flush = su;
        });
      }
      if (k === 0 && suitsInMelds.z) flush = null;
      if (flush && k >= 2) { p += 0.15; shown += 0.15; }
      p = Math.min(0.93, p);

      var f = 3;
      if (flush) f += (s.melds.some(function (m) { return meldSuit(m) === 'z'; }) ? 3 : 4);
      var wind = E.seatWind(game, o);
      s.melds.forEach(function (m) {
        if (m.type === 'chow') return;
        var i = E.tileIndex(m.tiles[0]);
        if (DRAGONS.indexOf(i) !== -1) f += 1;
        if (i === 26 + wind) f += 1;
        if (i === 26 + game.round) f += 1;
      });
      // Tiles they threw, and the ones thrown since their latest meld
      // (the safest: their current hand didn't want them).
      var lastMeld = s.melds.reduce(function (m, x) { return Math.max(m, x.at || 0); }, 0);
      var discarded = {}, since = {}, suji = { c: {}, d: {}, b: {} };
      s.discards.forEach(function (d, idx) {
        discarded[d.tile] = true;
        if (idx >= lastMeld) since[d.tile] = true;
        var ti = E.tileIndex(d.tile);
        if (ti < 27) suji[E.suitOfIndex(ti)][ti % 9] = true;
      });
      // Late in the hand anyone may be ready, but only melds make a player
      // Extreme; the late-game read tops out at High.
      var level = Math.max(Math.min(threatLevel(p), Math.max(2, threatLevel(shown))), k >= 3 ? 3 : flush && k >= 2 ? 2 : 0);
      out.push({
        seat: o,
        name: game.players[o].name,
        ready: p,
        level: level,
        levelName: THREAT_LEVELS[level],
        melds: k,
        flush: flush,
        faan: Math.max(3, f),
        // Play tighter against a strong dealer (they keep the deal on a win).
        payment: handValue(Math.max(3, f)) * (o === game.dealer && level >= 2 ? 1.1 : 1),
        discarded: discarded,
        since: since,
        suji: suji,
        chows: s.melds.reduce(function (m, x) {
          if (x.type === 'chow') { var su = meldSuit(x); m[su] = (m[su] || 0) + 1; }
          return m;
        }, {}),
        windIndex: 26 + wind,
        unseen: unseenMe,
      });
    }
    out.forEach(function (t) {
      var read = readSeat(game, t.seat, unseenMe);
      t.want = read.want;
      t.pivot = read.pivot;
      t.collecting = read.collecting;
      t.isNext = t.seat === (seat + 1) % 4;
      if (t.isNext) {
        var after = afterRead(game, seat);
        t.afterKeeps = after.keeps;
        t.afterLocked = after.locked;
        t.afterMelds = after.melds;
        // A suit the sixth-discard read hasn't named yet still counts from
        // the fifth, and every chow or pung of it makes those tiles hotter.
        if (after.keeps) {
          var boost = 1 + 0.35 * after.melds + (after.locked ? 0.25 : 0);
          if (t.collecting !== after.keeps) boost += 0.45;
          for (var w = 0; w < 27; w++) {
            if (E.suitOfIndex(w) === after.keeps) t.want[w] = Math.min(WANT_MAX, t.want[w] * boost);
          }
        }
      }
      t.ready = Math.min(0.93, t.ready * read.pace);
    });
    if (H.threats) H.threats(out, game, seat);
    return out;
  }

  // Probability that `threat`'s ready hand waits on tile index i.
  function waitChance(game, threat, i) {
    var unseen = threat.unseen;
    var chance;
    if (i >= 27) {
      // Fresh honors are dangerous; with 3+ copies visible, it's dead.
      chance = [0, 0.004, 0.035, 0.05, 0.05][unseen[i]] || 0;
      if (unseen[i] >= 2 && (DRAGONS.indexOf(i) !== -1 || i === threat.windIndex || i === 26 + game.round)) chance *= 1.3;
    } else {
      var r = i % 9;
      var seq = 0;
      // A neighbor with every copy visible (kabe) blocks sequences through it.
      var avail = function (d) {
        var j = r + d;
        if (j < 0 || j > 8) return 0;
        return unseen[i + d] / 4;
      };
      var twoSided = 0;
      if (r <= 5) twoSided += Math.min(avail(1), avail(2));   // waiting on r with r+1 r+2
      if (r >= 3) twoSided += Math.min(avail(-1), avail(-2)); // waiting on r with r-1 r-2
      // Suji: a two-sided wait on r also wins on r-3 or r+3; if they threw
      // that tile, the matching two-sided wait is unlikely (HK has no
      // furiten, so this is a read, not a rule).
      var su = E.suitOfIndex(i);
      var lowSafe = r < 3 || threat.suji[su][r - 3];
      var highSafe = r > 5 || threat.suji[su][r + 3];
      if (r >= 3 && r <= 5) twoSided *= (lowSafe && highSafe) ? 0.35 : (lowSafe || highSafe) ? 0.7 : 1;
      else twoSided *= (r < 3 ? highSafe : lowSafe) ? 0.4 : 1;
      seq += twoSided;
      if (r === 2) seq += Math.min(avail(-1), avail(-2)) * 0.6; // edge wait 1-2 on 3
      if (r === 6) seq += Math.min(avail(1), avail(2)) * 0.6;   // edge wait 8-9 on 7
      if (r >= 1 && r <= 7) seq += Math.min(avail(-1), avail(1)) * 0.6; // closed wait
      chance = seq * 0.025 + (unseen[i] / 3) * 0.018;
      if (r >= 2 && r <= 6) chance *= 1.1; // middle tiles connect the most
    }
    // Near the end, a suit an opponent has chowed in is one they're
    // building: its tiles are more likely to finish their hand. The player
    // after you is the same once a chow locks the suit, and each further
    // meld (a pung as well as a chow) makes the winning tile likelier.
    if (i < 27 && game.hand.wall.length < LATE_WALL) {
      var suLate = E.suitOfIndex(i);
      var named = threat.chows[suLate] || 0;
      if (threat.isNext && threat.afterKeeps === suLate) {
        named = Math.max(named, threat.afterMelds || 0, threat.afterLocked ? 1 : 0);
      }
      if (named) chance *= 1 + T.chowSuitLate * named + (threat.isNext && threat.afterLocked ? 0.35 : 0);
    }
    if (threat.since[E.tileId(i)]) chance *= 0.15;
    else if (threat.discarded[E.tileId(i)]) chance *= 0.5;
    if (threat.flush) {
      var fs = E.suitOfIndex(i);
      if (fs === threat.flush) chance *= 2.5;
      else if (fs === 'z') chance *= 1.3;
      else chance *= 0.15;
    }
    // Waiting on a tile is more likely the more they want it.
    chance *= Math.pow(threat.want[i], 0.6);
    if (H.waitChance) chance = H.waitChance(chance, game, threat, i);
    return Math.min(chance, 0.6);
  }

  // An honor with a pung of it on the table can't deal in to anyone.
  function deadTile(game, i) {
    return i >= 27 && isPungTile(game, i);
  }

  function dealInLoss(game, threats, i) {
    if (deadTile(game, i)) return 0;
    var loss = 0;
    threats.forEach(function (t) {
      loss += t.ready * waitChance(game, t, i) * t.payment;
    });
    loss += feedLoss(game, threats, i);
    if (H.extraLoss) loss += H.extraLoss(game, threats, i);
    return loss;
  }

  // Axis C/D: how much more than usual to weigh safety right now. Defense
  // takes over when someone is High or Extreme and our hand is slow, or when
  // the wall is nearly gone and we're not already ready with a big hand.
  function defenseWeight(ctx, threats, shanten, readyFaan) {
    var w = ctx.isDealer ? 0.9 : 1; // the dealer can push a little harder
    var top = threats.reduce(function (m, t) { return Math.max(m, t.level); }, 0);
    // (Tuned over 4,000 simulated hands; stronger weights folded too often.)
    if (top >= 2 && shanten >= 2) w *= top === 3 ? 1.7 : 1.3;
    if (ctx.wallLeft < 16 && !(shanten === 0 && readyFaan >= 5)) w *= 1.7;
    // Unlikely to win: late, and still two or more tiles from ready.
    if (T.lateFold !== 1 && shanten >= 2 && ctx.wallLeft < T.lateFoldWall) w *= T.lateFold;
    if (H.defense) w = H.defense(w, ctx, threats, shanten, readyFaan);
    return w;
  }

  // How risky a discard is, in four steps (safe, low, some, risky).
  function riskStep(loss) {
    return loss < 0.002 ? 0 : loss < 0.012 ? 1 : loss < 0.035 ? 2 : 3;
  }

  // All Triplets needs more copies of the tiles it holds, so the tiles least
  // likely to become a set go first: singles (two copies short) before pairs
  // (one short, and able to pung) before finished sets, and within each the
  // one with the fewest copies left (unseen by this seat). That decides ahead
  // of a step toward a plainer hand and of risk. Tiles a strategy throws
  // whatever else is true (group 0 or below) still go first, tiles a bigger
  // hand wants still wait, and a discard that leaves the hand ready stays on top.
  var SETS_PLANS = ['triplets', 'concealed-triplets', 'mixed-orphans', 'all-terminals', 'all-honors'];
  function tripletsOrder(out, ctx, counts) {
    var lead = out[0] && out[0].analysis.best;
    var plan = lead && lead.plan;
    if (!plan || SETS_PLANS.indexOf(plan.id) === -1 || lead.readyBest) return out;
    if (out.some(function (x) { return x.shanten === 0; })) return out;
    var forced = function (x) { return x.priority <= 0 ? x.priority : 1; };
    var favored = function (x) { return x.priority % 1 ? 1 : 0; }; // upgradeOrder's half step
    return out.map(function (x, k) { return { x: x, k: k }; }).sort(function (a, b) {
      if (forced(a.x) !== forced(b.x)) return forced(a.x) - forced(b.x);
      if (favored(a.x) !== favored(b.x)) return favored(a.x) - favored(b.x);
      var na = Math.min(counts[a.x.index], 3), nb = Math.min(counts[b.x.index], 3);
      if (na !== nb) return na - nb;
      var ua = ctx.unseen[a.x.index], ub = ctx.unseen[b.x.index];
      if (ua !== ub) return ua - ub;
      return a.k - b.k;
    }).map(function (o) { return o.x; });
  }

  // A number tile with no other tile of its suit within 2 ranks: in 1, 4 and
  // 5 of a suit, the 1. It can't join a run until two more tiles arrive.
  function isolatedTile(counts, i) {
    if (i >= 27 || counts[i] !== 1) return false;
    var r = i % 9;
    return [-2, -1, 1, 2].every(function (d) {
      return r + d < 0 || r + d > 8 || !counts[i + d];
    });
  }

  // How this single connects to the rest of its suit. Fewer tiles within 2
  // ranks is more disconnected; the same number, the farther neighbor is.
  function linkRank(counts, i) {
    var r = i % 9, near = 0, gap = 9;
    [-2, -1, 1, 2].forEach(function (d) {
      if (r + d < 0 || r + d > 8 || !counts[i + d]) return;
      near += counts[i + d];
      if (Math.abs(d) < gap) gap = Math.abs(d);
    });
    return near * 16 - gap;
  }

  // The number suits held the least, counting tiles in hand.
  function leastSuits(counts) {
    var n = { c: 0, d: 0, b: 0 };
    for (var i = 0; i < 27; i++) if (counts[i]) n[E.suitOfIndex(i)] += counts[i];
    var min = Infinity;
    SUIT_LETTERS.forEach(function (su) { if (n[su] && n[su] < min) min = n[su]; });
    var least = {};
    SUIT_LETTERS.forEach(function (su) { if (n[su] === min) least[su] = true; });
    return least;
  }

  // A single 1 or 9 that is not already the end of a 1-2-3 or 7-8-9.
  // A pair or triplet is not loose, and neither is that finished straight.
  function looseTerminal(counts, i) {
    if (i >= 27 || counts[i] !== 1) return false;
    var r = i % 9;
    if (r !== 0 && r !== 8) return false;
    var base = i - r;
    if (r === 0 && counts[base + 1] && counts[base + 2]) return false;
    if (r === 8 && counts[base + 6] && counts[base + 7]) return false;
    return true;
  }

  function majorTiles(counts) {
    var n = 0;
    for (var i = 0; i < 34; i++) if (counts[i] && isOrphanIndex(i)) n += counts[i];
    return n;
  }

  // A loose 1 or 9 stays put once it is part of All Terminals, Mixed
  // Orphans or Thirteen Orphans and 7 other majors (1s, 9s, honors) are
  // already in the hand. All Honors still throws a terminal.
  function keepsLooseTerminal(counts, i, plan) {
    if (!looseTerminal(counts, i) || majorTiles(counts) - 1 < 7) return false;
    var id = plan && plan.id;
    if (id === 'all-honors' || id === 'pairs-honors') return false;
    if (id === 'orphans' || id === 'mixed-orphans' || id === 'all-terminals' || id === 'pairs-orphans' || id === 'pairs-terminals') return true;
    var terminals = 0, honors = 0;
    for (var j = 0; j < 34; j++) {
      if (!counts[j]) continue;
      if (j >= 27) honors += counts[j];
      else if (isOrphanIndex(j)) terminals += counts[j];
    }
    return terminals >= 8 || (terminals >= 1 && honors >= 1 && terminals + honors >= 8);
  }

  // Loose terminals of the short suit go ahead of a tile that merely
  // connects less, unless the hand is keeping that terminal. Everything
  // else is ordered by how little it connects.
  function shortSuitRank(counts, i, plan) {
    return linkRank(counts, i) - (!keepsLooseTerminal(counts, i, plan) && looseTerminal(counts, i) ? 1000 : 0);
  }

  // A single in a suit you hold the least of, and no other single there
  // is a better short-suit discard. The discard order uses it only when
  // the tile isn't the one that leaves the hand ready, and isn't a risky deal-in.
  // Removing this copy would break a 3-tile straight already in the hand.
  function breaksFinishedStraight(counts, i) {
    if (i >= 27 || counts[i] !== 1) return false;
    var r = i % 9;
    var base = i - r;
    var starts = [];
    if (r >= 2) starts.push(r - 2);
    if (r >= 1 && r <= 7) starts.push(r - 1);
    if (r <= 6) starts.push(r);
    for (var w = 0; w < starts.length; w++) {
      var s = starts[w];
      if (counts[base + s] && counts[base + s + 1] && counts[base + s + 2]) return true;
    }
    return false;
  }

  function shortSuitDiscard(counts, i, plan) {
    if (i >= 27 || counts[i] !== 1 || keepsLooseTerminal(counts, i, plan)) return false;
    if (plan && plan.id === 'straights' && breaksFinishedStraight(counts, i)) return false;
    var least = leastSuits(counts);
    if (!least[E.suitOfIndex(i)]) return false;
    var mine = shortSuitRank(counts, i, plan);
    for (var j = 0; j < 27; j++) {
      if (j === i || counts[j] !== 1 || !least[E.suitOfIndex(j)] || keepsLooseTerminal(counts, j, plan)) continue;
      if (shortSuitRank(counts, j, plan) < mine) return false;
    }
    return true;
  }

  // The number suits held the most.
  function longestSuits(counts) {
    var n = { c: 0, d: 0, b: 0 };
    for (var i = 0; i < 27; i++) if (counts[i]) n[E.suitOfIndex(i)] += counts[i];
    var max = 0;
    SUIT_LETTERS.forEach(function (su) { if (n[su] > max) max = n[su]; });
    var longest = {};
    SUIT_LETTERS.forEach(function (su) { if (n[su] && n[su] === max) longest[su] = true; });
    return longest;
  }

  // A 1 or 9, including a pair or one already in a straight.
  function rankTerminal(i) {
    return i < 27 && (i % 9 === 0 || i % 9 === 8);
  }

  // Tiles of the shortest suit go before a 1 or 9 of the longest suit.
  // A discard that leaves the hand ready is left to the usual order.
  function shortBeforeLongTerminal(counts, a, b) {
    if ((a.shanten <= 0) !== (b.shanten <= 0)) return 0;
    var least = leastSuits(counts);
    var longest = longestSuits(counts);
    var role = function (x) {
      if (x.index >= 27) return '';
      var su = E.suitOfIndex(x.index);
      if (least[su] && !longest[su]) return 'short';
      if (longest[su] && !least[su] && rankTerminal(x.index)) return 'longTerminal';
      return '';
    };
    var ra = role(a), rb = role(b);
    if (ra === 'short' && rb === 'longTerminal') return -1;
    if (rb === 'short' && ra === 'longTerminal') return 1;
    return 0;
  }

  function flushLead(plan) {
    return !!(plan && /^(full|half)-/.test(plan.id));
  }

  // A flush scores no dragon, but a pair of them is worth more than the
  // short chain in another suit. The player after you can hold that chain
  // back, and folding would rather throw the safe pair. Keep the pair
  // unless breaking it is what leaves the hand ready.
  function keepDragonPair(out, ctx, counts) {
    if (!out.length || !flushLead(ctx.leadPlan)) return out;
    var top = out[0];
    if (top.shanten <= 0 || DRAGONS.indexOf(top.index) === -1 || counts[top.index] !== 2) return out;
    var suit = ctx.leadPlan.suit;
    var least = leastSuits(counts);
    var best = null, bestRank = 0;
    for (var k = 1; k < out.length; k++) {
      var x = out[k];
      if (x.index >= 27) continue;
      var su = E.suitOfIndex(x.index);
      if (su === suit || !least[su]) continue;
      var rank = shortSuitRank(counts, x.index, ctx.leadPlan);
      if (!best || rank < bestRank) { best = x; bestRank = rank; }
    }
    if (!best) return out;
    return [best].concat(out.filter(function (x) { return x !== best; }));
  }

  function disconnectRank(x, counts, plan) {
    if (x.shanten <= 0 || riskStep(x.loss) >= 3 || !shortSuitDiscard(counts, x.index, plan)) return null;
    return shortSuitRank(counts, x.index, plan);
  }

  /* ------------------------------------------------------------------ *
   * 7. Discard analysis (14 tiles in hand)
   * ------------------------------------------------------------------ */

  function syncHandPlans(ctx, counts) {
    ctx.blockSevenPairs = concealedShape(counts).hasSet;
    ctx.avoidSuit = avoidSuit(counts, ctx);
    if (H.hand) H.hand(ctx, counts);
    gateSpecial(ctx, counts);
    ctx.upgrade = liveUpgrade(counts, ctx);
  }

  function analyzeDiscards(game, seat, ctxOverride, handOverride) {
    var ctx = ctxOverride || buildContext(game, seat);
    var hand = handOverride || game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    syncHandPlans(ctx, c);
    var threats = opponentThreats(game, seat);
    var out = [];
    for (var i = 0; i < 34; i++) {
      if (!c[i]) continue;
      c[i]--;
      var u = handUtility(c, ctx);
      c[i]++;
      var loss = dealInLoss(game, threats, i);
      out.push({
        tile: E.tileId(i),
        index: i,
        util: u.util,
        loss: loss,
        shanten: u.shanten,
        analysis: u,
      });
    }
    var bestShanten = Math.min.apply(null, out.map(function (x) { return x.shanten; }));
    // The hand the best discard builds toward, for the shared one-suit rules.
    // suitLean is part of which discard is best: the player after you can
    // pull a close flush onto the suit they need, so those tiles stay.
    var leaned = function (x) {
      return x.util * suitLean((x.analysis.best && x.analysis.best.plan) || {}, ctx);
    };
    var lead = out.reduce(function (m, x) { return !m || leaned(x) > leaned(m) ? x : m; }, null);
    ctx.leadPlan = (lead && lead.analysis.best && lead.analysis.best.plan) || null;
    ctx.leadReady = !!(lead && lead.analysis.best && lead.analysis.best.readyBest);
    var readyFaan = out.reduce(function (m, x) { return Math.max(m, x.analysis.ready ? x.analysis.ready.bestFaan : 0); }, 0);
    var weight = defenseWeight(ctx, threats, bestShanten, readyFaan);
    // Folding: safety decides, and the keep-pairs and keep-dragons orders
    // only break ties (a safe pair is the right tile to break).
    var folding = weight > (ctx.isDealer ? 0.9 : 1);
    weight *= T.defenseScale;
    // After a chow (or with most of the hand in one suit), tiles of other
    // suits are worthless: they go first, ahead of honors and tiles of that
    // suit that tie with them on value.
    var committed = suitCommitment(ctx, c);
    var topUtil = out.reduce(function (m, x) { return Math.max(m, x.util); }, 0);
    out.forEach(function (x) {
      // The left player's read leans the offense toward the flush they feed
      // and away from the one they keep (suitLean); safety is unchanged.
      x.score = x.util * suitLean((x.analysis.best && x.analysis.best.plan) || {}, ctx) - weight * x.loss;
      // Between close discards, keep the backup plans alive.
      if (!folding) x.score += BACKUP_SHARE * x.analysis.backup;
      if (committed && x.index < 27 && E.suitOfIndex(x.index) !== committed) x.score += 0.004;
      // Between close discards, keep the tile with the most copies still out there.
      if (!folding) x.score -= T.keepLive * topUtil * ctx.unseen[x.index];
      x.priority = upgradeOrder(ctx, c, x.index, discardPriority(game, ctx, c, x, bestShanten));
      // Their suit is kept, more so with every meld they show and at the
      // end of the hand, unless this discard is already building that suit.
      var after = ctx.afterRead;
      var plan = x.analysis.best && x.analysis.best.plan;
      if (after && after.keeps && x.index < 27 && E.suitOfIndex(x.index) === after.keeps && !(plan && plan.suit === after.keeps)) {
        var hold = 5 + after.melds + (after.locked ? 1 : 0);
        if (ctx.wallLeft < LATE_WALL) hold += 2;
        if (x.priority < hold) x.priority = hold;
        var pressure = 0.006 * (1 + after.melds) * (after.locked ? 1.5 : 1);
        if (ctx.wallLeft < LATE_WALL) pressure *= 2;
        x.score -= pressure;
      }
      // Keeping a pair or a dragon never costs a step toward ready: a discard
      // that leaves the hand slower waits behind every one that doesn't.
      // (A strategy's group below 0 goes first whatever it costs, but unlike
      // 0 it doesn't override folding.)
      // (Nor does a finished set a hand of sets is built on go ahead of a pair.)
      var best = x.analysis.best;
      var breaksSet = c[x.index] >= 3 && best && best.plan && !best.readyBest && SETS_PLANS.indexOf(best.plan.id) !== -1;
      x.tier = x.priority <= 0 || (x.shanten <= bestShanten && !breaksSet) ? x.priority : 10 + x.priority;
    });
    out.sort(function (a, b) {
      // Off-suit tiles after a chow always go first, even while folding
      // (then the safest of them goes).
      var offA = a.priority === 0, offB = b.priority === 0;
      if (offA !== offB) return offA ? -1 : 1;
      // Concealed Straights keeps a tile that already completes a straight.
      // Once a discard leaves the hand ready, the usual order decides.
      if (!folding && ctx.leadPlan && ctx.leadPlan.id === 'straights' && a.shanten > 0 && b.shanten > 0) {
        var straightA = breaksFinishedStraight(c, a.index);
        var straightB = breaksFinishedStraight(c, b.index);
        if (straightA !== straightB) return straightA ? 1 : -1;
      }
      if (!folding) {
        var suitOrder = shortBeforeLongTerminal(c, a, b);
        if (suitOrder) return suitOrder;
      }
      if (!folding && a.tier !== b.tier) return a.tier - b.tier;
      // A terminal the orphan hands still need waits behind the other tiles.
      if (!folding && a.tier === b.tier) {
        var keepA = keepsLooseTerminal(c, a.index, ctx.leadPlan);
        var keepB = keepsLooseTerminal(c, b.index, ctx.leadPlan);
        if (keepA !== keepB) return keepA ? 1 : -1;
      }
      // In the suits held least, the tile that connects the least goes first.
      if (!folding) {
        var aloneA = disconnectRank(a, c, ctx.leadPlan), aloneB = disconnectRank(b, c, ctx.leadPlan);
        if (aloneA !== aloneB) {
          if (aloneA === null) return 1;
          if (aloneB === null) return -1;
          return aloneA - aloneB;
        }
      }
      if (b.score !== a.score) return b.score - a.score;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return E.isTerminalOrHonorIndex(b.index) - E.isTerminalOrHonorIndex(a.index);
    });
    if (!folding && T.tripletsLive) out = tripletsOrder(out, ctx, c);
    // A lone dragon nobody has shown goes last of all, on every hand, unless
    // throwing it leaves the hand ready to win (see stepsToWin).
    var isLone = function (x) { return x.shanten > 0 && loneDragon(game, c, x.index); };
    out = out.filter(function (x) { return !isLone(x); }).concat(out.filter(isLone));
    if (H.finalOrder) out = H.finalOrder(out, ctx, c);
    out = keepDragonPair(out, ctx, c);
    // Only the hand really held moves the plan: a claim being weighed doesn't.
    var seatNow = game.hand.seats[seat];
    if (hand === seatNow.hand && ctx.melds === seatNow.melds) updateCommit(seatNow, out[0], folding);
    return { ctx: ctx, candidates: out, threats: threats, defense: weight, folding: folding };
  }

  /* ------------------------------------------------------------------ *
   * 8. Decisions
   * ------------------------------------------------------------------ */

  function chooseTurnAction(game, seat, opts) {
    if (opts.win) return { type: 'win' };
    var analysis = analyzeDiscards(game, seat);
    var keep = analysis.candidates[0];
    var ctx = analysis.ctx;
    for (var k = 0; k < opts.kongs.length; k++) {
      var kong = opts.kongs[k];
      if (H.kongOk && !H.kongOk(kong, ctx)) continue;
      var i = E.tileIndex(kong.tile);
      var c = E.countsOf(game.hand.seats[seat].hand);
      var util;
      if (kong.kind === 'concealed') {
        c[i] -= 4;
        util = handUtility(c, withMeld(ctx, { type: 'kong', tiles: [kong.tile], concealed: true })).util;
      } else {
        c[i] -= 1;
        util = handUtility(c, ctx).util;
      }
      // A kong draws a free replacement tile; only skip it if it breaks the hand.
      if (util * 1.08 >= keep.util) return { type: 'kong', tile: kong.tile };
    }
    return { type: 'discard', tile: keep.tile };
  }

  function claimCandidates(game, seat, opts) {
    var ctx = buildContext(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var out = [];
    var tile = opts.tile;
    var ti = E.tileIndex(tile);
    var threats = opponentThreats(game, seat);

    function bestAfter(nextHand, nextCtx) {
      var a = analyzeDiscards(game, seat, nextCtx, nextHand);
      return a.candidates[0];
    }

    if (opts.pung) {
      var h1 = hand.slice();
      h1.splice(h1.indexOf(tile), 1);
      h1.splice(h1.indexOf(tile), 1);
      var b1 = bestAfter(h1, withMeld(ctx, { type: 'pung', tiles: [tile, tile, tile], concealed: false }));
      if (b1) out.push({ decision: { type: 'pung' }, score: b1.score, discard: b1.tile, analysis: b1.analysis });
    }
    if (opts.kong) {
      var ck = c.slice();
      ck[ti] -= 3;
      var uk = handUtility(ck, withMeld(ctx, { type: 'kong', tiles: [tile, tile, tile, tile], concealed: false }));
      // A kong is fine at any point in the hand: it draws a free
      // replacement tile, so it's taken whenever it doesn't hurt the hand.
      out.push({ decision: { type: 'kong' }, score: uk.util * 1.05, analysis: uk });
    }
    opts.chows.forEach(function (pair) {
      var h2 = hand.slice();
      h2.splice(h2.indexOf(pair[0]), 1);
      h2.splice(h2.indexOf(pair[1]), 1);
      var tiles = E.sortTiles(pair.concat([tile]));
      var b2 = bestAfter(h2, withMeld(ctx, { type: 'chow', tiles: tiles, concealed: false }));
      if (b2) out.push({ decision: { type: 'chow', tiles: pair }, score: b2.score, discard: b2.tile, analysis: b2.analysis });
    });

    var stay = handUtility(c, ctx);
    var nextLoss = Infinity;
    for (var i = 0; i < 34; i++) if (c[i]) nextLoss = Math.min(nextLoss, dealInLoss(game, threats, i));
    if (nextLoss === Infinity) nextLoss = 0;
    var passScore = stay.util - nextLoss;
    out.sort(function (a, b) { return b.score - a.score; });
    return { options: out, passScore: passScore, stay: stay };
  }

  function decideClaim(game, seat, opts) {
    if (opts.win) return { decision: { type: 'win' }, found: null };
    if (!opts.pung && !opts.kong && !opts.chows.length) return { decision: { type: 'pass' }, found: null };
    var res = claimCandidates(game, seat, opts);
    var ctx = buildContext(game, seat);
    if (H.claim) {
      var mine = H.claim(res, ctx, game, seat, opts);
      if (mine) return { decision: mine, found: res };
    }
    var ti = E.tileIndex(opts.tile);
    // On a target (isHardTarget), claim only what it uses.
    var target = liveUpgrade(E.countsOf(game.hand.seats[seat].hand), ctx);
    if (target && target.hard) {
      if (!target.keep(ti)) return { decision: { type: 'pass' }, found: res };
      if (opts.kong) return { decision: { type: 'kong' }, found: res };
      if (opts.pung && !target.pairs) return { decision: { type: 'pung' }, found: res };
      return { decision: { type: 'pass' }, found: res };
    }
    var stayPlan = res.stay.best && res.stay.best.plan;
    var lockedShape = stayPlan && (stayPlan.id === 'pairs' || stayPlan.id === 'orphans' || stayPlan.id === 'gates');
    // A dragon, or your own or the round wind, is taken even out of a
    // sequence hand. Seven Pairs, Thirteen Orphans and Nine Gates cannot use a set.
    if (!lockedShape && ti >= 27 && valueWeight(ctx, ti) && (opts.pung || opts.kong)) {
      // ...unless the hand is already ready and the claim would leave it
      // slower and worth less: then it's weighed like any other claim.
      var take = opts.pung ? 'pung' : 'kong';
      var after = res.options.filter(function (o) { return o.decision.type === take; })[0];
      var breaksReady = res.stay.shanten === 0 && after && after.analysis &&
        after.analysis.shanten > 0 && after.score < res.passScore;
      if (!breaksReady) return { decision: { type: take }, found: res };
    }
    // Any other claim breaks Concealed Straights.
    if (stayPlan && stayPlan.id === 'straights') return { decision: { type: 'pass' }, found: res };
    var options = res.options.filter(function (o) {
      if (!claimKeepsPlan(o, res, ctx)) return false;
      if (o.decision.type !== 'chow') return true;
      return chowAllowed(o, res, game, ctx) && (!H.chowOk || H.chowOk(o, res, ctx, game));
    });
    var top = options[0];
    var bar = top && top.decision.type === 'chow' ? 1.2 : 1.04;
    if (top && top.score > res.passScore * bar + 0.01) return { decision: top.decision, found: res };
    return { decision: { type: 'pass' }, found: res };
  }

  function chooseClaim(game, seat, opts) {
    return decideClaim(game, seat, opts).decision;
  }

  // A claim that leaves the committed plan is a pivot, so it needs a reason,
  // unless it makes the hand ready to win.
  function claimKeepsPlan(o, res, ctx) {
    var key = ctx.commit && ctx.commit.key;
    var cur = res.stay.best;
    var next = o.analysis && o.analysis.best;
    if (!key || !cur || !next || !next.plan || cur.readyBest) return true;
    if (planFamily(cur.plan.id) !== key || planFamily(next.plan.id) === key) return true;
    if (o.analysis.shanten === 0) return true;
    return !next.readyBest && !!pivotWhy(next, cur, ctx);
  }

  // Every chow must get the hand closer to ready and leave it able to reach
  // the minimum faan (a chow that makes it ready must win for the minimum).
  // The suit must already have 7 tiles in the hand and melds. A strategy
  // adds when it's worth it with H.chowOk.
  function chowAllowed(o, res, game, ctx) {
    var an = o.analysis;
    if (!an) return false;
    if (ctx && o.decision && o.decision.tiles) {
      var su = E.suitOfIndex(E.tileIndex(o.decision.tiles[0]));
      if (!chowSuitReady(ctx, E.countsOf(game.hand.seats[ctx.seat].hand), su)) return false;
    }
    var after = an.shanten, before = res.stay.shanten;
    if (after >= before) return false;
    var min = game.settings.minFaan;
    if (after === 0) return !!(an.ready && an.ready.bestFaan >= min);
    var plan = an.best && an.best.plan;
    return !!plan && plan.faan >= min - 0.25;
  }

  function createBotAgent(options) {
    var bot = (options && options.strategy) || api;
    return {
      turn: function (game, seat, opts) {
        return Promise.resolve(bot.chooseTurnAction(game, seat, opts));
      },
      claim: function (game, seat, opts) {
        return Promise.resolve(bot.chooseClaim(game, seat, opts));
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * 9. Strategies
   *    createStrategy(def) returns this same API, run with def.hooks and
   *    its own copy of the tuning knobs. Every call is synchronous, so the
   *    hooks are swapped in for the call and restored after it.
   *    Hooks (all optional):
   *      context(ctx, game, seat)        add the strategy's own reads to ctx
   *      hand(ctx, counts)               read the 14-tile hand before its
   *                                      discards are weighed
   *      plans(c, ctx) -> [plan]         the hands to aim for (basePlans is
   *                                      the usual list); plan.weight
   *                                      prefers a plan without changing
   *                                      its value
   *      priority(game, ctx, counts, candidate, bestShanten) -> group
   *                                      the discard order after the shared
   *                                      one-suit rules (lower goes first;
   *                                      below 0 goes first unless folding)
   *      finishChance(ctx, s, ukeire, plan, counts) -> chance
   *                                      the odds of finishing a plan, in
   *                                      place of the shared estimate
   *      readyValue(value, waits, c, ctx) -> value
   *      threats(list, game, seat)       add reads to each opponent
   *      waitChance(chance, game, threat, i) -> chance
   *      extraLoss(game, threats, i) -> loss  e.g. feeding a claim
   *      defense(weight, ctx, threats, shanten, readyFaan) -> weight
   *      kongOk(kong, ctx) -> bool       whether the hand can use this kong
   *      finalOrder(candidates, ctx, counts) -> candidates
   *                                      the last word on the discard order,
   *                                      ahead of every shared rule
   *      chowOk(option, found, ctx, game) -> bool
   *                                      whether a chow that chowAllowed
   *                                      passes is worth taking
   *      claim(found, ctx, game, seat, opts) -> decision
   *    priority and claim may return null to use the shared choice.
   * ------------------------------------------------------------------ */

  function createStrategy(def) {
    def = def || {};
    var hooks = def.hooks || NO_HOOKS;
    var tuning = copy(BASE_TUNING);
    Object.keys(def.tuning || {}).forEach(function (k) { tuning[k] = def.tuning[k]; });
    tuning.id = def.id;
    var out = { id: def.id };
    Object.keys(api).forEach(function (k) {
      if (k === 'id') return;
      var f = api[k];
      if (typeof f !== 'function' || k === 'createStrategy') { out[k] = f; return; }
      out[k] = function () {
        var prevH = H, prevT = T;
        H = hooks;
        T = tuning;
        try { return f.apply(null, arguments); } finally { H = prevH; T = prevT; }
      };
    });
    out.setTuning = function (next) {
      Object.keys(next || {}).forEach(function (k) { tuning[k] = next[k]; });
      return tuning;
    };
    out.tuning = tuning;
    out.createBotAgent = function () { return createBotAgent({ strategy: out }); };
    return out;
  }

  var api = {
    id: 'base',
    createStrategy: createStrategy,
    basePlans: basePlans,
    makeSpecialPlan: makeSpecialPlan,
    baseFaan: baseFaan,
    handYaku: handYaku,
    restrict: restrict,
    countWhere: countWhere,
    concealedShape: concealedShape,
    orphanProgress: orphanProgress,
    orphansAlive: orphansAlive,
    nineGatesProgress: nineGatesProgress,
    nineGatesShanten: nineGatesShanten,
    gatesTileNeeded: gatesTileNeeded,
    pairsFlush: pairsFlush,
    ukeire: ukeire,
    finishChance: finishChance,
    winsWhenReady: winsWhenReady,
    planPivot: planPivot,
    planFamily: planFamily,
    leftPlan: leftPlan,
    isolatedTile: isolatedTile,
    looseTerminal: looseTerminal,
    shortSuitDiscard: shortSuitDiscard,
    breaksFinishedStraight: breaksFinishedStraight,
    suitCounts: suitCounts,
    readTable: readTable,
    raceOdds: raceOdds,
    feedLoss: feedLoss,
    valueSlope: valueSlope,
    withMeld: withMeld,
    chowAllowed: chowAllowed,
    chowSuitReady: chowSuitReady,
    sharedPriority: sharedPriority,
    keptHonorPair: keptHonorPair,
    chowOfAnotherSuit: chowOfAnotherSuit,
    holdsDragon: holdsDragon,
    loneDragon: loneDragon,
    aimablePlans: aimablePlans,
    leftRead: leftRead,
    afterRead: afterRead,
    avoidSuit: avoidSuit,
    suitLean: suitLean,
    buildContext: buildContext,
    valueWeight: valueWeight,
    handUtility: handUtility,
    plansFor: plansFor,
    readyValue: readyValue,
    opponentThreats: opponentThreats,
    flowerPoints: flowerPoints,
    setTuning: setTuning,
    handValue: handValue,
    deadTile: deadTile,
    chowCommitment: chowCommitment,
    cheapWin: cheapWin,
    upgradePlans: upgradePlans,
    setUpgrades: setUpgrades,
    pairsUpgrades: pairsUpgrades,
    liveUpgrade: liveUpgrade,
    upgradeOrder: upgradeOrder,
    isHardTarget: isHardTarget,
    SETS_PLANS: SETS_PLANS,
    suitCommitment: suitCommitment,
    riskStep: riskStep,
    chaseSevenPairs: chaseSevenPairs,
    isOrphanIndex: isOrphanIndex,
    ORPHAN_INDEXES: ORPHAN_INDEXES,
    syncHandPlans: syncHandPlans,
    revealedCopies: revealedCopies,
    isPungTile: isPungTile,
    discardPriority: discardPriority,
    dealInLoss: dealInLoss,
    defenseWeight: defenseWeight,
    THREAT_LEVELS: THREAT_LEVELS,
    waitChance: waitChance,
    analyzeDiscards: analyzeDiscards,
    chooseTurnAction: chooseTurnAction,
    chooseClaim: chooseClaim,
    decideClaim: decideClaim,
    claimCandidates: claimCandidates,
    createBotAgent: createBotAgent,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MahjongBot = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
