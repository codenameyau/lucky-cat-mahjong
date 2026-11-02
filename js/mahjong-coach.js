/* Hint coach for the Play game.

   The bots decide. This module says that same decision in plain words:
   what to do and why, how far the hand is from ready and which plan it is,
   how dangerous the opponents look, and which tile goes next. It does not
   keep a second route or a second claim rule.

   forStrategy(bot) returns this same coach speaking for another strategy
   (js/mahjong-strategies.js); the default speaks for jorge-yau. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var DEFAULT_BOT = node ? require('./mahjong-bot.js') : root.MahjongBot;
  var B = DEFAULT_BOT;

  var SUIT_NAME = { c: 'Characters', d: 'Circles', b: 'Bamboo' };
  var COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four'];
  var LAST_WALL = 36; // fewer tiles than this left: the last wall

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
    if (plan.keep) keep = plan.keep;
    else if (id === 'half') keep = function (j) { return E.suitOfIndex(j) === suit || j >= 27; };
    else if (id === 'full') keep = function (j) { return E.suitOfIndex(j) === suit; };
    else if (id === 'straights') keep = function (j) { return j < 27; };
    return { id: id, suit: suit, faan: plan.faan, keep: keep, label: plan.label, reason: plan.reason };
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
        evidence: riskEvidence(v, found.threats, x.index),
      };
    });
    out.defense = found.defense;
    out.folding = found.folding;
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
      notes.push('No wait reaches ' + min + ' faan yet.');
    } else {
      if (selfOnly.length) notes.push(selfOnly.map(function (w) { return name(E.tileIndex(w.tile)); }).join(' and ') + ' wins only on self-draw.');
      if (short.length) notes.push(short.map(function (w) { return name(E.tileIndex(w.tile)); }).join(' and ') + ' is under ' + min + ' faan.');
    }
    return notes;
  }

  function whyDiscard(v, c, pick, route) {
    var i = pick.index;
    if (v.committedSuit && i < 27 && E.suitOfIndex(i) !== v.committedSuit) {
      return 'You chowed ' + SUIT_NAME[v.committedSuit] + ', so other suits are dead weight.';
    }
    var oneSuit = B.suitCommitment(v.ctx, c);
    if (oneSuit && i < 27 && E.suitOfIndex(i) !== oneSuit) {
      return 'You\'re going for ' + SUIT_NAME[oneSuit] + ', so other suits go first.';
    }
    if (B.isPungTile(v.game, i) && c[i] < 2) {
      return pungedReason(i);
    }
    if (route && (route.id === 'triplets' || route.id === 'concealed-triplets') && c[i] <= 2) {
      var left = v.unseen[i];
      // All Triplets needs more copies, so the tile with fewest left goes.
      if (left === 0) return 'None are left, so it can never become a set.';
      if (left === 1) return 'Only one is left, so it\'s the least likely to become a set.';
      return 'It has the fewest copies left of your tiles.';
    }
    if (route && route.id === 'pairs' && c[i] === 1) {
      return 'Seven Pairs keeps pairs, so singles go.';
    }
    if (route && route.id === 'orphans' && !E.isTerminalOrHonorIndex(i)) {
      return 'Thirteen Orphans uses only terminals and honors.';
    }
    if (route && route.id === 'gates' && E.suitOfIndex(i) !== route.suit) {
      return 'Nine Gates uses only ' + SUIT_NAME[route.suit] + '.';
    }
    if (i >= 27 && c[i] === 1 && B.revealedCopies(v.game, i) >= 2) {
      var out = B.revealedCopies(v.game, i);
      return COUNT_WORDS[out] + ' are out, so it can\'t make a set.';
    }
    if (route && route.keep && !route.keep(i)) {
      if (route.reason) return route.reason;
      if (route.id === 'straights') return 'Honors break All Sequences.';
      var suit = SUIT_NAME[route.suit];
      return route.id === 'half' ? 'Not ' + suit + ' or an honor.' : 'Not ' + suit + '.';
    }
    if (c[i] >= 3) return route && route.id === 'pairs' ? 'Seven Pairs uses only two of each.' : 'A spare from your three.';
    if (c[i] === 2) return 'One pair too many.';
    if (pick.lone) {
      if (i >= 27) return 'A lone honor worth no faan to you.';
      return E.isTerminalOrHonorIndex(i) ? 'A lone terminal, the hardest to use.' : 'Nothing connects to it.';
    }
    var r = i % 9;
    if (i < 27 && (r === 0 || r === 8)) return 'Terminals are slow to build on.';
    return 'Your hand needs it least.';
  }

  // Hand-pattern names are wrapped in invisible markers so the game can draw
  // them in the brand red. Their faan is on the Rules sheet, not in the tips.
  var HAND_PATTERNS = [
    'concealed all sequences',
    'concealed triplets',
    'thirteen orphans',
    'small four winds',
    'big four winds',
    'mixed orphans',
    'all terminals',
    'all honors',
    'all sequences',
    'all triplets',
    'seven pairs',
    'nine gates',
    'half flush',
    'full flush',
    'chicken hand',
  ];

  function highlightPatterns(text) {
    var raw = String(text).replace(/[\u0001\u0002]/g, '');
    var lower = raw.toLowerCase();
    var hits = [];
    HAND_PATTERNS.forEach(function (needle) {
      var from = 0;
      while (from < lower.length) {
        var at = lower.indexOf(needle, from);
        if (at < 0) break;
        var nameEnd = at + needle.length;
        var beforeOk = at === 0 || !/[a-z]/i.test(raw.charAt(at - 1));
        var afterOk = nameEnd === raw.length || !/[a-z]/i.test(raw.charAt(nameEnd));
        var overlap = hits.some(function (h) { return at < h.spanEnd && nameEnd > h.at; });
        if (beforeOk && afterOk && !overlap) {
          var existing = raw.slice(nameEnd).match(/^ \(\d+ faan\)/);
          hits.push({
            at: at,
            nameEnd: nameEnd,
            spanEnd: nameEnd + (existing ? existing[0].length : 0),
          });
        }
        from = nameEnd;
      }
    });
    hits.sort(function (a, b) { return a.at - b.at; });
    var out = '';
    var cursor = 0;
    hits.forEach(function (h) {
      out += raw.slice(cursor, h.at) + '\u0001' + raw.slice(h.at, h.nameEnd) + '\u0002';
      cursor = h.spanEnd;
    });
    return out + raw.slice(cursor);
  }

  function stepsText(shanten) {
    if (shanten <= 0) return 'Ready';
    return shanten === 1 ? '1 tile from ready' : shanten + ' tiles from ready';
  }

  function targetText(v, plan, c, nextOut) {
    var r = plan.route;
    if (r.id === 'straights') {
      var keep = liveValueSingles(v, c).filter(function (i) { return i !== nextOut; });
      return 'Concealed All Sequences' + (v.flowerFaan ? '. Flowers make it 3' : '') + '. Don\'t claim' +
        (keep.length ? '. Keep the ' + listNames(keep) + ' in case ' + (keep.length > 1 ? 'one pairs' : 'it pairs') : '');
    }
    if (r.id === 'half') return 'Half Flush in ' + SUIT_NAME[r.suit];
    if (r.id === 'full') return 'Full Flush in ' + SUIT_NAME[r.suit];
    if (r.id === 'triplets') return 'All Triplets. Pung your pairs';
    if (r.id === 'concealed-triplets') return 'Concealed Triplets. Don\'t claim';
    if (r.id === 'pairs') return 'Seven Pairs. Don\'t claim';
    if (r.id === 'orphans') return 'Thirteen Orphans. Don\'t claim';
    if (r.id === 'gates') return 'Nine Gates in ' + SUIT_NAME[r.suit] + '. Don\'t claim';
    if (r.id === 'winds') return 'Big or Small Four Winds. Keep every honor';
    if (r.id === 'honors') return 'All Honors. Pung your honor pairs';
    if (r.id === 'terminals') return 'All Terminals, or Mixed Orphans with honors';
    for (var i = 27; i < 34; i++) {
      if (c[i] === 2 && honorWorth(v, i) && v.unseen[i] >= 1) return (/^[AEIOU]/.test(name(i)) ? 'an ' : 'a ') + name(i) + ' set (' + honorWorth(v, i) + ' faan). Pung it if it\'s thrown';
    }
    return 'a chicken hand';
  }

  // Axis A in words: early on there's room to build; late, finish fast.
  function phaseText(v, threats) {
    var big = threats.some(function (t) { return t.level >= 2 && t.faan >= 5; });
    if (big) return 'Someone shows a big hand, so play for speed.';
    if (v.ctx.turn >= 10 || v.ctx.wallLeft < 32) return 'It\'s late, so finish fast.';
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
    if (B.deadTile(v.game, i)) return 'it\'s already Punged';
    if (t.since[id]) return t.name + ' just threw one';
    if (i >= 27 && 4 - v.unseen[i] >= 3) return 'three are out';
    if (t.flush && E.suitOfIndex(i) !== t.flush && i < 27) return t.name + ' wants ' + SUIT_NAME[t.flush];
    if (i < 27) {
      var r = i % 9, su = E.suitOfIndex(i);
      var low = r >= 3 && t.suji[su][r - 3], high = r <= 5 && t.suji[su][r + 3];
      if ((r < 3 && high) || (r > 5 && low) || (low && high)) {
        return t.name + ' threw the ' + name(low ? i - 3 : i + 3);
      }
      var blocked = [-1, 1].filter(function (d) { var j = r + d; return j >= 0 && j <= 8 && v.unseen[i + d] === 0; })[0];
      if (blocked !== undefined) return 'all four ' + plural(i + blocked) + ' are out';
    }
    if (t.discarded[id]) return t.name + ' threw one earlier';
    return '';
  }

  // What the table shows that makes a tile dangerous, in words, or null.
  // Only these count: a High or Extreme player whose melds are all in the
  // tile's suit, or a player with 3 melds down who hasn't thrown the tile
  // (a live one). A tile any read marks safer never counts.
  function riskEvidence(v, threats, i) {
    if (B.deadTile(v.game, i)) return null;
    var id = E.tileId(i);
    var list = threats.filter(function (t) { return t.level >= 2; }).sort(function (a, b) { return b.level - a.level; });
    for (var k = 0; k < list.length; k++) {
      var t = list[k];
      if (safetyReason(v, t, i)) continue;
      if (i < 27 && t.flush && t.melds >= 1 && E.suitOfIndex(i) === t.flush) {
        return t.name + '\'s melds are all ' + SUIT_NAME[t.flush];
      }
      var live = i >= 27 ? v.unseen[i] >= 2 : v.unseen[i] >= 1;
      if (t.melds >= 3 && live) return t.name + ' has 3 melds down and hasn\'t thrown one';
    }
    return null;
  }

  // "Grace is Extreme (3 melds, Bamboo). Rosa (1 meld), Tak and Bo are High."
  function threatSentence(list) {
    var levels = [];
    var byLevel = {};
    list.forEach(function (t) {
      if (!byLevel[t.levelName]) { byLevel[t.levelName] = []; levels.push(t.levelName); }
      var bits = [];
      if (t.melds) bits.push(t.melds + (t.melds === 1 ? ' meld' : ' melds'));
      if (t.flush) bits.push(SUIT_NAME[t.flush]);
      byLevel[t.levelName].push(t.name + (bits.length ? ' (' + bits.join(', ') + ')' : ''));
    });
    return levels.map(function (lv) {
      var names = byLevel[lv];
      return (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' are ' : names[0] + ' is ') + lv + '.';
    }).join(' ');
  }

  function defenseLine(v, threats, pick, list) {
    var shown = threats.filter(function (t) { return t.level >= 1; }).sort(function (a, b) { return b.level - a.level; });
    var word = dangerWord(pick.loss);
    var tile = E.tileName(pick.tile);
    // Risk is an estimate, so a tile is only called risky with a reason the
    // table shows (riskEvidence). A quiet table never has one.
    if (!shown.length) return '';
    var top = shown[0];
    if (top.level < 2) return pick.evidence ? tile + ' is ' + word + ': ' + pick.evidence + '.' : '';
    // Sorted worst first, so Extreme players are named before High ones.
    var line = threatSentence(shown.filter(function (t) { return t.level >= 2; }));
    if (pick.loss < 0.012) {
      var why = safetyReason(v, top, pick.index);
      line += ' ' + tile + ' is ' + word + (why ? ', ' + why : '') + '.';
    } else if (pick.evidence) {
      line += ' ' + tile + ' is ' + word + ': ' + pick.evidence + '.';
    }
    var worst = list.filter(function (x) { return x.evidence && x.tile !== pick.tile; })
      .sort(function (a, b) { return b.loss - a.loss; })[0];
    if (worst && worst.loss > pick.loss * 2 && worst.loss >= 0.012) {
      line += ' Hold ' + E.tileName(worst.tile) + ': ' + worst.evidence + '.';
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
      ? 'Already Punged, so it\'s safe and useless to you.'
      : 'Already Punged, so nobody can Pung it.';
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
    // jorge-yau's discard order only bends to its value read, so any gap
    // from the top offense pick is defense. Other strategies keep their own
    // order (a target's tiles first), so only their folding counts.
    var defending = (B.id === 'jorge-yau' ? list.defense > 1.25 : list.folding) && offenseTop.tile !== pick.tile;
    var tips = [];

    if (opts.completeButShort) {
      tips.push('Complete, but only ' + opts.completeButShort.faan + ' faan. You need ' + min + '.');
    }
    if (opts.kongs && opts.kongs.length) {
      var kong = B.chooseTurnAction(game, seat, { kongs: opts.kongs });
      if (kong.type === 'kong') { var kongAt = tips.length; tips.push('Kong ' + E.tileName(kong.tile) + '. You get a free tile.'); }
    }

    // 1. What to do.
    var route = pick.plan && pick.plan.route;
    var buildingLimit = route && (route.id === 'orphans' || route.id === 'gates');
    var pungSafe = B.isPungTile(v.game, pick.index) && c[pick.index] < 2;
    // "Play safe" is only said on the last wall, when a win is unlikely:
    // under 16 tiles left and not ready, or under 36 and 2+ tiles from ready.
    // Other defensive picks just say why the tile goes.
    var bestShanten = Math.min.apply(null, list.map(function (x) { return x.shanten; }));
    var wallLeft = v.ctx.wallLeft;
    var hopeless = (wallLeft < 16 && bestShanten >= 1) || (wallLeft < LAST_WALL && bestShanten >= 2);
    var why = pungSafe
      ? pungedReason(pick.index)
      : (defending && hopeless
        ? 'Play safe. The wall is nearly gone and a win is unlikely.'
        : (pick.ready && pick.shanten === 0 && !buildingLimit ? 'It leaves you ready.' : whyDiscard(v, c, pick, route)));
    var discardAt = tips.length;
    var readyPick = !pungSafe && !defending && pick.ready && pick.shanten === 0 && !buildingLimit;
    // A ready discard is explained by the wait that follows.
    tips.push('Discard ' + E.tileName(pick.tile) + '.' + (readyPick ? '' : ' ' + why));

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
      var state = 'Ready, waiting on ' + waitsText(pick.ready) + (wins.length ? ' for ' + Math.min.apply(null, wins) + '+ faan.' : '.');
      var notes = readyNotes(pick.ready, min);
      var liveLeft = pick.ready.waits.reduce(function (n, w) { return n + w.left; }, 0);
      if (liveLeft <= 1) notes.push('Almost none left, so switch waits if you can.');
      tips.push(state + (notes.length ? ' ' + notes.join(' ') : ''));
    } else if (pick.plan) {
      var line = stepsText(buildingLimit ? pick.plan.shanten : pick.shanten) + '. Aim for ' + targetText(v, pick.plan, cAfter, next && next.index) + '.';
      if (route.faan < min - 0.25) line += ' Short of ' + min + ' faan, so look for a flush, All Triplets or a dragon or wind set.';
      else if (!defending) { var phase = phaseText(v, threats); if (phase) line += ' ' + phase; }
      tips.push(line);
    }

    // 3. Threats and how safe the discard is.
    var defense = defenseLine(v, threats, pick, list);
    if (defense) tips.push(defense);

    // 4. What goes next if the next draw doesn't help.
    if (next) tips.push(E.tileName(next.tile) + ' goes next.');

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
      tips.push(E.tileName(opts.tile) + ' completes your hand, but only for ' + opts.completeButShort.faan + ' faan. You need ' + min + '.');
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
    function after(plan, counts, discard, named) {
      var lines = [];
      if (plan && named) {
        lines.push((discard ? 'Then discard ' + E.tileName(discard) + '. ' : '') + stepsText(plan.shanten) + '.');
      } else if (plan) {
        var short = plan.route.faan < min - 0.25 ? ' Still short of ' + min + ' faan.' : '';
        lines.push((discard ? 'Then discard ' + E.tileName(discard) + '. ' : '') + stepsText(plan.shanten) +
          '. Aim for ' + targetText(v, plan, counts) + '.' + short);
      }
      var shown = threats.filter(function (t) { return t.level >= 2; });
      if (shown.length) lines.push(threatSentence(shown));
      return lines;
    }

    if (taken && ti >= 27 && honorWorth(v, ti) && dec.type !== 'chow') {
      var honorCall = spoken(taken);
      tips.push(honorCall.label + '! A ' + E.tileName(opts.tile) + ' set is ' + honorWorth(v, ti) + ' faan.');
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(honorCall.plan, honorCall.counts, honorCall.discard)) }, tips.length - 1);
    }
    if (taken) {
      var call = spoken(taken);
      var route = call.plan.route;
      var fits = route.id === 'half' || route.id === 'full'
        ? 'It builds your ' + (route.id === 'full' ? 'Full Flush' : 'Half Flush') + ' in ' + SUIT_NAME[route.suit]
        : route.id === 'triplets' || route.id === 'concealed-triplets'
          ? 'It builds ' + (route.id === 'concealed-triplets' ? 'Concealed Triplets' : 'All Triplets')
          : 'It speeds up your hand';
      tips.push(call.label + '. ' + fits + (call.faan >= min ? ', about ' + faanWord(call.faan) + '.' : '.'));
      var named = route.id !== 'plain' && route.id !== 'mixed' && /builds/.test(fits);
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(call.plan, call.counts, call.discard, named)) }, tips.length - 1);
    }

    var chowOnly = found.options.every(function (o) { return o.decision.type === 'chow'; });
    if (chowOnly && bestFaan >= min) {
      tips.push(v.concealed
        ? 'Pass. Stay concealed, and save chows for a ready hand or a flush.'
        : 'Pass. Save chows for a ready hand or a flush.');
    } else if (bestFaan < min) {
      tips.push('Pass. Claiming leaves you short of ' + min + ' faan.');
    } else if (v.concealed) {
      tips.push('Pass. Staying concealed is worth 1 faan' +
        (stay && stay.route.id === 'straights' ? ' and keeps All Sequences' : '') + '.');
    } else {
      tips.push('Pass. It doesn\'t help enough.');
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
    // Only called risky when the table shows why (see riskEvidence).
    var risky = chosen.loss >= 0.035 && chosen.loss > top.loss * 1.5 + 0.01 && !!chosen.evidence;
    var good = gap <= Math.max(0.003, Math.abs(top.score) * 0.15);

    if (great) {
      return { kind: 'feedback', action: 'Great discard.', tips: [chosen.tile === top.tile
        ? (mine + ' was the top choice. ' + (hint.why || '')).trim()
        : mine + ' is as good as ' + best + '.'] };
    }
    var tips = ['The coach picks ' + best + '. ' + (hint.why || '')];
    var action;
    if (slows) {
      action = 'That discard slows your hand.';
      var more = chosen.shanten - top.shanten;
      tips.push(mine + ' leaves you ' + stepsWords(chosen.shanten) + ', ' + more + ' more than ' + best + '.');
    } else if (risky) {
      action = 'That discard was risky.';
      tips.push(chosen.evidence + '.');
    } else if (good) {
      action = 'Good discard.';
      tips = ['Both work, but ' + best + ' is slightly better.'];
    } else {
      action = 'There was a better discard.';
      tips.push(mine + ' leaves fewer ways to improve.');
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

  var api = {
    discardFeedback: discardFeedback, claimFeedback: claimFeedback, turnHint: turnHint, claimHint: claimHint,
    rankDiscards: rankDiscards, look: look, highlightPatterns: highlightPatterns,
  };

  // The same coach, saying what `bot` (a strategy from createStrategy)
  // would do. Calls are synchronous, so the bot is swapped in for each call.
  function forStrategy(bot) {
    var out = { strategy: bot && bot.id };
    Object.keys(api).forEach(function (k) {
      var f = api[k];
      out[k] = function () {
        var prev = B;
        B = bot || DEFAULT_BOT;
        try { return f.apply(null, arguments); } finally { B = prev; }
      };
    });
    return out;
  }
  api.forStrategy = forStrategy;
  if (node) module.exports = api;
  else root.MahjongCoach = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
