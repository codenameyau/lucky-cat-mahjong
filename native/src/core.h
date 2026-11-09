// Tiles, the seeded generator and small helpers: a port of the top of
// js/mahjong-engine.js. Every function here must give exactly what the JS
// gives (the parity harness, scripts/ml/native.js, checks it hand by hand).
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <array>
#include <algorithm>

namespace lcm {

// Tiles: 0-33 are the playable kinds (c1-c9, d1-d9, b1-b9, then E S W N,
// White, Green, Red), 34-41 the bonus tiles f1-f4, s1-s4. JS ids map 1:1.
constexpr int KINDS = 34;
constexpr int NO_TILE = -1;
inline bool isBonus(int t) { return t >= 34; }
inline bool isHonor(int i) { return i >= 27; }
inline bool isTerminalOrHonor(int i) { return i >= 27 || i % 9 == 0 || i % 9 == 8; }
// 'c', 'd', 'b', 'z'
inline char suitOf(int i) { return i >= 27 ? 'z' : "cdb"[i / 9]; }
inline int rankOf(int i) { return i >= 27 ? i - 26 : (i % 9) + 1; }
const char* tileId(int t);  // "c1" ... "dr", "f1" ... "s4"
int tileFromId(const std::string& id);
// JS sortTiles: by index, bonus tiles after (100 + bonus position).
inline int sortKey(int t) { return t >= 34 ? 100 + (t - 34) : t; }

using Counts = std::array<int8_t, KINDS>;
inline Counts zeroCounts() { Counts c; c.fill(0); return c; }
inline Counts countsOf(const std::vector<int8_t>& ids) {
  Counts c = zeroCounts();
  for (int t : ids) if (t >= 0 && t < 34) c[t]++;
  return c;
}

// mulberry32, as js createRng: returns doubles in [0, 1).
struct Rng {
  uint32_t a;
  explicit Rng(uint32_t seed = 1) : a(seed ? seed : 1) {}
  double operator()() {
    a = a + 0x6D2B79F5u;
    uint32_t t = a;
    t = (t ^ (t >> 15)) * (t | 1u);
    t ^= t + (t ^ (t >> 7)) * (t | 61u);
    return double(t ^ (t >> 14)) / 4294967296.0;
  }
};

template <class T> void shuffle(std::vector<T>& arr, Rng& rng) {
  for (int i = int(arr.size()) - 1; i > 0; i--) {
    int j = int(rng() * (i + 1));  // Math.floor of a non-negative double
    std::swap(arr[i], arr[j]);
  }
}

// The wall as js builds it: each kind 4 times in index order, then the bonus tiles, shuffled.
std::vector<int8_t> buildWall(Rng& rng);

}  // namespace lcm
