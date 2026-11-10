// The shared foundation (js/mahjong-bot.js), sections 1-8, in the JS's order.
#include "bot.h"
#include <cstdio>
#include <cstdlib>

namespace lcm {

static const int DRAGONS[3] = {31, 32, 33};
static const int WINDS_[4] = {27, 28, 29, 30};
static const int TERMINALS_[6] = {0, 8, 9, 17, 18, 26};
static const double EARLY_WALL = 60, LATE_WALL = 32, ESTIMATE_FAAN_CAP = 10, VALUE_SLOPE = 0.6;
static const double COMPETITION = 0.7, STEP = 0.42, SELF_DRAW_PAYS = 3, SELF_DRAW_CHANCE = 0.4;
static const double WIN_PER_TURN = 0.22;
static const int SUIT_MAJORITY = 7;
static const int GATES_NEED[9] = {3, 1, 1, 1, 1, 1, 1, 1, 3};
static const int LIMIT = 13;

static bool isDragon(int i) { return i >= 31 && i <= 33; }
static bool isWindI(int i) { return i >= 27 && i <= 30; }
static bool isTerminalI(int i) { return i < 27 && (i % 9 == 0 || i % 9 == 8); }
static bool isHonorI(int i) { return i >= 27; }
static bool isOrphanI(int i) { return isTerminalI(i) || isHonorI(i); }

static Mask maskOf(bool (*f)(int)) { Mask m = 0; for (int i = 0; i < 34; i++) if (f(i)) m |= Mask(1) << i; return m; }
static const Mask M_ORPHAN = maskOf(isOrphanI), M_TERMINAL = maskOf(isTerminalI), M_HONOR = maskOf(isHonorI);
static const Mask M_DRAGON = maskOf(isDragon), M_WIND = maskOf(isWindI);
static Mask suitMask(int su) { Mask m = 0; for (int i = su * 9; i < su * 9 + 9; i++) m |= Mask(1) << i; return m; }
static Mask halfMask(int su) { return suitMask(su) | M_HONOR; }
static const Mask M_NUMBERS = suitMask(0) | suitMask(1) | suitMask(2);

static int meldFirst(const Meld& m) { return m.tiles[0]; }
static int meldSuit(const Meld& m) { return suitIdx(m.tiles[0]); }

static Counts restrictMask(const Counts& c, Mask keep) {
  Counts out = c;
  for (int i = 0; i < 34; i++) if (!inMask(keep, i)) out[i] = 0;
  return out;
}
static int countWhere(const Counts& c, Mask keep) { int n = 0; for (int i = 0; i < 34; i++) if (inMask(keep, i)) n += c[i]; return n; }

Family planFamily(PlanKind k, int suit) {
  switch (k) {
    case P_HALF: case P_FULL: return Family(F_FLUSH_C + suit);
    case P_TRIPLETS: case P_CONCEALED_TRIPLETS: return F_SETS;
    case P_PLAIN: case P_RUNS: case P_STRAIGHTS: return F_RUNS;
    case P_PAIRS: case P_PAIRS_ORPHANS: case P_PAIRS_HONORS: case P_PAIRS_TERMINALS: return F_PAIRS;
    case P_MIXED_ORPHANS: case P_ALL_TERMINALS: case P_ALL_HONORS: return F_MAJORS;
    case P_SMALL_DRAGONS: case P_BIG_DRAGONS: return F_DRAGONS;
    case P_SMALL_WINDS: case P_BIG_WINDS: case P_JY_WINDS: return F_WINDS;
    case P_ORPHANS: return F_ORPHANS;
    case P_GATES: return F_GATES;
    case P_JY_HONORS: return F_HONORS;
    case P_JY_TERMINALS: return F_TERMINALS;
  }
  return F_NONE;
}
std::string planIdString(const Plan* p) {
  if (!p) return "-";
  static const char* N[] = {"plain", "runs", "straights", "half", "full", "triplets", "concealed-triplets", "pairs", "orphans", "gates",
    "mixed-orphans", "all-terminals", "all-honors", "small-dragons", "big-dragons", "small-winds", "big-winds", "pairs-orphans",
    "pairs-honors", "pairs-terminals", "winds", "honors", "terminals"};
  std::string s = N[p->kind];
  if (p->kind == P_HALF || p->kind == P_FULL) s += std::string("-") + "cdb"[p->suit];
  return s;
}
static Family familyOf(const Plan& p) { return planFamily(p.kind, p.suit); }
static bool isFlushKind(PlanKind k) { return k == P_HALF || k == P_FULL; }

/* ---------------- per-seat memos (kept on the seat, so each hand starts fresh) ---------------- */

struct BotSeatMemos : BotSeatState {
  std::map<std::string, SeatMemo> byBot;
  SeatMemo shared;
};
static BotSeatMemos& memos(const Game& g, int seat) {
  auto& st = g.hand.seats[seat].botState;
  if (!st) st = std::make_shared<BotSeatMemos>();
  return *static_cast<BotSeatMemos*>(st.get());
}
SeatMemo& seatMemo(const Game& g, int seat, const std::string& botId) { return memos(g, seat).byBot[botId]; }
SeatMemo& seatShared(const Game& g, int seat) { return memos(g, seat).shared; }

/* ---------------- 1. Context ---------------- */

static std::vector<const Meld*> shownMelds(const Seat& s) {
  std::vector<const Meld*> out;
  for (auto& m : s.melds) if (!m.concealed) out.push_back(&m);
  return out;
}

int Foundation::valueWeight(const Ctx& ctx, int i) {
  int w = 0;
  if (isDragon(i)) w += 1;
  if (i == 26 + ctx.seatWind) w += 1;
  if (i == 26 + ctx.round) w += 1;
  return w;
}

LeftRead Foundation::leftRead(const Game& g, int seat) {
  int o = (seat + 3) % 4;
  const Seat& s = g.hand.seats[o];
  int n = int(s.discards.size());
  int by[3] = {0, 0, 0};
  for (auto& d : s.discards) { int su = suitIdx(d.tile); if (su < 3) by[su]++; }
  // inMelds: number suits of shown melds, in insertion order
  std::vector<int> inMelds;
  bool chowSuits[3] = {false, false, false};
  for (auto* m : shownMelds(s)) {
    int su = meldSuit(*m);
    if (su == 3) continue;
    if (std::find(inMelds.begin(), inMelds.end(), su) == inMelds.end()) inMelds.push_back(su);
    if (m->type == CHOW) chowSuits[su] = true;
  }
  int keeps = inMelds.size() == 1 ? inMelds[0] : -1;
  // A chow settles it: they need that suit, and toss the other two.
  bool locked = keeps >= 0 && chowSuits[keeps];
  int tosses[2] = {-1, -1}, nTosses = 0;
  if (locked) for (int su = 0; su < 3; su++) if (su != keeps) tosses[nTosses++] = su;
  if (keeps < 0 && inMelds.empty() && n >= 6) {
    for (int su = 0; su < 3; su++) {
      bool others = true;
      for (int x = 0; x < 3; x++) if (x != su && !(by[x] >= 2)) others = false;
      if (by[su] <= int(std::floor(n * 0.1)) && others) keeps = su;
    }
  }
  int feeds = -1;
  if (n >= 6) {
    int top = 0; bool tie = false;
    for (int su = 0; su < 3; su++) {
      if (su == keeps) continue;
      if (by[su] > top) { top = by[su]; feeds = su; tie = false; } else if (by[su] == top) tie = true;
    }
    if (tie || top < 3) feeds = -1;
  }
  if (locked && feeds < 0) feeds = by[tosses[0]] == by[tosses[1]] ? -1 : (by[tosses[0]] > by[tosses[1]] ? tosses[0] : tosses[1]);
  LeftRead r; r.seat = o; r.keeps = keeps; r.feeds = feeds; r.locked = locked;
  r.tosses[0] = tosses[0]; r.tosses[1] = tosses[1]; r.nTosses = nTosses;
  return r;
}

AfterRead Foundation::afterRead(const Game& g, int seat) {
  int o = (seat + 1) % 4;
  const Seat& s = g.hand.seats[o];
  int n = int(s.discards.size());
  int by[3] = {0, 0, 0};
  for (auto& d : s.discards) { int su = suitIdx(d.tile); if (su < 3) by[su]++; }
  int danger[3] = {0, 0, 0};
  std::vector<int> chowList;
  for (auto* m : shownMelds(s)) {
    int su = meldSuit(*m);
    if (su == 3) continue;
    danger[su]++;
    if (m->type == CHOW && std::find(chowList.begin(), chowList.end(), su) == chowList.end()) chowList.push_back(su);
  }
  std::vector<int> numberSuits;
  for (int su = 0; su < 3; su++) if (danger[su]) numberSuits.push_back(su);
  int keeps = -1; bool locked = false;
  if (chowList.size() == 1 && numberSuits.size() == 1) { keeps = chowList[0]; locked = true; }
  if (keeps < 0 && numberSuits.size() <= 1 && n >= 5) {
    for (int su = 0; su < 3; su++) {
      if (keeps >= 0) continue;
      if (!numberSuits.empty() && numberSuits[0] != su) continue;
      int otherThrown = 0; bool someTwo = false, everyTwo = true;
      for (int x = 0; x < 3; x++) {
        if (x == su) continue;
        otherThrown += by[x];
        if (by[x] >= 2) someTwo = true; else everyTwo = false;
      }
      bool clear = by[su] == 0 && otherThrown >= 3 && someTwo;
      bool sixth = n >= 6 && by[su] <= int(std::floor(n * 0.1)) && everyTwo;
      if (clear || sixth) keeps = su;
    }
  }
  AfterRead r; r.seat = o; r.keeps = keeps; r.locked = locked; r.melds = keeps >= 0 ? danger[keeps] : 0;
  return r;
}

void Foundation::suitCounts(const Counts& counts, const Ctx& ctx, int out[3]) {
  for (int su = 0; su < 3; su++) {
    int n = countWhere(counts, suitMask(su));
    int k = 0;
    for (auto& m : ctx.melds) { int t = meldFirst(m); if (t < 27 && t / 9 == su) k++; }
    out[su] = n + k * 3;
  }
}

int Foundation::avoidSuitOf(const Counts& counts, const Ctx& ctx) {
  const LeftRead& read = ctx.leftRead;
  if (read.keeps < 0) return -1;
  int n[3];
  suitCounts(counts, ctx, n);
  if (n[read.keeps] < 6) return -1;
  for (int su = 0; su < 3; su++)
    if (su != read.keeps && n[su] >= 6 && n[su] >= n[read.keeps] - 1) return read.keeps;
  return -1;
}

double Foundation::ownLean(const Plan* plan, const Ctx& ctx) {
  const OwnRead& own = ctx.ownRead;
  if (own.n < 4) return 1;
  if (plan && plan->kind == P_STRAIGHTS) return double(own.by[3]) / own.n >= 0.4 ? 1.15 : 1;
  if (!plan || plan->suit < 0 || !isFlushKind(plan->kind)) return 1;
  double share = double(own.by[plan->suit]) / own.n;
  return share <= 0.1 ? 1.25 : share >= 0.4 ? 0.75 : 1;
}

double Foundation::suitLean(const Plan* plan, const Ctx& ctx) {
  double lean = ownLean(plan, ctx);
  if (!plan || plan->suit < 0 || !isFlushKind(plan->kind)) return lean;
  const LeftRead& read = ctx.leftRead;
  if (plan->suit == read.keeps) lean *= 0.6;
  else if (plan->suit == read.feeds || (read.nTosses && (plan->suit == read.tosses[0] || plan->suit == read.tosses[1]))) lean *= 1.5;
  const AfterRead& after = ctx.afterRead;
  if (after.keeps == plan->suit && read.keeps != plan->suit)
    lean *= 1 + 0.2 * (1 + after.melds) + (after.locked ? 0.25 : 0);
  return lean;
}

static OwnRead readOwnDiscards(const std::vector<Discard>& list) {
  OwnRead r;
  r.n = int(list.size());
  for (auto& d : list) r.by[suitIdx(d.tile)]++;
  return r;
}

Family Foundation::readCommit(const Game& g, int seat, std::map<int, int>& left) {
  SeatMemo& memo = seatMemo(g, seat, T.id);
  left = memo.left;
  return memo.turn == int(g.hand.seats[seat].discards.size()) ? memo.base : memo.now;
}

Ctx Foundation::buildContext(const Game& g, int seat) {
  const Seat& s = g.hand.seats[seat];
  Ctx ctx;
  ctx.game = &g;
  ctx.seat = seat;
  ctx.seatWind = seatWind(g, seat);
  ctx.round = g.round;
  ctx.melds = s.melds;
  ctx.actualMelds = true;
  ctx.declared = int(s.melds.size());
  ctx.concealed = true;
  for (auto& m : s.melds) { if (!m.concealed) ctx.concealed = false; if (m.type == CHOW) ctx.hasChow = true; ctx.meldSuits[meldSuit(m)] = true; }
  ctx.flowers = s.flowers;
  ctx.unseen = unseenCounts(g, seat);
  ctx.wallLeft = g.hand.wall.size();
  int tot = 0;
  for (int i = 0; i < 34; i++) tot += ctx.unseen[i];
  ctx.unseenTotal = tot ? tot : 1;
  ctx.drawsLeft = std::max(1.0, ctx.wallLeft / 4.0);
  ctx.turn = int(s.discards.size());
  ctx.commitKey = readCommit(g, seat, ctx.commitLeft);
  ctx.slope = valueSlope(g, seat);
  ctx.isDealer = seat == g.dealer;
  ctx.leftRead = leftRead(g, seat);
  ctx.afterRead = afterRead(g, seat);
  ctx.ownRead = readOwnDiscards(s.discards);
  ctx.track = readTable(g, seat, ctx.unseen);
  double m = 1;
  for (auto& t : opponentThreats(g, seat)) m = m * (1 - t.ready * WIN_PER_TURN);
  ctx.hazard = 1 - m;
  jyContext(ctx, g, seat);
  return ctx;
}

Ctx Foundation::withMeld(const Ctx& ctx, const Meld& meld) {
  Ctx next = ctx;
  next.melds.push_back(meld);
  next.actualMelds = false;
  next.declared = ctx.declared + 1;
  next.concealed = ctx.concealed && meld.concealed;
  next.hasChow = ctx.hasChow || meld.type == CHOW;
  next.meldSuits[meldSuit(meld)] = true;
  return next;
}

/* ---------------- 2. Value model ---------------- */

static double payoutRatio(double f) { return js::pow(2, std::min(f, 13.0) - 3); }

double Foundation::handValue(double f, double slope) {
  if (f < 3) return js::pow(0.45, 3 - f);
  double power = T.valuePower * ((slope ? slope : VALUE_SLOPE) / VALUE_SLOPE);
  return js::pow(payoutRatio(std::min(f, ESTIMATE_FAAN_CAP)), power);
}

double Foundation::valueSlope(const Game& g, int seat) {
  int turn = int(g.hand.seats[seat].discards.size());
  double slope = turn <= 5 ? 0.75 : turn <= 9 ? 0.6 : 0.45;
  bool bigThreat = false;
  for (int k = 0; k < 4 && !bigThreat; k++) {
    if (k == seat) continue;
    const Seat& o = g.hand.seats[k];
    if (o.melds.size() < 2) continue;
    for (auto* m : shownMelds(o)) if (m->type != CHOW && meldFirst(*m) >= 27) { bigThreat = true; break; }
  }
  return bigThreat ? std::min(slope, 0.45) : slope;
}

/* ---------------- 3. Plans and faan estimates ---------------- */

double Foundation::baseFaan(const Ctx& ctx) {
  double f = flowerPoints(ctx);
  for (auto& m : ctx.melds) { if (m.type == CHOW) continue; f += valueWeight(ctx, meldFirst(m)); }
  return f;
}

double Foundation::handYaku(const Ctx& ctx, const Counts& c) {
  double f = 0;
  int dragonSets = 0, dragonPairs = 0;
  for (auto& m : ctx.melds) if (m.type != CHOW && isDragon(meldFirst(m))) dragonSets++;
  for (int i = 27; i < 34; i++) {
    int w = valueWeight(ctx, i);
    if (c[i] >= 3) {
      f += w;
      if (isDragon(i)) dragonSets++;
    } else if (c[i] == 2) {
      if (w) f += w * (ctx.unseen[i] >= 1 ? 0.45 : 0.1);
      if (isDragon(i)) dragonPairs++;
    }
  }
  if (dragonSets == 3) f += 5;
  else if (dragonSets == 2 && dragonPairs >= 1) f += 2.5;
  return f;
}

int Foundation::flowerPoints(const Ctx& ctx) {
  const auto& f = ctx.flowers;
  if (f.empty()) return 1;
  int seat = ctx.seatWind;
  auto has = [&](int t) { return std::find(f.begin(), f.end(), int8_t(t)) != f.end(); };
  auto group = [&](int first) {
    bool all = has(first) && has(first + 1) && has(first + 2) && has(first + 3);
    return all ? 2 : has(first + seat - 1) ? 1 : 0;
  };
  return group(34) + group(38);
}

bool Foundation::cheapWin(const Ctx& ctx) {
  int min = ctx.game->minFaan;
  double sure = baseFaan(ctx);
  if (sure >= min) return true;
  bool runsOnly = true;
  for (auto& m : ctx.melds) if (m.type != CHOW) runsOnly = false;
  return sure >= min - 1 && runsOnly;
}

int Foundation::chowCommitment(const Ctx& ctx) {
  if (!ctx.hasChow) return -1;
  if (cheapWin(ctx)) return -1;
  int n = 0, su = -1;
  for (int s = 0; s < 3; s++) if (ctx.meldSuits[s]) { n++; su = s; }
  return n == 1 ? su : -1;
}

int Foundation::suitHeld(const Ctx& ctx, const Counts& counts, int su) {
  int n = countWhere(counts, suitMask(su));
  for (auto& m : ctx.melds) { int t = meldFirst(m); if (t < 27 && t / 9 == su) n += 3; }
  return n;
}

bool Foundation::chowSuitReady(const Ctx& ctx, const Counts& counts, int su) { return suitHeld(ctx, counts, su) >= SUIT_MAJORITY; }

static bool isMixedPlan(PlanKind k) {
  return k == P_PAIRS || k == P_ORPHANS || k == P_GATES || k == P_JY_TERMINALS || k == P_JY_HONORS || k == P_JY_WINDS;
}

int Foundation::suitCommitment(const Ctx& ctx, const Counts& counts) {
  int chow = chowCommitment(ctx);
  if (chow >= 0) return chow;
  const Plan* lead = ctx.leadPlan.get();
  if (lead && (lead->kind == P_STRAIGHTS || isMixedPlan(lead->kind))) return -1;
  // the meld suits other than honors, in the order the JS's object keys give (first seen)
  std::vector<int> other;
  for (auto& m : ctx.melds) { int su = meldSuit(m); if (su != 3 && std::find(other.begin(), other.end(), su) == other.end()) other.push_back(su); }
  if (other.size() > 1) return -1;
  int best = -1, bestN = 0; bool tie = false; int bySuit[3];
  for (int s = 0; s < 3; s++) {
    int n = suitHeld(ctx, counts, s);
    bySuit[s] = n;
    if (n > bestN) { best = s; bestN = n; tie = false; } else if (n == bestN) tie = true;
  }
  int leadSuit = lead && isFlushKind(lead->kind) ? lead->suit : -1;
  if (leadSuit >= 0 && bestN >= SUIT_MAJORITY && bySuit[leadSuit] >= SUIT_MAJORITY - 1 && bySuit[leadSuit] >= bestN - 1) {
    best = leadSuit; bestN = bySuit[leadSuit]; tie = false;
  }
  if (best < 0 || tie || bestN < SUIT_MAJORITY) return -1;
  if (!other.empty() && other[0] != best) return -1;
  return best;
}

int Foundation::keptHonorPair(const Counts& counts, const Ctx& ctx) {
  int best = -1;
  for (int i = 27; i < 34; i++) {
    if (counts[i] != 2) continue;
    if (best < 0 || valueWeight(ctx, i) > valueWeight(ctx, best)) best = i;
  }
  return best;
}

bool Foundation::holdsDragon(const Game& g, int i, int shanten) { return isDragon(i) && revealedCopies(g, i) == 0 && shanten > 0; }

// The contradiction check (js/mahjong-bot.js contradicts, consistentFirst).
bool Foundation::contradicts(const Game& g, const Counts& counts, const Candidate& x) {
  if (x.shanten == 0) return false;
  const Analysis* an = x.analysis.get();
  const Plan* plan = an && an->hasBest ? an->best.plan.get() : nullptr;
  if (!plan) return false;
  int i = x.index;
  if (i >= 27 && counts[i] + revealedCopies(g, i) >= 4) return false;
  Counts after = counts;
  after[i]--;
  if (plan->kind == P_TRIPLETS || plan->kind == P_CONCEALED_TRIPLETS || plan->kind == P_PAIRS) {
    if (counts[i] < 2) return false;
    for (int s = 0; s < 34; s++) if (after[s] == 1 && s != i && !holdsDragon(g, s, x.shanten)) return true;
    return false;
  }
  Mask keep;
  if (plan->hasKeep) keep = plan->keep;
  else if (plan->kind == P_HALF) keep = halfMask(plan->suit);
  else if (plan->kind == P_FULL) keep = suitMask(plan->suit);
  else if (plan->kind == P_STRAIGHTS || plan->kind == P_RUNS) keep = M_NUMBERS;
  else return false;
  if (!inMask(keep, i)) return false;
  bool straights = plan->kind == P_STRAIGHTS || plan->kind == P_RUNS;
  for (int j = 0; j < 34; j++) {
    if (!after[j] || inMask(keep, j)) continue;
    if (holdsDragon(g, j, x.shanten) || (straights && j >= 27 && after[j] >= 2)) continue;
    return true;
  }
  return false;
}

static bool planKeepMask(const Plan* plan, Mask& keep) {
  if (plan->hasKeep) { keep = plan->keep; return true; }
  if (plan->kind == P_HALF) { keep = halfMask(plan->suit); return true; }
  if (plan->kind == P_FULL) { keep = suitMask(plan->suit); return true; }
  if (plan->kind == P_STRAIGHTS || plan->kind == P_RUNS) { keep = M_NUMBERS; return true; }
  return false;
}

bool Foundation::claimContradicts(const ClaimFound& found, const Ctx& ctx, const Decision& d, int tile) {
  if (d.type == A_PASS || d.type == A_WIN) return false;
  const Plan* plan = found.stay.hasBest ? found.stay.best.plan.get() : nullptr;
  if (!plan) return false;
  if (plan->kind == P_ORPHANS) return true;
  if ((d.type == A_PUNG || d.type == A_KONG) && tile >= 27 && valueWeight(ctx, tile) > 0) return false;
  if (plan->kind == P_PAIRS || plan->kind == P_GATES || plan->kind == P_CONCEALED_TRIPLETS || plan->kind == P_STRAIGHTS) return true;
  Mask keep;
  if (!planKeepMask(plan, keep)) return false;
  if (!inMask(keep, tile)) return true;
  if (d.type == A_CHOW) for (int t : d.tiles) if (!inMask(keep, t)) return true;
  return false;
}

// The foundation's liveUpgrade never has a hard target with Jorge Yau's hooks (they always set a target).
bool Foundation::claimConsistent(const Game& g, int seat, const ClaimFound* found, const Decision& d, int tile) {
  if (!check || !found || d.type == A_PASS || d.type == A_WIN) return true;
  Ctx ctx = buildContext(g, seat);
  return !claimContradicts(*found, ctx, d, tile);
}

bool Foundation::kongContradicts(const Plan* plan, int tile) {
  if (!plan) return false;
  PlanKind k = plan->kind;
  if (k == P_PAIRS || k == P_ORPHANS || k == P_GATES || k == P_STRAIGHTS || k == P_RUNS) return true;
  Mask keep;
  return planKeepMask(plan, keep) && !inMask(keep, tile);
}

std::vector<CandP> Foundation::consistentFirst(const std::vector<CandP>& out, const Game& g, const Counts& counts, bool folding) {
  if (!check || folding || out.empty()) return out;
  size_t k = 0;
  while (k < out.size() && contradicts(g, counts, *out[k])) k++;
  if (k == 0) return out;
  if (k == out.size()) k = out.size() - 1;
  std::vector<CandP> r;
  r.push_back(out[k]);
  for (size_t m = 0; m < out.size(); m++) if (m != k) r.push_back(out[m]);
  return r;
}
bool Foundation::loneDragon(const Game& g, const Counts& counts, int i) { return isDragon(i) && counts[i] == 1 && revealedCopies(g, i) == 0; }

bool Foundation::chowOfAnotherSuit(const Ctx& ctx, int i) {
  if (i >= 27) return false;
  int suit = i / 9;
  for (auto& m : ctx.melds) if (m.type == CHOW && suitIdx(meldFirst(m)) != suit) return true;
  return false;
}

bool Foundation::sharedPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, double& out) {
  int i = cand.index;
  const Plan* lead = ctx.leadPlan.get();
  if (lead && lead->kind == P_STRAIGHTS && !ctx.hasChow) {
    int eyes = keptHonorPair(counts, ctx);
    if (i >= 27 && i != eyes && !holdsDragon(g, i, cand.shanten)) { out = -1; return true; }
    return false;
  }
  int committed = suitCommitment(ctx, counts);
  if (committed >= 0 && i < 27 && i / 9 != committed) {
    if (counts[i] == 2 && !chowOfAnotherSuit(ctx, i)) return false;
    out = 0;
    return true;
  }
  return false;
}

