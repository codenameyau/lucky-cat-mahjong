/* Playback analysis: what the coach says about a finished hand once every
   hand is face up.

   The live coach only knows what your seat can see. A playback has the whole
   table, so this reads the hand the way a strong player would with the
   answers in hand:
     - Your discards: how fast the hand gets, how many of the tiles that help
       are really left in the wall (and how many sit in other hands), whether
       a different tile kept the hand closer or the wait wider, and whether
       anyone could win on it.
     - Everyone's reads: who is ready and on what, which of your tiles would
       win for them, and whether racing or folding made sense.
     - Passes: a win you could have called, or a call that makes you ready.
     - Claims, and the end of the hand.
   Every note is one entry for the coach panel: { kind, action, detail, hand,
   move, step }, where `step` is the number of recorded actions after which it
   shows. createAnalyst(rec) walks the recording a little at a time. */

(function (root) {
  "use strict";

  var node = typeof module !== "undefined" && module.exports;
  var E = node ? require("./mahjong-engine.js") : root.MahjongEngine;

  var SUIT_NAMES = { c: "Characters", d: "Circles", b: "Bamboos" };
  var DRAGONS = [31, 32, 33];

  function tn(i) { return E.tileName(E.tileId(i)); }
  function names(list, max) {
    max = max || 5;
    var shown = list.slice(0, max).map(tn);
    var text = shown.length > 1 ? shown.slice(0, -1).join(", ") + " or " + shown[shown.length - 1] : shown[0] || "";
    return list.length > max ? shown.join(", ") + ", and " + (list.length - max) + " more" : text;
  }
  function who(game, seat) { return seat === 0 ? "You" : game.players[seat].name; }
  function whose(game, seat) { return seat === 0 ? "yours" : game.players[seat].name + "'s"; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many || one + "s"); }
  function faanText(n) { return n + " faan"; }
  function minFaan(game) { return game.settings.minFaan; }

  /* ------------------------------------------------------------------ *
   * 1. What the table holds
   * ------------------------------------------------------------------ */

  // How many of each tile are left in the wall, and in the other hands.
  function whereTiles(game, me) {
    var wall = new Array(34).fill(0), others = new Array(34).fill(0);
    game.hand.wall.forEach(function (id) { wall[E.tileIndex(id)]++; });
    game.hand.seats.forEach(function (s, k) {
      if (k === me) return;
      s.hand.forEach(function (id) { others[E.tileIndex(id)]++; });
    });
    return { wall: wall, others: others };
  }

  function flags(game, extra) {
    var f = { lastTile: game.hand.wall.length === 0 };
    if (extra) for (var k in extra) f[k] = extra[k];
    return f;
  }

  // The tiles that finish this seat's 13 (or 11, 8...) tiles: the faan each
  // scores by a discard and by self-draw, and the ones that finish but score
  // under the minimum. `without` is a tile to take out first (a discard).
  function waitsOf(game, seat, without) {
    var s = game.hand.seats[seat];
    var removed = -1;
    if (without) {
      removed = s.hand.indexOf(without);
      if (removed < 0) return { waits: [], short: 0 };
      s.hand.splice(removed, 1);
    }
    var out = { waits: [], short: 0 };
    try {
      var c = E.countsOf(s.hand);
      var m = s.melds.length;
      var min = minFaan(game);
      for (var i = 0; i < 34; i++) {
        if (c[i] >= 4) continue;
        c[i]++;
        var done = E.shanten(c, m) === -1;
        c[i]--;
        if (!done) continue;
        var ron = E.scoreWin(game, seat, E.tileId(i), flags(game));
        var tsumo = E.scoreWin(game, seat, E.tileId(i), flags(game, { selfDraw: true }));
        var rf = ron && ron.valid ? ron.faan : 0, tf = tsumo && tsumo.valid ? tsumo.faan : 0;
        if (rf >= min || tf >= min) out.waits.push({ i: i, ron: rf >= min ? rf : 0, tsumo: tf >= min ? tf : 0 });
        else out.short = Math.max(out.short, rf, tf);
      }
    } finally {
      if (removed >= 0) s.hand.splice(removed, 0, without);
    }
    return out;
  }

  function steps(game, seat) {
    var s = game.hand.seats[seat];
    return E.shanten(E.countsOf(s.hand), s.melds.length);
  }

  /* ------------------------------------------------------------------ *
   * 2. Your discards
   * ------------------------------------------------------------------ */

  // Every different tile you could throw: how far the hand is after it, which
  // tiles then improve it, and how many of those are really left.
  function rateDiscards(game, seat) {
    var s = game.hand.seats[seat];
    var m = s.melds.length;
    var c = E.countsOf(s.hand);
    var where = whereTiles(game, seat);
    var out = [];
    for (var d = 0; d < 34; d++) {
      if (!c[d]) continue;
      c[d]--;
      var sh = E.shanten(c, m);
      var good = [];
      var eff = sh, ready = null;
      if (sh === 0) {
        ready = waitsOf(game, seat, E.tileId(d));
        good = ready.waits.map(function (w) { return w.i; });
        if (!good.length) eff = 1.5; // complete, but too few faan to win: worse than one tile away
      } else {
        for (var i = 0; i < 34; i++) {
          if (c[i] >= 4) continue;
          c[i]++;
          if (E.shanten(c, m) < sh) good.push(i);
          c[i]--;
        }
      }
      var live = 0, held = 0;
      good.forEach(function (i) { live += where.wall[i]; held += where.others[i]; });
      out.push({ index: d, steps: sh, eff: eff, good: good, live: live, held: held, ready: ready });
      c[d]++;
    }
    out.sort(function (a, b) { return a.eff - b.eff || b.live - a.live || a.index - b.index; });
    return out;
  }

  function describeTile(c, d) {
    var rank = d % 9, suit = d < 27;
    if (c[d] >= 3) return "breaks up a meld";
    if (c[d] === 2) return "breaks a pair";
    if (!suit) return d >= 31 ? "a lone dragon" : "a lone wind";
    var near = [-2, -1, 1, 2].some(function (k) { return rank + k >= 0 && rank + k <= 8 && c[d + k]; });
    if (!near) return rank === 0 || rank === 8 ? "an isolated terminal" : "an isolated tile";
    return "a tile with a neighbor";
  }

  function stepsText(n) {
    if (n === -1) return "a complete hand";
    if (n === 0) return "ready";
    if (n === 1.5) return "ready, but short on faan";
    return plural(n, "tile") + " from ready";
  }

  // Who could win on a tile thrown now.
  function winnersOn(game, seat, tile) {
    var out = [];
    game.hand.seats.forEach(function (s, o) {
      if (o === seat) return;
      var r = E.scoreWin(game, o, tile, flags(game));
      if (r && r.canWin) out.push({ seat: o, faan: r.faan });
    });
    return out;
  }

  function readyOpponents(game, seat) {
    var out = [];
    game.hand.seats.forEach(function (s, o) {
      if (o === seat) return;
      var w = waitsOf(game, o);
      if (w.waits.length) out.push({ seat: o, waits: w.waits });
    });
    return out;
  }

  function discardNote(game, ev, ctx) {
    var seat = ev.s;
    var s = game.hand.seats[seat];
    var c = E.countsOf(s.hand);
    var d = E.tileIndex(ev.t);
    var rated = rateDiscards(game, seat);
    var mine = rated.filter(function (r) { return r.index === d; })[0];
    if (!mine) return null;
    var best = rated[0];
    var line = [];
    var action;

    // Safety first: a discard that wins for someone is the loudest fact.
    var hit = winnersOn(game, seat, ev.t);
    var ready = readyOpponents(game, seat);
    if (hit.length) {
      var h = hit[0];
      action = "Dealt in to " + who(game, h.seat) + ".";
      line.push(who(game, h.seat) + " was waiting on " + tn(d) + " for " + faanText(h.faan) + " and you threw it.");
      var safer = rated.filter(function (r) {
        return r.index !== d && winnersOn(game, seat, E.tileId(r.index)).length === 0 && r.eff <= mine.eff + 1;
      })[0];
      if (safer) line.push(tn(safer.index) + " was safe, and " + (safer.eff === mine.eff ? "kept the hand just as close" : "cost about a step"));
      else line.push("Nothing in your hand was safe, so this was forced.");
      line[line.length - 1] += ".";
      line = [line.join(" ")];
      if (mine.eff >= 1) {
        line.push("You could not see it from your seat, but a ready hand usually shows in its discards and melds. With your own hand " + stepsText(mine.eff) + ", a safer tile is cheap insurance, because dealing in costs the whole hand.");
      }
      return { action: action, detail: line.join(" ") };
    }

    // Then the hand itself.
    var losing = mine.eff > best.eff;
    var fewer = !losing && mine.live < best.live * 0.75 && best.live - mine.live >= 3;
    if (mine.eff === -1) return null;
    if (mine.live <= 2 && mine.good.length && mine.eff > 0 && mine.eff !== 1.5) line.push("(Very few live tiles: this hand is slow.)");
    if (losing) {
      action = "A step slower than it needed to be.";
      line.push("If you throw " + tn(d) + " (" + describeTile(c, d) + "), the hand is " + stepsText(mine.eff) + "; if you throw " + tn(best.index) + ", it is " + stepsText(best.eff) + ", with " + plural(best.live, "live tile") + " to improve it.");
    } else if (fewer) {
      action = "Same speed, fewer outs.";
      line.push(tn(d) + " leaves the hand " + stepsText(mine.eff) + " with " + plural(mine.live, "live tile") + " to improve it. " + tn(best.index) + " gives " + best.live + ".");
    } else {
      // An ordinary good discard says nothing unless it changed something.
      var improved = ctx.prev && ctx.prev.lastSteps != null && mine.eff < ctx.prev.lastSteps;
      var waitKey = mine.eff === 0 ? mine.good.join(",") : "";
      var sameWait = mine.eff === 0 && ctx.prev && ctx.prev.waitKey === waitKey;
      var noteworthy = (mine.eff === 0 && !sameWait) || mine.eff === 1.5 || improved || mine.live <= 2 || !ctx.prev;
      if (!noteworthy) return { skip: true, after: mine.eff, waitKey: waitKey };
      action = mine.eff === 0 ? "Ready, and a good discard." : improved ? "Closer to ready." : "What was really left.";
      line.push(tn(d) + " (" + describeTile(c, d) + ") leaves the hand " + stepsText(mine.eff) + ".");
    }
    // How many of the helpful tiles are really there.
    if (mine.good.length) {
      var helpers = names(mine.good);
      var inWall = mine.live, inHands = mine.held;
      var held = inHands ? " (" + inHands + " in other hands)" : "";
      var tail = inWall === 0 ? "None are left in the wall" + held + "."
        : inWall + " " + (inWall === 1 ? "is" : "are") + " still in the wall" + held + ".";
      var dead = mine.eff === 0 && mine.ready && inWall === 0;
      line.push((mine.eff === 0 ? "You are waiting on " : "Tiles that help: ") + helpers + ". " + (dead ? "" : tail));
      if (mine.eff === 0 && mine.ready) {
        var kinds = mine.ready.waits.length;
        var topFaan = mine.ready.waits.reduce(function (n, w) { return Math.max(n, w.ron, w.tsumo); }, 0);
        if (dead) line.push("None are left in the wall" + held + ", so this wait is dead: change it when a draw lets you.");
        else line.push(kinds >= 2 ? "You are waiting on " + kinds + " different tiles: the strong kind of wait." : "A one-tile wait is thin: only one kind of tile wins.");
        line.push("It scores up to " + faanText(topFaan) + ".");
      }
    } else if (mine.eff === 1.5 && mine.ready) {
      line.push("The shape is complete but would only score " + faanText(mine.ready.short) + ", and the minimum is " + minFaan(game) + ". Add a faan before you count on this hand.");
    }
    // The others' hands.
    if (ready.length) {
      var r = ready[0];
      var readyNames = ready.map(function (x) { return who(game, x.seat); });
      var whoReady = readyNames.length > 1 ? readyNames.slice(0, -1).join(", ") + " and " + readyNames[readyNames.length - 1] + " were" : readyNames[0] + " was";
      line.push(whoReady + " ready" + (ready.length === 1 ? " on " + names(r.waits.map(function (w) { return w.i; })) : "") + ", and " + tn(d) + " was not one of the tiles.");
      var risky = rated.filter(function (x) { return x.index !== d && winnersOn(game, seat, E.tileId(x.index)).length; })[0];
      if (risky && risky.eff <= mine.eff + 0.5) line.push("You would have lost by throwing " + tn(risky.index) + " instead.");
    }
    if (!losing && ctx.prev && ctx.prev.lastSteps != null && mine.eff > ctx.prev.lastSteps) line.push("That is a step back from last turn.");
    return { action: action, detail: line.join(" "), after: mine.eff, waitKey: mine.eff === 0 ? mine.good.join(",") : "" };
  }

  /* ------------------------------------------------------------------ *
   * 3. Other players, claims and passes
   * ------------------------------------------------------------------ */

  // A plain reading of what a hand is going for.
  function readHand(game, seat) {
    var s = game.hand.seats[seat];
    var c = E.countsOf(s.hand);
    s.melds.forEach(function (m) { m.tiles.slice(0, 3).forEach(function (id) { c[E.tileIndex(id)]++; }); });
    var by = { c: 0, d: 0, b: 0 }, honors = 0, pairs = 0, sets = 0;
    for (var i = 0; i < 34; i++) {
      if (i >= 27) honors += c[i]; else by[E.suitOfIndex(i)] += c[i];
      if (c[i] === 2) pairs++;
      if (c[i] >= 3) sets++;
    }
    var top = ["c", "d", "b"].sort(function (a, b) { return by[b] - by[a]; })[0];
    var total = by.c + by.d + by.b + honors;
    if (by[top] >= total - 2 && honors === 0) return { text: "a Full Flush in " + SUIT_NAMES[top], big: true };
    if (by[top] + honors >= total - 2) return { text: "a Half Flush in " + SUIT_NAMES[top], big: true };
    if (sets + pairs >= 5) return { text: "All Triplets or Seven Pairs", big: false };
    if (honors >= total - 3) return { text: "a hand of honors", big: true };
    return { text: "a plain hand", big: false };
  }

  function valuePung(game, seat, i) {
    if (DRAGONS.indexOf(i) !== -1) return "a dragon";
    if (i === 26 + game.round) return "the round wind";
    if (i === 26 + E.seatWind(game, seat)) return "its own seat wind";
    return null;
  }

  function openingNote(game) {
    var rows = game.hand.seats.map(function (s, o) { return { seat: o, steps: steps(game, o) }; });
    var mine = rows[0];
    var fastest = rows.slice().sort(function (a, b) { return a.steps - b.steps || a.seat - b.seat; })[0];
    var read = readHand(game, 0);
    var line = ["You start " + stepsText(mine.steps) + "."];
    if (fastest.seat !== 0 && fastest.steps < mine.steps) line.push(who(game, fastest.seat) + " has the fastest deal, " + stepsText(fastest.steps) + ".");
    else if (fastest.seat === 0 && rows.filter(function (r) { return r.steps === mine.steps; }).length === 1) line.push("That is the fastest deal at the table.");
    line.push("It reads as " + read.text + (read.big ? ", which is worth building for if the tiles come." : "."));
    var dealer = game.hand.dealer != null ? game.hand.dealer : game.dealer;
    line.push((dealer === 0 ? "You deal, so you pay and collect double on this hand. " : "") + "The minimum is " + minFaan(game) + " faan, so plan where those come from early: a dragon or wind pung, a flush, All Triplets, or staying concealed with a self-draw.");
    return { action: "The deal, with every hand face up.", detail: line.join(" ") };
  }

  // After an opponent discards: are they newly ready?
  function readyNote(game, ev, ctx) {
    var o = ev.s;
    var w = waitsOf(game, o);
    var key = o + ":" + w.waits.map(function (x) { return x.i; }).join(",");
    var prior = ctx.ready[o] || "";
    ctx.ready[o] = key;
    if (!w.waits.length || prior === key || o === 0) return null;
    var line = [];
    var tiles = w.waits.map(function (x) { return x.i; });
    var live = 0;
    var where = whereTiles(game, o);
    tiles.forEach(function (i) { live += where.wall[i] + where.others[i]; });
    var topFaan = w.waits.reduce(function (n, x) { return Math.max(n, x.ron, x.tsumo); }, 0);
    var action = who(game, o) + " is ready.";
    line.push("They are waiting on " + names(tiles) + " for up to " + faanText(topFaan) + ". " + plural(live, "copy", "copies") + " left unseen.");
    var me = game.hand.seats[0];
    var held = [];
    tiles.forEach(function (i) { if (me.hand.indexOf(E.tileId(i)) !== -1) held.push(i); });
    if (held.length) line.push("You are holding " + names(held) + ": throwing " + (held.length === 1 ? "it" : "either") + " would deal in. Every other tile in your hand is safe against " + who(game, o) + ".");
    else line.push("Nothing in your hand wins for " + who(game, o) + ", so every tile you hold is safe against them.");
    var sh = steps(game, 0);
    if (sh >= 2) line.push("You are " + stepsText(sh) + ": against a ready hand that is far, so folding to safe tiles beats pushing.");
    else if (sh === 0) line.push("You are ready too, so you are racing: push.");
    else line.push("You are " + stepsText(sh) + ": close enough to keep pushing carefully, but fold if you do not improve.");
    return { action: action, detail: line.join(" ") };
  }

  // A call, written once it has been made: `before` is how far the hand was.
  function claimNote(game, ev, before) {
    var o = ev.s;
    var after = steps(game, o);
    var tile = E.tileIndex(ev.t);
    var value = ev.c === "chow" ? null : valuePung(game, o, tile);
    var line = [];
    var gain = before - after;
    if (o === 0) line.push("The hand went from " + stepsText(before) + " to " + stepsText(after) + ".");
    else line.push("Their hand went from " + stepsText(before) + " to " + stepsText(after) + ".");
    if (value) line.push("It is " + value + ", a faan" + (o === 0 ? " toward the " + minFaan(game) + " you need." : "."));
    else if (ev.c === "chow") line.push(gain > 0 ? "A chow is worth no faan and ends Concealed, so the speed it buys is the whole reason to call it." : "A chow is worth no faan and ends Concealed, and this one did not make the hand any closer.");
    else line.push("A pung of a plain tile scores nothing by itself, but it keeps All Triplets and a flush open.");
    if (gain <= 0 && !value) line.push(o === 0 ? "You gave up your Concealed faan for nothing by calling here: passing was better." : "It gains no speed.");
    var read = readHand(game, o);
    if (read.big) line.push((o === 0 ? "You are" : "They are") + " building " + read.text + ".");
    var kind = ev.c === "kong" ? "kong" : ev.c;
    return { action: who(game, o) + (o === 0 ? " called a " : " called a ") + kind + " on " + tn(tile) + ".", detail: line.join(" ") };
  }

  // The player passes a discard: a win, or a call that makes the hand ready.
  function passNote(game, ev, next) {
    if (ev.s === 0) return null;
    var opts = E.claimOptions(game, 0, ev.t, ev.s, false);
    var tookIt = next && next.s === 0 && (next.a === "win" || next.a === "claim");
    if (tookIt) return null;
    if (opts.win) {
      var items = (opts.win.items || []).filter(function (x) { return x.faan; }).map(function (x) { return x.name; });
      return {
        action: "Missed win!",
        detail: "You could have declared a win on " + tn(E.tileIndex(ev.t)) + " from " + who(game, ev.s) + " for " + faanText(opts.win.faan) + (items.length ? " (" + items.join(", ") + ")" : "") + ". Check every discard for the tile you are waiting on before you pass.",
      };
    }
    var s = game.hand.seats[0];
    var m = s.melds.length;
    var c = E.countsOf(s.hand);
    var before = E.shanten(c, m);
    var best = null;
    function trial(kind, remove) {
      var cc = c.slice();
      remove.forEach(function (t) { cc[E.tileIndex(t)]--; });
      var low = Infinity;
      for (var i = 0; i < 34; i++) {
        if (!cc[i]) continue;
        cc[i]--;
        low = Math.min(low, E.shanten(cc, m + 1));
        cc[i]++;
      }
      if (low === 0 && before > 0 && (!best || kind === "pung")) best = kind;
    }
    if (opts.pung) trial("pung", [ev.t, ev.t]);
    opts.chows.forEach(function (pair) { trial("chow", pair); });
    if (best) {
      var cost = !s.melds.length ? " It would open your hand and give up the Concealed faan, so it is a trade, not a free gain." : "";
      return {
        action: "A call would have made you ready.",
        detail: "A " + best + " on " + tn(E.tileIndex(ev.t)) + " leaves you ready after the discard (you were " + stepsText(before) + ")." + cost,
      };
    }
    return null;
  }

  function endNote(game, ev, ctx) {
    if (ev.a === "drawGame") {
      var rows = game.hand.seats.map(function (s, o) { return { seat: o, steps: steps(game, o) }; })
        .sort(function (a, b) { return a.steps - b.steps || a.seat - b.seat; });
      var close = rows[0];
      return {
        action: "The wall ran out.",
        detail: "Nobody won. The closest hand was " + whose(game, close.seat) + ", " + stepsText(close.steps) + ". " + (steps(game, 0) <= 1 ? "You were close enough that one more tile would have mattered." : "Your hand was " + stepsText(steps(game, 0)) + " at the end."),
      };
    }
    if (ev.a !== "win") return null;
    var r = null;
    try {
      if (ev.how === "selfDraw") r = E.scoreWin(game, ev.s, null, flags(game, { selfDraw: true }));
      else if (ev.how === "robKong") r = E.scoreWin(game, ev.s, ev.t, flags(game, { robKong: true }));
      else if (ev.how === "discard") r = E.scoreWin(game, ev.s, ev.t, flags(game));
    } catch (e) { r = null; }
    var items = r && r.items ? r.items.filter(function (x) { return x.faan; }).map(function (x) { return x.name + " " + x.faan; }) : [];
    var how = ev.how === "selfDraw" ? "a self-draw" : ev.how === "robKong" ? "robbing a kong" : ev.how === "discard" ? "a discard from " + who(game, ev.from) : "flowers";
    var line = [];
    if (r) line.push(faanText(r.faan) + (items.length ? ": " + items.join(", ") + "." : "."));
    if (ev.s === 0) line.push("Well played. Every faan above the minimum raises what each player pays.");
    else {
      var mine = steps(game, 0);
      line.push("You were " + stepsText(mine) + " when it ended.");
      if (ev.how === "discard" && ev.from === 0) line.push("The tile that won was yours, so you paid for it alone.");
      else if (ev.how === "discard") line.push("Only the player who threw it pays.");
      else if (ev.how === "selfDraw") line.push("On a self-draw, everyone pays.");
    }
    return { action: who(game, ev.s) + " won by " + how + ".", detail: line.join(" ") };
  }

  /* ------------------------------------------------------------------ *
   * 4. Walking a recording
   * ------------------------------------------------------------------ */

  // A note fits four lines on a phone: the action and the detail together
  // at most MAX_TEXT characters. Sentences go from the end until it fits.
  var MAX_TEXT = 400;

  function fitDetail(action, detail) {
    var room = MAX_TEXT - action.length - 1;
    if (detail.length <= room) return detail;
    var parts = detail.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [detail];
    var out = "";
    for (var k = 0; k < parts.length; k++) {
      if ((out + parts[k]).trim().length > room) break;
      out += parts[k];
    }
    return out.trim();
  }

  function createAnalyst(rec) {
    var game = E.playbackGame(rec, 0);
    var state = { rec: rec, game: game, index: -1, discards: 0, notes: [], ctx: { ready: {}, prev: null }, done: !game };

    function add(note, step, move) {
      if (!note || !note.action) return;
      var detail = fitDetail(note.action, note.detail || "");
      state.notes.push({
        kind: "analysis", action: note.action, detail: detail,
        hand: rec.handNumber || 1, move: move, step: step,
      });
    }

    function stepOnce() {
      var actions = rec.actions;
      var limit = typeof rec.moves === "number" && rec.moves >= 0 ? Math.min(actions.length, rec.moves) : actions.length;
      if (state.index === -1) {
        state.index = 0;
        try { add(openingNote(state.game), 0, 1); } catch (e) {}
        return true;
      }
      if (state.index >= limit) { state.done = true; return false; }
      var ev = actions[state.index];
      var move = state.discards + 1;
      var step = state.index + 1;
      var claimBefore = null;
      try {
        if (ev.a === "discard" && ev.s === 0) {
          var n = discardNote(state.game, ev, state.ctx);
          if (n) { if (!n.skip) add(n, step, move); state.ctx.prev = { lastSteps: n.after, waitKey: n.waitKey }; }
        } else if (ev.a === "discard") {
          add(passNote(state.game, ev, actions[state.index + 1]), step, move);
        } else if (ev.a === "claim") {
          claimBefore = steps(state.game, ev.s);
        } else if (ev.a === "win" || ev.a === "drawGame") {
          add(endNote(state.game, ev, state.ctx), step, move);
        }
      } catch (e) { /* a note that cannot be written is skipped */ }
      E.applyPlaybackAction(state.game, ev);
      if (ev.a === "claim") {
        try { add(claimNote(state.game, ev, claimBefore), step, move); } catch (e) {}
      }
      if (ev.a === "discard") {
        state.discards++;
        try { if (ev.s !== 0) add(readyNote(state.game, ev, state.ctx), step, move); } catch (e) {}
      }
      state.index++;
      return true;
    }

    // Advances up to `upto` actions, for at most `budgetMs`. True when more is left.
    function run(upto, budgetMs) {
      var started = Date.now();
      var rec2 = state.rec.actions;
      var target = Math.min(upto == null ? rec2.length : upto, rec2.length);
      try {
        while (!state.done && state.index < target) {
          if (!stepOnce()) break;
          if (budgetMs && Date.now() - started > budgetMs) break;
        }
      } catch (e) { state.done = true; }
      return !state.done && state.index < target;
    }

    return {
      run: run,
      notes: function () { return state.notes; },
      index: function () { return state.index; },
    };
  }

  // All the notes for a recording at once (for tests and scripts).
  function analyze(rec) {
    var a = createAnalyst(rec);
    a.run(rec.actions.length + 1, 0);
    return a.notes();
  }

  var api = { createAnalyst: createAnalyst, analyze: analyze, rateDiscards: rateDiscards, waitsOf: waitsOf, readHand: readHand };
  if (node) module.exports = api;
  else root.MahjongAnalysis = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
