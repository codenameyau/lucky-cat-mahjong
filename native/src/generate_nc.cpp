#include "generate_nc.h"
#include "neural_cat.h"
#include "shanten.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <algorithm>

namespace lcm {

// scripts/ml/heads.js
static const int AUX_BYTES = 6 + 102, LABEL_BYTES = 16, NONE = 255;

static int planHand(int kind) {
  switch (kind) {
    case P_PLAIN: return 0;
    case P_RUNS: case P_STRAIGHTS: return 1;
    case P_HALF: return 2;
    case P_FULL: return 3;
    case P_TRIPLETS: return 4;
    case P_CONCEALED_TRIPLETS: return 5;
    case P_PAIRS: case P_PAIRS_ORPHANS: case P_PAIRS_HONORS: case P_PAIRS_TERMINALS: return 6;
    case P_ORPHANS: return 7;
    case P_GATES: return 8;
    case P_MIXED_ORPHANS: case P_ALL_TERMINALS: case P_ALL_HONORS: case P_JY_HONORS: case P_JY_TERMINALS: return 9;
    case P_SMALL_DRAGONS: case P_BIG_DRAGONS: return 10;
    case P_SMALL_WINDS: case P_BIG_WINDS: case P_JY_WINDS: return 11;
    default: return kind < 0 ? NONE : 0;
  }
}

static int winHand(const Score& score) {
  static const std::pair<Item, int> ORDER[] = {
    {I_THIRTEEN_ORPHANS, 7}, {I_NINE_GATES, 8}, {I_BIG_FOUR_WINDS, 11}, {I_SMALL_FOUR_WINDS, 11},
    {I_BIG_THREE_DRAGONS, 10}, {I_SMALL_THREE_DRAGONS, 10}, {I_ALL_HONORS, 9}, {I_ALL_TERMINALS, 9},
    {I_MIXED_ORPHANS, 9}, {I_SEVEN_PAIRS, 6}, {I_FULL_FLUSH, 3}, {I_CONCEALED_TRIPLETS, 5},
    {I_HALF_FLUSH, 2}, {I_ALL_TRIPLETS, 4}, {I_ALL_SEQUENCES, 1},
  };
  for (auto& o : ORDER) for (auto& it : score.items) if (it.item == o.first) return o.second;
  return 0;
}

static void tableLabels(const Game& g, int seat, int tile, uint8_t* out) {
  std::memset(out, 0, AUX_BYTES);
  out[0] = NONE; out[1] = NONE;
  for (int k = 1; k <= 3; k++) {
    const Seat& s = g.hand.seats[(seat + k) % 4];
    std::vector<int8_t> ids;
    for (int t : s.hand) if (!isBonus(t)) ids.push_back(int8_t(t));
    Counts c = countsOf(ids);
    int declared = int(s.melds.size());
    int sh = std::min(std::max(shanten(c.data(), declared), 0), 4);
    out[3 + k - 1] = uint8_t(sh);
    if (sh == 0 && ids.size() % 3 == 1) for (int i : winningTiles(c.data(), declared)) out[6 + (k - 1) * 34 + i] = 1;
  }
  if (tile >= 0) {
    int worst = 0;
    for (int k = 1; k <= 3; k++) {
      ClaimOptions o = claimOptions(g, (seat + k) % 4, tile, seat, false);
      if (o.hasWin) worst = std::max(worst, std::min(13, o.win.faan));
    }
    out[2] = uint8_t(worst);
  }
}

// A float32 as a float16, rounded to the nearest (ties to even), as a JS Float16Array stores it.
static uint16_t toHalf(float v) {
  uint32_t x;
  std::memcpy(&x, &v, 4);
  uint16_t sign = uint16_t((x >> 16) & 0x8000);
  uint32_t mant = x & 0x7fffff;
  int exp = int((x >> 23) & 0xff);
  if (exp == 0xff) return uint16_t(sign | 0x7c00 | (mant ? 0x200 : 0));
  if (exp == 0 && mant == 0) return sign;
  // The value as mant53 * 2^e, then to half precision by exact rounding.
  double d = std::fabs(double(v));
  int e;
  double m = std::frexp(d, &e);  // d = m * 2^e, m in [0.5, 1)
  int he = e - 1;                 // unbiased exponent of the leading bit
  if (he > 15) return uint16_t(sign | 0x7c00);
  int shift = he < -14 ? -24 : he - 10;  // the weight of one unit in the last place
  double q = std::ldexp(d, -shift);       // exact: a power of two scaling
  double f = std::floor(q);
  double rem = q - f;
  uint32_t n = uint32_t(f);
  if (rem > 0.5 || (rem == 0.5 && (n & 1))) n++;
  if (he < -14) return uint16_t(sign | n);  // subnormal (n may reach 0x400: the smallest normal)
  if (n == 0x800) { n = 0x400; he++; if (he > 15) return uint16_t(sign | 0x7c00); }
  return uint16_t(sign | (uint32_t(he + 15) << 10) | (n & 0x3ff));
}

static const int REPLAY_BYTES = 30;  // replays, outcome counts (6), win faan counts (11), pay faan counts (11), unused
struct NcRow {
  uint8_t seat, explored, strategy = 0; int turn, wallLeft; std::vector<float> x; uint8_t aux[AUX_BYTES];
  std::shared_ptr<Game> snap; int tile = NO_TILE;  // a discard to replay: the game before it, and the tile
};

// Option replays (the frontier plan, steps 5 and 6): at a share of the recorded
// decisions, every option the seat weighs, not just the one it took, is played on
// `optionReplays` times from the same position, the wall shuffled each time. Each
// option is a row (the learner's features for it) with the counts and the mean
// points of its replays, grouped by the position, so the network can learn both
// what each option is worth and which of them is best. Native only, after the hand:
// the shard's own rows stay the JS's byte for byte.
static const int OPT_BYTES = 56;
enum OptKind : uint8_t { O_DISCARD, O_KONG, O_PASS, O_PUNG, O_CHOW, O_CALL_KONG };
struct Opt {
  OptKind kind; std::vector<float> x;
  Decision first; bool hasThen = false; Decision then;  // the seat's forced decisions: the move, and a discard after a call
};
struct OptGroup {
  uint8_t seat, strategy; bool atClaim; int from = -1, tile = NO_TILE, melds = 0;
  std::shared_ptr<Game> snap; std::vector<Opt> opts; int chosen = -1;
};

static void cloneMemos(Game& g) { for (auto& s : g.hand.seats) if (s.botState) s.botState = s.botState->clone(); }
static std::shared_ptr<Game> snapshot(const Game& g) { auto p = std::make_shared<Game>(g); cloneMemos(*p); return p; }

static bool sameMove(const Decision& a, const Decision& b) {
  if (a.type != b.type) return false;
  if (a.type == A_CHOW) return a.tiles[0] == b.tiles[0] && a.tiles[1] == b.tiles[1];
  if (a.type == A_DISCARD || (a.type == A_KONG && a.tile != NO_TILE && b.tile != NO_TILE)) return a.tile == b.tile;
  return true;
}

// The seat's first decisions forced (an option being replayed), then its own strategy.
struct Forced : Agent {
  Agent* inner; int seat; const Opt* opt; int melds; bool firstUsed = false, thenUsed = false;
  Decision turn(Game& g, int s, const TurnOptions& o) override {
    if (s == seat && opt->first.type != A_PASS && !firstUsed && (opt->first.type == A_DISCARD || opt->first.type == A_KONG) && opt->kind <= O_KONG) {
      firstUsed = true;
      return opt->first;
    }
    if (s == seat && opt->hasThen && !thenUsed && firstUsed) {
      thenUsed = true;
      // Only when the call went through (another seat may have taken the tile first).
      if (int(g.hand.seats[s].melds.size()) > melds && indexOf(g.hand.seats[s].hand, opt->then.tile) != -1) return opt->then;
    }
    return inner->turn(g, s, o);
  }
  Decision claim(Game& g, int s, const ClaimOptions& o) override {
    if (s == seat && opt->kind >= O_PASS && !firstUsed) { firstUsed = true; return opt->first; }
    return inner->claim(g, s, o);
  }
};

struct Recorder : Agent {
  NeuralCat* nc;
  Agent* inner = nullptr;  // the seat's own strategy; null: the learner itself (nc) plays
  uint8_t strategy = 0;
  Rng* rng;
  Rng* replayRng = nullptr;  // its own generator, so the rows are the JS's whatever is replayed
  double replayShare = 0;
  double optionShare = 0; int options = 0;  // option replays: the share of recorded decisions, and the discards weighed
  std::vector<OptGroup>* groups = nullptr;
  double sample;
  std::vector<NcRow>* rows;
  NcRow& push(const Game& g, int seat, int explored) {
    rows->emplace_back();
    NcRow& r = rows->back();
    r.seat = uint8_t(seat); r.explored = uint8_t(explored); r.strategy = strategy;
    r.turn = int(g.hand.seats[seat].discards.size());
    r.wallLeft = int(g.hand.wall.size());
    r.x.resize(NeuralCat::SIZE);
    return r;
  }
  Decision turn(Game& g, int seat, const TurnOptions& o) override {
    // Read the position before the bot moves (its plan memo moves after).
    bool keep = !o.hasWin && (*rng)() < sample;
    std::unique_ptr<NeuralCat::Reading> st;
    if (keep) { st.reset(new NeuralCat::Reading); nc->read(*st, g, seat); }
    OptGroup* grp = keep && optionShare > 0 && (*replayRng)() < optionShare ? turnGroup(g, seat, o) : nullptr;
    Decision a = inner ? inner->turn(g, seat, o) : nc->chooseTurnAction(g, seat, o);
    if (grp) settle(*grp, a, [&](Opt& op) { return turnOption(*grp, a, op); });
    if (a.type == A_KONG) {
      for (auto& k : o.kongs) if (k.tile == a.tile) {
        NcRow& r = push(g, seat, 2);
        nc->waitingRow(g, seat, k.added ? 3 : 2, k.tile, r.x.data());
        tableLabels(g, seat, -1, r.aux);
        break;
      }
      return a;
    }
    if (a.type != A_DISCARD || !st) return a;
    NcRow& r = push(g, seat, 0);
    if (replayShare > 0 && (*replayRng)() < replayShare) {
      // The game as it is, each strategy's memory of the hand copied (not shared) with it.
      r.snap = std::make_shared<Game>(g);
      for (auto& s : r.snap->hand.seats) if (s.botState) s.botState = s.botState->clone();
      r.tile = a.tile;
    }
    int kind = nc->row(*st, a.tile, r.x.data());
    tableLabels(g, seat, a.tile, r.aux);
    r.aux[0] = uint8_t(planHand(kind));
    return a;
  }
  Decision claim(Game& g, int seat, const ClaimOptions& o) override {
    bool can = !o.hasWin && (o.pung || o.kong || !o.chows.empty());
    bool keep = can && (*rng)() < sample;
    std::vector<float> pass, kong;
    if (keep) { pass.resize(NeuralCat::SIZE); nc->waitingRow(g, seat, 0, o.tile, pass.data()); }
    if (keep && o.kong) { kong.resize(NeuralCat::SIZE); nc->waitingRow(g, seat, 1, o.tile, kong.data()); }
    OptGroup* grp = keep && !o.robKong && optionShare > 0 && (*replayRng)() < optionShare ? claimGroup(g, seat, o) : nullptr;
    Decision d = inner ? inner->claim(g, seat, o) : nc->chooseClaim(g, seat, o);
    if (grp) settle(*grp, d, [&](Opt& op) { return claimOption(*grp, d, op); });
    const std::vector<float>* x = d.type == A_PASS && !pass.empty() ? &pass : d.type == A_KONG && !kong.empty() ? &kong : nullptr;
    if (x) {
      NcRow& r = push(g, seat, 2);
      r.x = *x;
      tableLabels(g, seat, -1, r.aux);
    }
    return d;
  }

