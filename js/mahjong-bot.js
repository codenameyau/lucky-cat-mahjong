/* Bot opponents and hint analysis for the Play game.

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
   On top of that, the expert playbook:
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
        with a big hand; Chow only when it clearly gets closer to ready, and
        early in the hand only for a ready hand or a flush one tile from
        ready; Pung dragons and own/round winds freely; a kong is fine at
        any point.
     E. keep pairs. Break one only after every non-pair is gone, unless a
        chow has committed the hand to one suit: pairs in the other suits
        are discarded with those suits.
     F. keep dragons until at least one copy is already visible. A tile
        someone has Punged or Konged is the first discard when the hand
        does not need it. A punged honor is safe for the whole table; a
        punged number tile can still finish a chow.
     G. with more than four concealed pairs and no pung or kong, play
        Seven Pairs. With nine different terminals and honors (or eight
        and a pair), all still live, play Thirteen Orphans. With eleven
        tiles of a suit's 1112345678999 skeleton, play Nine Gates. A
        concealed hand of runs, with no honors and no claims, plays
        Concealed All Sequences.
     The keep-pairs and keep-dragons orders never cost a step toward ready,
     and while folding, safety decides and they only break ties.
   The coach in js/mahjong-coach.js says this same decision in words. It
   does not keep a second plan of its own.

   This is the "jorge-yau" strategy. Other strategies (js/mahjong-lucky-cat.js)
   reuse this same machinery through createStrategy(def): `def.hooks` swaps in
   their own plans, discard order, claims and reads, and `def.tuning` their
   own knobs. See docs/strategies/. */

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
    ctx.slope = valueSlope(game, seat);
    ctx.isDealer = seat === game.dealer;
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
  // Chosen by simulation for the most points per hand (see docs/strategies/jorge-yau.md).
  //   tripletsLive: on All Triplets, throw the tile with fewest copies left.
  //   chowSuitLate: near the end, how much more dangerous each chow an
  //     opponent has in a suit makes that suit's tiles.
  var BASE_TUNING = { valuePower: 1, defenseScale: 1.5, lateFold: 1.5, lateFoldWall: 45, tripletsLive: true, chowSuitLate: 0.5 };
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

  // Once you've exposed a chow, a hand of mixed suits can't reach the 3-faan
  // minimum (it has given up Concealed, and All Sequences needs 3 faan from
  // somewhere else), so the way forward is a flush in the chow's suit and
  // every tile of another suit is worth nothing. This holds for every chow
  // hand; only open melds in two number suits (where no flush is left) don't
  // commit. Returns that suit, or null.
  function chowCommitment(ctx) {
    if (!ctx.hasChow) return null;
    var suits = Object.keys(ctx.meldSuits).filter(function (k) { return k !== 'z'; });
    return suits.length === 1 ? suits[0] : null;
  }

  // The suit the hand is clearly going for, if any: after a chow, the chow's
  // suit; otherwise one suit holding at least 8 of the hand's tiles and, with
  // the honors, at least 10 (sets already made count). Tiles of the other two
  // suits are then thrown first.
  function suitCommitment(ctx, counts) {
    var chow = chowCommitment(ctx);
    if (chow) return chow;
    var other = Object.keys(ctx.meldSuits).filter(function (k) { return k !== 'z'; });
    if (other.length > 1) return null;
    var setsIn = function (fits) {
      return ctx.melds.filter(function (m) { return fits(E.tileIndex(m.tiles[0])); }).length * 3;
    };
    var honors = countWhere(counts, function (i) { return i >= 27; }) + setsIn(function (i) { return i >= 27; });
    for (var s = 0; s < 3; s++) {
      var su = SUIT_LETTERS[s];
      if (other.length && other[0] !== su) continue;
      var inSuit = function (i) { return i < 27 && E.suitOfIndex(i) === su; };
      var n = countWhere(counts, inSuit) + setsIn(inSuit);
      if (n >= 8 && n + honors >= 10) return su;
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
  // Thirteen Orphans starts at 9 (nine different terminals and honors, or
  // eight and a pair). Nine Gates starts at 11 of its 13 tiles: short of that
  // a Full Flush keeps the same tiles and can still claim, so it's the better
  // plan.
  var ORPHANS_MIN = 9;
  var GATES_MIN = 11;
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

  // The suit whose 1112345678999 skeleton already has 8 tiles, if any.
  function bestNineGates(c) {
    var best = null;
    for (var s = 0; s < 3; s++) {
      var progress = nineGatesProgress(c, s * 9);
      if (progress >= GATES_MIN && (!best || progress > best.progress)) {
        best = { suit: SUIT_LETTERS[s], start: s * 9, progress: progress };
      }
    }
    return best;
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

  // Seven Pairs, Thirteen Orphans, or Nine Gates, whichever is closer.
  function pickSpecial(c, ctx) {
    if (ctx.declared) return null;
    var list = [];
    if (chaseSevenPairs(c, ctx)) list.push({ kind: 'pairs', faan: baseFaan(ctx) + 4 + pairsFlush(c), shantenFn: E.sevenPairsShanten });
    if (orphanProgress(c) >= ORPHANS_MIN && orphansAlive(c, ctx)) list.push({ kind: 'orphans', faan: 13, shantenFn: E.orphansShanten });
    var gates = bestNineGates(c);
    if (gates) list.push({ kind: 'gates', gates: gates, faan: 13, shantenFn: nineGatesShanten(gates.start) });
    var best = null;
    list.forEach(function (item) {
      var s = item.shantenFn(c, ctx.declared || 0);
      if (s === Infinity) return;
      if (!best || s < best.s || (s === best.s && item.faan > best.faan)) best = { s: s, item: item };
    });
    return best ? best.item : null;
  }

  function specialPlan(ctx, counts) {
    if (H.plans) return null; // a strategy with its own plans picks these itself
    var spec = ctx.lockedSpecial || pickSpecial(counts, ctx);
    if (!spec) return null;
    return makeSpecialPlan(spec.kind, counts, ctx, spec.gates);
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

  // Lower is thrown first. Off-suit tiles after a committing chow go before
  // everything. Then a punged tile the hand does not need. Then ordinary
  // tiles. Pairs wait. An unrevealed dragon waits longer still, unless the
  // hand is chasing Seven Pairs and that dragon is only a single.
  // All Triplets keeps every pair and every pung: those wait behind any
  // single, and a finished pung waits behind a pair.
  function discardPriority(game, ctx, counts, candidate, bestShanten) {
    if (H.priority) {
      var own = H.priority(game, ctx, counts, candidate, bestShanten);
      if (own !== null && own !== undefined) return own;
    }
    var i = candidate.index;
    var locked = ctx.lockedSpecial;
    if (locked && locked.kind === 'orphans') return isOrphanIndex(i) ? 4 : 0;
    if (locked && locked.kind === 'gates') return gatesTileNeeded(counts, locked.gates.start, i) ? 4 : 0;
    var committed = suitCommitment(ctx, counts);
    if (committed && i < 27 && E.suitOfIndex(i) !== committed) return 0;
    if (isPungTile(game, i) && counts[i] < 2 && candidate.shanten <= bestShanten) return 1;
    var best = candidate.analysis && candidate.analysis.best;
    var plan = best && best.plan;
    if (plan && !best.readyBest && (plan.id === 'triplets' || plan.id === 'concealed-triplets') && counts[i] >= 2) {
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
  function plansFor(c, ctx) {
    return H.plans ? H.plans(c, ctx) : basePlans(c, ctx);
  }

  function basePlans(c, ctx) {
    var special = specialPlan(ctx, c);
    if (special) return [special];
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
    // Concealed All Sequences: runs only. Honors are discarded, and nothing
    // is claimed, because either one breaks the hand.
    // (Not while the hand holds a set of honors, which can never be thrown
    // away to make an all-runs hand.)
    var honorSet = false;
    for (var hs = 27; hs < 34; hs++) if (c[hs] >= 3) honorSet = true;
    if (!ctx.declared && !honorSet) {
      plans.push({
        id: 'straights',
        label: 'Concealed All Sequences',
        counts: restrict(c, function (i) { return i < 27; }),
        shantenFn: E.standardShanten,
        faan: base + 1,
        open: false,
      });
    }

    ['c', 'd', 'b'].forEach(function (su) {
      var offSuit = Object.keys(ctx.meldSuits).some(function (k) { return k !== su && k !== 'z'; });
      if (offSuit) return;
      var inHalf = function (i) { return E.suitOfIndex(i) === su || i >= 27; };
      var inFull = function (i) { return E.suitOfIndex(i) === su; };
      // Sets already made count toward "most of the hand" (3 tiles each).
      var setTiles = function (fits) {
        return ctx.melds.filter(function (m) { return fits(E.tileIndex(m.tiles[0])); }).length * 3;
      };
      if (countWhere(c, inHalf) + setTiles(inHalf) >= 7) {
        plans.push({
          id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su],
          counts: restrict(c, inHalf), shantenFn: E.standardShanten,
          faan: base + 3 + handYaku(ctx, restrict(c, inHalf)), open: true,
        });
      }
      if (!ctx.meldSuits.z && countWhere(c, inFull) + setTiles(inFull) >= 7) {
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

    return plans;
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

  // Chance to finish: expected draws to win vs the draws left in the wall.
  // Open plans also improve from claims.
  function finishChance(ctx, s, u, open) {
    var n = ctx.unseenTotal;
    var expected = n / (Math.max(u, 0.5) * (open ? 1.33 : 1));
    var t = ctx.drawsLeft;
    return t / (t + expected) * Math.pow(STEP, s) * COMPETITION;
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
    if (H.readyValue) value = H.readyValue(value, details, c, ctx);
    var best = 0;
    details.forEach(function (d) { if (d.left && d.ronOk) best = Math.max(best, d.ronFaan); });
    return { value: value, waits: details, live: tsumo + ron / 1.5, bestFaan: best };
  }

  /* ------------------------------------------------------------------ *
   * 5. Hand utility (expected points from a waiting-to-draw hand)
   * ------------------------------------------------------------------ */

  function handUtility(c, ctx) {
    var plans = plansFor(c, ctx);
    var best = null;
    var shantenAll = E.shanten(c, ctx.declared);
    plans.forEach(function (p) {
      var s = p.shantenFn(p.counts, ctx.declared);
      if (s === Infinity) return;
      var pc = p.counts.slice();
      var u = ukeire(pc, p.shantenFn, ctx.declared, ctx.unseen, s);
      var chance = finishChance(ctx, s, u.total, p.open);
      var util = handValue(p.faan + SELF_DRAW_CHANCE, ctx.slope) * 1.8 * chance;
      // A strategy can prefer a plan (plan.weight) without inflating its value.
      var entry = { plan: p, shanten: s, planShanten: s, ukeire: u.total, ukeireTiles: u.tiles, util: util, pick: util * (p.weight || 1) };
      if (!best || entry.pick > best.pick) best = entry;
    });
    var ready = null;
    if (shantenAll === 0) {
      ready = readyValue(c, ctx);
      if (ready && (!best || ready.value >= best.util)) {
        best = {
          plan: best ? best.plan : null,
          shanten: 0,
          planShanten: best ? best.planShanten : 0,
          ukeire: ready.live,
          util: ready.value,
          readyBest: true,
        };
      }
    }
    var plainS = E.standardShanten(c, ctx.declared);
    return {
      util: best ? best.util : 0,
      best: best,
      shanten: shantenAll,
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
    // building: its tiles are more likely to finish their hand.
    if (i < 27 && threat.chows[E.suitOfIndex(i)] && game.hand.wall.length < LATE_WALL) {
      chance *= 1 + T.chowSuitLate * threat.chows[E.suitOfIndex(i)];
    }
    if (threat.since[E.tileId(i)]) chance *= 0.15;
    else if (threat.discarded[E.tileId(i)]) chance *= 0.5;
    if (threat.flush) {
      var fs = E.suitOfIndex(i);
      if (fs === threat.flush) chance *= 2.5;
      else if (fs === 'z') chance *= 1.3;
      else chance *= 0.15;
    }
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

  // All Triplets needs more copies of the tiles it holds, so within each
  // discard group the tile with the fewest copies left (unseen by this seat)
  // goes first and the liveliest are kept. A risky tile always waits, and
  // near the end of the hand every step of risk comes first, then how many
  // are left.
  function tripletsOrder(out, ctx) {
    var lead = out[0] && out[0].analysis.best;
    var plan = lead && lead.plan;
    if (!plan || (plan.id !== 'triplets' && plan.id !== 'concealed-triplets') || lead.readyBest) return out;
    var late = ctx.wallLeft < LATE_WALL;
    return out.map(function (x, k) { return { x: x, k: k }; }).sort(function (a, b) {
      if (a.x.tier !== b.x.tier) return a.x.tier - b.x.tier;
      var ra = riskStep(a.x.loss), rb = riskStep(b.x.loss);
      if (!late) { ra = ra === 3 ? 1 : 0; rb = rb === 3 ? 1 : 0; }
      if (ra !== rb) return ra - rb;
      var ua = ctx.unseen[a.x.index], ub = ctx.unseen[b.x.index];
      if (ua !== ub) return ua - ub;
      return a.k - b.k;
    }).map(function (o) { return o.x; });
  }

  /* ------------------------------------------------------------------ *
   * 7. Discard analysis (14 tiles in hand)
   * ------------------------------------------------------------------ */

  function syncHandPlans(ctx, counts) {
    ctx.blockSevenPairs = concealedShape(counts).hasSet;
    ctx.lockedSpecial = H.plans ? null : pickSpecial(counts, ctx);
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
    var readyFaan = out.reduce(function (m, x) { return Math.max(m, x.analysis.ready ? x.analysis.ready.bestFaan : 0); }, 0);
    var weight = defenseWeight(ctx, threats, bestShanten, readyFaan);
    // Folding: safety decides, and the keep-pairs and keep-dragons orders
    // only break ties (a safe pair is the right tile to break).
    var folding = weight > (ctx.isDealer ? 0.9 : 1);
    weight *= T.defenseScale;
    // After a chow, tiles of other suits are worthless: they go first, ahead
    // of honors and chow-suit tiles that tie with them on value.
    var committed = suitCommitment(ctx, c);
    out.forEach(function (x) {
      x.score = x.util - weight * x.loss;
      if (committed && x.index < 27 && E.suitOfIndex(x.index) !== committed) x.score += 0.004;
      x.priority = discardPriority(game, ctx, c, x, bestShanten);
      // Keeping a pair or a dragon never costs a step toward ready: a discard
      // that leaves the hand slower waits behind every one that doesn't.
      // (A strategy's group below 0 goes first whatever it costs, but unlike
      // 0 it doesn't override folding.)
      x.tier = x.priority <= 0 || x.shanten <= bestShanten ? x.priority : 10 + x.priority;
    });
    out.sort(function (a, b) {
      // Off-suit tiles after a chow always go first, even while folding
      // (then the safest of them goes).
      var offA = a.priority === 0, offB = b.priority === 0;
      if (offA !== offB) return offA ? -1 : 1;
      if (!folding && a.tier !== b.tier) return a.tier - b.tier;
      if (b.score !== a.score) return b.score - a.score;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return E.isTerminalOrHonorIndex(b.index) - E.isTerminalOrHonorIndex(a.index);
    });
    if (!folding && T.tripletsLive) out = tripletsOrder(out, ctx);
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
    // Any other claim breaks Concealed All Sequences.
    if (stayPlan && stayPlan.id === 'straights') return { decision: { type: 'pass' }, found: res };
    var options = res.options.filter(function (o) {
      return o.decision.type !== 'chow' || chowWorthIt(o, res, ctx, game);
    });
    var top = options[0];
    var bar = top && top.decision.type === 'chow' ? 1.2 : 1.04;
    if (top && top.score > res.passScore * bar + 0.01) return { decision: top.decision, found: res };
    return { decision: { type: 'pass' }, found: res };
  }

  function chooseClaim(game, seat, opts) {
    return decideClaim(game, seat, opts).decision;
  }

  // A chow gives up the hand's concealed faan and shows what you're doing, so
  // take one only when it is necessary or helps a lot: it makes the hand
  // ready for a winning faan count, or it builds the flush the hand is
  // already going for, or it's late and gets you meaningfully closer.
  function chowWorthIt(o, res, ctx, game) {
    var an = o.analysis;
    if (!an) return false;
    var after = an.shanten, before = res.stay.shanten;
    if (after >= before) return false;
    var min = game.settings.minFaan;
    var plan = an.best && an.best.plan;
    // After the chow the hand must still be able to reach the minimum.
    if (after === 0) return !!(an.ready && an.ready.bestFaan >= min);
    if (!plan || plan.faan < min - 0.25) return false;
    var flushPlan = /^(half|full)/.test(plan.id);
    // Early in the hand (over 60 tiles left) there's time to draw the tile
    // instead, so a flush chow must leave the hand within one tile of ready.
    var early = ctx.wallLeft > 60;
    if (flushPlan && after <= (early ? 1 : 2)) return true;
    // Late in the hand, a chow that saves a step is worth the cost.
    var late = ctx.turn >= 9 || ctx.wallLeft < 48;
    return late && before - after >= 1 && after <= 2;
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
   *      plans(c, ctx) -> [plan]         the hands to aim for (basePlans is
   *                                      jorge-yau's list); plan.weight
   *                                      scales a plan's value
   *      priority(game, ctx, counts, candidate, bestShanten) -> group
   *                                      the discard order (lower goes first;
   *                                      below 0 goes first unless folding)
   *      readyValue(value, waits, c, ctx) -> value
   *      threats(list, game, seat)       add reads to each opponent
   *      waitChance(chance, game, threat, i) -> chance
   *      extraLoss(game, threats, i) -> loss  e.g. feeding a claim
   *      defense(weight, ctx, threats, shanten, readyFaan) -> weight
   *      claim(found, ctx, game, seat, opts) -> decision
   *    priority and claim may return null to use jorge-yau's choice.
   * ------------------------------------------------------------------ */

  function createStrategy(def) {
    def = def || {};
    var hooks = def.hooks || NO_HOOKS;
    var tuning = copy(BASE_TUNING);
    Object.keys(def.tuning || {}).forEach(function (k) { tuning[k] = def.tuning[k]; });
    var out = { id: def.id };
    Object.keys(api).forEach(function (k) {
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
    id: 'jorge-yau',
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
    valueSlope: valueSlope,
    withMeld: withMeld,
    chowWorthIt: chowWorthIt,
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
    suitCommitment: suitCommitment,
    riskStep: riskStep,
    chaseSevenPairs: chaseSevenPairs,
    syncHandPlans: syncHandPlans,
    specialPlan: specialPlan,
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
