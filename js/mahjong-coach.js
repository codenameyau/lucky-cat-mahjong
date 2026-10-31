/* Hint coach for the Play game.

   Advice the way an experienced Hong Kong player thinks about a hand, in
   plain words:
     - First pick a route to the 3-faan minimum: Concealed All Sequences
       (runs only, no honors, no claims; the natural plan for a hand spread
       across suits), a Half or Full Flush, All Triplets, Seven Pairs, or a
       mixed hand built on dragon and wind sets. Routes that can't reach 3
       faan count for little, however fast they are.
     - Then discard what the route doesn't use. After that, lone tiles and
       end tiles go before pairs and connected shapes.
     - Honors: keep a lone honor while it can still become a set (dragons
       and your own or the round's wind most of all), and let it go once two
       copies are out.
     - Defense: when an opponent looks close, prefer tiles they've thrown.
     - Claims: always Pung a dragon or your own or the round's wind. Claim
       other tiles only when they fit a flush or All Triplets and the hand
       still reaches 3 faan; otherwise stay concealed.
   Reads only what the player could see. Uses the bot module for exact
   ready-hand scoring and for reading opponents. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  var SUITS = ['c', 'd', 'b'];
  var SUIT_NAME = { c: 'Characters', d: 'Circles', b: 'Bamboo' };
  var DRAGONS = [31, 32, 33];
  var COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four'];
  var STEP = 0.42; // each tile further from ready roughly multiplies the chance to win by this
  var COMPETITION = 0.7; // chance nobody else wins first, roughly (matches the bots)

  function name(i) { return E.tileName(E.tileId(i)); }
  function plural(i) { return name(i) + 's'; }

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

  /* ------------------------------------------------------------------ *
   * 1. What the player can see
   * ------------------------------------------------------------------ */

  function honorWorth(v, i) {
    var w = 0;
    if (DRAGONS.indexOf(i) !== -1) w++;
    if (i === 26 + v.seatWind) w++;
    if (i === 26 + v.round) w++;
    return w;
  }

  function meldFaanOf(v, melds) {
    var f = 0;
    melds.forEach(function (m) {
      if (m.type !== 'chow') f += honorWorth(v, E.tileIndex(m.tiles[0]));
    });
    return f;
  }

  function look(game, seat) {
    var s = game.hand.seats[seat];
    var ctx = B.buildContext(game, seat);
    // Copies out of play: thrown and not claimed, or in someone else's open meld.
    var dropped = [];
    for (var i = 0; i < 34; i++) dropped.push(0);
    game.hand.seats.forEach(function (o, k) {
      o.discards.forEach(function (d) { if (!d.claimed) dropped[E.tileIndex(d.tile)]++; });
      if (k === seat) return;
      o.melds.forEach(function (m) {
        if (!m.concealed) m.tiles.forEach(function (id) { dropped[E.tileIndex(id)]++; });
      });
    });
    var v = {
      game: game, seat: seat, ctx: ctx, dropped: dropped, unseen: ctx.unseen,
      seatWind: ctx.seatWind, round: ctx.round,
      declared: ctx.declared, concealed: ctx.concealed, hasChow: ctx.hasChow,
      meldSuits: ctx.meldSuits, melds: ctx.melds,
      drawsLeft: Math.max(1, ctx.wallLeft / 4), unseenTotal: ctx.unseenTotal,
    };
    // No flowers is 1 faan; otherwise your seat's flower and season are 1 each.
    v.flowerFaan = s.flowers.length
      ? s.flowers.filter(function (id) { return parseInt(id.charAt(1), 10) === v.seatWind; }).length
      : 1;
    v.meldFaan = meldFaanOf(v, ctx.melds);
    return v;
  }

  // The same view after claiming a meld.
  function withClaim(v, meld) {
    var next = {};
    Object.keys(v).forEach(function (k) { next[k] = v[k]; });
    var ctx = {};
    Object.keys(v.ctx).forEach(function (k) { ctx[k] = v.ctx[k]; });
    ctx.melds = v.melds.concat([meld]);
    ctx.declared = v.declared + 1;
    ctx.concealed = false;
    ctx.hasChow = v.hasChow || meld.type === 'chow';
    ctx.meldSuits = {};
    Object.keys(v.meldSuits).forEach(function (k) { ctx.meldSuits[k] = true; });
    ctx.meldSuits[E.suitOfIndex(E.tileIndex(meld.tiles[0]))] = true;
    next.ctx = ctx;
    next.melds = ctx.melds;
    next.declared = ctx.declared;
    next.concealed = false;
    next.hasChow = ctx.hasChow;
    next.meldSuits = ctx.meldSuits;
    next.meldFaan = meldFaanOf(v, ctx.melds);
    return next;
  }

  /* ------------------------------------------------------------------ *
   * 2. Routes to 3 faan (for a hand waiting to draw)
   * ------------------------------------------------------------------ */

  // Faan expected from dragon and wind tiles held: a set counts fully, a
  // pair that can still become a set half, and a live single a little.
  function honorFaan(v, c) {
    var f = 0;
    for (var i = 27; i < 34; i++) {
      var w = honorWorth(v, i);
      if (!w) continue;
      if (c[i] >= 3) f += w;
      else if (c[i] === 2 && v.unseen[i] >= 1) f += w * 0.5;
      else if (c[i] === 1 && v.unseen[i] >= 2) f += w * 0.15;
    }
    return f;
  }

  // Dragons and own/round winds held alone that can still pair up.
  function liveValueSingles(v, c) {
    var out = [];
    for (var i = 27; i < 34; i++) if (c[i] === 1 && honorWorth(v, i) && v.dropped[i] <= 1) out.push(i);
    return out;
  }

  function listNames(ids) {
    var names = ids.map(name);
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  }

  function routesFor(v, c) {
    var base = v.flowerFaan + v.meldFaan + (v.concealed ? 1 : 0);
    var routes = [];
    var numberSuits = Object.keys(v.meldSuits).filter(function (k) { return k !== 'z'; });
    var honors = countWhere(c, function (i) { return i >= 27; });
    var pairs = 0;
    for (var i = 0; i < 34; i++) if (c[i] >= 2) pairs++;

    routes.push({ id: 'mixed', faan: base + honorFaan(v, c) });
    if (!v.declared) {
      // All Sequences (1) on top of Concealed (1) and the flower faan.
      routes.push({ id: 'straights', faan: base + 1, keep: function (j) { return j < 27; } });
    }
    SUITS.forEach(function (su) {
      if (numberSuits.some(function (k) { return k !== su; })) return;
      var inSuit = countWhere(c, function (j) { return E.suitOfIndex(j) === su; }) +
        3 * v.melds.filter(function (m) { return E.suitOfIndex(E.tileIndex(m.tiles[0])) === su; }).length;
      if (inSuit + honors >= 8) {
        routes.push({
          id: 'half', suit: su, faan: base + 3 + honorFaan(v, c),
          keep: function (j) { return E.suitOfIndex(j) === su || j >= 27; },
        });
      }
      if (!v.meldSuits.z && inSuit >= 9) {
        routes.push({ id: 'full', suit: su, faan: base + 7, keep: function (j) { return E.suitOfIndex(j) === su; } });
      }
    });
    if (!v.hasChow && pairs + v.declared >= 4) {
      routes.push({ id: 'triplets', faan: base + 3 + honorFaan(v, c), shantenFn: E.tripletsShanten });
    }
    if (!v.declared && pairs >= 5) {
      // Seven Pairs replaces the Concealed faan.
      routes.push({ id: 'pairs', faan: v.flowerFaan + 4, shantenFn: E.sevenPairsShanten });
    }
    return routes;
  }

  // How much a finished hand of this faan is worth, in minimum wins.
  function worth(faan) {
    if (faan >= 3) return 1 + 0.5 * (Math.min(faan, 10) - 3);
    return Math.pow(0.4, 3 - faan);
  }

  function evalRoute(v, c, route) {
    var fn = route.shantenFn || E.standardShanten;
    var counts = route.keep ? restrict(c, route.keep) : c;
    var s = fn(counts, v.declared);
    if (s === Infinity) return null;
    var live = 0;
    for (var i = 0; i < 34; i++) {
      if (!v.unseen[i] || counts[i] >= 4 || (route.keep && !route.keep(i))) continue;
      counts[i]++;
      if (fn(counts, v.declared) < s) live += v.unseen[i];
      counts[i]--;
    }
    var t = v.drawsLeft;
    var chance = t / (t + v.unseenTotal / Math.max(live, 0.5)) * Math.pow(STEP, s) * COMPETITION;
    // Same scale as the bots' hand values, so the two can be compared.
    return { route: route, shanten: s, live: live, score: worth(route.faan) * 1.8 * chance };
  }

  function bestRoute(v, c) {
    var best = null;
    routesFor(v, c).forEach(function (r) {
      var e = evalRoute(v, c, r);
      if (e && (!best || e.score > best.score)) best = e;
    });
    return best;
  }

  function honorsWelcome(route) {
    return route.id === 'mixed' || route.id === 'half' || route.id === 'triplets';
  }

  /* ------------------------------------------------------------------ *
   * 3. Ranking discards
   * ------------------------------------------------------------------ */

  // How many tiles near this one could combine with it.
  function neighbors(c, i) {
    if (i >= 27) return c[i] - 1;
    var r = i % 9, n = c[i] - 1;
    [-2, -1, 1, 2].forEach(function (d) {
      if (r + d >= 0 && r + d <= 8) n += c[i + d];
    });
    return n;
  }

  function dangerOf(v, threats, i) {
    var loss = 0;
    threats.forEach(function (t) { loss += t.ready * B.waitChance(v.game, t, i) * t.payment; });
    return loss;
  }

  function rankDiscards(v, hand, threats) {
    var c = E.countsOf(hand);
    var out = [];
    for (var i = 0; i < 34; i++) {
      if (!c[i]) continue;
      c[i]--;
      var plan = bestRoute(v, c);
      var shanten = E.shanten(c, v.declared);
      var ready = shanten === 0 ? B.readyValue(c, v.ctx) : null;
      // The bots' tuned hand value, plus the Concealed All Sequences route
      // they don't plan for. (Tested over thousands of hands: this plays at
      // least as well as the bots, while the explanations stay the coach's.)
      var offense = Math.max(plan && plan.route.id === 'straights' ? plan.score : 0, B.handUtility(c, v.ctx).util);
      if (ready && ready.value > offense) offense = ready.value;
      c[i]++;
      // Lone honors: keep them while they can still become a set; let them
      // go once two copies are out.
      var adjust = 1;
      if (i >= 27 && c[i] === 1 && plan) {
        if (v.dropped[i] >= 2) adjust = 1.12;
        else if (honorsWelcome(plan.route)) adjust = honorWorth(v, i) ? 0.8 : 0.9;
      }
      var loss = dangerOf(v, threats, i);
      out.push({
        tile: E.tileId(i), index: i,
        score: offense * adjust - loss, offense: offense, loss: loss,
        shanten: shanten, plan: plan, ready: ready && ready.waits.length ? ready : null,
        lone: neighbors(c, i) === 0,
      });
    }
    out.sort(function (a, b) {
      if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
      if (a.lone !== b.lone) return a.lone ? -1 : 1;
      return E.isTerminalOrHonorIndex(b.index) - E.isTerminalOrHonorIndex(a.index);
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 4. Words
   * ------------------------------------------------------------------ */

  function faanWord(f) {
    var n = Math.max(0, Math.floor(f + 0.25));
    return n + ' faan';
  }

  function waitsText(ready) {
    var live = ready.waits.filter(function (w) { return w.left > 0; });
    var list = (live.length ? live : ready.waits).map(function (w) { return name(E.tileIndex(w.tile)); });
    var left = ready.waits.reduce(function (n, w) { return n + w.left; }, 0);
    var tiles = list.length > 1 ? list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1] : list[0];
    return tiles + ' (' + left + ' left)';
  }

  function readyNotes(ready, min) {
    var notes = [];
    var selfOnly = ready.waits.filter(function (w) { return !w.ronOk && w.tsumoOk; });
    var short = ready.waits.filter(function (w) { return !w.tsumoOk; });
    if (short.length === ready.waits.length) {
      notes.push('But no wait reaches ' + min + ' faan yet, so it can\'t win.');
    } else {
      if (selfOnly.length) notes.push(selfOnly.map(function (w) { return name(E.tileIndex(w.tile)); }).join(' and ') + ' only wins if you draw it yourself.');
      if (short.length) notes.push(short.map(function (w) { return name(E.tileIndex(w.tile)); }).join(' and ') + ' is short of ' + min + ' faan.');
    }
    return notes;
  }

  function whyDiscard(v, c, pick, route) {
    var i = pick.index;
    if (i >= 27 && c[i] === 1 && v.dropped[i] >= 2) {
      return COUNT_WORDS[v.dropped[i]] + ' ' + (v.dropped[i] === 1 ? name(i) + ' is' : plural(i) + ' are') + ' already out, so it can\'t become a set.';
    }
    if (route && route.keep && !route.keep(i)) {
      if (route.id === 'straights') return 'Honor tiles spoil an All Sequences hand.';
      var suit = SUIT_NAME[route.suit];
      return route.id === 'half'
        ? 'It isn\'t ' + suit + ' or an honor, and you\'re collecting ' + suit + '.'
        : 'It isn\'t ' + suit + ', and you\'re collecting only ' + suit + '.';
    }
    if (c[i] >= 3) return route && route.id === 'pairs' ? 'Seven Pairs only uses two of each.' : 'You hold three, and a spare tile helps more elsewhere.';
    if (c[i] === 2) return 'You have more pairs than you need.';
    if (pick.lone) {
      if (i >= 27) return 'It\'s a lone honor that adds no faan for you.';
      return E.isTerminalOrHonorIndex(i)
        ? 'It\'s an end tile on its own, the hardest kind to use.'
        : 'It\'s on its own, with nothing next to it.';
    }
    var r = i % 9;
    if (i < 27 && (r === 0 || r === 8)) return 'Edge shapes like this one are the slowest to finish.';
    return 'Your hand needs it least.';
  }

  function planLine(v, plan, c) {
    var r = plan.route;
    var f = faanWord(r.faan);
    if (r.id === 'straights') {
      var parts = ['Concealed', 'All Sequences'];
      parts.push(v.flowerFaan ? (v.game.hand.seats[v.seat].flowers.length ? 'your seat flower' : 'No Flowers') : 'self-draw');
      var keep = liveValueSingles(v, c);
      return 'Plan: build runs like 3-4-5 and don\'t claim. ' + parts.join(' + ') + ' makes 3 faan.' +
        (keep.length ? ' Hold the ' + listNames(keep) + ' for now in case ' + (keep.length > 1 ? 'one pairs' : 'it pairs') + ' up.' : '');
    }
    if (r.id === 'half') return 'Plan: Half Flush in ' + SUIT_NAME[r.suit] + ' (about ' + f + '). Keep ' + SUIT_NAME[r.suit] + ' and honors.';
    if (r.id === 'full') return 'Plan: Full Flush in ' + SUIT_NAME[r.suit] + ' (about ' + f + '). Keep only ' + SUIT_NAME[r.suit] + '.';
    if (r.id === 'triplets') return 'Plan: All Triplets (about ' + f + '). Keep your pairs and Pung them.';
    if (r.id === 'pairs') return 'Plan: Seven Pairs (about ' + f + '). Keep pairs and don\'t claim.';
    return null;
  }

  function honorLine(v, c) {
    for (var i = 27; i < 34; i++) {
      if (c[i] === 2 && honorWorth(v, i) && v.unseen[i] >= 1) {
        return 'Keep your ' + name(i) + ' pair. A third one makes a set worth ' + honorWorth(v, i) + ' faan; Pung it if someone throws it.';
      }
    }
    var singles = liveValueSingles(v, c);
    if (singles.length) return 'Plan: keep the ' + listNames(singles) + ' and pair ' + (singles.length > 1 ? 'them' : 'it') + ' up. A set of any of these is worth faan.';
    return null;
  }

  function threatLine(threats, pick, offenseTop) {
    var t = threats.filter(function (x) { return x.ready >= 0.5; }).sort(function (a, b) { return b.ready - a.ready; })[0];
    if (!t) return null;
    var line = 'Watch out: ' + t.name + ' may be close to winning' + (t.flush ? ' with ' + SUIT_NAME[t.flush] : '') + '.';
    if (offenseTop && pick.tile !== offenseTop.tile && t.discarded[pick.tile]) line += ' ' + t.name + ' threw ' + name(pick.index) + ' already, so it\'s safe.';
    return line;
  }

  /* ------------------------------------------------------------------ *
   * 5. Hints
   * ------------------------------------------------------------------ */

  function turnHint(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) return { kind: 'win', tips: ['You can win with ' + opts.win.faan + ' faan. Tap Win!'] };
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var threats = B.opponentThreats(game, seat);
    var list = rankDiscards(v, hand, threats);
    var pick = list[0];
    var offenseTop = list.slice().sort(function (a, b) { return b.offense - a.offense; })[0];
    var tips = [];

    if (opts.completeButShort) {
      tips.push('Your hand is complete but only ' + opts.completeButShort.faan + ' faan. You need ' + min + ', so keep going.');
    }
    if (opts.kongs && opts.kongs.length) {
      var kong = B.chooseTurnAction(game, seat, { kongs: opts.kongs });
      if (kong.type === 'kong') tips.push('Declare a Kong of ' + E.tileName(kong.tile) + '. You get a free extra tile.');
    }

    var route = pick.plan && pick.plan.route;
    if (pick.ready && pick.shanten === 0) {
      var wins = pick.ready.waits.filter(function (w) { return w.ronOk; }).map(function (w) { return w.ronFaan; });
      tips.push('Discard ' + E.tileName(pick.tile) + '. You\'ll be one tile from winning: ' + waitsText(pick.ready) +
        (wins.length ? ', worth ' + Math.min.apply(null, wins) + '+ faan.' : '.'));
      readyNotes(pick.ready, min).forEach(function (n) { tips.push(n); });
    } else {
      tips.push('Discard ' + E.tileName(pick.tile) + '. ' + whyDiscard(v, c, pick, route));
    }

    var threat = threatLine(threats, pick, offenseTop);
    if (threat) tips.push(threat);

    if (!(pick.ready && pick.shanten === 0) && pick.plan) {
      var cAfter = c.slice();
      cAfter[pick.index]--;
      if (route.faan < min - 0.25) {
        tips.push('Careful: this hand is only about ' + faanWord(route.faan) + '. A flush, all triplets or a dragon or wind set gets you to ' + min + '.');
      } else {
        var line = planLine(v, pick.plan, cAfter) || honorLine(v, cAfter);
        if (line) tips.push(line);
      }
    }
    return { kind: 'discard', tile: pick.tile, tips: tips, candidates: list };
  }

  function chowLabel(pair, tile) {
    var tiles = E.sortTiles(pair.concat([tile]));
    var su = E.suitOfIndex(E.tileIndex(tile));
    return 'Chow ' + tiles.map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-') + ' ' + SUIT_NAME[su];
  }

  function claimHint(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) {
      return { kind: 'claim', decision: { type: 'win' }, tips: ['Win! ' + E.tileName(opts.tile) + ' finishes your hand for ' + opts.win.faan + ' faan.'] };
    }
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var ti = E.tileIndex(opts.tile);
    var threats = B.opponentThreats(game, seat);
    var stay = bestRoute(v, c);
    var passScore = stay ? stay.score : 0;
    var tips = [];
    if (opts.completeButShort) {
      tips.push(E.tileName(opts.tile) + ' would finish your hand, but only for ' + opts.completeButShort.faan + ' faan. You need ' + min + '.');
    }

    function afterClaim(meld, used) {
      var h = hand.slice();
      used.forEach(function (id) { h.splice(h.indexOf(id), 1); });
      var v2 = withClaim(v, meld);
      if (meld.type === 'kong') {
        // A kong draws a replacement instead of discarding.
        var plan = bestRoute(v2, E.countsOf(h));
        return plan ? { score: plan.score * 1.05, plan: plan } : null;
      }
      var top = rankDiscards(v2, h, threats)[0];
      return top ? { score: top.score, plan: top.plan, discard: top.tile } : null;
    }

    var options = [];
    if (opts.pung) {
      var p = afterClaim({ type: 'pung', tiles: [opts.tile, opts.tile, opts.tile], concealed: false }, [opts.tile, opts.tile]);
      if (p) options.push({ decision: { type: 'pung' }, label: 'Pung', res: p });
    }
    if (opts.kong) {
      var k = afterClaim({ type: 'kong', tiles: [opts.tile, opts.tile, opts.tile, opts.tile], concealed: false }, [opts.tile, opts.tile, opts.tile]);
      if (k) options.push({ decision: { type: 'kong' }, label: 'Kong', res: k });
    }
    (opts.chows || []).forEach(function (pair) {
      var tiles = E.sortTiles(pair.concat([opts.tile]));
      var ch = afterClaim({ type: 'chow', tiles: tiles, concealed: false }, pair);
      if (ch) options.push({ decision: { type: 'chow', tiles: pair }, label: chowLabel(pair, opts.tile), res: ch });
    });
    if (!options.length) return { kind: 'claim', decision: { type: 'pass' }, tips: tips.concat(['Pass.']) };

    options.sort(function (a, b) { return b.res.score - a.res.score; });
    var best = options[0];
    var bestFaan = best.res.plan ? best.res.plan.route.faan : 0;

    // The move comes from the bots' tested claim logic, with two expert
    // rules on top: always take a dragon or own/round wind set, and don't
    // break up a concealed runs hand (Concealed + All Sequences) for a claim.
    var dec = B.chooseClaim(game, seat, opts);
    var honorSet = ti >= 27 && honorWorth(v, ti) > 0 && (opts.pung || opts.kong);
    if (honorSet && !(stay && stay.route.id === 'pairs')) dec = { type: opts.kong && !opts.pung ? 'kong' : 'pung' };
    else if (dec.type !== 'pass' && v.concealed && stay && stay.route.id === 'straights') dec = { type: 'pass' };
    var taken = options.filter(function (o) {
      return o.decision.type === dec.type && (dec.type !== 'chow' || o.decision.tiles.join() === dec.tiles.join());
    })[0];
    if (taken && ti >= 27 && honorWorth(v, ti) && dec.type !== 'chow') {
      tips.push(taken.label + '! A ' + E.tileName(opts.tile) + ' set is worth ' + honorWorth(v, ti) + ' faan and gets you closer.');
      return { kind: 'claim', decision: dec, tips: tips };
    }
    if (taken) {
      best = taken;
      bestFaan = best.res.plan ? best.res.plan.route.faan : 0;
      var route = best.res.plan.route;
      var fits = route.id === 'half' || route.id === 'full'
        ? 'It fits your ' + SUIT_NAME[route.suit] + ' flush'
        : route.id === 'triplets' ? 'You\'re going for All Triplets' : 'It speeds up your hand';
      tips.push(best.label + '. ' + fits + (bestFaan >= min ? ', and the hand is still worth about ' + faanWord(bestFaan) + '.' : '.'));
      return { kind: 'claim', decision: dec, tips: tips };
    }

    if (bestFaan < min) {
      tips.push(v.concealed
        ? 'Pass. Claiming gives up the 1 faan for a concealed hand' + (stay && stay.route.id === 'straights' ? ' and All Sequences' : '') + ', leaving you short of ' + min + ' faan.'
        : 'Pass. After claiming, this hand couldn\'t reach ' + min + ' faan.');
    } else if (v.concealed) {
      tips.push('Pass. Staying concealed is worth 1 faan' +
        (stay && stay.route.id === 'straights' ? ' and keeps All Sequences possible' : '') + ', and this claim barely helps.');
    } else {
      tips.push('Pass. It doesn\'t help your hand enough.');
    }
    return { kind: 'claim', decision: { type: 'pass' }, tips: tips };
  }

  var api = { turnHint: turnHint, claimHint: claimHint, rankDiscards: rankDiscards, routesFor: routesFor, look: look };
  if (node) module.exports = api;
  else root.MahjongCoach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
