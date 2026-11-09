// Neural Cat (js/mahjong-ml.js, js/mahjong-ml-features.js,
// js/mahjong-ml-model.js): Jorge Yau's foundation, with a model that scores
// the best topK discards, and the claims and kongs, in expected points.
// Ported for fast play (create({ fast: true })), no exploration.
#pragma once
#include "bot.h"
#include "model.h"

namespace lcm {

struct MlRead { double ev, pWin; bool hasBest = false; double best = 0; };

class NeuralCat : public Foundation {
 public:
  NeuralCat(std::shared_ptr<Mlp> model, const std::string& id = "neural-cat");
  Decision chooseTurnAction(const Game& g, int seat, const TurnOptions& o) override;
  Decision chooseClaim(const Game& g, int seat, const ClaimOptions& o) override;

  static const int SIZE = 568;

 protected:
  bool hasRerank() const override { return true; }
  std::vector<CandP> rerank(std::vector<CandP> out, Ctx& ctx, const Counts& counts, const Game& g, int seat,
                            const std::vector<Threat>& threats, bool folding) override;

 private:
  std::shared_ptr<Mlp> model_;
  int topK_;
  double winBonus_, claimMargin_;
  struct Opp { int seat; int discards[34]; int shown[34]; int hidden; const Threat* threat; };
  struct State {
    const Game* g; int seat; Ctx* ctx; std::vector<Threat> threats; Counts counts;
    int own[34]; std::vector<Opp> opponents; int flowerFaan;
  };
  void prepare(State& st, const Game& g, int seat, Ctx& ctx, const std::vector<Threat>* threats, const Counts* counts);
  void encode(const State& st, int index, const Analysis& analysis, double loss, float* x);
  MlRead ev(const float* x);
  MlRead evRaw(const std::vector<double>& raw);
  double value(const MlRead& m) const { return m.ev + winBonus_ * m.pWin; }
  MlRead waitingFeatures(const Game& g, int seat, int kind, int tile);  // 0 pass, 1 kong, 2 concealed, 3 added
};

}  // namespace lcm
