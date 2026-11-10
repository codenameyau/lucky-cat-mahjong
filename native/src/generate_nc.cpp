#include "generate_nc.h"
#include "neural_cat.h"
#include "shanten.h"
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>

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

struct NcRow { uint8_t seat, explored; int turn, wallLeft; std::vector<float> x; uint8_t aux[AUX_BYTES]; };

struct Recorder : Agent {
  NeuralCat* nc;
  Rng* rng;
  double sample;
  std::vector<NcRow>* rows;
  NcRow& push(const Game& g, int seat, int explored) {
    rows->emplace_back();
    NcRow& r = rows->back();
    r.seat = uint8_t(seat); r.explored = uint8_t(explored);
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
    Decision a = nc->chooseTurnAction(g, seat, o);
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
    Decision d = nc->chooseClaim(g, seat, o);
    const std::vector<float>* x = d.type == A_PASS && !pass.empty() ? &pass : d.type == A_KONG && !kong.empty() ? &kong : nullptr;
    if (x) {
      NcRow& r = push(g, seat, 2);
      r.x = *x;
      tableLabels(g, seat, -1, r.aux);
    }
    return d;
  }
};

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
  rec.nc = &learner; rec.rng = &rng; rec.sample = job.sample; rec.rows = &rows;
  std::map<std::string, std::unique_ptr<Agent>> pool;
  for (auto& id : job.pool) if (id != "learner" && !pool.count(id)) pool[id] = make(id);

  std::string base = job.out + "/shard-" + std::to_string(job.shard);
  FILE* ff = std::fopen((base + ".features").c_str(), "wb");
  FILE* fl = std::fopen((base + ".labels").c_str(), "wb");
  FILE* fa = std::fopen((base + ".aux").c_str(), "wb");
  if (!ff || !fl || !fa) throw std::runtime_error("generate-nc: can't write " + base);
  long samples = 0, hands = 0, outcomes[6] = {0, 0, 0, 0, 0, 0};
  std::vector<uint16_t> X;
  std::vector<uint8_t> L, A;
  for (long d = 0; d < job.deals; d++) {
    uint32_t dealSeed = uint32_t(job.seed + d);
    Agent* agents[4];
    for (int s = 0; s < 4; s++) {
      const std::string& id = job.pool[size_t(rng() * double(job.pool.size()))];
      agents[s] = id == "learner" ? static_cast<Agent*>(&rec) : pool[id].get();
    }
    GameOptions o;
    o.seed = dealSeed; o.dealer = int(dealSeed % 4); o.startPoints = 1000000000;
    Game g = createGame(o);
    g.round = int((dealSeed >> 2) % 4) + 1;
    rows.clear();
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
      p[5] = uint8_t(job.strategy);
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
    samples += long(rows.size());
  }
  std::fclose(ff); std::fclose(fl); std::fclose(fa);
  long ms = long(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count());
  std::printf("{\"index\":%d,\"deals\":%ld,\"hands\":%ld,\"samples\":%ld,\"outcomes\":[%ld,%ld,%ld,%ld,%ld,%ld],\"ms\":%ld}\n",
              job.shard, job.deals, hands, samples, outcomes[0], outcomes[1], outcomes[2], outcomes[3], outcomes[4], outcomes[5], ms);
  return 0;
}

}  // namespace lcm
