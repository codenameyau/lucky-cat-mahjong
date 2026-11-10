// lcm-sim generate: scripts/ml/lucky.js generate's worker (work()), natively:
// the same deals, the same seats, the same random draws, the same rows, the
// same shard files byte for byte. With --oracle, each row also carries the
// hidden tiles (scripts/ml/oracle.js), for training targets only.
#include "generate.h"
#include "jsmath.h"
#include <cstdio>
#include <cstring>
#include <stdexcept>

namespace lcm {

// scripts/ml/oracle.js
static const int O_PER = 34 + 34 + 1, O_DANGER = 3 * O_PER + 34 + 34 + 3, O_SIZE = O_DANGER + 34;

static void oracle(const Game& g, int seat, float* out) {
  std::memset(out, 0, sizeof(float) * O_SIZE);
  const Hand& h = g.hand;
  for (int k = 1; k <= 3; k++) {
    const Seat& s = h.seats[(seat + k) % 4];
    int off = (k - 1) * O_PER;
    std::vector<int8_t> ids;
    for (int t : s.hand) if (!isBonus(t)) ids.push_back(int8_t(t));
    Counts c = countsOf(ids);
    for (int i = 0; i < 34; i++) out[off + i] = float(c[i] / 4.0);
    int declared = int(s.melds.size());
    if (ids.size() % 3 == 1) {
      int sh = shanten(c.data(), declared);
      out[off + 68] = float(std::min(std::max(sh, 0), 4) / 4.0);
      if (sh == 0) for (int i : winningTiles(c.data(), declared)) out[off + 34 + i] = 1;
    } else {
      out[off + 68] = float(std::min(std::max(shanten(c.data(), declared), 0), 4) / 4.0);
    }
  }
  int wall = 3 * O_PER, first = -1;
  for (int i = 0; i < h.wall.size(); i++) {
    int t = h.wall.at(i);
    if (isBonus(t)) continue;
    out[wall + t] = float(double(out[wall + t]) + 0.25);
    if (first < 0) first = t;
  }
  if (first >= 0) out[wall + 34 + first] = 1;
  bool done[34] = {false};
  for (int t : h.seats[seat].hand) {
    if (isBonus(t) || done[t]) continue;
    done[t] = true;
    int worst = 0;
    for (int k = 1; k <= 3; k++) {
      ClaimOptions o = claimOptions(g, (seat + k) % 4, t, seat, false);
      if (o.hasWin) worst = std::max(worst, o.win.points > 0 ? o.win.points : 0);
    }
    if (worst) out[O_DANGER + t] = float(worst / 1024.0);
  }
}

// lucky.js floatToHalf
static uint16_t floatToHalf(float v) {
  uint32_t x;
  std::memcpy(&x, &v, 4);
  uint32_t sign = (x >> 16) & 0x8000;
  int exp = int((x >> 23) & 0xff) - 127 + 15;
  uint32_t frac = x & 0x7fffff;
  if (exp <= 0) return uint16_t(sign);
  if (exp >= 31) return uint16_t(sign | 0x7c00);
  frac += 0x1000;
  if (frac & 0x800000) { frac = 0; exp++; if (exp >= 31) return uint16_t(sign | 0x7c00); }
  return uint16_t(sign | (uint32_t(exp) << 10) | (frac >> 13));
}

static double winWeight(int discards, int faan) {
  double speed = std::max(0.25, std::min(2.5, 2.4 * js::exp(-discards / 10.0)));
  double size = 1 + 0.08 * (std::min(faan ? faan : 3, 13) - 3);
  return speed * size;
}

static void writeFile(const std::string& path, const void* data, size_t bytes) {
  FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) throw std::runtime_error("generate: can't write " + path);
  if (bytes) std::fwrite(data, 1, bytes, f);
  std::fclose(f);
}

