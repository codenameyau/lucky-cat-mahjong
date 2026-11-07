/* Hint coach for the Play game.

   The bots decide. This module says that same decision in plain words:
   what to do and why, which plan it is, and when the hand is
   actually waiting on a winning tile.
   and how dangerous the opponents look. It keeps the bot's route,
   unless the player throws something else twice in a row: then the
   hints follow the hand those discards point to.

   forStrategy(bot) returns this same coach speaking for another strategy
   (js/mahjong-strategies.js); the default speaks for lucky-cat. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var DEFAULT_BOT = node ? require('./mahjong-lucky-cat.js') : root.MahjongLuckyCat;
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
    else if (id === 'straights' || id === 'runs') keep = function (j) { return j < 27; };
    return { id: id, suit: suit, faan: plan.faan, keep: keep, label: plan.label, reason: plan.reason, hint: plan.hint };
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
        shortSuit: B.shortSuitDiscard(full, x.index, found.ctx.leadPlan),
        evidence: riskEvidence(v, found.threats, x.index),
        ml: x.ml || null, // a learned strategy's read (js/mahjong-ml.js)
        keptPair: x.keptPair != null ? x.keptPair : null, // a pair kept over this single (MahjongBot keepPairs)
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
    var live = winningWaits(ready);
    var list = live.map(function (w) { return name(E.tileIndex(w.tile)); });
    var left = live.reduce(function (n, w) { return n + w.left; }, 0);
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

  // Why this honor goes before another one held the same way (as many in the
  // hand, as many left): winds worth nothing go first, then your 1-faan
  // winds, then dragons, and a wind worth 2 faan to you stays longest
  // (MahjongBot.honorKeepRank).
  function honorReason(v, c, i) {
    var mine = B.honorKeepRank(v.ctx, i);
    var kept = null;
    for (var k = 27; k < 34; k++) {
      if (k === i || c[k] !== c[i] || v.unseen[k] !== v.unseen[i]) continue;
      var r = B.honorKeepRank(v.ctx, k);
      if (r > mine && (!kept || r > kept.r)) kept = { k: k, r: r };
    }
    if (!kept) return '';
    var what = mine === 0 ? name(i) + ' is worth nothing to you' : name(i) + ' is worth 1 faan to you';
    if (kept.r === 3) return what + ', and your ' + name(kept.k) + ' is worth 2 faan, so it stays longest.';
    if (kept.r === 2) return what + '. Your ' + name(kept.k) + ' scores for every player, so keeping it also keeps it from them.';
    return what + ', and your ' + name(kept.k) + ' is worth 1 faan.';
  }

  // Why a pair is broken. Pairs are good to hold: one is the eyes, and each
  // other one can become a pung, claimed from any player. So the coach says
  // what makes this one the exception.
  function pairReason(v, c, i) {
    var left = v.unseen[i];
    var pairs = 0;
    for (var j = 0; j < 34; j++) if (c[j] >= 2) pairs++;
    if (left === 0) {
      return 'No ' + name(i) + ' is left, so this pair can\'t become a pung' + (pairs >= 2 ? ', and another pair can be the eyes.' : '.');
    }
    var declared = v.ctx.declared;
    c[i]--;
    var mine = E.shanten(c, declared);
    c[i]++;
    var single = false;
    for (var k = 0; k < 34 && !single; k++) {
      if (c[k] !== 1) continue;
      c[k]--;
      if (E.shanten(c, declared) <= mine) single = true;
      c[k]++;
    }
    if (!single) return 'Every single you hold would slow the hand more, so this pair is the one to split.';
    return 'Your other tiles are worth more to the hand right now than a pung of ' + name(i) + '.';
  }

  function whyDiscard(v, c, pick, route) {
    var i = pick.index;
    if (v.committedSuit && i < 27 && E.suitOfIndex(i) !== v.committedSuit) {
      return 'You chowed ' + SUIT_NAME[v.committedSuit] + ', so other suits are dead weight.';
    }
    var oneSuit = B.suitCommitment(v.ctx, c);
    if (oneSuit && i < 27 && E.suitOfIndex(i) !== oneSuit) {
      // The plan line names the flush, so this one only says why the tile goes.
      return 'Your hand is keeping ' + SUIT_NAME[oneSuit] + ', so other suits go first.';
    }
    if (B.isPungTile(v.game, i) && c[i] < 2) {
      return pungedReason(i);
    }
    // A tile of the bigger hand in reach (MahjongBot.liveUpgrade) goes only
    // when no copy is left to finish it.
    var up = v.ctx.upgrade;
    var upgradeTile = up && up.favors(i);
    if (upgradeTile && c[i] <= 2 && v.unseen[i] === 0) {
      return 'None are left, so it can\'t help ' + up.label + '.';
    }
    if (up && !upgradeTile && (!route || route.id !== up.id) && up.keep) {
      return up.reason;
    }
    if (route && B.SETS_PLANS.indexOf(route.id) !== -1 && c[i] <= 2) {
      var left = v.unseen[i];
      // All Triplets needs more copies, so the tile with fewest left goes.
      // Say so only when it's true: compare it with the other tiles held the
      // same way (singles with singles, pairs with pairs).
      if (left === 0) return 'None are left, so it can never become a meld.';
      var fewest = true, others = 0;
      for (var j = 0; j < 34; j++) {
        if (j === i || c[j] !== c[i]) continue;
        others++;
        if (v.unseen[j] <= left) fewest = false;
      }
      var kind = c[i] === 2 ? 'pair' : 'single';
      var count = left === 1 ? 'Only one is left' : COUNT_WORDS[left] + ' are left';
      if (others && fewest) return count + ', fewer than any other ' + kind + ' you hold, so it\'s the least likely to become a meld.';
      if (left === 1) return 'Only one is left, so it\'s unlikely to become a meld.';
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
      return COUNT_WORDS[out] + ' are out, so it can\'t make a meld.';
    }
    if (route && route.keep && !route.keep(i)) {
      if (route.reason) return route.reason;
      if (route.id === 'straights') return 'Honors break All Sequences.';
      var suit = SUIT_NAME[route.suit];
      return route.id === 'half' ? 'Not ' + suit + ' or an honor.' : 'Not ' + suit + '.';
    }
    var honor = i >= 27 ? honorReason(v, c, i) : '';
    if (honor) return honor;
    if (c[i] >= 3) return route && route.id === 'pairs' ? 'Seven Pairs uses only two of each.' : 'A spare from your three.';
    if (c[i] === 2) return pairReason(v, c, i);
    if (pick.keptPair != null && c[i] === 1) {
      return 'Keep your ' + name(pick.keptPair) + ' pair: one pair is the eyes, and the others can become pungs.';
    }
    if (pick.shortSuit && i < 27) {
      var su = E.suitOfIndex(i);
      if (neighbors(c, i) === 0) return 'Nothing connects to it, and ' + SUIT_NAME[su] + ' is your shortest suit.';
      if (B.looseTerminal(c, i)) return SUIT_NAME[su] + ' is your shortest suit, so its terminal goes first.';
      return SUIT_NAME[su] + ' is your shortest suit, and it connects the least.';
    }
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
    'eight immortals crossing the sea',
    'seven robbing one',
    'seat and round wind',
    'concealed straights',
    'concealed triplets',
    'thirteen orphans',
    'dragon triplet',
    'dragon quad',
    'four quads',
    'seat wind',
    'round wind',
    'small three dragons',
    'big three dragons',
    'small four winds',
    'big four winds',
    'four winds',
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

  // A wait only counts when a tile still out there wins the hand.
  function winningWaits(ready) {
    if (!ready || !ready.waits) return [];
    return ready.waits.filter(function (w) { return w.left > 0 && (w.ronOk || w.tsumoOk); });
  }

  // Why a flush is in this suit, when the player before you decided it:
  // they're collecting another suit you nearly chose, or throwing this one.
  function leftNote(v, suit) {
    var read = v.ctx.leftRead;
    if (!read) return '';
    var who = v.game.players[read.seat].name;
    var avoid = B.avoidSuit(E.countsOf(v.game.hand.seats[v.seat].hand), v.ctx);
    if (avoid && avoid !== suit) return '. ' + who + ' is collecting ' + SUIT_NAME[avoid] + ', so stay out of it';
    if (read.feeds === suit) return '. ' + who + ' is throwing ' + SUIT_NAME[suit] + ', so you can chow them';
    return '';
  }

  function targetText(v, plan, c, nextOut) {
    var r = plan.route;
    if (r.id === 'straights') {
      // Every bot throws honors first on this hand, all but one honor pair
      // and a dragon nobody has shown.
      var eyes = B.keptHonorPair(c, v.ctx);
      var honors = 0;
      for (var h = 27; h < 34; h++) {
        if (h === nextOut || h === eyes) continue;
        if (B.holdsDragon(v.game, h, 1)) continue;
        honors += c[h] || 0;
      }
      var keepPair = eyes !== null ? '. Keep your ' + name(eyes) + ' pair as the eyes' : '';
      return 'Concealed Straights' + (v.flowerFaan ? '. Flowers make it 3' : '') + '. Don\'t claim' + keepPair +
        (honors ? (eyes !== null ? ', and throw your other honors first' : '. Throw your honors first') : '');
    }
    if (r.id === 'half') return 'Half Flush in ' + SUIT_NAME[r.suit] + leftNote(v, r.suit);
    if (r.id === 'full') return 'Full Flush in ' + SUIT_NAME[r.suit] + leftNote(v, r.suit);
    if (r.id === 'triplets') return 'All Triplets. Pung your pairs';
    if (r.id === 'concealed-triplets') return 'Concealed Triplets. Don\'t claim';
    if (r.id === 'pairs') return 'Seven Pairs. Don\'t claim';
    if (r.id === 'orphans') return 'Thirteen Orphans. Don\'t claim';
    if (r.id === 'gates') return 'Nine Gates in ' + SUIT_NAME[r.suit] + '. Don\'t claim';
    if (r.id === 'winds') return 'Big or Small Four Winds. Keep every honor';
    if (r.id === 'honors') return 'All Honors. Pung your honor pairs';
    if (r.id === 'terminals') return 'All Terminals, or Mixed Orphans with honors';
    if (r.id === 'runs') return 'All Sequences: chows only, no honors';
    if (r.id === 'mixed-orphans') return 'Mixed Orphans on All Triplets. Keep only 1s, 9s and honors, and pung your pairs';
    if (r.id === 'all-terminals') return 'All Terminals. Keep only 1s and 9s, and pung your pairs';
    if (r.id === 'all-honors') return 'All Honors. Keep only honors, and pung your pairs';
    if (r.id === 'small-dragons') return 'Small Three Dragons. Pung two dragons and make the third your eyes';
    if (r.id === 'big-dragons') return 'Big Three Dragons. Pung all three dragons';
    if (r.id === 'small-winds') return 'Small Four Winds. Pung three winds and make the fourth your eyes';
    if (r.id === 'big-winds') return 'Big Four Winds. Pung all four winds';
    if (/^pairs-/.test(r.id)) return r.label + '. Don\'t claim';
    for (var i = 27; i < 34; i++) {
      if (c[i] === 2 && honorWorth(v, i) && v.unseen[i] >= 1) return (/^[AEIOU]/.test(name(i)) ? 'an ' : 'a ') + name(i) + ' meld (' + honorWorth(v, i) + ' faan). Pung it if it\'s thrown';
    }
    return r.faan >= v.game.settings.minFaan ? 'a chicken hand' : 'a dragon or wind meld';
  }

  // The bigger hand the same tiles can still make, when it isn't already
  // the aim: name it, and what to keep for it.
  function upgradeNote(v, route) {
    var up = v.ctx.upgrade;
    if (!up || (route && route.id === up.id)) return '';
    return ' ' + up.label + ' is in reach, so aim for it too: ' + up.hint + '.';
  }

  // Tiles in your hand that can no longer do their job for a hand of pairs or
  // sets, because every copy that could finish them is already out. `c` is the
  // hand after the discard; v.unseen counts copies no one has shown (yours are
  // already out of it).
  //   Seven Pairs: a single with no copy left can't be paired.
  //   Triplets: a pair with no copy left can't be punged, and a single needs
  //   two more.
  function deadNote(v, route, c) {
    if (!route || ['pairs', 'triplets', 'concealed-triplets'].indexOf(route.id) === -1) return '';
    var pairs = route.id === 'pairs';
    var dead = [];
    for (var i = 0; i < 34; i++) {
      if (!c[i]) continue;
      var left = v.unseen[i];
      if (pairs ? (c[i] === 1 && left === 0) : (c[i] === 2 ? left === 0 : c[i] === 1 && left < 2)) dead.push(i);
    }
    if (!dead.length) return '';
    var names = dead.slice(0, 3).map(name);
    var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    var what = pairs ? 'has no copy left to pair with' : 'can\'t become a meld';
    return ' Dead for ' + (pairs ? 'Seven Pairs' : route.id === 'concealed-triplets' ? 'Concealed Triplets' : 'All Triplets') + ': ' + list + (dead.length > 3 ? ' and ' + (dead.length - 3) + ' more' : '') + (dead.length === 1 ? ' ' + what : ', ' + (pairs ? 'none have a copy left to pair with' : 'none can become a meld')) + '. Swap ' + (dead.length === 1 ? 'it' : 'them') + ' for a tile that can still finish.';
  }

  // The hand each coach last named, per seat, so it can say when that changes.
  // (A hint can be asked for twice in a turn, so `prev` stays until the next.)
  var LAST_HAND = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // Discards the player threw instead of the recommended tile, per game.
  // Two in a row means the next hints follow the hand those discards point to.
  var PLAYER_AIM = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function aimBag(game) {
    if (!PLAYER_AIM || !game) return null;
    var bag = PLAYER_AIM.get(game);
    if (!bag) { bag = {}; PLAYER_AIM.set(game, bag); }
    return bag;
  }

  function noteDiscard(game, seat, recommended, thrown) {
    var bag = aimBag(game);
    if (!bag || !game.hand || !recommended || !thrown) return;
    var handNo = game.handNumber || 0;
    var row = bag[seat];
    if (!row || row.hand !== handNo) row = bag[seat] = { hand: handNo, streak: 0, thrown: [] };
    // Taking the named discard before the hand has switched clears the streak.
    // After it has switched, taking that discard confirms the hand.
    if (thrown === recommended) {
      if (row.streak < 2) { row.streak = 0; row.thrown = []; }
      return;
    }
    row.streak++;
    row.thrown.push(thrown);
  }

  function playerDrift(game, seat) {
    var bag = aimBag(game);
    var row = bag && bag[seat];
    if (!row || row.hand !== (game.handNumber || 0) || row.streak < 2) return null;
    return row;
  }

  // A plan claims a tile when that tile belongs to it, whether or not it is
  // still in the hand. Thrown tiles the plan claims are evidence against it.
  function planClaims(plan, index, declared) {
    var route = routeOf(plan);
    if (route && route.keep) return !!route.keep(index);
    var base = plan.counts;
    if (!base) return false;
    var before = plan.shantenFn(base, declared || 0);
    var more = base.slice();
    more[index] = (more[index] || 0) + 1;
    if (plan.shantenFn(more, declared || 0) < before) return true;
    // A tile that is already part of the plan counts too: a drawn set (three
    // dragons) gains nothing from a fourth, but throwing one breaks the plan.
    if (!(base[index] > 0)) return false;
    var fewer = base.slice();
    fewer[index]--;
    return plan.shantenFn(fewer, declared || 0) > before;
  }

  // A flush in a suit the bot has already given up on. Two discards can
  // still show the player wants it, before that suit is long enough to
  // be one of the bot's own plans.
  function flushPlans(counts, ctx) {
    var out = [];
    var melds = ctx.meldSuits || {};
    ['c', 'd', 'b'].forEach(function (su) {
      var blocked = Object.keys(melds).some(function (k) { return k !== su && k !== 'z'; });
      if (blocked) return;
      var n = 0;
      for (var i = 0; i < 27; i++) if (E.suitOfIndex(i) === su) n += counts[i] || 0;
      if (!n) return;
      var half = counts.slice(), full = counts.slice();
      for (var j = 0; j < 34; j++) {
        var inSuit = j < 27 && E.suitOfIndex(j) === su;
        if (!inSuit) full[j] = 0;
        if (!inSuit && j < 27) half[j] = 0;
      }
      out.push({ id: 'half-' + su, suit: su, counts: half, shantenFn: E.standardShanten, faan: 3 });
      if (!melds.z) out.push({ id: 'full-' + su, suit: su, counts: full, shantenFn: E.standardShanten, faan: 7 });
    });
    return out;
  }

  function playerPlan(v, counts, thrown) {
    var declared = v.ctx.declared;
    var seen = {};
    var plans = B.plansFor(counts, v.ctx).concat(flushPlans(counts, v.ctx)).filter(function (p) {
      if (p.upgrade || seen[p.id]) return false;
      seen[p.id] = true;
      return p.shantenFn(p.counts, declared) !== Infinity;
    });
    var best = null, bestScore = 0;
    plans.forEach(function (plan) {
      var score = 0;
      thrown.forEach(function (tile) {
        score += planClaims(plan, E.tileIndex(tile), declared) ? -5 : 4;
      });
      for (var i = 0; i < 34; i++) {
        if (counts[i] && planClaims(plan, i, declared)) score += counts[i];
      }
      if (score > bestScore || (score === bestScore && best && plan.faan > best.faan)) {
        best = plan;
        bestScore = score;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function orderForPlan(list, plan, declared) {
    var off = [], on = [];
    list.forEach(function (x) {
      (planClaims(plan, x.index, declared) ? on : off).push(x);
    });
    if (!off.length) return list;
    var out = off.concat(on);
    out.defense = list.defense;
    out.folding = list.folding;
    out.threats = list.threats;
    return out;
  }

  function playerDiscardWhy(plan, pick) {
    var route = routeOf(plan);
    if (route && route.suit && pick.index < 27 && E.suitOfIndex(pick.index) !== route.suit) {
      return 'Your hand is keeping ' + SUIT_NAME[route.suit] + ', so other suits go first.';
    }
    return 'It doesn\'t help the hand you\'re going for.';
  }

  function routeKey(route) {
    return route.id + (route.suit || '');
  }

  function roundFaan(f) {
    return Math.round(f);
  }

  // Why the hand changed, from what's true now about the hand it left.
  function pivotReason(v, prev, now, cAfter, why) {
    var melds = v.game.hand.seats[v.seat].melds;
    if (v.ctx.lock) return 'you hold 8 or more of its tiles, so it\'s worth keeping them';
    // A strategy that picks its target by expected points (Only Orphans) says so.
    var target = B.targetOf && B.targetOf(v.game, v.seat);
    if (target && target.from && target.at === v.game.hand.seats[v.seat].discards.length) {
      return 'counting the odds of finishing each, it\'s now worth more points on average';
    }
    var old = B.plansFor(cAfter, v.ctx).filter(function (p) { return routeKey(routeOf(p)) === prev.key; })[0];
    var oldSteps = old ? old.shantenFn(old.counts, v.ctx.declared) : prev.steps;
    if (melds.length > prev.melds && (!old || oldSteps === Infinity)) {
      return 'your ' + melds[melds.length - 1].type + ' rules out the old hand';
    }
    if (old && oldSteps === Infinity) return 'the old hand can\'t be finished now';
    var oldFaan = old ? old.faan : prev.faan;
    if (why !== 'gone' && now.faan > oldFaan) {
      return 'it\'s worth ' + roundFaan(now.faan) + ' faan, and the old hand ' + roundFaan(oldFaan);
    }
    var track = v.ctx.track;
    var rival = prev.suit && track && track.seats.filter(function (r) { return r.collecting === prev.suit; })[0];
    if (rival && now.suit !== prev.suit) {
      return v.game.players[rival.seat].name + ' is collecting ' + SUIT_NAME[prev.suit] + ', so the old hand has little chance left';
    }
    if (why === 'gone') return 'the old hand can\'t be finished now';
    return 'the old hand has little chance left, and this one has better odds';
  }

  // One sentence when the coach's hand changes from last turn, with the reason.
  function pivotNote(v, plan, cAfter) {
    var seat = v.game.hand.seats[v.seat];
    if (!LAST_HAND || !plan) return '';
    var route = plan.route;
    var now = {
      key: routeKey(route), suit: route.suit, faan: route.faan, steps: plan.shanten, live: plan.live,
      melds: seat.melds.length, name: targetText(v, plan, cAfter, null).split(/[.:]/)[0],
    };
    var byBot = LAST_HAND.get(seat);
    if (!byBot) LAST_HAND.set(seat, byBot = {});
    var rec = byBot[B.id];
    var turn = seat.discards.length;
    if (!rec) { byBot[B.id] = { turn: turn, now: now, prev: null }; return ''; }
    if (rec.turn !== turn) { rec.prev = rec.now; rec.turn = turn; }
    rec.now = now;
    var prev = rec.prev;
    // Only a real pivot: the first discards keep their options open.
    var pivot = B.planPivot(v.game, v.seat);
    if (!prev || !pivot || prev.key === now.key) return '';
    return ' Pivoting from ' + prev.name + ' to ' + now.name + ': ' + pivotReason(v, prev, now, cAfter, pivot.why) + '.';
  }

  // What the table tracker read from the discards, when it bears on this hand:
  // someone collecting a suit you hold a lot of, or changing hands. Only a
  // strategy that tracks the table has ctx.track.
  // `said` is what the hint already says before this line, so a note that
  // repeats it is left out.
  function tableNote(v, route, line, said) {
    var track = v.ctx.track;
    if (!track) return '';
    var c = E.countsOf(v.game.hand.seats[v.seat].hand);
    var held = function (su) {
      var n = 0;
      for (var i = 0; i < 27; i++) if (E.suitOfIndex(i) === su) n += c[i];
      return n;
    };
    var note = '';
    var after = v.ctx.afterRead;
    if (after && after.keeps) {
      var nextName = v.game.players[after.seat].name;
      var leftKeeps = v.ctx.leftRead && v.ctx.leftRead.keeps === after.keeps;
      if (!leftKeeps && held(after.keeps) >= 4 && line.indexOf(nextName + ' is collecting') === -1) {
        note = nextName + ' is collecting ' + SUIT_NAME[after.keeps] +
          (after.locked ? ', and their chow locks that suit' : '') + ', so keep it.';
      }
    }
    var own = v.ctx.ownRead;
    var keeping = route && route.suit && (said || '').indexOf('keeping ' + SUIT_NAME[route.suit]) !== -1;
    if (!note && !keeping && own && own.n >= 4 && route && route.suit && (route.id === 'half' || route.id === 'full') && own.by[route.suit] / own.n <= 0.1) {
      note = 'You\'ve kept your ' + SUIT_NAME[route.suit] + ' so far, so stay on it.';
    }
    track.seats.forEach(function (r) {
      var who = v.game.players[r.seat].name;
      if (note || line.indexOf(who + ' is collecting') !== -1) return;
      var su = r.collecting;
      if (su && route && route.suit === su) note = who + ' is collecting ' + SUIT_NAME[su] + ' too, so those tiles will be slow.';
      else if (su && held(su) >= 6) note = who + ' is collecting ' + SUIT_NAME[su] + ', so stay out of it.';
    });
    if (note) return ' ' + note;
    track.seats.forEach(function (r) {
      if (note || !r.pivot) return;
      var who = v.game.players[r.seat].name;
      note = r.pivot.from
        ? who + ' has pivoted out of ' + SUIT_NAME[r.pivot.from] + ': they kept it early and are throwing it now.'
        : who + ' has started keeping ' + SUIT_NAME[r.pivot.to] + ': they threw it early and have stopped.';
    });
    return note ? ' ' + note : '';
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

  // The one number suit a player's open melds are in, and whether honors
  // are among them: "all Bamboo", "Bamboo and honors", "all honors", or ''
  // when the melds cover two suits. Read from the melds themselves, not the
  // bots' flush estimate.
  function meldSuitText(game, seat) {
    var suits = {}, honors = false;
    // Only shown melds: another player's concealed kong could be any tile.
    var melds = game.hand.seats[seat].melds;
    if (melds.some(function (m) { return m.concealed; })) return '';
    melds.forEach(function (m) {
      var i = E.tileIndex(m.tiles[0]);
      if (i >= 27) honors = true; else suits[E.suitOfIndex(i)] = true;
    });
    var nums = Object.keys(suits);
    if (nums.length === 1) return honors ? SUIT_NAME[nums[0]] + ' and honors' : 'all ' + SUIT_NAME[nums[0]];
    if (!nums.length && honors) return 'all honors';
    return '';
  }

  // What the table shows that makes a tile dangerous, in words, or null.
  // Only these count: a High or Extreme player whose melds are all in the
  // tile's suit (with or without honors), or a player with 3 melds down who hasn't thrown the tile
  // (a live one). A tile any read marks safer never counts.
  function riskEvidence(v, threats, i) {
    if (B.deadTile(v.game, i)) return null;
    var id = E.tileId(i);
    var list = threats.filter(function (t) { return t.level >= 2; }).sort(function (a, b) { return b.level - a.level; });
    for (var k = 0; k < list.length; k++) {
      var t = list[k];
      if (safetyReason(v, t, i)) continue;
      var sure = sureHand(v.game, t.seat);
      if (i < 27 && sure && sure.suit === E.suitOfIndex(i)) return t.name + ' is almost certainly going for ' + sure.text;
    }
    return null;
  }

  // What the table shows about the players worth watching, in plain words:
  // The hand an opponent is going for, only once the table makes it close to
  // certain (checked over simulated games: these held in about 95% of hands or
  // better). Said as a deduction, never as a restatement of their melds.
  //   A flush: three or more melds in one suit (honors allowed) and not one
  //   tile of that suit thrown.
  //   All Triplets: four pungs or kongs, so the hand needs only a pair.
  function sureHand(game, seat) {
    var s = game.hand.seats[seat];
    var melds = s.melds;
    if (melds.length < 3) return null;
    // A concealed kong could be any tile, so nothing about its suit is sure.
    var hidden = melds.some(function (m) { return m.concealed; });
    var suits = {}, honors = false;
    melds.forEach(function (m) {
      if (m.concealed) return;
      var i = E.tileIndex(m.tiles[0]);
      if (i >= 27) honors = true; else suits[E.suitOfIndex(i)] = true;
    });
    var nums = Object.keys(suits);
    if (nums.length === 1 && !hidden) {
      var su = nums[0];
      var thrown = s.discards.filter(function (d) { return E.suitOfIndex(E.tileIndex(d.tile)) === su; }).length;
      if (thrown === 0) {
        return { suit: su, kind: 'flush', text: 'a ' + (honors ? SUIT_NAME[su] + ' Half Flush' : SUIT_NAME[su] + ' flush') };
      }
    }
    if (melds.length >= 4 && melds.every(function (m) { return m.type !== 'chow'; })) {
      return { suit: null, kind: 'triplets', text: 'All Triplets' };
    }
    return null;
  }

  function threatSentence(game, list) {
    return list.map(function (t) {
      var sure = sureHand(game, t.seat);
      if (!sure) return '';
      return sure.kind === 'flush'
        ? t.name + ' is almost certainly going for ' + sure.text + ', so any ' + SUIT_NAME[sure.suit] + ' you throw is a likely deal-in.'
        : t.name + ' is almost certainly going for All Triplets with four melds down: they are one tile from winning, so play very safe.';
    }).filter(Boolean).join(' ');
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
    var line = threatSentence(v.game, shown.filter(function (t) { return t.level >= 2; }));
    var add = function (more) { line += (line ? ' ' : '') + more; };
    if (pick.loss < 0.012) {
      var why = safetyReason(v, top, pick.index);
      add(tile + ' is ' + word + (why ? ', ' + why : '') + '.');
    } else if (pick.evidence) {
      add(tile + ' is ' + word + ': ' + pick.evidence + '.');
    }
    var worst = list.filter(function (x) { return x.evidence && x.tile !== pick.tile; })
      .sort(function (a, b) { return b.loss - a.loss; })[0];
    if (worst && worst.loss > pick.loss * 2 && worst.loss >= 0.012) {
      add('Hold ' + E.tileName(worst.tile) + ': ' + worst.evidence + '.');
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

  // Every hint and every piece of feedback fits four lines on a phone: at
  // most MAX_TEXT characters, the action and the tips together. When there
  // is more to say, the least useful tips go first: the last ones, then the
  // model's line, then the first tip (the reason). Then sentences, from the end.
  var MAX_TEXT = 400;

  function plain(t) { return String(t || '').replace(/[\u0001\u0002]/g, ''); }

  function textLength(h) {
    return [h.action].concat(h.tips || []).map(plain).filter(Boolean).join(' ').length;
  }

  // Cut to whole sentences that fit in n characters.
  function clip(t, n) {
    if (plain(t).length <= n) return t;
    var parts = String(t).match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [t];
    var out = '';
    for (var k = 0; k < parts.length; k++) {
      if (plain(out + parts[k]).trim().length > n) break;
      out += parts[k];
    }
    if (out.trim()) return out.trim();
    var cut = plain(t).slice(0, n - 1);
    return cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length) + '\u2026';
  }

  function fit(h) {
    if (!h || !h.tips) return h;
    var isModel = function (t) { return /^(On average, )?[Tt]he model expects /.test(plain(t)); };
    while (textLength(h) > MAX_TEXT && h.tips.length) {
      var drop = -1;
      for (var k = h.tips.length - 1; k >= 1 && drop === -1; k--) if (!isModel(h.tips[k])) drop = k;
      for (var j = h.tips.length - 1; j >= 1 && drop === -1; j--) drop = j;
      if (drop === -1) {
        // Only the reason is left: keep what fits of it.
        var room = MAX_TEXT - plain(h.action).length - 1;
        if (room > 40) h.tips[0] = clip(h.tips[0], room);
        else h.tips.splice(0, 1);
        if (textLength(h) <= MAX_TEXT) break;
        if (h.tips.length) { h.tips.splice(0, 1); continue; }
        break;
      }
      h.tips.splice(drop, 1);
    }
    if (textLength(h) > MAX_TEXT) h.action = clip(h.action, MAX_TEXT);
    if (h.model && h.tips.indexOf(h.model) === -1) h.model = null;
    return h;
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
   * 5. Hints: 1) what to do, 2) where the hand stands, 3) the threats.
   *    A hand that is not waiting on a winning tile does not get a
   *    "tiles from ready" count. (They don't say which tile to drop next.)
   * ------------------------------------------------------------------ */

  // Situational bonuses and flowers are how the hand was won, not the pattern.
  var NOT_A_PATTERN = {
    'Self-Draw': 1, 'Concealed': 1, 'Win on Last Tile': 1, 'Robbing the Kong': 1,
    'Win by Kong': 1, 'Win by Double Kong': 1, 'Heavenly Hand': 1, 'Earthly Hand': 1,
    'No Flowers': 1, 'Seat Flower': 1, 'Seat Season': 1, 'Four Flowers': 1, 'Four Seasons': 1,
  };

  function handPatternPhrase(win) {
    var names = [];
    (win.items || []).forEach(function (it) {
      if (it && it.name && !NOT_A_PATTERN[it.name]) names.push(it.name);
    });
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }

  // One sentence. The pattern names are drawn bold red by the table.
  function winDeclaration(win, how) {
    var pattern = handPatternPhrase(win);
    if (pattern) return 'Mahjong! Win ' + how + ' with ' + pattern + ' for ' + win.faan + ' faan!';
    return 'Mahjong! Win ' + how + ' with ' + win.faan + ' faan!';
  }

  function turnHint(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) return { kind: 'win', action: winDeclaration(opts.win, 'by self-draw'), tips: [] };
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var list = rankDiscards(v, hand);
    var drift = playerDrift(game, seat);
    var followed = drift ? playerPlan(v, c, drift.thrown) : null;
    if (followed) {
      list = orderForPlan(list, followed, v.ctx.declared);
      // Following your plan never beats a discard that leaves the hand ready.
      var readyAt = list.filter(function (x) { return x.shanten === 0 && x.ready; });
      if (readyAt.length && !list[0].ready) {
        var reordered = readyAt.concat(list.filter(function (x) { return readyAt.indexOf(x) === -1; }));
        reordered.defense = list.defense; reordered.folding = list.folding; reordered.threats = list.threats;
        list = reordered;
      }
    }
    var threats = list.threats;
    var pick = list[0];
    var offenseTop = list.slice().sort(function (a, b) { return b.offense - a.offense; })[0];
    // lucky-cat's discard order only bends to its value read, so any gap
    // from the top offense pick is defense. Other strategies keep their own
    // order (a target's tiles first), so only their folding counts.
    var defending = (B.id === 'lucky-cat' ? list.defense > 1.25 : list.folding) && offenseTop.tile !== pick.tile;
    var tips = [];

    if (opts.completeButShort) {
      tips.push('Complete, but only ' + opts.completeButShort.faan + ' faan. You need ' + min + '.');
    }
    var kongRead = null;
    if (opts.kongs && opts.kongs.length) {
      // A learned strategy weighs each kong against the best discard.
      kongRead = B.kongChoice ? B.kongChoice(game, seat, { kongs: opts.kongs }) : null;
      var kong = kongRead ? kongRead.decision : B.chooseTurnAction(game, seat, { kongs: opts.kongs });
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
    var winning = winningWaits(pick.ready);
    var canWin = winning.length > 0 && pick.shanten === 0 && !buildingLimit;
    var why = pungSafe
      ? pungedReason(pick.index)
      : (followed && !canWin
        ? playerDiscardWhy(followed, pick)
        : ((defending || list.folding) && hopeless
          ? 'Play safe. The wall is nearly gone and a win is unlikely.'
          : (canWin ? 'It leaves you ready.' : whyDiscard(v, c, pick, route))));
    var discardAt = tips.length;
    var readyPick = !pungSafe && !defending && canWin;
    // A ready discard is explained by the wait that follows.
    tips.push('Discard ' + E.tileName(pick.tile) + '.' + (readyPick ? '' : ' ' + why));

    // 2. Where the hand stands.
    var cAfter = c.slice();
    cAfter[pick.index]--;
    // Folding, the discard isn't building anything, so the hand hasn't changed.
    var shifted = list.folding || followed ? '' : pivotNote(v, pick.plan, cAfter);
    if (canWin) {
      var wins = winning.filter(function (w) { return w.ronOk; }).map(function (w) { return w.ronFaan; });
      var state = 'Ready, waiting on ' + waitsText(pick.ready) + (wins.length ? ' for ' + Math.min.apply(null, wins) + '+ faan.' : '.');
      var notes = readyNotes(pick.ready, min);
      var liveLeft = winning.reduce(function (n, w) { return n + w.left; }, 0);
      if (liveLeft <= 1) notes.push('Almost none left, so switch waits if you can.');
      var keptSuit = v.ctx.afterRead && route && route.suit === v.ctx.afterRead.keeps ? tableNote(v, route, state) : '';
      tips.push(state + (shifted ? shifted : '') + (notes.length ? ' ' + notes.join(' ') : '') + keptSuit);
    } else if (pick.plan || followed) {
      var spoken = followed ? { route: routeOf(followed) } : pick.plan;
      var speak = spoken.route;
      var line = (followed ? 'You\'re going for ' : 'Go for ') + targetText(v, spoken, cAfter, null) + '.';
      line += shifted;
      line += deadNote(v, speak, cAfter);
      // A complete shape that doesn't score isn't ready, so say why.
      if (pick.ready) line = 'Complete, but under ' + min + ' faan. ' + line;
      var sure = B.baseFaan(v.ctx);
      // Concealed Straights says flowers make it 3, so they count here too.
      var faanNow = speak ? speak.faan + (speak.id === 'straights' ? v.flowerFaan || 0 : 0) : 0;
      var short = speak && faanNow < min - 0.25;
      if (short && B.cheapWin(v.ctx)) {
        // Flowers (and melds) already give all but the last faan.
        line += ' Your flowers and melds give ' + sure + ' faan, so one more wins: a self-draw, All Sequences, or a dragon or wind meld.';
      } else if (short) {
        line += pick.ready ? ' To reach ' + min + ' faan, add a flush, All Triplets or a dragon or wind meld.'
          : ' You\'re short of ' + min + ' faan, so add a flush, All Triplets or a dragon or wind meld.';
      }
      if (!followed) line += upgradeNote(v, route);
      line += tableNote(v, speak, line, tips.join(' '));
      tips.push(line);
    }

    // 3. Threats and how safe the discard is.
    var defense = defenseLine(v, threats, pick, list);
    if (defense) tips.push(defense);

    // 4. A learned strategy says what it expects, and why this tile.
    // With a kong on offer, that choice comes first: when there isn't room
    // for both, the discard's line goes.
    var kongLine = kongModelLine(kongRead);
    if (kongLine) tips.push(kongLine);
    var learned = modelLine(list, pick);
    if (learned) tips.push(learned);

    var worry = threats.filter(function (t) { return t.level >= 2; }).sort(function (a, b) { return b.level - a.level; })[0];
    return lead({
      kind: 'discard', tile: pick.tile, tips: tips, candidates: list,
      why: why, threatName: worry ? worry.name : null, model: learned || null,
    }, kongAt !== undefined ? kongAt : discardAt);
  }

  // What a learned strategy (js/mahjong-ml.js) expects from the discard, in
  // points, and the feature groups that put it ahead of the next best.
  var GROUP_WORDS = {
    hand: 'the tiles you keep', discard: 'the tile itself', table: 'what the table shows',
    context: 'the wall and your seat', speed: 'speed', value: 'hand value', safety: 'safety',
  };

  function pointsText(n) {
    var r = Math.round(n);
    return (r > 0 ? '+' : r < 0 ? '\u2212' : '') + Math.abs(r).toLocaleString('en-US');
  }

  // The model's expected value is a score, not a payout, so it says "+23 score",
  // never "+23" alone and never "points" (which are what a win pays).
  function pointsWord(n) {
    return pointsText(n) + ' score';
  }

  // "an 8% chance to win", "a 12% chance to win", "almost no chance to win".
  function chance(p, what) {
    if (p < 0.01) return 'almost no chance to ' + what;
    var n = pct(p);
    return (/^(8|11|18)(\D|$)|^8\d/.test(n) ? 'an ' : 'a ') + n + ' chance to ' + what;
  }

  function pct(p) {
    var n = 100 * p;
    return (n < 1 && n > 0 ? '<1' : String(Math.round(n))) + '%';
  }

  // Lucky Cat's network (ml.policy: the share it gives each move) learned
  // only from hands it won, so its line says how sure it is.
  function policyLine(list, pick, m) {
    var line = 'Lucky Cat\'s network plays this discard ' + pct(m.policy) + ' of the time';
    var next = list.filter(function (x) { return x !== pick && x.ml; })
      .sort(function (a, b) { return b.ml.policy - a.ml.policy; })[0];
    if (next && next.ml.policy >= 0.005) line += '. Next most likely is ' + E.tileName(next.tile) + ': ' + pct(next.ml.policy) + ' of the time';
    return line + '.';
  }

  function modelLine(list, pick) {
    var m = pick && pick.ml;
    if (!m) return '';
    if (m.policy != null) return policyLine(list, pick, m);
    var line = 'The model expects ' + pointsWord(m.ev) + ' on average from this discard, with ' + chance(m.pWin, 'win') +
      (m.pWin >= 0.01 ? ' (about ' + Math.round(m.avgWin).toLocaleString('en-US') + ' points)' : '') + '.';
    var next = list.filter(function (x) { return x !== pick && x.ml && x.ml.choice !== false; })
      .sort(function (a, b) { return b.ml.ev - a.ml.ev; })[0];
    if (next) line += ' Next best discard is ' + E.tileName(next.tile) + ': ' + pointsWord(next.ml.ev) + '.';
    var why = (m.why || []).filter(function (g) { return g.points >= 1; }).slice(0, 2);
    if (why.length) line += ' This one comes out ahead on ' + why.map(function (g) { return GROUP_WORDS[g.group] || g.group; }).join(' and on ') + '.';
    return line;
  }

  // What a learned strategy expects from each choice of a claim or a kong
  // (read: { choices: [{ decision, ml }], pick, foundation }), said as
  // "if you ...": "if you pass", "if you chow 3-4-5", "if you kong Red Dragon".
  function ifYou(decision, tile) {
    if (decision.type === 'pass') return 'if you pass';
    if (decision.type === 'discard') return 'if you skip the kong';
    if (decision.type === 'chow') {
      var tiles = E.sortTiles(decision.tiles.concat([tile]));
      return 'if you chow ' + tiles.map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-');
    }
    return 'if you ' + decision.type + (decision.tile ? ' ' + E.tileName(decision.tile) : '');
  }

  function choicesLine(read, tile) {
    if (!read || !read.choices || read.choices.length < 2) return '';
    var pick = read.choices[read.pick];
    if (pick.ml.policy != null) {
      var rest = read.choices.filter(function (x) { return x !== pick; })
        .sort(function (a, b) { return b.ml.policy - a.ml.policy; }).slice(0, 2);
      var act = function (x) { return ifYou(x.decision, tile).replace(/^if you /, '') + ' ' + pct(x.ml.policy) + ' of the time'; };
      return 'Lucky Cat\'s network would ' + [pick].concat(rest).map(act).join(', and ') + '.';
    }
    var ranked = [pick].concat(read.choices.filter(function (x) { return x !== pick; })
      .sort(function (a, b) { return b.ml.ev - a.ml.ev; }).slice(0, 2));
    var said = ranked.map(function (x) { return pointsWord(x.ml.ev) + ' ' + ifYou(x.decision, tile); });
    var line = 'On average, the model expects ' + said[0] +
      (said.length > 2 ? ', ' + said.slice(1, -1).join(', ') + ', and ' + said[said.length - 1] : ' and ' + said[1]) + '. ' +
      'That gives ' + chance(pick.ml.pWin, 'win') + '.';
    if (read.pick !== read.foundation) {
      line += ' The usual call here would be to ' + ifYou(read.choices[read.foundation].decision, tile).replace(/^if you /, '') + ', but the model expects less from it.';
    }
    return line;
  }

  function kongModelLine(read) {
    return choicesLine(read, null);
  }

  function chowLabel(pair, tile) {
    var tiles = E.sortTiles(pair.concat([tile]));
    var su = E.suitOfIndex(E.tileIndex(tile));
    return 'Chow ' + tiles.map(function (id) { return E.rankOfIndex(E.tileIndex(id)); }).join('-') + ' ' + SUIT_NAME[su];
  }

  var lastClaim = null; // what the strategy decided, for the model line

  function claimHint(game, seat, opts) {
    lastClaim = null;
    var hint = claimAdvice(game, seat, opts);
    var read = lastClaim && lastClaim.found && lastClaim.found.ml;
    var line = choicesLine(read, opts.tile);
    if (line) { hint.tips.push(line); hint.model = line; }
    return hint;
  }

  function claimAdvice(game, seat, opts) {
    var min = game.settings.minFaan;
    if (opts.win) {
      var how = opts.robKong ? 'by robbing the kong' : 'on ' + E.tileName(opts.tile);
      return { kind: 'claim', decision: { type: 'win' }, action: winDeclaration(opts.win, how), tips: [] };
    }
    var v = look(game, seat);
    var hand = game.hand.seats[seat].hand;
    var c = E.countsOf(hand);
    var drift = playerDrift(game, seat);
    var followed = drift ? playerPlan(v, c, drift.thrown) : null;
    var ti = E.tileIndex(opts.tile);
    var decided = B.decideClaim(game, seat, opts);
    lastClaim = decided;
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
        ready: option.analysis.ready,
      };
    }

    // Where the hand stands afterwards, and the threats. On a pass this is
    // the hand as it is; on a claim it is the hand after the call and its discard.
    function after(plan, counts, discard, named, ready) {
      var lines = [];
      var waiting = winningWaits(ready);
      if (followed && !waiting.length) {
        if (discard && !planClaims(followed, E.tileIndex(discard), v.ctx.declared)) discard = null;
        if (discard) lines.push('Then discard ' + E.tileName(discard) + '.');
        lines.push('You\'re going for ' + targetText(v, { route: routeOf(followed) }, counts) + '.');
        var shown = threats.filter(function (t) { return t.level >= 2; });
        var said = threatSentence(v.game, shown);
        if (said) lines.push(said);
        return lines;
      }
      if (waiting.length) {
        if (discard) lines.push('Then discard ' + E.tileName(discard) + '.');
        var faan = waiting.filter(function (w) { return w.ronOk; }).map(function (w) { return w.ronFaan; });
        lines.push('Ready, waiting on ' + waitsText(ready) + (faan.length ? ' for ' + Math.min.apply(null, faan) + '+ faan.' : '.'));
      } else if (plan && named) {
        if (discard) lines.push('Then discard ' + E.tileName(discard) + '.');
      } else if (plan) {
        var short = plan.route.faan < min - 0.25 ? ' Still short of ' + min + ' faan.' : '';
        lines.push((discard ? 'Then discard ' + E.tileName(discard) + '. ' : '') +
          'Go for ' + targetText(v, plan, counts) + '.' + short);
      }
      var shown = threats.filter(function (t) { return t.level >= 2; });
      var said = threatSentence(v.game, shown);
      if (said) lines.push(said);
      return lines;
    }

    if (followed && dec.type !== 'pass' && !planClaims(followed, ti, v.ctx.declared)) {
      tips.push('Pass. It doesn\'t help the hand you\'re going for.');
      return lead({ kind: 'claim', decision: { type: 'pass' }, tips: tips.concat(after(stay, c, null, false, found.stay && found.stay.ready)) }, tips.length - 1);
    }
    if (taken && ti >= 27 && honorWorth(v, ti) && dec.type !== 'chow') {
      var honorCall = spoken(taken);
      tips.push(honorCall.label + '! A ' + E.tileName(opts.tile) + ' meld is ' + honorWorth(v, ti) + ' faan.');
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(honorCall.plan, honorCall.counts, honorCall.discard, false, honorCall.ready)) }, tips.length - 1);
    }
    if (taken) {
      var call = spoken(taken);
      if (followed) {
        tips.push(call.label + '. It helps the hand you\'re going for.');
        return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(call.plan, call.counts, call.discard, true, call.ready)) }, tips.length - 1);
      }
      var route = call.plan.route;
      var fits = route.id === 'half' || route.id === 'full'
        ? 'It builds your ' + (route.id === 'full' ? 'Full Flush' : 'Half Flush') + ' in ' + SUIT_NAME[route.suit]
        : route.id === 'triplets' || route.id === 'concealed-triplets'
          ? 'It builds ' + (route.id === 'concealed-triplets' ? 'Concealed Triplets' : 'All Triplets')
          : 'It speeds up your hand';
      tips.push(call.label + '. ' + fits + (call.faan >= min ? ', about ' + faanWord(call.faan) + '.' : '.'));
      var named = route.id !== 'plain' && route.id !== 'mixed' && /builds/.test(fits);
      return lead({ kind: 'claim', decision: dec, tips: tips.concat(after(call.plan, call.counts, call.discard, named, call.ready)) }, tips.length - 1);
    }

    var chowOnly = found.options.every(function (o) { return o.decision.type === 'chow'; });
    var tileSuit = ti < 27 ? E.suitOfIndex(ti) : null;
    var shortSuit = tileSuit && opts.chows.length && !B.chowSuitReady(v.ctx, c, tileSuit);
    // A strategy with a target that claims nothing (Only Orphans) says so.
    var target = B.targetOf && B.targetOf(game, seat);
    if (target && target.id !== 'major-sets' && (opts.pung || opts.kong)) {
      tips.push('Pass. Your target, ' + target.label + ', claims nothing but the winning tile.');
    } else if (target && opts.chows.length && chowOnly) {
      tips.push('Pass. Only Orphans never chows.');
    } else if (shortSuit && chowOnly && bestFaan >= min && !v.concealed) {
      tips.push('Pass. Hold 7 ' + SUIT_NAME[tileSuit] + ' before you chow that suit.');
    } else if (chowOnly && bestFaan >= min) {
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
    return lead({ kind: 'claim', decision: { type: 'pass' }, tips: tips.concat(after(stay, c, null, false, found.stay && found.stay.ready)) }, tips.length - 1);
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
    var mine = E.tileName(tile), best = E.tileName(top.tile);
    if (top.ml && chosen.ml) return modelFeedback(hint, top, chosen, mine, best);
    var gap = top.score - chosen.score;
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

  // How the two discards' chances to win differ, when they differ by a point or more.
  function odds(best, a, b) {
    if (Math.abs(a.pWin - b.pWin) < 0.01) return '';
    return ' With ' + best + ', your chance to win is ' + pct(a.pWin) + ' instead of ' + pct(b.pWin) + '.';
  }

  // A learned strategy weighs discards in expected points, so feedback
  // compares those.
  function policyFeedback(hint, top, chosen, mine, best) {
    var steps = chosen.shanten > top.shanten;
    if (chosen.tile === top.tile || (!steps && chosen.ml.policy >= top.ml.policy * 0.8)) {
      var tips = [chosen.tile === top.tile
        ? (mine + ' was the top choice. ' + (hint.why || '')).trim()
        : mine + ' is as good as ' + best + '.'];
      if (chosen.tile === top.tile && hint.model) tips.push(hint.model);
      return { kind: 'feedback', action: 'Great discard.', tips: tips };
    }
    var out = ['The coach picks ' + best + '. ' + (hint.why || ''),
      'Lucky Cat\'s network plays ' + best + ' ' + pct(top.ml.policy) + ' of the time, and ' + mine + ' ' + pct(chosen.ml.policy) + ' of the time.'];
    var action = steps ? 'That discard slows your hand.'
      : chosen.ml.policy >= top.ml.policy * 0.4 ? 'Good discard.' : 'There was a better discard.';
    return { kind: 'feedback', action: action, tips: out.map(function (t) { return t.trim(); }) };
  }

  function modelFeedback(hint, top, chosen, mine, best) {
    if (top.ml.policy != null) return policyFeedback(hint, top, chosen, mine, best);
    var diff = top.ml.ev - chosen.ml.ev;
    if (chosen.tile === top.tile || diff <= Math.max(5, Math.abs(top.ml.ev) * 0.03)) {
      var tips = [chosen.tile === top.tile
        ? (mine + ' was the top choice. ' + (hint.why || '')).trim()
        : mine + ' is as good as ' + best + '.'];
      if (chosen.tile === top.tile && hint.model) tips.push(hint.model);
      return { kind: 'feedback', action: 'Great discard.', tips: tips };
    }
    var out = ['The coach picks ' + best + '. ' + (hint.why || '')];
    out.push('The model expects ' + pointsWord(top.ml.ev) + ' on average from ' + best + ', and ' + pointsWord(chosen.ml.ev) +
      ' from ' + mine + '.' + odds(best, top.ml, chosen.ml));
    var action = chosen.shanten > top.shanten ? 'That discard slows your hand.'
      : chosen.ml.pDealIn > top.ml.pDealIn + 0.02 ? 'That discard was risky.'
      : diff <= Math.max(20, Math.abs(top.ml.ev) * 0.1) ? 'Good discard.' : 'There was a better discard.';
    return { kind: 'feedback', action: action, tips: out.map(function (t) { return t.trim(); }) };
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
    var coachSays = hint.decision.type === 'win' ? 'Win' : (hint.action || '').replace(/[.!]$/, '');
    if (same) {
      return { kind: 'feedback', action: decision.type === 'pass' ? 'Good pass.' : 'Good call.', tips: [reason].filter(Boolean) };
    }
    var did = decision.type === 'pass' ? 'You passed.' : 'You took the ' + claimName(decision) + '.';
    var action = coachType === 'pass' ? 'The coach would have passed.' : 'The coach would have called ' + coachSays + '.';
    return { kind: 'feedback', action: action, tips: [did + ' ' + reason] };
  }

  function fitted(f) {
    return function () { return fit(f.apply(null, arguments)); };
  }

  var api = {
    discardFeedback: fitted(discardFeedback), claimFeedback: fitted(claimFeedback), noteDiscard: noteDiscard,
    turnHint: fitted(turnHint), claimHint: fitted(claimHint), MAX_TEXT: MAX_TEXT, fit: fit,
    rankDiscards: rankDiscards, look: look, highlightPatterns: highlightPatterns,
  };

  // The same coach, saying what `bot` (a strategy from createStrategy)
  // would do. Calls are synchronous, so the bot is swapped in for each call.
  function forStrategy(bot) {
    var out = { strategy: bot && bot.id };
    Object.keys(api).forEach(function (k) {
      var f = api[k];
      if (typeof f !== 'function' || k === 'fit') { out[k] = f; return; }
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
