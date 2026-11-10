// Neural Cat (js/mahjong-ml.js, js/mahjong-ml-features.js,
// js/mahjong-ml-model.js): Jorge Yau's foundation, with a model that scores
// the best topK discards, and the claims and kongs, in expected points.
// Ported for fast play (create({ fast: true })). Exploring (temperature, epsilon,
// rng) is for training data (generate_nc.cpp). Another learned strategy built
// through MahjongML.create (Only Orphans: native/src/only_orphans.h) derives from
// it with its own foundation hooks and create's allow, claimOk and kongOk.
#pragma once
#include "bot.h"
#include "model.h"
#include <functional>

namespace lcm {

struct MlRead { double ev, pWin; bool hasBest = false; double best = 0; };

class NeuralCat : public Foundation {
 public:
  NeuralCat(std::shared_ptr<Mlp> model, const std::string& id = "neural-cat");
  Decision chooseTurnAction(const Game& g, int seat, const TurnOptions& o) override;
  Decision chooseClaim(const Game& g, int seat, const ClaimOptions& o) override;

  static const int SIZE = 568;

  // Exploring, as create({ temperature, epsilon, rng }) in js/mahjong-ml.js: a random
  // discard that costs no step (epsilon), or one picked by value (temperature).
  double temperature = 0, epsilon = 0;
  std::function<double()> rng;

  // For the data generator: a position read as F.prepare(game, seat, null, null, bot)
  // reads it, then the features of the tiles kept after throwing `index`.
  struct Opp { int seat; int discards[34]; int shown[34]; int hidden; const Threat* threat; };
  struct State {
    const Game* g; int seat; Ctx* ctx; std::vector<Threat> threats; Counts counts;
    int own[34]; std::vector<Opp> opponents; int flowerFaan;
  };
  struct Reading { Ctx ctx; State st; };
  void read(Reading& r, const Game& g, int seat);
  int row(Reading& r, int index, float* x);  // returns the kept tiles' plan (a PlanKind), or -1
  void waitingRow(const Game& g, int seat, int kind, int tile, float* x);  // 0 pass, 1 kong, 2 concealed, 3 added

 protected:
  bool hasRerank() const override { return true; }
  // create({ allow, claimOk, kongOk }) (none: every discard, call and kong).
  // allow: the discards the model may pick from, ahead of the rest (false: no allow).
  virtual bool hasAllow() const { return false; }
  virtual std::vector<CandP> allow(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts, const Game& g) { return out; }
  virtual bool claimOk(const ClaimOption& o, const ClaimOptions& opts, const Game& g, int seat) { return true; }
  virtual bool kongAllowed(const KongOption& k, const Game& g, int seat) { return true; }
  int topK_;
  std::vector<CandP> rerank(std::vector<CandP> out, Ctx& ctx, const Counts& counts, const Game& g, int seat,
                            const std::vector<Threat>& threats, bool folding) override;

 private:
  std::shared_ptr<Mlp> model_;
  std::unique_ptr<Mlp> reader_;  // a stacked model's reader (js/mahjong-ml-model.js), else null
  static const int READ_SIZE = 16;
  // The move network's input for features x: x itself, or x and the reader's read after it (in buf).
  const float* input(const float* x, float* buf) const;
  double winBonus_, claimMargin_;
  void prepare(State& st, const Game& g, int seat, Ctx& ctx, const std::vector<Threat>* threats, const Counts* counts);
  void encode(const State& st, int index, const Analysis& analysis, double loss, float* x);
  MlRead ev(const float* x);
  MlRead evRaw(const std::vector<double>& raw);
  double value(const MlRead& m) const { return m.ev + winBonus_ * m.pWin; }
  MlRead waitingFeatures(const Game& g, int seat, int kind, int tile);
  int pickIndex(const std::vector<CandP>& ranked, int k0);
  template <class C> int pickChoice(const std::vector<C>& choices, int at);
};

}  // namespace lcm