int runGenerate(const GenerateJob& job, const AgentFactory& make) {
  Rng rng(job.seed + 7919);
  auto learnerModel = std::make_shared<Mlp>(loadWeights(job.weights));
  int version = learnerModel->weights().featureVersion;
  int pub = version == 2 ? lucky::SIZE_V2 : lucky::SIZE_V1;
  int W = pub + (job.oracle ? O_SIZE : 0);
  double temp = job.temperature ? job.temperature : 1;
  struct Buf { std::vector<float> x; int a; uint8_t legal[10]; double p; };
  std::vector<Buf> buffers[4];
  LuckyCat learner(learnerModel, job.temperature, [&rng]() { return rng(); });
  learner.onDecision = [&](const Game& g, int seat, const float* x, const std::vector<Move>& moves, int pick) {
    // (oracleFeatures' dropout draws from its own generator and, at delta 0, zeroes every
    // hidden input a public model would read anyway: nothing to draw here.)
    if (job.returns && (moves.size() < 2 || (job.sampleWon < 0 && rng() >= job.sample))) return;
    Buf b;
    b.x.assign(x, x + pub);
    if (job.oracle) { b.x.resize(W); oracle(g, seat, b.x.data() + pub); }
    std::memset(b.legal, 0, 10);
    for (auto& m : moves) b.legal[m.action >> 3] |= uint8_t(1 << (m.action & 7));
    double z = 0;
    for (auto& m : moves) z += js::pow(m.p, 1 / temp);
    b.p = js::pow(moves[pick].p, 1 / temp) / z;
    b.a = moves[pick].action;
    buffers[seat].push_back(std::move(b));
  };
  std::map<std::string, std::unique_ptr<Agent>> pool;
  std::vector<std::string> poolIds = job.pool.empty() ? std::vector<std::string>{"lc:" + job.weights} : job.pool;
  for (auto& id : poolIds) if (!pool.count(id)) pool[id] = make(id);

  std::vector<uint16_t> X;
  std::vector<uint8_t> A, M, O;
  std::vector<float> Wt, R, P;
  std::vector<uint32_t> H;
  GenerateStats st;
  auto push = [&](const Buf& b, float w) {
    for (int i = 0; i < W; i++) X.push_back(floatToHalf(b.x[i]));
    A.push_back(uint8_t(b.a));
    M.insert(M.end(), b.legal, b.legal + 10);
    Wt.push_back(w);
  };
  for (long d = job.from; d < job.to; d++) {
    GameOptions o;
    o.seed = uint32_t(job.seed + d); o.dealer = int(d % 4); o.startPoints = 1000000000;
    Game g = createGame(o);
    std::vector<int> seats{0, 1, 2, 3};
    shuffle(seats, rng);
    bool isLearner[4] = {false, false, false, false};
    for (int k = 0; k < job.learners; k++) isLearner[seats[k]] = true;
    std::string ids[4];
    Agent* agents[4];
    for (int s = 0; s < 4; s++) {
      if (isLearner[s]) { ids[s] = "learn"; agents[s] = &learner; }
      else { ids[s] = poolIds[size_t(rng() * poolIds.size())]; agents[s] = pool[ids[s]].get(); }
    }
    for (auto& b : buffers) b.clear();
    Result res = runHand(g, agents);
    st.deals++;
    st.learnerSeats += job.learners;
    if (res.win) st.wins++;
    for (int s = 0; s < 4; s++) {
      if (isLearner[s]) continue;
      auto& bo = st.byOpponent[ids[s]];
      bo.first++;
      if (res.win && res.winner == s) bo.second++;
    }
    if (res.win && res.payer >= 0 && isLearner[res.payer] && !isLearner[res.winner]) {
      st.dealIns++;
      if (!job.returns && job.write && !buffers[res.payer].empty()) { push(buffers[res.payer].back(), -1); st.negatives++; }
    }
    for (int k = 0; k < job.learners; k++) st.learnerPoints += res.deltas[seats[k]];
    if (job.returns) {
      for (int k = 0; k < job.learners; k++) {
        int s = seats[k];  // learnerSeats, in their shuffled order
        bool won = res.win && res.winner == s;
        int outcome = won ? 0 : res.win && res.payer == s ? 1 : res.win ? 2 : 3;
        if (won) {
          st.learnerWins++;
          st.winDiscards += int(g.hand.seats[s].discards.size());
          st.winFaan += res.score.faan;
          st.learnerWinPoints += res.deltas[s];
        }
        if (!job.write) continue;
        uint32_t hand = uint32_t(d * 4 + s);
        double keep = job.sampleWon < 0 ? 1 : won ? job.sampleWon : job.sample;
        for (auto& b : buffers[s]) {
          if (keep < 1 && rng() >= keep) continue;
          push(b, 1);
          R.push_back(float(res.deltas[s]));
          P.push_back(float(b.p));
          O.push_back(uint8_t(outcome));
          H.push_back(hand);
        }
      }
      continue;
    }
    if (!res.win || !isLearner[res.winner]) continue;
    int s = res.winner;
    int discards = int(g.hand.seats[s].discards.size());
    st.learnerWins++;
    st.winDiscards += discards;
    st.winFaan += res.score.faan;
    st.learnerWinPoints += res.deltas[s];
    if (!job.write) continue;
    float w = float(winWeight(discards, res.score.faan));
    for (auto& b : buffers[s]) push(b, w);
  }
  st.samples = long(A.size());
  if (job.write) {
    std::string base = job.out + "/shard-" + std::to_string(job.shard);
    writeFile(base + ".x.f16", X.data(), X.size() * 2);
    writeFile(base + ".a.u1", A.data(), A.size());
    writeFile(base + ".m.u1", M.data(), M.size());
    writeFile(base + ".w.f4", Wt.data(), Wt.size() * 4);
    if (job.returns) {
      writeFile(base + ".r.f4", R.data(), R.size() * 4);
      writeFile(base + ".p.f4", P.data(), P.size() * 4);
      writeFile(base + ".o.u1", O.data(), O.size());
      writeFile(base + ".h.u4", H.data(), H.size() * 4);
    }
  }
  std::printf("{\"deals\":%ld,\"learnerSeats\":%ld,\"learnerWins\":%ld,\"wins\":%ld,\"winDiscards\":%ld,\"winFaan\":%ld,\"dealIns\":%ld,\"samples\":%ld,\"negatives\":%ld,\"learnerPoints\":%.17g,\"learnerWinPoints\":%.17g,\"byOpponent\":{",
              st.deals, st.learnerSeats, st.learnerWins, st.wins, st.winDiscards, st.winFaan, st.dealIns, st.samples, st.negatives, st.learnerPoints, st.learnerWinPoints);
  bool firstO = true;
  for (auto& kv : st.byOpponent) {
    // The key can hold a model's path, and a Windows path's backslashes must
    // be escaped for JSON.parse.
    std::string key;
    for (char c : kv.first) { if (c == '\\' || c == '"') key += '\\'; key += c; }
    std::printf("%s\"%s\":{\"seats\":%ld,\"wins\":%ld}", firstO ? "" : ",", key.c_str(), kv.second.first, kv.second.second);
    firstO = false;
  }
  std::printf("}}\n");
  return 0;
}

}  // namespace lcm
