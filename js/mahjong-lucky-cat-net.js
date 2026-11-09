/* Lucky Cat's network: a policy that picks moves straight from the tiles a
   seat can see, with no rules underneath (no steps-from-ready, plans or
   threat reads from js/mahjong-bot.js).

   What it reads (encode): its own concealed tiles, its own melds, every
   discard still in a pond, every meld the other players have shown (a
   concealed kong only as a count), each player's flowers, discards and
   melds by suit, the seat and round winds, the tiles left in the wall,
   and, for a claim, the tile on offer and who threw it. Nothing else: not
   the wall's tiles, another hand, the seed or the move log.

   What it says (one network, two heads):
     turn   34 discards (one per kind of tile) and 34 kongs of a kind
     claim  pass, chow with the tile lowest / middle / highest, pung, kong
   Illegal moves are masked out, and a softmax over the rest gives each
   legal move its share. A win is always declared, so it isn't a choice.

   Weights are { featureVersion, featureSize, layers: [{ rows, cols, w, b }] }
   as in js/mahjong-ml-model.js (base64 float16 with dtype 'f16', or plain
   arrays). zeroWeights() is the first model: every legal move is equally
   likely, so it plays at random. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;

  var FEATURE_VERSION = 1;
  var TURN = 68;                // 34 discards, then 34 kongs
  var CLAIM = 6;                // pass, chow low, chow mid, chow high, pung, kong
  var OUTPUTS = TURN + CLAIM;
  var CLAIM_NAMES = ['pass', 'chow-low', 'chow-mid', 'chow-high', 'pung', 'kong'];
  var HIDDEN = [256, 128];
  var WALL = 91;                // tiles in the wall after the deal

  // The feature layout: [name, size].
  var LAYOUT = [
    ['hand', 4 * 34],         // own concealed tiles: 1+, 2+, 3+, 4 copies
    ['melds', 34],            // own melds' tiles (copies / 4)
    ['ownMelds', 4],          // own chows, pungs, kongs (exposed), concealed kongs
    ['pond', 34],             // discards still in the ponds (copies / 4)
    ['shown', 34],            // the other players' shown melds (copies / 4)
    ['unseen', 34],           // copies this seat hasn't seen (/ 4)
    ['players', 3 * 14],      // each other player: melds, concealed kongs, flowers,
                              // discards, discards by suit (4), shown melds by suit (4),
                              // chows, pungs/kongs, ready-looking (4 sets shown)
    ['self', 8],              // own flowers, own seat flower and season, discards,
                              // concealed, sets, dealer, last wall
    ['winds', 8],             // seat wind, round wind
    ['wall', 2],              // tiles left / 91, and its square
    ['mode', 2],              // own turn, claim
    ['offer', 34],            // the tile on offer (claims)
    ['offerFrom', 4],         // thrown by the player on the left, opposite, right; robbing a kong
  ];
  var GROUPS = {};
  var SIZE = 0;
  LAYOUT.forEach(function (p) { GROUPS[p[0]] = { start: SIZE, end: SIZE + p[1] }; SIZE += p[1]; });

  /* ------------------------------------------------------------------ *
   * 1. Features: only what `seat` can see
   * ------------------------------------------------------------------ */

  function suitSlot(i) { return i >= 27 ? 3 : Math.floor(i / 9); }

  // A seat's own bonus tiles that match its seat (flower and season).
  function seatBonus(flowers, wind) {
    var f = 0, s = 0;
    flowers.forEach(function (id) {
      var n = parseInt(String(id).replace(/\D/g, ''), 10);
      if (n !== wind) return;
      if (/^f/i.test(id)) f = 1; else s = 1;
    });
    return [f, s];
  }

  // view: { hand (tile ids), melds (own) }; defaults to the seat's own.
  function encode(game, seat, view, offer) {
    view = view || {};
    var h = game.hand;
    var me = h.seats[seat];
    var hand = view.hand || me.hand;
    var melds = view.melds || me.melds;
    var x = new Float32Array(SIZE);
    var c = E.countsOf(hand);
    var g, i, k;

    g = GROUPS.hand.start;
    for (i = 0; i < 34; i++) for (k = 0; k < c[i] && k < 4; k++) x[g + k * 34 + i] = 1;

    var seen = c.slice();
    g = GROUPS.melds.start;
    var ownKinds = [0, 0, 0, 0];
    melds.forEach(function (m) {
      m.tiles.forEach(function (id) { var j = E.tileIndex(id); x[g + j] += 0.25; seen[j]++; });
      if (m.type === 'chow') ownKinds[0]++;
      else if (m.type === 'pung') ownKinds[1]++;
      else if (m.concealed) ownKinds[3]++;
      else ownKinds[2]++;
    });
    g = GROUPS.ownMelds.start;
    for (k = 0; k < 4; k++) x[g + k] = ownKinds[k] / 4;

    var pond = GROUPS.pond.start, shown = GROUPS.shown.start, pl = GROUPS.players.start;
    for (var r = 1; r <= 3; r++) {
      var o = (seat + r) % 4, s = h.seats[o], base = pl + (r - 1) * 14;
      var concealedKongs = 0, chows = 0, sets = 0, open = 0;
      s.melds.forEach(function (m) {
        // Another player's concealed kong is a kong, never its tile.
        if (m.concealed) { concealedKongs++; return; }
        open++;
        if (m.type === 'chow') chows++; else sets++;
        m.tiles.forEach(function (id) {
          var j = E.tileIndex(id);
          x[shown + j] += 0.25;
          seen[j]++;
          x[base + 8 + suitSlot(j)] += 1 / 12;
        });
      });
      x[base] = open / 4;
      x[base + 1] = concealedKongs / 4;
      x[base + 2] = s.flowers.length / 8;
      x[base + 3] = s.discards.length / 24;
      s.discards.forEach(function (d) {
        var j = E.tileIndex(d.tile);
        x[base + 4 + suitSlot(j)] += 1 / Math.max(1, s.discards.length);
      });
      x[base + 12] = chows / 4;
      x[base + 13] = (open + concealedKongs >= 4 ? 1 : 0) + sets / 8;
    }
    h.seats.forEach(function (s) {
      s.discards.forEach(function (d) {
        if (d.claimed) return;
        var j = E.tileIndex(d.tile);
        x[pond + j] += 0.25;
        seen[j]++;
      });
    });
    g = GROUPS.unseen.start;
    for (i = 0; i < 34; i++) x[g + i] = Math.max(0, 4 - seen[i]) / 4;

    var wind = E.seatWind(game, seat);
    var sb = seatBonus(me.flowers, wind);
    g = GROUPS.self.start;
    x[g] = me.flowers.length / 8;
    x[g + 1] = sb[0];
    x[g + 2] = sb[1];
    x[g + 3] = me.discards.length / 24;
    x[g + 4] = melds.every(function (m) { return m.concealed; }) ? 1 : 0;
    x[g + 5] = melds.length / 4;
    x[g + 6] = game.dealer === seat ? 1 : 0;
    var wallLeft = h.wall.length;
    x[g + 7] = wallLeft < 20 ? 1 : 0;

    g = GROUPS.winds.start;
    x[g + wind - 1] = 1;
    x[g + 4 + ((game.round || 1) - 1) % 4] = 1;
    g = GROUPS.wall.start;
    x[g] = wallLeft / WALL;
    x[g + 1] = x[g] * x[g];

    g = GROUPS.mode.start;
    if (!offer) x[g] = 1;
    else {
      x[g + 1] = 1;
      x[GROUPS.offer.start + E.tileIndex(offer.tile)] = 1;
      if (offer.robKong) x[GROUPS.offerFrom.start + 3] = 1;
      else x[GROUPS.offerFrom.start + ((seat - offer.from + 4) % 4) - 1] = 1;
    }
    return x;
  }

  /* ------------------------------------------------------------------ *
   * 2. Legal moves
   * ------------------------------------------------------------------ */

  // Own turn: [{ action, decision }] for each discard and each kong offered.
  function turnMoves(hand, kongs) {
    var out = [];
    var c = E.countsOf(hand);
    for (var i = 0; i < 34; i++) if (c[i]) out.push({ action: i, decision: { type: 'discard', tile: E.tileId(i) } });
    (kongs || []).forEach(function (kg) {
      out.push({ action: 34 + E.tileIndex(kg.tile), decision: { type: 'kong', tile: kg.tile }, kind: kg.kind });
    });
    return out;
  }

  // A claim: pass, each chow offered, pung, kong (a win is always taken).
  function claimMoves(opts) {
    var out = [{ action: TURN, decision: { type: 'pass' } }];
    var ti = E.tileIndex(opts.tile);
    (opts.chows || []).forEach(function (pair) {
      var lo = Math.min(E.tileIndex(pair[0]), E.tileIndex(pair[1]));
      var slot = lo > ti ? 1 : lo === ti - 1 ? 2 : 3; // the tile is lowest, middle, highest
      out.push({ action: TURN + slot, decision: { type: 'chow', tiles: pair.slice() } });
    });
    if (opts.pung) out.push({ action: TURN + 4, decision: { type: 'pung' } });
    if (opts.kong) out.push({ action: TURN + 5, decision: { type: 'kong' } });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 3. The network
   * ------------------------------------------------------------------ */

  function halfToFloat(hv) {
    var sign = hv & 0x8000 ? -1 : 1, exp = (hv >> 10) & 0x1f, frac = hv & 0x3ff;
    if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
    if (exp === 31) return frac ? NaN : sign * Infinity;
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
  }

  function fromBase64(s, dtype) {
    var bytes;
    if (typeof Buffer !== 'undefined') bytes = new Uint8Array(Buffer.from(s, 'base64'));
    else {
      var bin = atob(s);
      bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    if (dtype === 'f16') {
      var n = bytes.byteLength / 2, out = new Float32Array(n);
      for (var j = 0; j < n; j++) out[j] = halfToFloat(bytes[2 * j] | (bytes[2 * j + 1] << 8));
      return out;
    }
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  function floats(v, dtype) {
    if (v instanceof Float32Array) return v;
    if (typeof v === 'string') return fromBase64(v, dtype);
    return Float32Array.from(v);
  }

  // expect: { size, version } for a longer encoder built on this one
  // (js/mahjong-frontier-net.js, features v2); this one's by default.
  function createModel(weights, expect) {
    var size = expect ? expect.size : SIZE, version = expect ? expect.version : FEATURE_VERSION;
    if (weights.featureSize !== size || weights.featureVersion !== version) {
      throw new Error('Lucky Cat model expects ' + weights.featureSize + ' features (version ' + weights.featureVersion +
        '), have ' + size + ' (version ' + version + ')');
    }
    var layers = weights.layers.map(function (l) {
      return { rows: l.rows, cols: l.cols, w: floats(l.w, weights.dtype), b: floats(l.b, weights.dtype) };
    });
    if (layers[layers.length - 1].rows !== OUTPUTS) throw new Error('Lucky Cat model must have ' + OUTPUTS + ' outputs');
    var widest = layers.reduce(function (m, l) { return Math.max(m, l.rows); }, 0);
    var bufA = new Float32Array(widest), bufB = new Float32Array(widest);
    var first = layers[0], firstT = new Float32Array(first.rows * first.cols);
    for (var r0 = 0; r0 < first.rows; r0++) {
      for (var c0 = 0; c0 < first.cols; c0++) firstT[c0 * first.rows + r0] = first.w[r0 * first.cols + c0];
    }

    // The raw outputs (74 logits) for one feature vector.
    function forward(x) {
      var out = bufA, rows = first.rows, r, c;
      for (r = 0; r < rows; r++) out[r] = first.b[r];
      for (c = 0; c < first.cols; c++) {
        var v = x[c];
        if (v === 0) continue;
        var off0 = c * rows;
        for (r = 0; r < rows; r++) out[r] += firstT[off0 + r] * v;
      }
      if (layers.length > 1) for (r = 0; r < rows; r++) if (out[r] < 0) out[r] = 0;
      var input = out;
      for (var k = 1; k < layers.length; k++) {
        var l = layers[k], w = l.w, b = l.b, cols = l.cols, last = k === layers.length - 1;
        out = k % 2 ? bufB : bufA;
        for (r = 0; r < l.rows; r++) {
          var s = b[r], off = r * cols;
          for (c = 0; c < cols; c++) s += w[off + c] * input[c];
          out[r] = last || s > 0 ? s : 0;
        }
        input = out;
      }
      return Array.prototype.slice.call(out, 0, OUTPUTS);
    }

    // Each move's share: a softmax over the legal moves' logits.
    function policy(x, moves) {
      var raw = forward(x);
      var top = -Infinity;
      moves.forEach(function (m) { m.logit = raw[m.action]; top = Math.max(top, m.logit); });
      var sum = 0;
      moves.forEach(function (m) { m.p = Math.exp(m.logit - top); sum += m.p; });
      moves.forEach(function (m) { m.p /= sum; });
      return moves;
    }

    return { meta: weights.meta || {}, forward: forward, policy: policy };
  }

  // The first model: every weight zero, so every legal move is as likely.
  function zeroWeights(hidden) {
    var sizes = [SIZE].concat(hidden || HIDDEN, [OUTPUTS]);
    var layers = [];
    for (var k = 0; k < sizes.length - 1; k++) {
      layers.push({ rows: sizes[k + 1], cols: sizes[k], w: new Float32Array(sizes[k] * sizes[k + 1]), b: new Float32Array(sizes[k + 1]) });
    }
    return { featureVersion: FEATURE_VERSION, featureSize: SIZE, layers: layers, meta: { random: true } };
  }

  // Random weights (for tests): moves get uneven shares.
  function randomWeights(seed, hidden) {
    var rng = E.createRng(seed || 1);
    var w = zeroWeights(hidden);
    w.layers.forEach(function (l) {
      var scale = Math.sqrt(2 / l.cols);
      for (var i = 0; i < l.w.length; i++) l.w[i] = (rng() * 2 - 1) * scale * 1.7;
    });
    w.meta = { random: true, seed: seed || 1 };
    return w;
  }

  var api = {
    FEATURE_VERSION: FEATURE_VERSION,
    SIZE: SIZE,
    GROUPS: GROUPS,
    LAYOUT: LAYOUT,
    TURN: TURN,
    CLAIM: CLAIM,
    OUTPUTS: OUTPUTS,
    HIDDEN: HIDDEN,
    CLAIM_NAMES: CLAIM_NAMES,
    encode: encode,
    turnMoves: turnMoves,
    claimMoves: claimMoves,
    createModel: createModel,
    zeroWeights: zeroWeights,
    randomWeights: randomWeights,
    floats: floats,
  };

  if (node) module.exports = api;
  else root.MahjongLuckyCatNet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
