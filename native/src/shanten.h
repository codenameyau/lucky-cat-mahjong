// Shanten (tiles away from ready; -1 = a complete hand), as js/mahjong-engine.js
// works it out, but read from a per-suit table instead of a search: each
// suit's 5^9 count patterns (5^7 for honors) map to the best taatsu count for
// each (pair, melds) pair, filled the first time a pattern is seen and kept
// for the life of the process. The answers are the same as the JS's on every
// hand (checked over random hands by the parity harness).
#pragma once
#include "core.h"
#include <climits>

namespace lcm {

constexpr int INF = 1000;  // JS Infinity for seven pairs / orphans with melds

int standardShanten(const int8_t* c, int declared);  // c: 34 counts
int sevenPairsShanten(const int8_t* c, int declared);
int orphansShanten(const int8_t* c, int declared);
int tripletsShanten(const int8_t* c, int declared);
int shanten(const int8_t* c, int declared);
// Tile indexes that complete a hand of 3n+1 tiles.
std::vector<int> winningTiles(int8_t* c, int declared);
inline int standardShanten(const Counts& c, int d) { return standardShanten(c.data(), d); }
inline int shanten(const Counts& c, int d) { return shanten(c.data(), d); }

extern const int ORPHAN_INDEXES[13];

}  // namespace lcm
