#include "scoring.h"

namespace lcm {

static const int LIMIT = 13;

static const char* NAMES[] = {
  "All Terminals", "Mixed Orphans", "Seven Pairs", "All Honors", "Full Flush", "Half Flush",
  "Seat and Round Wind", "Seat Wind", "Round Wind", "Concealed Triplets", "All Triplets",
  "Four Quads", "All Sequences", "Big Three Dragons", "Small Three Dragons", "Dragon Triplet",
  "Dragon Quad", "Big Four Winds", "Small Four Winds", "Thirteen Orphans", "Nine Gates",
  "Chicken Hand", "Eight Immortals Crossing the Sea", "Seven Robbing One", "Heavenly Hand",
  "Earthly Hand", "Self-Draw", "Concealed", "Win on Last Tile", "Robbing the Kong",
  "Win by Double Kong", "Win by Kong", "No Flowers", "Four Flowers", "Seat Flower",
  "Four Seasons", "Seat Season",
};
const char* itemName(Item i) { return NAMES[i]; }

// Counts as points.js keeps them: [suit c, d, b, z][value 1-9 (1-7 for z)].
struct SC { int8_t v[4][10]; };
static SC countsFrom(const std::vector<int8_t>& ids) {
  SC c; std::memset(&c, 0, sizeof c);
  for (int t : ids) {
    if (t >= 27) c.v[3][t - 26]++;
    else c.v[t / 9][t % 9 + 1]++;
  }
  return c;
}
static int suitMax(int s) { return s == 3 ? 7 : 9; }
static int suitSum(const SC& c, int s) { int n = 0; for (int v = 1; v <= suitMax(s); v++) n += c.v[s][v]; return n; }

struct PM { char type; int8_t suit, val; };  // 'k', 'p', 'c'
struct Parse { std::vector<PM> melds; int8_t pairSuit, pairVal; };

static void decomposeAll(SC& c, std::vector<std::vector<PM>>& out) {
  int suit = -1, v = -1;
  for (int s = 0; s < 4 && suit < 0; s++)
    for (int i = 1; i <= suitMax(s); i++) if (c.v[s][i] > 0) { suit = s; v = i; break; }
  if (suit < 0) { out.push_back({}); return; }
  std::vector<std::vector<PM>> rest;
  auto take = [&](char type) {
    for (auto& r : rest) { std::vector<PM> m; m.reserve(r.size() + 1); m.push_back({type, int8_t(suit), int8_t(v)}); m.insert(m.end(), r.begin(), r.end()); out.push_back(std::move(m)); }
    rest.clear();
  };
  if (c.v[suit][v] >= 4) { c.v[suit][v] -= 4; decomposeAll(c, rest); take('k'); c.v[suit][v] += 4; }
  if (c.v[suit][v] >= 3) { c.v[suit][v] -= 3; decomposeAll(c, rest); take('p'); c.v[suit][v] += 3; }
  if (suit != 3 && v <= 7 && c.v[suit][v] > 0 && c.v[suit][v + 1] > 0 && c.v[suit][v + 2] > 0) {
    c.v[suit][v]--; c.v[suit][v + 1]--; c.v[suit][v + 2]--;
    decomposeAll(c, rest); take('c');
    c.v[suit][v]++; c.v[suit][v + 1]++; c.v[suit][v + 2]++;
  }
}

static std::vector<Parse> winningParses(const SC& c, int meldsNeeded) {
  std::vector<Parse> parses;
  for (int s = 0; s < 4; s++)
    for (int v = 1; v <= suitMax(s); v++) {
      if (c.v[s][v] < 2) continue;
      SC cc = c; cc.v[s][v] -= 2;
      std::vector<std::vector<PM>> decs;
      decomposeAll(cc, decs);
      for (auto& d : decs) if (int(d.size()) == meldsNeeded) parses.push_back({d, int8_t(s), int8_t(v)});
    }
  return parses;
}

static bool isAllTerminals(const SC& c) {
  if (suitSum(c, 3) != 0) return false;
  for (int s = 0; s < 3; s++) for (int v = 2; v <= 8; v++) if (c.v[s][v] > 0) return false;
  for (int s = 0; s < 3; s++) if (c.v[s][1] > 0 || c.v[s][9] > 0) return true;
  return false;
}
static bool isMixedOrphans(const SC& c) {
  for (int s = 0; s < 3; s++) for (int v = 2; v <= 8; v++) if (c.v[s][v] > 0) return false;
  bool honor = suitSum(c, 3) > 0, term = false;
  for (int s = 0; s < 3; s++) if (c.v[s][1] > 0 || c.v[s][9] > 0) term = true;
  return honor && term;
}
static bool isThirteenOrphans(const SC& c) {
  int total = 0, pairs = 0;
  for (int s = 0; s < 4; s++)
    for (int v = 1; v <= suitMax(s); v++) {
      int n = c.v[s][v];
      if (!n) continue;
      bool allowed = s == 3 || v == 1 || v == 9;
      if (!allowed) return false;
      total += n;
      if (n >= 2) pairs++;
    }
  for (int s = 0; s < 3; s++) if (c.v[s][1] < 1 || c.v[s][9] < 1) return false;
  for (int v = 1; v <= 7; v++) if (c.v[3][v] < 1) return false;
  return total == 14 && pairs == 1;
}
static bool isNineGates(const SC& c) {
  if (suitSum(c, 3) != 0) return false;
  int active = -1, nActive = 0;
  for (int s = 0; s < 3; s++) if (suitSum(c, s) > 0) { active = s; nActive++; }
  if (nActive != 1) return false;
  if (suitSum(c, active) != 14) return false;
  static const int base[10] = {0, 3, 1, 1, 1, 1, 1, 1, 1, 3};
  int extra = 0;
  for (int v = 1; v <= 9; v++) { int d = c.v[active][v] - base[v]; if (d < 0) return false; extra += d; }
  return extra == 1;
}
static bool isSevenPairs(const SC& c) {
  int total = 0, pairs = 0;
  for (int s = 0; s < 4; s++)
    for (int v = 1; v <= suitMax(s); v++) {
      int n = c.v[s][v];
      if (!n) continue;
      if (n != 2) return false;
      total += n; pairs++;
    }
  return total == 14 && pairs == 7;
}

struct Profile { int numSuits; bool honors; };
static Profile suitProfile(const SC& c) {
  Profile p{0, suitSum(c, 3) > 0};
  for (int s = 0; s < 3; s++) if (suitSum(c, s) > 0) p.numSuits++;
  return p;
}
struct Ctx { int seat, round; bool concealed; };

static int sumFaan(const std::vector<ScoreItem>& it) { int n = 0; for (auto& x : it) n += x.faan; return n; }
static bool has(const std::vector<ScoreItem>& it, Item k) { for (auto& x : it) if (x.item == k) return true; return false; }

static std::vector<ScoreItem> evalParse(const Parse& parse, const Profile& profile, const Ctx& ctx) {
  std::vector<ScoreItem> items;
  int triplets = 0, chows = 0, kongs = 0;
  std::vector<const PM*> dragonPungs, windPungs;
  for (auto& m : parse.melds) {
    bool trip = m.type == 'p' || m.type == 'k';
    if (trip) {
      triplets++;
      if (m.suit == 3 && m.val >= 5) dragonPungs.push_back(&m);
      if (m.suit == 3 && m.val <= 4) windPungs.push_back(&m);
    }
    if (m.type == 'c') chows++;
    if (m.type == 'k') kongs++;
  }
  bool dragonPair = parse.pairSuit == 3 && parse.pairVal >= 5;
  bool windPair = parse.pairSuit == 3 && parse.pairVal <= 4;
  bool pairIsYaku = dragonPair || (windPair && (parse.pairVal == ctx.seat || parse.pairVal == ctx.round));

  if (profile.numSuits == 0 && profile.honors) items.push_back({I_ALL_HONORS, 10});
  else if (profile.numSuits == 1 && !profile.honors) items.push_back({I_FULL_FLUSH, 7});
  else if (profile.numSuits == 1 && profile.honors) items.push_back({I_HALF_FLUSH, 3});

  bool allTriplets = triplets == 4, allChows = chows == 4;
  if (allTriplets && ctx.concealed) items.push_back({I_CONCEALED_TRIPLETS, 10});
  else if (allTriplets && !(profile.numSuits == 0 && profile.honors)) items.push_back({I_ALL_TRIPLETS, 3});
  if (kongs == 4) items.push_back({I_FOUR_QUADS, LIMIT});
  if (allChows && !pairIsYaku && !profile.honors) items.push_back({I_ALL_SEQUENCES, 1});

  if (dragonPungs.size() == 3) items.push_back({I_BIG_THREE_DRAGONS, 8});
  else if (dragonPungs.size() == 2 && dragonPair) items.push_back({I_SMALL_THREE_DRAGONS, 5});
  else {
    int trip = 0, quad = 0;
    for (auto* m : dragonPungs) { if (m->type == 'k') quad++; else trip++; }
    if (trip) items.push_back({I_DRAGON_TRIPLET, trip});
    if (quad) items.push_back({I_DRAGON_QUAD, quad});
  }

  if (windPungs.size() == 4) items.push_back({I_BIG_FOUR_WINDS, LIMIT});
  else if (windPungs.size() == 3 && windPair) items.push_back({I_SMALL_FOUR_WINDS, 6});
  else {
    for (auto* m : windPungs) {
      if (m->val == ctx.seat && m->val == ctx.round && ctx.seat > 0) items.push_back({I_SEAT_AND_ROUND_WIND, 2});
      else {
        if (m->val == ctx.seat && ctx.seat > 0) items.push_back({I_SEAT_WIND, 1});
        if (m->val == ctx.round && ctx.round > 0) items.push_back({I_ROUND_WIND, 1});
      }
    }
  }
  return items;
}

static std::vector<ScoreItem> sevenPairsItems(const SC& c, const Profile& profile, const Ctx& ctx) {
  std::vector<ScoreItem> items{{I_SEVEN_PAIRS, 4}};
  if (profile.numSuits == 0 && profile.honors) items.push_back({I_ALL_HONORS, 10});
  else if (isAllTerminals(c)) items.push_back({I_ALL_TERMINALS, 10});
  else if (isMixedOrphans(c)) items.push_back({I_MIXED_ORPHANS, 1});
  else if (profile.numSuits == 1 && !profile.honors) items.push_back({I_FULL_FLUSH, 7});
  else if (profile.numSuits == 1 && profile.honors) items.push_back({I_HALF_FLUSH, 3});
  for (int val = 1; val <= 4; val++) {
    if (c.v[3][val] != 4) continue;
    if (val == ctx.seat && val == ctx.round && ctx.seat > 0) items.push_back({I_SEAT_AND_ROUND_WIND, 2});
    else {
      if (val == ctx.seat && ctx.seat > 0) items.push_back({I_SEAT_WIND, 1});
      if (val == ctx.round && ctx.round > 0) items.push_back({I_ROUND_WIND, 1});
    }
  }
  return items;
}

// null in the JS = empty optional here
static bool bestStandardItems(const SC& c, const Profile& profile, const Ctx& ctx, const std::vector<PM>& fixed,
                              const SC& allCounts, std::vector<ScoreItem>& best) {
  auto parses = winningParses(c, 4 - int(fixed.size()));
  if (parses.empty()) return false;
  int bestFaan = -1;
  for (auto& p : parses) {
    Parse full;
    full.melds = fixed;
    full.melds.insert(full.melds.end(), p.melds.begin(), p.melds.end());
    full.pairSuit = p.pairSuit; full.pairVal = p.pairVal;
    auto its = evalParse(full, profile, ctx);
    int f = sumFaan(its);
    if (f > bestFaan) { bestFaan = f; best = std::move(its); }
  }
  bool four = has(best, I_FOUR_QUADS);
  if (isAllTerminals(allCounts) && !four) best.insert(best.begin(), {I_ALL_TERMINALS, 10});
  else if (isMixedOrphans(allCounts) && !four) best.insert(best.begin(), {I_MIXED_ORPHANS, 1});
  return true;
}

static bool isLimitHandItem(const ScoreItem& it) {
  if (it.faan < LIMIT) return false;
  return it.item == I_THIRTEEN_ORPHANS || it.item == I_NINE_GATES || it.item == I_BIG_FOUR_WINDS ||
         it.item == I_FOUR_QUADS || it.item == I_EIGHT_IMMORTALS;
}
static bool isConstituent(Item item, Item limit) {
  if (item == I_CONCEALED_TRIPLETS || item == I_ALL_HONORS || item == I_BIG_FOUR_WINDS || item == I_FOUR_QUADS) return false;
  static const Item winds[] = {I_ALL_TRIPLETS, I_HALF_FLUSH, I_FULL_FLUSH, I_ALL_SEQUENCES, I_SMALL_FOUR_WINDS,
                               I_SMALL_THREE_DRAGONS, I_BIG_THREE_DRAGONS, I_DRAGON_TRIPLET, I_DRAGON_QUAD};
  static const Item orphans[] = {I_MIXED_ORPHANS, I_SEVEN_PAIRS, I_ALL_TRIPLETS, I_HALF_FLUSH, I_FULL_FLUSH, I_ALL_SEQUENCES};
  static const Item gates[] = {I_FULL_FLUSH, I_ALL_TRIPLETS, I_ALL_SEQUENCES};
  if (limit == I_BIG_FOUR_WINDS || limit == I_FOUR_QUADS) { for (Item x : winds) if (x == item) return true; }
  else if (limit == I_THIRTEEN_ORPHANS) { for (Item x : orphans) if (x == item) return true; }
  else if (limit == I_NINE_GATES) { for (Item x : gates) if (x == item) return true; }
  // The JS's prefix rules ('Seat Wind ' with a space) never match an item name.
  return false;
}
static std::vector<ScoreItem> applyLimitNoStacking(const std::vector<ScoreItem>& items) {
  std::vector<Item> limits;
  for (auto& it : items) if (isLimitHandItem(it)) limits.push_back(it.item);
  if (limits.empty()) return items;
  std::vector<ScoreItem> out;
  for (auto& it : items) {
    if (isLimitHandItem(it)) { out.push_back(it); continue; }
    bool drop = false;
    for (Item l : limits) if (isConstituent(it.item, l)) { drop = true; break; }
    if (!drop) out.push_back(it);
  }
  return out;
}
static std::vector<ScoreItem> applyInherentTripletsNoStacking(const std::vector<ScoreItem>& items) {
  if (!has(items, I_ALL_HONORS) && !has(items, I_ALL_TERMINALS)) return items;
  std::vector<ScoreItem> out;
  for (auto& it : items) if (it.item != I_ALL_TRIPLETS) out.push_back(it);
  return out;
}

static bool hasTile(const std::vector<int8_t>& b, int t) { for (int x : b) if (x == t) return true; return false; }

static std::vector<ScoreItem> flowerBonusItems(const std::vector<int8_t>& bonus, int seat, bool noFlowers) {
  std::vector<ScoreItem> items;
  if (noFlowers) { if (bonus.empty()) items.push_back({I_NO_FLOWERS, 1}); return items; }
  if (bonus.empty() || bonus.size() >= 7) return items;
  bool allF = hasTile(bonus, 34) && hasTile(bonus, 35) && hasTile(bonus, 36) && hasTile(bonus, 37);
  bool allS = hasTile(bonus, 38) && hasTile(bonus, 39) && hasTile(bonus, 40) && hasTile(bonus, 41);
  if (allF) items.push_back({I_FOUR_FLOWERS, 2});
  if (seat > 0 && hasTile(bonus, 34 + seat - 1)) items.push_back({I_SEAT_FLOWER, 1});
  if (allS) items.push_back({I_FOUR_SEASONS, 2});
  if (seat > 0 && hasTile(bonus, 38 + seat - 1)) items.push_back({I_SEAT_SEASON, 1});
  std::vector<ScoreItem> out;
  for (auto& it : items) {
    if (allF && it.item == I_SEAT_FLOWER) continue;
    if (allS && it.item == I_SEAT_SEASON) continue;
    out.push_back(it);
  }
  return out;
}

struct Opts { int seat, round; bool concealed, selfDraw, lastTile, robKong, kongWin, doubleKong, heavenly, earthly, noFlowers; int minFaan; };

static bool suppressesConcealed(const std::vector<ScoreItem>& p) {
  for (auto& it : p) if (it.item == I_SEVEN_PAIRS || it.item == I_CONCEALED_TRIPLETS || it.item == I_THIRTEEN_ORPHANS || it.item == I_NINE_GATES) return true;
  return false;
}

static std::vector<ScoreItem> situationalItems(const std::vector<ScoreItem>& earned, const std::vector<int8_t>& bonus, const Opts& o) {
  std::vector<ScoreItem> items;
  if (o.heavenly) items.push_back({I_HEAVENLY, LIMIT});
  if (o.earthly) items.push_back({I_EARTHLY, LIMIT});
  if (o.selfDraw) items.push_back({I_SELF_DRAW, 1});
  if (o.concealed && !suppressesConcealed(earned)) items.push_back({I_CONCEALED, 1});
  if (o.lastTile) items.push_back({I_LAST_TILE, 1});
  if (o.robKong) items.push_back({I_ROB_KONG, 1});
  if (o.doubleKong) items.push_back({I_DOUBLE_KONG, 8});
  else if (o.kongWin) items.push_back({I_KONG_WIN, 1});
  auto f = flowerBonusItems(bonus, o.seat, o.noFlowers);
  items.insert(items.end(), f.begin(), f.end());
  return items;
}

int faanToPoints(int faan, int minFaan) {
  if (faan < minFaan) return -1;
  int eff = faan > LIMIT ? LIMIT : faan;
  if (eff >= 3 && eff <= 13) return 8 << (eff - 3);
  return -1;
}

double halfSpicyPoints(int faan) {
  if (faan <= 4) return double(1 << faan);
  if (faan % 2 == 0) return double(1 << ((faan + 4) / 2));
  return double(1 << ((faan + 3) / 2)) * 1.5;
}

static int capFaan(int f) { return f > LIMIT ? LIMIT : f; }

Score scoreHand(const ScoreInput& in) {
  std::vector<PM> fixed;
  std::vector<int8_t> tiles = in.concealed;
  bool concealed = true;
  for (auto& m : in.melds) {
    int t = m.tile;
    PM pm{m.type, int8_t(t >= 27 ? 3 : t / 9), int8_t(t >= 27 ? t - 26 : t % 9 + 1)};
    fixed.push_back(pm);
    int size = m.type == 'k' ? 4 : 3;
    for (int i = 0; i < size; i++) tiles.push_back(int8_t(m.type == 'c' ? t + i : t));
    if (!m.concealed) concealed = false;
  }
  Opts o{in.seat ? in.seat : 1, in.round ? in.round : 1, concealed, in.selfDraw, in.lastTile, in.robKong, in.kongWin,
         in.doubleKong, in.heavenly, in.earthly, in.flowers.empty(), in.minFaan};
  const auto& flowerIds = in.flowers;

  SC c = countsFrom(tiles);
  Ctx ctx{o.seat, o.round, o.concealed};
  Profile profile = suitProfile(c);
  Score result;

  bool hasFlowerWin = flowerIds.size() >= 7;
  ScoreItem flowerWin = flowerIds.size() >= 8 ? ScoreItem{I_EIGHT_IMMORTALS, LIMIT} : ScoreItem{I_SEVEN_ROBBING_ONE, 5};
  auto flowerOnly = [&]() {
    result.valid = true;
    result.items = {flowerWin};
    auto s = situationalItems({flowerWin}, flowerIds, o);
    result.items.insert(result.items.end(), s.begin(), s.end());
    result.faan = capFaan(sumFaan(result.items));
    result.points = faanToPoints(result.faan, o.minFaan);
    return result;
  };

  if (tiles.empty()) {
    if (hasFlowerWin) return flowerOnly();
    return result;
  }
  bool chicken = false;
  if (fixed.empty() && isThirteenOrphans(c)) { result.valid = true; result.items = {{I_THIRTEEN_ORPHANS, LIMIT}}; }
  else if (fixed.empty() && isNineGates(c)) { result.valid = true; result.items = {{I_NINE_GATES, LIMIT}}; }
  else {
    // The free tiles after taking each fixed meld out (none missing: they were added above).
    std::vector<int8_t> free = in.concealed;
    SC freeCounts = countsFrom(free);
    std::vector<ScoreItem> pattern;
    bool ok;
    if (!fixed.empty()) ok = bestStandardItems(freeCounts, profile, ctx, fixed, c, pattern);
    else {
      std::vector<ScoreItem> std_, seven;
      bool hasStd = bestStandardItems(c, profile, ctx, {}, c, std_);
      bool hasSeven = isSevenPairs(c);
      if (hasSeven) seven = sevenPairsItems(c, profile, ctx);
      if (hasStd && hasSeven) pattern = sumFaan(seven) > sumFaan(std_) ? seven : std_;
      else if (hasStd) pattern = std_;
      else if (hasSeven) pattern = seven;
      ok = hasStd || hasSeven;
    }
    if (ok) { result.valid = true; result.items = pattern; chicken = sumFaan(pattern) == 0; }
    else if (hasFlowerWin) return flowerOnly();
    else return result;
  }
  if (hasFlowerWin) { result.items.push_back(flowerWin); result.valid = true; }
  if (chicken) result.items.insert(result.items.begin(), {I_CHICKEN, 0});
  result.items = applyInherentTripletsNoStacking(applyLimitNoStacking(result.items));
  auto s = situationalItems(result.items, flowerIds, o);
  result.items.insert(result.items.end(), s.begin(), s.end());
  result.faan = capFaan(sumFaan(result.items));
  result.points = faanToPoints(result.faan, o.minFaan);
  return result;
}

}  // namespace lcm