struct Shape { int pairs; bool hasSet; };
static Shape concealedShape(const Counts& c) {
  Shape s{0, false};
  for (int i = 0; i < 34; i++) { if (c[i] >= 3) s.hasSet = true; else if (c[i] == 2) s.pairs++; }
  return s;
}

bool Foundation::chaseSevenPairs(const Counts& c, const Ctx& ctx) {
  if (ctx.blockSevenPairs) return false;
  if (ctx.declared) return false;
  for (auto& m : ctx.melds) if (m.type == PUNG || m.type == KONG) return false;
  Shape s = concealedShape(c);
  return !s.hasSet && s.pairs > 4;
}

bool Foundation::orphansAlive(const Counts& c, const Ctx& ctx) {
  for (int i : ORPHAN_INDEXES) if (!(c[i] || ctx.unseen[i] > 0)) return false;
  return true;
}

static int nineGatesProgress(const Counts& c, int start) {
  int n = 0;
  for (int r = 0; r < 9; r++) n += std::min(int(c[start + r]), GATES_NEED[r]);
  return n;
}

static int nineGatesShanten(int start, const Counts& counts, int declared) {
  if (declared) return INF;
  int have = 0, junk = 0, total = 0;
  for (int i = 0; i < 34; i++) {
    int n = counts[i];
    if (!n) continue;
    total += n;
    int offset = i - start;
    if (offset < 0 || offset > 8) { junk += n; continue; }
    have += std::min(n, GATES_NEED[offset]);
  }
  if (have >= 13 && junk == 0 && total >= 14) return -1;
  return 13 - have;
}

