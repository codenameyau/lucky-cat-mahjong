/* The "jorge-yau" bot strategy.

   It plays the shared foundation in js/mahjong-bot.js (shanten, live
   tiles, exact scoring of ready hands, the threat model, and the one-suit
   rules every bot follows), but picks its hand differently and plays it
   differently:
     - Target. From the opening hand it picks one hand to aim for, in a fixed
       order (TARGETS below): Thirteen Orphans, Nine Gates, Big Four Winds,
       Big Three Dragons, All Terminals, All Honors, Seven Pairs, Full Flush,
       Concealed Triplets, Half Flush, All Triplets, Concealed Straights. Each
       turn the current hand is read again; a stronger target replaces it,
       and a target that can no longer be made gives way. The target's plans
       are preferred (K.targetWeight); it pivots to its smaller hand when that
       is ready first, or late in the wall (20 tiles or fewer), see pivot().
     - Discards. Tiles the target can't use go first. Pairs and live honors
       wait, except on Concealed Straights, which drops honors first.
     - Fast hands. With a scoring wind (seat or round) or a seat flower, the
       hand already has faan, so it plays for speed instead of size.
     - Claims. Stay concealed. Early chows only for a flush in that suit;
       never chow into a suit you hold few tiles of. Pungs are fine early.
     - Late game. Unlikely to win near the end of the wall, it stops
       building and stops feeding: no chow tiles to the next player, no
       fresh dragons or winds.
     - Reads. Every opponent's discards say which hand they are likely on
       (a flush in the suit they keep, honors they hold, a sequence hand
       that threw its honors early), and so which tiles they need.
   The playbook is written out in docs/strategies/jorge-yau.md. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var F = E.HKScoring.FAAN;

  var SUITS = ['c', 'd', 'b'];
  var SUIT_LABELS = { c: 'Characters', d: 'Circles', b: 'Bamboos' };
  var ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  var TERMINALS = [0, 8, 9, 17, 18, 26];
  var WINDS = [27, 28, 29, 30];
  var DRAGONS = [31, 32, 33];
  var LIMIT = 13;

  var LOCK_TILES = 8, LOCK_FAAN = 7, LOCK_TURNS = 8, STEP_IN_FAAN = 1.25;

  function isWind(i) { return i >= 27 && i < 31; }
  function isDragon(i) { return i >= 31; }
  function inSuit(su) {
    return function (i) { return i < 27 && E.suitOfIndex(i) === su; };
  }

  // Tiles held plus melds made, of the kind `fits` keeps.
  function tilesOf(c, ctx, fits) {
    return ctx.melds.reduce(function (n, m) {
      return n + (fits(E.tileIndex(m.tiles[0])) ? 3 : 0);
    }, B.countWhere(c, fits));
  }

  var EARLY_WALL = 60;
  // Late in the wall: 20 tiles or fewer left. A target then gives way to its smaller hand.
  var LATE_WALL = 20;

  // Jorge Yau's knobs, kept with the strategy's tuning (bot.setTuning) so
  // the competition can compare settings.
  //   targetWeight: how strongly the target's plans are preferred
  //   giveUpWall: under this many tiles left, 2+ from ready, stop building
  //   giveUpDefense: how much more safety weighs then
  //   feed: weight on feeding claims (chow tiles, fresh honors)
  //   reads: read opponents' hands from their discards
  //   skip: target ids to leave out of the read (to measure each one)
  //   ownClaims: false (the default) uses lucky-cat's claims, which scored
  //     about 47 points a hand more; true takes any claim that gets closer;
  //     'lock' takes its own only while locked onto a big hand
  //   ownDiscards: false uses lucky-cat's discard order
  // keepPairs: don't break a pair that can still become a pung when a single
  // costs no speed (MahjongBot keepPairs); the number is how much hand value
  // the single may cost. honorOrder: between tied honors, keep the ones worth
  // most (MahjongBot honorTieOrder).
  var TUNING = { targetWeight: 1.5, giveUpWall: 40, giveUpDefense: 1.6, feed: 1, reads: true, skip: [], ownClaims: false, ownDiscards: true, keepPairs: 0, honorOrder: true };
  var K0 = TUNING; // replaced by the strategy's own copy below
  // The knobs of the copy being played: Jorge Yau's own, or a variant's or
  // Neural Cat's (each strategy built on these hooks has its own tuning).
  function knobs() {
    var t = B.currentTuning ? B.currentTuning() : null;
    return t && t.targetWeight !== undefined ? t : K0;
  }

  function isOrphan(i) { return ORPHANS.indexOf(i) !== -1; }
  function isTerminal(i) { return TERMINALS.indexOf(i) !== -1; }
  function isHonor(i) { return i >= 27; }
  function suitOf(i) { return E.suitOfIndex(i); }
  function sum(c, list) { return list.reduce(function (n, i) { return n + c[i]; }, 0); }

  /* ------------------------------------------------------------------ *
   * 1. Reading the hand: which target
   * ------------------------------------------------------------------ */

  // Tiles held plus tiles in open melds, by kind.
  function allCounts(c, ctx) {
    var all = c.slice();
    ctx.melds.forEach(function (m) {
      m.tiles.slice(0, 3).forEach(function (id) { all[E.tileIndex(id)]++; });
    });
    return all;
  }

  function suitTotals(all) {
    var by = { c: 0, d: 0, b: 0 };
    for (var i = 0; i < 27; i++) by[suitOf(i)] += all[i];
    return by;
  }

  // The suit with the most tiles. When the next suit is within a tile of
  // it, the left player's read decides (MahjongBot.leftRead): stay out of
  // the suit they keep, and take the one they're throwing.
  function topSuit(by, read) {
    var order = SUITS.slice().sort(function (a, b) { return by[b] - by[a]; });
    var top = order[0], next = order[1];
    if (read && by[next] >= by[top] - 1 && next !== read.keeps && (top === read.keeps || next === read.feeds)) return next;
    return top;
  }

  function hasSuitedMeld(ctx, except) {
    return ctx.melds.some(function (m) {
      var su = suitOf(E.tileIndex(m.tiles[0]));
      return su !== 'z' && su !== except;
    });
  }

  // The order the targets are tried in. The first that fits is the target.
  // Each one: when it fits the hand, and when it can no longer be made.
  var TARGETS = [
    {
      id: 'orphans', name: 'Thirteen Orphans', hard: true,
      fits: function (r) { return !r.ctx.declared && r.orphanKinds >= 8 && B.orphansAlive(r.c, r.ctx); },
      dead: function (r) { return r.ctx.declared || !B.orphansAlive(r.c, r.ctx); },
    },
    {
      id: 'gates', name: 'Nine Gates', hard: true,
      fits: function (r) { return !r.ctx.declared && !!r.gates; },
      dead: function (r, t) { return r.ctx.declared || hasSuitedMeld(r.ctx, t.suit) || r.ctx.meldSuits.z; },
    },
    {
      id: 'winds', name: 'Big Four Winds', hard: true,
      fits: function (r) { return r.winds >= 8 && !this.dead(r); },
      // Small Four Winds has room for one set that isn't a wind; past that, or
      // with too few winds left to pung, neither can be made.
      dead: function (r) {
        return r.ctx.melds.filter(function (m) { return !isHonor(E.tileIndex(m.tiles[0])); }).length > 1 ||
          B.groupShanten(r.ctx, WINDS, 3, true)(r.c, r.ctx.declared) === Infinity;
      },
    },
    {
      // A pair or more of every dragon: Big Three Dragons, then Small Three Dragons.
      id: 'dragons', name: 'Big Three Dragons', hard: true,
      fits: function (r) { return DRAGONS.every(function (i) { return r.all[i] >= 2; }) && !this.dead(r); },
      dead: function (r) { return B.groupShanten(r.ctx, DRAGONS, 2, true)(r.c, r.ctx.declared) === Infinity; },
    },
    {
      id: 'terminals', name: 'All Terminals', hard: true,
      fits: function (r) { return r.terminals >= 8; },
      dead: function (r) { return r.ctx.hasChow || r.ctx.melds.some(function (m) { return !isOrphan(E.tileIndex(m.tiles[0])); }); },
    },
    {
      id: 'honors', name: 'All Honors', hard: true,
      fits: function (r) { return r.honors >= 8; },
      dead: function (r) { return r.ctx.hasChow; },
    },
    {
      id: 'pairs', name: 'Seven Pairs',
      fits: function (r) { return !r.ctx.declared && r.pairs >= 4; },
      dead: function (r) { return r.ctx.declared; },
    },
    {
      id: 'full', name: 'Full Flush', hard: true,
      fits: function (r) { return r.by[r.top] >= 8; },
      dead: function (r, t) { return hasSuitedMeld(r.ctx, t.suit); },
    },
    {
      // Sets already in hand: build Concealed Triplets, then All Triplets or
      // Seven Pairs, in one suit and honors where it can.
      id: 'triplets', name: 'Concealed Triplets',
      fits: function (r) { return r.sets >= 1 && r.sets <= 3; },
      dead: function (r) { return r.ctx.hasChow; },
    },
    {
      id: 'half', name: 'Half Flush',
      fits: function (r) {
        var second = SUITS.filter(function (s) { return s !== r.top; }).map(function (s) { return r.by[s]; });
        return r.honors >= 3 && r.by[r.top] >= 5 && r.by[r.top] >= Math.max.apply(null, second) * 2;
      },
      dead: function (r, t) { return hasSuitedMeld(r.ctx, t.suit); },
    },
    {
      // Three pairs and no set yet, when pairs are no slower than runs: pung
      // them into All Triplets, open or not, with Concealed Triplets and Seven
      // Pairs behind it.
      id: 'all-triplets', name: 'All Triplets',
      fits: function (r) { return !r.ctx.hasChow && r.pairs >= 3 && E.tripletsShanten(r.c) <= E.standardShanten(r.c); },
      dead: function (r) { return r.ctx.hasChow; },
    },
    {
      id: 'sequences', name: 'Concealed Straights',
      fits: function (r) {
        var suited = r.by.c + r.by.d + r.by.b;
        var used = SUITS.map(function (s) { return r.by[s]; }).filter(function (n) { return n >= 2; });
        return suited >= 9 && used.length >= 2 && Math.max.apply(null, used) - Math.min.apply(null, used) <= 3;
      },
      dead: function (r) { return r.ctx.declared; },
    },
    {
      id: 'standard', name: 'a standard hand',
      fits: function () { return true; },
      dead: function () { return false; },
    },
  ];

  var TARGET_BY_ID = {};
  TARGETS.forEach(function (t, k) { t.rank = k; TARGET_BY_ID[t.id] = t; });

  function readHand(c, ctx) {
    var all = allCounts(c, ctx);
    var by = suitTotals(all);
    var pairs = 0, sets = 0;
    for (var i = 0; i < 34; i++) {
      if (all[i] >= 2) pairs++;
      if (all[i] >= 3) sets++;
    }
    var gates = null;
    SUITS.forEach(function (su, s) {
      var progress = B.nineGatesProgress(all, s * 9);
      if (progress >= 7 && (!gates || progress > gates.progress)) gates = { suit: su, start: s * 9, progress: progress };
    });
    return {
      c: c, ctx: ctx, all: all, by: by, top: topSuit(by, ctx.leftRead), pairs: pairs, sets: sets, gates: gates,
      orphanKinds: ORPHANS.filter(function (k) { return all[k] > 0; }).length,
      winds: sum(all, WINDS),
      terminals: sum(all, TERMINALS),
      honors: sum(all, WINDS.concat(DRAGONS)),
    };
  }

  // One-suit targets: a flush, or Nine Gates (a flush with a shape).
  var ONE_SUIT = ['gates', 'full', 'half'];

  function classify(c, ctx) {
    var r = readHand(c, ctx);
    // The suit the left player is collecting, when another is about even
    // (MahjongBot.avoidSuit): no flush target there.
    var avoid = B.avoidSuit(c, ctx);
    for (var k = 0; k < TARGETS.length; k++) {
      var t = TARGETS[k];
      if (knobs().skip.indexOf(t.id) !== -1 || !t.fits(r)) continue;
      var out = { id: t.id, rank: t.rank, name: t.name };
      if (t.id === 'gates') { out.suit = r.gates.suit; out.start = r.gates.start; }
      if (t.id === 'full' || t.id === 'half' || t.id === 'triplets') out.suit = r.top;
      if (avoid && ONE_SUIT.indexOf(t.id) !== -1 && out.suit === avoid) continue;
      return out;
    }
    return null;
  }

  // Each seat's opening read, kept for the hand (keyed by the hand object).
  var openings = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function remember(game, seat, make) {
    if (!openings || !game.hand) return make();
    var bySeat = openings.get(game.hand);
    if (!bySeat) { bySeat = {}; openings.set(game.hand, bySeat); }
    if (!bySeat[seat]) bySeat[seat] = make();
    return bySeat[seat];
  }

  // The target for this seat now: the opening read, replaced by a stronger
  // read of the current hand, or by the current read once it can't be made.
  function currentTarget(game, seat, c, ctx) {
    var opening = remember(game, seat, function () { return { target: classify(c, ctx) }; });
    var now = classify(c, ctx);
    var held = opening.target;
    var heldDef = held && TARGET_BY_ID[held.id];
    var r = readHand(c, ctx);
    // A flush target in the suit the left player turns out to be collecting
    // gives way too.
    var avoided = held && ONE_SUIT.indexOf(held.id) !== -1 && held.suit === B.avoidSuit(c, ctx);
    // Past the opening discards, only a limit hand is worth leaving a live
    // target for.
    var stronger = now.rank < held.rank && (ctx.turn < 3 || TARGET_BY_ID[now.id].hard);
    if (!held || heldDef.dead(r, held) || avoided || stronger) opening.target = now;
    return opening.target;
  }

  // A seat or round wind (set or live pair), or a seat flower or season, is
  // faan already in hand: play for speed. So are flowers and sets that give
  // all but one faan of the minimum (MahjongBot.cheapWin).
  function hasQuickFaan(game, seat, c, ctx) {
    var mine = 26 + ctx.seatWind, round = 26 + ctx.round;
    var all = allCounts(c, ctx);
    var wind = [mine, round].some(function (i) {
      return all[i] >= 3 || (all[i] === 2 && ctx.unseen[i] >= 1);
    });
    var flower = ctx.flowers.some(function (f) { return f === 'f' + ctx.seatWind || f === 's' + ctx.seatWind; });
    return wind || flower || B.cheapWin(ctx);
  }

  /* ------------------------------------------------------------------ *
   * 2. Hooks: context and plans
   * ------------------------------------------------------------------ */

  function context(ctx, game, seat) {
    var c = E.countsOf(game.hand.seats[seat].hand);
    ctx.target = currentTarget(game, seat, c, ctx);
    ctx.fast = hasQuickFaan(game, seat, c, ctx);
    // Fast hands, and late hands, value finishing over size.
    if (ctx.fast && !TARGET_BY_ID[ctx.target.id].hard) ctx.slope = Math.min(ctx.slope, 0.45);
  }

  function keepFor(target) {
    var su = target.suit;
    switch (target.id) {
      case 'orphans': return isOrphan;
      case 'gates': return function (i) { return suitOf(i) === su; };
      case 'winds':
      case 'honors': return isHonor;
      case 'terminals': return function (i) { return isTerminal(i) || isHonor(i); };
      case 'full': return function (i) { return suitOf(i) === su; };
      case 'half': return function (i) { return suitOf(i) === su || isHonor(i); };
      case 'sequences': return function (i) { return i < 27; };
      default: return null;
    }
  }

  function reasonFor(target) {
    var su = SUIT_LABELS[target.suit];
    switch (target.id) {
      case 'orphans': return 'Thirteen Orphans uses only terminals and honors.';
      case 'gates': return 'Nine Gates uses only ' + su + '.';
      case 'winds': return 'Four Winds keeps only honors.';
      case 'honors': return 'All Honors keeps only honors.';
      case 'terminals': return 'All Terminals keeps only 1s, 9s and honors.';
      case 'full': return 'Full Flush keeps only ' + su + '.';
      case 'half': return 'Not ' + su + ' or an honor.';
      case 'sequences': return 'Honors break All Sequences.';
      default: return null;
    }
  }

  function plan(fields) {
    fields.weight = fields.weight || 1;
    return fields;
  }

  function flushPlans(c, ctx, su, base, halfWeight, fullWeight) {
    var out = [];
    var inHalf = function (i) { return suitOf(i) === su || i >= 27; };
    var inFull = function (i) { return suitOf(i) === su; };
    if (!hasSuitedMeld(ctx, su)) {
      out.push(plan({
        id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su],
        counts: B.restrict(c, inHalf), shantenFn: E.standardShanten,
        faan: base + F.halfFlush + B.handYaku(ctx, B.restrict(c, inHalf)), open: true, weight: halfWeight,
      }));
      if (!ctx.meldSuits.z) {
        out.push(plan({
          id: 'full-' + su, suit: su, label: 'a Full Flush in ' + SUIT_LABELS[su],
          counts: B.restrict(c, inFull), shantenFn: E.standardShanten,
          faan: base + F.fullFlush, open: true, weight: fullWeight,
        }));
      }
    }
    return out;
  }

  function honorsOnly(c) { return B.restrict(c, isHonor); }

  // Pung-group hands (Four Winds, Three Dragons): those honors in pungs (and
  // a pair for the small one), the rest anything. A hand that can't be made
  // any more (too few copies left) is left out.
  function groupPlans(c, ctx, specs) {
    var out = [];
    specs.forEach(function (s) {
      var fn = B.groupShanten(ctx, s.group, s.pungs, s.pair);
      if (fn(c, ctx.declared) === Infinity) return;
      out.push(plan({
        id: s.id, label: s.label, counts: c, shantenFn: fn, faan: Math.min(LIMIT, s.faan), open: true, weight: s.weight,
        favors: function (i) { return s.group.indexOf(i) !== -1; },
      }));
    });
    return out;
  }

  // The pivots: the target's own plans weigh W, its smaller hands less. The
  // hand pivots to a smaller hand when it is ready and the target isn't, or
  // late in the wall (LATE_WALL tiles or fewer) when the smaller hand is no
  // further from ready: the smaller hand then weighs W and the target's own
  // plans are dropped, so the hand goes where it is more likely to win (a
  // bigger hand pays so much more that a lighter weight alone wouldn't move it).
  function pivot(out, ctx, W) {
    if (W <= 1) return;
    var steps = function (p) { return p.shantenFn(p.counts, ctx.declared); };
    var own = out.filter(function (p) { return p.weight === W; });
    if (!own.length) return;
    var ownSteps = Math.min.apply(null, own.map(steps));
    // A ready target stays; late, a smaller hand counts only if it is no further away.
    var late = ctx.wallLeft <= LATE_WALL && ownSteps > 0;
    var moved = false;
    out.forEach(function (p) {
      if (p.weight >= W || p.id === 'plain') return;
      var s = steps(p);
      if ((s === 0 && ownSteps > 0) || (late && s <= ownSteps)) { p.weight = W; moved = true; }
    });
    if (moved) {
      for (var k = out.length - 1; k >= 0; k--) if (own.indexOf(out[k]) !== -1) out.splice(k, 1);
    }
  }

  function honorsPlan(c, ctx, base, weight) {
    return plan({
      id: 'honors', label: 'All Honors', counts: honorsOnly(c), shantenFn: E.tripletsShanten,
      faan: Math.min(LIMIT, base + F.allHonors + B.handYaku(ctx, honorsOnly(c))), open: true, weight: weight,
    });
  }

  function terminalsPlan(c, ctx, base, weight) {
    var kept = B.restrict(c, function (i) { return isTerminal(i) || isHonor(i); });
    var honors = sum(kept, WINDS.concat(DRAGONS)) > 0 || ctx.meldSuits.z;
    return plan({
      id: 'terminals', label: honors ? 'Mixed Orphans' : 'All Terminals',
      counts: kept, shantenFn: E.tripletsShanten,
      faan: honors ? base + F.mixedOrphans + F.allTriplets + B.handYaku(ctx, kept) : Math.min(LIMIT, base + F.allTerminals),
      open: true, weight: weight,
    });
  }

  function tripletsPlans(c, ctx, base, weight) {
    if (ctx.hasChow) return [];
    var yaku = B.handYaku(ctx, c);
    var out = [plan({ id: 'triplets', label: 'All Triplets', counts: c, shantenFn: E.tripletsShanten, faan: base + F.allTriplets + yaku, open: true, weight: weight })];
    if (!ctx.declared) {
      out.push(plan({ id: 'concealed-triplets', label: 'Concealed Triplets', counts: c, shantenFn: E.tripletsShanten, faan: base - 1 + F.allConcealedTriplets, open: false, weight: weight }));
    }
    return out;
  }

  function weigh(plans, test, w) {
    plans.forEach(function (p) { if (test(p)) p.weight = w; });
    return plans;
  }

  // Plans for the current target, with its backups. Every list ends with the
  // plain hand, weighed lightly, which MahjongBot.aimablePlans takes back out
  // unless it already has the minimum faan.
  function plans(c, ctx) {
    var t = ctx.target || { id: 'standard' };
    // After a chow only that suit's flush is left: the usual plans already say so.
    if (B.chowCommitment(ctx)) return B.basePlans(c, ctx);
    var def = TARGET_BY_ID[t.id];
    var W = ctx.fast && !def.hard ? 1 : knobs().targetWeight;
    var base = B.baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var plain = plan({ id: 'plain', label: 'a standard hand', counts: c, shantenFn: E.standardShanten, faan: base + B.handYaku(ctx, c), open: true, weight: 0.6 });
    var out;
    var su = t.suit;
    switch (t.id) {
      case 'orphans':
        // Thirteen Orphans to Seven Pairs or All Triplets, both with Mixed Orphans.
        out = [B.makeSpecialPlan('orphans', c, ctx)];
        if (!ctx.declared) {
          var op = B.makeSpecialPlan('pairs', B.restrict(c, isOrphan), ctx);
          op.faan += F.mixedOrphans;
          op.label = 'Seven Pairs';
          op.weight = W * 0.8;
          out.push(op);
        }
        out.push(terminalsPlan(c, ctx, base, 0.8));
        out[0].weight = W;
        break;
      case 'gates':
        out = [B.makeSpecialPlan('gates', c, ctx, { suit: su, start: t.start })].concat(flushPlans(c, ctx, su, base, 0.8, W));
        out[0].weight = W;
        break;
      case 'winds':
        // Big Four Winds to Small Four Winds.
        out = groupPlans(c, ctx, [
          { id: 'big-winds', label: 'Big Four Winds', group: WINDS, pungs: 4, pair: false, faan: LIMIT, weight: W },
          { id: 'small-winds', label: 'Small Four Winds', group: WINDS, pungs: 3, pair: true, faan: base + F.smallWinds + B.handYaku(ctx, B.restrict(c, isDragon)), weight: 1 },
        ]);
        break;
      case 'dragons':
        // Big Three Dragons to Small Three Dragons.
        out = groupPlans(c, ctx, [
          { id: 'big-dragons', label: 'Big Three Dragons', group: DRAGONS, pungs: 3, pair: false, faan: base + F.greatDragons + B.handYaku(ctx, B.restrict(c, isWind)), weight: W },
          { id: 'small-dragons', label: 'Small Three Dragons', group: DRAGONS, pungs: 2, pair: true, faan: base + F.smallDragons + B.handYaku(ctx, B.restrict(c, isWind)), weight: 1 },
        ]);
        break;
      case 'terminals':
        out = [terminalsPlan(c, ctx, base, W)].concat(tripletsPlans(c, ctx, base, 0.8));
        break;
      case 'honors':
        // All Honors to Half Flush or All Triplets.
        out = [honorsPlan(c, ctx, base, W)];
        SUITS.forEach(function (s) { out = out.concat(flushPlans(c, ctx, s, base, 1, 0.6).slice(0, 1)); });
        out = out.concat(tripletsPlans(c, ctx, base, 1).filter(function (p) { return p.id === 'triplets'; }));
        break;
      case 'pairs': {
        out = [];
        if (!ctx.declared && !B.concealedShape(c).hasSet) {
          var pp = B.makeSpecialPlan('pairs', c, ctx);
          pp.weight = W;
          out.push(pp);
        }
        // Seven Pairs to All Triplets.
        out = out.concat(tripletsPlans(c, ctx, base, 1).filter(function (p) { return p.id === 'triplets'; }));
        break;
      }
      case 'full':
        out = flushPlans(c, ctx, su, base, W * 0.9, W);
        break;
      case 'half':
        out = flushPlans(c, ctx, su, base, W, 1).concat(tripletsPlans(c, ctx, base, 0.8));
        break;
      case 'triplets': {
        // Concealed Triplets to Seven Pairs to All Triplets, the triplets
        // better in one suit with honors.
        out = weigh(tripletsPlans(c, ctx, base, 0.9), function (p) { return p.id === 'concealed-triplets'; }, W);
        var inHalf = function (j) { return suitOf(j) === su || j >= 27; };
        if (!ctx.hasChow && !hasSuitedMeld(ctx, su)) {
          var kept = B.restrict(c, inHalf);
          out.push(plan({
            id: 'triplets', label: 'All Triplets', counts: kept, shantenFn: E.tripletsShanten,
            faan: base + F.allTriplets + F.halfFlush + B.handYaku(ctx, kept), open: true, weight: 0.9,
          }));
        }
        if (!ctx.declared) {
          var sp = B.makeSpecialPlan('pairs', c, ctx);
          sp.weight = 1;
          out.push(sp);
        }
        break;
      }
      case 'all-triplets':
        out = weigh(tripletsPlans(c, ctx, base, W * 0.9), function (p) { return p.id === 'triplets'; }, W);
        if (!ctx.declared) {
          var ap = B.makeSpecialPlan('pairs', c, ctx);
          ap.weight = W * 0.8;
          out.push(ap);
        }
        break;
      case 'sequences':
        out = weigh(B.basePlans(c, ctx), function (p) { return p.id === 'straights'; }, W);
        break;
      default:
        out = B.basePlans(c, ctx);
        if (B.chaseSevenPairs(c, ctx)) out.push(B.makeSpecialPlan('pairs', c, ctx));
    }
    pivot(out, ctx, W);
    // Softer targets also weigh the bigger hands the same tiles can make
    // (MahjongBot.upgradePlans); the hard ones already are one.
    if (!def.hard || t.id === 'full') {
      var have = {};
      out.forEach(function (p) { have[p.id] = true; });
      var more = t.id === 'pairs' ? B.pairsUpgrades(c, ctx) : B.upgradePlans(c, ctx);
      if (t.id === 'full') more = more.filter(function (p) { return !p.keep; });
      more.forEach(function (p) { if (!have[p.id]) out.push(p); });
    }
    var keep = keepFor(t), reason = reasonFor(t);
    out.forEach(function (p) {
      if (keep && !p.keep && (p.id === t.id || p.id === t.id + '-' + su || (t.id === 'sequences' && p.id === 'straights') || (t.id === 'winds' && p.id === 'big-winds'))) {
        p.keep = keep;
        p.reason = reason;
      }
    });
    if (!out.some(function (p) { return p.id === 'plain'; })) out.push(plain);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 3. Hooks: discards
   * ------------------------------------------------------------------ */

  var FAMILY = {
    triplets: ['triplets', 'concealed-triplets', 'pairs'],
    'all-triplets': ['triplets', 'concealed-triplets', 'pairs'],
    pairs: ['pairs'],
    sequences: ['straights'],
  };

  function leading(t, cand) {
    var best = cand.analysis && cand.analysis.best;
    var id = best && best.plan && best.plan.id;
    if (!id) return false;
    if (t.id === 'half' || t.id === 'triplets') { if (id === 'half-' + t.suit) return true; }
    return (FAMILY[t.id] || []).indexOf(id) !== -1;
  }

  // Targets built on pairs and pungs: they keep every pair and pung.
  var SET_TARGETS = ['triplets', 'all-triplets', 'terminals', 'honors', 'winds', 'dragons'];

  // Lower goes first, after the shared one-suit rules (MahjongBot's group
  // 0): -1 off-target tiles for a hard target, 1 off-target for a softer
  // target and tiles someone punged, 2 ordinary tiles, 3 pairs, 4-6 live
  // honors and sets the target keeps. Unlikely to win late, the order only
  // breaks ties (safety decides).
  function priority(game, ctx, counts, cand, bestShanten) {
    if (!knobs().ownDiscards) return null;
    var i = cand.index;
    var t = ctx.target || { id: 'standard' };
    var def = TARGET_BY_ID[t.id];
    var givingUp = ctx.wallLeft < knobs().giveUpWall && bestShanten >= 2;
    var pair = counts[i] === 2;
    if (givingUp) return pair ? 3 : 2;
    // A softer target sets the order only while its plan is the one ahead;
    // otherwise the hand has pivoted, and the shared order applies.
    if (!def.hard && !leading(t, cand)) return null;
    var keep = keepFor(t);
    // Concealed Straights may keep one honor pair as its pair (MahjongBot's
    // shared rule picks which).
    var eyes = t.id === 'sequences' && i === B.keptHonorPair(counts, ctx);
    if (t.id === 'sequences' && !eyes && B.holdsDragon(game, i, cand.shanten)) return 4;
    // Off-target singles go at 1. A pair sits just behind them (1.25): it is
    // still an eye, and a pung if the hand pivots to All Triplets, so it
    // waits until those singles are gone. A hard target has no use for it,
    // and a chow of another suit has already closed All Triplets.
    if (keep && !keep(i) && !eyes) {
      if (pair && i < 27 && !def.hard && !B.chowOfAnotherSuit(ctx, i)) return 1.25;
      return def.hard ? -1 : 1;
    }
    // A hand of pairs or sets can't use a single with no copy left to draw or
    // claim: it can never be a pair or a pung, so it goes before the other
    // singles (Thirteen Orphans needs only one of each, and keeps it). An
    // honor single like that goes on any hand: it can't make a run either.
    var dead = counts[i] === 1 && ctx.unseen[i] === 0;
    var setsHand = SET_TARGETS.indexOf(t.id) !== -1 || t.id === 'pairs';
    // (1, not a half step: MahjongBot reads x.5 as a tile to keep.)
    if (dead && t.id !== 'orphans' && (setsHand || i >= 27)) return 1;
    // A pair with no copy left can still be the eyes, but never a pung.
    if (pair && ctx.unseen[i] === 0 && SET_TARGETS.indexOf(t.id) !== -1) return 3;
    if (t.id === 'gates' && !B.gatesTileNeeded(counts, t.start, i)) return 1;
    if (B.isPungTile(game, i) && counts[i] < 2 && cand.shanten <= bestShanten) return 1;
    // Seven Pairs keeps pairs and lets a third copy go.
    if (t.id === 'pairs') return pair ? 6 : 2;
    // Hands of sets keep every pair and pung, the pung longest.
    if (SET_TARGETS.indexOf(t.id) !== -1 && counts[i] >= 2) return counts[i] >= 3 ? 6 : 5;
    // Concealed Triplets sticks to one suit and honors where it can: a
    // single of another suit goes first.
    if (t.id === 'triplets' && i < 27 && suitOf(i) !== t.suit) return 1;
    if (i >= 27 && t.id !== 'sequences') {
      var shown = B.revealedCopies(game, i);
      var value = B.valueWeight(ctx, i) > 0;
      if (shown < 2 && (ctx.wallLeft > EARLY_WALL || value)) {
        if (pair) return value ? 5 : 4;
        return value ? 4 : 3;
      }
    }
    return pair ? 3 : 2;
  }

  /* ------------------------------------------------------------------ *
   * 4. Hooks: extra ways to reach 3 faan on a ready hand
   * ------------------------------------------------------------------ */

  // A wait one faan short by self-draw can still be won late on the last
  // tile, or off a kong's replacement tile. Count a little of that.
  function readyValue(value, waits, c, ctx) {
    var min = ctx.game.settings.minFaan;
    var kongable = false;
    for (var i = 0; i < 34; i++) if (c[i] === 4 || (c[i] === 3 && ctx.unseen[i] > 0)) kongable = true;
    ctx.melds.forEach(function (m) {
      if (m.type === 'pung' && ctx.unseen[E.tileIndex(m.tiles[0])] > 0) kongable = true;
    });
    var pLast = ctx.wallLeft <= 8 ? 0.25 : ctx.wallLeft <= 16 ? 0.08 : 0;
    var pKong = kongable ? 0.12 : 0;
    if (!pLast && !pKong) return value;
    var extra = 0;
    waits.forEach(function (w) {
      if (w.left && !w.tsumoOk && w.tsumoFaan === min - 1) {
        extra += (w.left / ctx.unseenTotal) * Math.min(ctx.drawsLeft, 6) * (pLast + pKong) * 3 * 0.7;
      }
    });
    return value + extra;
  }

  /* ------------------------------------------------------------------ *
   * 1b. Locking onto a big hand
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

  var ORPHAN_HAND = {
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
    ORPHAN_HAND,
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
    return handById(ctx.game.hand.seats[ctx.seat].bigHandLock);
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
    if (!lock && (ctx.turn < LOCK_TURNS || seat.bigHandLock === undefined)) lock = pickLock(c, ctx);
    seat.bigHandLock = lock ? lock.id : null;
    return lock;
  }

  /* ------------------------------------------------------------------ *
   * 5. Hooks: reading opponents and not feeding them
   * ------------------------------------------------------------------ */

  // What each opponent's discards say about the hand they're on.
  function threats(list, game) {
    if (!knobs().reads) return;
    list.forEach(function (t) {
      var s = game.hand.seats[t.seat];
      var tiles = s.discards.map(function (d) { return E.tileIndex(d.tile); });
      var n = tiles.length;
      var by = { c: 0, d: 0, b: 0, z: 0 };
      tiles.forEach(function (i) { by[suitOf(i)]++; });
      var read = { flush: null, honors: false, sequences: false };
      // A suit they keep while throwing the other two is the one they want.
      if (n >= 6) {
        SUITS.forEach(function (su) {
          var others = SUITS.filter(function (x) { return x !== su; });
          if (by[su] <= Math.floor(n * 0.1) && others.every(function (x) { return by[x] >= 2; })) read.flush = su;
        });
      }
      // No honors thrown in seven turns: they're keeping them.
      if (n >= 7 && by.z === 0) read.honors = true;
      // Honors and terminals thrown first: a hand of runs in the middle tiles.
      var opening = tiles.slice(0, 5);
      if (opening.length >= 4 && opening.every(function (i) { return E.isTerminalOrHonorIndex(i); })) read.sequences = true;
      t.read = read;
      if (!t.flush && read.flush && t.melds >= 1) t.flush = read.flush;
    });
  }

  function waitChance(chance, game, threat, i) {
    var read = threat.read;
    if (!read) return chance;
    if (read.flush && !threat.flush) {
      var su = suitOf(i);
      chance *= su === read.flush ? 1.8 : su === 'z' ? 1.1 : 0.6;
    }
    if (read.honors && i >= 27 && threat.unseen[i] >= 2) chance *= 1.6;
    if (read.sequences) {
      if (i >= 27) chance *= 0.6;
      else if (i % 9 >= 2 && i % 9 <= 6) chance *= 1.3;
    }
    return chance;
  }

  // Feeding a claim, beyond dealing in: a tile the next player can chow, and
  // a fresh dragon or scoring wind someone may pung. Worth more late.
  function extraLoss(game, list, i) {
    var seats = list.map(function (t) { return t.seat; });
    var me = [0, 1, 2, 3].filter(function (s) { return seats.indexOf(s) === -1; })[0];
    var next = list.filter(function (t) { return t.seat === (me + 1) % 4; })[0];
    var late = game.hand.wall.length < knobs().giveUpWall;
    var feed = 0;
    if (i < 27 && next) {
      var su = suitOf(i);
      var r = i % 9;
      var near = 0;
      [-2, -1, 1, 2].forEach(function (d) {
        if (r + d < 0 || r + d > 8) return;
        if (next.discarded[E.tileId(i + d)]) near++;
      });
      var wants = (next.chows[su] ? 2 : 1) * (next.read && next.read.flush === su ? 2 : 1) * (near ? 0.5 : 1);
      if (!(next.read && next.read.flush && next.read.flush !== su)) feed += 0.002 * wants;
    }
    if (i >= 27 && B.revealedCopies(game, i) === 0) {
      var scoring = DRAGONS.indexOf(i) !== -1 || i === 26 + game.round ||
        list.some(function (t) { return t.windIndex === i; });
      feed += scoring ? 0.006 : 0.003;
    }
    return feed * knobs().feed * (late ? 1 : 0.3);
  }

  // No defense, until the hand is slow: late, and still 2 or more from ready,
  // with no big hand locked. Then it stops building and plays safe.
  function defense(w, ctx, list, shanten) {
    if (ctx.lock) return 0;
    if (ctx.wallLeft < knobs().giveUpWall && shanten >= 2) return w * knobs().giveUpDefense;
    return 0;
  }

  /* ------------------------------------------------------------------ *
   * 6. Hooks: attack, claims, with defense only when slow
   * ------------------------------------------------------------------ */

  function lockHand(ctx, counts) {
    ctx.lock = updateLock(counts, ctx);
    // Faster-looking hands don't pull it off a lock or its own read.
    ctx.lockedSpecial = ctx.lock ? { kind: ctx.lock.id } : null;
    ctx.planFixed = !!ctx.lock;
  }

  // (A claim's choice is weighed from the 13 tiles, without hand() first.)
  function withLock(basePlans) {
    return function (c, ctx) {
      var lock = ctx.lock !== undefined ? ctx.lock : savedLock(ctx);
      if (lock) {
        var own = lock.plans(c, ctx).filter(function (p) {
          return p.faan >= LOCK_FAAN && p.shantenFn(p.counts, ctx.declared) !== Infinity;
        });
        if (own.length) return own;
      }
      return basePlans(c, ctx);
    };
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
    // A lone dragon nobody has shown outlasts even the hand's own tiles.
    if (B.loneDragon(ctx.game, c, i) && !winsNow(x)) return 5;
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
    if (B.loneDragon(ctx.game, c, i)) return 8;
    var straights = ctx.leadPlan && ctx.leadPlan.id === 'straights';
    var eyes = straights ? B.keptHonorPair(c, ctx) : null;
    // The pair is already kept, so every other honor goes before a number
    // tile. A finished straight waits behind a loose tile.
    if (straights && eyes !== null && i >= 27 && i !== eyes) return 2;
    if (!isHonor(i)) {
      var rank = x.shanten <= bestSteps ? 2 : 4;
      if (straights && eyes !== null) rank += 1;
      if (straights && B.breaksFinishedStraight(c, i)) rank += 2;
      return rank;
    }
    if (c[i] >= 3) return 7;
    if (c[i] === 2) return 6;
    return 3;
  }

  // Lone honors with fewer copies left go first. Between honors with as many
  // left, the shared order (MahjongBot.honorKeepRank): winds worth nothing,
  // then your 1-faan winds, then dragons, and a 2-faan wind last.
  function honorOrder(a, b, ctx) {
    if (a.index < 27 || b.index < 27) return 0;
    return ctx.unseen[a.index] - ctx.unseen[b.index] ||
      B.honorKeepRank(ctx, a.index) - B.honorKeepRank(ctx, b.index);
  }

  function bigFinalOrder(out, ctx, c) {
    // Folding, safety decides.
    if (ctx.folding || !knobs().ownDiscards) return out;
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

  // Early game (more than EARLY_WALL tiles left) it stays concealed, unless a
  // claim leaves the hand within two tiles of ready (CLAIM_READY_STEPS) and
  // able to score, to win quickly: then a pung or kong first, and a chow only
  // once the player before it has a read (MahjongBot.leftRead: the suit they
  // keep or the one they feed), and only a chow the shared rules allow. Later
  // in the hand, the shared claims decide (null).
  var CLAIM_READY_STEPS = 2;
  function earlyClaim(res, ctx, game) {
    if (ctx.wallLeft <= EARLY_WALL || savedLock(ctx)) return null;
    var min = game.settings.minFaan;
    var quick = function (o) {
      var an = o.analysis;
      if (!an || an.shanten > CLAIM_READY_STEPS || an.shanten >= res.stay.shanten) return false;
      var p = an.best && an.best.plan;
      return an.shanten === 0 || !!(p && p.faan >= min);
    };
    var best = function (list) { return list.sort(function (a, b) { return b.score - a.score; })[0]; };
    var sets = res.options.filter(function (o) { return (o.decision.type === 'pung' || o.decision.type === 'kong') && quick(o); });
    if (sets.length) return best(sets).decision;
    // A chow of a suit the player before it feeds, or tosses after a chow of
    // their own (they need only their suit): more of it will come.
    var read = ctx.leftRead;
    var known = !!(read && (read.feeds || read.keeps || (read.tosses && read.tosses.length)));
    var chows = known ? res.options.filter(function (o) {
      return o.decision.type === 'chow' && quick(o) && B.chowAllowed(o, res, game, ctx);
    }) : [];
    if (chows.length) return best(chows).decision;
    return { type: 'pass' };
  }

  // Takes any claim that moves the hand closer and can still score. On a lock,
  // only a claim of that hand's tiles that moves it closer.
  function bigClaim(res, ctx, game, seat, opts) {
    // A dragon or a scoring wind (seat or round) is always punged, early or
    // late and whatever the hand, unless it is going for Thirteen Orphans.
    var ti = E.tileIndex(opts.tile);
    var orphans = (ctx.target && ctx.target.id === 'orphans') || (savedLock(ctx) && savedLock(ctx).id === 'orphans');
    if ((opts.pung || opts.kong) && ti >= 27 && B.valueWeight(ctx, ti) > 0 && !orphans) {
      return { type: opts.pung ? 'pung' : 'kong' };
    }
    var own = knobs().ownClaims;
    // The early-game rule is the default claims' (ownClaims off or 'lock').
    var early = own === true ? null : earlyClaim(res, ctx, game);
    if (early) return early;
    if (!own) return null;
    var lock = savedLock(ctx);
    // 'lock': its own claims only while locked onto a big hand; the shared ones otherwise.
    if (own === 'lock' && !lock) return null;
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

  function bigKongOk(kong, ctx) {
    return !ctx.lock || (ctx.lock.fits(E.tileIndex(kong.tile)) && ctx.lock.id !== 'orphans');
  }


  /* ------------------------------------------------------------------ *
   * 7. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'jorge-yau',
    hooks: {
      context: context,
      hand: lockHand,
      plans: withLock(plans),
      priority: priority,
      readyValue: readyValue,
      threats: threats,
      waitChance: waitChance,
      extraLoss: extraLoss,
      defense: defense,
      finalOrder: bigFinalOrder,
      claim: bigClaim,
      kongOk: bigKongOk,
    },
    tuning: TUNING,
  });
  K0 = bot.tuning;
  // Its target holds until it's dead or a stronger one appears, so the plans
  // it lists are the only ones to weigh.
  K0.ownPlans = true;
  bot.classify = classify;
  bot.TARGETS = TARGETS;
  bot.targetFor = function (game, seat) { return bot.buildContext(game, seat).target; };

  if (node) module.exports = bot;
  else root.MahjongJorgeYau = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
