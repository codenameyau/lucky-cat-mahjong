#include "generate_nc.h"
#include "neural_cat.h"
#include "only_orphans.h"
#include "lucky_cat.h"
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
  std::frexp(d, &e);              // d = m * 2^e, m in [0.5, 1)
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
  int action = -1;  // Lucky Cat's output for the move (generate-lcv's policy files), else -1
  Decision first; bool hasThen = false; Decision then;  // the seat's forced decisions: the move, and a discard after a call
};
struct OptGroup {
  uint8_t seat, strategy; bool atClaim; int from = -1, tile = NO_TILE, melds = 0;
  std::shared_ptr<Game> snap; std::vector<Opt> opts; int chosen = -1;
  // generate-lcv: the policy's features of the position and the legal moves' outputs.
  std::vector<float> px; std::vector<int> legal;
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
  // The learner (generate.js's mlBot, its id the JS's default for that strategy).
  bool oo = job.learner == "only-orphans";
  auto makeLearner = [&]() -> std::unique_ptr<NeuralCat> {
    if (oo) return std::unique_ptr<NeuralCat>(new OnlyOrphans(model));
    return std::unique_ptr<NeuralCat>(new NeuralCat(model));
  };
  auto learnerP = makeLearner();
  NeuralCat& learner = *learnerP;
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
  auto bestP = makeLearner();
  NeuralCat& best = *bestP;
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

// ---- Lucky Cat's value data (generate-lcv) ------------------------------------

struct LcRow { uint8_t seat, strategy; int turn, wallLeft; std::vector<float> x; uint8_t aux[AUX_BYTES]; };

struct LcvRecorder : Agent {
  LuckyCat* lc;
  Agent* inner = nullptr;  // the seat's own strategy; null: the learner
  uint8_t strategy = 0;
  Rng* rng; Rng* replayRng;
  double sample = 0.12, optionShare = 0; int options = 4, extraRandom = 0;
  std::vector<LcRow>* rows; std::vector<OptGroup>* groups;

  LcRow& push(const Game& g, int seat, const lucky::After& a, int thrown) {
    rows->emplace_back();
    LcRow& r = rows->back();
    r.seat = uint8_t(seat); r.strategy = strategy;
    r.turn = int(g.hand.seats[seat].discards.size());
    r.wallLeft = int(g.hand.wall.size());
    r.x.resize(lucky::VALUE_SIZE);
    lucky::valueFeatures(g, seat, a, r.x.data());
    tableLabels(g, seat, thrown, r.aux);
    r.aux[0] = NONE;  // no rules' hand: Lucky Cat reads none
    return r;
  }
  static std::vector<int> byShare(const std::vector<Move>& m) {
    std::vector<int> o(m.size());
    for (size_t j = 0; j < m.size(); j++) o[j] = int(j);
    std::sort(o.begin(), o.end(), [&](int a, int b) { return m[a].p != m[b].p ? m[a].p > m[b].p : a < b; });
    return o;
  }
  Opt turnOpt(const Game& g, int seat, const Decision& d) {
    Opt op; op.kind = d.type == A_KONG ? O_KONG : O_DISCARD; op.first = d;
    op.x.resize(lucky::VALUE_SIZE);
    lucky::valueFeatures(g, seat, lucky::afterTurn(g, seat, d), op.x.data());
    return op;
  }
  bool claimOpt(const OptGroup& G, const Game& g, int seat, const ClaimOptions& o, const Decision& d, Opt& op) {
    op.first = d; op.x.resize(lucky::VALUE_SIZE);
    lucky::After a = lucky::afterCall(g, seat, o, d);
    if (d.type == A_PASS || d.type == A_KONG) { op.kind = d.type == A_PASS ? O_PASS : O_CALL_KONG; lucky::valueFeatures(g, seat, a, op.x.data()); return true; }
    if (d.type != A_PUNG && d.type != A_CHOW) return false;
    op.kind = d.type == A_PUNG ? O_PUNG : O_CHOW;
    // The call on a copy, then the learner's discard after it; the row is that discard's.
    Game p = *G.snap; cloneMemos(p);
    applyClaim(p, seat, d);
    p.hand.turn = seat;
    TurnOptions to = turnOptions(p, seat);
    Decision after = lc->turn(p, seat, to);
    if (after.type != A_DISCARD) return false;
    lucky::After b = a;
    for (int t = int(b.hand.size()) - 1; t >= 0; t--) if (b.hand[t] == after.tile) { b.hand.erase(b.hand.begin() + t); break; }
    b.thrown = after.tile; b.kind = 0;
    lucky::valueFeatures(g, seat, b, op.x.data());
    op.hasThen = true; op.then = after;
    return true;
  }
  void settle(OptGroup& G, const Decision& taken, const std::function<bool(Opt&)>& make) {
    for (size_t k = 0; k < G.opts.size(); k++) if (sameMove(G.opts[k].first, taken)) { G.chosen = int(k); break; }
    if (G.chosen < 0) { Opt op; if (make(op)) { G.opts.push_back(std::move(op)); G.chosen = int(G.opts.size()) - 1; } }
    if (G.chosen < 0 || G.opts.size() < 2) groups->pop_back();
  }

