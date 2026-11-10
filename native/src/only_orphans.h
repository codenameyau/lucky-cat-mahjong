// Only Orphans (js/mahjong-only-orphans.js): the learned strategy built on 1s,
// 9s and honors. Its own hooks on the shared foundation (the target system:
// finishOdds, targetWorths, pickTarget and the seat's 'ooTarget:<id>' memo;
// context, hand, plans, priority, kongOk, claim), its tuning (valuePower 0.5,
// ownPlans; reads, ownDiscards, honorOrder, keepPairs off), and the ML layer
// of js/mahjong-ml.js as its create() sets it: topK 0 (every discard the rules
// allow), allow, claimOk, kongOk, winBonus and claimMargin from the weights'
// meta.play. Ported for fast play (create({ fast: true })); exploring
// (temperature, epsilon) as Neural Cat's, for training data (generate_nc.cpp).
#pragma once
#include "neural_cat.h"

namespace lcm {

class OnlyOrphans : public NeuralCat {
 public:
  OnlyOrphans(std::shared_ptr<Mlp> model, const std::string& id = "only-orphans");

  // TARGETS, in the JS's order.
  enum TargetId { OO_ORPHANS, OO_MAJOR_SETS, OO_MAJOR_PAIRS, OO_PAIRS, OO_CONCEALED_TRIPLETS, OO_TARGETS };
  struct Worths { double w[OO_TARGETS]; };
  static constexpr double SWITCH = 1.3;

  // Each target's worth for this hand (with a tile to throw, the most any discard leaves).
  Worths targetWorths(const Counts& c, const Ctx& ctx);
  static int pickTarget(const Worths& worth, int now);

 protected:
  // The hooks (js/mahjong-only-orphans.js section 3), and the shared foundation's
  // no-hook behaviour for the ones it doesn't define.
  void hookContext(Ctx& ctx, const Game& g, int seat) override;
  void hookHand(Ctx& ctx, const Counts& counts) override;
  std::vector<PlanP> hookPlans(const Counts& c, Ctx& ctx) override;
  bool hookPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, int bestShanten, double& out) override;
  double hookReadyValue(double value, const std::vector<Wait>&, const Counts&, const Ctx&) override { return value; }
  void hookThreats(std::vector<Threat>&, const Game&) override {}
  double hookWaitChance(double chance, const Threat&, int) override { return chance; }
  double hookExtraLoss(const Game&, const std::vector<Threat>&, int) override { return 0; }
  double hookDefense(double w, const Ctx&, int) override { return w; }
  std::vector<CandP> hookFinalOrder(const std::vector<CandP>& out, const Ctx&, const Counts&) override { return out; }
  bool hookKongOk(const KongOption& k, const Ctx& ctx) override { return kongFits(k, ctx.ooTarget); }
  bool hookClaim(const ClaimFound&, const Ctx&, const Game&, const ClaimOptions&, Decision& out) override;
  bool hardTargets() const override { return true; }

  // MahjongML.create's options.
  bool hasAllow() const override { return true; }
  std::vector<CandP> allow(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts, const Game& g) override;
  bool claimOk(const ClaimOption& o, const ClaimOptions& opts, const Game& g, int seat) override;
  bool kongAllowed(const KongOption& k, const Game& g, int seat) override;

 private:
  static bool exposed(const Ctx& ctx);
  bool alive(Plan& p, const Ctx& ctx);
  std::vector<PlanP> setPlans(const Counts& c, const Ctx& ctx);
  std::vector<PlanP> pairPlans(const Counts& c, const Ctx& ctx);
  PlanP sevenPairsPlan(const Counts& c, const Ctx& ctx);
  PlanP concealedTripletsPlan(const Counts& c, const Ctx& ctx);
  double finishOdds(const Plan& p, const Ctx& ctx, int s);
  double planWorth(const Plan& p, const Ctx& ctx);
  Worths readWorths(const Counts& c, const Ctx& ctx);
  int readTarget(Ctx& ctx, const Counts& counts, bool record);
  int seatTarget(const Game& g, int seat, Ctx& ctx);
  static bool mustGo(const Ctx& ctx, const Counts& counts, int i);
  static bool kongFits(const KongOption& k, int target);
};

}  // namespace lcm
