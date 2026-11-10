// A value network over any features (js/mahjong-ml-model.js createModel with
// { size }): Neural Cat's 28 outputs (how the hand ends, the faan won and paid)
// summarized as expected points and the chance to win, optionally stacked with
// a reader whose read (read version 1) goes after the features. Lucky Cat's
// value (js/mahjong-lucky-cat-value.js) is one.
#pragma once
#include "model.h"
#include <memory>

namespace lcm {

struct ValueRead { double ev = 0, pWin = 0; };

class ValueNet {
 public:
  ValueNet(std::shared_ptr<Mlp> model, int size);
  ValueRead ev(const float* x) const;
  int topK() const { return topK_; }
  double winBonus() const { return winBonus_; }
  static const int READ_SIZE = 16;

 private:
  std::shared_ptr<Mlp> model_;
  std::unique_ptr<Mlp> reader_;
  int size_, topK_;
  double winBonus_;
  mutable std::vector<float> buf_;
};

}  // namespace lcm
