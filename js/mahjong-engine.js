/* Hong Kong mahjong game engine for the Play page: tiles, wall, shanten,
   turn flow, claims, and settlement. Scoring is delegated to js/points.js
   (HKScoring.scoreHand) so the game and the Points Guide agree. */

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
  // The game's version (semantic versioning). Saved games carry it, and
  // load into any version with the same major number (see
  // saveCompatibility). Bump it with every change to the game: patch for
  // fixes, minor for features, major for changes that older saves can't
  // load into.
  var GAME_VERSION = '0.61.33';
  var SAVE_APP = 'lucky-cat-mahjong';

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
    var rng = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.state = function (v) { if (v !== undefined) a = v >>> 0; return a; };
    return rng;
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

  // Whole hands come back again and again (every plan, every discard), so
  // their answers are kept too, up to a limit.
  // Keyed by two numbers (the counts in base 5, half the tiles each).
  var handMemo = new Map();
  var handMemoSize = 0;
  var HAND_MEMO_MAX = 1000000;

  function standardShanten(c, declared) {
    var d = declared || 0;
    if (c.length !== 34 || d < 0 || d > 4) return solveStandard(c, declared);
    var hi = 0, lo = 0, i, n;
    for (i = 0; i < 17; i++) { n = c[i]; if (n > 4 || n < 0) return solveStandard(c, declared); hi = hi * 5 + n; }
    for (i = 17; i < 34; i++) { n = c[i]; if (n > 4 || n < 0) return solveStandard(c, declared); lo = lo * 5 + n; }
    lo = lo * 5 + d;
    var inner = handMemo.get(hi);
    if (inner) {
      var hit = inner.get(lo);
      if (hit !== undefined) return hit;
    } else {
      if (handMemoSize >= HAND_MEMO_MAX) { handMemo.clear(); handMemoSize = 0; }
      inner = new Map();
      handMemo.set(hi, inner);
    }
    var v = solveStandard(c, declared);
    inner.set(lo, v);
    handMemoSize++;
    return v;
  }

  function solveStandard(c, declared) {
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

  // Bot names: twelve, the first seven players who have won an
  // invitational tournament. Three sit at the table each game. (Keep it at
  // twelve: the shuffle draws from the game's generator, so seeded games
  // deal the same walls.)
  var BOT_NAMES = ['Vivien', 'Jackie', 'Jon', 'Donald', 'Katie', 'Kristie', 'Thomas', 'Mei', 'Kwan', 'Lulu', 'Wing', 'Rosa'];

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

  function windOf(dealer, seat) {
    return ((seat - dealer + 4) % 4) + 1;
  }

  function seatWind(game, seat) {
    return windOf(game.dealer, seat);
  }

  // Each hand's wall comes from its own seed (hand.seed), so a saved game
  // needs only that number to deal the hand again. Pass `seed` to deal a
  // particular hand. Otherwise the seed is the game generator's state, and
  // the generator moves on past the wall (the same walls as drawing them
  // from the game's generator directly).
  function startHand(game, seed) {
    game.handNumber++;
    var given = seed !== undefined && seed !== null;
    if (!given) seed = game.rng.state();
    seed = seed >>> 0;
    var handRng = createRng(seed);
    // A lesson deals a fixed wall (game.fixedWall) instead of shuffling.
    var wall = game.fixedWall ? game.fixedWall.slice() : buildWall(handRng);
    if (!given) game.rng.state(handRng.state());
    var seats = [0, 1, 2, 3].map(function () {
      return { hand: [], melds: [], flowers: [], discards: [] };
    });
    var h = {
      seed: seed,
      // Winds as this hand was dealt. The deal can pass on before the hand
      // object is replaced, and a playback seed still has to name these.
      dealer: game.dealer,
      round: game.round,
      moves: [], // the human player's decisions this hand, in order (see runHand)
      trace: [], // every seat's draws, discards, and claims, for a playback seed
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
    meld.at = s.discards.length; // how many tiles they had thrown when they melded (for "safe since" reads)
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
      s.melds.push({ type: 'kong', tiles: [kong.tile, kong.tile, kong.tile, kong.tile], from: null, concealed: true, at: s.discards.length });
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

  // Payment rule from the Points Guide: on a self-draw each
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

    // A dealer who wins deals again, and anything else, a drawn hand too,
    // passes the deal on. A full game (settings.mode 'payout') is four rounds,
    // each dealer in turn, so at least 16 hands. It ends when the deal comes
    // back round after the last round; points can go negative. Practice runs
    // on without end.
    var fullGame = game.settings.mode === 'payout';
    var dealerKeeps = result.winner === game.dealer;
    result.dealerKeeps = dealerKeeps;
    if (dealerKeeps) {
      game.dealerRepeat++;
    } else {
      game.dealerRepeat = 0;
      game.dealer = (game.dealer + 1) % 4;
      if (game.dealer === game.firstDealer) {
        if (fullGame && game.round >= 4) {
          game.over = true;
        } else {
          game.round = game.round % 4 + 1;
          result.roundAdvanced = true;
        }
      }
    }
    game.history.push(result);
    game.hand.result = result;
    // When the hand ended (ms), for its playback: a list says "Finished today, 2:30 PM".
    game.hand.endedAt = Date.now();
  }

  // One finished hand for the results table. In a payout game, faan is the
  // winning hand's value and points are what each seat paid or collected.
  // Practice pays nothing, so the same hand's faan moves instead: the
  // discarder pays it, and a self-draw collects it from every other seat.
  // The tiles stay out of this, so a save can keep the table without a hand.
  function resultsRow(result) {
    var faan = [0, 0, 0, 0];
    var points = [0, 0, 0, 0];
    var deltas = result && result.deltas;
    if (deltas) {
      for (var i = 0; i < 4; i++) points[i] = deltas[i] || 0;
    }
    if (result && result.type === 'win' && result.score) {
      var n = result.score.faan || 0;
      var paid = points.some(function (d) { return d; });
      if (!paid && n) {
        var payer = result.payer;
        if (payer === null || payer === undefined) {
          for (var s = 0; s < 4; s++) {
            if (s === result.winner) continue;
            faan[s] -= n;
            faan[result.winner] += n;
          }
        } else {
          faan[result.winner] += n;
          faan[payer] -= n;
        }
      } else if (n) {
        faan[result.winner] = n;
      }
    }
    return {
      hand: result ? result.handNumber : 0,
      draw: !result || result.type !== 'win',
      faan: faan,
      points: points,
    };
  }

  // The players from most points to fewest, with their places (a tie
  // shares a place): [{ seat, name, points, place }].
  function finalStandings(game) {
    var list = game.players.map(function (p, seat) {
      return { seat: seat, name: p.name, points: p.points };
    }).sort(function (a, b) { return b.points - a.points; });
    list.forEach(function (row, k) {
      row.place = k && list[k - 1].points === row.points ? list[k - 1].place : k + 1;
    });
    return list;
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

  function logAction(game, ev) {
    if (game.hand && game.hand.trace) game.hand.trace.push(ev);
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

  // One flower, then the tile that replaces it, then the next flower.
  // A replacement that is itself a flower waits its turn.
  async function handleFlowers(game, seat, ui) {
    var n = 0;
    var s = game.hand.seats[seat];
    for (;;) {
      var idx = -1;
      for (var i = 0; i < s.hand.length; i++) {
        if (isBonus(s.hand[i])) { idx = i; break; }
      }
      if (idx === -1) break;
      var f = s.hand.splice(idx, 1)[0];
      s.flowers.push(f);
      await emit(ui, 'flower', { seat: seat, tile: f });
      logAction(game, { a: 'flower', s: seat, t: f });
      n++;
      if (!game.hand.wall.length) break;
      var rep = game.hand.wall.pop();
      game.hand.backDrawn++;
      s.hand.push(rep);
      await emit(ui, 'draw', { seat: seat, tile: rep, replacement: true });
      logAction(game, { a: 'draw', s: seat, t: rep, k: 'flower' });
    }
    return n;
  }

  // Whether a claim decision is one of the options offered.
  function claimAllowed(o, d) {
    if (d.type === 'pass') return true;
    if (d.type === 'win' || d.type === 'pung' || d.type === 'kong') return !!o[d.type];
    if (d.type === 'chow') {
      var want = (d.tiles || []).slice().sort().join();
      return (o.chows || []).some(function (pair) { return pair.slice().sort().join() === want; });
    }
    return false;
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
      var hd = await agents[hu.seat].claim(game, hu.seat, hu.opts) || { type: 'pass' };
      if (!claimAllowed(hu.opts, hd)) throw new Error('illegal claim ' + hd.type);
      decisions.push({ seat: hu.seat, order: hu.order, decision: hd });
    }
    var winner = best(decisions);
    if (!winner) return null;
    winner.opts = options.filter(function (o) { return o.seat === winner.seat; })[0].opts;
    return winner;
  }

  // Plays one hand. Every decision is recorded in hand.moves, { k: kind,
  // d: decision, s: seat }, so the hand can be played again from its seed:
  // with opts.seed and opts.replay (those moves), the hand is dealt from the
  // seed and every seat's moves are taken from the list, with no events sent
  // to the ui. When the list runs out, opts.onReplayEnd() is called and the
  // hand goes on live. The bots' moves are kept too, so a saved hand comes back
  // the same after a bot changes (a new model or rule).
  //
  // Saves before 0.61.33 kept only the human's moves (no s), and the bots
  // played again. If a bot now plays differently, a saved move can stop
  // fitting the hand: then the replay stops there and the hand goes on live,
  // instead of the table waiting forever.
  async function runHand(game, agents, ui, opts) {
    opts = opts || {};
    var queue = (opts.replay || []).slice();
    var replaying = !!opts.replay;
    var everySeat = queue.some(function (m) { return m && typeof m.s === 'number'; });
    var liveUi = ui;
    ui = { emit: function (name, data) { return replaying ? Promise.resolve() : emit(liveUi, name, data); } };
    function endReplay() {
      if (!replaying) return;
      replaying = false;
      queue.length = 0;
      if (opts.onReplayEnd) opts.onReplayEnd();
    }
    // A saved move fits when it is a choice the hand offers now.
    function fits(move, kind, seat, o) {
      if (!move || move.k !== kind || !move.d || typeof move.d !== 'object') return false;
      if (everySeat && move.s !== seat) return false;
      var d = move.d;
      if (kind === 'claim') return claimAllowed(o || {}, d);
      if (d.type === 'win') return !!(o && o.win);
      if (d.type === 'kong') return !!(o && (o.kongs || []).some(function (x) { return x.tile === d.tile; }));
      if (d.type === 'discard') return game.hand.seats[seat].hand.indexOf(d.tile) !== -1;
      return false;
    }
    // Only what the engine reads from a decision is saved.
    function kept(d) {
      if (!d || typeof d !== 'object') return d;
      var m = { type: d.type };
      if (d.tile != null) m.tile = d.tile;
      if (d.tiles) m.tiles = d.tiles.slice();
      return m;
    }
    function ask(seat, kind, gameArg, opts2) {
      var agent = realAgents[seat];
      var human = game.players[seat].isHuman;
      if (replaying && queue.length && (everySeat || human)) {
        if (fits(queue[0], kind, seat, opts2)) {
          var move = queue.shift();
          // The table rebuilds the coach's notes here. The move is still unplayed.
          if (human && liveUi && typeof liveUi.replayDecision === 'function') liveUi.replayDecision(kind, opts2, move.d);
          game.hand.moves.push({ k: move.k, d: move.d, s: seat });
          return Promise.resolve(move.d);
        }
        endReplay(); // the saved hand no longer fits: go on live from here
      }
      if (replaying && (everySeat || human)) endReplay();
      return Promise.resolve(agent[kind](gameArg, seat, opts2)).then(function (d) {
        game.hand.moves.push({ k: kind, d: human ? d : kept(d), s: seat });
        return d;
      });
    }
    var realAgents = agents;
    agents = [0, 1, 2, 3].map(function (seat) {
      return {
        turn: function (g, s, o) { return ask(seat, 'turn', g, o); },
        claim: function (g, s, o) { return ask(seat, 'claim', g, o); },
      };
    });
    startHand(game, opts.seed);
    // A hand that ends while replaying still ends the replay.
    var res = await playHand(game, agents, ui);
    endReplay();
    return res;
  }

  // The hand itself, from the deal to a win or a drawn hand.
  async function playHand(game, agents, ui) {
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
          logAction(game, { a: 'drawGame' });
          await emit(ui, 'drawGame', dr);
          return dr;
        }
        var fromBack = h.kongChain > 0;
        var t = drawTile(game, cur, fromBack);
        h.drawnTile = t;
        await emit(ui, 'draw', { seat: cur, tile: t, replacement: fromBack });
        logAction(game, { a: 'draw', s: cur, t: t, k: fromBack ? 'kong' : 'wall' });
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
        if (!action || (action.type === 'win' && !topts.win)) throw new Error('illegal turn action');
        if (action.type === 'win' && topts.win) {
          var resW = settleWin(game, cur, null, h.drawnTile, topts.win, 'selfDraw');
          logAction(game, { a: 'win', s: cur, how: 'selfDraw', t: h.drawnTile });
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
              logAction(game, { a: 'win', s: rob.seat, how: 'robKong', t: kong.tile, from: cur });
              await emit(ui, 'win', resR);
              return resR;
            }
          }
          applyKong(game, cur, kong);
          logAction(game, { a: 'kong', s: cur, t: kong.tile, k: kong.kind });
          await emit(ui, 'kong', { seat: cur, tile: kong.tile, kind: kong.kind });
          if (!h.wall.length) {
            var dr2 = settleDraw(game);
            logAction(game, { a: 'drawGame' });
            await emit(ui, 'drawGame', dr2);
            return dr2;
          }
          var rep = drawTile(game, cur, true);
          h.drawnTile = rep;
          await emit(ui, 'draw', { seat: cur, tile: rep, replacement: true });
          // A claim kong's replacement is drawn on the next turn. This one
          // is drawn here, and the replay has to take the same tile.
          logAction(game, { a: 'draw', s: cur, t: rep, k: 'kong' });
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
        logAction(game, { a: 'discard', s: cur, t: tile });
        await emit(ui, 'discard', { seat: cur, tile: tile });
      }

      var claim = await resolveClaims(game, agents, ui, discarded, cur, false);
      if (claim && claim.decision.type === 'win') {
        markLastDiscardClaimed(game);
        var resD = settleWin(game, claim.seat, cur, discarded, claim.opts.win, 'discard');
        logAction(game, { a: 'win', s: claim.seat, how: 'discard', t: discarded, from: cur });
        await emit(ui, 'win', resD);
        return resD;
      }
      if (claim) {
        logAction(game, {
          a: 'claim', s: claim.seat, from: cur, t: discarded, c: claim.decision.type,
          tiles: claim.decision.tiles ? claim.decision.tiles.slice() : null,
        });
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
    logAction(game, { a: 'win', s: seat, how: 'flowers' });
    await emit(ui, 'win', res);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 7b. Saving and loading
   *    A save holds no hidden tiles: the game between hands (players,
   *    points, dealer, round), and for a hand in progress only its seed
   *    and your own moves. Loading deals the hand from the seed and plays
   *    it again (runHand with opts.replay). The file is signed (an HMAC of
   *    its contents), so a changed or damaged file won't load.
   * ------------------------------------------------------------------ */

  // The signing key ships with the page, so this catches corruption and
  // casual edits, not a determined cheat.
  var SAVE_KEY = 'lucky-cat-mahjong/save/v1/8f3c1e9a5b7d4f60a2c9e1b3d5f7a9c1';

  function parseVersion(v) {
    var m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  // Whether a save written by `version` loads into this one: any minor or
  // patch version of the same major version does. Returns { ok, reason, kind,
  // fileVersion, gameVersion }; `kind` says what is wrong: 'missing' (no
  // version), 'newer' or 'older' (another major version).
  function saveCompatibility(version) {
    var have = parseVersion(GAME_VERSION);
    var got = parseVersion(version);
    var info = { fileVersion: version == null ? null : String(version), gameVersion: GAME_VERSION };
    function no(kind, reason) { return { ok: false, kind: kind, reason: reason, fileVersion: info.fileVersion, gameVersion: info.gameVersion }; }
    if (!got) return no('missing', 'This file has no game version, so it can\'t be loaded.');
    if (got[0] > have[0]) return no('newer', 'Saved by version ' + version + ', newer than this game (' + GAME_VERSION + '). Reload the page to update.');
    if (got[0] !== have[0]) return no('older', 'Saved by version ' + version + ', which doesn\'t load in version ' + GAME_VERSION + '.');
    return { ok: true, kind: null, reason: null, fileVersion: info.fileVersion, gameVersion: info.gameVersion };
  }

  // The game as it stood when the current hand began, plus that hand's
  // seed and your moves in it (none between hands).
  function gameRecord(game) {
    var h = game.hand;
    var playing = !!(h && !h.result);
    return {
      settings: game.settings,
      players: game.players.map(function (p) { return { name: p.name, isHuman: p.isHuman, points: p.points }; }),
      round: game.round,
      dealer: game.dealer,
      firstDealer: game.firstDealer,
      handNumber: playing ? game.handNumber - 1 : game.handNumber,
      dealerRepeat: game.dealerRepeat,
      over: game.over,
      hand: playing ? { seed: h.seed, moves: h.moves.slice() } : null,
    };
  }

  // A game from gameRecord's data, with a fresh generator for later hands.
  // Play `record.hand` with runHand(game, agents, ui, { seed, replay }).
  function restoreGame(record) {
    var r = record || {};
    var ok = Array.isArray(r.players) && r.players.length === 4 && r.settings &&
      [r.round, r.dealer, r.firstDealer, r.handNumber, r.dealerRepeat].every(function (n) { return typeof n === 'number'; }) &&
      (!r.hand || (typeof r.hand.seed === 'number' && Array.isArray(r.hand.moves)));
    if (!ok) throw new Error('not a saved game');
    var game = createGame({ spicy: r.settings.spicy, mode: r.settings.mode, startPoints: r.settings.startPoints });
    game.players = r.players.map(function (p) { return { name: String(p.name), isHuman: !!p.isHuman, points: +p.points }; });
    game.round = r.round;
    game.dealer = r.dealer;
    game.firstDealer = r.firstDealer;
    game.handNumber = r.handNumber;
    game.dealerRepeat = r.dealerRepeat;
    game.over = !!r.over;
    return game;
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  // SHA-256 of bytes, for browsers without Web Crypto: it's only offered
  // on https and localhost, so a phone on the local network over plain
  // http would otherwise be unable to save (or keep the game on refresh).
  var SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function sha256(bytes) {
    var n = bytes.length;
    var total = Math.ceil((n + 9) / 64) * 64;
    var m = new Uint8Array(total);
    m.set(bytes);
    m[n] = 0x80;
    var bits = n * 8;
    for (var b = 0; b < 8; b++) m[total - 1 - b] = Math.floor(bits / Math.pow(2, 8 * b)) & 0xff;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    var rotr = function (x, k) { return (x >>> k) | (x << (32 - k)); };
    for (var off = 0; off < total; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = (m[off + 4 * i] << 24) | (m[off + 4 * i + 1] << 16) | (m[off + 4 * i + 2] << 8) | m[off + 4 * i + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[4 * i] = h[i] >>> 24; out[4 * i + 1] = (h[i] >>> 16) & 0xff; out[4 * i + 2] = (h[i] >>> 8) & 0xff; out[4 * i + 3] = h[i] & 0xff;
    }
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    var key = keyBytes.length > 64 ? sha256(keyBytes) : keyBytes;
    var inner = new Uint8Array(64 + msgBytes.length);
    var outer = new Uint8Array(64 + 32);
    for (var i = 0; i < 64; i++) {
      var k = i < key.length ? key[i] : 0;
      inner[i] = k ^ 0x36;
      outer[i] = k ^ 0x5c;
    }
    inner.set(msgBytes, 64);
    outer.set(sha256(inner), 64);
    return sha256(outer);
  }

  // HMAC-SHA256 of a save's app, version and payload, as hex: Web Crypto
  // where the browser offers it, the same thing in plain JS where not.
  async function saveSignature(file) {
    var enc = new TextEncoder();
    var body = file.app + '|' + file.version + '|' + JSON.stringify(file.payload);
    var subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return hex(hmacSha256(enc.encode(SAVE_KEY), enc.encode(body)));
    var key = await subtle.importKey('raw', enc.encode(SAVE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await subtle.sign('HMAC', key, enc.encode(body)));
  }

  // A signed save file for `payload` (gameRecord's data under `game`, and
  // anything else the table keeps).
  async function makeSave(payload) {
    var file = { app: SAVE_APP, version: GAME_VERSION, payload: payload };
    file.signature = await saveSignature(file);
    return file;
  }

  // Checks a save file. Returns { ok, reason }.
  async function checkSave(file) {
    if (!file || file.app !== SAVE_APP || !file.payload || !file.payload.game) {
      return { ok: false, reason: 'That isn\'t a Lucky Cat Mahjong save file.' };
    }
    var compat = saveCompatibility(file.version);
    if (!compat.ok) return compat;
    var sig = await saveSignature(file);
    if (sig !== file.signature) return { ok: false, reason: 'That save file was changed or damaged, so it can\'t be loaded.' };
    try { restoreGame(file.payload.game); } catch (err) { return { ok: false, reason: 'That save file is damaged, so it can\'t be loaded.' }; }
    return { ok: true, reason: null };
  }

  /* ------------------------------------------------------------------ *
   * 7c. Hand seeds and playback
   *    A hand seed is the shuffle number plus your seat wind and the
   *    round wind ("458555827-SE"). The Points Guide deals your starting
   *    hand from it (dealtHand).
   *    The wind badge stores a playback file: that record, signed with
   *    the same HMAC as a save, so a changed file won't play. `moves` is
   *    how far the table may go.
   * ------------------------------------------------------------------ */

  var PLAYBACK_APP = 'lucky-cat-mahjong-playback';

  var WIND_LETTERS = ['', 'E', 'S', 'W', 'N'];

  function handSeedText(game, seat) {
    return (game.hand.seed >>> 0) + '-' + WIND_LETTERS[seatWind(game, seat)] + WIND_LETTERS[game.round];
  }

  // { seed, seat, round } (winds 1-4), or null if `text` isn't a hand seed.
  function parseHandSeed(text) {
    var m = /^\s*(\d{1,10})-([ESWN])([ESWN])\s*$/i.exec(String(text || ''));
    if (!m || +m[1] > 4294967295) return null;
    return {
      seed: +m[1],
      seat: WIND_LETTERS.indexOf(m[2].toUpperCase()),
      round: WIND_LETTERS.indexOf(m[3].toUpperCase()),
    };
  }

  // The starting hand dealt from `seed` to the seat with wind `seat`
  // (1 East, the dealer, with 14 tiles), after every seat's flowers are
  // replaced in turn from the dealer, as runHand does: { hand, flowers }.
  function dealtHand(seed, seat) {
    var game = { handNumber: 0, dealer: 0, rng: createRng(1) };
    startHand(game, seed);
    for (var k = 0; k < 4; k++) replaceFlowers(game, k);
    var s = game.hand.seats[seat - 1];
    return { hand: sortTiles(s.hand.slice()), flowers: s.flowers.slice() };
  }

  function playbackRecord(game, info) {
    info = info || {};
    if (!game || !game.hand) return null;
    var seat = info.seat || 0;
    var dealer = game.hand.dealer != null ? game.hand.dealer : game.dealer;
    var round = game.hand.round != null ? game.hand.round : game.round;
    var head = (game.hand.seed >>> 0) + '-' + WIND_LETTERS[windOf(dealer, seat)] + WIND_LETTERS[round];
    var winds = parseHandSeed(head);
    var strategies = info.strategies || [];
    var actions = game.hand.trace.slice();
    var out = {
      v: 1,
      handSeed: head,
      seed: game.hand.seed >>> 0,
      seat: winds.seat,
      round: winds.round,
      dealer: dealer,
      handNumber: game.handNumber,
      moves: actions.length,
      players: game.players.map(function (p, i) {
        var s = game.hand.seats[i];
        var row = {
          name: p.name,
          wind: windOf(dealer, i),
          hand: s.hand.slice(),
          flowers: s.flowers.slice(),
          melds: s.melds.map(function (m) {
            return { type: m.type, tiles: m.tiles.slice(), from: m.from == null ? null : m.from, concealed: !!m.concealed };
          }),
          discards: s.discards.map(function (d) { return { tile: d.tile, claimed: !!d.claimed }; }),
        };
        if (strategies[i]) row.strategy = strategies[i];
        return row;
      }),
      actions: actions,
    };
    // A finished hand's file says when it ended. It's signed with the rest,
    // so it can't be changed. Files from before have none.
    if (game.hand.result && game.hand.endedAt) out.endedAt = game.hand.endedAt;
    return out;
  }

  function playbackText(game, info) {
    var rec = playbackRecord(game, info);
    if (!rec) return '';
    return rec.handSeed + '\n' + JSON.stringify(rec);
  }

  // HMAC-SHA256 of the file's app, version, move count, and payload.
  // The plain implementation matches Web Crypto, and works on plain http.
  function playbackBody(file) {
    return file.app + '|' + file.version + '|' + file.moves + '|' + JSON.stringify(file.payload);
  }

  function playbackSign(file) {
    var enc = new TextEncoder();
    return hex(hmacSha256(enc.encode(SAVE_KEY), enc.encode(playbackBody(file))));
  }

  function makePlayback(game, info) {
    var payload = playbackRecord(game, info);
    if (!payload) return null;
    var file = { app: PLAYBACK_APP, version: GAME_VERSION, moves: payload.moves, payload: payload };
    file.signature = playbackSign(file);
    return file;
  }

  function playbackShape(rec) {
    if (!rec || rec.v !== 1 || !Array.isArray(rec.actions) || !Array.isArray(rec.players) || rec.players.length !== 4) return false;
    if (!rec.players.every(function (p) { return p && Array.isArray(p.hand); })) return false;
    var winds = parseHandSeed((rec.seed >>> 0) + '-' + WIND_LETTERS[rec.seat] + WIND_LETTERS[rec.round]);
    return !!(winds && winds.seed === rec.seed && winds.seat === rec.seat && winds.round === rec.round);
  }

  // { ok, reason, record }. `record.moves` is the last step the table may show.
  // A signed file, or that file with its hand seed on the line above it.
  function playbackFileFrom(input) {
    if (input && typeof input === 'object') return input;
    var raw = String(input || '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) {}
    var nl = raw.indexOf('\n');
    if (nl === -1 || !parseHandSeed(raw.slice(0, nl))) return null;
    try { return JSON.parse(raw.slice(nl + 1)); } catch (e2) { return null; }
  }

  // { ok, reason, code, record }. `code` says why a file failed: 'notFile'
  // (not a playback file), 'version' (saved by a version this game can't
  // load; versionKind, fileVersion and gameVersion say how), 'signature' (the HMAC signature doesn't match: the file was
  // changed or damaged after it was saved) or 'damaged' (its contents don't
  // fit together).
  function checkPlayback(input) {
    var file = playbackFileFrom(input);
    var notFile = { ok: false, code: 'notFile', reason: 'That isn\'t a playback file. Upload a JSON playback file.' };
    if (typeof input === 'string' && !file) return notFile;
    if (!file || file.app !== PLAYBACK_APP || !file.payload) return notFile;
    var compat = saveCompatibility(file.version);
    if (!compat.ok) {
      return { ok: false, code: 'version', versionKind: compat.kind, fileVersion: compat.fileVersion, gameVersion: compat.gameVersion, reason: compat.reason };
    }
    var changed = 'That playback was changed or damaged, so it can\'t be played.';
    if (!playbackShape(file.payload)) return { ok: false, code: 'damaged', reason: changed };
    if (playbackSign(file) !== file.signature) return { ok: false, code: 'signature', reason: changed };
    if (file.payload.actions.length !== file.moves || (file.payload.moves != null && file.payload.moves !== file.moves)) {
      return { ok: false, code: 'damaged', reason: changed };
    }
    var rec = JSON.parse(JSON.stringify(file.payload));
    rec.moves = file.moves;
    rec.actions = rec.actions.slice(0, file.moves);
    return { ok: true, reason: null, code: null, record: rec };
  }

  function parsePlayback(text) {
    var raw = String(text || '').trim();
    var nl = raw.indexOf('\n');
    if (nl === -1) return null;
    var winds = parseHandSeed(raw.slice(0, nl));
    if (!winds) return null;
    var rec;
    try { rec = JSON.parse(raw.slice(nl + 1)); } catch (e) { return null; }
    if (!rec || rec.v !== 1 || rec.seed !== winds.seed || rec.seat !== winds.seat || rec.round !== winds.round) return null;
    if (!Array.isArray(rec.actions) || !Array.isArray(rec.players) || rec.players.length !== 4) return null;
    if (!rec.players.every(function (p) { return p && Array.isArray(p.hand); })) return null;
    return rec;
  }

  function playbackWho(rec, seat) {
    var p = rec.players[seat];
    if (!p) return 'Seat ' + (seat + 1);
    // The player's name, or their wind when the file has none.
    if (p.name) return p.name;
    return WIND_NAMES[p.wind] || ('Seat ' + (seat + 1));
  }

  // What a win was scored for beyond the hand itself: how it was won, and
  // flowers. The rest of a score's items are the hand's patterns.
  var EXTRAS = ['Self-Draw', 'Concealed', 'Win on Last Tile', 'Robbing the Kong', 'Win by Kong',
    'Win by Double Kong', 'Heavenly Hand', 'Earthly Hand', 'No Flowers', 'Seat Flower', 'Seat Season',
    'Four Flowers', 'Four Seasons', 'Seven Robbing One', 'Eight Immortals Crossing the Sea'];

  // A playback's ending as the game settled it: the same shape as runHand's
  // result ({ type: 'win', winner, payer, tile, how, score, deltas,
  // concealed, melds, flowers, seatWind, round, handNumber }, or
  // { type: 'draw', ... }), scored again from the file as the hand stood when
  // it ended. null when the hand isn't finished. The results card shows it.
  function playbackResult(rec) {
    if (!rec || !Array.isArray(rec.actions)) return null;
    var limit = typeof rec.moves === 'number' && rec.moves >= 0 ? Math.min(rec.actions.length, rec.moves) : rec.actions.length;
    var ev = limit ? rec.actions[limit - 1] : null;
    if (!ev || (ev.a !== 'win' && ev.a !== 'drawGame')) return null;
    var game;
    try { game = playbackGame(rec, limit - 1); } catch (e) { return null; }
    if (!game) return null;
    var handNumber = rec.handNumber || game.handNumber;
    if (ev.a === 'drawGame') return { type: 'draw', deltas: [0, 0, 0, 0], round: game.round, handNumber: handNumber };
    var seat = ev.s;
    var score = null, payer = null, tile = ev.t || null;
    if (ev.how === 'flowers') {
      var fw = flowerWinCheck(game, seat);
      if (fw) { score = fw.score; payer = fw.payer; }
      tile = null;
    } else {
      var self = ev.how === 'selfDraw';
      // The same flags the game scored it with (Win on Last Tile, Earthly Hand, ...).
      var flags = self ? selfDrawFlags(game, seat)
        : ev.how === 'robKong' ? { robKong: true } : discardFlags(game, seat, ev.from);
      score = scoreWin(game, seat, self ? null : ev.t, flags);
      payer = self ? null : (ev.from != null ? ev.from : null);
    }
    if (!score || !score.valid) return null;
    var s = game.hand.seats[seat];
    return {
      type: 'win',
      winner: seat,
      payer: payer,
      tile: tile,
      how: ev.how,
      score: score,
      deltas: payments(game, seat, payer, score.points),
      concealed: sortTiles(s.hand.concat(tile && ev.how !== 'selfDraw' && ev.how !== 'flowers' ? [tile] : [])),
      melds: s.melds.map(function (m) { return { type: m.type, tiles: m.tiles.slice(), concealed: m.concealed }; }),
      flowers: s.flowers.slice(),
      seatWind: seatWind(game, seat),
      round: game.round,
      handNumber: handNumber,
    };
  }

  // Who won a playback's hand and with which hand: { seat, name, how, hand,
  // patterns, faan }, or null for a hand with no winner (or not finished).
  // `hand` is only the most important pattern, the one worth the most faan
  // (the first of them on a tie), so it stays short: "Half Flush", not "Half
  // Flush + Dragon Triplet". `patterns` has all of them, best first.
  function playbackWinner(rec) {
    if (!rec || !Array.isArray(rec.actions)) return null;
    var limit = typeof rec.moves === 'number' && rec.moves >= 0 ? Math.min(rec.actions.length, rec.moves) : rec.actions.length;
    var ev = limit ? rec.actions[limit - 1] : null;
    if (!ev || ev.a !== 'win') return null;
    var out = { seat: ev.s, name: playbackWho(rec, ev.s), how: ev.how, hand: null, patterns: [], faan: null };
    var res = playbackResult(rec);
    if (res && res.score) {
      var items = res.score.items || [];
      var patterns = items.filter(function (it) { return EXTRAS.indexOf(it.name) === -1; });
      var ranked = (patterns.length ? patterns : items).map(function (it, i) { return { name: it.name, faan: it.faan || 0, at: i }; })
        .sort(function (a, b) { return b.faan - a.faan || a.at - b.at; });
      out.patterns = ranked.map(function (it) { return it.name; });
      out.hand = out.patterns[0] || null;
      out.faan = res.score.faan;
    }
    return out;
  }

  // A playback for a list: who won and with which hand, and which hand of
  // the game it was. { result: "Katie won with Full Flush · 10 faan",
  // hand: "Hand 3 · East round", number: "Hand 3" } (`number` is the short
  // form a row shows; `hand` has the round too, for a screen reader).
  function playbackSummary(rec) {
    if (!rec || !Array.isArray(rec.actions)) return { result: 'A playback', hand: '', number: '' };
    var number = 'Hand ' + (rec.handNumber || 1);
    var hand = number + ' · ' + (WIND_NAMES[rec.round] || 'East') + ' round';
    var limit = typeof rec.moves === 'number' && rec.moves >= 0 ? Math.min(rec.actions.length, rec.moves) : rec.actions.length;
    var last = limit ? rec.actions[limit - 1] : null;
    var result;
    if (last && last.a === 'win') {
      var w = playbackWinner(rec);
      result = w.name + ' won' + (w.hand ? ' with ' + w.hand : '') + (w.faan != null ? ' · ' + w.faan + ' faan' : '') +
        (w.how === 'selfDraw' ? ' (self\u2011draw)' : ''); // a hyphen that doesn't break the line
    } else if (last && last.a === 'drawGame') {
      result = 'No winner: the wall ran out';
    } else {
      result = 'Still being played';
    }
    return { result: result, hand: hand, number: number };
  }

  // When a playback was saved, for people: "Today, 2:30 PM", "Yesterday,
  // 9:05 AM", "Wed, Nov 5, 2:30 PM". `now` is for tests. No time: "Earlier".
  function playbackWhen(ms, now) {
    if (ms == null || !isFinite(ms)) return 'Earlier';
    var d = new Date(ms);
    var today = new Date(now == null ? Date.now() : now);
    var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    var startOf = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var days = Math.round((startOf(today) - startOf(d)) / 86400000);
    if (days === 0) return 'Today, ' + time;
    if (days === 1) return 'Yesterday, ' + time;
    var opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts) + ', ' + time;
  }

  // The playback bar's caption for the steps from..step (one move): its
  // claims and discard, without the draws. Before the first discard, the only
  // steps are the players swapping out their flowers: 'Replacing flowers.'
  // Step 0 is the deal.
  function playbackCaption(rec, from, step, lines) {
    if (!step || !rec || !Array.isArray(rec.actions)) return 'The deal.';
    lines = lines || playbackLines(rec);
    var parts = [];
    var flowers = false;
    for (var i = from; i < step; i++) {
      var ev = rec.actions[i];
      if (ev && ev.a === 'flower') flowers = true;
      if (ev && (ev.a === 'draw' || ev.a === 'flower') && step - from > 1) continue;
      if (lines[i]) parts.push(lines[i]);
    }
    return parts.join(' ') || (flowers ? 'Replacing flowers.' : 'The deal.');
  }

  // Each recorded action as a sentence in the past tense, such as "You
  // discarded Four Circle." or "Katie won on South Wind from Lulu."
  function playbackLines(rec) {
    if (!rec || !Array.isArray(rec.actions)) return [];
    return rec.actions.map(function (ev) {
      var who = playbackWho(rec, ev.s);
      if (ev.a === 'flower') return who + ' set aside ' + tileName(ev.t) + '.';
      if (ev.a === 'draw') return who + ' drew ' + tileName(ev.t) + (ev.k && ev.k !== 'wall' ? ' as a replacement.' : '.');
      if (ev.a === 'discard') return who + ' discarded ' + tileName(ev.t) + '.';
      if (ev.a === 'claim') {
        var verb = ev.c === 'chow' ? 'chowed' : ev.c === 'kong' ? 'konged' : 'punged';
        var tiles = ev.c === 'chow' ? sortTiles((ev.tiles || []).concat([ev.t])).map(tileName).join(', ') : tileName(ev.t);
        return who + ' ' + verb + ' ' + tiles + ' from ' + playbackWho(rec, ev.from) + '.';
      }
      if (ev.a === 'kong') {
        return ev.k === 'added'
          ? who + ' added a ' + tileName(ev.t) + ' to the pung.'
          : who + ' declared a concealed kong of ' + tileName(ev.t) + '.';
      }
      if (ev.a === 'win') {
        if (ev.how === 'flowers') return who + ' won with flowers.';
        if (ev.how === 'selfDraw') return who + ' won by self-draw on ' + tileName(ev.t) + '.';
        if (ev.how === 'robKong') return who + ' won by robbing the kong of ' + tileName(ev.t) + ' from ' + playbackWho(rec, ev.from) + '.';
        return who + ' won on ' + tileName(ev.t) + ' from ' + playbackWho(rec, ev.from) + '.';
      }
      if (ev.a === 'drawGame') return 'The wall ran out. Draw game.';
      return 'Move.';
    });
  }

  // One recorded action, applied the same way the hand played it.
  // Returns { mark, win } for the table to highlight. Throws if the wall
  // or a hand doesn't hold the tile the record names.
  function applyPlaybackAction(game, ev) {
    var h = game.hand;
    var s = h.seats[ev.s];
    if (ev.a === 'flower') {
      var at = s.hand.indexOf(ev.t);
      if (at < 0) throw new Error('playback flower missing ' + ev.t);
      s.hand.splice(at, 1);
      s.flowers.push(ev.t);
      h.turn = ev.s;
      return { mark: { seat: ev.s, tile: ev.t, where: 'flower' } };
    }
    if (ev.a === 'draw') {
      var t = drawTile(game, ev.s, ev.k === 'flower' || ev.k === 'kong');
      if (t !== ev.t) throw new Error('playback draw diverged');
      h.drawnTile = t;
      h.turn = ev.s;
      return { mark: { seat: ev.s, tile: t, where: 'hand' } };
    }
    if (ev.a === 'discard') {
      applyDiscard(game, ev.s, ev.t);
      h.turn = ev.s;
      return { mark: { seat: ev.s, tile: ev.t, where: 'pond' } };
    }
    if (ev.a === 'claim') {
      applyClaim(game, ev.s, { type: ev.c, tiles: ev.tiles });
      h.turn = ev.s;
      return { mark: { seat: ev.s, tile: ev.t, where: 'meld' } };
    }
    if (ev.a === 'kong') {
      applyKong(game, ev.s, { tile: ev.t, kind: ev.k });
      h.turn = ev.s;
      return { mark: { seat: ev.s, tile: ev.t, where: 'meld' } };
    }
    if (ev.a === 'win') {
      if (ev.how === 'robKong') removeTiles(h.seats[ev.from].hand, [ev.t]);
      else if (ev.how === 'discard') markLastDiscardClaimed(game);
      h.turn = ev.s;
      return { mark: ev.t ? { seat: ev.s, tile: ev.t, where: 'hand' } : null, win: ev };
    }
    if (ev.a === 'drawGame') return { mark: null };
    throw new Error('playback action ' + ev.a);
  }

  // The dealt hand after the first `step` actions (every action, when
  // step is left out). The same object the table draws.
  // Whether the hand in a playback was played to its end (a win or a draw).
  // Only then may the table show every hand, or the file be saved: an
  // unfinished hand's file holds the other players' tiles.
  function playbackFinished(rec) {
    if (!rec || !Array.isArray(rec.actions)) return false;
    var limit = typeof rec.moves === 'number' && rec.moves >= 0 ? Math.min(rec.actions.length, rec.moves) : rec.actions.length;
    var last = limit ? rec.actions[limit - 1] : null;
    return !!last && (last.a === 'win' || last.a === 'drawGame');
  }

  function playbackGame(rec, step) {
    if (!rec || !Array.isArray(rec.actions) || !Array.isArray(rec.players)) return null;
    var game = createGame({
      seed: 1,
      dealer: rec.dealer,
      mode: 'practice',
      humanName: rec.players[0] && rec.players[0].name,
    });
    rec.players.forEach(function (p, i) {
      game.players[i].name = p.name;
      game.players[i].isHuman = i === 0;
    });
    game.dealer = rec.dealer;
    game.firstDealer = rec.dealer;
    game.round = rec.round;
    game.handNumber = (rec.handNumber || 1) - 1;
    startHand(game, rec.seed);
    var limit = rec.actions.length;
    if (typeof rec.moves === 'number' && rec.moves >= 0) limit = Math.min(limit, rec.moves);
    var n = step == null ? limit : step;
    if (n < 0) n = 0;
    if (n > limit) n = limit;
    var mark = null;
    var win = null;
    for (var i = 0; i < n; i++) {
      var applied = applyPlaybackAction(game, rec.actions[i]);
      mark = applied.mark || null;
      if (applied.win) win = applied.win;
    }
    game.hand.review = { mark: n ? mark : null, win: win };
    return game;
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
    hmacSha256: hmacSha256,
    handSeedText: handSeedText,
    parseHandSeed: parseHandSeed,
    dealtHand: dealtHand,
    playbackText: playbackText,
    makePlayback: makePlayback,
    checkPlayback: checkPlayback,
    parsePlayback: parsePlayback,
    playbackLines: playbackLines,
    playbackCaption: playbackCaption,
    playbackSummary: playbackSummary,
    playbackWinner: playbackWinner,
    playbackResult: playbackResult,
    playbackWhen: playbackWhen,
    playbackGame: playbackGame,
    playbackFinished: playbackFinished,
    applyPlaybackAction: applyPlaybackAction,
    GAME_VERSION: GAME_VERSION,
    SAVE_APP: SAVE_APP,
    saveCompatibility: saveCompatibility,
    gameRecord: gameRecord,
    restoreGame: restoreGame,
    makeSave: makeSave,
    checkSave: checkSave,
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
    resultsRow: resultsRow,
    finalStandings: finalStandings,
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