static bool gatesTileNeeded(const Counts& counts, int start, int i) {
  int offset = i - start;
  if (offset < 0 || offset > 8) return false;
  return counts[i] <= GATES_NEED[offset];
}

static int pairsFlush(const Counts& c) {
  bool suits[3] = {false, false, false}, honors = false;
  for (int i = 0; i < 34; i++) {
    if (c[i] < 2) continue;
    if (i >= 27) honors = true; else suits[i / 9] = true;
  }
  int n = suits[0] + suits[1] + suits[2];
  if (n != 1) return 0;
  return honors ? 3 : 7;
}

// kind: 0 pairs, 1 orphans, 2 gates
PlanP Foundation::makeSpecialPlan(int kind, const Counts& c, const Ctx& ctx, int gatesSuit, int gatesStart) {
  auto p = std::make_shared<Plan>();
  p->counts = c;
  p->open = false;
  if (kind == 0) { p->kind = P_PAIRS; p->fn.kind = SH_SEVEN; p->faan = baseFaan(ctx) + 4 + pairsFlush(c); }
  else if (kind == 1) { p->kind = P_ORPHANS; p->fn.kind = SH_ORPH; p->faan = 13; }
  else { p->kind = P_GATES; p->suit = gatesSuit; p->start = gatesStart; p->fn.kind = SH_GATES; p->fn.start = gatesStart; p->faan = 13; }
  return p;
}

int Foundation::revealedCopies(const Game& g, int i) {
  int n = 0;
  for (int s = 0; s < 4; s++) {
    const Seat& st = g.hand.seats[s];
    for (auto& d : st.discards) if (!d.claimed && d.tile == i) n++;
    for (auto& m : st.melds) { if (m.concealed) continue; for (int t : m.tiles) if (t == i) n++; }
  }
  return n;
}

bool Foundation::isPungTile(const Game& g, int i) {
  for (int s = 0; s < 4; s++)
    for (auto& m : g.hand.seats[s].melds) {
      if (m.concealed) continue;
      if ((m.type == PUNG || m.type == KONG) && m.tiles[0] == i) return true;
    }
  return false;
}

static bool isSetsPlan(PlanKind k) {
  return k == P_TRIPLETS || k == P_CONCEALED_TRIPLETS || k == P_MIXED_ORPHANS || k == P_ALL_TERMINALS || k == P_ALL_HONORS;
}

double Foundation::discardPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, int bestShanten) {
  double shared;
  if (sharedPriority(g, ctx, counts, cand, shared)) return shared;
  double own;
  if (jyPriority(g, ctx, counts, cand, bestShanten, own)) return own;
  int i = cand.index;
  if (isPungTile(g, i) && counts[i] < 2 && cand.shanten <= bestShanten) return 1;
  const Analysis* an = cand.analysis.get();
  const Entry* best = an && an->hasBest ? &an->best : nullptr;
  const Plan* plan = best ? best->plan.get() : nullptr;
  if (plan && !best->readyBest && isSetsPlan(plan->kind) && counts[i] >= 2) return counts[i] >= 3 ? 7 : 6;
  if (i >= 27 && ctx.wallLeft > EARLY_WALL && revealedCopies(g, i) < 2 && !chaseSevenPairs(counts, ctx)) {
    bool value = valueWeight(ctx, i) > 0;
    if (counts[i] >= 2) return value ? 5 : 4;
    return value ? 4 : 3;
  }
  bool dragon = isDragon(i) && revealedCopies(g, i) < 1;
  bool pair = counts[i] == 2;
  if (dragon && pair) return 5;
  if (dragon) return chaseSevenPairs(counts, ctx) ? 3 : 4;
  if (pair) return 3;
  return 2;
}

int Foundation::shantenOf(const ShFn& fn, const Counts& c, int declared) {
  int s;
  switch (fn.kind) {
    case SH_STD: s = standardShanten(c.data(), declared); break;
    case SH_TRIP: s = tripletsShanten(c.data(), declared); break;
    case SH_SEVEN: s = sevenPairsShanten(c.data(), declared); break;
    case SH_ORPH: s = orphansShanten(c.data(), declared); break;
    case SH_GATES: s = nineGatesShanten(fn.start, c, declared); break;
    case SH_GROUP: {
      // groupShanten(ctx, group, pungs, pair)(c, declared)
      std::vector<int> open;
      for (int i : fn.group) if (std::find(fn.doneIdx.begin(), fn.doneIdx.end(), i) == fn.doneIdx.end()) open.push_back(i);
      js::sort(open, [&](int a, int b) { return c[b] - c[a]; });
      int needPungs = fn.pungs - int(fn.doneIdx.size());
      if (needPungs < 0 || needPungs > int(open.size())) { s = INF; break; }
      int deficit = 0;
      Counts rest = c;
      for (int i : fn.group) rest[i] = 0;
      bool inf = false;
      for (int k = 0; k < needPungs; k++) {
        int i = open[k];
        if (c[i] + fn.unseen[i] < 3) { inf = true; break; }
        deficit += std::max(0, 3 - c[i]);
      }
      if (inf) { s = INF; break; }
      if (fn.pair) {
        if (needPungs >= int(open.size())) { s = INF; break; }
        int p = open[needPungs];
        if (c[p] + fn.unseen[p] < 2) { s = INF; break; }
        deficit += std::max(0, 2 - c[p]);
        rest[p] = 2;
      }
      int sets = declared + needPungs;
      if (sets > 4) { s = INF; break; }
      s = deficit + standardShanten(rest.data(), sets);
      break;
    }
  }
  if (fn.filled && s < INF) {
    int held = 0;
    for (int i = 0; i < 34; i++) held += c[i];
    s = std::max(s, 3 * (4 - declared) + 1 - held);
  }
  return s;
}

std::vector<PlanP> Foundation::plansFor(const Counts& c, Ctx& ctx) {
  // T.ownPlans: the strategy's list stands (plansOfFamily never joins it).
  return aimablePlans(jyPlans(c, ctx), c, ctx);
}

std::vector<PlanP> Foundation::aimablePlans(std::vector<PlanP> plans, const Counts& c, const Ctx& ctx) {
  int min = ctx.game->minFaan;
  std::vector<PlanP> scoring;
  for (auto& p : plans) if (p->kind != P_PLAIN || p->faan >= min) scoring.push_back(p);
  if (scoring.size() == plans.size()) return plans;
  for (auto& p : scoring)
    if (!p->upgrade && !isInf(shantenOf(p->fn, p->counts, ctx.declared))) return scoring;
  auto forced = scoringPlans(c, ctx);
  if (forced.empty()) return plans;
  scoring.insert(scoring.end(), forced.begin(), forced.end());
  return scoring;
}

static PlanP stdPlan(PlanKind kind, int suit, const Counts& counts, ShKind sh, double faan, bool open) {
  auto p = std::make_shared<Plan>();
  p->kind = kind; p->suit = suit; p->counts = counts; p->fn.kind = sh; p->faan = faan; p->open = open;
  return p;
}

std::vector<PlanP> Foundation::scoringPlans(const Counts& c, const Ctx& ctx) {
  double base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
  std::vector<PlanP> out;
  int suitN[3];
  suitCounts(c, ctx, suitN);
  std::vector<int> open;
  for (int su = 0; su < 3; su++) {
    bool off = false;
    for (int k = 0; k < 3; k++) if (k != su && ctx.meldSuits[k]) off = true;
    if (!off) open.push_back(su);
  }
  if (!open.empty()) {
    int su = open[0];
    for (int x : open) if (suitN[x] > suitN[su]) su = x;
    Counts kept = restrictMask(c, halfMask(su));
    out.push_back(stdPlan(P_HALF, su, kept, SH_STD, base + 3 + handYaku(ctx, kept), true));
  }
  if (!ctx.hasChow) out.push_back(stdPlan(P_TRIPLETS, -1, c, SH_TRIP, base + 3 + handYaku(ctx, c), true));
  return out;
}

std::vector<PlanP> Foundation::basePlans(const Counts& c, const Ctx& ctx) {
  double base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
  double yaku = handYaku(ctx, c);
  std::vector<PlanP> plans;
  int committed = chowCommitment(ctx);
  if (committed >= 0) {
    Counts half = restrictMask(c, halfMask(committed));
    plans.push_back(stdPlan(P_HALF, committed, half, SH_STD, base + 3 + handYaku(ctx, half), true));
    if (!ctx.meldSuits[3]) plans.push_back(stdPlan(P_FULL, committed, restrictMask(c, suitMask(committed)), SH_STD, base + 7, true));
    return plans;
  }
  plans.push_back(stdPlan(P_PLAIN, -1, c, SH_STD, base + yaku, true));
  bool allChows = ctx.declared > 0;
  for (auto& m : ctx.melds) if (m.type != CHOW) allChows = false;
  if (allChows) plans.push_back(stdPlan(P_RUNS, -1, restrictMask(c, M_NUMBERS), SH_STD, base + 1, true));
  bool honorSet = false;
  for (int hs = 27; hs < 34; hs++) if (c[hs] >= 3) honorSet = true;
  if (!ctx.declared && !honorSet) {
    int eyes = keptHonorPair(c, ctx);
    Mask keep = M_NUMBERS;
    if (eyes >= 0) keep |= Mask(1) << eyes;
    plans.push_back(stdPlan(P_STRAIGHTS, -1, restrictMask(c, keep), SH_STD, base + (eyes < 0 ? 1 : 0), false));
  }
  auto setTiles = [&](Mask fits) {
    int n = 0;
    for (auto& m : ctx.melds) if (inMask(fits, meldFirst(m))) n++;
    return n * 3;
  };
  int suitN[3];
  suitCounts(c, ctx, suitN);
  int topN = std::max(suitN[0], std::max(suitN[1], suitN[2]));
  const LeftRead& read = ctx.leftRead;
  int avoid = ctx.avoidSuit != -2 ? ctx.avoidSuit : avoidSuitOf(c, ctx);
  auto close = [&](int su) { return suitN[su] >= 6 && suitN[su] >= topN - 1; };
  for (int su = 0; su < 3; su++) {
    bool offSuit = false;
    for (int k = 0; k < 3; k++) if (k != su && ctx.meldSuits[k]) offSuit = true;
    if (offSuit || su == avoid) continue;
    Mask inHalf = halfMask(su), inFull = suitMask(su);
    bool afterKeep = ctx.afterRead.keeps == su;
    int min = close(su) && (avoid >= 0 || read.feeds == su || afterKeep) ? 6 : 7;
    if (countWhere(c, inHalf) + setTiles(inHalf) >= 7) {
      Counts half = restrictMask(c, inHalf);
      plans.push_back(stdPlan(P_HALF, su, half, SH_STD, base + 3 + handYaku(ctx, half), true));
    }
    if (!ctx.meldSuits[3] && countWhere(c, inFull) + setTiles(inFull) >= min)
      plans.push_back(stdPlan(P_FULL, su, restrictMask(c, inFull), SH_STD, base + 7, true));
  }
  if (!ctx.hasChow) {
    int pairish = 0;
    for (int i = 0; i < 34; i++) if (c[i] >= 2) pairish++;
    if (pairish + ctx.declared >= 3) {
      plans.push_back(stdPlan(P_TRIPLETS, -1, c, SH_TRIP, base + 3 + yaku, true));
      int pungsHeld = 0;
      for (int q = 0; q < 34; q++) if (c[q] >= 3) pungsHeld++;
      if (ctx.declared == 0 && pungsHeld >= 2) plans.push_back(stdPlan(P_CONCEALED_TRIPLETS, -1, c, SH_TRIP, base - 1 + 10, false));
    }
  }
  auto up = upgradePlans(c, ctx);
  plans.insert(plans.end(), up.begin(), up.end());
  return plans;
}

