#include "engine.h"
#include <stdexcept>

namespace lcm {

static uint64_t versions = 0;
void touch(Hand& h) { h.version = ++versions; }

void removeTiles(std::vector<int8_t>& arr, std::initializer_list<int> ids) {
  for (int id : ids) {
    auto it = std::find(arr.begin(), arr.end(), int8_t(id));
    if (it == arr.end()) throw std::runtime_error(std::string("tile not in hand: ") + tileId(id));
    arr.erase(it);
  }
}

int countIn(const std::vector<int8_t>& arr, int id) {
  int n = 0;
  for (int t : arr) if (t == id) n++;
  return n;
}

int indexOf(const std::vector<int8_t>& arr, int id) {
  for (size_t i = 0; i < arr.size(); i++) if (arr[i] == id) return int(i);
  return -1;
}

std::vector<int8_t> sortTiles(std::vector<int8_t> ids) {
  std::stable_sort(ids.begin(), ids.end(), [](int8_t a, int8_t b) { return sortKey(a) < sortKey(b); });
  return ids;
}

Game createGame(const GameOptions& o) {
  Game g;
  g.seed = o.seed;
  g.rng = Rng(o.seed);
  // The bot names are shuffled from the game's generator (12 names): the walls depend on it.
  std::vector<int> names(12);
  for (int i = 0; i < 12; i++) names[i] = i;
  shuffle(names, g.rng);
  for (int i = 0; i < 4; i++) g.points[i] = o.startPoints;
  g.dealer = o.dealer >= 0 ? o.dealer : int(g.rng() * 4);
  g.firstDealer = g.dealer;
  return g;
}

void startHand(Game& g) {
  g.handNumber++;
  uint32_t seed = g.rng.a;  // the game generator's state
  Rng handRng(seed);
  Hand& h = g.hand;
  h = Hand();
  h.seed = seed;
  h.wall.t = buildWall(handRng);
  h.wall.head = 0;
  h.wall.tail = int(h.wall.t.size());
  g.rng.a = handRng.a;
  h.dealer = g.dealer;
  h.round = g.round;
  h.turn = g.dealer;
  for (int r = 0; r < 13; r++)
    for (int s = 0; s < 4; s++) h.seats[(g.dealer + s) % 4].hand.push_back(h.wall.shift());
  h.seats[g.dealer].hand.push_back(h.wall.shift());
  touch(h);
}

static int drawTile(Game& g, int seat, bool fromBack) {
  Wall& w = g.hand.wall;
  if (w.empty()) return NO_TILE;
  int t = fromBack ? w.pop() : w.shift();
  if (fromBack) g.hand.backDrawn++;
  g.hand.seats[seat].hand.push_back(int8_t(t));
  g.hand.canSelfDraw = true;
  touch(g.hand);
  return t;
}

WinCheck scoreWin(const Game& g, int seat, int tile, const WinFlags& f) {
  WinCheck out;
  const Seat& s = g.hand.seats[seat];
  ScoreInput in;
  in.concealed = s.hand;
  if (tile != NO_TILE) in.concealed.push_back(int8_t(tile));
  Counts c = countsOf(in.concealed);
  if (shanten(c, int(s.melds.size())) != -1) return out;
  for (auto& m : s.melds) in.melds.push_back({m.type == CHOW ? 'c' : m.type == PUNG ? 'p' : 'k', m.tiles[0], m.concealed});
  in.flowers = s.flowers;
  in.seat = seatWind(g, seat);
  in.round = g.round;
  in.selfDraw = f.selfDraw; in.lastTile = f.lastTile; in.robKong = f.robKong; in.kongWin = f.kongWin;
  in.doubleKong = f.doubleKong; in.heavenly = f.heavenly; in.earthly = f.earthly;
  in.minFaan = g.minFaan;
  out.scored = true;
  out.score = scoreHand(in);
  out.score.canWin = out.score.valid && out.score.faan >= g.minFaan;
  return out;
}

WinFlags selfDrawFlags(const Game& g, int seat) {
  const Hand& h = g.hand;
  WinFlags f;
  f.selfDraw = true;
  f.kongWin = h.kongChain == 1;
  f.doubleKong = h.kongChain >= 2;
  f.lastTile = h.wall.size() == 0;
  f.heavenly = seat == g.dealer && h.discardCount == 0 && h.claimsMade == 0 && h.kongChain == 0;
  return f;
}

WinFlags discardFlags(const Game& g, int seat, int from) {
  const Hand& h = g.hand;
  WinFlags f;
  f.lastTile = h.wall.size() == 0;
  f.earthly = from == g.dealer && seat != g.dealer && h.discardCount == 1 && h.claimsMade == 0;
  return f;
}

TurnOptions turnOptions(const Game& g, int seat) {
  const Seat& s = g.hand.seats[seat];
  bool fresh = g.hand.canSelfDraw;
  TurnOptions o;
  if (fresh) {
    WinCheck w = scoreWin(g, seat, NO_TILE, selfDrawFlags(g, seat));
    if (w.scored) {
      if (w.score.canWin) { o.hasWin = true; o.win = w.score; }
      else { o.hasShort = true; o.completeButShort = w.score; }
    }
  }
  if (fresh && g.hand.wall.size()) {
    bool seen[42] = {false};
    for (int id : s.hand) {
      if (seen[id]) continue;
      seen[id] = true;
      if (countIn(s.hand, id) == 4) o.kongs.push_back({id, false});
    }
    for (auto& m : s.melds)
      if (m.type == PUNG && indexOf(s.hand, m.tiles[0]) != -1) o.kongs.push_back({m.tiles[0], true});
  }
  o.justClaimed = !fresh;
  return o;
}

std::vector<std::array<int8_t, 2>> chowOptions(const std::vector<int8_t>& hand, int tile) {
  std::vector<std::array<int8_t, 2>> out;
  if (tile < 0 || tile >= 27) return out;
  int r = tile % 9;
  static const int D[3][2] = {{-2, -1}, {-1, 1}, {1, 2}};
  for (auto& d : D) {
    int a = r + d[0], b = r + d[1];
    if (a < 0 || b > 8) continue;
    int ta = tile + d[0], tb = tile + d[1];
    if (indexOf(hand, ta) != -1 && indexOf(hand, tb) != -1) out.push_back({{int8_t(ta), int8_t(tb)}});
  }
  return out;
}

ClaimOptions claimOptions(const Game& g, int seat, int tile, int from, bool robbing) {
  const Seat& s = g.hand.seats[seat];
  ClaimOptions o;
  o.tile = tile; o.from = from; o.robKong = robbing;
  WinFlags f;
  if (robbing) f.robKong = true; else f = discardFlags(g, seat, from);
  WinCheck w = scoreWin(g, seat, tile, f);
  if (w.scored && w.score.canWin) { o.hasWin = true; o.win = w.score; }
  else if (w.scored) { o.hasShort = true; o.completeButShort = w.score; }
  if (robbing) return o;
  int n = countIn(s.hand, tile);
  if (n >= 2) o.pung = true;
  if (n >= 3 && g.hand.wall.size()) o.kong = true;
  if ((from + 1) % 4 == seat) o.chows = chowOptions(s.hand, tile);
  return o;
}

static void applyDiscard(Game& g, int seat, int tile) {
  Hand& h = g.hand;
  removeTiles(h.seats[seat].hand, {tile});
  h.seats[seat].discards.push_back({int8_t(tile), false});
  h.discardCount++;
  h.hasLastDiscard = true;
  h.lastDiscard = {tile, seat};
  h.kongChain = 0;
  h.drawnTile = NO_TILE;
  touch(h);
}

static void markLastDiscardClaimed(Game& g) {
  auto& list = g.hand.seats[g.hand.lastDiscard.from].discards;
  list.back().claimed = true;
  touch(g.hand);
}

static void applyClaim(Game& g, int seat, const Decision& d) {
  Hand& h = g.hand;
  int t = h.lastDiscard.tile;
  Seat& s = h.seats[seat];
  Meld meld;
  meld.from = h.lastDiscard.from;
  meld.claimed = t;
  if (d.type == A_CHOW) {
    removeTiles(s.hand, {d.tiles[0], d.tiles[1]});
    meld.type = CHOW;
    meld.tiles = sortTiles({d.tiles[0], d.tiles[1], int8_t(t)});
  } else if (d.type == A_PUNG) {
    removeTiles(s.hand, {t, t});
    meld.type = PUNG;
    meld.tiles = {int8_t(t), int8_t(t), int8_t(t)};
  } else {
    removeTiles(s.hand, {t, t, t});
    meld.type = KONG;
    meld.tiles = {int8_t(t), int8_t(t), int8_t(t), int8_t(t)};
  }
  meld.at = int(s.discards.size());
  s.melds.push_back(meld);
  markLastDiscardClaimed(g);
  h.claimsMade++;
  h.turn = seat;
  h.canSelfDraw = d.type == A_KONG;
  touch(h);
}

static void applyKong(Game& g, int seat, const KongOption& k) {
  Seat& s = g.hand.seats[seat];
  if (!k.added) {
    removeTiles(s.hand, {k.tile, k.tile, k.tile, k.tile});
    Meld m;
    m.type = KONG;
    m.tiles = {int8_t(k.tile), int8_t(k.tile), int8_t(k.tile), int8_t(k.tile)};
    m.from = -1; m.concealed = true; m.at = int(s.discards.size());
    s.melds.push_back(m);
  } else {
    removeTiles(s.hand, {k.tile});
    for (auto& m : s.melds)
      if (m.type == PUNG && m.tiles[0] == k.tile) { m.type = KONG; m.tiles.push_back(int8_t(k.tile)); m.added = true; }
  }
  g.hand.kongChain++;
  touch(g.hand);
}

static void payments(const Game& g, int winner, int payer, int points, int out[4]) {
  for (int i = 0; i < 4; i++) out[i] = 0;
  if (points <= 0) return;  // JS: !points (null or 0)
  if (payer < 0) {
    for (int i = 0; i < 4; i++) { if (i == winner) continue; out[i] -= points; out[winner] += points; }
  } else { out[payer] -= points; out[winner] += points; }
}

static void finishHand(Game& g, const Result& r) {
  for (int i = 0; i < 4; i++) g.points[i] += r.deltas[i];
  bool dealerKeeps = r.win && r.winner == g.dealer;
  if (dealerKeeps) g.dealerRepeat++;
  else {
    g.dealerRepeat = 0;
    g.dealer = (g.dealer + 1) % 4;
    if (g.dealer == g.firstDealer) {
      if (g.round >= 4) g.over = true;
      else g.round = g.round % 4 + 1;
    }
  }
}

static Result settleWin(Game& g, int winner, int payer, int tile, const Score& score, How how) {
  Result r;
  r.win = true; r.winner = winner; r.payer = payer; r.tile = tile; r.how = how; r.score = score;
  payments(g, winner, payer, score.points, r.deltas);
  finishHand(g, r);
  return r;
}

static Result settleDraw(Game& g) {
  Result r;
  finishHand(g, r);
  return r;
}

static void log(Game& g, const std::string& s) { if (g.hand.trace) g.hand.trace->push_back(s); }
static std::string T(int t) { return t == NO_TILE ? "-" : tileId(t); }

static int handleFlowers(Game& g, int seat) {
  int n = 0;
  Seat& s = g.hand.seats[seat];
  for (;;) {
    int idx = -1;
    for (size_t i = 0; i < s.hand.size(); i++) if (isBonus(s.hand[i])) { idx = int(i); break; }
    if (idx == -1) break;
    int f = s.hand[idx];
    s.hand.erase(s.hand.begin() + idx);
    s.flowers.push_back(int8_t(f));
    touch(g.hand);
    if (g.hand.trace) log(g, "flower " + std::to_string(seat) + " " + T(f));
    n++;
    if (g.hand.wall.empty()) break;
    int rep = g.hand.wall.pop();
    g.hand.backDrawn++;
    s.hand.push_back(int8_t(rep));
    touch(g.hand);
    if (g.hand.trace) log(g, "draw " + std::to_string(seat) + " " + T(rep) + " flower");
  }
  return n;
}

struct FlowerWin { bool any = false; Score score; int payer = -1; };
static FlowerWin flowerWinCheck(const Game& g, int seat) {
  FlowerWin fw;
  int n = int(g.hand.seats[seat].flowers.size());
  if (n < 7) return fw;
  ScoreInput in;
  in.flowers = g.hand.seats[seat].flowers;
  in.seat = seatWind(g, seat);
  in.round = g.round;
  in.selfDraw = true;
  in.minFaan = g.minFaan;
  fw.any = true;
  fw.score = scoreHand(in);
  if (n == 7)
    for (int o = 0; o < 4; o++) if (o != seat && g.hand.seats[o].flowers.size()) fw.payer = o;
  return fw;
}

static int claimRank(ActType t) {
  switch (t) { case A_WIN: return 3; case A_KONG: case A_PUNG: return 2; case A_CHOW: return 1; default: return 0; }
}

struct ClaimWin { bool any = false; int seat = -1; Decision decision; ClaimOptions opts; };

static ClaimWin resolveClaims(Game& g, Agent* agents[4], int tile, int from, bool robbing) {
  struct Entry { int seat, order; ClaimOptions opts; Decision d; };
  std::vector<Entry> entries;
  for (int k = 1; k <= 3; k++) {
    int seat = (from + k) % 4;
    ClaimOptions o = claimOptions(g, seat, tile, from, robbing);
    if (hasAnyClaim(o)) entries.push_back({seat, k, o, Decision()});
  }
  ClaimWin out;
  if (entries.empty()) return out;
  for (auto& e : entries) e.d = agents[e.seat]->claim(g, e.seat, e.opts);
  const Entry* top = nullptr;
  for (auto& e : entries) {
    int r = claimRank(e.d.type);
    if (!r) continue;
    if (!top || r > claimRank(top->d.type) || (r == claimRank(top->d.type) && e.order < top->order)) top = &e;
  }
  if (!top) return out;
  out.any = true; out.seat = top->seat; out.decision = top->d; out.opts = top->opts;
  return out;
}

static Result finishFlowerWin(Game& g, int seat, const FlowerWin& fw) {
  Result r = settleWin(g, seat, fw.payer, NO_TILE, fw.score, H_FLOWERS);
  if (g.hand.trace) log(g, "win " + std::to_string(seat) + " flowers - -");
  return r;
}

// The hand's loop. A replay (continueAfterDiscard) starts at `pending`: `cur` has
// just chosen to throw it, so the loop goes straight to applying it.
static Result playLoop(Game& g, Agent* agents[4], int cur, bool needDraw, int pending);

static Result playHand(Game& g, Agent* agents[4]) {
  for (int k = 0; k < 4; k++) handleFlowers(g, (g.dealer + k) % 4);
  for (int f = 0; f < 4; f++) {
    FlowerWin fw = flowerWinCheck(g, (g.dealer + f) % 4);
    if (fw.any) return finishFlowerWin(g, (g.dealer + f) % 4, fw);
  }
  return playLoop(g, agents, g.dealer, false, NO_TILE);
}

Result continueAfterDiscard(Game& g, Agent* agents[4], int seat, int tile) {
  return playLoop(g, agents, seat, false, tile);
}

static Result playLoop(Game& g, Agent* agents[4], int cur, bool needDraw, int pending) {
  Hand& h = g.hand;
  for (;;) {
    h.turn = cur;
    if (needDraw && pending == NO_TILE) {
      if (h.wall.empty()) {
        Result dr = settleDraw(g);
        log(g, "drawGame");
        return dr;
      }
      bool fromBack = h.kongChain > 0;
      int t = drawTile(g, cur, fromBack);
      h.drawnTile = t;
      if (h.trace) log(g, "draw " + std::to_string(cur) + " " + T(t) + (fromBack ? " kong" : " wall"));
      if (handleFlowers(g, cur)) {
        h.drawnTile = h.seats[cur].hand.back();
        FlowerWin fw2 = flowerWinCheck(g, cur);
        if (fw2.any) return finishFlowerWin(g, cur, fw2);
      }
    }
    needDraw = true;

    int discarded = NO_TILE;
    if (pending != NO_TILE) {
      applyDiscard(g, cur, pending);
      discarded = pending;
      pending = NO_TILE;
    }
    while (discarded == NO_TILE) {
      TurnOptions topts = turnOptions(g, cur);
      Decision action = agents[cur]->turn(g, cur, topts);
      if (action.type == A_WIN && !topts.hasWin) throw std::runtime_error("illegal turn action");
      if (action.type == A_WIN) {
        Result r = settleWin(g, cur, -1, h.drawnTile, topts.win, H_SELF_DRAW);
        if (h.trace) log(g, "win " + std::to_string(cur) + " selfDraw " + T(h.drawnTile) + " -");
        return r;
      }
      if (action.type == A_KONG) {
        const KongOption* kong = nullptr;
        for (auto& k : topts.kongs) if (k.tile == action.tile) { kong = &k; break; }
        if (!kong) throw std::runtime_error(std::string("illegal kong ") + tileId(action.tile));
        KongOption kg = *kong;
        if (kg.added) {
          ClaimWin rob = resolveClaims(g, agents, kg.tile, cur, true);
          if (rob.any && rob.decision.type == A_WIN) {
            removeTiles(h.seats[cur].hand, {kg.tile});
            touch(h);
            Result r = settleWin(g, rob.seat, cur, kg.tile, rob.opts.win, H_ROB_KONG);
            if (h.trace) log(g, "win " + std::to_string(rob.seat) + " robKong " + T(kg.tile) + " " + std::to_string(cur));
            return r;
          }
        }
        applyKong(g, cur, kg);
        if (h.trace) log(g, "kong " + std::to_string(cur) + " " + T(kg.tile) + (kg.added ? " added" : " concealed"));
        if (h.wall.empty()) {
          Result dr = settleDraw(g);
          log(g, "drawGame");
          return dr;
        }
        int rep = drawTile(g, cur, true);
        h.drawnTile = rep;
        if (h.trace) log(g, "draw " + std::to_string(cur) + " " + T(rep) + " kong");
        if (handleFlowers(g, cur)) {
          h.drawnTile = h.seats[cur].hand.back();
          FlowerWin fw3 = flowerWinCheck(g, cur);
          if (fw3.any) return finishFlowerWin(g, cur, fw3);
        }
        continue;
      }
      int tile = action.tile;
      if (indexOf(h.seats[cur].hand, tile) == -1) throw std::runtime_error(std::string("illegal discard ") + tileId(tile));
      applyDiscard(g, cur, tile);
      discarded = tile;
      if (h.trace) log(g, "discard " + std::to_string(cur) + " " + T(tile));
    }

    ClaimWin claim = resolveClaims(g, agents, discarded, cur, false);
    if (claim.any && claim.decision.type == A_WIN) {
      markLastDiscardClaimed(g);
      Result r = settleWin(g, claim.seat, cur, discarded, claim.opts.win, H_DISCARD);
      if (h.trace) log(g, "win " + std::to_string(claim.seat) + " discard " + T(discarded) + " " + std::to_string(cur));
      return r;
    }
    if (claim.any) {
      if (h.trace) {
        static const char* C[] = {"pass", "discard", "win", "kong", "pung", "chow"};
        std::string tiles = claim.decision.type == A_CHOW ? std::string(T(claim.decision.tiles[0])) + "," + T(claim.decision.tiles[1]) : "-";
        log(g, "claim " + std::to_string(claim.seat) + " " + std::to_string(cur) + " " + T(discarded) + " " + C[claim.decision.type] + " " + tiles);
      }
      applyClaim(g, claim.seat, claim.decision);
      cur = claim.seat;
      if (claim.decision.type == A_KONG) h.kongChain = 1;
      else needDraw = false;
      continue;
    }
    cur = (cur + 1) % 4;
  }
}

Result runHand(Game& g, Agent* agents[4], std::vector<std::string>* trace) {
  startHand(g);
  g.hand.trace = trace;
  Result r = playHand(g, agents);
  g.hand.trace = nullptr;
  return r;
}

std::string traceText(const Result& r) {
  static const char* HOW[] = {"selfDraw", "discard", "robKong", "flowers"};
  std::string s = r.win ? "result win " + std::to_string(r.winner) + " " + (r.payer < 0 ? "-" : std::to_string(r.payer)) + " " + HOW[r.how] +
                              " " + std::to_string(r.score.faan) + " " + std::to_string(r.score.points)
                        : std::string("result draw");
  for (int i = 0; i < 4; i++) s += " " + std::to_string(r.deltas[i]);
  return s;
}

Counts visibleCounts(const Game& g, int seat) {
  Counts c = countsOf(g.hand.seats[seat].hand);
  for (int i = 0; i < 4; i++) {
    const Seat& s = g.hand.seats[i];
    for (auto& d : s.discards) if (!d.claimed) c[d.tile]++;
    for (auto& m : s.melds) {
      if (m.concealed && i != seat) continue;
      for (int t : m.tiles) c[t]++;
    }
  }
  return c;
}

Counts unseenCounts(const Game& g, int seat) {
  Counts v = visibleCounts(g, seat);
  for (auto& n : v) n = int8_t(std::max(0, 4 - int(n)));
  return v;
}

}  // namespace lcm