  Decision turn(Game& g, int seat, const TurnOptions& o) override {
    bool keep = !o.hasWin && (*rng)() < sample;
    OptGroup* grp = nullptr;
    if (keep && optionShare > 0 && (*replayRng)() < optionShare) {
      groups->emplace_back();
      OptGroup& G = groups->back();
      G.seat = uint8_t(seat); G.strategy = strategy; G.atClaim = false;
      G.melds = int(g.hand.seats[seat].melds.size());
      G.snap = snapshot(g);
      auto moves = lc->turnShares(g, seat, o);
      auto order = byShare(moves);
      for (int k = 0; k < int(order.size()) && k < options; k++) { G.opts.push_back(turnOpt(g, seat, moves[order[k]].decision)); G.opts.back().action = moves[order[k]].action; }
      // --extra-random N: N more legal moves, drawn at random from the rest (plans the policy under-rates).
      for (int e = 0; e < extraRandom && int(order.size()) > int(G.opts.size()); e++) {
        int pick = options + int((*replayRng)() * double(int(order.size()) - options));
        if (pick >= int(order.size())) pick = int(order.size()) - 1;
        bool dup = false;
        for (auto& op : G.opts) if (op.action == moves[order[pick]].action) dup = true;
        if (dup) continue;
        G.opts.push_back(turnOpt(g, seat, moves[order[pick]].decision)); G.opts.back().action = moves[order[pick]].action;
      }
      G.px.resize(lucky::SIZE_V1); lucky::encode(g, seat, nullptr, 1, G.px.data());
      for (auto& m : moves) G.legal.push_back(m.action);
      grp = &G;
    }
    Decision a = inner ? inner->turn(g, seat, o) : lc->turn(g, seat, o);
    if (keep && (a.type == A_DISCARD || a.type == A_KONG)) push(g, seat, lucky::afterTurn(g, seat, a), a.type == A_DISCARD ? a.tile : -1);
    if (grp) settle(*grp, a, [&](Opt& op) {
      if (a.type != A_DISCARD && a.type != A_KONG) return false;
      op = turnOpt(g, seat, a); op.action = a.type == A_KONG ? 34 + a.tile : a.tile;
      return true;
    });
    return a;
  }
  Decision claim(Game& g, int seat, const ClaimOptions& o) override {
    bool can = !o.hasWin && (o.pung || o.kong || !o.chows.empty());
    bool keep = can && (*rng)() < sample;
    OptGroup* grp = nullptr;
    if (keep && !o.robKong && optionShare > 0 && (*replayRng)() < optionShare) {
      groups->emplace_back();
      OptGroup& G = groups->back();
      G.seat = uint8_t(seat); G.strategy = strategy; G.atClaim = true; G.from = o.from; G.tile = o.tile;
      G.melds = int(g.hand.seats[seat].melds.size());
      G.snap = snapshot(g);
      auto cm = lucky::claimMoves(o);
      for (auto& m : cm) { Opt op; if (claimOpt(G, g, seat, o, m.decision, op)) { op.action = m.action; G.opts.push_back(std::move(op)); } }
      lucky::Offer offer{o.tile, o.from, o.robKong};
      G.px.resize(lucky::SIZE_V1); lucky::encode(g, seat, &offer, 1, G.px.data());
      for (auto& m : cm) G.legal.push_back(m.action);
      if (G.opts.size() < 2) groups->pop_back(); else grp = &G;
    }
    Decision d = inner ? inner->claim(g, seat, o) : lc->claim(g, seat, o);
    if (keep && (d.type == A_PASS || d.type == A_KONG)) push(g, seat, lucky::afterCall(g, seat, o, d), -1);
    if (grp) settle(*grp, d, [&](Opt& op) {
      if (!claimOpt(*grp, g, seat, o, d, op)) return false;
      for (auto& m : lucky::claimMoves(o)) if (sameMove(m.decision, d)) op.action = m.action;
      return true;
    });
    return d;
  }
};

// --truncate K with --value V: a replay stops at the seat's K-th own move after the option,
// and scores the position that move leaves with the value (expected points), not the hand's
// end: far less of the futures' luck, and a fraction of the cost.
struct TruncEv { double ev; };
// A hand's delta for a seat on the half-spicy table (js/points.js halfSpicyPoints): the settlement
// is linear in the winner's base points, so the full-spicy delta is scaled by half/full.
double halfSpicyDelta(const Result& r, int seat) {
  if (!r.win || r.score.points <= 0) return 0;
  int f = std::min(r.score.faan, 13);
  double h = f <= 4 ? std::pow(2.0, f) : f % 2 == 0 ? std::pow(2.0, (f + 4) / 2) : std::pow(2.0, (f + 3) / 2) * 1.5;
  return r.deltas[seat] * h / double(r.score.points);
}
struct Truncate : Agent {
  Agent* inner; int seat; int left; const ValueNet* value;
  Decision turn(Game& g, int s, const TurnOptions& o) override {
    Decision d = inner->turn(g, s, o);
    if (s == seat && (d.type == A_DISCARD || d.type == A_KONG) && --left <= 0) {
      float x[lucky::VALUE_SIZE];
      lucky::valueFeatures(g, s, lucky::afterTurn(g, s, d), x);
      throw TruncEv{value->ev(x).ev};
    }
    return d;
  }
  Decision claim(Game& g, int s, const ClaimOptions& o) override { return inner->claim(g, s, o); }
};

// <policy.lcmw>[+<value.lcmw>]
static std::unique_ptr<LuckyCat> makeLucky(const std::string& spec, double temperature, std::function<double()> rng) {
  std::string pol = spec, val;
  size_t plus = spec.find('+');
  if (plus != std::string::npos) { pol = spec.substr(0, plus); val = spec.substr(plus + 1); }
  std::unique_ptr<LuckyCat> lc(new LuckyCat(std::make_shared<Mlp>(loadWeights(pol)), temperature, std::move(rng)));
  if (!val.empty()) lc->value = std::make_shared<ValueNet>(std::make_shared<Mlp>(loadWeights(val)), lucky::VALUE_SIZE);
  return lc;
}

int runGenerateLcv(const NcGenerateJob& job, const AgentFactory& make) {
  auto t0 = std::chrono::steady_clock::now();
  double prod = double(job.seed) * 2654435761.0;
  Rng rng(uint32_t(std::fmod(prod, 4294967296.0)));
  Rng replayRng(job.seed ^ 0x9e3779b9u);
  // The learner explores by its shares (no value) or now and then one of its best few (a value).
  auto learner = makeLucky(job.weights, job.temperature, [&rng]() { return rng(); });
  if (learner->value) { learner->epsilon = job.epsilon; }
  auto best = makeLucky(job.weights, 0, [&replayRng]() { return replayRng(); });
  std::vector<LcRow> rows;
  std::vector<OptGroup> groups;
  LcvRecorder rec;
  rec.lc = learner.get(); rec.rng = &rng; rec.replayRng = &replayRng; rec.sample = job.sample;
  rec.optionShare = job.optionReplays > 0 ? job.optionShare : 0; rec.options = job.options; rec.extraRandom = job.extraRandom;
  rec.rows = &rows; rec.groups = &groups;
  std::map<std::string, std::unique_ptr<Agent>> pool;
  for (auto& id : job.pool) if (id != "learner" && !pool.count(id)) pool[id] = make(id);

  std::string base = job.out + "/shard-" + std::to_string(job.shard);
  FILE* ff = std::fopen((base + ".features").c_str(), "wb");
  FILE* fl = std::fopen((base + ".labels").c_str(), "wb");
  FILE* fa = std::fopen((base + ".aux").c_str(), "wb");
  FILE* fo = job.optionReplays > 0 ? std::fopen((base + ".options").c_str(), "wb") : nullptr;
  FILE* fol = job.optionReplays > 0 ? std::fopen((base + ".optlabels").c_str(), "wb") : nullptr;
  if (!ff || !fl || !fa || (job.optionReplays > 0 && (!fo || !fol))) throw std::runtime_error("generate-lcv: can't write " + base);
  // Lucky Cat's policy files (ml/train_lucky.py --mode q): at each option group, the policy's
  // features, the legal moves, the moves tried (the one played first) and each one's share of
  // replays won.
  static const int SLOTS = 8;
  FILE* px = nullptr; FILE* pm = nullptr; FILE* pqa = nullptr; FILE* pq = nullptr; FILE* pqp = nullptr; FILE* ph = nullptr; FILE* pa = nullptr; FILE* pw = nullptr; FILE* pqr = nullptr; FILE* pqn = nullptr;
  if (job.optionReplays > 0) {
    // --policy-only: each slot's SE of its gap to the move played (.qs.f4) and replays taken (.qn.u1);
    // otherwise each slot's mean real points (.qr.f4: the engine's deltas, the same numbers as .qp.f4).
    pqr = std::fopen((base + (job.policyOnly ? ".qs.f4" : ".qr.f4")).c_str(), "wb");
    if (job.policyOnly) pqn = std::fopen((base + ".qn.u1").c_str(), "wb");
    px = std::fopen((base + ".x.f16").c_str(), "wb"); pm = std::fopen((base + ".m.u1").c_str(), "wb");
    pqa = std::fopen((base + ".qa.u1").c_str(), "wb"); pq = std::fopen((base + ".q.f4").c_str(), "wb"); pqp = std::fopen((base + ".qp.f4").c_str(), "wb");
    ph = std::fopen((base + ".h.u4").c_str(), "wb"); pa = std::fopen((base + ".a.u1").c_str(), "wb"); pw = std::fopen((base + ".w.f4").c_str(), "wb");
    if (!px || !pm || !pqa || !pq || !pqp || !ph || !pa || !pw || !pqr) throw std::runtime_error("generate-lcv: can't write " + base + " (policy files)");
  }
  long samples = 0, hands = 0, optionRows = 0, optionGroups = 0, policyRows = 0, truncated = 0, outcomes[6] = {0, 0, 0, 0, 0, 0};
  std::unique_ptr<ValueNet> truncValue;
  if (job.truncate > 0) {
    if (job.value.empty()) throw std::runtime_error("generate-lcv: --truncate needs --value");
    truncValue.reset(new ValueNet(std::make_shared<Mlp>(loadWeights(job.value)), lucky::VALUE_SIZE));
  }
  for (long d = 0; d < job.deals; d++) {
    uint32_t dealSeed = uint32_t(job.seed + d);
    Agent* agents[4]; Agent* real[4];
    LcvRecorder seatRec[4];
    for (int s = 0; s < 4; s++) {
      size_t k = size_t(rng() * double(job.pool.size()));
      const std::string& id = job.pool[k];
      real[s] = id == "learner" ? nullptr : pool[id].get();
      seatRec[s] = rec;
      seatRec[s].inner = real[s];
      seatRec[s].strategy = uint8_t(job.poolStrategies.empty() ? 0 : job.poolStrategies[k]);
      agents[s] = &seatRec[s];
    }
    GameOptions o;
    o.seed = dealSeed; o.dealer = int(dealSeed % 4); o.startPoints = 1000000000;
    Game g = createGame(o);
    g.round = int((dealSeed >> 2) % 4) + 1;
    rows.clear(); groups.clear();
    Result res = runHand(g, agents);
    hands++;
    int faan = std::max(3, std::min(13, res.score.faan ? res.score.faan : 3));
    int won = res.win ? winHand(res.score) : NONE;
    std::vector<uint16_t> X; std::vector<uint8_t> L(rows.size() * LABEL_BYTES, 0), A;
    for (size_t k = 0; k < rows.size(); k++) {
      LcRow& r = rows[k];
      for (float v : r.x) X.push_back(toHalf(v));
      int oc = 5;
      if (res.win) { bool selfPaid = res.payer < 0; oc = res.winner == r.seat ? (selfPaid ? 0 : 1) : res.payer == r.seat ? 2 : selfPaid ? 3 : 4; }
      outcomes[oc]++;
      uint8_t* p = L.data() + k * LABEL_BYTES;
      p[0] = uint8_t(oc); p[1] = uint8_t(oc <= 1 ? faan : 0); p[2] = uint8_t(oc == 2 || oc == 3 ? faan : 0);
      p[3] = uint8_t(std::min(255, r.turn)); p[4] = r.seat; p[5] = r.strategy; p[6] = uint8_t(std::min(255, r.wallLeft)); p[7] = 0;
      float delta = float(res.deltas[r.seat]);
      std::memcpy(p + 8, &delta, 4); std::memcpy(p + 12, &dealSeed, 4);
      if (oc <= 1) r.aux[1] = uint8_t(won);
      A.insert(A.end(), r.aux, r.aux + AUX_BYTES);
    }
    if (!job.policyOnly || job.valueRows) { std::fwrite(X.data(), 2, X.size(), ff); std::fwrite(L.data(), 1, L.size(), fl); std::fwrite(A.data(), 1, A.size(), fa); }
    samples += long(rows.size());
    if (fo && !groups.empty()) {
      Agent* again[4];
      for (int s = 0; s < 4; s++) again[s] = real[s] ? real[s] : static_cast<Agent*>(best.get());
      std::vector<uint16_t> OX; std::vector<uint8_t> OL;
      for (auto& G : groups) {
        uint32_t gid = uint32_t(optionGroups++);
        if (job.policyOnly) {
          // Policy rows only: every option on the same futures (CRN); with --halving H, H replays
          // each first, then only the options within --halving-margin points of the best (and the
          // move played) take the rest. Each slot: mean points, share won, the SE of its gap to
          // the move played (paired by future), and the replays it took.
          size_t K = G.opts.size();
          std::vector<std::vector<double>> P(K), Wn(K);
          auto replay = [&](size_t k, int n) {
            Game copy = *G.snap; cloneMemos(copy);
            Rng fut(dealSeed * 2654435761u ^ (gid * 40503u + uint32_t(n) * 2246822519u + 0x85ebca6bu + job.crnSalt * 3266489917u));
            reshuffle(copy, G.seat, fut);
            Truncate tr; tr.inner = again[G.seat]; tr.seat = G.seat; tr.left = job.truncate; tr.value = truncValue.get();
            Forced fz; fz.inner = truncValue ? static_cast<Agent*>(&tr) : again[G.seat]; fz.seat = G.seat; fz.opt = &G.opts[k]; fz.melds = G.melds;
            Agent* ag[4];
            for (int s2 = 0; s2 < 4; s2++) ag[s2] = s2 == G.seat ? static_cast<Agent*>(&fz) : again[s2];
            try {
              Result rr = G.atClaim ? continueAtClaims(copy, ag, G.from, G.tile) : continueAtTurn(copy, ag, G.seat);
              P[k].push_back(job.halfSpicy ? job.spicyBlend * halfSpicyDelta(rr, G.seat) + (1 - job.spicyBlend) * double(rr.deltas[G.seat]) : double(rr.deltas[G.seat]));
              Wn[k].push_back(rr.win && rr.winner == G.seat ? 1 : 0);
            } catch (const TruncEv& t) {
              P[k].push_back(t.ev);
              Wn[k].push_back(0);  // not known: the share won counts only hands that ended
              truncated++;
            }
            optionRows++;
          };
          int R = job.optionReplays, r0 = job.halving > 0 ? std::min(job.halving, R) : R;
          for (size_t k = 0; k < K; k++) for (int n = 0; n < r0; n++) replay(k, n);
          bool goOn = r0 < R;
          if (goOn && job.closeSe > 0 && K >= 2) {
            // --close-se X: the rest of the replays only where the best two options are within X SE
            // (their CRN-paired gap over the first replays): the close decisions.
            std::vector<double> m(K, 0);
            for (size_t k = 0; k < K; k++) { for (double v : P[k]) m[k] += v; m[k] /= P[k].size(); }
            size_t b1 = 0; for (size_t k = 1; k < K; k++) if (m[k] > m[b1]) b1 = k;
            size_t b2 = b1 == 0 ? 1 : 0; for (size_t k = 0; k < K; k++) if (k != b1 && m[k] > m[b2]) b2 = k;
            double ds = 0, dq = 0; int L = r0;
            for (int n = 0; n < L; n++) { double d = P[b1][n] - P[b2][n]; ds += d; dq += d * d; }
            double dm = ds / L, se = L > 1 ? std::sqrt(std::max(0.0, dq / L - dm * dm) / (L - 1)) : 0;
            goOn = dm <= job.closeSe * se;
            if (goOn) for (size_t k = 0; k < K; k++) for (int n = r0; n < R; n++) replay(k, n);
            goOn = false;
          }
          if (goOn) {
            double bestM = -1e18;
            std::vector<double> m(K, 0);
            for (size_t k = 0; k < K; k++) { for (double v : P[k]) m[k] += v; m[k] /= P[k].size(); bestM = std::max(bestM, m[k]); }
            for (size_t k = 0; k < K; k++) if (int(k) == G.chosen || m[k] >= bestM - job.halvingMargin) for (int n = r0; n < R; n++) replay(k, n);
          }
          if (G.px.empty() || G.chosen < 0 || G.opts[G.chosen].action < 0) continue;
          std::vector<uint16_t> hx; for (float v : G.px) hx.push_back(toHalf(v));
          std::fwrite(hx.data(), 2, hx.size(), px);
          uint8_t mask[10] = {0};
          for (int a : G.legal) mask[a >> 3] |= uint8_t(1 << (a & 7));
          std::fwrite(mask, 1, 10, pm);
          uint8_t qa[SLOTS], qn[SLOTS]; float q[SLOTS], qp[SLOTS], qs[SLOTS];
          for (int k = 0; k < SLOTS; k++) { qa[k] = 255; qn[k] = 0; q[k] = 0; qp[k] = 0; qs[k] = 0; }
          auto slot = [&](int j, size_t k) {
            qa[j] = uint8_t(G.opts[k].action);
            double sm = 0, sw = 0; for (size_t n = 0; n < P[k].size(); n++) { sm += P[k][n]; sw += Wn[k][n]; }
            qp[j] = float(sm / P[k].size()); q[j] = float(sw / P[k].size()); qn[j] = uint8_t(P[k].size());
            size_t c = size_t(G.chosen), L = std::min(P[k].size(), P[c].size());
            double ds = 0, dq = 0; for (size_t n = 0; n < L; n++) { double d = P[k][n] - P[c][n]; ds += d; dq += d * d; }
            double dm = ds / L; qs[j] = L > 1 ? float(std::sqrt(std::max(0.0, dq / L - dm * dm) / (L - 1))) : 0;
          };
          int j = 0;
          slot(j++, size_t(G.chosen));
          for (size_t k = 0; k < K && j < SLOTS; k++) if (int(k) != G.chosen && G.opts[k].action >= 0) slot(j++, k);
          std::fwrite(qa, 1, SLOTS, pqa); std::fwrite(q, 4, SLOTS, pq); std::fwrite(qp, 4, SLOTS, pqp); std::fwrite(qs, 4, SLOTS, pqr);
          std::fwrite(qn, 1, SLOTS, pqn);
          std::fwrite(&dealSeed, 4, 1, ph);
          uint8_t a0 = qa[0]; std::fwrite(&a0, 1, 1, pa);
          float w1 = 1; std::fwrite(&w1, 4, 1, pw);
          policyRows++;
          continue;
        }
        std::vector<double> winShare(G.opts.size(), 0);
        std::vector<float> meanPts(G.opts.size(), 0), realPts(G.opts.size(), 0);
        for (size_t k = 0; k < G.opts.size(); k++) {
          const Opt& op = G.opts[k];
          if (!job.policyOnly) for (float v : op.x) OX.push_back(toHalf(v));
          uint8_t p[OPT_BYTES]; std::memset(p, 0, OPT_BYTES);
          double pts = 0, real = 0;
          for (int n = 0; n < job.optionReplays; n++) {
            Game copy = *G.snap; cloneMemos(copy);
            if (job.crn) { Rng fut(dealSeed * 2654435761u ^ (gid * 40503u + uint32_t(n) * 2246822519u + 0x85ebca6bu + job.crnSalt * 3266489917u)); reshuffle(copy, G.seat, fut); }
            else reshuffle(copy, G.seat, replayRng);
            Forced fz; fz.inner = again[G.seat]; fz.seat = G.seat; fz.opt = &op; fz.melds = G.melds;
            Agent* ag[4];
            for (int s = 0; s < 4; s++) ag[s] = s == G.seat ? static_cast<Agent*>(&fz) : again[s];
            Result rr = G.atClaim ? continueAtClaims(copy, ag, G.from, G.tile) : continueAtTurn(copy, ag, G.seat);
            real += rr.deltas[G.seat];
            int f = std::max(3, std::min(13, rr.score.faan ? rr.score.faan : 3));
            double v = 8.0 * std::pow(2.0, f - 3);
            int oc = 5;
            if (rr.win) { bool selfPaid = rr.payer < 0; oc = rr.winner == G.seat ? (selfPaid ? 0 : 1) : rr.payer == G.seat ? 2 : selfPaid ? 3 : 4; }
            p[9 + oc]++;
            if (oc <= 1) p[32 + f - 3]++;
            if (oc == 2 || oc == 3) p[43 + f - 3]++;
            pts += oc == 0 ? 3 * v : oc == 1 ? v : oc == 2 || oc == 3 ? -v : 0;
          }
          std::memcpy(p, &gid, 4);
          p[4] = uint8_t(int(k) == G.chosen); p[5] = uint8_t(op.kind); p[6] = G.strategy; p[7] = uint8_t(G.opts.size());
          p[8] = uint8_t(job.optionReplays); p[15] = G.seat;
          float mean = float(pts / job.optionReplays);
          std::memcpy(p + 16, &mean, 4); std::memcpy(p + 20, &dealSeed, 4);
          OL.insert(OL.end(), p, p + OPT_BYTES);
          optionRows++;
          winShare[k] = double(p[9] + p[10]) / job.optionReplays;
          meanPts[k] = mean;
          realPts[k] = float(real / job.optionReplays);
        }
        // The policy's row: the played move first, then the others tried.
        if (G.px.empty() || G.chosen < 0 || G.opts[G.chosen].action < 0) continue;
        std::vector<uint16_t> hx; for (float v : G.px) hx.push_back(toHalf(v));
        std::fwrite(hx.data(), 2, hx.size(), px);
        uint8_t mask[10] = {0};
        for (int a : G.legal) mask[a >> 3] |= uint8_t(1 << (a & 7));
        std::fwrite(mask, 1, 10, pm);
        // Each slot's share of replays won (.q.f4) and mean points (.qp.f4).
        uint8_t qa[SLOTS]; float q[SLOTS], qp[SLOTS], qr[SLOTS];
        for (int k = 0; k < SLOTS; k++) { qa[k] = 255; q[k] = 0; qp[k] = 0; qr[k] = 0; }
        int n = 0;
        qa[n] = uint8_t(G.opts[G.chosen].action); qp[n] = meanPts[G.chosen]; qr[n] = realPts[G.chosen]; q[n++] = float(winShare[G.chosen]);
        for (size_t k = 0; k < G.opts.size() && n < SLOTS; k++) if (int(k) != G.chosen && G.opts[k].action >= 0) { qa[n] = uint8_t(G.opts[k].action); qp[n] = meanPts[k]; qr[n] = realPts[k]; q[n++] = float(winShare[k]); }
        std::fwrite(qa, 1, SLOTS, pqa); std::fwrite(q, 4, SLOTS, pq); std::fwrite(qp, 4, SLOTS, pqp); std::fwrite(qr, 4, SLOTS, pqr);
        std::fwrite(&dealSeed, 4, 1, ph);
        uint8_t a0 = qa[0]; std::fwrite(&a0, 1, 1, pa);
        float w1 = 1; std::fwrite(&w1, 4, 1, pw);
        policyRows++;
      }
      if (!job.policyOnly) { std::fwrite(OX.data(), 2, OX.size(), fo); std::fwrite(OL.data(), 1, OL.size(), fol); }
    }
  }
  std::fclose(ff); std::fclose(fl); std::fclose(fa);
  if (fo) { std::fclose(fo); std::fclose(fol); }
  if (px) { std::fclose(px); std::fclose(pm); std::fclose(pqa); std::fclose(pq); std::fclose(pqp); std::fclose(ph); std::fclose(pa); std::fclose(pw); std::fclose(pqr); if (pqn) std::fclose(pqn); }
  long ms = long(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count());
  std::printf("{\"truncated\":%ld,\"index\":%d,\"deals\":%ld,\"hands\":%ld,\"samples\":%ld,\"policyRows\":%ld,\"replayed\":0,\"optionRows\":%ld,\"optionGroups\":%ld,\"outcomes\":[%ld,%ld,%ld,%ld,%ld,%ld],\"ms\":%ld}\n",
              truncated, job.shard, job.deals, hands, samples, policyRows, optionRows, optionGroups, outcomes[0], outcomes[1], outcomes[2], outcomes[3], outcomes[4], outcomes[5], ms);
  return 0;
}

}  // namespace lcm