/* ---------------- 3b. Upgrades ---------------- */

static int tilesOfF(const Counts& c, const Ctx& ctx, Mask fits) {
  int n = countWhere(c, fits);
  for (auto& m : ctx.melds) if (inMask(fits, meldFirst(m))) n += 3;
  return n;
}

static int setCount(const Counts& c, const Ctx& ctx, int i) {
  int n = c[i];
  for (auto& m : ctx.melds) if (m.type != CHOW && meldFirst(m) == i) n = 3;
  return n;
}

static bool deadForSets(const Counts& c, const Ctx& ctx, int i, Mask fits) {
  if (c[i] >= 3 || ctx.unseen[i] > 0) return false;
  if (c[i] == 1) return true;
  for (int j = 0; j < 34; j++) if (j != i && c[j] == 2 && inMask(fits, j)) return true;
  return false;
}

static Counts liveOnly(const Counts& c, const Ctx& ctx, Mask fits) {
  Counts out = restrictMask(c, fits);
  for (int i = 0; i < 34; i++) if (out[i] && deadForSets(out, ctx, i, fits)) out[i] = 0;
  return out;
}

std::vector<PlanP> Foundation::setUpgrades(const Counts& c, const Ctx& ctx, bool any) {
  double base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
  std::vector<PlanP> plans;
  if (ctx.hasChow) return plans;
  auto meldsFit = [&](Mask fits) {
    for (auto& m : ctx.melds) if (!(m.type != CHOW && inMask(fits, meldFirst(m)))) return false;
    return true;
  };
  auto pairsOf = [&](Mask fits) {
    int n = ctx.declared;
    for (int i = 0; i < 34; i++) if (inMask(fits, i) && c[i] >= 2) n++;
    return n;
  };
  auto fitsHand = [&](Mask fits) { return meldsFit(fits) && (any || (tilesOfF(c, ctx, fits) >= 8 && pairsOf(fits) >= 2)); };
  auto setsPlan = [&](PlanKind kind, Mask fits, int faanKind) {
    Counts kept = liveOnly(c, ctx, fits);
    double faan = faanKind == 0 ? base + 3 + 1 + handYaku(ctx, kept) : faanKind == 1 ? double(LIMIT) : base + 10 + handYaku(ctx, kept);
    auto p = std::make_shared<Plan>();
    p->kind = kind; p->counts = kept; p->fn.kind = SH_TRIP; p->fn.filled = true;
    p->faan = std::min(double(LIMIT), faan); p->open = true;
    p->hasKeep = true; p->keep = fits; p->hasFavors = true; p->favors = fits; p->upgrade = true;
    plans.push_back(p);
  };
  bool both = tilesOfF(c, ctx, M_HONOR) > 0 && tilesOfF(c, ctx, M_TERMINAL) > 0;
  if (fitsHand(M_ORPHAN) && both) setsPlan(P_MIXED_ORPHANS, M_ORPHAN, 0);
  if (fitsHand(M_TERMINAL)) setsPlan(P_ALL_TERMINALS, M_TERMINAL, 1);
  if (fitsHand(M_HONOR)) setsPlan(P_ALL_HONORS, M_HONOR, 2);
  return plans;
}

std::vector<PlanP> Foundation::upgradePlans(const Counts& c, const Ctx& ctx) {
  double base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
  auto plans = setUpgrades(c, ctx, false);
  auto groupPlan = [&](PlanKind kind, const int* group, int gn, int pungs, bool pair, double faan, Mask fav) {
    ShFn fn;
    fn.kind = SH_GROUP;
    fn.group.assign(group, group + gn);
    for (auto& m : ctx.melds)
      if (m.type != CHOW && std::find(group, group + gn, meldFirst(m)) != group + gn) fn.doneIdx.push_back(meldFirst(m));
    fn.pungs = pungs; fn.pair = pair; fn.unseen = ctx.unseen;
    if (isInf(shantenOf(fn, c, ctx.declared))) return;
    auto p = std::make_shared<Plan>();
    p->kind = kind; p->counts = c; p->fn = fn; p->faan = std::min(double(LIMIT), faan); p->open = true;
    p->hasFavors = true; p->favors = fav; p->upgrade = true;
    plans.push_back(p);
  };
  auto have = [&](const int* group, int gn, int n) {
    int k = 0;
    for (int j = 0; j < gn; j++) if (setCount(c, ctx, group[j]) >= n) k++;
    return k;
  };
  double windYaku = handYaku(ctx, restrictMask(c, M_WIND));
  double dragonYaku = handYaku(ctx, restrictMask(c, M_DRAGON));
  int dragons = tilesOfF(c, ctx, M_DRAGON);
  if (dragons >= 5 && have(DRAGONS, 3, 2) >= 2) groupPlan(P_SMALL_DRAGONS, DRAGONS, 3, 2, true, base + 5 + windYaku, M_DRAGON);
  if (dragons >= 6 && have(DRAGONS, 3, 2) == 3) groupPlan(P_BIG_DRAGONS, DRAGONS, 3, 3, false, base + 8 + windYaku, M_DRAGON);
  int winds = tilesOfF(c, ctx, M_WIND);
  if (winds >= 8 && have(WINDS_, 4, 2) >= 3) groupPlan(P_SMALL_WINDS, WINDS_, 4, 3, true, base + 6 + dragonYaku, M_WIND);
  if (winds >= 9 && have(WINDS_, 4, 2) == 4) groupPlan(P_BIG_WINDS, WINDS_, 4, 4, false, LIMIT, M_WIND);
  return plans;
}

std::vector<PlanP> Foundation::pairsUpgrades(const Counts& c, const Ctx& ctx, bool any) {
  std::vector<PlanP> out;
  if (ctx.declared) return out;
  auto pairs = [&](Mask fits) { int n = 0; for (int i = 0; i < 34; i++) if (inMask(fits, i) && c[i] >= 2) n++; return n; };
  auto add = [&](PlanKind kind, Mask fits, double faan) {
    if (!any && (countWhere(c, fits) < 8 || pairs(fits) < 3)) return;
    auto p = std::make_shared<Plan>();
    p->kind = kind; p->counts = restrictMask(c, fits); p->fn.kind = SH_SEVEN; p->fn.filled = true;
    p->faan = std::min(double(LIMIT), faan); p->open = false;
    p->hasKeep = true; p->keep = fits; p->hasFavors = true; p->favors = fits; p->upgrade = true; p->pairs = true;
    out.push_back(p);
  };
  add(P_PAIRS_ORPHANS, M_ORPHAN, baseFaan(ctx) + 4 + 1);
  add(P_PAIRS_HONORS, M_HONOR, LIMIT);
  add(P_PAIRS_TERMINALS, M_TERMINAL, LIMIT);
  return out;
}

static const int HARD_FAAN = 10, HARD_REACH = 3;
static const double STEP_IN_FAAN = 1.25;

bool Foundation::isHardTarget(const Plan& p, int s, int best, const Counts& c, const Ctx& ctx) {
  // Jorge Yau always has a target (ctx.target), so no plan is hard for it.
  if (!p.hasKeep || p.faan < HARD_FAAN || ctx.target.id >= 0 || ctx.hasLockedSpecial) return false;
  if (isInf(s) || s > best + HARD_REACH || ctx.drawsLeft < 2 * s) return false;
  if (best <= 0 && s > 1) return false;
  int sets = 0, pairs = 0;
  for (int i = 0; i < 34; i++) {
    if (!inMask(p.keep, i)) continue;
    int n = c[i] + ctx.unseen[i];
    if (n >= 3) sets++;
    if (n >= 2) pairs++;
  }
  if (p.pairs) return pairs >= 7;
  return sets >= 4 - ctx.declared && pairs >= 5 - ctx.declared;
}

PlanP Foundation::liveUpgrade(const Counts& c, const Ctx& ctx) {
  auto list = upgradePlans(c, ctx);
  if (chaseSevenPairs(c, ctx)) { auto pu = pairsUpgrades(c, ctx, false); list.insert(list.end(), pu.begin(), pu.end()); }
  if (list.empty()) return nullptr;
  int best = std::min(standardShanten(c.data(), ctx.declared), std::min(tripletsShanten(c.data(), ctx.declared),
                      ctx.declared ? INF : sevenPairsShanten(c.data(), 0)));
  PlanP pick;
  double pickValue = -DINF;
  for (auto& p : list) {
    int s = shantenOf(p->fn, p->counts, ctx.declared);
    p->hard = isHardTarget(*p, s, best, c, ctx);
    if (s > best + (p->hard ? HARD_REACH : 1)) continue;
    double value = p->faan - STEP_IN_FAAN * s;
    if (value > pickValue) { pick = p; pickValue = value; }
  }
  return pick;
}

const Plan* Foundation::discardTarget(const Ctx& ctx) {
  const Plan* up = ctx.upgrade.get();
  const Plan* lead = ctx.leadPlan.get();
  if (up && up->hard) return up;
  return lead && lead->upgrade && lead->hasKeep && !ctx.leadReady ? lead : nullptr;
}

bool Foundation::isDeadFor(const Plan& plan, const Counts& counts, const Ctx& ctx, int i) {
  return plan.pairs ? counts[i] == 1 && ctx.unseen[i] == 0 : deadForSets(counts, ctx, i, plan.favors);
}

double Foundation::upgradeOrder(const Ctx& ctx, const Counts& counts, int i, double group) {
  const Plan* target = discardTarget(ctx);
  if (target) {
    if (!inMask(target->keep, i)) return std::min(group, -1.0);
    if (isDeadFor(*target, counts, ctx, i)) return -2;
    return std::max(group, 1.0) + 0.5;
  }
  const Plan* up = ctx.upgrade.get();
  if (!up || group <= 0 || group >= 10 || !inMask(up->favors, i)) return group;
  const Plan* lead = ctx.leadPlan.get();
  if (lead && (lead->kind == P_STRAIGHTS || lead->kind == P_RUNS)) return group;
  if (lead && isFlushKind(lead->kind) && !isHonorI(i)) return group;
  if (isDeadFor(*up, counts, ctx, i)) return std::min(group, 1.0);
  return group + 0.5;
}

struct Ukeire { int total; std::vector<int> tiles; };
static Ukeire ukeireOf(Foundation* f, Counts counts, const ShFn& fn, int declared, const Counts& unseen, int current,
                       int (Foundation::*sh)(const ShFn&, const Counts&, int)) {
  Ukeire u{0, {}};
  if (fn.kind == SH_STD && !fn.filled && declared >= 0 && declared <= 4) {
    standardUkeire(counts.data(), declared, unseen.data(), current, u.total, u.tiles);
    return u;
  }
  for (int i = 0; i < 34; i++) {
    if (!unseen[i] || counts[i] >= 4) continue;
    counts[i]++;
    if ((f->*sh)(fn, counts, declared) < current) { u.total += unseen[i]; u.tiles.push_back(i); }
    counts[i]--;
  }
  return u;
}

/* ---------------- 2b. Tracking the table ---------------- */

static const double WANT_MIN = 0.05, WANT_MAX = 4, THROWN_SINCE_MELD = 0.2, THROWN = 0.4, THROWN_BEFORE_PIVOT = 0.65;
static const double PASSED_HONOR = 0.45, PASSED_NUMBER = 0.8;
static const double NEAR[4] = {0, 0.85, 0.9, 0.75};
static const double FEED_COST = 0.012, FEED_CHOW = 0.6, FEED_PUNG = 0.25;

static void shares(const std::vector<Discard>& list, int from, int to, double by[3]) {
  int cnt[3] = {0, 0, 0}, total = 0;
  for (int k = from; k < to; k++) { int su = suitIdx(list[k].tile); if (su < 3) { cnt[su]++; total++; } }
  for (int su = 0; su < 3; su++) by[su] = total ? double(cnt[su]) / total : 1.0 / 3;
}

static Pivot readPivot(const std::vector<Discard>& list) {
  Pivot pv;
  int n = int(list.size());
  if (n < 8) return pv;
  int half = n / 2;
  double early[3], late[3];
  shares(list, 0, half, early);
  shares(list, half, n, late);
  for (int su = 0; su < 3; su++) if (early[su] <= 0.15 && late[su] >= 0.4) { pv.any = true; pv.from = su; pv.to = -1; pv.at = half; }
  for (int su = 0; su < 3; su++)
    if (early[su] >= 0.4 && late[su] <= 0.1) {
      if (pv.any) pv.to = su; else { pv.any = true; pv.from = -1; pv.to = su; pv.at = half; }
    }
  return pv;
}

static int readCollecting(const Seat& s, const double recent[3]) {
  std::vector<int> suits;
  for (auto* m : shownMelds(s)) { int su = meldSuit(*m); if (su != 3 && std::find(suits.begin(), suits.end(), su) == suits.end()) suits.push_back(su); }
  if (!suits.empty()) return suits.size() == 1 ? suits[0] : -1;
  if (s.discards.size() < 6) return -1;
  int low = -1, nLow = 0;
  for (int su = 0; su < 3; su++) if (recent[su] <= 0.1) { low = su; nLow++; }
  return nLow == 1 ? low : -1;
}

