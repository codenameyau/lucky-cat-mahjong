// Lucky Cat (js/mahjong-lucky-cat-ml.js): a network that picks every move.
// Features v1 (js/mahjong-lucky-cat-net.js, 376) and v2
// (js/mahjong-frontier-net.js, 854). A win is always declared.
#pragma once
#include "engine.h"
#include "model.h"
#include "bot.h"
#include "value_net.h"
#include <memory>
#include <functional>

namespace lcm {

struct Move { int action; Decision decision; double logit = 0, p = 0; };

namespace lucky {
constexpr int SIZE_V1 = 376, SIZE_V2 = 854, TURN = 68, OUTPUTS = 74;
struct Offer { int tile; int from; bool robKong; };
// x: SIZE_V1 or SIZE_V2 floats. hand/melds: the seat's own unless given.
void encode(const Game& g, int seat, const Offer* offer, int version, float* x,
            const std::vector<int8_t>* hand = nullptr, const std::vector<Meld>* melds = nullptr);
std::vector<Move> turnMoves(const std::vector<int8_t>& hand, const std::vector<KongOption>& kongs);
std::vector<Move> claimMoves(const ClaimOptions& o);
// The value's features (js/mahjong-lucky-cat-value.js): the policy's v1 features of the
// position a move leaves, then the tile it throws (34) and its kind (6).
constexpr int VALUE_SIZE = SIZE_V1 + 34 + 6;
struct After { std::vector<int8_t> hand; std::vector<Meld> melds; int thrown = -1; int kind = 0; };
After afterTurn(const Game& g, int seat, const Decision& d);
After afterCall(const Game& g, int seat, const ClaimOptions& o, const Decision& d);
void valueFeatures(const Game& g, int seat, const After& a, float* x);
}  // namespace lucky

class LuckyCat : public Agent {
 public:
  // temperature 0 plays the biggest share; rng (temperature > 0) is the JS's Math.random stand-in.
  LuckyCat(std::shared_ptr<Mlp> model, double temperature = 0, std::function<double()> rng = nullptr);
  Decision turn(Game& g, int seat, const TurnOptions& o) override;
  Decision claim(Game& g, int seat, const ClaimOptions& o) override;
  int version() const { return version_; }
  // The legal moves with the policy's shares (in turnMoves / claimMoves order), for the data generator.
  std::vector<Move> turnShares(const Game& g, int seat, const TurnOptions& o);
  std::vector<Move> claimShares(const Game& g, int seat, const ClaimOptions& o);
  // Called for every move the network makes (training data): features, the moves, the pick.
  std::function<void(const Game&, int, const float*, const std::vector<Move>&, int)> onDecision;

 private:
  std::shared_ptr<Mlp> model_;
  double temperature_;
  std::function<double()> rng_;
  int version_, size_;
  std::vector<float> x_;
  // The shared foundation (Jorge Yau's, as js/mahjong-lucky-cat-ml.js reads it): the plan
  // each move builds toward, for the contradiction check.
  std::shared_ptr<Foundation> base_;
 public:
  bool check = true;  // the contradiction check (off only to measure it)
  // The value (js/mahjong-lucky-cat-value.js): the policy's best few moves, each scored by
  // the position it leaves; epsilon: now and then one of them at random (training data).
  std::shared_ptr<ValueNet> value;
  double epsilon = 0;
  // generate-lcv --plan-share: a logit bonus per move (an exploration policy toward a hand plan); null in play
  std::function<double(const Game&, int, const Move&)> bias;
 private:
  int decide(const Game& g, int seat, std::vector<Move>& moves, const std::function<int(int)>& check);
  static int firstConsistent(const std::vector<Move>& moves, int k, const std::function<bool(const Move&)>& ok);
  void policy(std::vector<Move>& moves);
  void policyOn(const float* x, std::vector<Move>& moves);
  int valueDecide(const Game& g, int seat, std::vector<Move>& moves, const std::function<ValueRead(const Move&)>& score,
                  const std::function<bool(const Move&)>& ok, bool all);
};

}  // namespace lcm
