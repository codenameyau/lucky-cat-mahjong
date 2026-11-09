// Hong Kong scoring: a port of js/points.js scoreHand (the parts the game
// calls), with the same items in the same order, so the faan and the points
// are the JS's on every hand.
#pragma once
#include "core.h"

namespace lcm {

enum Item : uint8_t {
  I_ALL_TERMINALS, I_MIXED_ORPHANS, I_SEVEN_PAIRS, I_ALL_HONORS, I_FULL_FLUSH, I_HALF_FLUSH,
  I_SEAT_AND_ROUND_WIND, I_SEAT_WIND, I_ROUND_WIND, I_CONCEALED_TRIPLETS, I_ALL_TRIPLETS,
  I_FOUR_QUADS, I_ALL_SEQUENCES, I_BIG_THREE_DRAGONS, I_SMALL_THREE_DRAGONS, I_DRAGON_TRIPLET,
  I_DRAGON_QUAD, I_BIG_FOUR_WINDS, I_SMALL_FOUR_WINDS, I_THIRTEEN_ORPHANS, I_NINE_GATES,
  I_CHICKEN, I_EIGHT_IMMORTALS, I_SEVEN_ROBBING_ONE, I_HEAVENLY, I_EARTHLY, I_SELF_DRAW,
  I_CONCEALED, I_LAST_TILE, I_ROB_KONG, I_DOUBLE_KONG, I_KONG_WIN, I_NO_FLOWERS,
  I_FOUR_FLOWERS, I_SEAT_FLOWER, I_FOUR_SEASONS, I_SEAT_SEASON,
};
const char* itemName(Item i);

struct ScoreItem { Item item; int faan; };

struct MeldIn { char type; int tile; bool concealed; };  // type: 'c' chow, 'p' pung, 'k' kong

struct ScoreInput {
  std::vector<int8_t> concealed;  // tiles in hand, the winning tile included
  std::vector<MeldIn> melds;
  std::vector<int8_t> flowers;
  int seat = 1, round = 1;  // winds 1-4
  bool selfDraw = false, lastTile = false, robKong = false, kongWin = false, doubleKong = false;
  bool heavenly = false, earthly = false;
  int minFaan = 3;
};

struct Score {
  bool valid = false;
  std::vector<ScoreItem> items;
  int faan = 0;
  int points = -1;  // -1: JS null (under the minimum)
  bool canWin = false;  // set by the engine: valid && faan >= minFaan
};

Score scoreHand(const ScoreInput& in);
int faanToPoints(int faan, int minFaan);  // full spicy; -1 under the minimum

}  // namespace lcm
