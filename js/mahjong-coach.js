/* Hint coach for the Play game.

   The bots decide. This module says that same decision in plain words:
   what to do and why, how far the hand is from ready and which plan it is,
   how dangerous the opponents look, and which tile goes next. It does not
   keep a second route or a second claim rule. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  var SUIT_NAME = { c: 'Characters', d: 'Circles', b: 'Bamboo' };
  var COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four'];

  function name(i) { return E.tileName(E.tileId(i)); }
  function plural(i) { return name(i) + 's'; }

  /* ------------------------------------------------------------------ *
   * 1. What the player can see
   * ------------------------------------------------------------------ */

  function honorWorth(v, i) { return B.valueWeight(v.ctx, i); }

  function look(game, seat) {
    var ctx = B.buildContext(game, seat);
    return {
      game: game, seat: seat, ctx: ctx, unseen: ctx.unseen,
      concealed: ctx.concealed,
      flowerFaan: B.flowerPoints(ctx),
      // After a chow, only the chow's suit (and honors) can still win.
      committedSuit: B.chowCommitment(ctx),
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Routes to 3 faan (for a hand waiting to draw)
   * ------------------------------------------------------------------ */

  // Dragons and own/round winds held alone that can still pair up.
  function liveValueSingles(v, c) {
    var out = [];
    for (var i = 27; i < 34; i++) {
      if (c[i] === 1 && honorWorth(v, i) && B.revealedCopies(v.game, i) <= 1) out.push(i);
    }
    return out;
  }

  function listNames(ids) {
    var names = ids.map(name);
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  }

  // The bot's plan, in the names the sentences below already use.
  function routeOf(plan) {
    if (!plan) return null;
    var id = plan.id;
    var suit = plan.suit || null;
    if (id.slice(0, 5) === 'half-') id = 'half';
    else if (id.slice(0, 5) === 'full-') id = 'full';
    else if (id === 'plain') id = 'mixed';
    var keep = null;
    if (id === 'half') keep = function (j) { return E.suitOfIndex(j) === suit || j >= 27; };
    else if (id === 'full') keep = function (j) { return E.suitOfIndex(j) === suit; };
    else if (id === 'straights') keep = function (j) { return j < 27; };
    return { id: id, suit: suit, faan: plan.faan, keep: keep };
  }

  function described(analysis) {
    var best = analysis && analysis.best;
    if (!best || !best.plan) return null;
    return {
      route: routeOf(best.plan),
      shanten: best.planShanten != null ? best.planShanten : best.shanten,
      live: best.ukeire || 0,
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. The bot's discards, with the words attached
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

  function rankDiscards(v, hand) {
    var found = B.analyzeDiscards(v.game, v.seat, v.ctx, hand);
    var full = E.countsOf(hand);
    var out = found.candidates.map(function (x) {
      var ready = x.analysis.ready;
      return {
        tile: x.tile, index: x.index, offense: x.util, loss: x.loss, score: x.score,
        priority: x.priority, shanten: x.shanten, plan: described(x.analysis),
        ready: ready && ready.waits && ready.waits.length ? ready : null,
        lone: neighbors(full, x.index) === 0,
      };
    });
    out.defense = found.defense;
    out.threats = found.threats;
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
    if (v.committedSuit && i < 27 && E.suitOfIndex(i) !== v.committedSuit) {
      return 'You\'ve already chowed in ' + SUIT_NAME[v.committedSuit] + ', so tiles from other suits can\'t help you reach ' + v.game.settings.minFaan + ' faan.';
    }
    if (B.isPungTile(v.game, i) && c[i] < 2) {
      return pungedReason(i);
    }
    if (route && route.id === 'pairs' && c[i] === 1) {
      return handName('Seven Pairs') + ' keeps every pair, so this single goes first.';
    }
    if (route && route.id === 'orphans' && !E.isTerminalOrHonorIndex(i)) {
      return 'Thirteen Orphans only uses terminals and honors.';
    }
    if (route && route.id === 'gates' && E.suitOfIndex(i) !== route.suit) {
      return 'Nine Gates uses only ' + SUIT_NAME[route.suit] + '.';
    }
    if (i >= 27 && c[i] === 1 && B.revealedCopies(v.game, i) >= 2) {
      var out = B.revealedCopies(v.game, i);
      return COUNT_WORDS[out] + ' ' + (out === 1 ? name(i) + ' is' : plural(i) + ' are') + ' already out, so it can\'t become a set.';
    }
    if (route && route.keep && !route.keep(i)) {
      if (route.id === 'straights') return 'Honor tiles spoil an ' + handName('All Sequences') + ' hand.';
      var suit = SUIT_NAME[route.suit];
      return route.id === 'half'
        ? 'It isn\'t ' + suit + ' or an honor, and you\'re collecting ' + suit + '.'
        : 'It isn\'t ' + suit + ', and you\'re collecting only ' + suit + '.';
    }
    if (c[i] >= 3) return route && route.id === 'pairs' ? handName('Seven Pairs') + ' only uses two of each.' : 'You hold three, and a spare tile helps more elsewhere.';
    if (c[i] === 2) return 'You have more pairs than you need.';
    if (pick.lone) {
      if (i >= 27) return 'It\'s a lone honor that adds no faan for you.';
      return E.isTerminalOrHonorIndex(i)
        ? 'It\'s a terminal on its own, the hardest kind to use.'
        : 'It\'s on its own, with nothing next to it.';
    }
    var r = i % 9;
    if (i < 27 && (r === 0 || r === 8)) return 'Terminals like this one are the slowest to build on.';
    return 'Your hand needs it least.';
  }

  // Hand names (All Sequences, Half Flush and so on) are wrapped in invisible
  // markers so the game can draw them in red (see mahjong-game.js).
  function handName(name) { return '\u0001' + name + '\u0002'; }

  // Hand names (All Sequences, Half Flush and so on) are wrapped in invisible
  // markers so the game can draw them in red (see mahjong-game.js).
  function handName(name) { return '\u0001' + name + '\u0002'; }

  function marked(text) {
    return 'Your target is ' + text;
  }

  function stepsText(shanten) {
    if (shanten <= 0) return 'Ready';
    return shanten === 1 ? '1 tile from ready' : shanten + ' tiles from ready';
  }

  function targetText(v, plan, c, nextOut) {
    var r = plan.route;
    // The target is shown at the hand's own value from the scoring table
    // (what the pattern is worth), not an estimate with bonuses mixed in.
    var F = E.HKScoring.FAAN;
    var own = {
      straights: F.allSequences + F.concealed, half: F.halfFlush, full: F.fullFlush,
      triplets: F.allTriplets, 'concealed-triplets': F.allConcealedTriplets, pairs: F.sevenPairs,
      orphans: F.thirteenOrphans, gates: F.nineGates,
    };
    var f = (own[r.id] !== undefined ? own[r.id] : 0) + ' faan';
    if (r.id === 'straights') {
      var keep = liveValueSingles(v, c).filter(function (i) { return i !== nextOut; });
      return handName('Concealed All Sequences') + ' (' + f + '), so use self-draw tiles and don\'t claim discards' +
        (v.flowerFaan ? '. Your flowers add the third faan' : '') +
        (keep.length ? '. Hold the ' + listNames(keep) + ' in case ' + (keep.length > 1 ? 'one pairs' : 'it pairs') + ' up' : '');
    }
    if (r.id === 'half') return handName('Half Flush in ' + SUIT_NAME[r.suit]) + ' (' + f + '), so keep ' + SUIT_NAME[r.suit] + ' and honors';
    if (r.id === 'full') return handName('Full Flush in ' + SUIT_NAME[r.suit]) + ' (' + f + '), so keep only ' + SUIT_NAME[r.suit];
    if (r.id === 'triplets') return handName('All Triplets') + ' (' + f + '), so keep your pairs and Pung them';
    if (r.id === 'concealed-triplets') return 'Concealed Triplets (' + f + '), so keep your pairs and don\'t claim discards';
    if (r.id === 'pairs') return handName('Seven Pairs') + ' (' + f + '), so keep your pairs and don\'t claim discards';
    if (r.id === 'orphans') return 'Thirteen Orphans (' + f + '), so keep every terminal and honor and don\'t claim discards';
    if (r.id === 'gates') return 'Nine Gates in ' + SUIT_NAME[r.suit] + ' (' + f + '), so keep 1112345678999 in ' + SUIT_NAME[r.suit] + ' and don\'t claim discards';
    for (var i = 27; i < 34; i++) {
      if (c[i] === 2 && honorWorth(v, i) && v.unseen[i] >= 1) return (/^[AEIOU]/.test(name(i)) ? 'an ' : 'a ') + name(i) + ' set (' + honorWorth(v, i) + ' faan), so Pung it if it\'s thrown';
    }
    return 'a ' + handName('chicken hand') + ' (0 faan)';
  }

  // Axis A in words: early on there's room to build; late, finish fast.
  function phaseText(v, threats) {
    var big = threats.some(function (t) { return t.level >= 2 && t.faan >= 5; });
    if (big) return 'Someone shows a big hand, so speed matters more than size.';
    if (v.ctx.turn <= 5) return 'It\'s early, so there\'s room to build a bigger hand.';
    if (v.ctx.turn >= 10 || v.ctx.wallLeft < 32) return 'It\'s late in the hand, so finish fast.';
    return '';
  }

  function dangerWord(loss) {
    if (loss < 0.002) return 'safe';
    if (loss < 0.012) return 'low risk';
    if (loss < 0.035) return 'some risk';
    return 'risky';
  }

  // Why a tile is safe against a threat, in the usual order of reads.
  function safetyReason(v, t, i) {
    var id = E.tileId(i);
    if (B.deadTile(v.game, i)) return 'a Pung of it is already on the table';
    if (t.since[id]) return t.name + ' threw it after their last meld';
    if (i >= 27 && 4 - v.unseen[i] >= 3) return 'three are already out';
    if (t.flush && E.suitOfIndex(i) !== t.flush && i < 27) return t.name + ' is collecting ' + SUIT_NAME[t.flush];
    if (i < 27) {
      var r = i % 9, su = E.suitOfIndex(i);
      var low = r >= 3 && t.suji[su][r - 3], high = r <= 5 && t.suji[su][r + 3];
      if ((r < 3 && high) || (r > 5 && low) || (low && high)) {
        return t.name + ' threw the ' + name(low ? i - 3 : i + 3) + ', which makes this one safer';
      }
      var blocked = [-1, 1].filter(function (d) { var j = r + d; return j >= 0 && j <= 8 && v.unseen[i + d] === 0; })[0];
      if (blocked !== undefined) return 'all four ' + plural(i + blocked) + ' are visible, so few hands can use it';
    }
    if (t.discarded[id]) return t.name + ' threw one earlier';
    return '';
  }

  function threatPhrase(t) {
    var bits = [];
    if (t.melds) bits.push(t.melds + (t.melds === 1 ? ' meld' : ' melds'));
    if (t.flush) bits.push(SUIT_NAME[t.flush]);
    return t.name + ' is ' + (t.levelName === 'Extreme' ? 'an' : 'a') + ' ' + t.levelName + ' threat' + (bits.length ? ' (' + bits.join(', ') + ')' : '');
  }

  // "Grace is an Extreme threat and Rosa is a High threat."
  function threatSentence(list) {
    var parts = list.map(threatPhrase);
    return (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
  }

  function defenseLine(v, threats, pick, list) {
    var shown = threats.filter(function (t) { return t.level >= 1; }).sort(function (a, b) { return b.level - a.level; });
    var word = dangerWord(pick.loss);
    if (!shown.length) return pick.loss >= 0.035 ? E.tileName(pick.tile) + ' is ' + word + '.' : '';
    var top = shown[0];
    var line = threatSentence(shown) + ' ' + E.tileName(pick.tile) + ' is ' + word;
    var why = top.level >= 2 ? safetyReason(v, top, pick.index) : '';
    if (why) line += ' because ' + why;
    line += '.';
    var worst = list.slice().sort(function (a, b) { return b.loss - a.loss; })[0];
    if (top.level >= 2 && worst && worst.tile !== pick.tile && worst.loss > pick.loss * 2 && worst.loss >= 0.012) {
      line += ' Hold on to ' + E.tileName(worst.tile) + ', which is ' + dangerWord(worst.loss) + '.';
    }
    return line;
  }

  // The main action (the first sentence of tips[k], e.g. "Discard Nine
  // Circle.") is shown on its own line; the rest reads as one paragraph,
  // starting with why.
  // A punged honor can't deal in at all. A punged number tile can't be
  // punged or waited on as a pair, but it can still finish someone's chow.
  function pungedReason(i) {
    return i >= 27
      ? 'Someone already Punged it, so it is safe to drop, and your hand does not need it.'
      : 'Someone already Punged it, so nobody can Pung it or wait on it as a pair, and your hand does not need it.';
  }

  function lead(hint, k) {
    var t = hint.tips[k] || '';
    var m = t.match(/^(.+?[.!?])(?:\s+(.*))?$/);
    hint.action = m ? m[1] : t;
    var rest = hint.tips.filter(function (x, i) { return i !== k; });
    if (m && m[2]) rest.unshift(m[2]);
    hint.tips = rest;
    return hint;
  }

  /* ------------------------------------------------------------------ *
   * 5. Hints: 1) what to do, 2) where the hand stands, 3) the threats,
   *    4) what goes next if the draw doesn't help.
   * ------------------------------------------------------------------ */

  function turnHint(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) return { kind: 'win', action: 'Win!', tips: ['Tap Win to score ' + opts.win.faan + ' faan.'] };
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var list = rankDiscards(v, hand);
    var threats = list.threats;
    var pick = list[0];
    var offenseTop = list.slice().sort(function (a, b) { return b.offense - a.offense; })[0];
    var defending = list.defense > 1.25 && offenseTop.tile !== pick.tile;
    var tips = [];

    if (opts.completeButShort) {
      tips.push('Your hand is complete but only ' + opts.completeButShort.faan + ' faan. You need ' + min + ', so keep going.');
    }
    if (opts.kongs && opts.kongs.length) {
      var kong = B.chooseTurnAction(game, seat, { kongs: opts.kongs });
      if (kong.type === 'kong') { var kongAt = tips.length; tips.push('Declare a Kong of ' + E.tileName(kong.tile) + '. You get a free extra tile.'); }
    }

    // 1. What to do.
    var route = pick.plan && pick.plan.route;
    var buildingLimit = route && (route.id === 'orphans' || route.id === 'gates');
    var pungSafe = B.isPungTile(v.game, pick.index) && c[pick.index] < 2;
    var why = pungSafe
      ? pungedReason(pick.index)
      : (defending
        ? 'It\'s the safe play, since your hand is slow and ' + (v.ctx.wallLeft < 16 ? 'the wall is nearly gone.' : 'someone is close to winning.')
        : (pick.ready && pick.shanten === 0 && !buildingLimit ? 'It leaves you ready to win.' : whyDiscard(v, c, pick, route)));
    var discardAt = tips.length;
    tips.push('Discard ' + E.tileName(pick.tile) + '. ' + why);

    // 2. Where the hand stands (and, for 4, what goes next).
    var cAfter = c.slice();
    cAfter[pick.index]--;
    var isReady = pick.ready && pick.shanten === 0 && !buildingLimit;
    var next = null;
    if (!isReady) {
      var rest = hand.slice();
      rest.splice(rest.indexOf(pick.tile), 1);
      next = rankDiscards(v, rest)[0];
    }
    if (isReady) {
      var wins = pick.ready.waits.filter(function (w) { return w.ronOk; }).map(function (w) { return w.ronFaan; });
      var state = 'You are ready and waiting on ' + waitsText(pick.ready) + (wins.length ? ', worth ' + Math.min.apply(null, wins) + '+ faan.' : '.');
      var notes = readyNotes(pick.ready, min);
      var liveLeft = pick.ready.waits.reduce(function (n, w) { return n + w.left; }, 0);
      if (liveLeft <= 1) notes.push('Almost none are left, so change the wait if you can.');
      tips.push(state + (notes.length ? ' ' + notes.join(' ') : ''));
    } else if (pick.plan) {
      var line = stepsText(buildingLimit ? pick.plan.shanten : pick.shanten) + '. ' + marked(targetText(v, pick.plan, cAfter, next && next.index)) + '. ' +
        pick.plan.live + ' tiles help.';
      if (route.faan < min - 0.25) line += ' That\'s short of ' + min + ' faan, but a ' + handName('flush') + ', ' + handName('all triplets') + ' or a dragon or wind set would fix it.';
      else if (!defending) { var phase = phaseText(v, threats); if (phase) line += ' ' + phase; }
      tips.push(line);
    }

    // 3. Threats and how safe the discard is.
    var defense = defenseLine(v, threats, pick, list);
    if (defense) tips.push(defense);

    // 4. What goes next if the next draw doesn't help.
    if (next) tips.push('If your next draw doesn\'t help, let ' + E.tileName(next.tile) + ' go.');

    var worry = threats.filter(function (t) { return t.level >= 2; }).sort(function (a, b) { return b.level - a.level; })[0];
    return lead({
      kind: 'discard', tile: pick.tile, tips: tips, candidates: list,
      why: why, threatName: worry ? worry.name : null,
    }, kongAt !== undefined ? kongAt : discardAt);
  }

  function chowLabel(pair, tile) {
    var tiles = E.sortTiles(pair.concat([tile]));
    var su = E.suitOfIndex(E.tileIndex(tile));
    return 'Chow ' + tiles.map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-') + ' ' + SUIT_NAME[su];
  }

  function claimHint(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) {
      return { kind: 'claim', decision: { type: 'win' }, action: 'Win!', tips: [E.tileName(opts.tile) + ' finishes your hand for ' + opts.win.faan + ' faan.'] };
    }
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var ti = E.tileIndex(opts.tile);
    var decided = B.decideClaim(game, seat, opts);
    var found = decided.found;
    var dec = decided.decision;
    var stay = found ? described(found.stay) : null;
    var threats = B.opponentThreats(game, seat);
    var tips = [];
    if (opts.completeButShort) {
      tips.push(E.tileName(opts.tile) + ' would finish your hand, but only for ' + opts.completeButShort.faan + ' faan. You need ' + min + '.');
    }
    if (!found || !found.options.length) return lead({ kind: 'claim', decision: dec, tips: tips.concat(['Pass.']) }, tips.length);

    function without(ids) {
      var h = hand.slice();
      ids.forEach(function (id) {
        var at = h.indexOf(id);
        if (at !== -1) h.splice(at, 1);
      });
      return E.countsOf(h);
    }

    var best = found.options[0];
    var bestFaan = best.analysis.best && best.analysis.best.plan ? best.analysis.best.plan.faan : 0;
    var taken = found.options.filter(function (o) {
      return o.decision.type === dec.type && (dec.type !== 'chow' || o.decision.tiles.join() === dec.tiles.join());
    })[0];

    function spoken(option) {
      var used = option.decision.type === 'chow' ? option.decision.tiles
        : option.decision.type === 'kong' ? [opts.tile, opts.tile, opts.tile]
        : [opts.tile, opts.tile];
      return {
        label: option.decision.type === 'chow' ? chowLabel(option.decision.tiles, opts.tile) : option.decision.type.charAt(0).toUpperCase() + option.decision.type.slice(1),
        plan: described(option.analysis),
        discard: option.discard,
        counts: without(used.concat(option.discard ? [option.discard] : [])),
        faan: option.analysis.best && option.analysis.best.plan ? option.analysis.best.plan.faan : 0,
      };
    }

    // Where the hand stands afterwards, and the threats. On a pass this is
    // the hand as it is; on a claim it is the hand after the call and its discard.
    function after(plan, counts, discard) {
      var lines = [];
      if (plan) {
        var short = plan.route.faan < min - 0.25 ? ' Still short of ' + min + ' faan, so keep looking for more.' : '';
        lines.push((discard ? 'Then discard ' + E.tileName(discard) + '. ' : '') + stepsText(plan.shanten) +
          '. ' + marked(targetText(v, plan, counts)) + '.' + short);
      }
      var shown = threats.filter(function (t) { return t.level >= 2; });
      if (shown.length) lines.push(threatSentence(shown));
      return lines;
    }

    if (taken && ti >= 27 && honorWorth(v, ti) && dec.type !== 'chow') {
      var honorCall = spoken(taken);
      tips.push(honorCall.label + '! A ' + E.tileName(opts.tile) + ' set is worth ' + honorWorth(v, ti) + ' faan and gets you closer.');
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(honorCall.plan, honorCall.counts, honorCall.discard)) }, tips.length - 1);
    }
    if (taken) {
      var call = spoken(taken);
      var route = call.plan.route;
      var fits = route.id === 'half' || route.id === 'full'
        ? 'It fits your ' + handName(SUIT_NAME[route.suit] + ' flush')
        : route.id === 'triplets' ? 'You\'re going for ' + handName('All Triplets') : 'It speeds up your hand';
      tips.push(call.label + '. ' + fits + (call.faan >= min ? ', and the hand is still worth about ' + faanWord(call.faan) + '.' : '.'));
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(call.plan, call.counts, call.discard)) }, tips.length - 1);
    }

    var chowOnly = found.options.every(function (o) { return o.decision.type === 'chow'; });
    if (chowOnly && bestFaan >= min) {
      tips.push('Pass. A chow gives up' + (v.concealed ? ' your concealed hand and' : '') + ' flexibility, so save it for when it makes you ready or builds a ' + handName('flush') + '.');
    } else if (bestFaan < min) {
      tips.push(v.concealed
        ? 'Pass. Claiming gives up the 1 faan for a concealed hand' + (stay && stay.route.id === 'straights' ? ' and ' + handName('All Sequences') : '') + ', leaving you short of ' + min + ' faan.'
        : 'Pass. After claiming, this hand couldn\'t reach ' + min + ' faan.');
    } else if (v.concealed) {
      tips.push('Pass. Staying concealed is worth 1 faan' +
        (stay && stay.route.id === 'straights' ? ' and keeps ' + handName('All Sequences') + ' possible' : '') + ', and this claim barely helps.');
    } else {
      tips.push('Pass. It doesn\'t help your hand enough.');
    }
    return lead({ kind: 'claim', decision: { type: 'pass' }, tips: tips.concat(after(stay, c)) }, tips.length - 1);
  }

  /* ------------------------------------------------------------------ *
   * 6. Feedback on the move you just made (training mode)
   * ------------------------------------------------------------------ */

  function stepsWords(shanten) {
    if (shanten <= 0) return 'ready';
    return shanten === 1 ? '1 tile from ready' : shanten + ' tiles from ready';
  }

  // `hint` is what turnHint said before you moved; `tile` is what you threw.
  function discardFeedback(hint, tile) {
    if (!hint || !hint.candidates || !hint.candidates.length) return null;
    var top = hint.candidates[0];
    var chosen = hint.candidates.filter(function (c) { return c.tile === tile; })[0];
    if (!chosen) return null;
    var gap = top.score - chosen.score;
    var mine = E.tileName(tile), best = E.tileName(top.tile);
    var great = chosen.tile === top.tile || gap <= 0.002;
    var slows = chosen.shanten > top.shanten;
    var risky = chosen.loss >= 0.035 && chosen.loss > top.loss * 1.5 + 0.01;
    var good = gap <= Math.max(0.003, Math.abs(top.score) * 0.15);

    if (great) {
      return { kind: 'feedback', action: 'Great discard.', tips: [chosen.tile === top.tile
        ? (mine + ' was the coach\'s top choice. ' + (hint.why || '')).trim()
        : mine + ' is about as good as the coach\'s pick, ' + best + '.'] };
    }
    var tips = ['The coach would have discarded ' + best + '. ' + (hint.why || '')];
    var action;
    if (slows) {
      action = 'That discard slows your hand.';
      var more = chosen.shanten - top.shanten;
      tips.push('Throwing ' + mine + ' leaves you ' + stepsWords(chosen.shanten) + ', ' + more + (more === 1 ? ' tile' : ' tiles') + ' further than the coach\'s discard.');
    } else if (risky) {
      action = 'That discard was risky.';
      tips.push('Throwing ' + mine + ' was risky because ' + (hint.threatName ? hint.threatName + ' looks close to winning.' : 'an opponent may be waiting on it.'));
    } else if (good) {
      action = 'Good discard.';
      tips.push('Both work, but the coach rates ' + best + ' a little higher.');
    } else {
      action = 'There was a better discard.';
      tips.push('Throwing ' + mine + ' keeps fewer ways to improve your hand.');
    }
    return { kind: 'feedback', action: action, tips: tips.map(function (t) { return t.trim(); }) };
  }

  function claimName(decision) {
    return decision.type === 'chow' ? 'Chow' : decision.type.charAt(0).toUpperCase() + decision.type.slice(1);
  }

  // `hint` is what claimHint said before you chose; `decision` is what you did.
  function claimFeedback(hint, decision) {
    if (!hint || !hint.decision || !decision || decision.type === 'win') return null;
    var coachType = hint.decision.type;
    var same = coachType === decision.type &&
      (decision.type !== 'chow' || !hint.decision.tiles || decision.tiles.join() === hint.decision.tiles.join());
    var reason = hint.tips[0] || '';
    var coachSays = (hint.action || '').replace(/[.!]$/, '');
    if (same) {
      return { kind: 'feedback', action: decision.type === 'pass' ? 'Good pass.' : 'Good call.', tips: [reason].filter(Boolean) };
    }
    var did = decision.type === 'pass' ? 'You passed.' : 'You took the ' + claimName(decision) + '.';
    var action = coachType === 'pass' ? 'The coach would have passed.' : 'The coach would have called ' + coachSays + '.';
    return { kind: 'feedback', action: action, tips: [did + ' ' + reason] };
  }

  var api = { discardFeedback: discardFeedback, claimFeedback: claimFeedback, turnHint: turnHint, claimHint: claimHint, rankDiscards: rankDiscards, look: look };
  if (node) module.exports = api;
  else root.MahjongCoach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
