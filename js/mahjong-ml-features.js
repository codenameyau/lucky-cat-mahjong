/* Features for the learned strategy (js/mahjong-ml.js).

   One discard is described by the position it leaves: the 13 tiles kept,
   the melds and flowers, the table as this seat can see it, and the
   foundation's reads of that position (steps from ready, live tiles, the
   best plan's faan, how risky the tile is). The same code builds features
   for training (scripts/ml/generate.js) and for play, so they can't drift.

   Only what the seat can see goes in: its own hand, every discard and
   shown meld, and counts of hidden tiles. Never the wall or another hand.

   prepare(game, seat, ctx?, threats?) -> state   the parts shared by every
                                                  discard of this turn
   encode(state, index, analysis?, loss?) -> Float32Array(SIZE)
     index: the tile index (0-33) thrown. analysis is handUtility of the
     13 tiles kept, and loss is dealInLoss of the tile; both are worked
     out when not given.
   GROUPS: the named feature ranges, for explaining a choice. */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var B = node ? require('./mahjong-bot.js') : root.MahjongBot;

  var FEATURE_VERSION = 1;
  var DRAGONS = [31, 32, 33];
  var FAMILIES = ['runs', 'sets', 'pairs', 'majors', 'dragons', 'winds', 'orphans', 'gates', 'flush', 'standard'];
  var SUITS = ['c', 'd', 'b'];

  // The layout: each group is [name, size]. Explanations switch groups off.
  var LAYOUT = [
    ['hand', 34 * 4 + 34 + 8],    // tiles kept (1+, 2+, 3+, 4 copies), own melds, meld kinds
    ['discard', 34 + 6],          // the tile thrown and what kind of tile it is
    ['table', 34 + 3 * (34 + 34 + 12)], // unseen copies; each opponent's discards, melds, reads
    ['context', 16],              // wall, turn, winds, dealer
    ['speed', 16],                // steps from ready and live tiles
    ['value', 32],                // the best plan and what a win scores
    ['safety', 12],               // how likely the tile deals in
  ];
  var GROUPS = {};
  var SIZE = 0;
  LAYOUT.forEach(function (g) {
    GROUPS[g[0]] = { start: SIZE, end: SIZE + g[1] };
    SIZE += g[1];
  });

  function clip(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function log1(x) { return Math.log(1 + Math.max(0, x)); }

  function meldTileCounts(melds, hideConcealed) {
    var c = new Array(34).fill(0);
    var hidden = 0;
    melds.forEach(function (m) {
      if (hideConcealed && m.concealed) { hidden++; return; }
      m.tiles.slice(0, 3).forEach(function (id) { c[E.tileIndex(id)]++; });
    });
    return { counts: c, hidden: hidden };
  }

  // The parts of the position every discard of this turn shares.
  function prepare(game, seat, ctx, threats) {
    ctx = ctx || B.buildContext(game, seat);
    threats = threats || B.opponentThreats(game, seat);
    var s = game.hand.seats[seat];
    var counts = E.countsOf(s.hand);
    if (!ctx.mlSynced) { B.syncHandPlans(ctx, counts); ctx.mlSynced = true; }
    var opponents = [];
    for (var k = 1; k <= 3; k++) {
      var o = (seat + k) % 4;
      var os = game.hand.seats[o];
      var disc = new Array(34).fill(0);
      os.discards.forEach(function (d) { disc[E.tileIndex(d.tile)]++; });
      var shown = meldTileCounts(os.melds, true);
      var threat = threats.filter(function (t) { return t.seat === o; })[0] || null;
      opponents.push({ seat: o, seatState: os, discards: disc, melds: shown, threat: threat });
    }
    return {
      game: game, seat: seat, ctx: ctx, threats: threats, counts: counts,
      own: meldTileCounts(s.melds, false), opponents: opponents,
      flowerFaan: B.flowerPoints(ctx),
    };
  }

  function encode(state, index, analysis, loss) {
    var x = new Float32Array(SIZE);
    var game = state.game, ctx = state.ctx, seat = state.seat;
    var c = state.counts.slice();
    c[index]--;
    if (!analysis) analysis = B.handUtility(c, ctx);
    if (loss == null) loss = B.dealInLoss(game, state.threats, index);
    var p, i, k;

    // Hand: the 13 tiles kept, as "at least n copies".
    p = GROUPS.hand.start;
    for (i = 0; i < 34; i++) {
      for (k = 1; k <= 4; k++) x[p + (i * 4) + k - 1] = c[i] >= k ? 1 : 0;
    }
    p += 136;
    for (i = 0; i < 34; i++) x[p + i] = state.own.counts[i] / 4;
    p += 34;
    var melds = ctx.melds;
    x[p] = melds.filter(function (m) { return m.type === 'chow'; }).length / 4;
    x[p + 1] = melds.filter(function (m) { return m.type === 'pung'; }).length / 4;
    x[p + 2] = melds.filter(function (m) { return m.type === 'kong'; }).length / 4;
    x[p + 3] = ctx.concealed ? 1 : 0;
    x[p + 4] = ctx.flowers.length / 8;
    x[p + 5] = state.flowerFaan / 4;
    x[p + 6] = melds.length / 4;
    x[p + 7] = ctx.hasChow ? 1 : 0;

    // The tile thrown.
    p = GROUPS.discard.start;
    x[p + index] = 1;
    p += 34;
    x[p] = index >= 27 ? 1 : 0;
    x[p + 1] = DRAGONS.indexOf(index) !== -1 ? 1 : 0;
    x[p + 2] = index === 26 + ctx.seatWind || index === 26 + game.round ? 1 : 0;
    x[p + 3] = E.isTerminalOrHonorIndex(index) ? 1 : 0;
    x[p + 4] = state.counts[index] / 4; // copies held before the throw
    x[p + 5] = ctx.unseen[index] / 4;

    // The table: unseen copies, then each opponent from the right.
    p = GROUPS.table.start;
    for (i = 0; i < 34; i++) x[p + i] = ctx.unseen[i] / 4;
    p += 34;
    state.opponents.forEach(function (op) {
      for (i = 0; i < 34; i++) x[p + i] = op.discards[i] / 4;
      p += 34;
      for (i = 0; i < 34; i++) x[p + i] = op.melds.counts[i] / 4;
      p += 34;
      var t = op.threat || {};
      x[p] = t.ready || 0;
      x[p + 1 + (t.level || 0)] = 1;          // 4 levels
      if (t.flush) x[p + 5 + SUITS.indexOf(t.flush)] = 1; // 3 suits
      x[p + 8] = ((t.faan || 3) - 3) / 10;
      x[p + 9] = op.seatState.melds.length / 4;
      x[p + 10] = op.seatState.discards.length / 24;
      x[p + 11] = op.seat === game.dealer ? 1 : 0;
      p += 12;
    });

    // Context.
    p = GROUPS.context.start;
    x[p] = ctx.wallLeft / 100;
    x[p + 1] = ctx.turn / 24;
    x[p + 2 + (ctx.seatWind - 1)] = 1;   // 4
    x[p + 6 + (game.round - 1)] = 1;     // 4
    x[p + 10] = ctx.isDealer ? 1 : 0;
    x[p + 11] = (game.settings.minFaan || 3) / 13;
    x[p + 12] = ctx.wallLeft < 16 ? 1 : 0;
    x[p + 13] = ctx.hazard || 0;
    x[p + 14] = ctx.slope || 0;
    x[p + 15] = ctx.declared / 4;

    // Speed: steps from ready on each shape, and the tiles that help.
    p = GROUPS.speed.start;
    var std = E.standardShanten(c, ctx.declared);
    var pairs = ctx.declared ? 8 : sevenPairs(c);
    var orphans = ctx.declared ? 13 : orphansSteps(c);
    x[p] = clip(std, -1, 8) / 8;
    x[p + 1] = clip(pairs, -1, 8) / 8;
    x[p + 2] = clip(orphans, -1, 13) / 13;
    x[p + 3] = clip(analysis.shanten, -1, 8) / 8;
    x[p + 4] = clip(analysis.shapeShanten, -1, 8) / 8;
    x[p + 5] = analysis.shanten <= 0 ? 1 : 0;
    x[p + 6] = analysis.shanten === 1 ? 1 : 0;
    var best = analysis.best || {};
    x[p + 7] = log1(best.ukeire || 0) / 4;
    x[p + 8] = (best.ukeireTiles ? best.ukeireTiles.length : 0) / 34;
    x[p + 9] = best.chance || 0;
    var ready = analysis.ready;
    x[p + 10] = ready ? 1 : 0;
    x[p + 11] = ready ? (ready.waits || []).length / 8 : 0;
    x[p + 12] = ready ? log1(ready.live) / 3 : 0;
    x[p + 13] = clip(analysis.plainShanten, -1, 8) / 8;
    x[p + 14] = ctx.drawsLeft / 30;
    x[p + 15] = clip(analysis.shanten, 0, 8) / Math.max(1, ctx.drawsLeft);

    // Value: the plan the kept tiles build, and what the hand scores.
    p = GROUPS.value.start;
    var plan = best.plan || null;
    if (plan) {
      var fam = B.planFamily(plan.id);
      var famKey = /^flush/.test(fam) ? 'flush' : fam;
      var fi = FAMILIES.indexOf(famKey);
      x[p + (fi === -1 ? FAMILIES.length - 1 : fi)] = 1; // 10
      x[p + 10] = /^full/.test(plan.id) ? 1 : 0;
      x[p + 11] = /^half/.test(plan.id) ? 1 : 0;
      if (plan.suit) x[p + 12 + SUITS.indexOf(plan.suit)] = 1; // 3
      x[p + 15] = clip(plan.faan || 0, 0, 13) / 13;
      x[p + 16] = clip(best.planShanten != null ? best.planShanten : best.shanten || 0, -1, 8) / 8;
      x[p + 17] = plan.upgrade ? 1 : 0;
    }
    x[p + 18] = log1(analysis.util) / 3;
    x[p + 19] = log1(analysis.backup) / 3;
    x[p + 20] = best.readyBest ? 1 : 0;
    x[p + 21] = ready ? clip(ready.bestFaan || 0, 0, 13) / 13 : 0;
    x[p + 22] = ready ? log1(ready.value) / 3 : 0;
    var su = { c: 0, d: 0, b: 0, z: 0 };
    for (i = 0; i < 34; i++) su[i >= 27 ? 'z' : E.suitOfIndex(i)] += c[i] + state.own.counts[i];
    x[p + 23] = su.c / 14; x[p + 24] = su.d / 14; x[p + 25] = su.b / 14; x[p + 26] = su.z / 14;
    var nPairs = 0, nSets = 0, valueHonors = 0;
    for (i = 0; i < 34; i++) {
      if (c[i] >= 2) nPairs++;
      if (c[i] >= 3) nSets++;
      if (i >= 27 && c[i] >= 2 && B.valueWeight(ctx, i)) valueHonors++;
    }
    x[p + 27] = nPairs / 7;
    x[p + 28] = nSets / 4;
    x[p + 29] = valueHonors / 3;
    x[p + 30] = clip(B.baseFaan(ctx), 0, 13) / 13;
    x[p + 31] = B.cheapWin(ctx) ? 1 : 0;

    // Safety: how likely this tile wins for someone.
    p = GROUPS.safety.start;
    x[p] = log1(loss * 10) / 3;
    x[p + 1] = B.deadTile(game, index) ? 1 : 0;
    state.opponents.forEach(function (op, k2) {
      var t = op.threat;
      if (!t) return;
      x[p + 2 + k2] = t.discarded[E.tileId(index)] ? 1 : 0; // they threw it: safe against them
      x[p + 5 + k2] = t.since[E.tileId(index)] ? 1 : 0;
      x[p + 8 + k2] = t.ready * B.waitChance(game, t, index);
    });
    x[p + 11] = state.threats.reduce(function (m, t) { return Math.max(m, t.level); }, 0) / 3;
    return x;
  }

  function sevenPairs(c) {
    var pairs = 0, kinds = 0;
    for (var i = 0; i < 34; i++) {
      if (c[i]) kinds++;
      if (c[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  function orphansSteps(c) {
    var kinds = 0, pair = 0;
    B.ORPHAN_INDEXES.forEach(function (i) {
      if (c[i]) kinds++;
      if (c[i] >= 2) pair = 1;
    });
    return 13 - kinds - pair;
  }

  var api = {
    FEATURE_VERSION: FEATURE_VERSION,
    SIZE: SIZE,
    GROUPS: GROUPS,
    LAYOUT: LAYOUT,
    prepare: prepare,
    encode: encode,
  };

  if (node) module.exports = api;
  else root.MahjongMLFeatures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
