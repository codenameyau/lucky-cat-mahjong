/* Labels for the frontier model's extra heads (docs/architecture/README.md,
   "One model for the middle"). Training targets only: the opponents' hidden
   hands are read here and never reach a model's inputs
   (js/mahjong-fair-play.test.js).

   Each recorded row gets AUX_BYTES bytes, in shard-N.aux beside the features:
     ruleHand  u8       the hand the rules read for the tiles kept (HANDS), 255 unknown
     winHand   u8       the hand this seat won with (HANDS), 255 if it didn't win
     dealNow   u8       the faan the tile thrown would pay right now (0: nobody wins on it)
     steps     u8 x 3   each opponent's steps from ready, 0 to 4, from the seat's right
     waits     u8 x 102 each opponent's winning tiles (34 each), when it is ready */

'use strict';

const E = require('../../js/mahjong-engine.js');

// The hand families a seat can be building, or win with.
const HANDS = ['plain', 'sequences', 'half-flush', 'full-flush', 'triplets', 'concealed-triplets',
  'pairs', 'orphans', 'gates', 'majors', 'dragons', 'winds'];
const AUX_BYTES = 6 + 102;
const NONE = 255;

// A foundation plan's id (js/mahjong-bot.js) as a hand family.
function planHand(id) {
  if (!id) return NONE;
  if (/^half(-|$)/.test(id)) return 2;
  if (/^full(-|$)/.test(id)) return 3;
  if (id === 'triplets') return 4;
  if (id === 'concealed-triplets') return 5;
  if (id === 'runs' || id === 'straights' || id === 'sequences') return 1;
  if (id === 'pairs' || /^pairs-/.test(id)) return 6;
  if (id === 'orphans') return 7;
  if (id === 'gates') return 8;
  if (id === 'mixed-orphans' || id === 'all-terminals' || id === 'all-honors' || id === 'honors' || id === 'terminals') return 9;
  if (id === 'dragons' || /-dragons$/.test(id)) return 10;
  if (id === 'winds' || /-winds$/.test(id)) return 11;
  return 0;
}

// The family of a winning hand, from what it scored: the rarest pattern names it.
const WIN_ORDER = [
  ['Thirteen Orphans', 7], ['Nine Gates', 8], ['Big Four Winds', 11], ['Small Four Winds', 11],
  ['Big Three Dragons', 10], ['Small Three Dragons', 10], ['All Honors', 9], ['All Terminals', 9],
  ['Mixed Orphans', 9], ['Seven Pairs', 6], ['Full Flush', 3], ['Concealed Triplets', 5],
  ['Half Flush', 2], ['All Triplets', 4], ['All Sequences', 1],
];
function winHand(score) {
  const names = {};
  ((score && score.items) || []).forEach((it) => { names[it.name] = true; });
  for (let k = 0; k < WIN_ORDER.length; k++) if (names[WIN_ORDER[k][0]]) return WIN_ORDER[k][1];
  return 0;
}

// The table's part of a row, read when the seat is about to throw `tile`
// (an index, or -1 for a position that throws nothing).
function tableLabels(game, seat, tile) {
  const out = new Uint8Array(AUX_BYTES);
  out[0] = NONE; out[1] = NONE;
  const h = game.hand;
  for (let k = 1; k <= 3; k++) {
    const s = h.seats[(seat + k) % 4];
    const ids = s.hand.filter((t) => !E.isBonus(t));
    const c = E.countsOf(ids);
    const sh = Math.min(Math.max(E.shanten(c, s.melds.length), 0), 4);
    out[3 + k - 1] = sh;
    if (sh === 0 && ids.length % 3 === 1) {
      E.winningTiles(c, s.melds.length).forEach((i) => { out[6 + (k - 1) * 34 + i] = 1; });
    }
  }
  if (tile >= 0) {
    let worst = 0;
    for (let k = 1; k <= 3; k++) {
      const opts = E.claimOptions(game, (seat + k) % 4, E.tileId(tile), seat);
      if (opts.win) worst = Math.max(worst, Math.min(13, opts.win.faan || 0));
    }
    out[2] = worst;
  }
  return out;
}

module.exports = { HANDS, AUX_BYTES, NONE, planHand, winHand, tableLabels };