static double readPace(const std::vector<Discard>& list) {
  if (list.size() < 6) return 1;
  int middle = 0;
  for (size_t k = list.size() - 4; k < list.size(); k++) { int i = list[k].tile; if (i < 27 && i % 9 >= 2 && i % 9 <= 6) middle++; }
  return 0.85 + 0.12 * middle;
}

SeatRead Foundation::readSeat(const Game& g, int o, const Counts& unseen) {
  const Seat& s = g.hand.seats[o];
  const auto& list = s.discards;
  int n = int(list.size());
  SeatRead r;
  r.seat = o;
  Pivot pivot = readPivot(list);
  double recent[3];
  shares(list, pivot.any ? pivot.at : 0, n, recent);
  int collecting = readCollecting(s, recent);
  int lastMeld = 0;
  for (auto& m : s.melds) lastMeld = std::max(lastMeld, m.at);
  int windIndex = 26 + seatWind(g, o);
  double* want = r.want;
  for (int i = 0; i < 34; i++) {
    double w = 1;
    if (i < 27) {
      double share = recent[i / 9];
      if (n >= 4) w *= share < 0.12 ? 1.7 : share < 0.25 ? 1.25 : share > 0.5 ? 0.6 : share > 0.38 ? 0.8 : 1;
      int rr = i % 9;
      w *= rr >= 2 && rr <= 6 ? 1.1 : rr == 0 || rr == 8 ? 0.85 : 1;
      if (collecting >= 0) w *= i / 9 == collecting ? 2 : 0.5;
    } else {
      if (isDragon(i) || i == windIndex || i == 26 + g.round) w *= 1.25;
      if (unseen[i] < 2) w *= 0.4;
      if (collecting >= 0) w *= 1.2;
    }
    want[i] = w;
  }
  // A tile thrown counts once, by its most telling copy (keys in ascending order).
  double seen[34];
  bool has[34] = {false};
  for (int idx = 0; idx < n; idx++) {
    int i = list[idx].tile;
    double f = idx >= lastMeld && !s.melds.empty() ? THROWN_SINCE_MELD : pivot.any && idx < pivot.at ? THROWN_BEFORE_PIVOT : THROWN;
    seen[i] = std::min(has[i] ? seen[i] : 1.0, f);
    has[i] = true;
  }
  for (int i = 0; i < 34; i++) {
    if (!has[i]) continue;
    want[i] *= seen[i];
    if (i >= 27) continue;
    static const int DS[6] = {-3, -2, -1, 1, 2, 3};
    for (int d : DS) {
      int j = i + d;
      if (j >= 0 && j < 27 && j / 9 == i / 9) want[j] *= NEAR[std::abs(d)];
    }
  }
  bool passed[34] = {false};
  for (int k = 0; k < 4; k++) {
    if (k == o) continue;
    for (auto& d : g.hand.seats[k].discards) if (!d.claimed) passed[d.tile] = true;
  }
  for (int i = 0; i < 34; i++) if (passed[i]) want[i] *= i >= 27 ? PASSED_HONOR : PASSED_NUMBER;
  for (int t = 0; t < 34; t++) want[t] = unseen[t] ? std::max(WANT_MIN, std::min(WANT_MAX, want[t])) : WANT_MIN;
  double weight[34], total = 0;
  for (int i = 0; i < 34; i++) weight[i] = unseen[i] / want[i];
  for (int i = 0; i < 34; i++) total = total + weight[i];
  if (!total) total = 1;
  for (int i = 0; i < 34; i++) r.out[i] = weight[i] / total;
  r.hidden = std::max(1, 13 - 3 * int(s.melds.size()));
  r.collecting = collecting;
  r.pivot = pivot;
  r.pace = readPace(list);
  return r;
}

std::shared_ptr<Track> Foundation::readTable(const Game& g, int seat, const Counts& unseen) {
  for (auto& m : trackMemo_) if (m.version == g.hand.version && m.seat == seat && m.track) return m.track;
  auto t = readTableUncached(g, seat, unseen);
  TrackMemo& m = trackMemo_[trackNext_];
  trackNext_ ^= 1;
  m.version = g.hand.version; m.seat = seat; m.track = t;
  return t;
}

std::shared_ptr<Track> Foundation::readTableUncached(const Game& g, int seat, const Counts& unseen) {
  auto t = std::make_shared<Track>();
  for (int o = 0; o < 4; o++) if (o != seat) t->seats.push_back(readSeat(g, o, unseen));
  double wall = std::max(1, g.hand.wall.size());
  for (int i = 0; i < 34; i++) {
    double held = 0;
    for (auto& r : t->seats) held = held + r.hidden * r.want[i];
    t->inWall[i] = wall / (wall + held);
  }
  t->wall = wall;
  t->left = (seat + 3) % 4;
  t->next = (seat + 1) % 4;
  return t;
}

double Foundation::liveOuts(const Ctx& ctx, uint64_t tiles) {
  const double* inWall = ctx.track->inWall;
  double sum = 0;
  for (int i = 0; i < 34; i++) sum = sum + inWall[i];
  double mean = sum / 34;
  double m = 0;
  for (uint64_t t = tiles; t; t &= t - 1) { int i = __builtin_ctzll(t); m = m + ctx.unseen[i] * inWall[i] / mean; }
  return m;
}

double Foundation::finishChance(const Ctx& ctx, int s, uint64_t tiles, const Plan& plan) {
  // T.race is off: the shared estimate.
  double outs = liveOuts(ctx, tiles);
  double expected = ctx.unseenTotal / (std::max(outs, 0.5) * (plan.open ? 1.33 : 1));
  return ctx.drawsLeft / (ctx.drawsLeft + expected) * js::pow(STEP, s) * COMPETITION;
}

double Foundation::feedLoss(const Game& g, const std::vector<Threat>& list, int i) {
  int wall = g.hand.wall.size();
  double phase = wall > 60 ? 0.3 : wall > 32 ? 0.6 : wall > 16 ? 1 : 1.5;
  double sum = 0;
  for (auto& t : list) {
    double eager = std::max(0.0, t.want[i] - 1);
    double claim = (t.isNext && i < 27 ? FEED_CHOW : 0) + (t.unseen[i] >= 2 ? FEED_PUNG : 0);
    sum = sum + FEED_COST * phase * eager * claim * (1 + 2 * t.ready);
  }
  return sum;
}

/* ---------------- 4. Exact value of a ready hand ---------------- */

int Foundation::scoreIfWin(const Ctx& ctx, const std::vector<int8_t>& ids, bool selfDraw) {
  ScoreInput in;
  in.concealed = ids;
  for (auto& m : ctx.melds) in.melds.push_back({m.type == CHOW ? 'c' : m.type == PUNG ? 'p' : 'k', meldFirst(m), m.concealed});
  in.flowers = ctx.flowers;
  in.seat = ctx.seatWind;
  in.round = ctx.round;
  in.selfDraw = selfDraw;
  in.lastTile = ctx.wallLeft <= 1;
  in.minFaan = 3;
  Score r = scoreHand(in);
  return r.valid ? r.faan : -1;
}

bool Foundation::readyValue(const Counts& cIn, const Ctx& ctx, ReadyInfo& out) {
  Counts c = cIn;
  auto waits = winningTiles(c.data(), ctx.declared);
  if (waits.empty()) return false;
  std::vector<int8_t> ids;
  for (int i = 0; i < 34; i++) for (int n = 0; n < c[i]; n++) ids.push_back(int8_t(i));
  double tsumo = 0, ron = 0, evSum = 0;
  int min = ctx.game->minFaan;
  out = ReadyInfo();
  for (int w : waits) {
    int r = ctx.unseen[w];
    std::vector<int8_t> withTile = ids;
    withTile.push_back(int8_t(w));
    int fr = scoreIfWin(ctx, withTile, false);
    int ft = scoreIfWin(ctx, withTile, true);
    double pr = fr >= min ? handValue(fr, ctx.slope) : 0;
    double pt = ft >= min ? handValue(ft, ctx.slope) : 0;
    out.waits.push_back({w, r, fr, ft, fr >= min, ft >= min});
    if (!r) continue;
    if (pt) { tsumo += r; evSum += r * pt * SELF_DRAW_PAYS; }
    if (pr) { ron += r * 1.5; evSum += r * 1.5 * pr; }
  }
  double q = (tsumo + ron) / ctx.unseenTotal;
  double value = 0;
  if (q > 0) {
    double avg = evSum / (tsumo + ron);
    double t = ctx.drawsLeft;
    value = avg * (t / (t + 1 / q)) * COMPETITION;
  }
  if (tsumo <= 1) value *= 0.5;
  // readyOdds: T.race is off, the value stands.
  value = jyReadyValue(value, out.waits, c, ctx);
  int best = 0;
  for (auto& d : out.waits) if (d.left && d.ronOk) best = std::max(best, d.ronFaan);
  out.value = value;
  out.live = tsumo + ron / 1.5;
  out.bestFaan = best;
  return true;
}

/* ---------------- 5. Hand utility ---------------- */

static bool winsWhenReady(bool has, const ReadyInfo& r) {
  if (!has) return false;
  for (auto& w : r.waits) if (w.left && (w.ronOk || w.tsumoOk)) return true;
  return false;
}

static int stepsToWin(int shape, bool hasBest, const Entry& best, bool hasReady, const ReadyInfo& ready) {
  if (shape > 0 || winsWhenReady(hasReady, ready)) return shape;
  return hasBest && best.plan && !best.readyBest ? std::max(1, best.planShanten) : 1;
}

static const int COMMIT_TURN = 3, HOPELESS_STEPS = 2;
static const double PIVOT_MARGIN = 1.1, HOPELESS_RATIO = 3, BACKUP_SHARE = 0.12;

void Foundation::updateCommit(const Game& g, int seat, const Candidate* pick, bool folding) {
  SeatMemo& memo = seatMemo(g, seat, T.id);
  int turn = int(g.hand.seats[seat].discards.size());
  if (memo.turn != turn) { memo.base = memo.now; memo.turn = turn; }
  if (folding || !pick) return;
  const Analysis* an = pick->analysis.get();
  const Plan* plan = an && an->hasBest ? an->best.plan.get() : nullptr;
  if (!plan || turn < COMMIT_TURN) return;
  Family family = familyOf(*plan);
  memo.now = family;
  if (memo.base != F_NONE && memo.base != family) memo.left[memo.base] = turn;
}

bool Foundation::pivotWhy(const Entry& alt, const Entry& cur, const Ctx& ctx) {
  if (cur.ukeire == 0 || cur.planShanten + 1 > ctx.drawsLeft * 1.5) return true;
  if (alt.planShanten + HOPELESS_STEPS <= cur.planShanten && alt.hasChance && cur.hasChance && alt.chance >= cur.chance * HOPELESS_RATIO) return true;
  bool back = ctx.commitLeft.count(familyOf(*alt.plan)) > 0;
  if (alt.pick == DINF && !back) return true;
  bool more = alt.plan->faan >= cur.plan->faan + (back ? 2 : 1);
  bool near = alt.planShanten <= cur.planShanten + (back ? 0 : 1);
  return more && near && alt.pick > cur.pick * PIVOT_MARGIN;
}

int Foundation::chooseEntry(std::vector<Entry>& entries, const Ctx& ctx) {
  Family key = ctx.commitKey;
  int cur = -1;
  std::vector<bool> own(entries.size(), false);
  if (key != F_NONE)
    for (size_t k = 0; k < entries.size(); k++)
      if (familyOf(*entries[k].plan) == key) { own[k] = true; if (cur < 0 || entries[k].pick > entries[cur].pick) cur = int(k); }
  int best = cur;
  if (cur >= 0) {
    for (size_t k = 0; k < entries.size(); k++) {
      if (own[k]) continue;
      if (pivotWhy(entries[k], entries[cur], ctx) && entries[k].pick > entries[best].pick) best = int(k);
    }
    return best;
  }
  for (size_t k = 0; k < entries.size(); k++) if (best < 0 || entries[k].pick > entries[best].pick) best = int(k);
  return best;
}

double Foundation::backupValue(const std::vector<Entry>& entries, int best) {
  std::vector<double> others;
  for (size_t k = 0; k < entries.size(); k++) if (int(k) != best && entries[k].pick != DINF) others.push_back(entries[k].util);
  js::sort(others, [](double a, double b) { return b - a; });
  return (others.size() > 0 ? others[0] : 0) + (others.size() > 1 ? others[1] : 0);
}