  // The options at a turn: the first `options` discards in the foundation's order, and each kong.
  OptGroup* turnGroup(const Game& g, int seat, const TurnOptions& o) {
    groups->emplace_back();
    OptGroup& G = groups->back();
    G.seat = uint8_t(seat); G.strategy = strategy; G.atClaim = false;
    G.snap = snapshot(g);
    Game probe = *G.snap; cloneMemos(probe);
    NeuralCat::Reading rd; nc->read(rd, probe, seat);
    Game probe2 = *G.snap; cloneMemos(probe2);
    DiscardAnalysis da = nc->analyzeDiscards(probe2, seat);
    std::vector<int> seen;
    for (auto& c : da.candidates) {
      if (int(G.opts.size()) >= options) break;
      if (std::find(seen.begin(), seen.end(), c->index) != seen.end()) continue;
      seen.push_back(c->index);
      Opt op; op.kind = O_DISCARD; op.first.type = A_DISCARD; op.first.tile = c->index;
      op.x.resize(NeuralCat::SIZE); nc->row(rd, c->index, op.x.data());
      G.opts.push_back(std::move(op));
    }
    for (auto& k : o.kongs) {
      Opt op; op.kind = O_KONG; op.first.type = A_KONG; op.first.tile = k.tile;
      op.x.resize(NeuralCat::SIZE); nc->waitingRow(probe, seat, k.added ? 3 : 2, k.tile, op.x.data());
      G.opts.push_back(std::move(op));
    }
    G.melds = int(g.hand.seats[seat].melds.size());
    return &G;
  }
  bool turnOption(OptGroup& G, const Decision& a, Opt& op) {
    if (a.type != A_DISCARD) return false;
    Game probe = *G.snap; cloneMemos(probe);
    NeuralCat::Reading rd; nc->read(rd, probe, G.seat);
    op.kind = O_DISCARD; op.first = a; op.x.resize(NeuralCat::SIZE); nc->row(rd, a.tile, op.x.data());
    return true;
  }
  // The options at a claim: passing, each call the seat may make (with the learner's discard after it), the kong.
  OptGroup* claimGroup(const Game& g, int seat, const ClaimOptions& o) {
    groups->emplace_back();
    OptGroup& G = groups->back();
    G.seat = uint8_t(seat); G.strategy = strategy; G.atClaim = true; G.from = o.from; G.tile = o.tile;
    G.melds = int(g.hand.seats[seat].melds.size());
    G.snap = snapshot(g);
    std::vector<Decision> moves;
    Decision pass; pass.type = A_PASS; moves.push_back(pass);
    if (o.pung) { Decision d; d.type = A_PUNG; d.tile = o.tile; moves.push_back(d); }
    for (auto& c : o.chows) { Decision d; d.type = A_CHOW; d.tile = o.tile; d.tiles = c; moves.push_back(d); }
    if (o.kong) { Decision d; d.type = A_KONG; d.tile = o.tile; moves.push_back(d); }
    for (auto& d : moves) { Opt op; if (claimOption(G, d, op)) G.opts.push_back(std::move(op)); }
    if (G.opts.size() < 2) { groups->pop_back(); return nullptr; }
    return &G;
  }
  bool claimOption(OptGroup& G, const Decision& d, Opt& op) {
    op.first = d; op.x.resize(NeuralCat::SIZE);
    if (d.type == A_PASS) { op.kind = O_PASS; Game p = *G.snap; cloneMemos(p); nc->waitingRow(p, G.seat, 0, G.tile, op.x.data()); return true; }
    if (d.type == A_KONG) { op.kind = O_CALL_KONG; Game p = *G.snap; cloneMemos(p); nc->waitingRow(p, G.seat, 1, G.tile, op.x.data()); return true; }
    if (d.type != A_PUNG && d.type != A_CHOW) return false;
    op.kind = d.type == A_PUNG ? O_PUNG : O_CHOW;
    // The call made on a copy, then the learner's discard after it: the row is that discard's.
    Game p = *G.snap; cloneMemos(p);
    applyClaim(p, G.seat, d);
    p.hand.turn = G.seat;
    Game q = p; cloneMemos(q);
    TurnOptions to = turnOptions(q, G.seat);
    Decision after = nc->chooseTurnAction(q, G.seat, to);
    if (after.type != A_DISCARD) return false;
    NeuralCat::Reading rd; nc->read(rd, p, G.seat);
    nc->row(rd, after.tile, op.x.data());
    op.hasThen = true; op.then = after;
    return true;
  }
  template <class F> void settle(OptGroup& G, const Decision& taken, F make) {
    for (size_t k = 0; k < G.opts.size(); k++) if (sameMove(G.opts[k].first, taken)) { G.chosen = int(k); break; }
    if (G.chosen < 0) {
      Opt op;
      if (make(op)) { G.opts.push_back(std::move(op)); G.chosen = int(G.opts.size()) - 1; }
    }
    if (G.chosen < 0 || G.opts.size() < 2) groups->pop_back();
  }
};

// The wall's order shuffled: the draws still to come, and nothing else. Every hand
// stays as it is, so a replay's outcome is drawn from how the hand would end
// given everything at the table (an unbiased target with less noise than the one
// real ending: the hidden hands are used for labels only, never as inputs).
// Shuffling the others' hands too gives them random hands, which win far less
// than the hands they really held (4.9% deal-ins in replays against 12.2%).
static void reshuffle(Game& g, int seat, Rng& rng) {
  (void)seat;
  Hand& h = g.hand;
  for (int i = h.wall.tail; i > h.wall.head + 1; i--) std::swap(h.wall.t[i - 1], h.wall.t[h.wall.head + size_t(rng() * double(i - h.wall.head))]);
  touch(h);
}

int runGenerateNc(const NcGenerateJob& job, const AgentFactory& make) {
  auto t0 = std::chrono::steady_clock::now();
  // generate.js: E.createRng((cfg.seed * 2654435761) >>> 0), the product as a JS number.
  double prod = double(job.seed) * 2654435761.0;
  Rng rng(uint32_t(std::fmod(prod, 4294967296.0)));
  auto model = std::make_shared<Mlp>(loadWeights(job.weights));
  NeuralCat learner(model);
  learner.temperature = job.temperature;
  learner.epsilon = job.epsilon;
  learner.rng = [&rng]() { return rng(); };
  std::vector<NcRow> rows;
  Recorder rec;
  Rng replayRng(job.seed ^ 0x9e3779b9u);
  rec.nc = &learner; rec.rng = &rng; rec.sample = job.sample; rec.rows = &rows;
  rec.replayRng = &replayRng; rec.replayShare = job.replays > 0 ? job.replayShare : 0;
  std::vector<OptGroup> groups;
  rec.groups = &groups; rec.optionShare = job.optionReplays > 0 ? job.optionShare : 0; rec.options = job.options;
  // The learner in a replay plays its best (no exploring), as it will in the game.
  NeuralCat best(model);
  struct BestAgent : Agent {
    NeuralCat* nc;
    Decision turn(Game& g, int seat, const TurnOptions& o) override { return nc->chooseTurnAction(g, seat, o); }
    Decision claim(Game& g, int seat, const ClaimOptions& o) override { return nc->chooseClaim(g, seat, o); }
  } bestAgent;
  bestAgent.nc = &best;
  long replayed = 0;
  std::map<std::string, std::unique_ptr<Agent>> pool;
  for (auto& id : job.pool) if (id != "learner" && !pool.count(id)) pool[id] = make(id);

  std::string base = job.out + "/shard-" + std::to_string(job.shard);
  FILE* ff = std::fopen((base + ".features").c_str(), "wb");
  FILE* fl = std::fopen((base + ".labels").c_str(), "wb");
  FILE* fa = std::fopen((base + ".aux").c_str(), "wb");
  FILE* fr = job.replays > 0 ? std::fopen((base + ".replay").c_str(), "wb") : nullptr;
  FILE* fo = job.optionReplays > 0 ? std::fopen((base + ".options").c_str(), "wb") : nullptr;
  FILE* fol = job.optionReplays > 0 ? std::fopen((base + ".optlabels").c_str(), "wb") : nullptr;
  if (!ff || !fl || !fa || (job.replays > 0 && !fr) || (job.optionReplays > 0 && (!fo || !fol))) throw std::runtime_error("generate-nc: can't write " + base);
  long optionRows = 0, optionGroups = 0;
  long samples = 0, hands = 0, outcomes[6] = {0, 0, 0, 0, 0, 0};
  std::vector<uint16_t> X;
  std::vector<uint8_t> L, A;
  for (long d = 0; d < job.deals; d++) {
    uint32_t dealSeed = uint32_t(job.seed + d);
    Agent* agents[4];
    Agent* real[4];  // who plays each seat in a replay
    Recorder seatRec[4];
    for (int s = 0; s < 4; s++) {
      size_t k = size_t(rng() * double(job.pool.size()));
      const std::string& id = job.pool[k];
      bool learner = id == "learner";
      real[s] = learner ? nullptr : pool[id].get();
      if (job.recordAll) {
        seatRec[s] = rec;
        seatRec[s].inner = real[s];
        seatRec[s].strategy = uint8_t(job.poolStrategies[k]);
        agents[s] = &seatRec[s];
      } else {
        agents[s] = learner ? static_cast<Agent*>(&rec) : real[s];
      }
    }
    GameOptions o;
    o.seed = dealSeed; o.dealer = int(dealSeed % 4); o.startPoints = 1000000000;
    Game g = createGame(o);
    g.round = int((dealSeed >> 2) % 4) + 1;
    rows.clear();
    groups.clear();
    Result res = runHand(g, agents);
    hands++;
    if (rows.empty()) continue;
    int faan = std::max(3, std::min(13, res.score.faan ? res.score.faan : 3));
    int won = res.win ? winHand(res.score) : NONE;
    X.clear(); L.assign(rows.size() * LABEL_BYTES, 0); A.clear();
    for (size_t k = 0; k < rows.size(); k++) {
      NcRow& r = rows[k];
      for (float v : r.x) X.push_back(toHalf(v));
      int oc = 5;
      if (res.win) {
        bool selfPaid = res.payer < 0;
        oc = res.winner == r.seat ? (selfPaid ? 0 : 1) : res.payer == r.seat ? 2 : selfPaid ? 3 : 4;
      }
      outcomes[oc]++;
      uint8_t* p = L.data() + k * LABEL_BYTES;
      p[0] = uint8_t(oc);
      p[1] = uint8_t(oc <= 1 ? faan : 0);
      p[2] = uint8_t(oc == 2 || oc == 3 ? faan : 0);
      p[3] = uint8_t(std::min(255, r.turn));
      p[4] = r.seat;
      p[5] = job.recordAll ? r.strategy : uint8_t(job.strategy);
      p[6] = uint8_t(std::min(255, r.wallLeft));
      p[7] = r.explored;
      float delta = float(res.deltas[r.seat]);
      std::memcpy(p + 8, &delta, 4);
      std::memcpy(p + 12, &dealSeed, 4);
      if (oc <= 1) r.aux[1] = uint8_t(won);
      A.insert(A.end(), r.aux, r.aux + AUX_BYTES);
    }
    std::fwrite(X.data(), 2, X.size(), ff);
    std::fwrite(L.data(), 1, L.size(), fl);
    std::fwrite(A.data(), 1, A.size(), fa);
    if (fr) {
      // After the hand, so nothing here moves the deals' own random draws.
      std::vector<uint8_t> R(rows.size() * REPLAY_BYTES, 0);
      Agent* again[4];
      for (int s = 0; s < 4; s++) again[s] = real[s] ? real[s] : static_cast<Agent*>(&bestAgent);
      for (size_t k = 0; k < rows.size(); k++) {
        NcRow& r = rows[k];
        if (!r.snap) continue;
        uint8_t* p = R.data() + k * REPLAY_BYTES;
        for (int n = 0; n < job.replays; n++) {
          Game copy = *r.snap;
          cloneMemos(copy);  // each replay starts from the same memory of the hand
          reshuffle(copy, r.seat, replayRng);
          Result rr = continueAfterDiscard(copy, again, r.seat, r.tile);
          int f = std::max(3, std::min(13, rr.score.faan ? rr.score.faan : 3));
          int oc = 5;
          if (rr.win) {
            bool selfPaid = rr.payer < 0;
            oc = rr.winner == r.seat ? (selfPaid ? 0 : 1) : rr.payer == r.seat ? 2 : selfPaid ? 3 : 4;
          }
          p[1 + oc]++;
          if (oc <= 1) p[7 + f - 3]++;
          if (oc == 2 || oc == 3) p[18 + f - 3]++;
        }
        p[0] = uint8_t(job.replays);
        replayed++;
      }
      std::fwrite(R.data(), 1, R.size(), fr);
    }
    if (fo && !groups.empty()) {
      Agent* again[4];
      for (int s = 0; s < 4; s++) again[s] = real[s] ? real[s] : static_cast<Agent*>(&bestAgent);
      std::vector<uint16_t> OX;
      std::vector<uint8_t> OL;
      for (auto& G : groups) {
        uint32_t gid = uint32_t(optionGroups++);
        for (size_t k = 0; k < G.opts.size(); k++) {
          const Opt& op = G.opts[k];
          for (float v : op.x) OX.push_back(toHalf(v));
          uint8_t p[OPT_BYTES];
          std::memset(p, 0, OPT_BYTES);
          double pts = 0;
          for (int n = 0; n < job.optionReplays; n++) {
            Game copy = *G.snap;
            cloneMemos(copy);
            reshuffle(copy, G.seat, replayRng);
            Forced fz; fz.inner = again[G.seat]; fz.seat = G.seat; fz.opt = &op; fz.melds = G.melds;
            Agent* ag[4];
            for (int s = 0; s < 4; s++) ag[s] = s == G.seat ? static_cast<Agent*>(&fz) : again[s];
            Result rr = G.atClaim ? continueAtClaims(copy, ag, G.from, G.tile) : continueAtTurn(copy, ag, G.seat);
            int f = std::max(3, std::min(13, rr.score.faan ? rr.score.faan : 3));
            double v = 8.0 * std::pow(2.0, f - 3);
            int oc = 5;
            if (rr.win) {
              bool selfPaid = rr.payer < 0;
              oc = rr.winner == G.seat ? (selfPaid ? 0 : 1) : rr.payer == G.seat ? 2 : selfPaid ? 3 : 4;
            }
            p[9 + oc]++;
            if (oc <= 1) p[32 + f - 3]++;
            if (oc == 2 || oc == 3) p[43 + f - 3]++;
            // expected points as the model counts them (js/mahjong-ml-model.js summarize)
            pts += oc == 0 ? 3 * v : oc == 1 ? v : oc == 2 || oc == 3 ? -v : 0;
          }
          std::memcpy(p, &gid, 4);
          p[4] = uint8_t(int(k) == G.chosen);
          p[5] = uint8_t(op.kind);
          p[6] = job.recordAll ? G.strategy : uint8_t(job.strategy);
          p[7] = uint8_t(G.opts.size());
          p[8] = uint8_t(job.optionReplays);
          p[15] = G.seat;
          float mean = float(pts / job.optionReplays);
          std::memcpy(p + 16, &mean, 4);
          std::memcpy(p + 20, &dealSeed, 4);
          OL.insert(OL.end(), p, p + OPT_BYTES);
          optionRows++;
        }
      }
      std::fwrite(OX.data(), 2, OX.size(), fo);
      std::fwrite(OL.data(), 1, OL.size(), fol);
    }
    samples += long(rows.size());
  }
  std::fclose(ff); std::fclose(fl); std::fclose(fa);
  if (fr) std::fclose(fr);
  if (fo) { std::fclose(fo); std::fclose(fol); }
  long ms = long(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count());
  std::printf("{\"index\":%d,\"deals\":%ld,\"hands\":%ld,\"samples\":%ld,\"replayed\":%ld,\"optionRows\":%ld,\"optionGroups\":%ld,\"outcomes\":[%ld,%ld,%ld,%ld,%ld,%ld],\"ms\":%ld}\n",
              job.shard, job.deals, hands, samples, replayed, optionRows, optionGroups, outcomes[0], outcomes[1], outcomes[2], outcomes[3], outcomes[4], outcomes[5], ms);
  return 0;
}

}  // namespace lcm
