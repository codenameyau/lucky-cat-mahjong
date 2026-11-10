/* Lucky Cat's value (the stacked evaluation, self-taught): a network that
   scores the position a move leaves, in expected points, the way Neural
   Cat's does, but over Lucky Cat's own features and with no rules behind it
   (docs/strategies/lucky-cat.md, "The value").

   Lucky Cat's policy (js/mahjong-lucky-cat-net.js) still reads the position
   and gives each legal move its share. With a value model, its best few
   moves by share (play.topK) are each scored by the value of what they leave,
   plus a bonus for the chance to win (play.winBonus), and the best goes:
   the policy prunes, the value decides.

   What the value reads (SIZE numbers), only what the seat can see:
     the policy's 376 features of the position after the move: the hand and
       the melds it leaves (encode's view), the table as it is
     thrown  34   the tile the move throws, if any
     kind     6   discard, kong, pass, pung, chow, kong called

   A call (pung, chow) is followed by a discard, so its value is that of the
   best of the policy's top discards after it, each read as a discard (kind
   0) from the hand and melds the call leaves: the same position the turn
   after the call reads. A kong is valued as it leaves the hand, before the
   replacement draw. (Kinds 3 and 4 are kept in the layout, unused.)

   The value model is weights.value in Lucky Cat's weights: a network with
   Neural Cat's 28 outputs (how the hand ends, the faan won and paid),
   optionally stacked with a reader (js/mahjong-ml-model.js), trained by
   ml/train.py from Lucky Cat's own games and their replays (lcm-sim
   generate-lcv). */

(function (root) {
  'use strict';

  var node = typeof module !== 'undefined' && module.exports;
  var E = node ? require('./mahjong-engine.js') : root.MahjongEngine;
  var N = node ? require('./mahjong-lucky-cat-net.js') : root.MahjongLuckyCatNet;
  var M = node ? require('./mahjong-ml-model.js') : root.MahjongMLModel;

  var VALUE_VERSION = 'lcv1';
  var KINDS = ['discard', 'kong', 'pass', 'pung', 'chow', 'call-kong'];
  var THROWN = N.SIZE, KIND = N.SIZE + 34;
  var SIZE = N.SIZE + 34 + KINDS.length;

  function removeIds(hand, idx, n) {
    var out = hand.slice(), taken = [];
    for (var k = out.length - 1; k >= 0 && taken.length < n; k--) {
      if (E.tileIndex(out[k]) === idx) taken.push(out.splice(k, 1)[0]);
    }
    return { hand: out, taken: taken };
  }

  // The hand and melds a turn move leaves, and what it throws.
  function afterTurn(game, seat, decision) {
    var me = game.hand.seats[seat];
    var i = E.tileIndex(decision.tile);
    if (decision.type === 'discard') {
      return { hand: removeIds(me.hand, i, 1).hand, melds: me.melds, thrown: i, kind: 0 };
    }
    // A kong: added to a pung of the tile, or four concealed.
    var pung = -1;
    me.melds.forEach(function (m, k) { if (m.type === 'pung' && E.tileIndex(m.tiles[0]) === i) pung = k; });
    var melds = me.melds.slice();
    if (pung >= 0) {
      var r1 = removeIds(me.hand, i, 1);
      melds[pung] = { type: 'kong', tiles: melds[pung].tiles.concat(r1.taken), concealed: false };
      return { hand: r1.hand, melds: melds, thrown: -1, kind: 1 };
    }
    var r4 = removeIds(me.hand, i, 4);
    melds.push({ type: 'kong', tiles: r4.taken, concealed: true });
    return { hand: r4.hand, melds: melds, thrown: -1, kind: 1 };
  }

  // The hand and melds a call leaves (before its discard), or passing.
  function afterCall(game, seat, opts, decision) {
    var me = game.hand.seats[seat];
    var t = E.tileIndex(opts.tile);
    if (decision.type === 'pass') return { hand: me.hand, melds: me.melds, thrown: -1, kind: 2 };
    var melds = me.melds.slice(), r;
    if (decision.type === 'chow') {
      var a = removeIds(me.hand, E.tileIndex(decision.tiles[0]), 1);
      var b = removeIds(a.hand, E.tileIndex(decision.tiles[1]), 1);
      melds.push({ type: 'chow', tiles: [a.taken[0], b.taken[0], opts.tile], concealed: false });
      return { hand: b.hand, melds: melds, thrown: -1, kind: 4 };
    }
    r = removeIds(me.hand, t, decision.type === 'kong' ? 3 : 2);
    melds.push({ type: decision.type === 'kong' ? 'kong' : 'pung', tiles: r.taken.concat([opts.tile]), concealed: false });
    return { hand: r.hand, melds: melds, thrown: -1, kind: decision.type === 'kong' ? 5 : 3 };
  }

  // The value's features for a position after a move (`after` as above).
  function features(game, seat, after) {
    var p = N.encode(game, seat, { hand: after.hand, melds: after.melds });
    var x = new Float32Array(SIZE);
    x.set(p, 0);
    if (after.thrown >= 0) x[THROWN + after.thrown] = 1;
    x[KIND + after.kind] = 1;
    return x;
  }

  function createModel(weights) { return M.createModel(weights, { size: SIZE, version: VALUE_VERSION }); }

  var api = {
    VALUE_VERSION: VALUE_VERSION, SIZE: SIZE, KINDS: KINDS,
    afterTurn: afterTurn, afterCall: afterCall, features: features, createModel: createModel,
  };
  if (node) module.exports = api;
  else root.MahjongLuckyCatValue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