// A plan's shanten and useful tiles depend only on its counts, its shanten
// rule, the melds declared and the tiles unseen (the hand's version and the
// seat). Candidate discards share most of them (a flush plan keeps the same
// tiles whichever off-suit tile goes), so they're kept, keyed by all of that.
struct PlanMemo {
  uint64_t a = ~0ull, b = 0, f = 0, version = 0;
  int8_t seat = -1, s = 0;
  bool hasU = false;
  int total = 0;
  uint64_t tiles = 0;
};
static const int PLAN_MEMO_BITS = 15;
static std::vector<PlanMemo> planMemo(size_t(1) << PLAN_MEMO_BITS);

static inline void planKey(const Plan& p, int declared, uint64_t& a, uint64_t& b, uint64_t& f) {
  a = 0; b = 0;
  for (int i = 0; i < 17; i++) a = (a << 3) | uint64_t(p.counts[i] & 7);
  for (int i = 17; i < 34; i++) b = (b << 3) | uint64_t(p.counts[i] & 7);
  const ShFn& fn = p.fn;
  uint64_t done = 0;
  for (int i : fn.doneIdx) done |= uint64_t(1) << i;
  f = uint64_t(fn.kind) | (uint64_t(fn.filled) << 3) | (uint64_t(fn.start & 31) << 4) | (uint64_t(declared & 7) << 9) |
      (uint64_t(fn.pungs & 7) << 12) | (uint64_t(fn.pair) << 15) | (uint64_t(fn.group.empty() ? 0 : fn.group[0] & 63) << 16) | (done << 22);
}

Analysis Foundation::handUtility(Counts c, Ctx& ctx) {
  version_ = ctx.game->hand.version;
  auto plans = plansFor(c, ctx);
  std::vector<Entry> entries;
  int shantenAll = shanten(c.data(), ctx.declared);
  for (auto& p : plans) {
    uint64_t ka, kb, kf;
    planKey(*p, ctx.declared, ka, kb, kf);
    uint64_t h = (ka * 0x9E3779B97F4A7C15ull) ^ (kb * 0xC2B2AE3D27D4EB4Full) ^ (kf * 0x165667B19E3779F9ull) ^ (version_ * 0x27D4EB2F165667C5ull) ^ uint64_t(ctx.seat);
    h ^= h >> 29;
    PlanMemo& pm = planMemo[(h * 0xBF58476D1CE4E5B9ull) >> (64 - PLAN_MEMO_BITS)];
    bool hit = pm.a == ka && pm.b == kb && pm.f == kf && pm.version == version_ && pm.seat == ctx.seat;
    if (!hit) {
      pm.a = ka; pm.b = kb; pm.f = kf; pm.version = version_; pm.seat = int8_t(ctx.seat);
      int sv = shantenOf(p->fn, p->counts, ctx.declared);
      pm.s = int8_t(std::min(sv, 127));
      pm.hasU = false;
    }
    int s = pm.s >= 127 ? INF : pm.s;
    if (isInf(s)) continue;
    if (p->upgrade && ctx.drawsLeft < 2 * s) continue;
    if (!pm.hasU) {
      Ukeire u0 = ukeireOf(this, p->counts, p->fn, ctx.declared, ctx.unseen, s, &Foundation::shantenOf);
      pm.total = u0.total;
      pm.tiles = 0;
      for (int t : u0.tiles) pm.tiles |= uint64_t(1) << t;
      pm.hasU = true;
    }
    double chance = finishChance(ctx, s, pm.tiles, *p);
    double util = handValue(p->faan + SELF_DRAW_CHANCE, ctx.slope) * 1.8 * chance;
    Entry e;
    e.plan = p; e.shanten = s; e.planShanten = s; e.ukeire = pm.total; e.nUkeireTiles = __builtin_popcountll(pm.tiles);
    e.util = util; e.chance = chance; e.hasChance = true;
    e.pick = util * (p->weight ? p->weight : 1) * suitLean(p.get(), ctx);
    entries.push_back(e);
  }
  int bi = chooseEntry(entries, ctx);
  Analysis a;
  a.backup = backupValue(entries, bi);
  if (bi >= 0) { a.hasBest = true; a.best = entries[bi]; }
  if (shantenAll == 0) {
    a.hasReady = readyValue(c, ctx, a.ready);
    if (winsWhenReady(a.hasReady, a.ready) && (!a.hasBest || a.ready.value >= a.best.util)) {
      Entry e;
      e.plan = a.hasBest ? a.best.plan : nullptr;
      e.shanten = 0;
      e.planShanten = a.hasBest ? a.best.planShanten : 0;
      e.ukeire = a.ready.live;
      e.util = a.ready.value;
      e.readyBest = true;
      a.best = e;
      a.hasBest = true;
    }
  }
  a.util = a.hasBest ? a.best.util : 0;
  a.shanten = stepsToWin(shantenAll, a.hasBest, a.best, a.hasReady, a.ready);
  a.shapeShanten = shantenAll;
  a.plainShanten = standardShanten(c.data(), ctx.declared);
  return a;
}

/* ---------------- 6. Defense ---------------- */

static int threatLevel(double p) { return p >= 0.55 ? 3 : p >= 0.3 ? 2 : p >= 0.12 ? 1 : 0; }

std::vector<Threat> Foundation::opponentThreats(const Game& g, int seat) {
  for (auto& m : threatMemo_) if (m.version == g.hand.version && m.seat == seat && m.version) return m.threats;
  auto t = opponentThreatsUncached(g, seat);
  ThreatMemo& m = threatMemo_[threatNext_];
  threatNext_ ^= 1;
  m.version = g.hand.version; m.seat = seat; m.threats = t;
  return t;
}

std::vector<Threat> Foundation::opponentThreatsUncached(const Game& g, int seat) {
  std::vector<Threat> out;
  Counts unseenMe = unseenCounts(g, seat);
  static const double BY_MELDS[5] = {0.02, 0.1, 0.32, 0.6, 0.92};
  for (int o = 0; o < 4; o++) {
    if (o == seat) continue;
    const Seat& s = g.hand.seats[o];
    int k = int(s.melds.size());
    int n = int(s.discards.size());
    double p = BY_MELDS[std::min(k, 4)] + std::min(0.25, n * 0.008);
    double shown = p;
    if (n >= 10) p = std::max(p, 0.2 + (n - 10) * 0.05);
    int flush = -1;
    bool suitsInMelds[4] = {false, false, false, false};
    std::vector<int> numSuits;  // insertion order
    for (auto* m : shownMelds(s)) {
      int su = meldSuit(*m);
      if (!suitsInMelds[su]) { suitsInMelds[su] = true; if (su != 3) numSuits.push_back(su); }
    }
    if (k >= 1 && numSuits.size() == 1) flush = numSuits[0];
    if (flush < 0 && n >= 6) {
      int bySuit[3] = {0, 0, 0};
      for (auto& d : s.discards) { int su = suitIdx(d.tile); if (su < 3) bySuit[su]++; }
      for (int su = 0; su < 3; su++) {
        bool every = true;
        for (int x : numSuits) if (x != su) every = false;
        if (flush < 0 && bySuit[su] == 0 && every) flush = su;
      }
    }
    if (k == 0 && suitsInMelds[3]) flush = -1;
    if (flush >= 0 && k >= 2) { p += 0.15; shown += 0.15; }
    p = std::min(0.93, p);
    int f = 3;
    if (flush >= 0) f += suitsInMelds[3] ? 3 : 4;
    int wind = seatWind(g, o);
    for (auto* m : shownMelds(s)) {
      if (m->type == CHOW) continue;
      int i = meldFirst(*m);
      if (isDragon(i)) f += 1;
      if (i == 26 + wind) f += 1;
      if (i == 26 + g.round) f += 1;
    }
    int lastMeld = 0;
    for (auto& m : s.melds) lastMeld = std::max(lastMeld, m.at);
    Threat t;
    t.seat = o;
    std::fill(t.discarded, t.discarded + 34, false);
    std::fill(t.since, t.since + 34, false);
    for (auto& row : t.suji) std::fill(row, row + 9, false);
    for (int idx = 0; idx < n; idx++) {
      int ti = s.discards[idx].tile;
      t.discarded[ti] = true;
      if (idx >= lastMeld) t.since[ti] = true;
      if (ti < 27) t.suji[ti / 9][ti % 9] = true;
    }
    int level = std::max(std::min(threatLevel(p), std::max(2, threatLevel(shown))), k >= 3 ? 3 : flush >= 0 && k >= 2 ? 2 : 0);
    t.ready = p;
    t.level = level;
    t.melds = k;
    t.flush = flush;
    t.faan = std::max(3, f);
    t.payment = handValue(std::max(3, f), 0) * (o == g.dealer && level >= 2 ? 1.1 : 1);
    for (int& v : t.chows) v = 0;
    for (auto& m : s.melds) if (m.type == CHOW) t.chows[meldSuit(m)]++;
    t.windIndex = 26 + wind;
    t.unseen = unseenMe;
    out.push_back(t);
  }
  for (auto& t : out) {
    SeatRead read = readSeat(g, t.seat, unseenMe);
    std::copy(read.want, read.want + 34, t.want);
    t.pivot = read.pivot;
    t.collecting = read.collecting;
    t.isNext = t.seat == (seat + 1) % 4;
    if (t.isNext) {
      AfterRead after = afterRead(g, seat);
      t.afterKeeps = after.keeps;
      t.afterLocked = after.locked;
      t.afterMelds = after.melds;
      if (after.keeps >= 0) {
        double boost = 1 + 0.35 * after.melds + (after.locked ? 0.25 : 0);
        if (t.collecting != after.keeps) boost += 0.45;
        for (int w = 0; w < 27; w++) if (w / 9 == after.keeps) t.want[w] = std::min(WANT_MAX, t.want[w] * boost);
      }
    }
    t.ready = std::min(0.93, t.ready * read.pace);
  }
  jyThreats(out, g);
  return out;
}

double Foundation::waitChance(const Game& g, const Threat& threat, int i) {
  const Counts& unseen = threat.unseen;
  double chance;
  if (i >= 27) {
    static const double BY[5] = {0, 0.004, 0.035, 0.05, 0.05};
    chance = unseen[i] >= 0 && unseen[i] <= 4 ? BY[unseen[i]] : 0;
    if (unseen[i] >= 2 && (isDragon(i) || i == threat.windIndex || i == 26 + g.round)) chance *= 1.3;
  } else {
    int r = i % 9;
    double seq = 0;
    auto avail = [&](int d) -> double {
      int j = r + d;
      if (j < 0 || j > 8) return 0;
      return unseen[i + d] / 4.0;
    };
    double twoSided = 0;
    if (r <= 5) twoSided += std::min(avail(1), avail(2));
    if (r >= 3) twoSided += std::min(avail(-1), avail(-2));
    int su = i / 9;
    bool lowSafe = r < 3 || threat.suji[su][r - 3];
    bool highSafe = r > 5 || threat.suji[su][r + 3];
    if (r >= 3 && r <= 5) twoSided *= (lowSafe && highSafe) ? 0.35 : (lowSafe || highSafe) ? 0.7 : 1;
    else twoSided *= (r < 3 ? highSafe : lowSafe) ? 0.4 : 1;
    seq += twoSided;
    if (r == 2) seq += std::min(avail(-1), avail(-2)) * 0.6;
    if (r == 6) seq += std::min(avail(1), avail(2)) * 0.6;
    if (r >= 1 && r <= 7) seq += std::min(avail(-1), avail(1)) * 0.6;
    chance = seq * 0.025 + (unseen[i] / 3.0) * 0.018;
    if (r >= 2 && r <= 6) chance *= 1.1;
  }
  if (i < 27 && g.hand.wall.size() < LATE_WALL) {
    int suLate = i / 9;
    int named = threat.chows[suLate];
    if (threat.isNext && threat.afterKeeps == suLate)
      named = std::max(named, std::max(threat.afterMelds, threat.afterLocked ? 1 : 0));
    if (named) chance *= 1 + T.chowSuitLate * named + (threat.isNext && threat.afterLocked ? 0.35 : 0);
  }
  if (threat.since[i]) chance *= 0.15;
  else if (threat.discarded[i]) chance *= 0.5;
  if (threat.flush >= 0) {
    int fs = suitIdx(i);
    if (fs == threat.flush) chance *= 2.5;
    else if (fs == 3) chance *= 1.3;
    else chance *= 0.15;
  }
  chance *= js::pow(threat.want[i], 0.6);
  chance = jyWaitChance(chance, threat, i);
  return std::min(chance, 0.6);
}

bool Foundation::deadTile(const Game& g, int i) { return i >= 27 && isPungTile(g, i); }

double Foundation::dealInLoss(const Game& g, const std::vector<Threat>& threats, int i) {
  if (deadTile(g, i)) return 0;
  double loss = 0;
  for (auto& t : threats) loss += t.ready * waitChance(g, t, i) * t.payment;
  loss += feedLoss(g, threats, i);
  loss += jyExtraLoss(g, threats, i);
  return loss;
}

