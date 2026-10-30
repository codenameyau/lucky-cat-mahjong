/* Hong Kong mahjong game engine for the Play page: tiles, wall, shanten,
   turn flow, claims, and settlement. Scoring is delegated to js/points.js
   (HKScoring.scoreHand) so the game and the Points Calculator agree. */

(function (root) {
  'use strict';

  var HKScoring = (typeof module !== 'undefined' && module.exports)
    ? require('./points.js')
    : root.HKScoring;

  /* ------------------------------------------------------------------ *
   * 1. Tiles
   *    34 playable kinds indexed 0-33: c1-c9, d1-d9, b1-b9, then the
   *    honors in points.js order (E, S, W, N, White, Green, Red).
   * ------------------------------------------------------------------ */

  var SUITS = ['c', 'd', 'b'];
  var HONOR_IDS = ['we', 'ws', 'ww', 'wn', 'dw', 'dg', 'dr'];
  var BONUS_IDS = ['f1', 'f2', 'f3', 'f4', 's1', 's2', 's3', 's4'];
  var TILE_IDS = [];
  SUITS.forEach(function (s) {
    for (var v = 1; v <= 9; v++) TILE_IDS.push(s + v);
  });
  HONOR_IDS.forEach(function (id) { TILE_IDS.push(id); });

  var INDEX_BY_ID = {};
  TILE_IDS.forEach(function (id, i) { INDEX_BY_ID[id] = i; });

  var WIND_NAMES = ['', 'East', 'South', 'West', 'North'];
  var WIND_CN = ['', '東', '南', '西', '北'];
  var START_POINTS = 2000;
  var MIN_FAAN = 3;

  function tileIndex(id) { return INDEX_BY_ID[id]; }
  function tileId(index) { return TILE_IDS[index]; }
  function isBonus(id) { return BONUS_IDS.indexOf(id) !== -1; }
  function isHonorIndex(i) { return i >= 27; }
  function suitOfIndex(i) { return i >= 27 ? 'z' : SUITS[Math.floor(i / 9)]; }
  function rankOfIndex(i) { return i >= 27 ? i - 26 : (i % 9) + 1; }
  function isTerminalOrHonorIndex(i) {
    return i >= 27 || i % 9 === 0 || i % 9 === 8;
  }

  function tileName(id) {
    var t = HKScoring.TILE_BY_ID[id];
    return t ? t.name.replace('Chrysanthe-mum', 'Chrysanthemum') : id;
  }

  function sortTiles(ids) {
    return ids.slice().sort(function (a, b) {
      var ia = isBonus(a) ? 100 + BONUS_IDS.indexOf(a) : tileIndex(a);
      var ib = isBonus(b) ? 100 + BONUS_IDS.indexOf(b) : tileIndex(b);
      return ia - ib;
    });
  }

  function countsOf(ids) {
    var c = new Array(34);
    for (var i = 0; i < 34; i++) c[i] = 0;
    ids.forEach(function (id) {
      var k = INDEX_BY_ID[id];
      if (k !== undefined) c[k]++;
    });
    return c;
  }

  // Small seeded PRNG (mulberry32) so tests and replays are deterministic.
  function createRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function buildWall(rng) {
    var wall = [];
    TILE_IDS.forEach(function (id) {
      for (var n = 0; n < 4; n++) wall.push(id);
    });
    BONUS_IDS.forEach(function (id) { wall.push(id); });
    return shuffle(wall, rng);
  }

  /* ------------------------------------------------------------------ *
   * 2. Shanten (tiles away from ready; -1 = complete hand)
   *    Standard hands are solved suit by suit, memoizing each suit's
   *    achievable (melds, partial sets, pair) combinations.
   * ------------------------------------------------------------------ */

  var suitMemo = {};

  function encode(m, t, p) { return m * 100 + t * 10 + p; }

  // All (melds, taatsu, pair) totals reachable from c[i..] for one suit.
  function suitOptions(c, i, honor) {
    while (i < c.length && c[i] === 0) i++;
    if (i >= c.length) return [0];
    var key = (honor ? 'h' : 'n') + i + ':' + c.join('');
    var hit = suitMemo[key];
    if (hit) return hit;

    var seen = {};
    var out = [];
    function add(delta, rest, needsNoPair) {
      for (var k = 0; k < rest.length; k++) {
        var code = rest[k];
        if (needsNoPair && code % 10 === 1) continue;
        var total = code + delta;
        if (!seen[total]) { seen[total] = true; out.push(total); }
      }
    }

    if (c[i] >= 3) {
      c[i] -= 3; add(100, suitOptions(c, i, honor)); c[i] += 3;
    }
    if (!honor && i + 2 < c.length && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      add(100, suitOptions(c, i, honor));
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      var restPair = suitOptions(c, i, honor);
      add(1, restPair, true);
      add(10, restPair);
      c[i] += 2;
    }
    if (!honor && i + 1 < c.length && c[i + 1]) {
      c[i]--; c[i + 1]--; add(10, suitOptions(c, i, honor)); c[i]++; c[i + 1]++;
    }
    if (!honor && i + 2 < c.length && c[i + 2]) {
      c[i]--; c[i + 2]--; add(10, suitOptions(c, i, honor)); c[i]++; c[i + 2]++;
    }
    c[i]--; add(0, suitOptions(c, i, honor)); c[i]++;

    suitMemo[key] = out;
    return out;
  }

  // Merge two option lists, keeping p <= 1 and capping melds+taatsu.
  function combineOptions(a, b, need) {
    var seen = {};
    var out = [];
    for (var x = 0; x < a.length; x++) {
      for (var y = 0; y < b.length; y++) {
        var p = (a[x] % 10) + (b[y] % 10);
        if (p > 1) continue;
        var m = Math.floor(a[x] / 100) + Math.floor(b[y] / 100);
        var t = Math.floor(a[x] / 10) % 10 + Math.floor(b[y] / 10) % 10;
        if (m > need) m = need;
        if (m + t > need) t = need - m;
        var code = encode(m, t, p);
        if (!seen[code]) { seen[code] = true; out.push(code); }
      }
    }
    return out;
  }

  function standardShanten(c, declared) {
    var need = 4 - (declared || 0);
    var opts = [0];
    for (var s = 0; s < 4; s++) {
      var slice = c.slice(s * 9, s === 3 ? 34 : s * 9 + 9);
      opts = combineOptions(opts, suitOptions(slice, 0, s === 3), need);
    }
    var best = 0;
    opts.forEach(function (code) {
      var m = Math.floor(code / 100);
      var t = Math.floor(code / 10) % 10;
      var p = code % 10;
      var v = 2 * m + t + p;
      if (v > best) best = v;
    });
    return 2 * need - best;
  }

  function sevenPairsShanten(c, declared) {
    if (declared) return Infinity;
    var pairs = 0, kinds = 0;
    for (var i = 0; i < 34; i++) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  var ORPHAN_INDEXES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

  function orphansShanten(c, declared) {
    if (declared) return Infinity;
    var kinds = 0, pair = 0;
    ORPHAN_INDEXES.forEach(function (i) {
      if (c[i] >= 1) kinds++;
      if (c[i] >= 2) pair = 1;
    });
    return 13 - kinds - pair;
  }

  // All-triplets path: only pungs and pairs count.
  function tripletsShanten(c, declared) {
    var need = 4 - (declared || 0);
    var pungs = 0, pairs = 0;
    for (var i = 0; i < 34; i++) {
      if (c[i] >= 3) pungs++;
      else if (c[i] === 2) pairs++;
    }
    var m = Math.min(pungs, need);
    var p = pairs > 0 ? 1 : 0;
    var t = Math.min(pairs - p, need - m);
    return 2 * need - 2 * m - t - p;
  }

  function shanten(c, declared) {
    return Math.min(
      standardShanten(c, declared),
      sevenPairsShanten(c, declared),
      orphansShanten(c, declared)
    );
  }

  // Tile indexes that would complete a hand of 3n+1 tiles.
  function winningTiles(c, declared) {
    var out = [];
    for (var i = 0; i < 34; i++) {
      if (c[i] >= 4) continue;
      c[i]++;
      if (shanten(c, declared) === -1) out.push(i);
      c[i]--;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 3. Game + hand state
   * ------------------------------------------------------------------ */

  var BOT_NAMES = ['Mei', 'Kenji', 'Lulu', 'Wing', 'Rosa', 'Tak', 'Bo', 'Ming', 'Sasha', 'Hugo', 'Pearl', 'Jade'];

  function createGame(options) {
    options = options || {};
    var seed = options.seed !== undefined ? options.seed : Math.floor(Math.random() * 4294967296);
    var rng = createRng(seed);
    var names = shuffle(BOT_NAMES.slice(), rng);
    var startPoints = options.startPoints || START_POINTS;
    var players = [0, 1, 2, 3].map(function (i) {
      return {
        name: i === 0 ? (options.humanName || 'You') : names[i - 1],
        isHuman: i === 0 && options.humanSeat !== false,
        points: startPoints,
      };
    });
    var dealer = options.dealer !== undefined ? options.dealer : Math.floor(rng() * 4);
    return {
      settings: {
        spicy: options.spicy === 'half' ? 'half' : 'full',
        mode: options.mode === 'practice' ? 'practice' : 'payout',
        startPoints: startPoints,
        minFaan: MIN_FAAN,
      },
      seed: seed,
      rng: rng,
      players: players,
      spareNames: names.slice(3),
      round: 1,
      dealer: dealer,
      firstDealer: dealer,
      handNumber: 0,
      dealerRepeat: 0,
      over: false,
      hand: null,
      history: [],
    };
  }

  function seatWind(game, seat) {
    return ((seat - game.dealer + 4) % 4) + 1;
  }

  function startHand(game) {
    game.handNumber++;
    var wall = buildWall(game.rng);
    var seats = [0, 1, 2, 3].map(function () {
      return { hand: [], melds: [], flowers: [], discards: [] };
    });
    var h = {
      wall: wall,
      seats: seats,
      turn: game.dealer,
      discardCount: 0,
      claimsMade: 0,
      lastDiscard: null,
      kongChain: 0,
      drawnTile: null,
      canSelfDraw: true, // false right after a chow/pung: no win or kong until the next draw
      backDrawn: 0, // replacement tiles taken from the back of the wall (for drawing the wall)

    };
    game.hand = h;
    for (var r = 0; r < 13; r++) {
      for (var s = 0; s < 4; s++) seats[(game.dealer + s) % 4].hand.push(wall.shift());
    }
    seats[game.dealer].hand.push(wall.shift());
    return h;
  }

  function wallCount(game) { return game.hand.wall.length; }

  // Bonus tiles go to the flower area and are replaced from the back of the wall.
  function replaceFlowers(game, seat, onFlower) {
    var s = game.hand.seats[seat];
    var drawn = [];
    for (;;) {
      var idx = -1;
      for (var i = 0; i < s.hand.length; i++) {
        if (isBonus(s.hand[i])) { idx = i; break; }
      }
      if (idx === -1) break;
      var f = s.hand.splice(idx, 1)[0];
      s.flowers.push(f);
      if (onFlower) onFlower(f);
      if (!game.hand.wall.length) break;
      var rep = game.hand.wall.pop();
      game.hand.backDrawn++;
      s.hand.push(rep);
      drawn.push(rep);
    }
    return drawn;
  }

  function drawTile(game, seat, fromBack) {
    var w = game.hand.wall;
    if (!w.length) return null;
    var t = fromBack ? w.pop() : w.shift();
    if (fromBack) game.hand.backDrawn++;
    game.hand.seats[seat].hand.push(t);
    game.hand.canSelfDraw = true;
    return t;
  }

  function removeTiles(arr, ids) {
    ids.forEach(function (id) {
      var at = arr.indexOf(id);
      if (at === -1) throw new Error('tile not in hand: ' + id);
      arr.splice(at, 1);
    });
  }

  function countIn(arr, id) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i] === id) n++;
    return n;
  }

  function meldFirstTile(meld) { return meld.tiles[0]; }

  /* ------------------------------------------------------------------ *
   * 4. Legal options
   * ------------------------------------------------------------------ */

  // Scores a would-be win for `seat`. `tile` is the winning tile if it's not
  // already in hand (discard / robbed kong). Returns HKScoring result + flags.
  function scoreWin(game, seat, tile, flags) {
    flags = flags || {};
    var s = game.hand.seats[seat];
    var concealedTiles = s.hand.slice();
    if (tile) concealedTiles.push(tile);
    var c = countsOf(concealedTiles);
    if (shanten(c, s.melds.length) !== -1) return null;
    var res = HKScoring.scoreHand({
      concealed: concealedTiles,
      melds: s.melds.map(function (m) {
        return { type: m.type, tile: meldFirstTile(m), concealed: m.concealed };
      }),
      flowers: s.flowers,
      seat: seatWind(game, seat),
      round: game.round,
      selfDraw: !!flags.selfDraw,
      lastTile: !!flags.lastTile,
      robKong: !!flags.robKong,
      kongWin: !!flags.kongWin,
      doubleKong: !!flags.doubleKong,
      heavenly: !!flags.heavenly,
      earthly: !!flags.earthly,
      spicy: game.settings.spicy,
      minFaan: game.settings.minFaan,
    });
    res.canWin = res.valid && res.faan >= game.settings.minFaan;
    return res;
  }

  function selfDrawFlags(game, seat) {
    var h = game.hand;
    return {
      selfDraw: true,
      kongWin: h.kongChain === 1,
      doubleKong: h.kongChain >= 2,
      lastTile: h.wall.length === 0,
      heavenly: seat === game.dealer && h.discardCount === 0 && h.claimsMade === 0 && h.kongChain === 0,
    };
  }

  function discardFlags(game, seat, from) {
    var h = game.hand;
    return {
      lastTile: h.wall.length === 0,
      earthly: from === game.dealer && seat !== game.dealer && h.discardCount === 1 && h.claimsMade === 0,
    };
  }

  function turnOptions(game, seat) {
    var s = game.hand.seats[seat];
    var fresh = game.hand.canSelfDraw;
    var win = fresh ? scoreWin(game, seat, null, selfDrawFlags(game, seat)) : null;
    var kongs = [];
    if (fresh && game.hand.wall.length) {
      var seen = {};
      s.hand.forEach(function (id) {
        if (seen[id]) return;
        seen[id] = true;
        if (countIn(s.hand, id) === 4) kongs.push({ tile: id, kind: 'concealed' });
      });
      s.melds.forEach(function (m) {
        if (m.type === 'pung' && s.hand.indexOf(m.tiles[0]) !== -1) {
          kongs.push({ tile: m.tiles[0], kind: 'added' });
        }
      });
    }
    return {
      win: win && win.canWin ? win : null,
      completeButShort: win && !win.canWin ? win : null,
      kongs: kongs,
      justClaimed: !fresh,
    };
  }

  function chowOptions(hand, tile) {
    var k = tileIndex(tile);
    if (k === undefined || isHonorIndex(k)) return [];
    var r = k % 9;
    var out = [];
    [[-2, -1], [-1, 1], [1, 2]].forEach(function (d) {
      var a = r + d[0], b = r + d[1];
      if (a < 0 || b > 8) return;
      var ta = tileId(k + d[0]), tb = tileId(k + d[1]);
      if (hand.indexOf(ta) !== -1 && hand.indexOf(tb) !== -1) {
        out.push([ta, tb]);
      }
    });
    return out;
  }

  function claimOptions(game, seat, tile, from, robbing) {
    var s = game.hand.seats[seat];
    var opts = { tile: tile, from: from, win: null, completeButShort: null, pung: false, kong: false, chows: [], robKong: !!robbing };
    var flags = robbing ? { robKong: true } : discardFlags(game, seat, from);
    var win = scoreWin(game, seat, tile, flags);
    if (win && win.canWin) opts.win = win;
    else if (win) opts.completeButShort = win;
    if (robbing) return opts;
    var n = countIn(s.hand, tile);
    if (n >= 2) opts.pung = true;
    if (n >= 3 && game.hand.wall.length) opts.kong = true;
    if ((from + 1) % 4 === seat) opts.chows = chowOptions(s.hand, tile);
    return opts;
  }

  function hasAnyClaim(o) {
    return !!(o.win || o.pung || o.kong || o.chows.length);
  }

  /* ------------------------------------------------------------------ *
   * 5. Applying actions
   * ------------------------------------------------------------------ */

  function applyDiscard(game, seat, tile) {
    var h = game.hand;
    removeTiles(h.seats[seat].hand, [tile]);
    h.seats[seat].discards.push({ tile: tile, claimed: false });
    h.discardCount++;
    h.lastDiscard = { tile: tile, from: seat };
    h.kongChain = 0;
    h.drawnTile = null;
  }

  function markLastDiscardClaimed(game) {
    var d = game.hand.lastDiscard;
    var list = game.hand.seats[d.from].discards;
    list[list.length - 1].claimed = true;
  }

  function applyClaim(game, seat, decision) {
    var h = game.hand;
    var d = h.lastDiscard;
    var s = h.seats[seat];
    var meld;
    if (decision.type === 'chow') {
      removeTiles(s.hand, decision.tiles);
      var tiles = sortTiles(decision.tiles.concat([d.tile]));
      meld = { type: 'chow', tiles: tiles, from: d.from, claimed: d.tile, concealed: false };
    } else if (decision.type === 'pung') {
      removeTiles(s.hand, [d.tile, d.tile]);
      meld = { type: 'pung', tiles: [d.tile, d.tile, d.tile], from: d.from, claimed: d.tile, concealed: false };
    } else if (decision.type === 'kong') {
      removeTiles(s.hand, [d.tile, d.tile, d.tile]);
      meld = { type: 'kong', tiles: [d.tile, d.tile, d.tile, d.tile], from: d.from, claimed: d.tile, concealed: false };
    }
    s.melds.push(meld);
    markLastDiscardClaimed(game);
    h.claimsMade++;
    h.turn = seat;
    h.canSelfDraw = decision.type === 'kong';
    return meld;
  }

  function applyKong(game, seat, kong) {
    var s = game.hand.seats[seat];
    if (kong.kind === 'concealed') {
      removeTiles(s.hand, [kong.tile, kong.tile, kong.tile, kong.tile]);
      s.melds.push({ type: 'kong', tiles: [kong.tile, kong.tile, kong.tile, kong.tile], from: null, concealed: true });
    } else {
      removeTiles(s.hand, [kong.tile]);
      s.melds.forEach(function (m) {
        if (m.type === 'pung' && m.tiles[0] === kong.tile) {
          m.type = 'kong';
          m.tiles.push(kong.tile);
          m.added = true;
        }
      });
    }
    game.hand.kongChain++;
  }

  /* ------------------------------------------------------------------ *
   * 6. Settlement
   * ------------------------------------------------------------------ */

  // Payment rule from the Points Calculator guide: on a self-draw each
  // opponent pays the base points; on a discard (or robbed kong) only the
  // discarder pays.
  function payments(game, winner, payer, points) {
    var out = [0, 0, 0, 0];
    if (game.settings.mode === 'practice' || !points) return out;
    if (payer === null || payer === undefined) {
      for (var i = 0; i < 4; i++) {
        if (i === winner) continue;
        out[i] -= points;
        out[winner] += points;
      }
    } else {
      out[payer] -= points;
      out[winner] += points;
    }
    return out;
  }

  function settleWin(game, winner, payer, tile, score, how) {
    var s = game.hand.seats[winner];
    var deltas = payments(game, winner, payer, score.points);
    var result = {
      type: 'win',
      winner: winner,
      payer: payer,
      tile: tile,
      how: how,
      score: score,
      deltas: deltas,
      concealed: sortTiles(s.hand.concat(tile && how !== 'selfDraw' && how !== 'flowers' ? [tile] : [])),
      melds: s.melds.map(function (m) { return { type: m.type, tiles: m.tiles.slice(), concealed: m.concealed }; }),
      flowers: s.flowers.slice(),
      seatWind: seatWind(game, winner),
      round: game.round,
      handNumber: game.handNumber,
    };
    finishHand(game, result);
    return result;
  }

  function settleDraw(game) {
    var result = { type: 'draw', deltas: [0, 0, 0, 0], round: game.round, handNumber: game.handNumber };
    finishHand(game, result);
    return result;
  }

  function finishHand(game, result) {
    result.before = game.players.map(function (p) { return p.points; });
    for (var i = 0; i < 4; i++) game.players[i].points += result.deltas[i];
    result.after = game.players.map(function (p) { return p.points; });

    // Dealer keeps the deal on a win or a drawn hand; otherwise it passes on.
    var dealerKeeps = result.type === 'draw' || result.winner === game.dealer;
    result.dealerKeeps = dealerKeeps;
    if (dealerKeeps) {
      game.dealerRepeat++;
    } else {
      game.dealerRepeat = 0;
      game.dealer = (game.dealer + 1) % 4;
      if (game.dealer === game.firstDealer) {
        game.round = game.round % 4 + 1;
        result.roundAdvanced = true;
      }
    }

    result.busted = [];
    if (game.settings.mode === 'payout') {
      for (var p = 0; p < 4; p++) {
        if (game.players[p].points > 0) continue;
        result.busted.push(p);
        if (game.players[p].isHuman) {
          game.over = true;
        }
      }
    }
    game.history.push(result);
    game.hand.result = result;
  }

  // A bot that runs out of points leaves; a new opponent takes the seat.
  function replaceBustedBots(game) {
    var joined = [];
    for (var p = 0; p < 4; p++) {
      var pl = game.players[p];
      if (pl.isHuman || pl.points > 0) continue;
      var name = game.spareNames.shift() || ('Guest ' + (game.handNumber + p));
      game.spareNames.push(pl.name);
      joined.push({ seat: p, left: pl.name, joined: name });
      pl.name = name;
      pl.points = game.settings.startPoints;
    }
    return joined;
  }

  /* ------------------------------------------------------------------ *
   * 7. Hand loop
   *    agents[seat].turn(game, seat, options) -> Promise<action>
   *      action: { type: 'discard', tile } | { type: 'win' } | { type: 'kong', tile, kind }
   *    agents[seat].claim(game, seat, options) -> Promise<decision>
   *      decision: { type: 'pass' | 'win' | 'pung' | 'kong' } | { type: 'chow', tiles: [a, b] }
   *    ui.emit(event, data) -> Promise (animation hook; may be omitted)
   * ------------------------------------------------------------------ */

  var CLAIM_RANK = { win: 3, kong: 2, pung: 2, chow: 1, pass: 0 };

  function emit(ui, name, data) {
    if (!ui || !ui.emit) return Promise.resolve();
    return Promise.resolve(ui.emit(name, data));
  }

  function flowerWinCheck(game, seat) {
    var n = game.hand.seats[seat].flowers.length;
    if (n < 7) return null;
    var score = HKScoring.scoreHand({
      concealed: [],
      flowers: game.hand.seats[seat].flowers,
      seat: seatWind(game, seat),
      round: game.round,
      selfDraw: true,
      spicy: game.settings.spicy,
      minFaan: game.settings.minFaan,
    });
    // Seven Robbing One: whoever holds the eighth bonus tile pays.
    var payer = null;
    if (n === 7) {
      for (var o = 0; o < 4; o++) {
        if (o !== seat && game.hand.seats[o].flowers.length) payer = o;
      }
    }
    return { score: score, payer: payer };
  }

  async function handleFlowers(game, seat, ui) {
    var flowers = [];
    replaceFlowers(game, seat, function (f) { flowers.push(f); });
    for (var i = 0; i < flowers.length; i++) {
      await emit(ui, 'flower', { seat: seat, tile: flowers[i] });
    }
    return flowers.length;
  }

  async function resolveClaims(game, agents, ui, tile, from, robbing) {
    var options = [];
    for (var k = 1; k <= 3; k++) {
      var seat = (from + k) % 4;
      var o = claimOptions(game, seat, tile, from, robbing);
      if (hasAnyClaim(o)) options.push({ seat: seat, opts: o, order: k });
    }
    if (!options.length) return null;

    // Ask bots first; only ask a human when their best option could still win the claim.
    var decisions = [];
    var humans = [];
    for (var i = 0; i < options.length; i++) {
      var entry = options[i];
      if (game.players[entry.seat].isHuman) { humans.push(entry); continue; }
      var dec = await agents[entry.seat].claim(game, entry.seat, entry.opts);
      decisions.push({ seat: entry.seat, order: entry.order, decision: dec || { type: 'pass' } });
    }
    function best(list) {
      var top = null;
      list.forEach(function (d) {
        var r = CLAIM_RANK[d.decision.type] || 0;
        if (!r) return;
        if (!top || r > CLAIM_RANK[top.decision.type] ||
            (r === CLAIM_RANK[top.decision.type] && d.order < top.order)) top = d;
      });
      return top;
    }
    for (var hI = 0; hI < humans.length; hI++) {
      var hu = humans[hI];
      var botBest = best(decisions);
      var humanMax = hu.opts.win ? 3 : (hu.opts.pung || hu.opts.kong) ? 2 : 1;
      var botRank = botBest ? CLAIM_RANK[botBest.decision.type] : 0;
      if (humanMax < botRank || (humanMax === botRank && botBest.order < hu.order)) continue;
      var hd = await agents[hu.seat].claim(game, hu.seat, hu.opts);
      decisions.push({ seat: hu.seat, order: hu.order, decision: hd || { type: 'pass' } });
    }
    var winner = best(decisions);
    if (!winner) return null;
    winner.opts = options.filter(function (o) { return o.seat === winner.seat; })[0].opts;
    return winner;
  }

  async function runHand(game, agents, ui) {
    startHand(game);
    var h = game.hand;
    await emit(ui, 'handStart', {});

    for (var k = 0; k < 4; k++) {
      var seat0 = (game.dealer + k) % 4;
      await handleFlowers(game, seat0, ui);
    }
    for (var f = 0; f < 4; f++) {
      var fw = flowerWinCheck(game, (game.dealer + f) % 4);
      if (fw) return finishFlowerWin(game, (game.dealer + f) % 4, fw, ui);
    }

    var cur = game.dealer;
    var needDraw = false;
    for (;;) {
      h.turn = cur;
      await emit(ui, 'turn', { seat: cur });
      if (needDraw) {
        if (!h.wall.length) {
          var dr = settleDraw(game);
          await emit(ui, 'drawGame', dr);
          return dr;
        }
        var fromBack = h.kongChain > 0;
        var t = drawTile(game, cur, fromBack);
        h.drawnTile = t;
        await emit(ui, 'draw', { seat: cur, tile: t, replacement: fromBack });
        if (await handleFlowers(game, cur, ui)) {
          h.drawnTile = h.seats[cur].hand[h.seats[cur].hand.length - 1];
          var fw2 = flowerWinCheck(game, cur);
          if (fw2) return finishFlowerWin(game, cur, fw2, ui);
        }
      }
      needDraw = true;

      // Own-turn actions: win, kongs (each followed by a replacement draw), then discard.
      var discarded = null;
      while (!discarded) {
        var topts = turnOptions(game, cur);
        var action = await agents[cur].turn(game, cur, topts);
        if (action.type === 'win' && topts.win) {
          var resW = settleWin(game, cur, null, h.drawnTile, topts.win, 'selfDraw');
          await emit(ui, 'win', resW);
          return resW;
        }
        if (action.type === 'kong') {
          var kong = topts.kongs.filter(function (x) { return x.tile === action.tile; })[0];
          if (!kong) throw new Error('illegal kong ' + action.tile);
          if (kong.kind === 'added') {
            await emit(ui, 'kongAttempt', { seat: cur, tile: kong.tile });
            var rob = await resolveClaims(game, agents, ui, kong.tile, cur, true);
            if (rob && rob.decision.type === 'win') {
              removeTiles(h.seats[cur].hand, [kong.tile]);
              var resR = settleWin(game, rob.seat, cur, kong.tile, rob.opts.win, 'robKong');
              await emit(ui, 'win', resR);
              return resR;
            }
          }
          applyKong(game, cur, kong);
          await emit(ui, 'kong', { seat: cur, tile: kong.tile, kind: kong.kind });
          if (!h.wall.length) {
            var dr2 = settleDraw(game);
            await emit(ui, 'drawGame', dr2);
            return dr2;
          }
          var rep = drawTile(game, cur, true);
          h.drawnTile = rep;
          await emit(ui, 'draw', { seat: cur, tile: rep, replacement: true });
          if (await handleFlowers(game, cur, ui)) {
            h.drawnTile = h.seats[cur].hand[h.seats[cur].hand.length - 1];
            var fw3 = flowerWinCheck(game, cur);
            if (fw3) return finishFlowerWin(game, cur, fw3, ui);
          }
          continue;
        }
        var tile = action.tile;
        if (h.seats[cur].hand.indexOf(tile) === -1) throw new Error('illegal discard ' + tile);
        applyDiscard(game, cur, tile);
        discarded = tile;
        await emit(ui, 'discard', { seat: cur, tile: tile });
      }

      var claim = await resolveClaims(game, agents, ui, discarded, cur, false);
      if (claim && claim.decision.type === 'win') {
        markLastDiscardClaimed(game);
        var resD = settleWin(game, claim.seat, cur, discarded, claim.opts.win, 'discard');
        await emit(ui, 'win', resD);
        return resD;
      }
      if (claim) {
        var meld = applyClaim(game, claim.seat, claim.decision);
        await emit(ui, 'claim', { seat: claim.seat, from: cur, type: claim.decision.type, meld: meld, tile: discarded });
        cur = claim.seat;
        if (claim.decision.type === 'kong') {
          h.kongChain = 1;
        } else {
          needDraw = false;
        }
        continue;
      }
      cur = (cur + 1) % 4;
    }
  }

  async function finishFlowerWin(game, seat, fw, ui) {
    var res = settleWin(game, seat, fw.payer, null, fw.score, 'flowers');
    await emit(ui, 'win', res);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 8. Visible information (what a seat may legally know)
   * ------------------------------------------------------------------ */

  // Counts of every tile kind `seat` can see: own hand, all discards still in
  // the pond, and exposed melds (other players' concealed kongs stay hidden).
  function visibleCounts(game, seat) {
    var c = countsOf(game.hand.seats[seat].hand);
    game.hand.seats.forEach(function (s, i) {
      s.discards.forEach(function (d) {
        if (!d.claimed) c[tileIndex(d.tile)]++;
      });
      s.melds.forEach(function (m) {
        if (m.concealed && i !== seat) return;
        m.tiles.forEach(function (id) { c[tileIndex(id)]++; });
      });
    });
    return c;
  }

  function unseenCounts(game, seat) {
    var v = visibleCounts(game, seat);
    return v.map(function (n) { return Math.max(0, 4 - n); });
  }

  var api = {
    TILE_IDS: TILE_IDS,
    HONOR_IDS: HONOR_IDS,
    BONUS_IDS: BONUS_IDS,
    WIND_NAMES: WIND_NAMES,
    WIND_CN: WIND_CN,
    START_POINTS: START_POINTS,
    MIN_FAAN: MIN_FAAN,
    HKScoring: HKScoring,
    tileIndex: tileIndex,
    tileId: tileId,
    tileName: tileName,
    isBonus: isBonus,
    isHonorIndex: isHonorIndex,
    isTerminalOrHonorIndex: isTerminalOrHonorIndex,
    suitOfIndex: suitOfIndex,
    rankOfIndex: rankOfIndex,
    sortTiles: sortTiles,
    countsOf: countsOf,
    countIn: countIn,
    createRng: createRng,
    shuffle: shuffle,
    buildWall: buildWall,
    standardShanten: standardShanten,
    sevenPairsShanten: sevenPairsShanten,
    orphansShanten: orphansShanten,
    tripletsShanten: tripletsShanten,
    shanten: shanten,
    winningTiles: winningTiles,
    createGame: createGame,
    startHand: startHand,
    seatWind: seatWind,
    wallCount: wallCount,
    replaceFlowers: replaceFlowers,
    drawTile: drawTile,
    scoreWin: scoreWin,
    turnOptions: turnOptions,
    claimOptions: claimOptions,
    chowOptions: chowOptions,
    applyDiscard: applyDiscard,
    applyClaim: applyClaim,
    applyKong: applyKong,
    payments: payments,
    settleWin: settleWin,
    settleDraw: settleDraw,
    replaceBustedBots: replaceBustedBots,
    runHand: runHand,
    visibleCounts: visibleCounts,
    unseenCounts: unseenCounts,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MahjongEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
