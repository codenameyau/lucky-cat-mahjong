#include "shanten.h"
#include <stdexcept>

namespace lcm {

const int ORPHAN_INDEXES[13] = {0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33};

// For one suit's counts: t[p][m] = the most taatsu reachable with exactly m
// melds and p pairs (p <= 1), or -1. The JS keeps every (m, t, p) code a
// suit can reach and merges them; the merge only ever adds and caps, and it
// never lowers with more taatsu, so the most taatsu for each (p, m) gives the
// same best value.
struct SuitOpt { int8_t t[2][5]; };

static void clearOpt(SuitOpt& o) { for (auto& r : o.t) for (auto& v : r) v = -1; }

// Adds `rest` to `out` with m + dm, t + dt, p + dp (skipping rest's pairs when noPair).
static void addShift(SuitOpt& out, const SuitOpt& rest, int dm, int dt, int dp, bool noPair) {
  for (int p = 0; p < 2; p++) {
    if (noPair && p == 1) continue;
    int np = p + dp;
    if (np > 1) continue;  // JS: a code's p digit can reach 2 only via the pair branch, which skips p = 1
    for (int m = 0; m < 5; m++) {
      int t = rest.t[p][m];
      if (t < 0) continue;
      int nm = m + dm;
      if (nm > 4) nm = 4;  // a suit of at most 14 tiles has at most 4 melds
      int nt = t + dt;
      if (out.t[np][nm] < nt) out.t[np][nm] = int8_t(nt);
    }
  }
}

// A memo per pattern (base 5, first tile most significant), for suits (9) and honors (7).
static std::vector<SuitOpt> memo[2];
static std::vector<uint8_t> known[2];
static int POW5[10] = {1, 5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125};

static void ensureMemo(int h) {
  if (!memo[h].empty()) return;
  int n = h ? POW5[7] : POW5[9];
  memo[h].resize(n);
  known[h].assign(n, 0);
}

// suitOptions(c, i, honor) of the JS, for counts 0-4 (positions before i are 0).
static const SuitOpt& suitOptions(int8_t* c, int len, int i, bool honor, int key) {
  int h = honor ? 1 : 0;
  if (known[h][key]) return memo[h][key];
  while (i < len && c[i] == 0) i++;
  SuitOpt out;
  clearOpt(out);
  if (i >= len) {
    out.t[0][0] = 0;
  } else {
    int unit = POW5[len - 1 - i];
    if (c[i] >= 3) {
      c[i] -= 3; addShift(out, suitOptions(c, len, i, honor, key - 3 * unit), 1, 0, 0, false); c[i] += 3;
    }
    if (!honor && i + 2 < len && c[i + 1] && c[i + 2]) {
      int k2 = key - unit - unit / 5 - unit / 25;
      c[i]--; c[i + 1]--; c[i + 2]--;
      addShift(out, suitOptions(c, len, i, honor, k2), 1, 0, 0, false);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      const SuitOpt rest = suitOptions(c, len, i, honor, key - 2 * unit);
      addShift(out, rest, 0, 0, 1, true);
      addShift(out, rest, 0, 1, 0, false);
      c[i] += 2;
    }
    if (!honor && i + 1 < len && c[i + 1]) {
      c[i]--; c[i + 1]--; addShift(out, suitOptions(c, len, i, honor, key - unit - unit / 5), 0, 1, 0, false); c[i]++; c[i + 1]++;
    }
    if (!honor && i + 2 < len && c[i + 2]) {
      c[i]--; c[i + 2]--; addShift(out, suitOptions(c, len, i, honor, key - unit - unit / 25), 0, 1, 0, false); c[i]++; c[i + 2]++;
    }
    c[i]--; addShift(out, suitOptions(c, len, i, honor, key - unit), 0, 0, 0, false); c[i]++;
  }
  memo[h][key] = out;
  known[h][key] = 1;
  return memo[h][key];
}

static int solveStandard(const int8_t* c, int declared) {
  int need = 4 - declared;
  // cur[p][m] = most taatsu, merged suit by suit with the JS's caps.
  int cur[2][5];
  for (auto& r : cur) for (auto& v : r) v = -1;
  cur[0][0] = 0;
  for (int s = 0; s < 4; s++) {
    bool honor = s == 3;
    int len = honor ? 7 : 9, h = honor ? 1 : 0;
    ensureMemo(h);
    int8_t slice[9];
    int key = 0;
    for (int i = 0; i < len; i++) {
      slice[i] = c[s * 9 + i];
      if (slice[i] < 0 || slice[i] > 4) throw std::runtime_error("shanten: counts must be 0-4");
      key = key * 5 + slice[i];
    }
    const SuitOpt& o = suitOptions(slice, len, 0, honor, key);
    int nx[2][5];
    for (auto& r : nx) for (auto& v : r) v = -1;
    for (int p = 0; p < 2; p++) for (int m = 0; m < 5; m++) {
      if (cur[p][m] < 0) continue;
      for (int q = 0; q + p < 2; q++) for (int k = 0; k < 5; k++) {
        if (o.t[q][k] < 0) continue;
        int mm = m + k, tt = cur[p][m] + o.t[q][k];
        if (mm > need) mm = need;
        if (mm + tt > need) tt = need - mm;
        if (nx[p + q][mm] < tt) nx[p + q][mm] = tt;
      }
    }
    std::memcpy(cur, nx, sizeof cur);
  }
  int best = 0;
  for (int p = 0; p < 2; p++) for (int m = 0; m < 5; m++)
    if (cur[p][m] >= 0) { int v = 2 * m + cur[p][m] + p; if (v > best) best = v; }
  return 2 * need - best;
}

// Whole hands come back again and again (every plan, every discard, every
// tile tried for ukeire), so each answer is also kept in a direct-mapped
// table, keyed by the exact counts: a hit is the same hand, so the same answer.
struct HandEntry { uint64_t a, b; int8_t v; };
static const int HAND_BITS = 20;
static std::vector<HandEntry> handCache(size_t(1) << HAND_BITS, HandEntry{~0ull, ~0ull, 0});

int standardShanten(const int8_t* c, int declared) {
  if (declared < 0 || declared > 4) throw std::runtime_error("shanten: declared must be 0-4");
  uint64_t a = 0, b = uint64_t(declared);
  unsigned bad = 0;
  for (int i = 0; i < 17; i++) { bad |= uint8_t(c[i]) > 4; a = (a << 3) | uint64_t(uint8_t(c[i]) & 7); }
  for (int i = 17; i < 34; i++) { bad |= uint8_t(c[i]) > 4; b = (b << 3) | uint64_t(uint8_t(c[i]) & 7); }
  if (bad) return solveStandard(c, declared);  // throws: counts must be 0-4
  uint64_t h = (a * 0x9E3779B97F4A7C15ull) ^ (b + 0x632BE59BD9B4E019ull + (a >> 29));
  h ^= h >> 31;
  HandEntry& e = handCache[(h * 0xBF58476D1CE4E5B9ull) >> (64 - HAND_BITS)];
  if (e.a == a && e.b == b) return e.v;
  int v = solveStandard(c, declared);
  e.a = a; e.b = b; e.v = int8_t(v);
  return v;
}

int sevenPairsShanten(const int8_t* c, int declared) {
  if (declared) return INF;
  int pairs = 0, kinds = 0;
  for (int i = 0; i < 34; i++) { if (c[i] >= 1) kinds++; if (c[i] >= 2) pairs++; }
  return 6 - pairs + std::max(0, 7 - kinds);
}

int orphansShanten(const int8_t* c, int declared) {
  if (declared) return INF;
  int kinds = 0, pair = 0;
  for (int i : ORPHAN_INDEXES) { if (c[i] >= 1) kinds++; if (c[i] >= 2) pair = 1; }
  return 13 - kinds - pair;
}

int tripletsShanten(const int8_t* c, int declared) {
  int need = 4 - declared;
  int pungs = 0, pairs = 0;
  for (int i = 0; i < 34; i++) { if (c[i] >= 3) pungs++; else if (c[i] == 2) pairs++; }
  int m = std::min(pungs, need);
  int p = pairs > 0 ? 1 : 0;
  int t = std::min(pairs - p, need - m);
  return 2 * need - 2 * m - t - p;
}

int shanten(const int8_t* c, int declared) {
  return std::min(standardShanten(c, declared), std::min(sevenPairsShanten(c, declared), orphansShanten(c, declared)));
}

std::vector<int> winningTiles(int8_t* c, int declared) {
  std::vector<int> out;
  for (int i = 0; i < 34; i++) {
    if (c[i] >= 4) continue;
    c[i]++;
    if (shanten(c, declared) == -1) out.push_back(i);
    c[i]--;
  }
  return out;
}

}  // namespace lcm