double Foundation::defenseWeight(const Ctx& ctx, const std::vector<Threat>& threats, int shanten, int readyFaan) {
  double w = ctx.isDealer ? 0.9 : 1;
  int top = 0;
  for (auto& t : threats) top = std::max(top, t.level);
  if (top >= 2 && shanten >= 2) w *= top == 3 ? 1.7 : 1.3;
  if (ctx.wallLeft < 16 && !(shanten == 0 && readyFaan >= 5)) w *= 1.7;
  if (T.lateFold != 1 && shanten >= 2 && ctx.wallLeft < T.lateFoldWall) w *= T.lateFold;
  return jyDefense(w, ctx, shanten);
}

static int riskStep(double loss) { return loss < 0.002 ? 0 : loss < 0.012 ? 1 : loss < 0.035 ? 2 : 3; }

/* ---------------- discard order helpers ---------------- */

std::vector<CandP> Foundation::tripletsOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts) {
  if (out.empty()) return out;
  const Analysis* lead = out[0]->analysis.get();
  const Plan* plan = lead->hasBest ? lead->best.plan.get() : nullptr;
  if (!plan || !isSetsPlan(plan->kind) || lead->best.readyBest) return out;
  for (auto& x : out) if (x->shanten == 0) return out;
  auto forced = [](const Candidate& x) { return x.priority <= 0 ? x.priority : 1.0; };
  auto favored = [](const Candidate& x) { return std::fmod(x.priority, 1.0) != 0 ? 1 : 0; };
  struct KX { CandP x; int k; };
  std::vector<KX> v;
  for (size_t k = 0; k < out.size(); k++) v.push_back({out[k], int(k)});
  js::sort(v, [&](const KX& a, const KX& b) -> double {
    if (forced(*a.x) != forced(*b.x)) return forced(*a.x) - forced(*b.x);
    if (favored(*a.x) != favored(*b.x)) return favored(*a.x) - favored(*b.x);
    int na = std::min(int(counts[a.x->index]), 3), nb = std::min(int(counts[b.x->index]), 3);
    if (na != nb) return na - nb;
    int ua = ctx.unseen[a.x->index], ub = ctx.unseen[b.x->index];
    if (ua != ub) return ua - ub;
    return a.k - b.k;
  });
  std::vector<CandP> r;
  for (auto& kx : v) r.push_back(kx.x);
  return r;
}

static bool leastSuits(const Counts& counts, bool least[3]) {
  int n[3] = {0, 0, 0};
  for (int i = 0; i < 27; i++) if (counts[i]) n[i / 9] += counts[i];
  int min = INT_MAX;
  for (int su = 0; su < 3; su++) if (n[su] && n[su] < min) min = n[su];
  for (int su = 0; su < 3; su++) least[su] = n[su] == min;
  return true;
}
static void longestSuits(const Counts& counts, bool longest[3]) {
  int n[3] = {0, 0, 0};
  for (int i = 0; i < 27; i++) if (counts[i]) n[i / 9] += counts[i];
  int max = 0;
  for (int su = 0; su < 3; su++) if (n[su] > max) max = n[su];
  for (int su = 0; su < 3; su++) longest[su] = n[su] && n[su] == max;
}
static int linkRank(const Counts& counts, int i) {
  int r = i % 9, nearN = 0, gap = 9;
  static const int DS[4] = {-2, -1, 1, 2};
  for (int d : DS) {
    if (r + d < 0 || r + d > 8 || !counts[i + d]) continue;
    nearN += counts[i + d];
    if (std::abs(d) < gap) gap = std::abs(d);
  }
  return nearN * 16 - gap;
}
static bool looseTerminal(const Counts& counts, int i) {
  if (i >= 27 || counts[i] != 1) return false;
  int r = i % 9;
  if (r != 0 && r != 8) return false;
  int base = i - r;
  if (r == 0 && counts[base + 1] && counts[base + 2]) return false;
  if (r == 8 && counts[base + 6] && counts[base + 7]) return false;
  return true;
}
static int majorTiles(const Counts& counts) {
  int n = 0;
  for (int i = 0; i < 34; i++) if (counts[i] && isOrphanI(i)) n += counts[i];
  return n;
}
static bool keepsLooseTerminal(const Counts& counts, int i, const Plan* plan) {
  if (!looseTerminal(counts, i) || majorTiles(counts) - 1 < 7) return false;
  if (plan) {
    PlanKind id = plan->kind;
    if (id == P_ALL_HONORS || id == P_PAIRS_HONORS) return false;
    if (id == P_ORPHANS || id == P_MIXED_ORPHANS || id == P_ALL_TERMINALS || id == P_PAIRS_ORPHANS || id == P_PAIRS_TERMINALS) return true;
  }
  int terminals = 0, honors = 0;
  for (int j = 0; j < 34; j++) {
    if (!counts[j]) continue;
    if (j >= 27) honors += counts[j];
    else if (isOrphanI(j)) terminals += counts[j];
  }
  return terminals >= 8 || (terminals >= 1 && honors >= 1 && terminals + honors >= 8);
}
static int shortSuitRank(const Counts& counts, int i, const Plan* plan) {
  return linkRank(counts, i) - (!keepsLooseTerminal(counts, i, plan) && looseTerminal(counts, i) ? 1000 : 0);
}
bool breaksFinishedStraight(const Counts& counts, int i) {
  if (i >= 27 || counts[i] != 1) return false;
  int r = i % 9, base = i - r;
  int starts[3], ns = 0;
  if (r >= 2) starts[ns++] = r - 2;
  if (r >= 1 && r <= 7) starts[ns++] = r - 1;
  if (r <= 6) starts[ns++] = r;
  for (int w = 0; w < ns; w++) {
    int s = starts[w];
    if (counts[base + s] && counts[base + s + 1] && counts[base + s + 2]) return true;
  }
  return false;
}
static bool shortSuitDiscard(const Counts& counts, int i, const Plan* plan) {
  if (i >= 27 || counts[i] != 1 || keepsLooseTerminal(counts, i, plan)) return false;
  if (plan && plan->kind == P_STRAIGHTS && breaksFinishedStraight(counts, i)) return false;
  bool least[3];
  leastSuits(counts, least);
  if (!least[i / 9]) return false;
  int mine = shortSuitRank(counts, i, plan);
  for (int j = 0; j < 27; j++) {
    if (j == i || counts[j] != 1 || !least[j / 9] || keepsLooseTerminal(counts, j, plan)) continue;
    if (shortSuitRank(counts, j, plan) < mine) return false;
  }
  return true;
}
static int shortBeforeLongTerminal(const Counts& counts, const Candidate& a, const Candidate& b) {
  if ((a.shanten <= 0) != (b.shanten <= 0)) return 0;
  bool least[3], longest[3];
  leastSuits(counts, least);
  longestSuits(counts, longest);
  auto role = [&](const Candidate& x) {
    if (x.index >= 27) return 0;
    int su = x.index / 9;
    if (least[su] && !longest[su]) return 1;  // short
    if (longest[su] && !least[su] && isTerminalI(x.index)) return 2;  // long terminal
    return 0;
  };
  int ra = role(a), rb = role(b);
  if (ra == 1 && rb == 2) return -1;
  if (rb == 1 && ra == 2) return 1;
  return 0;
}

std::vector<CandP> Foundation::keepDragonPair(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts) {
  const Plan* lead = ctx.leadPlan.get();
  if (out.empty() || !(lead && isFlushKind(lead->kind))) return out;
  const Candidate& top = *out[0];
  if (top.shanten <= 0 || !isDragon(top.index) || counts[top.index] != 2) return out;
  int suit = lead->suit;
  bool least[3];
  leastSuits(counts, least);
  CandP best;
  int bestRank = 0;
  for (size_t k = 1; k < out.size(); k++) {
    const auto& x = out[k];
    if (x->index >= 27) continue;
    int su = x->index / 9;
    if (su == suit || !least[su]) continue;
    int rank = shortSuitRank(counts, x->index, lead);
    if (!best || rank < bestRank) { best = x; bestRank = rank; }
  }
  if (!best) return out;
  std::vector<CandP> r{best};
  for (auto& x : out) if (x != best) r.push_back(x);
  return r;
}

static int honorKeepRank(const Ctx& ctx, int i) {
  if (i < 27) return -1;
  if (isDragon(i)) return 2;
  int both = (i == 26 + ctx.seatWind ? 1 : 0) + (i == 26 + ctx.round ? 1 : 0);
  return both == 2 ? 3 : (i == 26 + ctx.seatWind || i == 26 + ctx.round) ? 1 : 0;
}

std::vector<CandP> Foundation::honorTieOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& c) {
  std::vector<std::pair<long, std::vector<int>>> groups;  // insertion order
  for (size_t k = 0; k < out.size(); k++) {
    const auto& x = out[k];
    if (x->index < 27) continue;
    long key = ((long(c[x->index]) * 16 + ctx.unseen[x->index]) * 64 + (x->shanten + 8)) * 2 + (x->analysis && x->analysis->hasReady ? 1 : 0);
    auto it = std::find_if(groups.begin(), groups.end(), [&](const std::pair<long, std::vector<int>>& gk) { return gk.first == key; });
    if (it == groups.end()) groups.push_back({key, {int(k)}});
    else it->second.push_back(int(k));
  }
  std::vector<CandP> next = out;
  for (auto& gk : groups) {
    auto& at = gk.second;
    if (at.size() < 2) continue;
    std::vector<int> tied = at;
    js::sort(tied, [&](int a, int b) -> double {
      int d = honorKeepRank(ctx, out[a]->index) - honorKeepRank(ctx, out[b]->index);
      return d ? d : a - b;
    });
    for (size_t j = 0; j < at.size(); j++) next[at[j]] = out[tied[j]];
  }
  return next;
}

static bool isReadyCand(const Candidate& x) {
  return x.shanten == 0 && x.analysis && x.analysis->hasReady && !x.analysis->ready.waits.empty();
}

/* ---------------- 7. Discard analysis ---------------- */

void Foundation::syncHandPlans(Ctx& ctx, const Counts& counts) {
  ctx.blockSevenPairs = concealedShape(counts).hasSet;
  ctx.avoidSuit = avoidSuitOf(counts, ctx);
  jyLockHand(ctx, counts);
  // gateSpecial: T.ownPlans, nothing to gate.
  ctx.upgrade = liveUpgrade(counts, ctx);
}

