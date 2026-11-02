/* The "lucky-cat" bot strategy.

   It plays the shared foundation in js/mahjong-bot.js (shanten, live
   tiles, exact scoring of ready hands, the threat model, and the one-suit
   rules every bot follows), but picks its hand differently and plays it
   differently:
     - Target. From the opening hand it picks one hand to aim for, in a fixed
       order (TARGETS below): Thirteen Orphans, Nine Gates, Four Winds, All
       Terminals, honors, Seven Pairs, Full Flush, All Triplets, Half Flush,
       Concealed Straights. Each turn the current hand is read again; a
       stronger target replaces it, and a target that can no longer be made
       gives way. The target's plans are preferred (K.targetWeight), so the
       hand only pivots when a backup is clearly better.
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
   The playbook is written out in docs/strategies/lucky-cat.md. */

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

  var EARLY_WALL = 60;

  // Lucky Cat's knobs, kept with the strategy's tuning (bot.setTuning) so
  // the competition can compare settings.
  //   targetWeight: how strongly the target's plans are preferred
  //   giveUpWall: under this many tiles left, 2+ from ready, stop building
  //   giveUpDefense: how much more safety weighs then
  //   feed: weight on feeding claims (chow tiles, fresh honors)
  //   reads: read opponents' hands from their discards
  //   skip: target ids to leave out of the read (to measure each one)
  //   ownClaims, ownDiscards: false uses jorge-yau's claims or discard order
  var TUNING = { targetWeight: 1.5, giveUpWall: 40, giveUpDefense: 1.6, feed: 1, reads: true, skip: [], ownClaims: true, ownDiscards: true };
  var K = TUNING; // replaced by the strategy's own copy below

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

  function topSuit(by) {
    return SUITS.slice().sort(function (a, b) { return by[b] - by[a]; })[0];
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
      id: 'winds', name: 'Big or Small Four Winds', hard: true,
      fits: function (r) { return r.winds >= 8; },
      // Small Four Winds has room for one set that isn't a wind.
      dead: function (r) { return r.ctx.melds.filter(function (m) { return !isHonor(E.tileIndex(m.tiles[0])); }).length > 1; },
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
      c: c, ctx: ctx, all: all, by: by, top: topSuit(by), pairs: pairs, sets: sets, gates: gates,
      orphanKinds: ORPHANS.filter(function (k) { return all[k] > 0; }).length,
      winds: sum(all, WINDS),
      terminals: sum(all, TERMINALS),
      honors: sum(all, WINDS.concat(DRAGONS)),
    };
  }

  function classify(c, ctx) {
    var r = readHand(c, ctx);
    for (var k = 0; k < TARGETS.length; k++) {
      var t = TARGETS[k];
      if (K.skip.indexOf(t.id) !== -1 || !t.fits(r)) continue;
      var out = { id: t.id, rank: t.rank, name: t.name };
      if (t.id === 'gates') { out.suit = r.gates.suit; out.start = r.gates.start; }
      if (t.id === 'full' || t.id === 'half' || t.id === 'triplets') out.suit = r.top;
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
    if (!held || heldDef.dead(r, held) || now.rank < held.rank) opening.target = now;
    return opening.target;
  }

  // A seat or round wind (set or live pair), or a seat flower or season, is
  // faan already in hand: play for speed.
  function hasQuickFaan(game, seat, c, ctx) {
    var mine = 26 + ctx.seatWind, round = 26 + ctx.round;
    var all = allCounts(c, ctx);
    var wind = [mine, round].some(function (i) {
      return all[i] >= 3 || (all[i] === 2 && ctx.unseen[i] >= 1);
    });
    var flower = ctx.flowers.some(function (f) { return f === 'f' + ctx.seatWind || f === 's' + ctx.seatWind; });
    return wind || flower;
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

  function windsPlan(c, ctx, base, weight) {
    var sets = 0;
    WINDS.forEach(function (i) { if (c[i] >= 2) sets++; });
    ctx.melds.forEach(function (m) { if (WINDS.indexOf(E.tileIndex(m.tiles[0])) !== -1) sets++; });
    var big = sets >= 4;
    return plan({
      id: 'winds', label: big ? 'Big Four Winds' : 'Small Four Winds',
      counts: honorsOnly(c), shantenFn: E.standardShanten,
      faan: big ? LIMIT : Math.min(LIMIT, base + F.smallWinds + B.handYaku(ctx, honorsOnly(c))),
      open: true, weight: weight,
    });
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
  // plain hand, weighed lightly, so the hand can always be finished.
  function plans(c, ctx) {
    var t = ctx.target || { id: 'standard' };
    // After a chow only that suit's flush is left: the usual plans already say so.
    if (B.chowCommitment(ctx)) return B.basePlans(c, ctx);
    var def = TARGET_BY_ID[t.id];
    var W = ctx.fast && !def.hard ? 1 : K.targetWeight;
    var base = B.baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var plain = plan({ id: 'plain', label: 'a standard hand', counts: c, shantenFn: E.standardShanten, faan: base + B.handYaku(ctx, c), open: true, weight: 0.6 });
    var out;
    var su = t.suit;
    switch (t.id) {
      case 'orphans':
        out = [B.makeSpecialPlan('orphans', c, ctx), terminalsPlan(c, ctx, base, 0.8)];
        // Seven Pairs of terminals and honors: Mixed Orphans on top of the pairs.
        if (!ctx.declared) {
          var op = B.makeSpecialPlan('pairs', B.restrict(c, isOrphan), ctx);
          op.faan += F.mixedOrphans;
          op.label = 'Seven Pairs';
          op.weight = W * 0.8;
          out.push(op);
        }
        out[0].weight = W;
        break;
      case 'gates':
        out = [B.makeSpecialPlan('gates', c, ctx, { suit: su, start: t.start })].concat(flushPlans(c, ctx, su, base, 0.8, W));
        out[0].weight = W;
        break;
      case 'winds':
        out = [windsPlan(c, ctx, base, W), honorsPlan(c, ctx, base, W * 0.9)];
        break;
      case 'terminals':
        out = [terminalsPlan(c, ctx, base, W)].concat(tripletsPlans(c, ctx, base, 0.8));
        break;
      case 'honors':
        out = [honorsPlan(c, ctx, base, W)].concat(tripletsPlans(c, ctx, base, W * 0.9));
        SUITS.forEach(function (s) { out = out.concat(flushPlans(c, ctx, s, base, 1, 0.6).slice(0, 1)); });
        break;
      case 'pairs': {
        out = [];
        if (!ctx.declared && !B.concealedShape(c).hasSet) {
          var pp = B.makeSpecialPlan('pairs', c, ctx);
          pp.weight = W;
          out.push(pp);
        }
        out = out.concat(tripletsPlans(c, ctx, base, 1));
        break;
      }
      case 'full':
        out = flushPlans(c, ctx, su, base, W * 0.9, W);
        break;
      case 'half':
        out = flushPlans(c, ctx, su, base, W, 1).concat(tripletsPlans(c, ctx, base, 0.8));
        break;
      case 'triplets': {
        // Concealed Triplets first, then All Triplets or Seven Pairs, and all
        // of them better in one suit with honors.
        out = weigh(tripletsPlans(c, ctx, base, W * 0.9), function (p) { return p.id === 'concealed-triplets'; }, W);
        var inHalf = function (j) { return suitOf(j) === su || j >= 27; };
        if (!ctx.hasChow && !hasSuitedMeld(ctx, su)) {
          var kept = B.restrict(c, inHalf);
          out.push(plan({
            id: 'triplets', label: 'All Triplets', counts: kept, shantenFn: E.tripletsShanten,
            faan: base + F.allTriplets + F.halfFlush + B.handYaku(ctx, kept), open: true, weight: W,
          }));
        }
        if (!ctx.declared) {
          var sp = B.makeSpecialPlan('pairs', c, ctx);
          sp.weight = W * 0.9;
          out.push(sp);
        }
        out = out.concat(flushPlans(c, ctx, su, base, 1, 0.8));
        break;
      }
      case 'sequences':
        out = weigh(B.basePlans(c, ctx), function (p) { return p.id === 'straights'; }, W);
        break;
      default:
        out = B.basePlans(c, ctx);
        if (B.chaseSevenPairs(c, ctx)) out.push(B.makeSpecialPlan('pairs', c, ctx));
    }
    var keep = keepFor(t), reason = reasonFor(t);
    out.forEach(function (p) {
      if (keep && !p.keep && (p.id === t.id || p.id === t.id + '-' + su || (t.id === 'sequences' && p.id === 'straights'))) {
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

  // Lower goes first, after the shared one-suit rules (MahjongBot's group
  // 0): -1 off-target tiles for a hard target, 1 off-target for a softer
  // target and tiles someone punged, 2 ordinary tiles, 3 pairs, 4-6 live
  // honors and sets the target keeps. Unlikely to win late, the order only
  // breaks ties (safety decides).
  function priority(game, ctx, counts, cand, bestShanten) {
    if (!K.ownDiscards) return null;
    var i = cand.index;
    var t = ctx.target || { id: 'standard' };
    var def = TARGET_BY_ID[t.id];
    var givingUp = ctx.wallLeft < K.giveUpWall && bestShanten >= 2;
    var pair = counts[i] === 2;
    if (givingUp) return pair ? 3 : 2;
    // A softer target sets the order only while its plan is the one ahead;
    // otherwise the hand has pivoted, and the shared order applies.
    if (!def.hard && !leading(t, cand)) return null;
    var keep = keepFor(t);
    // Concealed Straights may keep one honor pair as its pair (MahjongBot's
    // shared rule picks which).
    var eyes = t.id === 'sequences' && i === B.keptHonorPair(counts, ctx);
    if (keep && !keep(i) && !eyes) return def.hard ? -1 : 1;
    if (t.id === 'gates' && !B.gatesTileNeeded(counts, t.start, i)) return 1;
    if (B.isPungTile(game, i) && counts[i] < 2 && cand.shanten <= bestShanten) return 1;
    // Seven Pairs keeps pairs and lets a third copy go.
    if (t.id === 'pairs') return pair ? 6 : 2;
    // Hands of sets keep every pair and pung, the pung longest.
    if (['triplets', 'terminals', 'honors', 'winds'].indexOf(t.id) !== -1 && counts[i] >= 2) return counts[i] >= 3 ? 6 : 5;
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
   * 5. Hooks: reading opponents and not feeding them
   * ------------------------------------------------------------------ */

  // What each opponent's discards say about the hand they're on.
  function threats(list, game) {
    if (!K.reads) return;
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
    var late = game.hand.wall.length < K.giveUpWall;
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
    return feed * K.feed * (late ? 1 : 0.3);
  }

  // Late, and still 2 or more from ready: stop building and play safe.
  function defense(w, ctx, list, shanten) {
    if (ctx.wallLeft < K.giveUpWall && shanten >= 2) w *= K.giveUpDefense;
    else if (ctx.wallLeft < 20 && shanten >= 1) w *= 1.3;
    return w;
  }

  /* ------------------------------------------------------------------ *
   * 6. Hooks: claims
   * ------------------------------------------------------------------ */

  var CONCEALED_ONLY = ['orphans', 'gates', 'pairs', 'sequences'];

  function suitHeld(ctx, c, su) {
    var n = 0;
    for (var i = 0; i < 27; i++) if (suitOf(i) === su) n += c[i];
    ctx.melds.forEach(function (m) { if (suitOf(E.tileIndex(m.tiles[0])) === su) n += 3; });
    return n;
  }

  function chowOk(o, res, ctx, game, c, tileSuit) {
    if (!B.chowAllowed(o, res, game)) return false;
    var after = o.analysis.shanten;
    if (after === 0) return true;
    var t = ctx.target || {};
    // Never chow into a suit the hand barely holds.
    var held = suitHeld(ctx, c, tileSuit) + 1;
    if (held < 5) return false;
    var flushHere = (t.id === 'full' || t.id === 'half') && t.suit === tileSuit;
    if (flushHere && after <= 2) return true;
    if (ctx.fast && after <= 2) return true;
    var late = ctx.wallLeft < 48 || ctx.turn >= 9;
    return late && after <= 1;
  }

  function claim(res, ctx, game, seat, opts) {
    if (!K.ownClaims) return null;
    var pass = { type: 'pass' };
    if (!res.options.length) return pass;
    var t = ctx.target || { id: 'standard' };
    var c = E.countsOf(game.hand.seats[seat].hand);
    var ti = E.tileIndex(opts.tile);
    var givingUp = ctx.wallLeft < K.giveUpWall && res.stay.shanten >= 2;
    if (CONCEALED_ONLY.indexOf(t.id) !== -1 && !givingUp) {
      // Concealed hands claim nothing, except a scoring honor for the
      // sequences hand once it's slow.
      if (!(t.id === 'sequences' && ti >= 27 && B.valueWeight(ctx, ti) && res.stay.shanten >= 3)) return pass;
    }
    // A dragon or a scoring wind is faan in hand; a hand of honors takes any honor.
    var honorHand = t.id === 'winds' || t.id === 'honors' || t.id === 'terminals';
    if (ti >= 27 && (opts.pung || opts.kong) && (B.valueWeight(ctx, ti) || honorHand)) {
      var take = opts.kong ? 'kong' : 'pung';
      var after = res.options.filter(function (o) { return o.decision.type === take; })[0];
      var breaksReady = res.stay.shanten === 0 && after && after.analysis && after.analysis.shanten > 0 && after.score < res.passScore;
      if (!breaksReady) return { type: take };
    }
    var tileSuit = suitOf(ti);
    var options = res.options.filter(function (o) {
      if (o.decision.type !== 'chow') return true;
      return chowOk(o, res, ctx, game, c, tileSuit);
    });
    var top = options[0];
    if (!top) return pass;
    var bar = top.decision.type === 'chow' ? 1.15 : 1.0;
    if (top.score > res.passScore * bar + 0.005) return top.decision;
    return pass;
  }

  /* ------------------------------------------------------------------ *
   * 7. The strategy
   * ------------------------------------------------------------------ */

  var bot = B.createStrategy({
    id: 'lucky-cat',
    hooks: {
      context: context,
      plans: plans,
      priority: priority,
      readyValue: readyValue,
      threats: threats,
      waitChance: waitChance,
      extraLoss: extraLoss,
      defense: defense,
      claim: claim,
    },
    tuning: TUNING,
  });
  K = bot.tuning;
  bot.classify = classify;
  bot.TARGETS = TARGETS;
  bot.targetFor = function (game, seat) { return bot.buildContext(game, seat).target; };

  if (node) module.exports = bot;
  else root.MahjongLuckyCat = bot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
