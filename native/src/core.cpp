#include "core.h"

namespace lcm {

static const char* IDS[42] = {
  "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9",
  "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
  "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9",
  "we", "ws", "ww", "wn", "dw", "dg", "dr",
  "f1", "f2", "f3", "f4", "s1", "s2", "s3", "s4",
};

const char* tileId(int t) { return t >= 0 && t < 42 ? IDS[t] : "?"; }

int tileFromId(const std::string& id) {
  for (int i = 0; i < 42; i++) if (id == IDS[i]) return i;
  return NO_TILE;
}

std::vector<int8_t> buildWall(Rng& rng) {
  std::vector<int8_t> w;
  w.reserve(144);
  for (int i = 0; i < 34; i++) for (int n = 0; n < 4; n++) w.push_back(int8_t(i));
  for (int b = 34; b < 42; b++) w.push_back(int8_t(b));
  shuffle(w, rng);
  return w;
}

}  // namespace lcm
