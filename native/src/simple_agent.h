// A deterministic test agent for the parity harness, written the same way
// in scripts/ml/native.js: it exercises every path of the engine (wins,
// kongs, pungs, chows, robbing a kong) with no strategy in the way.
#pragma once
#include "engine.h"

namespace lcm {

struct SimpleAgent : Agent {
  Decision turn(Game& g, int seat, const TurnOptions& o) override {
    Decision d;
    if (o.hasWin) { d.type = A_WIN; return d; }
    if (!o.kongs.empty()) { d.type = A_KONG; d.tile = o.kongs[0].tile; return d; }
    // The tile held fewest times, the highest index among those; the first copy.
    const auto& h = g.hand.seats[seat].hand;
    int best = -1, bestN = 99;
    for (int t : h) {
      int n = countIn(h, t);
      if (n < bestN || (n == bestN && t > best)) { best = t; bestN = n; }
    }
    d.type = A_DISCARD; d.tile = best;
    return d;
  }
  Decision claim(Game&, int, const ClaimOptions& o) override {
    Decision d;
    if (o.hasWin) d.type = A_WIN;
    else if (o.kong) d.type = A_KONG;
    else if (o.pung) d.type = A_PUNG;
    else if (!o.chows.empty()) { d.type = A_CHOW; d.tiles = o.chows[0]; }
    return d;
  }
};

}  // namespace lcm
