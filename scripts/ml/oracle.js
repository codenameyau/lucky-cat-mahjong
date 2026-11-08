/* Oracle features: what a seat CAN'T see, for training only (Suphx's
   "oracle guiding", Li et al. 2020, arXiv:2003.13590).

   Suphx first trains an oracle agent that also reads the hidden tiles (the
   other players' concealed hands and the wall). It learns much faster,
   because what a move is worth is far easier to see with everything in
   view. Then the oracle inputs are dropped out, a little more each round,
   until the agent plays on its own seat's view alone, and training goes on
   from there as a normal agent.

   This file is never loaded by the game: only scripts/ml/ reads it, so the
   shipped models still see only their seat (js/mahjong-fair-play.test.js).
   A trainer that reads these features slices their columns out of the
   first layer before a model is written for play.

   oracle(game, seat, tile) -> Float32Array(SIZE), relative to `seat`:
     for each other player, in turn order (right, opposite, left):
       hand   34  their concealed tiles, count / 4
       waits  34  1 for each tile that would complete their hand (when ready)
       steps   1  how far from ready, min(shanten, 4) / 4 (0 when ready)
     wall    34  the live tiles still to be drawn, count / 4
     next    34  the next tile off the front of the wall (one-hot)
     hits     3  `tile` (an index, optional) completes that player's hand:
                 for a discard, the deal-in it would be
     danger  34  for each tile `seat` holds: the points it would pay if it
                 discarded that tile now (a player who could win on it, at
                 3 faan or more, with the most points), / 1024. This is the
                 answer key ml/train_lucky.py --mode oracle teaches from.
*/

'use strict';

const E = require('../../js/mahjong-engine.js');

const PER = 34 + 34 + 1;
const DANGER = 3 * PER + 34 + 34 + 3;
const SIZE = DANGER + 34;

function oracle(game, seat, tile, mask) {
  const out = new Float32Array(SIZE);
  const h = game.hand;
  for (let k = 1; k <= 3; k++) {
    const s = h.seats[(seat + k) % 4];
    const off = (k - 1) * PER;
    const ids = s.hand.filter((t) => !E.isBonus(t));
    const c = E.countsOf(ids);
    for (let i = 0; i < 34; i++) out[off + i] = c[i] / 4;
    const declared = s.melds.length;
    // Waits only make sense on a hand of 3n+1 tiles (between turns).
    if (ids.length % 3 === 1) {
      const sh = E.shanten(c, declared);
      out[off + 68] = Math.min(Math.max(sh, 0), 4) / 4;
      if (sh === 0) {
        E.winningTiles(c, declared).forEach((i) => {
          out[off + 34 + i] = 1;
          if (tile === i) out[3 * PER + 68 + (k - 1)] = 1;
        });
      }
    } else {
      // Mid-turn (14 tiles): how far from ready after its best discard.
      out[off + 68] = Math.min(Math.max(E.shanten(c, declared), 0), 4) / 4;
    }
  }
  const wall = 3 * PER;
  let first = -1;
  h.wall.forEach((t) => {
    if (E.isBonus(t)) return;
    const i = E.tileIndex(t);
    out[wall + i] += 0.25;
    if (first < 0) first = i;
  });
  if (first >= 0) out[wall + 34 + first] = 1;
  // What each discard would pay now: the engine's own win check and score.
  const held = new Set(h.seats[seat].hand.filter((t) => !E.isBonus(t)));
  held.forEach((t) => {
    let worst = 0;
    for (let k = 1; k <= 3; k++) {
      const opts = E.claimOptions(game, (seat + k) % 4, t, seat);
      if (opts.win) worst = Math.max(worst, opts.win.points || 0);
    }
    if (worst) out[DANGER + E.tileIndex(t)] = worst / 1024;
  });
  // Dropout: Suphx keeps each oracle input with chance delta, falling to 0.
  if (mask != null && mask < 1) {
    const rng = typeof mask === 'object' ? mask.rng : Math.random;
    const keep = typeof mask === 'object' ? mask.delta : mask;
    for (let i = 0; i < SIZE; i++) if (rng() >= keep) out[i] = 0;
  }
  return out;
}

// The public features followed by the oracle's.
function extend(x, game, seat, tile, mask) {
  const o = oracle(game, seat, tile, mask);
  const out = new Float32Array(x.length + SIZE);
  out.set(x, 0);
  out.set(o, x.length);
  return out;
}

module.exports = { SIZE, PER, DANGER, oracle, extend };
