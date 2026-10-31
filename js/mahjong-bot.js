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
   The human player's hint tips come from js/mahjong-coach.js. */

(function (root) {
  'use strict';

  var E = (typeof module !== 'undefined' && module.exports)
    ? require('./mahjong-engine.js')
    : root.MahjongEngine;

  var DRAGONS = [31, 32, 33];
  var SUIT_LABELS = { c: 'Characters', d: 'Circles', b: 'Bamboos' };
  var ESTIMATE_FAAN_CAP = 10;
  var VALUE_SLOPE = 0.6; // value of each faan above the minimum
  // Seven Pairs is only worth steering toward from 6 pairs; earlier it
  // tested weaker than building a standard hand.
  var SEVEN_PAIRS_MIN = 6;

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
   *    Values are in "3-faan wins": a minimum hand won off a discard is 1.
   *    The scale is compressed (a 7-faan hand is worth ~2.6, not 16) because
   *    the chance estimates are rough, and chasing big hands on rough odds
   *    loses to simply finishing fast.
   * ------------------------------------------------------------------ */

  function handValue(f) {
    if (f < 3) return Math.pow(0.45, 3 - f);
    return 1 + VALUE_SLOPE * (Math.min(f, ESTIMATE_FAAN_CAP) - 3);
  }

  /* ------------------------------------------------------------------ *
   * 3. Plans and faan estimates
   * ------------------------------------------------------------------ */

  function baseFaan(ctx) {
    var f = 0;
    if (!ctx.flowers.length) f += 1;
    ctx.flowers.forEach(function (id) {
      var n = parseInt(id.charAt(1), 10);
      if (n === ctx.seatWind) f += 1;
    });
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

  // Candidate plans for a 13-tile (waiting to draw) concealed portion.
  function plansFor(c, ctx) {
    var base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
    var yaku = handYaku(ctx, c);
    var plans = [];
    var honorsInHand = countWhere(c, function (i) { return i >= 27; });

    var plain = { id: 'plain', label: 'a standard hand', counts: c, shantenFn: E.standardShanten, faan: base + yaku, open: true };
    if (!honorsInHand && !ctx.melds.some(function (m) { return m.type !== 'chow'; })) plain.faan += 0.5;
    plans.push(plain);

    ['c', 'd', 'b'].forEach(function (su) {
      var offSuit = Object.keys(ctx.meldSuits).some(function (k) { return k !== su && k !== 'z'; });
      if (offSuit) return;
      var inHalf = function (i) { return E.suitOfIndex(i) === su || i >= 27; };
      var inFull = function (i) { return E.suitOfIndex(i) === su; };
      if (countWhere(c, inHalf) >= 7) {
        plans.push({
          id: 'half-' + su, suit: su, label: 'a Half Flush in ' + SUIT_LABELS[su],
          counts: restrict(c, inHalf), shantenFn: E.standardShanten,
          faan: base + 3 + handYaku(ctx, restrict(c, inHalf)), open: true,
        });
      }
      if (!ctx.meldSuits.z && countWhere(c, inFull) >= 7) {
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

    if (!ctx.declared) {
      var pairs = 0, kinds = 0;
      for (var j = 0; j < 34; j++) { if (c[j] >= 2) pairs++; if (c[j]) kinds++; }
      if (pairs >= SEVEN_PAIRS_MIN) {
        plans.push({ id: 'pairs', label: 'Seven Pairs', counts: c, shantenFn: E.sevenPairsShanten, faan: base - 1 + 4, open: false });
      }
      var orphanKinds = 0;
      [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33].forEach(function (k) { if (c[k]) orphanKinds++; });
      if (orphanKinds >= 9) {
        plans.push({ id: 'orphans', label: 'Thirteen Orphans', counts: c, shantenFn: E.orphansShanten, faan: 13, open: false });
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
      var pr = fr >= min ? handValue(fr) : 0;
      var pt = ft >= min ? handValue(ft) : 0;
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
    return { value: value, waits: details, live: tsumo + ron / 1.5 };
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
      var util = handValue(p.faan + SELF_DRAW_CHANCE) * 1.8 * chance;
      var entry = { plan: p, shanten: s, ukeire: u.total, ukeireTiles: u.tiles, util: util };
      if (!best || util > best.util) best = entry;
    });
    var ready = null;
    if (shantenAll === 0) {
      ready = readyValue(c, ctx);
      if (ready && (!best || ready.value >= best.util)) {
        best = { plan: best ? best.plan : null, shanten: 0, ukeire: ready.live, util: ready.value, readyBest: true };
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

  function opponentThreats(game, seat) {
    var out = [];
    var unseenMe = E.unseenCounts(game, seat);
    for (var o = 0; o < 4; o++) {
      if (o === seat) continue;
      var s = game.hand.seats[o];
      var k = s.melds.length;
      var n = s.discards.length;
      var p = [0.02, 0.1, 0.28, 0.55, 0.9][Math.min(k, 4)] + Math.min(0.25, n * 0.008);

      // Flush reading from melds and from which suits never get discarded.
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
      if (flush && k >= 2) p += 0.12;
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
      var discarded = {};
      s.discards.forEach(function (d) { discarded[d.tile] = true; });
      out.push({
        seat: o,
        name: game.players[o].name,
        ready: p,
        flush: flush,
        payment: handValue(Math.max(3, f)),
        discarded: discarded,
        windIndex: 26 + wind,
        unseen: unseenMe,
      });
    }
    return out;
  }

  // Probability that `threat`'s ready hand waits on tile index i.
  function waitChance(game, threat, i) {
    var unseen = threat.unseen;
    var chance;
    if (i >= 27) {
      chance = [0, 0.015, 0.035, 0.045, 0.045][unseen[i]] || 0;
      if (unseen[i] >= 2 && (DRAGONS.indexOf(i) !== -1 || i === threat.windIndex || i === 26 + game.round)) chance *= 1.3;
    } else {
      var r = i % 9;
      var seq = 0;
      var avail = function (d) {
        var j = r + d;
        if (j < 0 || j > 8) return 0;
        return unseen[i + d] / 4;
      };
      if (r <= 6) seq += Math.min(avail(1), avail(2)) * (r <= 5 && r >= 1 ? 1 : 0.6);
      if (r >= 2) seq += Math.min(avail(-1), avail(-2)) * (r >= 3 && r <= 7 ? 1 : 0.6);
      if (r >= 1 && r <= 7) seq += Math.min(avail(-1), avail(1)) * 0.6;
      chance = seq * 0.025 + (unseen[i] / 3) * 0.018;
    }
    if (threat.discarded[E.tileId(i)]) chance *= 0.3;
    if (threat.flush) {
      var su = E.suitOfIndex(i);
      if (su === threat.flush) chance *= 2.5;
      else if (su === 'z') chance *= 1.3;
      else chance *= 0.15;
    }
    return Math.min(chance, 0.6);
  }

  function dealInLoss(game, threats, i) {
    var loss = 0;
    threats.forEach(function (t) {
      loss += t.ready * waitChance(game, t, i) * t.payment;
    });
    return loss;
  }

  /* ------------------------------------------------------------------ *
   * 7. Discard analysis (14 tiles in hand)
   * ------------------------------------------------------------------ */

  function analyzeDiscards(game, seat, ctxOverride, handOverride) {
    var ctx = ctxOverride || buildContext(game, seat);
    var hand = handOverride || game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
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
        score: u.util - loss,
        shanten: u.shanten,
        analysis: u,
      });
    }
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return E.isTerminalOrHonorIndex(b.index) - E.isTerminalOrHonorIndex(a.index);
    });
    return { ctx: ctx, candidates: out, threats: threats };
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

  function chooseClaim(game, seat, opts) {
    if (opts.win) return { type: 'win' };
    if (!opts.pung && !opts.kong && !opts.chows.length) return { type: 'pass' };
    var res = claimCandidates(game, seat, opts);
    var top = res.options[0];
    if (top && top.score > res.passScore * 1.04 + 0.01) return top.decision;
    return { type: 'pass' };
  }

  function createBotAgent(options) {
    options = options || {};
    return {
      turn: function (game, seat, opts) {
        return Promise.resolve(chooseTurnAction(game, seat, opts));
      },
      claim: function (game, seat, opts) {
        return Promise.resolve(chooseClaim(game, seat, opts));
      },
    };
  }

  var api = {
    buildContext: buildContext,
    handUtility: handUtility,
    plansFor: plansFor,
    readyValue: readyValue,
    opponentThreats: opponentThreats,
    waitChance: waitChance,
    analyzeDiscards: analyzeDiscards,
    chooseTurnAction: chooseTurnAction,
    chooseClaim: chooseClaim,
    claimCandidates: claimCandidates,
    createBotAgent: createBotAgent,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MahjongBot = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