DiscardAnalysis Foundation::analyzeDiscards(const Game& g, int seat, const Ctx* ctxOverride, const std::vector<int8_t>* handOverride) {
  DiscardAnalysis res;
  Ctx& ctx = res.ctx;
  ctx = ctxOverride ? *ctxOverride : buildContext(g, seat);
  const std::vector<int8_t>& hand = handOverride ? *handOverride : g.hand.seats[seat].hand;
  Counts c = countsOf(hand);
  syncHandPlans(ctx, c);
  res.threats = opponentThreats(g, seat);
  const auto& threats = res.threats;
  std::vector<CandP> out;
  for (int i = 0; i < 34; i++) {
    if (!c[i]) continue;
    c[i]--;
    auto u = std::make_shared<Analysis>(handUtility(c, ctx));
    c[i]++;
    double loss = dealInLoss(g, threats, i);
    auto x = std::make_shared<Candidate>();
    x->index = i; x->util = u->util; x->loss = loss; x->shanten = u->shanten; x->analysis = u;
    out.push_back(x);
  }
  int bestShanten = INT_MAX;
  for (auto& x : out) bestShanten = std::min(bestShanten, x->shanten);
  auto planOf = [](const Candidate& x) -> const Plan* { return x.analysis->hasBest ? x.analysis->best.plan.get() : nullptr; };
  auto leaned = [&](const Candidate& x) { return x.util * suitLean(planOf(x), ctx); };
  CandP lead;
  for (auto& x : out) if (!lead || leaned(*x) > leaned(*lead)) lead = x;
  ctx.leadPlan = lead && lead->analysis->hasBest ? lead->analysis->best.plan : nullptr;
  ctx.leadReady = lead && lead->analysis->hasBest && lead->analysis->best.readyBest;
  int readyFaan = 0;
  for (auto& x : out) readyFaan = std::max(readyFaan, x->analysis->hasReady ? x->analysis->ready.bestFaan : 0);
  double weight = defenseWeight(ctx, threats, bestShanten, readyFaan);
  bool folding = weight > (ctx.isDealer ? 0.9 : 1);
  ctx.folding = folding;
  weight *= T.defenseScale;
  int committed = suitCommitment(ctx, c);
  double topUtil = 0;
  for (auto& x : out) topUtil = std::max(topUtil, x->util);
  for (auto& xp : out) {
    Candidate& x = *xp;
    x.score = x.util * suitLean(planOf(x), ctx) - weight * x.loss;
    if (!folding) x.score += BACKUP_SHARE * x.analysis->backup;
    if (committed >= 0 && x.index < 27 && x.index / 9 != committed) x.score += 0.004;
    if (!folding) x.score -= T.keepLive * topUtil * ctx.unseen[x.index];
    x.priority = upgradeOrder(ctx, c, x.index, discardPriority(g, ctx, c, x, bestShanten));
    const AfterRead& after = ctx.afterRead;
    const Plan* plan = planOf(x);
    if (after.keeps >= 0 && x.index < 27 && x.index / 9 == after.keeps && !(plan && plan->suit == after.keeps)) {
      double hold = 5 + after.melds + (after.locked ? 1 : 0);
      if (ctx.wallLeft < LATE_WALL) hold += 2;
      if (x.priority < hold) x.priority = hold;
      double pressure = 0.006 * (1 + after.melds) * (after.locked ? 1.5 : 1);
      if (ctx.wallLeft < LATE_WALL) pressure *= 2;
      x.score -= pressure;
    }
    const Entry* best = x.analysis->hasBest ? &x.analysis->best : nullptr;
    bool breaksSet = c[x.index] >= 3 && best && best->plan && !best->readyBest && isSetsPlan(best->plan->kind);
    x.tier = x.priority <= 0 || (x.shanten <= bestShanten && !breaksSet) ? x.priority : 10 + x.priority;
  }
  const Plan* leadPlan = ctx.leadPlan.get();
  js::sort(out, [&](const CandP& ap, const CandP& bp) -> double {
    const Candidate& a = *ap; const Candidate& b = *bp;
    bool offA = a.priority == 0, offB = b.priority == 0;
    if (offA != offB) return offA ? -1 : 1;
    if (!folding && leadPlan && leadPlan->kind == P_STRAIGHTS && a.shanten > 0 && b.shanten > 0) {
      bool sa = breaksFinishedStraight(c, a.index), sb = breaksFinishedStraight(c, b.index);
      if (sa != sb) return sa ? 1 : -1;
    }
    if (!folding && a.tier != b.tier) return a.tier - b.tier;
    if (!folding) {
      int so = shortBeforeLongTerminal(c, a, b);
      if (so) return so;
    }
    if (!folding && a.tier == b.tier) {
      bool ka = keepsLooseTerminal(c, a.index, leadPlan), kb = keepsLooseTerminal(c, b.index, leadPlan);
      if (ka != kb) return ka ? 1 : -1;
    }
    if (!folding) {
      auto rank = [&](const Candidate& x, bool& isNull) -> int {
        if (x.shanten <= 0 || riskStep(x.loss) >= 3 || !shortSuitDiscard(c, x.index, leadPlan)) { isNull = true; return 0; }
        isNull = false;
        return shortSuitRank(c, x.index, leadPlan);
      };
      bool na, nb;
      int ra = rank(a, na), rb = rank(b, nb);
      if (na != nb || (!na && ra != rb)) {
        if (na) return 1;
        if (nb) return -1;
        return ra - rb;
      }
    }
    if (b.score != a.score) return b.score - a.score;
    if (a.priority != b.priority) return a.priority - b.priority;
    return int(isTerminalOrHonor(b.index)) - int(isTerminalOrHonor(a.index));
  });
  if (!folding && T.tripletsLive) out = tripletsOrder(out, ctx, c);
  {
    std::vector<CandP> keep, lone;
    for (auto& x : out) (x->shanten > 0 && loneDragon(g, c, x->index) ? lone : keep).push_back(x);
    keep.insert(keep.end(), lone.begin(), lone.end());
    out = keep;
  }
  out = jyFinalOrder(out, ctx, c);
  out = keepDragonPair(out, ctx, c);
  {
    std::vector<CandP> ready, rest;
    for (auto& x : out) (isReadyCand(*x) ? ready : rest).push_back(x);
    ready.insert(ready.end(), rest.begin(), rest.end());
    out = ready;
  }
  // T.keepPairs is 0: no keepPairs.
  if (T.honorOrder && !folding) out = honorTieOrder(out, ctx, c);
  if (hasRerank()) out = rerank(out, ctx, c, g, seat, threats, folding);
  out = consistentFirst(out, g, c, folding);
  if (!handOverride && ctx.actualMelds) updateCommit(g, seat, out.empty() ? nullptr : out[0].get(), folding);
  res.candidates = out;
  res.defense = weight;
  res.folding = folding;
  return res;
}

/* ---------------- 8. Decisions ---------------- */

Decision Foundation::chooseTurnAction(const Game& g, int seat, const TurnOptions& opts) {
  Decision d;
  if (opts.hasWin) { d.type = A_WIN; return d; }
  DiscardAnalysis analysis = analyzeDiscards(g, seat);
  if (std::getenv("LCM_DEBUG") && uint32_t(std::atol(std::getenv("LCM_DEBUG"))) == g.seed) {
    std::fprintf(stderr, "turn seat %d discards %zu lead %s folding %d\n", seat, g.hand.seats[seat].discards.size(),
                 planIdString(analysis.ctx.leadPlan.get()).c_str(), int(analysis.folding));
    for (auto& x : analysis.candidates)
      std::fprintf(stderr, "  %s util %.17g loss %.17g sh %d score %.17g pri %g tier %g plan %s\n", tileId(x->index), x->util, x->loss, x->shanten,
                   x->score, x->priority, x->tier, planIdString(x->analysis->hasBest ? x->analysis->best.plan.get() : nullptr).c_str());
  }
  const Candidate& keep = *analysis.candidates[0];
  Ctx& ctx = analysis.ctx;
  for (auto& kong : opts.kongs) {
    if (!jyKongOk(kong, ctx)) continue;
    if (check && kongContradicts(ctx.leadPlan.get(), kong.tile)) continue;
    int i = kong.tile;
    Counts c = countsOf(g.hand.seats[seat].hand);
    double util;
    if (!kong.added) {
      c[i] -= 4;
      Meld m; m.type = KONG; m.tiles = {int8_t(kong.tile)}; m.concealed = true;
      Ctx k = withMeld(ctx, m);
      util = handUtility(c, k).util;
    } else {
      c[i] -= 1;
      util = handUtility(c, ctx).util;
    }
    if (util * 1.08 >= keep.util) { d.type = A_KONG; d.tile = kong.tile; return d; }
  }
  d.type = A_DISCARD;
  d.tile = keep.index;
  return d;
}

ClaimFound Foundation::claimCandidates(const Game& g, int seat, const ClaimOptions& opts) {
  Ctx ctx = buildContext(g, seat);
  const auto& hand = g.hand.seats[seat].hand;
  Counts c = countsOf(hand);
  ClaimFound res;
  int tile = opts.tile;
  auto threats = opponentThreats(g, seat);
  auto bestAfter = [&](const std::vector<int8_t>& nextHand, const Ctx& nextCtx) -> CandP {
    DiscardAnalysis a = analyzeDiscards(g, seat, &nextCtx, &nextHand);
    return a.candidates.empty() ? nullptr : a.candidates[0];
  };
  if (opts.pung) {
    std::vector<int8_t> h1 = hand;
    h1.erase(h1.begin() + indexOf(h1, tile));
    h1.erase(h1.begin() + indexOf(h1, tile));
    Meld m; m.type = PUNG; m.tiles = {int8_t(tile), int8_t(tile), int8_t(tile)}; m.concealed = false;
    CandP b1 = bestAfter(h1, withMeld(ctx, m));
    if (b1) { ClaimOption o; o.decision.type = A_PUNG; o.score = b1->score; o.hasDiscard = true; o.discard = b1->index; o.analysis = b1->analysis; o.cand = b1; res.options.push_back(o); }
  }
  if (opts.kong) {
    Counts ck = c;
    ck[tile] -= 3;
    Meld m; m.type = KONG; m.tiles = {int8_t(tile), int8_t(tile), int8_t(tile), int8_t(tile)}; m.concealed = false;
    Ctx kc = withMeld(ctx, m);
    auto uk = std::make_shared<Analysis>(handUtility(ck, kc));
    ClaimOption o; o.decision.type = A_KONG; o.score = uk->util * 1.05; o.analysis = uk;
    res.options.push_back(o);
  }
  for (auto& pair : opts.chows) {
    std::vector<int8_t> h2 = hand;
    h2.erase(h2.begin() + indexOf(h2, pair[0]));
    h2.erase(h2.begin() + indexOf(h2, pair[1]));
    Meld m; m.type = CHOW; m.tiles = sortTiles({pair[0], pair[1], int8_t(tile)}); m.concealed = false;
    CandP b2 = bestAfter(h2, withMeld(ctx, m));
    if (b2) {
      ClaimOption o; o.decision.type = A_CHOW; o.decision.tiles = pair; o.score = b2->score; o.hasDiscard = true; o.discard = b2->index;
      o.analysis = b2->analysis; o.cand = b2;
      res.options.push_back(o);
    }
  }
  res.stay = handUtility(c, ctx);
  double nextLoss = DINF;
  for (int i = 0; i < 34; i++) if (c[i]) nextLoss = std::min(nextLoss, dealInLoss(g, threats, i));
  if (nextLoss == DINF) nextLoss = 0;
  res.passScore = res.stay.util - nextLoss;
  js::sort(res.options, [](const ClaimOption& a, const ClaimOption& b) { return b.score - a.score; });
  return res;
}

bool Foundation::claimKeepsPlan(const ClaimOption& o, const ClaimFound& res, const Ctx& ctx) {
  Family key = ctx.commitKey;
  const Entry* cur = res.stay.hasBest ? &res.stay.best : nullptr;
  const Entry* next = o.analysis && o.analysis->hasBest ? &o.analysis->best : nullptr;
  if (key == F_NONE || !cur || !next || !next->plan || cur->readyBest) return true;
  if (!cur->plan || familyOf(*cur->plan) != key || familyOf(*next->plan) == key) return true;
  if (o.analysis->shanten == 0) return true;
  return !next->readyBest && pivotWhy(*next, *cur, ctx);
}

bool Foundation::chowAllowed(const ClaimOption& o, const ClaimFound& res, const Game& g, const Ctx& ctx) {
  const Analysis* an = o.analysis.get();
  if (!an) return false;
  if (o.decision.type == A_CHOW) {
    int su = suitIdx(o.decision.tiles[0]);
    if (!chowSuitReady(ctx, countsOf(g.hand.seats[ctx.seat].hand), su)) return false;
  }
  int after = an->shanten, before = res.stay.shanten;
  if (after >= before) return false;
  int min = g.minFaan;
  if (after == 0) return an->hasReady && an->ready.bestFaan >= min;
  const Plan* plan = an->hasBest ? an->best.plan.get() : nullptr;
  return plan && plan->faan >= min - 0.25;
}

Foundation::Decided Foundation::decideClaim(const Game& g, int seat, const ClaimOptions& opts) {
  Decided d = decideClaimRaw(g, seat, opts);
  if (!claimConsistent(g, seat, d.hasFound ? &d.found : nullptr, d.decision, opts.tile)) { d.decision = Decision(); d.decision.type = A_PASS; }
  return d;
}

Foundation::Decided Foundation::decideClaimRaw(const Game& g, int seat, const ClaimOptions& opts) {
  Decided out;
  if (opts.hasWin) { out.decision.type = A_WIN; return out; }
  if (!opts.pung && !opts.kong && opts.chows.empty()) { out.decision.type = A_PASS; return out; }
  out.found = claimCandidates(g, seat, opts);
  out.hasFound = true;
  ClaimFound& res = out.found;
  Ctx ctx = buildContext(g, seat);
  // H.claim: Jorge Yau's bigClaim (ownClaims is off). liveUpgrade's target is never hard (it always has a target).
  { Decision mine; if (jyClaim(res, ctx, g, opts, mine)) { out.decision = mine; return out; } }
  int ti = opts.tile;
  const Plan* stayPlan = res.stay.hasBest ? res.stay.best.plan.get() : nullptr;
  bool lockedShape = stayPlan && (stayPlan->kind == P_PAIRS || stayPlan->kind == P_ORPHANS || stayPlan->kind == P_GATES);
  if (!lockedShape && ti >= 27 && valueWeight(ctx, ti) && (opts.pung || opts.kong)) {
    ActType take = opts.pung ? A_PUNG : A_KONG;
    const ClaimOption* after = nullptr;
    for (auto& o : res.options) if (o.decision.type == take) { after = &o; break; }
    bool breaksReady = res.stay.shanten == 0 && after && after->analysis && after->analysis->shanten > 0 && after->score < res.passScore;
    if (!breaksReady) { out.decision.type = take; return out; }
  }
  if (stayPlan && stayPlan->kind == P_STRAIGHTS) { out.decision.type = A_PASS; return out; }
  std::vector<const ClaimOption*> options;
  for (auto& o : res.options) {
    if (!claimKeepsPlan(o, res, ctx)) continue;
    if (o.decision.type != A_CHOW || chowAllowed(o, res, g, ctx)) options.push_back(&o);
  }
  const ClaimOption* top = options.empty() ? nullptr : options[0];
  double bar = top && top->decision.type == A_CHOW ? 1.2 : 1.04;
  if (top && top->score > res.passScore * bar + 0.01) { out.decision = top->decision; return out; }
  out.decision.type = A_PASS;
  return out;
}

Decision Foundation::chooseClaim(const Game& g, int seat, const ClaimOptions& o) { return decideClaim(g, seat, o).decision; }

#include "jy.inc"

}  // namespace lcm
